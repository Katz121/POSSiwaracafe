/**
 * claude-snapshot-readonly.mjs — ดึงข้อมูล Firestore จริงมาเก็บในเครื่องแบบอ่านอย่างเดียว
 *   STAFF_ID=siwara STAFF_PASSWORD=... node scripts/claude-snapshot-readonly.mjs
 * เขียนไฟล์ .claude/snapshot/{date}.json (อยู่ใน .gitignore · มีเบอร์โทรสมาชิก ห้าม commit)
 * ไม่เขียนอะไรลง Firestore เลย · ใช้ seed ให้ emulator ทดสอบ UI/Lighthouse โดยไม่แตะระบบจริง
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';

function loadEnv() {
  const env = {};
  for (const file of ['.env', '.env.production', '.env.local']) {
    try {
      const txt = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        env[m[1]] = v;
      }
    } catch { /* skip */ }
  }
  return env;
}
const env = loadEnv();
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID,
});
const staffId = process.env.STAFF_ID || 'siwara';
await signInWithEmailAndPassword(getAuth(app), `${staffId}@staff.siwara.local`, process.env.STAFF_PASSWORD || '');
const db = getFirestore(app);
const base = ['artifacts', 'siwara-pos-v1', 'public', 'data'];
const cols = (process.env.COLS || 'orders,members,menu,categories,stock,expenses,quickExpenses,beanModifiers,recipes,settings,cakeOrders,qrFunnel').split(',');
const out = {};
for (const c of cols) {
  try {
    const s = await getDocs(collection(db, ...base, c));
    out[c] = s.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log(c.padEnd(16), s.size);
  } catch (e) { console.log(c.padEnd(16), 'skip', e.code); }
}
mkdirSync(new URL('../.claude/snapshot/', import.meta.url), { recursive: true });
const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
const file = new URL(`../.claude/snapshot/${date}.json`, import.meta.url);
writeFileSync(file, JSON.stringify(out, (k, v) => (v && typeof v === 'object' && typeof v.toDate === 'function') ? { __ts: v.toDate().toISOString() } : v));
console.log('saved', file.pathname);
process.exit(0);
