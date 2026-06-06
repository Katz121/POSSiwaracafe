/**
 * Minimal Firebase ID token (RS256 JWT) verification for the Cloudflare Workers
 * runtime — no firebase-admin (which doesn't run on Workers). Used by the upload
 * endpoint so only clients holding a valid token from THIS Firebase project can
 * write to R2, instead of the whole internet.
 *
 * NOTE on the app's auth model: staff and customers both use Firebase Anonymous
 * Auth, so a verified token proves "a real client of this project" — not "an
 * admin". That's an intentional, documented limitation (see firestore.rules);
 * this check still blocks unauthenticated/drive-by abuse, and combined with the
 * image-only content-type allowlist + size cap keeps the endpoint from being an
 * open file host. Tighten to true staff-only once staff move to email/password.
 */

const JWKS_URL =
  'https://www.googleapis.com/robot/v1/metadata/jwk/securetoken@system.gserviceaccount.com';

let cachedKeys = null;
let cachedAt = 0;

async function getJwks() {
  const now = Date.now();
  if (cachedKeys && now - cachedAt < 60 * 60 * 1000) return cachedKeys; // 1h cache
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error('could not fetch Google JWKS');
  const { keys } = await res.json();
  cachedKeys = keys;
  cachedAt = now;
  return keys;
}

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeSegment(seg) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(seg)));
}

/**
 * @returns the token payload if valid, or null if the token is missing/invalid.
 */
export async function verifyFirebaseIdToken(token, projectId) {
  if (!token || typeof token !== 'string' || !projectId) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  let header;
  let payload;
  try {
    header = decodeSegment(parts[0]);
    payload = decodeSegment(parts[1]);
  } catch {
    return null;
  }
  if (header.alg !== 'RS256' || !header.kid) return null;

  // Claim checks (Firebase ID token spec)
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!payload.exp || payload.exp < now) return null;
  if (payload.iat && payload.iat > now + 300) return null; // small clock-skew allowance
  if (!payload.sub) return null;

  // Signature check against Google's published public keys
  let cryptoKey;
  try {
    const keys = await getJwks();
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
  } catch {
    return null;
  }

  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const sig = b64urlToBytes(parts[2]);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, sig, signed);
  return ok ? payload : null;
}
