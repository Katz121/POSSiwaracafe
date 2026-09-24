/**
 * claude-strip-order-images.mjs — ลบรูป base64 (data:...) ที่ฝังอยู่ใน items[].image ของบิลเก่า
 *   STAFF_PASSWORD=... node scripts/claude-strip-order-images.mjs          (dry-run: สำรอง + นับ ไม่เขียน)
 *   STAFF_PASSWORD=... APPLY=1 node scripts/claude-strip-order-images.mjs  (เขียนจริง)
 * สำรองบิลทั้งหมด (รวมรูป) ไว้ .claude/backup/orders-{เวลา}.json ก่อนเสมอ
 * แก้เฉพาะฟิลด์ items ผ่านทรานแซกชันทีละบิล · รูปที่เป็น URL (R2) ไม่แตะ · ฟิลด์อื่นไม่แตะ
 * เหตุผล: บิล ม.ค.-มิ.ย. 2026 ฝังรูป ~54 MB ทำให้เปิดแอปเครื่องใหม่โหลด ~59 MB และค้างหลังรีโหลด
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, runTransaction } from 'firebase/firestore';

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)
  .map(l => l.match(/^\s*([\w.]+)\s*=\s*(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim().replace(/^["']|["']$/g, '')]));
const app = initializeApp({ apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID });
await signInWithEmailAndPassword(getAuth(app), `${process.env.STAFF_ID || 'siwara'}@staff.siwara.local`, process.env.STAFF_PASSWORD || '');
const db = getFirestore(app);
const base = ['artifacts', 'siwara-pos-v1', 'public', 'data', 'orders'];
const APPLY = process.env.APPLY === '1';

const isInline = (v) => typeof v === 'string' && v.startsWith('data:');
const strip = (items) => items.map((it) => {
  if (!it || !isInline(it.image)) return it;
  const { image: _drop, ...rest } = it;
  return rest;
});

const snap = await getDocs(collection(db, ...base));
const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
mkdirSync(new URL('../.claude/backup/', import.meta.url), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = new URL(`../.claude/backup/orders-${stamp}.json`, import.meta.url);
writeFileSync(backup, JSON.stringify(all));
const targets = all.filter((o) => (o.items || []).some((it) => isInline(it?.image)));
const bytes = targets.reduce((s, o) => s + (o.items || []).reduce((t, it) => t + (isInline(it?.image) ? it.image.length : 0), 0), 0);
console.log(`orders ${all.length} · backup ${backup.pathname}`);
console.log(`to clean ${targets.length} orders · inline images ${(bytes / 1048576).toFixed(1)} MB · dates ${targets.map(o => o.date).sort()[0]} → ${targets.map(o => o.date).sort().pop()}`);
if (!APPLY) { console.log('dry-run · set APPLY=1 to write'); process.exit(0); }

let done = 0; let skipped = 0;
for (const o of targets) {
  const ref = doc(db, ...base, o.id);
  await runTransaction(db, async (tx) => {
    const cur = await tx.get(ref);
    if (!cur.exists()) { skipped++; return; }
    const items = cur.data().items || [];
    if (!items.some((it) => isInline(it?.image))) { skipped++; return; }
    tx.update(ref, { items: strip(items) });
    done++;
  });
  if (done % 100 === 0) console.log('...', done);
}
console.log(`cleaned ${done} · skipped ${skipped}`);
process.exit(0);
