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
  const to = env.LINE_TARGET_ID; // optional: set => push to one userId/groupId; unset => broadcast
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
    // With LINE_TARGET_ID -> push to that user/group; without -> broadcast to all OA friends.
    const endpoint = to
      ? 'https://api.line.me/v2/bot/message/push'
      : 'https://api.line.me/v2/bot/message/broadcast';
    const messages = [{ type: 'text', text }];
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(to ? { to, messages } : { messages }),
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
 * LINE webhook. Exists for ONE job: let the shop read the LINE id it should be
 * notified at (see LINE_TARGET_ID). Without it, /notify falls back to
 * `broadcast`, which fans every new-order alert out to EVERY follower of the
 * OA — fine while the only followers are staff, wrong the moment a customer
 * adds the account.
 *
 * How to use: from the LINE chat (or a group the OA is in) send the word
 * `myid`. The bot replies with the userId / groupId to put in LINE_TARGET_ID:
 *   wrangler secret put LINE_TARGET_ID
 * Any other message is ignored (200 OK) so the OA keeps behaving like a normal
 * manual-reply account.
 *
 * Every webhook call is signature-verified with the channel secret — LINE signs
 * the raw body with HMAC-SHA256, so a forged call can't make the bot speak.
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
    const text = ev?.message?.text?.trim().toLowerCase();
    if (ev.type !== 'message' || text !== 'myid') continue;

    const src = ev.source || {};
    const id = src.groupId || src.roomId || src.userId || '(ไม่พบ id)';
    const kind = src.groupId ? 'groupId' : src.roomId ? 'roomId' : 'userId';
    try {
      const token = await getLineAccessToken(env);
      await fetch('https://api.line.me/v2/bot/message/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          replyToken: ev.replyToken,
          messages: [{ type: 'text', text: `${kind}\n${id}\n\nเอาไปตั้งเป็น LINE_TARGET_ID บน Worker` }],
        }),
      });
    } catch {
      // Best effort — never fail the webhook, LINE retries and disables noisy endpoints.
    }
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
