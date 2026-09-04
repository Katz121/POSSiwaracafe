/**
 * claude-inventory-firestore.mjs — สำรวจว่าใน Firestore มีอะไรอยู่บ้าง (read-only)
 *   node scripts/claude-inventory-firestore.mjs
 * ไม่เขียนอะไรลง Firestore เลย
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
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
  projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
});
console.log('project:', env.VITE_FIREBASE_PROJECT_ID);
await signInAnonymously(getAuth(app));
const db = getFirestore(app);
const APP_ID = 'siwara-pos-v1';
const base = ['artifacts', APP_ID, 'public', 'data'];

const cols = ['orders','members','menu','categories','stock','expenses','quickExpenses','beanModifiers'];
const snaps = {};
let bytes = 0;
for (const c of cols) {
  const s = await getDocs(collection(db, ...base, c));
  snaps[c] = s.docs.map(d => ({ id: d.id, ...d.data() }));
  const j = JSON.stringify(snaps[c]).length;
  bytes += j;
  console.log(`${c.padEnd(16)} ${String(s.size).padStart(6)} docs   ~${(j/1024).toFixed(0)} KB`);
}
console.log('TOTAL'.padEnd(16), `~${(bytes/1024/1024).toFixed(2)} MB ต่อการเปิดแอป 1 ครั้ง`);

// config docs
for (const d of ['settings','queue','publicMenu']) {
  const s = await getDoc(doc(db, ...base, 'config', d));
  const size = s.exists() ? JSON.stringify(s.data()).length : 0;
  console.log(`config/${d}`.padEnd(16), s.exists() ? `มี  ~${(size/1024).toFixed(1)} KB  fields: ${Object.keys(s.data()).length}` : 'ไม่มี');
}

// orders breakdown
const o = snaps.orders;
const byStatus = {};
for (const x of o) byStatus[x.status||'(ไม่ระบุ)'] = (byStatus[x.status||'(ไม่ระบุ)']||0)+1;
console.log('\nออเดอร์แยกตามสถานะ:', byStatus);
const dates = o.map(x => (x.createdAt?.toDate ? x.createdAt.toDate() : new Date(x.date||x.timestamp||0))).filter(d=>!isNaN(d)&&d.getFullYear()>2000).sort((a,b)=>a-b);
if (dates.length) console.log('ช่วงเวลาออเดอร์:', dates[0].toISOString().slice(0,10), '→', dates[dates.length-1].toISOString().slice(0,10));
const rev = o.filter(x=>x.status==='completed').reduce((s,x)=>s+(Number(x.total)||0),0);
console.log('ยอดรวมบิลที่ completed ทั้งหมด: ฿' + rev.toLocaleString());

// members
const m = snaps.members;
console.log('\nสมาชิก: ทั้งหมด', m.length,
  '· มีเบอร์', m.filter(x=>String(x.phone||'').trim()).length,
  '· ไม่มีเบอร์', m.filter(x=>!String(x.phone||'').trim()).length,
  '· แต้มรวม', m.reduce((s,x)=>s+(Number(x.points)||0),0).toLocaleString());

// menu
console.log('เมนู:', snaps.menu.length, 'รายการ · หมวด', snaps.categories.length,
  '· เมล็ด/ตัวเลือก', snaps.beanModifiers.length, '· สต็อก', snaps.stock.length, 'รายการ');
console.log('รายจ่าย:', snaps.expenses.length, 'รายการ · quickExpenses', snaps.quickExpenses.length);
process.exit(0);
