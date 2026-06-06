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
 *   - MENU_BUCKET        : R2 bucket binding
 *   - PUBLIC_R2_BASE     : public base URL of that bucket (e.g. https://pub-xxxx.r2.dev)
 *   - FIREBASE_PROJECT_ID: Firebase project id, to verify caller ID tokens
 *
 * SECURITY: the caller must send a valid Firebase ID token from this project
 * (Authorization: Bearer <idToken>), and only image MIME types are accepted —
 * otherwise this would be an open, unauthenticated file host on your domain.
 */
import { verifyFirebaseIdToken } from './_verifyFirebaseToken.js';

const MAX_BYTES = 3 * 1024 * 1024; // reject anything over ~3 MB per image
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// Authoritative type detection from the actual decoded bytes (magic numbers), so
// a lying Content-Type can't get HTML/JS/SVG stored and served as a script.
const SIGNATURES = [
  { type: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', ext: 'png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: 'image/gif', ext: 'gif', test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
  {
    type: 'image/webp',
    ext: 'webp',
    test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
                 b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
];

function sniffImage(bytes) {
  if (bytes.length < 12) return null;
  return SIGNATURES.find((s) => s.test(bytes)) || null;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.MENU_BUCKET || !env.PUBLIC_R2_BASE) {
    return json({ error: 'R2 is not configured (missing MENU_BUCKET / PUBLIC_R2_BASE binding)' }, 500);
  }
  if (!env.FIREBASE_PROJECT_ID) {
    return json({ error: 'auth is not configured (missing FIREBASE_PROJECT_ID)' }, 500);
  }

  // --- Require a valid Firebase ID token from this project ------------------
  const authz = request.headers.get('Authorization') || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  const claims = await verifyFirebaseIdToken(token, env.FIREBASE_PROJECT_ID);
  if (!claims) return json({ error: 'unauthenticated' }, 401);

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
  // Only allow real image types — never echo back an arbitrary client-supplied type.
  if (!ALLOWED_TYPES.has(contentType)) {
    return json({ error: `unsupported content type: ${contentType}` }, 415);
  }
  let bytes;
  try {
    bytes = base64ToBytes(match[2]);
  } catch {
    return json({ error: 'could not decode base64 image' }, 400);
  }
  if (bytes.length > MAX_BYTES) return json({ error: 'image too large (max 3 MB)' }, 413);

  // Trust the bytes, not the label: detect the real type from magic numbers and
  // store with THAT type + extension. Rejects HTML/JS/SVG masquerading as images.
  const sig = sniffImage(bytes);
  if (!sig || !ALLOWED_TYPES.has(sig.type)) {
    return json({ error: 'file content is not a recognized image' }, 415);
  }

  const key = `menu/${Date.now()}-${crypto.randomUUID()}.${sig.ext}`;

  try {
    await env.MENU_BUCKET.put(key, bytes, {
      httpMetadata: {
        contentType: sig.type, // authoritative type from sniffed bytes
        cacheControl: 'public, max-age=31536000, immutable',
        contentDisposition: 'inline',
      },
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
