/**
 * audit-member.mjs — ดูประวัติแต้มทั้งหมดของสมาชิก 1 คน + คำนวณยอดที่ควรเป็น (read-only)
 *   node scripts/audit-member.mjs 0954288065
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
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};
const APP_ID = 'siwara-pos-v1';
const PHONE = process.argv[2];
if (!PHONE) { console.error('ใส่เบอร์: node scripts/audit-member.mjs <phone>'); process.exit(1); }

const getNameKey = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '');
const toMs = (v) => v && typeof v === 'object' && v.seconds != null ? v.seconds * 1000 : (new Date(v).getTime() || 0);
const fmt = (ms) => ms ? new Date(ms).toLocaleString('th-TH') : '-';

async function main() {
  const app = initializeApp(firebaseConfig);
  await signInAnonymously(getAuth(app));
  const db = getFirestore(app);
  const base = ['artifacts', APP_ID, 'public', 'data'];

  let threshold = 50;
  try {
    const cfg = await getDoc(doc(db, ...base, 'config', 'settings'));
    if (cfg.exists()) threshold = Number(cfg.data().redeemPointsThreshold) || threshold;
  } catch { /* default */ }

  const memberSnap = await getDoc(doc(db, ...base, 'members', PHONE));
  if (!memberSnap.exists()) { console.error('ไม่พบสมาชิกเบอร์นี้'); process.exit(1); }
  const m = { id: memberSnap.id, ...memberSnap.data() };
  const nameKey = getNameKey(m.name);

  const ordersSnap = await getDocs(collection(db, ...base, 'orders'));
  const orders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((o) => (o.memberPhone === PHONE) || (!o.memberPhone && nameKey && getNameKey(o.memberNickname) === nameKey))
    .sort((a, b) => (toMs(a.createdAt) || toMs(a.date)) - (toMs(b.createdAt) || toMs(b.date)));

  const history = (Array.isArray(m.pointsHistory) ? m.pointsHistory : []).slice().sort((a, b) => toMs(a.at) - toMs(b.at));

  console.log(`\n=== ${m.name} [${PHONE}] | แต้มปัจจุบัน=${Number(m.points || 0)} | รออนุมัติ=${Number(m.pendingPoints || 0)} | เกณฑ์แลก=${threshold} ===\n`);

  const earnedAll = orders.reduce((s, o) => s + Math.floor(Number(o.total || 0) / 10), 0);
  const byReason = {};
  for (const h of history) byReason[h.reason || '-'] = (byReason[h.reason || '-'] || 0) + Number(h.delta || 0);

  console.log('── ประวัติแต้มทั้งหมด ──');
  for (const h of history) console.log(`  ${fmt(toMs(h.at))}  ${Number(h.delta) >= 0 ? '+' : ''}${Number(h.delta)}  (${h.reason || '-'})`);
  console.log('\n── รวม delta ตามประเภท (เฉพาะที่ถูกบันทึก history) ──');
  for (const [r, v] of Object.entries(byReason)) console.log(`  ${r}: ${v >= 0 ? '+' : ''}${v}`);

  console.log(`\n── ออเดอร์ทั้งหมด ${orders.length} ใบ ──`);
  let maybeRedeem = 0;
  for (const o of orders) {
    const flag = Number(o.discount || 0) >= threshold ? ' ❓อาจแลกแต้ม' : '';
    if (flag) maybeRedeem++;
    console.log(`  ${fmt(toMs(o.createdAt) || toMs(o.date))}  ฿${Number(o.total || 0)}  ส่วนลด฿${Number(o.discount || 0)}  earn+${Math.floor(Number(o.total || 0) / 10)}  [${o.status}]${flag}`);
  }

  const recalcSum = byReason['recalc'] || 0;
  const redeemHistCount = history.filter((h) => h.reason === 'redeem').length;
  const redeemHistSum = byReason['redeem'] || 0;
  const reviewSum = byReason['review'] || 0;
  const manualSum = byReason['manual'] || 0;

  console.log('\n══════════ สรุปการคำนวณยอดที่ควรเป็น ══════════');
  console.log(`  แต้มที่ได้จากยอดซื้อทั้งหมด (Σ floor(total/10))   = +${earnedAll}`);
  console.log(`  แลกแต้มที่บันทึกใน history                        = ${redeemHistSum} (${redeemHistCount} ครั้ง)`);
  console.log(`  ออเดอร์ที่ "อาจแลกแต้ม" (ส่วนลด≥${threshold})              = ${maybeRedeem} ใบ`);
  console.log(`  manual (เจ้าของปรับเอง)                          = ${manualSum >= 0 ? '+' : ''}${manualSum}`);
  console.log(`  review                                           = ${reviewSum >= 0 ? '+' : ''}${reviewSum}`);
  console.log(`  recalc (บั๊ก ต้องตัดทิ้ง)                          = +${recalcSum}`);

  // วิธี A: เริ่มจากแต้มที่ได้จริง - แลกแต้ม (นับจาก history) + review + manual
  const candA = earnedAll + redeemHistSum + reviewSum + manualSum;
  // วิธี B: เหมือน A แต่ถือว่าทุกออเดอร์ที่ส่วนลด≥เกณฑ์ = แลกแต้ม 1 ครั้ง (ครอบคลุม POS ที่ไม่ log)
  const candB = earnedAll - (maybeRedeem * threshold) + reviewSum + manualSum;

  console.log('\n  👉 ยอดที่ควรเป็น (วิธี A: earned + redeem(history) + review + manual) =', candA);
  console.log('  👉 ยอดที่ควรเป็น (วิธี B: earned - แลกตามจำนวนออเดอร์ส่วนลด≥เกณฑ์ + review + manual) =', candB);
  console.log('\n  (ปัจจุบัน =', Number(m.points || 0), ')');
  process.exit(0);
}
main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
