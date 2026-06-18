/**
 * backfill-soldcount.mjs — คำนวณ soldCount ของทุกเมนูจากออเดอร์ทั้งหมด (เขียนข้อมูลจริง)
 * ทำให้หน้า QR เรียงเมนูตามความนิยมได้ถูกต้องทันที (เทียบเท่าปุ่ม "คำนวณยอดขายย้อนหลัง" ในหน้าผู้ดูแล)
 *   node scripts/backfill-soldcount.mjs
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';

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
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});
const APP_ID = 'siwara-pos-v1';

async function main() {
  await signInAnonymously(getAuth(app));
  const db = getFirestore(app);
  const base = ['artifacts', APP_ID, 'public', 'data'];

  const [menuSnap, ordersSnap] = await Promise.all([
    getDocs(collection(db, ...base, 'menu')),
    getDocs(collection(db, ...base, 'orders')),
  ]);
  const menu = menuSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const orders = ordersSnap.docs.map((d) => d.data());

  const totals = {};
  for (const o of orders) {
    if (o.status === 'cancelled') continue;
    for (const it of o.items || []) {
      const id = it && it.id;
      const qty = Number(it && it.quantity) || 0;
      if (!id || qty <= 0) continue;
      totals[id] = (totals[id] || 0) + qty;
    }
  }

  const results = await Promise.allSettled(
    menu.map((m) => updateDoc(doc(db, ...base, 'menu', m.id), { soldCount: totals[m.id] || 0 })),
  );
  const ok = results.filter((r) => r.status === 'fulfilled').length;

  const top = menu.map((m) => ({ name: m.name, sold: totals[m.id] || 0 }))
    .sort((a, b) => b.sold - a.sold).slice(0, 15);
  console.log(`✅ อัปเดต soldCount ${ok}/${menu.length} เมนู`);
  console.log('\n15 อันดับขายดี:');
  top.forEach((t, i) => console.log(`  ${i + 1}. ${t.name} — ${t.sold}`));
  process.exit(0);
}
main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
