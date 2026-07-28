/**
 * audit-duplicate-members.mjs — ตรวจสมาชิกซ้ำ (ชื่อเดียวกัน) + สมาชิกที่ไม่มีเบอร์ (read-only)
 *   node scripts/audit-duplicate-members.mjs
 *
 * ไม่เขียนอะไรลง Firestore เลย — แค่รายงาน
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};
const APP_ID = 'siwara-pos-v1';

// เข้มกว่าในแอป (แอปใช้แค่ trim) — จับ "ฟ้า" vs "ฟ้า " vs "Fah" vs "fah" ได้ด้วย
const strictKey = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '');
const looseKey = (s) => String(s || '').trim();

const app = initializeApp(firebaseConfig);
await signInAnonymously(getAuth(app));
const db = getFirestore(app);
const base = ['artifacts', APP_ID, 'public', 'data'];

const [memberSnap, orderSnap] = await Promise.all([
  getDocs(collection(db, ...base, 'members')),
  getDocs(collection(db, ...base, 'orders')),
]);

const members = memberSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const orders = orderSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => o.status !== 'cancelled');

const fmtMember = (m) => {
  const phone = String(m.phone || '').trim();
  const pts = Number(m.points || 0);
  const pend = Number(m.pendingPoints || 0);
  const nOrders = orders.filter(o => (phone && o.memberPhone === phone) ||
    (!o.memberPhone && strictKey(o.memberNickname) === strictKey(m.name))).length;
  return `      · id=${m.id.padEnd(24)} ชื่อ="${m.name || ''}" เบอร์=${phone || '-'} แต้ม=${pts}${pend ? `(+${pend} รอ)` : ''} บิล=${nOrders}`;
};

console.log(`\n=== สมาชิกทั้งหมด ${members.length} รายการ · บิล ${orders.length} ใบ ===\n`);

// 1) ซ้ำแบบที่แอปมองเห็นอยู่แล้ว (trim อย่างเดียว)
const byLoose = new Map();
members.forEach(m => {
  const k = looseKey(m.name);
  if (!k) return;
  byLoose.set(k, [...(byLoose.get(k) || []), m]);
});
const dupLoose = [...byLoose.entries()].filter(([, a]) => a.length > 1);

// 2) ซ้ำแบบเข้ม (ตัวพิมพ์/ช่องว่างต่างกัน) — แอปยังจับไม่ได้
const byStrict = new Map();
members.forEach(m => {
  const k = strictKey(m.name);
  if (!k) return;
  byStrict.set(k, [...(byStrict.get(k) || []), m]);
});
const dupStrict = [...byStrict.entries()].filter(([, a]) => a.length > 1);

console.log(`[1] ซ้ำ (ชื่อตรงกันเป๊ะ) : ${dupLoose.length} กลุ่ม`);
dupLoose.forEach(([k, arr]) => {
  console.log(`   "${k}" → ${arr.length} รายการ`);
  arr.forEach(m => console.log(fmtMember(m)));
});

const extra = dupStrict.filter(([k]) => !dupLoose.some(([lk]) => strictKey(lk) === k));
console.log(`\n[2] ซ้ำเพิ่ม (ต่างแค่ตัวพิมพ์/ช่องว่าง — แอปยังไม่จับ) : ${extra.length} กลุ่ม`);
extra.forEach(([k, arr]) => {
  console.log(`   "${k}" → ${arr.length} รายการ`);
  arr.forEach(m => console.log(fmtMember(m)));
});

// 3) สมาชิกที่ไม่มีเบอร์
const noPhone = members.filter(m => !String(m.phone || '').trim());
const noPhonePoints = noPhone.reduce((s, m) => s + Number(m.points || 0) + Number(m.pendingPoints || 0), 0);
console.log(`\n[3] สมาชิกที่ "ไม่มีเบอร์" (doc id ขึ้นต้น name: หรือ phone ว่าง) : ${noPhone.length} รายการ · แต้มรวม ${noPhonePoints}`);
noPhone
  .sort((a, b) => (Number(b.points || 0) + Number(b.pendingPoints || 0)) - (Number(a.points || 0) + Number(a.pendingPoints || 0)))
  .forEach(m => console.log(fmtMember(m)));

// 4) ชื่อบนบิลที่ยังไม่มี doc สมาชิก (แถวผี name-only ในหน้าสมาชิก)
const nameOnly = new Map();
orders.filter(o => !o.memberPhone && o.memberNickname).forEach(o => {
  const k = strictKey(o.memberNickname);
  if (!k) return;
  if (members.some(m => strictKey(m.name) === k)) return;
  const cur = nameOnly.get(k) || { label: String(o.memberNickname).trim(), bills: 0, spent: 0 };
  cur.bills += 1;
  cur.spent += Number(o.total || 0);
  nameOnly.set(k, cur);
});
console.log(`\n[4] ชื่อบนบิลที่ยังไม่มี doc สมาชิก (โผล่ในหน้าสมาชิกแต่ไม่มีบัญชีจริง) : ${nameOnly.size} ชื่อ`);
[...nameOnly.values()].sort((a, b) => b.bills - a.bills)
  .forEach(v => console.log(`      · "${v.label}" บิล=${v.bills} ยอด=฿${v.spent.toLocaleString()}`));

// 5) สรุป
const withPhone = members.length - noPhone.length;
console.log(`\n=== สรุป ===`);
console.log(`   สมาชิกมีเบอร์      : ${withPhone}`);
console.log(`   สมาชิกไม่มีเบอร์   : ${noPhone.length}  (ตามนโยบายใหม่ = ไม่ควรเป็นสมาชิก)`);
console.log(`   ชื่อผีจากบิล       : ${nameOnly.size}`);
console.log(`   กลุ่มซ้ำที่ต้องจัดการ: ${dupLoose.length + extra.length}\n`);

process.exit(0);
