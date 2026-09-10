// ห่อ fetch ด้วยฟังก์ชัน ห้ามเก็บ globalThis.fetch ตรงๆ แล้วเรียกเป็น deps.fetch(...)
// Cloudflare Workers ถือว่า this ผิดแล้วโยน "Illegal invocation" (Node ไม่สนใจ เทสต์เลยไม่เจอ)
const boundFetch = (...args) => globalThis.fetch(...args);
export const dependencies = (env, deps = {}) => ({ fetch: boundFetch, kv: env.FOLLOWERS, now: () => Date.now(), ...deps });

export function encodeValue(value) {
  if (value == null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite Firestore number');
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  return { stringValue: String(value) };
}
export const encodeFields = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined).map(([k, v]) => [k, encodeValue(v)]));
export function fsValue(v) {
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsValue);
  if ('mapValue' in v) return fsDoc(v.mapValue);
  if ('integerValue' in v || 'doubleValue' in v) return Number(v.integerValue ?? v.doubleValue);
  return v.stringValue ?? v.booleanValue ?? v.timestampValue ?? null;
}
export const fsDoc = (doc) => Object.fromEntries(Object.entries(doc?.fields || {}).map(([k, v]) => [k, fsValue(v)]));
export const fsBase = (env) => `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID || 'siwarapos'}/databases/(default)/documents/artifacts/${env.POS_APP_ID || 'siwara-pos-v1'}/public/data`;
const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

export async function getFirebaseIdToken(env, injected) {
  const { fetch, kv, now } = dependencies(env, injected);
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    const cached = await kv?.get('__gcp_access_token', 'json');
    const seconds = Math.floor(now() / 1000);
    if (cached?.expiresAt > seconds) return cached.token;
    const json64 = (obj) => base64url(new TextEncoder().encode(JSON.stringify(obj)));
    const unsigned = `${json64({ alg: 'RS256', typ: 'JWT' })}.${json64({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: seconds, exp: seconds + 3600 })}`;
    const pem = account.private_key.replace(/-----[^-]+-----|\s/g, '');
    const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
    const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${base64url(new Uint8Array(signature))}` }) });
    const data = await res.json();
    if (!res.ok || !data.access_token) throw new Error(`Google token exchange failed (${res.status})`);
    const ttl = Math.min(Number(data.expires_in) || 3600, 3600) - 120;
    if (ttl >= 60) await kv?.put('__gcp_access_token', JSON.stringify({ token: data.access_token, expiresAt: seconds + ttl }), { expirationTtl: ttl });
    return data.access_token;
  }
  if (!env.BOT_EMAIL || !env.BOT_PASSWORD) throw new Error('Firestore credentials not configured (FIREBASE_SERVICE_ACCOUNT or BOT_EMAIL/BOT_PASSWORD)');
  if (!env.FIREBASE_API_KEY) throw new Error('FIREBASE_API_KEY not set');
  const saved = await kv?.get('__firebase_bot_refresh');
  if (saved) {
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${env.FIREBASE_API_KEY}`, { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: saved }) });
    const data = await res.json();
    if (res.ok && data.id_token) {
      if (data.refresh_token) await kv?.put('__firebase_bot_refresh', data.refresh_token);
      return data.id_token;
    }
  }
  // ใช้บัญชีพนักงานเท่านั้น เพราะ anonymous ไม่มีสิทธิ์อ่านข้อมูลภายในร้าน
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.FIREBASE_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.BOT_EMAIL, password: env.BOT_PASSWORD, returnSecureToken: true }) });
  const data = await res.json();
  if (!res.ok || !data.idToken) throw new Error(`Firebase staff sign-in failed (${res.status})`);
  if (data.refreshToken) await kv?.put('__firebase_bot_refresh', data.refreshToken);
  return data.idToken;
}

export const serverTime = (fieldPath) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' });
export const increment = (fieldPath, value) => ({ fieldPath, increment: encodeValue(value) });
export const appendMissingElements = (fieldPath, values) => ({ fieldPath, appendMissingElements: { values: values.map(encodeValue) } });
export function createWrite(name, fields, updateTransforms = []) {
  return { update: { name, fields: encodeFields(fields) }, currentDocument: { exists: false }, ...(updateTransforms.length ? { updateTransforms } : {}) };
}
export function updateWrite(name, fields, updateTransforms = []) {
  return { update: { name, fields: encodeFields(fields) }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { exists: true }, ...(updateTransforms.length ? { updateTransforms } : {}) };
}
export function createFirestore(env, injected) {
  const deps = dependencies(env, injected);
  const base = fsBase(env);
  const root = base.split('/artifacts/')[0];
  const name = (collection, id) => `${base.replace('https://firestore.googleapis.com/v1/', '')}/${collection}/${id}`;
  let token;
  async function request(url, body) {
    token ||= await getFirebaseIdToken(env, deps);
    const res = await deps.fetch(url, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error?.message || `Firestore request failed (${res.status})`), { status: res.status, code: data.error?.status });
    return data;
  }
  return {
    name,
    async listAll(collection) {
      const items = [];
      let pageToken;
      do {
        const data = await request(`${base}/${collection}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
        items.push(...(data.documents || []).map(doc => ({ ...fsDoc(doc), id: doc.name.split('/').at(-1) })));
        pageToken = data.nextPageToken;
      } while (pageToken);
      return items;
    },
    async runQuery(structuredQuery) {
      return (await request(`${base}:runQuery`, { structuredQuery })).filter(r => r.document).map(r => fsDoc(r.document));
    },
    // transaction แบบ optimistic: อ่านพร้อม updateTime → คำนวณ → commit ครั้งเดียวโดยผูกทุก
    // เอกสารที่อ่านไว้กับ updateTime นั้น ถ้ามีคนแก้ระหว่างทาง (เช่นขายของตัดสต็อก) Firestore
    // ตอบ FAILED_PRECONDITION แล้วทั้งชุดไม่ถูกเขียน → อ่านใหม่คิดใหม่ ผลเท่ากับ transaction จริง
    //
    // ไม่ใช้ :beginTransaction เพราะ REST ปฏิเสธ (PERMISSION_DENIED) เมื่อใช้ ID token ของพนักงาน
    // ตรวจกับระบบจริงแล้ว 2026-09-10 · commit ธรรมดาผ่าน rules ปกติ
    async runTransaction(build) {
      for (let attempt = 0; ; attempt++) {
        const versions = new Map();
        const writes = await build({ async getAll(names) {
          if (!names.length) return [];
          const rows = await request(`${root}:batchGet`, { documents: names });
          return names.map(n => {
            const doc = rows.find(r => r.found?.name === n)?.found;
            if (doc?.updateTime) versions.set(n, doc.updateTime);
            return doc ? { ...fsDoc(doc), id: n.split('/').at(-1) } : null;
          });
        } });
        const guarded = writes.map(w => (w.update && versions.has(w.update.name)
          ? { ...w, currentDocument: { updateTime: versions.get(w.update.name) } }
          : w));
        try {
          return await request(`${root}:commit`, { writes: guarded });
        } catch (error) {
          // ALREADY_EXISTS = รายจ่ายชุดนี้บันทึกไปแล้ว ส่งต่อให้ผู้เรียกตอบ "บันทึกไปแล้ว"
          if (error.code !== 'FAILED_PRECONDITION' || attempt >= 3) throw error;
        }
      }
    },
  };
}
