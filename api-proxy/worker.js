/**
 * Cloudflare Worker - Gemini API Proxy + LINE notifier
 * ซ่อน API key / LINE token ฝั่ง server ไม่เปิดเผยให้ client
 *
 * Routes:
 *   POST /         -> Gemini text generation (body: { prompt, ... })
 *   POST /notify   -> push a LINE message to the shop (body: { message })
 *
 * Deploy: wrangler deploy
 * Secrets:
 *   wrangler secret put GEMINI_API_KEY       # Gemini proxy
 *   wrangler secret put NOTIFY_SHARED_SECRET # gate /notify; mirror in client VITE_LINE_NOTIFY_SECRET
 *
 *   # LINE auth — pick ONE:
 *   #  (a) issue tokens from Channel ID + secret (no manual token to rotate):
 *   wrangler secret put LINE_CHANNEL_ID
 *   wrangler secret put LINE_CHANNEL_SECRET
 *   #  (b) OR use a long-lived channel access token generated in the console:
 *   wrangler secret put LINE_CHANNEL_TOKEN
 *
 *   # Recipient (optional):
 *   #  set LINE_TARGET_ID (userId U... / groupId C...) to push to ONE target;
 *   #  leave it UNSET to broadcast to all OA friends.
 *   wrangler secret put LINE_TARGET_ID
 */

const ALLOWED_ORIGINS = [
  'https://possiwaracafe.pages.dev',
  'http://localhost:5173',
  'http://192.168.1.152:5173'
];

const AI_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash'
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

// Collapse to a single line and clip — defends against header/text injection
// and oversized fields when building the LINE message server-side.
function clean(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Build the "new order" LINE message from VALIDATED structured fields.
 * The worker never relays client-supplied free text, so the endpoint can't be
 * abused to push arbitrary content (links, phishing) to the shop's LINE.
 */
function buildOrderMessage(body) {
  const queue = Number(body?.queueNumber);
  const queueStr = Number.isFinite(queue) ? `#${Math.trunc(queue)}` : '-';
  const name = clean(body?.customerName, 60) || '-';
  const time = clean(body?.time, 10) || '-';
  const total = Number(body?.total);
  const totalStr = Number.isFinite(total) ? `฿${Math.round(total).toLocaleString('en-US')}` : '-';

  const items = Array.isArray(body?.items) ? body.items.slice(0, 50) : [];
  const lines = items
    .map((it) => {
      const itemName = clean(it?.name, 80);
      const qty = Math.max(0, Math.trunc(Number(it?.quantity) || 0));
      return itemName && qty > 0 ? `• ${itemName} x${qty}` : '';
    })
    .filter(Boolean);

  return (
    `🔔 ออเดอร์ใหม่จาก QR\n` +
    `คิว ${queueStr}\n` +
    `ลูกค้า: ${name}\n` +
    `เวลา: ${time}\n` +
    `——————————\n` +
    `${lines.join('\n') || '(ไม่มีรายการ)'}\n` +
    `——————————\n` +
    `รวม ${totalStr}`
  );
}

// Cached LINE access token (module scope persists across requests on a warm
// isolate). LINE allows only ~30 valid short-lived tokens per channel, so we
// must NOT mint a fresh one per order — reuse until shortly before expiry.
let cachedLineToken = null; // { token: string, expiresAt: number }

/**
 * Resolve a LINE channel access token.
 *  - If LINE_CHANNEL_TOKEN is set, use it directly (long-lived console token).
 *  - Otherwise issue a short-lived token from LINE_CHANNEL_ID + LINE_CHANNEL_SECRET
 *    via the client_credentials grant, and cache it.
 */
async function getLineAccessToken(env) {
  if (env.LINE_CHANNEL_TOKEN) return env.LINE_CHANNEL_TOKEN;

  const now = Date.now();
  if (cachedLineToken && cachedLineToken.expiresAt > now + 60_000) {
    return cachedLineToken.token;
  }

  const res = await fetch('https://api.line.me/v2/oauth/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.LINE_CHANNEL_ID,
      client_secret: env.LINE_CHANNEL_SECRET,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`LINE token issue failed (${res.status})`);
  }
  // expires_in is seconds (short-lived tokens last 30 days); cache conservatively.
  cachedLineToken = {
    token: data.access_token,
    expiresAt: now + (Number(data.expires_in) || 86_400) * 1000,
  };
  return cachedLineToken.token;
}

/**
 * Push a "new order" alert to the shop's LINE via the Messaging API.
 * Credentials come from Worker secrets, never from the client.
 *
 * Auth: requires `Authorization: Bearer <NOTIFY_SHARED_SECRET>`. This stops a
 * passer-by who merely knows the URL from spamming the shop. NOTE: in a public
 * SPA the client secret is shipped in the JS bundle, so it is obfuscation-grade
 * only. For real protection move this trigger server-side (Firestore onCreate
 * Cloud Function) and/or add Cloudflare Rate Limiting on this route.
 */
async function handleNotify(request, env, headers) {
  // LINE_TARGET_ID รับได้ทั้ง id เดียวและหลาย id คั่นด้วยจุลภาค
  // (เช่น เจ้าของร้าน + คนหน้าบาร์) · หลายคน => multicast
  const targets = (env.LINE_TARGET_ID || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const to = targets[0];
  const hasAuth = env.LINE_CHANNEL_TOKEN || (env.LINE_CHANNEL_ID && env.LINE_CHANNEL_SECRET);
  if (!hasAuth) {
    return Response.json(
      { error: 'LINE not configured on server (need LINE_CHANNEL_TOKEN, or LINE_CHANNEL_ID + LINE_CHANNEL_SECRET)' },
      { status: 500, headers }
    );
  }

  // Require a shared secret so the endpoint isn't an open relay.
  const expected = env.NOTIFY_SHARED_SECRET;
  if (!expected) {
    return Response.json(
      { error: 'NOTIFY_SHARED_SECRET not configured on server' },
      { status: 500, headers }
    );
  }
  const provided = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (provided !== expected) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers });
  }

  // Message is composed server-side from validated fields — never relayed raw.
  const text = buildOrderMessage(body).slice(0, 5000);

  // No target => the only thing left is broadcast, which sends the shop's order
  // alert to EVERY follower of the OA — customers included. Refuse instead, and
  // make broadcasting something you have to ask for on purpose.
  if (!to && env.LINE_ALLOW_BROADCAST !== 'true') {
    return Response.json(
      {
        error: 'LINE_TARGET_ID not set',
        detail: 'ตั้ง LINE_TARGET_ID ก่อน (พิมพ์ myid ในแชท/กลุ่มเพื่อเอา id) '
          + 'หรือถ้าตั้งใจจะ broadcast หาผู้ติดตามทุกคนจริงๆ ให้ set LINE_ALLOW_BROADCAST=true',
      },
      { status: 503, headers }
    );
  }

  try {
    const token = await getLineAccessToken(env);
    const messages = [{ type: 'text', text }];
    // หลายปลายทาง -> multicast · ปลายทางเดียว (userId หรือ groupId) -> push
    // · ไม่มีเลย -> broadcast (ต้องเปิด LINE_ALLOW_BROADCAST เองเท่านั้น ดูด้านบน)
    let endpoint = 'https://api.line.me/v2/bot/message/broadcast';
    let payload = { messages };
    if (targets.length > 1) {
      endpoint = 'https://api.line.me/v2/bot/message/multicast';
      payload = { to: targets, messages };
    } else if (to) {
      endpoint = 'https://api.line.me/v2/bot/message/push';
      payload = { to, messages };
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.text();
      return Response.json(
        { error: `LINE push failed (${res.status})`, detail },
        { status: 502, headers }
      );
    }
    return Response.json({ success: true }, { status: 200, headers });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502, headers });
  }
}

/**
 * LINE webhook. Does two jobs, both because the Messaging API won't hand them
 * over any other way on an unverified account:
 *
 *  1. `myid` — reply with the sender's userId/groupId, so the shop can set
 *     LINE_TARGET_ID (see handleNotify: no target => /notify refuses to send).
 *  2. Follower roll — `GET /v2/bot/followers/ids` is blocked for this account
 *     tier, so the only way to know who added the OA is to record it as it
 *     happens: on `follow` (and on any message, which catches people who added
 *     the account before this existed) fetch the profile and store it in KV.
 *     Read the list back with POST /followers + the NOTIFY_SHARED_SECRET.
 *     Caveat that cannot be engineered away: people who added the OA earlier
 *     and never speak stay invisible.
 *
 * Any other message is ignored (200 OK) so the OA keeps behaving like a normal
 * manual-reply account.
 *
 * Every webhook call is signature-verified with the channel secret — LINE signs
 * the raw body with HMAC-SHA256, so a forged call can't make the bot speak or
 * write junk into the follower list.
 */
async function verifyLineSignature(secret, rawBody, signature) {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  // Constant-time-ish compare: same length + XOR accumulate, no early return.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

/**
 * Keep a roll of who added the OA, keyed by userId in KV.
 *
 * Called for every event: `follow` is the real signal, but a plain message
 * counts too — someone who added the account before this code existed only
 * becomes visible when they say something. `unfollow` keeps the record and
 * stamps it, so "แอดแล้วบล็อกทีหลัง" stays readable instead of vanishing.
 *
 * Group/room events carry no personal profile worth storing; skipped.
 */
async function recordFollower(ev, env) {
  const userId = ev?.source?.userId;
  if (!env.FOLLOWERS || !userId || ev?.source?.type !== 'user') return;
  if (!['follow', 'unfollow', 'message'].includes(ev.type)) return;

  const now = new Date().toISOString();
  try {
    const prev = await env.FOLLOWERS.get(userId, 'json');

    if (ev.type === 'unfollow') {
      // No profile call here — LINE rejects it once the user has blocked the OA.
      await env.FOLLOWERS.put(userId, JSON.stringify({
        ...(prev || { userId }), unfollowedAt: now,
      }));
      return;
    }

    // Refresh the display name on follow; on a plain message only fetch it the
    // first time, so a chatty regular doesn't cost an API call per message.
    let profile = prev?.displayName ? prev : null;
    if (ev.type === 'follow' || !profile) {
      const token = await getLineAccessToken(env);
      const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) profile = await res.json();
    }

    await env.FOLLOWERS.put(userId, JSON.stringify({
      userId,
      displayName: profile?.displayName || prev?.displayName || '(ไม่ทราบชื่อ)',
      pictureUrl: profile?.pictureUrl || prev?.pictureUrl || '',
      statusMessage: profile?.statusMessage || prev?.statusMessage || '',
      firstSeenAt: prev?.firstSeenAt || now,
      lastSeenAt: now,
      source: prev?.source || (ev.type === 'follow' ? 'follow' : 'message'),
      unfollowedAt: ev.type === 'follow' ? undefined : prev?.unfollowedAt,
    }));
  } catch {
    // Never fail the webhook over bookkeeping — LINE disables endpoints that error.
  }
}

/**
 * Read the follower roll. POST + `Authorization: Bearer <NOTIFY_SHARED_SECRET>`
 * because this returns customers' names — it must not be an open endpoint.
 */
async function handleFollowers(request, env, headers) {
  const expected = env.NOTIFY_SHARED_SECRET;
  const provided = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!expected || provided !== expected) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  }
  if (!env.FOLLOWERS) {
    return Response.json({ error: 'FOLLOWERS KV not bound' }, { status: 500, headers });
  }

  const list = await env.FOLLOWERS.list({ limit: 1000 });
  const people = [];
  for (const k of list.keys) {
    const v = await env.FOLLOWERS.get(k.name, 'json');
    if (v) people.push(v);
  }
  people.sort((a, b) => (b.firstSeenAt || '').localeCompare(a.firstSeenAt || ''));
  return Response.json(
    { count: people.length, active: people.filter((p) => !p.unfollowedAt).length, people },
    { status: 200, headers }
  );
}

// ---------------------------------------------------------------------------
// ทักทาย + ตอบกลับอัตโนมัติ
//
// LINE ไม่เปิด API ให้ตั้ง greeting/auto-reply ของ OA Manager เลยทำเองตรงนี้แทน
// **ข้อความแบบ reply ไม่นับโควตา 300 ข้อความ/เดือน** (LINE นับเฉพาะ push/multicast/
// broadcast) ตอบเท่าไหร่ก็ได้ ไม่กระทบแจ้งเตือนออเดอร์
//
// ข้อมูลร้านทุกบรรทัดตรงกับ JSON-LD + FAQ ในเว็บ siwara.cafe · แก้ที่ไหนต้องแก้ให้ครบทั้งคู่
// ⚠️ ถ้าไปตั้ง auto-reply ใน OA Manager ด้วย ลูกค้าจะโดนตอบซ้ำสองครั้ง เลือกทางเดียว
// ---------------------------------------------------------------------------
const HOURS = 'เปิดอังคาร - อาทิตย์ 10:00 - 17:00 น. (ปิดวันจันทร์)';

const GREETING = `สวัสดีค่ะ ยินดีต้อนรับสู่ Siwara Cafe
คาเฟ่ในบ้านไม้สักเก่าเกือบร้อยปี ย่านเมืองเก่าตะกั่วป่า

${HOURS}

กดเมนูด้านล่างได้เลยค่ะ
· สั่งล่วงหน้า แล้วแวะมารับ ไม่ต้องยืนรอ
· เช็คแต้มสะสมของตัวเอง แค่กรอกเบอร์
· ดูเมนู ราคา และเค้กสั่งทำ
· แผนที่ร้าน กดแล้วนำทางได้ทันที

อยากถามอะไรพิมพ์ทิ้งไว้ได้เลยค่ะ เดี๋ยวเราตอบให้`;

// เรียงจากเฉพาะเจาะจงไปกว้าง · ตัวแรกที่ตรงคือตัวที่ตอบ
const AUTO_REPLIES = [
  {
    keys: ['กี่โมง', 'เปิดกี่', 'ปิดกี่', 'เวลาเปิด', 'เวลาปิด', 'วันไหน', 'เปิดวัน', 'ปิดวัน', 'เปิดมั้ย', 'เปิดไหม'],
    text: `ร้าน${HOURS} ค่ะ\n\nกดเมนู "แผนที่ร้าน" ด้านล่างแล้วนำทางมาได้เลยค่ะ`,
  },
  {
    keys: ['แต้ม', 'สะสม', 'สมาชิก', 'ส่วนลด'],
    text: 'กดเมนู "สะสมแต้ม" ด้านล่าง แล้วกรอกเบอร์โทร\n'
      + 'จะเห็นแต้มของตัวเองทันทีค่ะ ไม่ต้องรอเราตอบ\n\n'
      + 'แต้มผูกกับเบอร์โทร สั่งครั้งไหนใส่เบอร์เดิม แต้มเก็บต่อให้เอง\n'
      + 'พอครบตามเกณฑ์ก็แลกเป็นส่วนลดได้เลยค่ะ',
  },
  {
    keys: ['เค้ก', 'วันเกิด', 'เบรค', 'เบรก', 'สแน็ค', 'snack'],
    text: 'เค้กมีทั้งแบบพร้อมรับหน้าร้านและแบบสั่งทำค่ะ\n'
      + 'รับจัดเบรค สแน็คบ็อกซ์ และเค้กวันเกิดด้วย\n\n'
      + 'ดูแบบทั้งหมดที่เมนู "เค้กสั่งทำ" ด้านล่าง\n'
      + 'ถูกใจแบบไหน ส่งรูปมาในแชทนี้พร้อมวันที่อยากได้ เดี๋ยวเราเช็คคิวให้ค่ะ',
  },
  {
    keys: ['จอดรถ', 'ที่จอด'],
    text: 'มีลานจอดรถหน้าร้านค่ะ\nถ้าเต็มจอดริมถนนย่านเมืองเก่าได้เหมือนกัน',
  },
  {
    keys: ['สั่ง', 'พรีออเดอร์', 'จอง', 'order'],
    text: 'สั่งล่วงหน้าได้ที่เมนู "สั่งล่วงหน้า" ด้านล่างเลยค่ะ\n'
      + 'เลือกเมนู ใส่เบอร์โทร แล้วกดสั่ง ทางร้านได้รับออเดอร์ทันที\n'
      + 'พอถึงร้านแจ้งชื่อหรือเบอร์ที่สั่งไว้ได้เลย\n\n'
      + 'ใส่เบอร์โทรทุกครั้งนะคะ ระบบจะสะสมแต้มให้อัตโนมัติ',
  },
  {
    keys: ['ที่ไหน', 'แผนที่', 'ไปยังไง', 'พิกัด', 'ที่อยู่', 'เบอร์โทร', 'โทร'],
    text: '53 ถนนราษฎร์บำรุง ตะกั่วป่า พังงา 82110 ค่ะ\n'
      + 'กดเมนู "แผนที่ร้าน" ด้านล่างแล้วนำทางได้ทันที\n\n'
      + 'โทรสอบถามได้ที่ 097-350-1514',
  },
  {
    keys: ['wifi', 'ไวไฟ', 'นั่งทำงาน', 'ปลั๊ก', 'บอร์ดเกม'],
    text: 'นั่งทำงานได้สบายค่ะ ร้านเงียบ มีมุมนั่งหลายแบบ\n'
      + 'มีบอร์ดเกมให้เล่นด้วยถ้ามากันหลายคน',
  },
];

function matchAutoReply(text) {
  const t = (text || '').toLowerCase();
  for (const rule of AUTO_REPLIES) {
    if (rule.keys.some((k) => t.includes(k))) return rule.text;
  }
  return null;
}

async function replyToLine(env, replyToken, text) {
  try {
    const token = await getLineAccessToken(env);
    await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
    });
  } catch {
    // Best effort — never fail the webhook, LINE retries and disables noisy endpoints.
  }
}

async function handleWebhook(request, env) {
  const secret = env.LINE_CHANNEL_SECRET;
  if (!secret) return new Response('OK', { status: 200 });

  const raw = await request.text();
  const ok = await verifyLineSignature(secret, raw, request.headers.get('x-line-signature'));
  // Bad signature => not from LINE. Say nothing about why.
  if (!ok) return new Response('Forbidden', { status: 403 });

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response('OK', { status: 200 });
  }

  for (const ev of payload.events || []) {
    await recordFollower(ev, env);

    // คนเพิ่งกดเพิ่มเพื่อน → ทักทาย + ชี้ทางว่ากดอะไรได้บ้าง
    if (ev.type === 'follow' && ev.replyToken) {
      await replyToLine(env, ev.replyToken, GREETING);
      continue;
    }

    if (ev.type !== 'message' || ev.message?.type !== 'text' || !ev.replyToken) continue;
    const raw = ev.message.text.trim();

    // `myid` = เครื่องมือของร้าน ไม่ใช่ข้อความลูกค้า เลยเช็คก่อนกฎอื่น
    if (raw.toLowerCase() === 'myid') {
      const src = ev.source || {};
      const id = src.groupId || src.roomId || src.userId || '(ไม่พบ id)';
      const kind = src.groupId ? 'groupId' : src.roomId ? 'roomId' : 'userId';
      await replyToLine(env, ev.replyToken, `${kind}\n${id}\n\nเอาไปตั้งเป็น LINE_TARGET_ID บน Worker`);
      continue;
    }

    // ตอบอัตโนมัติเฉพาะแชทเดี่ยว · ในกลุ่มแจ้งเตือนออเดอร์ของร้าน บอทต้องเงียบ
    // ไม่งั้นพนักงานคุยกันแล้วบอทเด้งขึ้นมาแทรกทุกครั้งที่มีคำว่า "สั่ง"
    if (ev.source?.type !== 'user') continue;

    const answer = matchAutoReply(raw);
    if (answer) await replyToLine(env, ev.replyToken, answer);
  }

  // LINE requires a fast 200 no matter what happened above.
  return new Response('OK', { status: 200 });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return Response.json(
        { error: 'Method not allowed' },
        { status: 405, headers }
      );
    }

    // Route: LINE notification
    const pathname = new URL(request.url).pathname.replace(/\/+$/, '');
    if (pathname.endsWith('/webhook')) {
      return handleWebhook(request, env);
    }
    if (pathname.endsWith('/followers')) {
      return handleFollowers(request, env, headers);
    }
    if (pathname.endsWith('/notify')) {
      return handleNotify(request, env, headers);
    }

    // Validate API key exists in env
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: 'API key not configured on server' },
        { status: 500, headers }
      );
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: 'Invalid JSON body' },
        { status: 400, headers }
      );
    }

    // Note: parseAsJson is sent by the client but parsing happens client-side
    const { prompt, temperature = 0.7, maxOutputTokens = 2048 } = body;

    if (!prompt) {
      return Response.json(
        { error: 'Missing prompt' },
        { status: 400, headers }
      );
    }

    // Try each model until one succeeds
    let lastError = null;

    for (const model of AI_MODELS) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature, maxOutputTokens }
            })
          }
        );

        const data = await response.json();

        if (data.error) {
          lastError = data.error.message;
          if (data.error.message.includes('quota') || data.error.message.includes('rate')) {
            continue; // Try next model
          }
          throw new Error(data.error.message);
        }

        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (text) {
          return Response.json(
            { success: true, text, model },
            { status: 200, headers }
          );
        }
      } catch (e) {
        lastError = e.message;
        continue;
      }
    }

    return Response.json(
      { error: lastError || 'All models failed' },
      { status: 502, headers }
    );
  }
};
