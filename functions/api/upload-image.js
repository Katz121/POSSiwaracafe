/**
 * Cloudflare Pages Function — POST /api/upload-image
 *
 * Stores a menu image in R2 and returns its public URL, so menu docs hold a
 * short URL instead of a multi-hundred-KB base64 blob. This is what keeps the
 * `config/publicMenu` bundle small enough to fit Firestore's 1 MiB limit (and
 * stops every customer from downloading megabytes of inline images).
 *
 * Request  body : { "dataUrl": "data:image/jpeg;base64,...." }
 * Response body : { "url": "https://<public-r2-base>/menu/<key>" }
 *
 * Required Pages bindings (set in the Cloudflare dashboard / wrangler.toml):
 *   - MENU_BUCKET     : R2 bucket binding
 *   - PUBLIC_R2_BASE  : public base URL of that bucket (e.g. https://pub-xxxx.r2.dev)
 */

const MAX_BYTES = 3 * 1024 * 1024; // reject anything over ~3 MB per image

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.MENU_BUCKET || !env.PUBLIC_R2_BASE) {
    return json({ error: 'R2 is not configured (missing MENU_BUCKET / PUBLIC_R2_BASE binding)' }, 500);
  }

  let dataUrl;
  try {
    ({ dataUrl } = await request.json());
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return json({ error: 'body must be { dataUrl: "data:<type>;base64,..." }' }, 400);
  }

  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) return json({ error: 'unsupported image encoding (expected base64 data URL)' }, 400);

  const contentType = match[1];
  let bytes;
  try {
    bytes = base64ToBytes(match[2]);
  } catch {
    return json({ error: 'could not decode base64 image' }, 400);
  }
  if (bytes.length > MAX_BYTES) return json({ error: 'image too large (max 3 MB)' }, 413);

  const ext = (contentType.split('/')[1] || 'jpg').replace('+xml', '').replace('jpeg', 'jpg');
  const key = `menu/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  try {
    await env.MENU_BUCKET.put(key, bytes, {
      httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
    });
  } catch (err) {
    return json({ error: `R2 put failed: ${err?.message || err}` }, 502);
  }

  const base = env.PUBLIC_R2_BASE.replace(/\/+$/, '');
  return json({ url: `${base}/${key}` }, 200);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
