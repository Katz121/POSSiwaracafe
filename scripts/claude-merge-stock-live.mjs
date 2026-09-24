/**
 * claude-merge-stock-live.mjs — รวมวัตถุดิบซ้ำบนระบบจริง ด้วย logic เดียวกับปุ่ม "รวมรายการซ้ำ" ในแอป
 *   STAFF_PASSWORD=... npx tsx scripts/claude-merge-stock-live.mjs            (dry-run + สำรองข้อมูล)
 *   STAFF_PASSWORD=... APPLY=1 npx tsx scripts/claude-merge-stock-live.mjs    (เขียนจริง)
 * คู่ที่รวม = PAIRS ด้านล่าง (ชื่อที่เก็บ ← ชื่อที่รวมเข้า) · ทุกคู่เป็นทรานแซกชันแยก อ่านสดก่อนเขียน
 * แก้หน่วยสะกดผิด (planUnitFixes) ก่อน เพื่อให้คู่ กรัม/กรัท รวมกันได้
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, runTransaction, writeBatch } from 'firebase/firestore';
import { planMerge, planUnitFixes } from '../src/utils/stockMerge.js';

const PAIRS = [
  ['ไข่ไก่', 'ไขไก่'], ['แครกเกอร์', 'แคร็กเกอร์'], ['เชอรี่', 'เขอรี่'], ['ไซรัปคาราเมล', 'ไซรัปคาราเมล'],
  ['ไซรัปพีช', 'ไซรัปพีท'], ['ไซรัปสตอเบอรี่', 'ไซรัปสอตเบอรี่'], ['ทิชชู่ตั้งโต๊ะ', 'ทิชชูตั้งโต๊ะ'], ['น้ำดื่ม', 'น้ำดื้ม'],
  ['น้ำตาลเบเกอรี่', 'น้ำตาลทรายเบเกอรี่'], ['น้ำมันรำข้าว', 'น้ำมันีำข้าว'], ['แป้งกวนไส้', 'แป้งกวนใส้'], ['แป้งเค้ก', 'แปเงเค้ก'],
  ['วิปปิ้งครีม กล่องเหลือง', 'วิปครีม กล่องเหลือง'],
];
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)
  .map(l => l.match(/^\s*([\w.]+)\s*=\s*(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim().replace(/^["']|["']$/g, '')]));
const app = initializeApp({ apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID });
await signInWithEmailAndPassword(getAuth(app), 'siwara@staff.siwara.local', process.env.STAFF_PASSWORD || '');
const db = getFirestore(app);
const base = ['artifacts', 'siwara-pos-v1', 'public', 'data'];
const APPLY = process.env.APPLY === '1';
const load = async (c) => (await getDocs(collection(db, ...base, c))).docs.map(d => ({ id: d.id, ...d.data() }));

let stock = await load('stock'); let menu = await load('menu'); let beanModifiers = await load('beanModifiers');
mkdirSync(new URL('../.claude/backup/', import.meta.url), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
writeFileSync(new URL(`../.claude/backup/stock-menu-${stamp}.json`, import.meta.url), JSON.stringify({ stock, menu, beanModifiers }));
console.log('backup saved', stamp);

const fixes = planUnitFixes(stock);
console.log('unit fixes:', fixes.map(f => `${f.name}: ${f.from}→${f.to}`).join(', ') || 'none');
if (APPLY && fixes.length) {
  const b = writeBatch(db); fixes.forEach(f => b.update(doc(db, ...base, 'stock', f.id), { unit: f.to })); await b.commit();
  stock = await load('stock');
}

const live = () => stock.filter(s => !s.mergedInto && !s.archived);
for (const [keepName, fromName] of PAIRS) {
  const cands = live().filter(s => s.name.trim() === keepName.trim());
  let keep; let from;
  if (keepName === fromName) { // ชื่อซ้ำเป๊ะ · เก็บตัวที่มีของเยอะกว่า
    const sorted = [...cands].sort((a, b) => (b.quantity || 0) - (a.quantity || 0));
    [keep, from] = sorted;
  } else { keep = cands[0]; from = live().find(s => s.name.trim() === fromName.trim()); }
  if (!keep || !from) { console.log(`SKIP ${keepName} ← ${fromName}: not found`); continue; }
  const draft = planMerge({ keepId: keep.id, mergeIds: [from.id], stock, menu, beanModifiers });
  if (!draft.ok) { console.log(`SKIP ${keepName} ← ${fromName}: ${draft.error}`); continue; }
  console.log(`${keepName}(${keep.quantity}) ← ${fromName}(${from.quantity}) → q=${draft.keep.update.quantity} cost=${Number(draft.keep.update.unitCost).toFixed(4)} · menu ${draft.menuUpdates.length} · mods ${draft.modifierUpdates.length} · recipes ${draft.recipeUpdates.length}`);
  if (!APPLY) continue;
  await runTransaction(db, async (tx) => {
    const read = async (col, id) => { const s = await tx.get(doc(db, ...base, col, id)); return s.exists() ? { id, ...s.data() } : null; };
    const fs = new Map(); for (const id of [keep.id, from.id, ...draft.chains.map(c => c.id), ...draft.recipeUpdates.map(r => r.id)]) if (!fs.has(id)) fs.set(id, await read('stock', id));
    const fm = new Map(); for (const u of draft.menuUpdates) fm.set(u.id, await read('menu', u.id));
    const fb = new Map(); for (const u of draft.modifierUpdates) fb.set(u.id, await read('beanModifiers', u.id));
    const swap = (list, f) => list.map(x => (f.has(x.id) ? f.get(x.id) : x)).filter(Boolean);
    const plan = planMerge({ keepId: keep.id, mergeIds: [from.id], stock: swap(stock, fs), menu: swap(menu, fm), beanModifiers: swap(beanModifiers, fb) });
    if (!plan.ok) throw new Error(plan.error);
    const at = new Date().toISOString();
    tx.update(doc(db, ...base, 'stock', keep.id), plan.keep.update);
    plan.merged.forEach(m => tx.update(doc(db, ...base, 'stock', m.id), { ...m.update, mergedAt: at, mergedBy: 'siwara@staff.siwara.local' }));
    plan.chains.forEach(c => tx.update(doc(db, ...base, 'stock', c.id), { mergedInto: c.mergedInto }));
    plan.recipeUpdates.forEach(r => tx.update(doc(db, ...base, 'stock', r.id), { recipe: r.recipe }));
    plan.menuUpdates.forEach(u => tx.update(doc(db, ...base, 'menu', u.id), { stockLinks: u.stockLinks }));
    plan.modifierUpdates.forEach(u => tx.update(doc(db, ...base, 'beanModifiers', u.id), { stockLinks: u.stockLinks }));
  });
  stock = await load('stock'); menu = await load('menu'); beanModifiers = await load('beanModifiers');
}
console.log(APPLY ? 'applied' : 'dry-run · APPLY=1 to write');
process.exit(0);
