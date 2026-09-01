/**
 * Cloudflare Worker - Gemini API Proxy + shop notifier
 * ซ่อน API key / LINE token ฝั่ง server ไม่เปิดเผยให้ client
 *
 * Routes:
 *   POST /         -> Gemini text generation (body: { prompt, ... })
 *   POST /notify   -> push an order alert to Telegram (LINE fallback)
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
  'https://siwaracafe.com',
  'https://www.siwaracafe.com',
  'https://possiwaracafe.pages.dev',
  'http://localhost:5173',
  'http://192.168.1.152:5173'
];

const AI_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash'
];

const OCR_MODEL = 'gemini-3.5-flash-lite';

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

  // Telegram is the primary shop channel. Keeping this server-side means the
  // bot token and destination chat ID never enter the public browser bundle.
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    try {
      const sent = await sendTelegramShopMessage(env, text);
      if (!sent.ok) {
        return Response.json(
          { error: `Telegram send failed (${sent.status})`, detail: sent.detail },
          { status: 502, headers }
        );
      }
      return Response.json(
        { success: true, channel: 'telegram', ...(sent.migratedTo ? { migratedTo: sent.migratedTo } : {}) },
        { status: 200, headers }
      );
    } catch (e) {
      return Response.json({ error: `Telegram send failed: ${e.message}` }, { status: 502, headers });
    }
  }

  // LINE remains as a fallback for environments that have not configured
  // Telegram yet.
  const targets = (env.LINE_TARGET_ID || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const to = targets[0];
  const hasAuth = env.LINE_CHANNEL_TOKEN || (env.LINE_CHANNEL_ID && env.LINE_CHANNEL_SECRET);
  if (!hasAuth) {
    return Response.json(
      { error: 'Shop notification is not configured (need Telegram or LINE credentials)' },
      { status: 500, headers }
    );
  }

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
// ข้อมูลร้านทุกบรรทัดตรงกับ JSON-LD + FAQ ในเว็บ siwaracafe.com · แก้ที่ไหนต้องแก้ให้ครบทั้งคู่
// ⚠️ ถ้าไปตั้ง auto-reply ใน OA Manager ด้วย ลูกค้าจะโดนตอบซ้ำสองครั้ง เลือกทางเดียว
// ---------------------------------------------------------------------------
const HOURS = 'เปิดอังคาร - อาทิตย์ 10:00 - 17:00 น. (ปิดวันจันทร์)';
// ลิงก์หมุดร้านบน Google Maps · ตัวเดียวกับที่ช่อง "แผนที่ร้าน" ในริชเมนูใช้
const MAP_URL = 'https://maps.app.goo.gl/EmCpQ4hKVBHTm3vM9';

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
    text: `ร้าน${HOURS} ค่ะ\n\nนำทางมาร้านได้เลย\n${MAP_URL}`,
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
    keys: ['ที่ไหน', 'แผนที่', 'ไปยังไง', 'พิกัด', 'ที่อยู่', 'เบอร์โทร', 'โทร', 'นำทาง', 'map'],
    // แปะลิงก์แผนที่ในข้อความเลย ไม่ให้ต้องเลื่อนไปหาปุ่มในริชเมนู · LINE ทำลิงก์ให้กดได้เอง
    text: '53 ถนนราษฎร์บำรุง ตะกั่วป่า พังงา 82110 ค่ะ\n\n'
      + 'กดลิงก์นี้นำทางได้เลย\n'
      + 'https://maps.app.goo.gl/EmCpQ4hKVBHTm3vM9\n\n'
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

// ---------------------------------------------------------------------------
// สรุปยอดขายประจำวัน · ยิงเองตาม cron ใน wrangler.toml (ไม่ต้องเปิดคอมทิ้งไว้)
//
// อ่าน Firestore ผ่าน REST ด้วย Anonymous Auth ตัวเดียวกับที่แอปใช้ — กติกาใน
// firestore.rules ต้องการแค่ `request.auth != null` เท่านั้น เลยไม่ต้องมี service account
//
// refresh token เก็บใน KV แล้วใช้ซ้ำ · ถ้า signUp ใหม่ทุกวันจะได้ผู้ใช้นิรนามงอกวันละคน
// รกหน้า Firebase Auth เปล่าๆ
// ---------------------------------------------------------------------------
const FB_TOKEN_KEY = '__firebase_refresh_token';

async function getFirebaseIdToken(env) {
  const key = env.FIREBASE_API_KEY;
  if (!key) throw new Error('FIREBASE_API_KEY not set');

  const saved = env.FOLLOWERS ? await env.FOLLOWERS.get(FB_TOKEN_KEY) : null;
  if (saved) {
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: saved }),
    });
    if (res.ok) return (await res.json()).id_token;
    // token ใช้ไม่ได้แล้ว (ผู้ใช้ถูกลบ / เพิกถอน) → ตกไปสมัครใหม่ข้างล่าง
  }

  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  if (!res.ok) throw new Error(`Firebase anon sign-in failed (${res.status})`);
  const data = await res.json();
  if (env.FOLLOWERS && data.refreshToken) await env.FOLLOWERS.put(FB_TOKEN_KEY, data.refreshToken);
  return data.idToken;
}

// แปลงค่าหนึ่งช่องของ Firestore REST (มันห่อ type ไว้ทุกค่า) ให้เป็นค่า JS ปกติ
function fsValue(v) {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsValue);
  if ('mapValue' in v) return fsDoc(v.mapValue);
  return null;
}

function fsDoc(doc) {
  const out = {};
  for (const [k, v] of Object.entries(doc?.fields || {})) out[k] = fsValue(v);
  return out;
}

function fsBase(env) {
  const project = env.FIREBASE_PROJECT_ID || 'siwarapos';
  const appId = env.POS_APP_ID || 'siwara-pos-v1';
  return `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`
    + `/artifacts/${appId}/public/data`;
}

/** วันที่แบบ YYYY-MM-DD ตามเวลาไทย — ต้องตรงกับที่ getISODate() ฝั่งแอปเขียนลงฟิลด์ `date` */
function bangkokISODate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function thaiDateLabel(now = new Date()) {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }).format(now);
}

async function buildDailyReport(env) {
  const token = await getFirebaseIdToken(env);
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const today = bangkokISODate();

  const qRes = await fetch(`${fsBase(env)}:runQuery`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'orders' }],
        where: {
          fieldFilter: { field: { fieldPath: 'date' }, op: 'EQUAL', value: { stringValue: today } },
        },
        limit: 500,
      },
    }),
  });
  if (!qRes.ok) throw new Error(`Firestore query failed (${qRes.status})`);
  const orders = (await qRes.json()).filter((r) => r.document).map((r) => fsDoc(r.document));

  // นับเฉพาะบิลที่ปิดแล้ว · บิลที่ยกเลิกหรือค้างอยู่ไม่ใช่ยอดขาย
  const done = orders.filter((o) => o.status === 'completed');
  const revenue = done.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const qrCount = done.filter((o) => o.source === 'qr').length;

  const tally = new Map();
  for (const o of done) {
    for (const it of o.items || []) {
      const name = it?.name;
      if (!name) continue;
      tally.set(name, (tally.get(name) || 0) + (Number(it.quantity) || 0));
    }
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  const sRes = await fetch(`${fsBase(env)}/stock?pageSize=300`, { headers: auth });
  const stock = sRes.ok ? (((await sRes.json()).documents) || []).map(fsDoc) : [];
  // ขาดหนักสุดขึ้นก่อน · ของที่ติดลบคือถูกตัดออกมากกว่าที่เคยรับเข้า ต้องเห็นเป็นอันดับแรก
  const lowAll = stock
    .filter((s) => Number(s.quantity) <= Number(s.minQuantity))
    .sort((a, b) => (Number(a.quantity) - Number(a.minQuantity)) - (Number(b.quantity) - Number(b.minQuantity)));
  const low = lowAll.slice(0, 6);

  const lines = [
    `สรุปวันนี้ · ${thaiDateLabel()}`,
    '',
    `ยอดขาย ฿${Math.round(revenue).toLocaleString('en-US')} · ${done.length} บิล`,
  ];
  if (done.length) lines.push(`สั่งผ่าน QR ${qrCount} บิล · หน้าร้าน ${done.length - qrCount} บิล`);
  if (orders.length > done.length) lines.push(`(ยังไม่ปิดบิล ${orders.length - done.length} รายการ)`);

  if (top.length) {
    lines.push('', 'ขายดีวันนี้');
    top.forEach(([name, qty], i) => lines.push(`${i + 1}. ${name} x${qty}`));
  }

  if (low.length) {
    lines.push('', 'ของใกล้หมด');
    for (const s of low) {
      const qty = Number(s.quantity) || 0;
      const unit = s.unit || '';
      // ติดลบ = ตัดสต๊อกออกมากกว่าที่รับเข้า แปลว่ายอดในระบบไม่ตรงของจริง ไม่ใช่แค่ของใกล้หมด
      const amount = qty < 0 ? `ติดลบ ${Math.abs(qty)} ${unit}` : `เหลือ ${qty} ${unit}`;
      lines.push(`· ${s.name} ${amount}`.replace(/\s+/g, ' ').trim());
    }
    if (lowAll.length > low.length) lines.push(`· และอีก ${lowAll.length - low.length} รายการ`);
  }

  return { text: lines.join('\n').slice(0, 5000), orderCount: orders.length, lowCount: lowAll.length };
}

/**
 * ส่งข้อความเข้าแชทร้านใน Telegram
 *
 * เมื่อกลุ่มธรรมดาถูกอัปเกรดเป็น supergroup, Telegram จะเปลี่ยน chat_id ใหม่และ
 * ตอบ 400 "group chat was upgraded to a supergroup chat" พร้อมส่ง id ใหม่มาใน
 * parameters.migrate_to_chat_id · เดิม worker ทิ้ง id นั้นทำให้แจ้งเตือนออเดอร์
 * ตายเงียบจนกว่าจะไปแก้ secret เอง · ที่นี่จึงจำ id ใหม่ลง KV แล้วยิงซ้ำทันที
 */
const TG_SHOP_CHAT_KEY = '__telegram_shop_chat';

async function resolveShopChatId(env) {
  if (env.FOLLOWERS) {
    const migrated = await env.FOLLOWERS.get(TG_SHOP_CHAT_KEY);
    if (migrated) return migrated;
  }
  return env.TELEGRAM_CHAT_ID;
}

async function postTelegramMessage(env, chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const result = await res.json().catch(() => ({}));
  return { res, result };
}

async function sendTelegramShopMessage(env, text) {
  const chatId = await resolveShopChatId(env);
  let { res, result } = await postTelegramMessage(env, chatId, text);

  const migratedTo = result?.parameters?.migrate_to_chat_id;
  if ((!res.ok || !result.ok) && migratedTo) {
    const newChatId = String(migratedTo);
    if (env.FOLLOWERS) await env.FOLLOWERS.put(TG_SHOP_CHAT_KEY, newChatId);
    ({ res, result } = await postTelegramMessage(env, newChatId, text));
    if (res.ok && result.ok) return { ok: true, migratedTo: newChatId };
  }

  if (!res.ok || !result.ok) {
    return { ok: false, status: res.status, detail: result.description || 'Unknown Telegram error' };
  }
  return { ok: true };
}

async function sendDailyReport(env) {
  const report = await buildDailyReport(env);

  // ไม่มีออเดอร์และไม่มีของใกล้หมด = วันปิดร้าน ไม่ต้องเปลืองโควตาส่งข้อความเปล่า
  if (report.orderCount === 0 && report.lowCount === 0) return { skipped: true };

  // Telegram is already the primary shop channel for order notifications.
  // Send the daily report there too so all operational summaries stay together.
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    const sent = await sendTelegramShopMessage(env, report.text);
    if (!sent.ok) {
      throw new Error(`Telegram daily report failed (${sent.status}): ${sent.detail}`);
    }
    return { sent: true, channel: 'telegram', text: report.text };
  }

  // Keep LINE as a safe fallback while Telegram credentials are unavailable.
  const to = (env.LINE_REPORT_TARGET_ID || env.LINE_TARGET_ID || '').split(',')[0].trim();
  if (!to) return { skipped: true, reason: 'no target' };

  const token = await getLineAccessToken(env);
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages: [{ type: 'text', text: report.text }] }),
  });
  return { sent: res.ok, status: res.status, text: report.text };
}

// ---------------------------------------------------------------------------
// Telegram expense capture
// ---------------------------------------------------------------------------
const TG_PENDING_KEY = '__expense_pending:';
const TG_OWNER_CHAT_KEY = '__telegram_owner_chat';

async function telegramApi(env, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    const detail = data.description ? `: ${data.description}` : '';
    throw new Error(`Telegram ${method} failed (${res.status})${detail}`);
  }
  return data.result;
}

async function replyTelegramExpense(env, chatId, text, keyboard) {
  return telegramApi(env, 'sendMessage', {
    chat_id: chatId,
    text: text.slice(0, 4000),
    parse_mode: 'HTML',
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

function inferExpenseCategory(title) {
  const value = String(title || '').toLocaleLowerCase();
  const rules = [
    ['เมล็ดกาแฟ', ['เมล็ดกาแฟ', 'เมล็ดคั่ว', 'coffee bean']],
    ['ผงชา/มัทฉะ/โกโก้', ['มัทฉะ', 'matcha', 'ชาเขียว', 'ชาไทย', 'โกโก้', 'cocoa', 'อัญชัน', 'ผงชา']],
    ['นมและผลิตภัณฑ์นม', ['นม', 'milk', 'ครีม', 'cream', 'วิป', 'เนย', 'butter', 'ชีส']],
    ['ไซรัป/ซอส/ท็อปปิ้ง', ['ไซรัป', 'syrup', 'ซอส', 'sauce', 'ท็อปปิ้ง', 'topping', 'น้ำผึ้ง', 'คาราเมล']],
    ['ผลไม้และของสด', ['น้ำแข็ง', 'ice', 'ผลไม้', 'ส้ม', 'มะนาว', 'เลมอน', 'มะพร้าว', 'berry']],
    ['วัตถุดิบเบเกอรี่', ['แป้ง', 'flour', 'น้ำตาล', 'sugar', 'เค้ก', 'cake', 'เจลาติน', 'ฐานรองเค้ก']],
    ['บรรจุภัณฑ์', ['แก้ว', 'ฝา', 'หลอด', 'ถุง', 'กล่อง', 'กระดาษ', 'ทิชชู่', 'ถ้วย', 'ช้อน']],
  ];
  return rules.find(([, keywords]) => keywords.some(keyword => value.includes(keyword)))?.[0] || 'อื่น ๆ';
}

function parseManualExpense(text) {
  const match = String(text || '').trim().match(/^(.+?)\s+(\d+(?:\.\d+)?)\s+(\S+)\s+(\d+(?:\.\d+)?)\s*บาท?$/i);
  if (!match) return null;
  const title = clean(match[1], 120);
  const quantity = Number(match[2]);
  const unit = clean(match[3], 20);
  const amount = Number(match[4]);
  if (!title || !unit || quantity <= 0 || amount <= 0) return null;
  return { title, quantity, unit, pricePerUnit: amount / quantity, amount, category: inferExpenseCategory(title), source: 'manual' };
}

function parseManualExpenses(text) {
  const lines = String(text || '').trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length || !/^รายจ่าย(?:\s|$)/i.test(lines[0])) return null;
  const itemLines = lines[0].replace(/^รายจ่าย\s*/i, '').trim();
  if (itemLines) lines[0] = itemLines;
  else lines.shift();
  if (!lines.length) return null;
  const expenses = lines.map(parseManualExpense);
  return expenses.every(Boolean) ? expenses : null;
}

function escapeTelegramHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function expensePreview(expense) {
  const expenses = Array.isArray(expense) ? expense : [expense];
  const isReceipt = expenses.some(item => item.source === 'receipt');
  const lines = [isReceipt ? '🧾 <b>ตรวจสอบใบเสร็จก่อนบันทึก</b>' : '📝 <b>ตรวจสอบรายจ่ายก่อนบันทึก</b>', ''];
  expenses.forEach((item, index) => {
    lines.push(
      `<b>${index + 1}. ${escapeTelegramHtml(item.title)}</b>`,
      item.barcode ? `รหัสสินค้า: ${escapeTelegramHtml(item.barcode)}` : '',
      `จำนวน ${item.quantity} ${escapeTelegramHtml(item.unit)} · ฿${Number(item.amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
      `ต้นทุน/หน่วย ฿${Number(item.pricePerUnit).toLocaleString('en-US', { maximumFractionDigits: 4 })} · ${escapeTelegramHtml(item.category)}`,
      ''
    );
  });
  if (expenses.length > 1) {
    lines.push(`<b>รวมทั้งหมด: ฿${expenses.reduce((sum, item) => sum + Number(item.amount), 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</b>`);
  }
  return lines.join('\n');
}

function compareExpenseSets(before, after) {
  const differences = [];
  if (before.length !== after.length) differences.push(`จำนวนรายการ ${before.length} → ${after.length}`);
  const max = Math.max(before.length, after.length);
  for (let i = 0; i < max; i += 1) {
    const a = before[i];
    const b = after[i];
    if (!a || !b) continue;
    if (String(a.barcode || '') !== String(b.barcode || '')) differences.push(`รายการ ${i + 1}: Code เปลี่ยน`);
    if (String(a.title || '').trim() !== String(b.title || '').trim()) differences.push(`รายการ ${i + 1}: ชื่อเปลี่ยน`);
    if (Number(a.quantity) !== Number(b.quantity)) differences.push(`รายการ ${i + 1}: จำนวนเปลี่ยน`);
    if (Number(a.amount) !== Number(b.amount)) differences.push(`รายการ ${i + 1}: ยอดเงินเปลี่ยน`);
  }
  return differences;
}

function expenseReviewKeyboard(canRecheck) {
  return [
    ...(canRecheck ? [[{ text: '🔎 รีเชคด้วย AI', callback_data: 'expense_recheck' }]] : []),
    [{ text: '✏️ แก้ไขข้อความ', callback_data: 'expense_edit' }],
    [{ text: '✅ ยืนยันบันทึก', callback_data: 'expense_confirm' }, { text: 'ยกเลิก', callback_data: 'expense_cancel' }],
  ];
}

function editTelegramExpense(text, currentExpenses) {
  const match = String(text || '').trim().match(/^แก้ไข\s+(\d+)\s+(.+)$/i);
  if (!match) return null;
  const index = Number(match[1]) - 1;
  if (index < 0 || index >= currentExpenses.length) return null;
  const edited = parseManualExpense(match[2]);
  if (!edited) return null;
  const updated = [...currentExpenses];
  updated[index] = { ...updated[index], ...edited, source: updated[index].source || 'manual' };
  return updated;
}

function telegramHelp() {
  return [
    '🤖 <b>คำสั่งผู้ช่วยร้าน</b>',
    '',
    '<b>รายจ่าย</b>',
    'รายจ่าย ชื่อรายการ จำนวนรวม หน่วย ยอดซื้อรวม บาท',
    'ตัวอย่าง: รายจ่าย นม 2000 กรัม 530 บาท',
    'หลายรายการ: เปิดหัวด้วย “รายจ่าย” แล้วขึ้นบรรทัดใหม่ทีละรายการ',
    'ส่งรูปใบเสร็จเพื่อให้ระบบอ่านและรอยืนยันได้',
    '',
    '<b>ตรวจสอบข้อมูล</b>',
    '/ยอดวันนี้ · ดูยอดขายวันนี้',
    '/เช็คสต็อก · ดูสต็อกใกล้หมด',
    '/เช็คสต็อก นม · ค้นหาสต็อกตามชื่อ',
    '/เช็คเมล็ดกาแฟ · ดูรายการเมล็ดกาแฟ',
    '/ยกเลิก · ยกเลิกรายการที่รอยืนยัน',
  ].join('\n');
}

async function listTelegramStock(env, query = '') {
  const token = await getFirebaseIdToken(env);
  const res = await fetch(`${fsBase(env)}/stock?pageSize=300`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Stock query failed (${res.status})`);
  const items = (((await res.json()).documents) || []).map(fsDoc);
  const normalizedQuery = query.toLocaleLowerCase();
  const filtered = items.filter((item) => {
    const name = String(item.name || '').toLocaleLowerCase();
    const category = String(item.category || '').toLocaleLowerCase();
    return !normalizedQuery || name.includes(normalizedQuery) || category.includes(normalizedQuery)
      || (normalizedQuery.includes('เมล็ดกาแฟ') && inferExpenseCategory(item.name) === 'เมล็ดกาแฟ');
  });
  const low = !query ? filtered.filter(item => Number(item.quantity) <= Number(item.minQuantity)) : filtered;
  const shown = (low.length ? low : filtered).slice(0, 30);
  if (!shown.length) return query ? `ไม่พบสต็อกที่ตรงกับ “${escapeTelegramHtml(query)}”` : 'ไม่มีรายการสต็อก';
  const heading = query ? `📦 <b>สต็อกที่ค้นหา: ${escapeTelegramHtml(query)}</b>` : '📦 <b>สต็อกใกล้หมด</b>';
  const lines = shown.map((item) => {
    const quantity = Number(item.quantity) || 0;
    const unit = escapeTelegramHtml(item.unit || 'หน่วย');
    const warning = quantity <= Number(item.minQuantity) ? ' ⚠️' : '';
    return `· ${escapeTelegramHtml(item.name)} · ${quantity.toLocaleString('en-US')} ${unit}${warning}`;
  });
  return `${heading}\n${lines.join('\n')}${(low.length || filtered.length) > shown.length ? `\n· และอีก ${(low.length || filtered.length) - shown.length} รายการ` : ''}`;
}

async function handleTelegramCommand(env, chatId, text) {
  const command = String(text || '').trim();
  if (/^\/(ยกเลิก|cancel)(?:@[\w_]+)?(?:\s|$)/i.test(command)) {
    if (env.FOLLOWERS) await env.FOLLOWERS.delete(`${TG_PENDING_KEY}${chatId}`);
    await replyTelegramExpense(env, chatId, 'ยกเลิกรายจ่ายแล้ว');
    return true;
  }
  if (/^\/(help|start)(?:@[\w_]+)?(?:\s|$)/i.test(command)) {
    await replyTelegramExpense(env, chatId, telegramHelp());
    return true;
  }
  if (/^\/(ยอดวันนี้|เช็คยอด|sales|summary)(?:@[\w_]+)?(?:\s|$)/i.test(command)) {
    const report = await buildDailyReport(env);
    await replyTelegramExpense(env, chatId, escapeTelegramHtml(report.text));
    return true;
  }
  const stockMatch = command.match(/^\/(เช็คสต็อก|stock)(?:@[\w_]+)?(?:\s+(.+))?$/i);
  if (stockMatch) {
    await replyTelegramExpense(env, chatId, await listTelegramStock(env, stockMatch[2] || ''));
    return true;
  }
  if (/^\/(เช็คเมล็ดกาแฟ|coffee)(?:@[\w_]+)?(?:\s|$)/i.test(command)) {
    await replyTelegramExpense(env, chatId, await listTelegramStock(env, 'เมล็ดกาแฟ'));
    return true;
  }
  return false;
}

async function saveTelegramExpense(env, expense) {
  const token = await getFirebaseIdToken(env);
  const fields = {
    title: { stringValue: clean(expense.title, 120) },
    quantity: { doubleValue: Number(expense.quantity) || 0 },
    unit: { stringValue: clean(expense.unit, 20) },
    pricePerUnit: { doubleValue: Number(expense.pricePerUnit) || 0 },
    amount: { doubleValue: Number(expense.amount) || 0 },
    category: { stringValue: clean(expense.category, 60) },
    ...(expense.barcode ? { barcode: { stringValue: clean(expense.barcode, 32) } } : {}),
    date: { stringValue: bangkokISODate() },
    createdAt: { timestampValue: new Date().toISOString() },
  };
  const res = await fetch(`${fsBase(env)}/expenses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Expense save failed (${res.status})`);
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function parseOcrNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const match = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

async function extractExpenseFromImage(env, fileId, testImage = null, testMimeType = 'image/jpeg', retry = false) {
  let mimeType = testMimeType;
  let image = testImage;
  if (!image) {
    const file = await telegramApi(env, 'getFile', { file_id: fileId });
    const imageRes = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`);
    if (!imageRes.ok) throw new Error('Receipt image download failed');
    const detectedMime = imageRes.headers.get('content-type') || '';
    const extensionMime = /\.png$/i.test(file.file_path || '') ? 'image/png'
      : /\.webp$/i.test(file.file_path || '') ? 'image/webp' : 'image/jpeg';
    mimeType = /^image\/(jpeg|png|webp|gif)$/i.test(detectedMime) ? detectedMime : extensionMime;
    image = bytesToBase64(new Uint8Array(await imageRes.arrayBuffer()));
  }
  const prompt = `อ่านข้อความจากภาพใบเสร็จ แล้วตอบเป็น JSON เท่านั้นตาม schema นี้:
{"items":[{"title":"ชื่อสินค้า","barcode":"885xxxxxxxxx","quantity":1,"unit":"ชิ้น","pricePerUnit":0,"amount":0}]}
ต้องแยกรายการสินค้าทุกบรรทัดออกเป็น items ห้ามรวมหลายสินค้าเป็นรายการเดียว
ให้โฟกัสคอลัมน์ Code/รหัสอ้างอิงของบิลเป็นพิเศษ เช่น เลขขึ้นต้น 885 และอ่านตัวเลขให้ครบ ห้ามเอา Code ไปรวมใน title ถ้าไม่มีให้ใช้ barcode เป็นสตริงว่าง
amount คือยอดรวมของรายการนั้น และ pricePerUnit คือ amount หาร quantity
ถ้ามีหลายรายการให้แยกเป็นคนละ item เสมอ และใช้ยอดของแต่ละบรรทัดตามใบเสร็จ
ห้ามใส่ markdown ห้ามเดาข้อมูลที่ไม่มีในภาพ ตัวเลขต้องเป็น number`;
  const orientationInstruction = '\n\nภาพอาจเอียงหรือหมุน 90/180 องศา ให้ปรับมุมมองก่อนอ่าน และอ่านข้อความจากบนลงล่างทีละบรรทัด ห้ามตอบ items ว่าง หากชื่อสินค้าไม่ชัดให้ใช้ข้อความที่มองเห็นได้ แต่ต้องเก็บ Code และยอดเงินของแต่ละบรรทัด';
  const ocrPrompt = retry
    ? `${prompt}${orientationInstruction}\nตรวจซ้ำอีกครั้งและตอบ JSON เท่านั้น`
    : `${prompt}${orientationInstruction}`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${OCR_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: ocrPrompt }, { inline_data: { mime_type: mimeType, data: image } }] }], generationConfig: { temperature: 0, maxOutputTokens: 1400 } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Gemini OCR API error (${res.status}): ${data?.error?.message || 'ไม่สามารถอ่านผลจาก Gemini ได้'}`);
  }
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map(part => part?.text || '')
    .filter(Boolean)
    .join('\n');
  const jsonText = text.replace(/```json|```/gi, '').trim();
  const jsonMatch = jsonText.match(/(?:\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!jsonMatch) throw new Error('Gemini ไม่ส่งข้อมูลใบเสร็จกลับมา');
  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('Gemini ส่งข้อมูลใบเสร็จมาไม่อยู่ในรูปแบบ JSON');
  }
  const rawItems = Array.isArray(parsed)
    ? parsed
    : (Array.isArray(parsed.items)
      ? parsed.items
      : (Array.isArray(parsed.products)
        ? parsed.products
        : (Array.isArray(parsed.lines)
          ? parsed.lines
          : (Array.isArray(parsed.rows)
            ? parsed.rows
            : (Array.isArray(parsed.data)
              ? parsed.data
              : (Array.isArray(parsed.results) ? parsed.results : [parsed]))))));
  const items = rawItems.map((item) => {
    const itemQuantity = parseOcrNumber(item.quantity ?? item.qty ?? item.count ?? item['จำนวน']) || 1;
    const lineAmount = parseOcrNumber(item.amount ?? item.total ?? item.lineTotal ?? item.totalAmount ?? item.line_amount ?? item.line_total ?? item['รวม']);
    const unitAmount = parseOcrNumber(item.pricePerUnit ?? item.unitPrice ?? item.unit_price ?? item.price ?? item.ราคา);
    const itemAmount = lineAmount || (unitAmount * itemQuantity);
    const title = clean(item.title || item.name || item.product || item.productName || item.product_name || item.description || item['สินค้า'], 120);
    const barcode = String(item.barcode || item.code || item.productCode || '').replace(/[^0-9]/g, '').slice(0, 32);
    return {
      title,
      barcode,
      quantity: itemQuantity,
      unit: clean(item.unit || 'ชิ้น', 20),
      pricePerUnit: itemAmount / itemQuantity,
      amount: itemAmount,
      category: inferExpenseCategory(title),
      source: 'receipt',
    };
  }).filter(item => item.title && item.amount > 0);
  if (!items.length && !retry) {
    return extractExpenseFromImage(env, null, image, mimeType, true);
  }
  if (!items.length) throw new Error('ไม่พบรายการสินค้าและยอดเงินในใบเสร็จ');
  return items;
}

async function handleTelegramExpense(request, env) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return new Response('Telegram is not configured', { status: 503 });
  const update = await request.json().catch(() => null);
  if (!update) return new Response('Bad request', { status: 400 });
  const callback = update.callback_query;
  const message = update.message || callback?.message;
  const chatId = String(message?.chat?.id || '');
  const enrolledChatId = env.FOLLOWERS ? await env.FOLLOWERS.get(TG_OWNER_CHAT_KEY) : null;
  const isAuthorizedChat = chatId && (chatId === String(env.TELEGRAM_CHAT_ID) || chatId === enrolledChatId);
  console.log('telegram update received', {
    updateId: update.update_id ?? null,
    chatId,
    hasText: Boolean(message?.text),
    hasPhoto: Boolean(message?.photo?.length),
    isAuthorizedChat: Boolean(isAuthorizedChat),
  });
  // Keep /help discoverable even if the owner is chatting from a new/private
  // chat. Financial, stock, and write operations remain owner-only below.
  if (!isAuthorizedChat) {
    if (message?.text && /^\/(help|start)(?:@[\w_]+)?(?:\s|$)/i.test(message.text.trim())) {
      try {
        if (['private', 'group', 'supergroup'].includes(message.chat?.type) && env.FOLLOWERS) {
          await env.FOLLOWERS.put(TG_OWNER_CHAT_KEY, chatId);
        }
        await replyTelegramExpense(env, chatId, telegramHelp());
        console.log('telegram help reply sent', { chatId });
      } catch (error) {
        console.error('telegram help reply failed:', error.message);
      }
    } else {
      console.log('telegram update ignored: unauthorized chat or unsupported public command');
    }
    return new Response('OK', { status: 200 });
  }

  if (callback) {
    await telegramApi(env, 'answerCallbackQuery', { callback_query_id: callback.id });
    const pending = env.FOLLOWERS ? await env.FOLLOWERS.get(`${TG_PENDING_KEY}${chatId}`, 'json') : null;
    const pendingExpenses = Array.isArray(pending) ? pending : (pending?.expenses || []);
    if (callback.data === 'expense_recheck' && pending?.fileId) {
      try {
        const checkedExpenses = await extractExpenseFromImage(env, pending.fileId);
        const differences = compareExpenseSets(pendingExpenses, checkedExpenses);
        const updatedPending = { ...pending, expenses: checkedExpenses, rechecked: true };
        if (env.FOLLOWERS) await env.FOLLOWERS.put(`${TG_PENDING_KEY}${chatId}`, JSON.stringify(updatedPending), { expirationTtl: 900 });
        const note = differences.length
          ? `🔎 <b>รีเชคแล้ว พบข้อมูลต่างจากรอบแรก</b>\n${differences.map(escapeTelegramHtml).join('\n')}\n\nตรวจรายการล่าสุดก่อนยืนยันอีกครั้ง`
          : '🔎 <b>รีเชคแล้ว ข้อมูลตรงกันทั้ง 2 รอบ</b>\nตรวจรายการล่าสุดก่อนยืนยันอีกครั้ง';
        await replyTelegramExpense(env, chatId, `${note}\n\n${expensePreview(checkedExpenses)}`, expenseReviewKeyboard(true));
      } catch (error) {
        await replyTelegramExpense(env, chatId, `รีเชคไม่สำเร็จ: ${escapeTelegramHtml(error.message)}\nข้อมูลเดิมยังไม่ถูกบันทึก`);
      }
      return new Response('OK', { status: 200 });
    }
    if (callback.data === 'expense_edit' && pendingExpenses.length) {
      const editPending = Array.isArray(pending) ? { expenses: pending } : { ...pending };
      editPending.editing = true;
      if (env.FOLLOWERS) await env.FOLLOWERS.put(`${TG_PENDING_KEY}${chatId}`, JSON.stringify(editPending), { expirationTtl: 900 });
      await replyTelegramExpense(env, chatId, '✏️ ส่งข้อความแก้ไขได้เลย\nตัวอย่าง: แก้ไข 3 น้ำมันงา 2 ขวด 150 บาท\nระบบจะแก้เฉพาะรายการที่ 3 แล้วให้ตรวจสอบใหม่');
      return new Response('OK', { status: 200 });
    }
    if (callback.data === 'expense_cancel') {
      if (env.FOLLOWERS) await env.FOLLOWERS.delete(`${TG_PENDING_KEY}${chatId}`);
      await replyTelegramExpense(env, chatId, 'ยกเลิกรายจ่ายแล้ว');
    } else if (callback.data === 'expense_confirm' && pending) {
      for (const expense of pendingExpenses) await saveTelegramExpense(env, expense);
      if (env.FOLLOWERS) await env.FOLLOWERS.delete(`${TG_PENDING_KEY}${chatId}`);
      const total = pendingExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
      await replyTelegramExpense(env, chatId, `✅ <b>บันทึกรายจ่ายสำเร็จ</b>\n${pendingExpenses.length} รายการ · ฿${total.toLocaleString('en-US')}`);
    }
    return new Response('OK', { status: 200 });
  }

  const photo = message?.photo?.at(-1);
  const imageFileId = photo?.file_id
    || (message?.document?.mime_type?.startsWith('image/') ? message.document.file_id : null);
  const text = message?.text || '';
  const storedPending = env.FOLLOWERS ? await env.FOLLOWERS.get(`${TG_PENDING_KEY}${chatId}`, 'json') : null;
  const storedExpenses = Array.isArray(storedPending) ? storedPending : (storedPending?.expenses || []);
  if (storedPending?.editing && text && !text.startsWith('/')) {
    const editedExpenses = editTelegramExpense(text, storedExpenses);
    if (!editedExpenses) {
      await replyTelegramExpense(env, chatId, 'รูปแบบแก้ไขไม่ถูกต้อง\nใช้: แก้ไข ลำดับ ชื่อ จำนวน หน่วย ยอดรวม บาท\nตัวอย่าง: แก้ไข 3 น้ำมันงา 2 ขวด 150 บาท');
    } else {
      const editedPending = { ...storedPending, expenses: editedExpenses, editing: false };
      if (env.FOLLOWERS) await env.FOLLOWERS.put(`${TG_PENDING_KEY}${chatId}`, JSON.stringify(editedPending), { expirationTtl: 900 });
      await replyTelegramExpense(env, chatId, `✅ แก้ไขรายการที่ ${text.trim().match(/^แก้ไข\s+(\d+)/i)?.[1]} แล้ว\n\n${expensePreview(editedExpenses)}`, expenseReviewKeyboard(Boolean(editedPending.fileId)));
    }
    return new Response('OK', { status: 200 });
  }
  if (text.startsWith('/')) {
    try {
      const handled = await handleTelegramCommand(env, chatId, text);
      if (!handled) await replyTelegramExpense(env, chatId, 'ไม่รู้จักคำสั่งนี้\nพิมพ์ /help เพื่อดูคำสั่งทั้งหมด');
    } catch (error) {
      await replyTelegramExpense(env, chatId, `เรียกข้อมูลไม่สำเร็จ: ${escapeTelegramHtml(error.message)}`);
    }
    return new Response('OK', { status: 200 });
  }
  if (/^\/(ยกเลิก|cancel)/i.test(text)) {
    if (env.FOLLOWERS) await env.FOLLOWERS.delete(`${TG_PENDING_KEY}${chatId}`);
    await replyTelegramExpense(env, chatId, 'ยกเลิกรายจ่ายแล้ว');
    return new Response('OK', { status: 200 });
  }

  try {
    const expenses = imageFileId ? await extractExpenseFromImage(env, imageFileId) : parseManualExpenses(text);
    if (!expenses) {
      await replyTelegramExpense(env, chatId, 'กรอกตามแบบฟอร์มนี้เท่านั้น:\nรายจ่าย | ชื่อรายการ | จำนวนรวม | หน่วย | ยอดซื้อรวม\nตัวอย่าง: รายจ่าย | นม | 2000 | กรัม | 530\n\nระบบจะคำนวณต้นทุนต่อหน่วยให้เอง\nหรือส่งรูปใบเสร็จมาได้เลย');
    } else {
      const pendingPayload = imageFileId ? { expenses, source: 'receipt', fileId: imageFileId, rechecked: false } : expenses;
      if (env.FOLLOWERS) await env.FOLLOWERS.put(`${TG_PENDING_KEY}${chatId}`, JSON.stringify(pendingPayload), { expirationTtl: 900 });
      await replyTelegramExpense(env, chatId, expensePreview(expenses), expenseReviewKeyboard(Boolean(imageFileId)));
    }
  } catch (error) {
    await replyTelegramExpense(env, chatId, `อ่านรายจ่ายไม่สำเร็จ: ${error.message}\nลองพิมพ์เองหรือส่งรูปใหม่อีกครั้ง`);
  }
  return new Response('OK', { status: 200 });
}

async function handleTelegramExpenseSetup(request, env, headers) {
  const expected = env.NOTIFY_SHARED_SECRET;
  const provided = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!expected || provided !== expected) return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  const webhookUrl = 'https://pos-gemini-proxy.siwatid-99.workers.dev/telegram-expense';
  await telegramApi(env, 'setWebhook', { url: webhookUrl, allowed_updates: ['message', 'callback_query'] });
  return Response.json({ success: true, webhookUrl }, { status: 200, headers });
}

async function handleTelegramExpenseStatus(request, env, headers) {
  const expected = env.NOTIFY_SHARED_SECRET;
  const provided = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!expected || provided !== expected) return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  const info = await telegramApi(env, 'getWebhookInfo', {});
  const bot = await telegramApi(env, 'getMe', {});
  return Response.json({
    ok: true,
    botUsername: bot.username || null,
    botId: bot.id || null,
    url: info.url,
    pendingUpdateCount: info.pending_update_count,
    lastErrorDate: info.last_error_date || null,
    lastErrorMessage: info.last_error_message || null,
    allowedUpdates: info.allowed_updates || null,
    enrolledChatId: env.FOLLOWERS ? await env.FOLLOWERS.get(TG_OWNER_CHAT_KEY) : null,
  }, { status: 200, headers });
}

export default {
  // Cron ตาม [triggers] ใน wrangler.toml
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDailyReport(env).catch((e) => console.error('daily report failed:', e.message)));
  },

  async fetch(request, env, ctx) {
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
    if (pathname.endsWith('/telegram-expense/status')) {
      return handleTelegramExpenseStatus(request, env, headers);
    }
    if (pathname.endsWith('/telegram-expense/setup')) {
      return handleTelegramExpenseSetup(request, env, headers);
    }
    if (pathname.endsWith('/telegram-expense')) {
      // Telegram expects a quick webhook acknowledgement. Receipt OCR can
      // take several seconds, so keep the AI work in the Worker background.
      const update = await request.clone().json().catch(() => null);
      const hasImage = Boolean(update?.message?.photo?.length)
        || update?.message?.document?.mime_type?.startsWith('image/');
      const processUpdate = () => handleTelegramExpense(request.clone(), env).catch((error) => {
        console.error('telegram expense failed:', error.message);
      });
      // Text commands must finish before acknowledging the webhook. This
      // avoids Telegram/Workers dropping a fast command sent via waitUntil.
      if (hasImage) {
        const imageChatId = String(update?.message?.chat?.id || '');
        if (imageChatId) {
          await replyTelegramExpense(env, imageChatId, '🧾 รับรูปแล้ว กำลังอ่านใบเสร็จให้ครับ…');
        }
        ctx.waitUntil(processUpdate());
      } else await processUpdate();
      return new Response('OK', { status: 200 });
    }
    if (pathname.endsWith('/webhook')) {
      return handleWebhook(request, env);
    }
    if (pathname.endsWith('/followers')) {
      return handleFollowers(request, env, headers);
    }
    // ยิงรายงานเองได้ทันทีโดยไม่ต้องรอ cron · `{"dryRun":true}` = ดูข้อความเฉยๆ ไม่ส่งจริง
    if (pathname.endsWith('/report')) {
      const expected = env.NOTIFY_SHARED_SECRET;
      const provided = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      if (!expected || provided !== expected) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
      }
      const body = await request.json().catch(() => ({}));
      try {
        if (body.dryRun) {
          const r = await buildDailyReport(env);
          return Response.json({ dryRun: true, ...r }, { status: 200, headers });
        }
        return Response.json(await sendDailyReport(env), { status: 200, headers });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 502, headers });
      }
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
