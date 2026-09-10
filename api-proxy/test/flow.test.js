/* global Buffer */
import { it, expect } from 'vitest';
import { createFirestore, fsDoc } from '../src/firestore.js';
import { resolveLines, preview, confirmBatch, validPending } from '../src/telegram/flow.js';
import { env, harness, NOW } from './helpers.js';
const stock = { id: 'milk', name: 'นม', quantity: 1000, unit: 'กรัม', unitCost: 0.1, category: 'นมและผลิตภัณฑ์นม' };
const line = (extra = {}) => ({ title: 'นม', quantity: 1, unit: 'kg', amount: 200, category: stock.category, ...extra });
const pending = lines => ({ v: 2, batchId: 'abc12345', source: 'manual', lines });
it('snapshots two lines folded against fresh stock in one commit', async () => {
  const p = resolveLines(pending([line(), line({ amount: 300 })]), [stock]);
  const deps = harness([{ ...stock, quantity: 2000 }]);
  await confirmBatch(createFirestore(env, deps), p, { id: 7, first_name: 'Staff' }, NOW);
  expect(deps.commits).toHaveLength(1);
  expect(deps.commits[0]).toMatchSnapshot();
  const update = deps.commits[0].writes.at(-1);
  expect(fsDoc(update.update).unitCost).toBe(0.175);
  expect(update.updateTransforms[0].increment.integerValue).toBe('2000');
});
it('snapshots a deterministic new stock create', async () => {
  const p = resolveLines(pending([line({ title: 'นมใหม่', pick: 'new' })]), []), deps = harness();
  await confirmBatch(createFirestore(env, deps), p, { id: 7 }, NOW);
  expect(deps.commits[0]).toMatchSnapshot();
  expect(fsDoc(deps.commits[0].writes[0].update).stockId).toBe('tg_abc12345_s0');
});
it('snapshots remembered alias using appendMissingElements', async () => {
  const p = resolveLines(pending([line({ unit: 'ขวด', stockId: 'milk', alias: { title: 'นม', barcode: '885', unit: 'ขวด', toBase: 1000 }, rememberAlias: true })]), [stock]), deps = harness([stock]);
  await confirmBatch(createFirestore(env, deps), p, { id: 7 }, NOW);
  expect(deps.commits[0]).toMatchSnapshot();
});
it('snapshots non-inventory expense without stock writes', async () => {
  const p = resolveLines(pending([line({ title: 'ค่าไฟ', category: 'ค่าไฟ', quantity: 1, unit: 'ครั้ง', amount: 400.00000000004 })]), []), deps = harness();
  await confirmBatch(createFirestore(env, deps), p, { id: 7 }, NOW);
  expect(deps.commits[0]).toMatchSnapshot();
  expect(deps.commits[0].writes).toHaveLength(1);
  expect(deps.calls.some(c => c.url.endsWith(':batchGet'))).toBe(false);
});
it('resolves barcode before conflicting title alias', () => {
  const p = resolveLines(pending([line({ barcode: '885' })]), [{ ...stock, id: 'wrong', purchaseAliases: [{ title: 'นม', toBase: 1 }] }, { ...stock, id: 'right', purchaseAliases: [{ barcode: '885', toBase: 1000 }] }]);
  expect(p.lines[0].stockId).toBe('right');
});
it('first unresolved category blocks confirm and escapes every dynamic preview field', () => {
  const p = resolveLines(pending([line({ title: '<bad>', category: null }), line({ title: 'unknown' })]), [stock]);
  const view = preview(p, NOW);
  expect(view.text).toContain('&lt;bad&gt;');
  expect(view.keyboard.flat().every(b => b.callback_data.startsWith('k:') || b.callback_data.startsWith('x:'))).toBe(true);
  expect(view.keyboard.slice(0, -1).every(row => row.length <= 2)).toBe(true);
  expect(view.keyboard.flat().every(b => Buffer.byteLength(b.callback_data) <= 64)).toBe(true);
});
it('unit mismatch prompts factor; explicit skip does not move stock', () => {
  const p = resolveLines(pending([line({ unit: 'ขวด' })]), [stock]);
  expect(preview(p, NOW).text).toContain('1 ขวด = กี่ กรัม? ตอบเป็นตัวเลข');
  expect(p.awaiting).toEqual({ kind: 'factor', lineIdx: 0 });
  p.lines[0].pick = 'skip'; resolveLines(p, [stock]);
  expect(preview(p, NOW).text).toContain('→ ไม่ลงสต๊อก');
});
it('shows receipt date, mismatch warning and recheck', () => {
  const p = resolveLines({ ...pending([line({ pick: 'skip' })]), source: 'receipt', receiptDate: '2026-09-09', total: 250 }, []);
  const view = preview(p, NOW);
  expect(view.text).toContain('วันที่ใบเสร็จ: 2026-09-09');
  expect(view.text).toContain('ยอดรวมรายการไม่ตรง');
  expect(view.keyboard.flat().some(b => b.callback_data === 'r:abc12345')).toBe(true);
});
it('rejects old pending and missing stock without committing', async () => {
  expect(validPending([{ title: 'old' }])).toBe(false);
  const p = resolveLines(pending([line()]), [stock]), deps = harness();
  await expect(confirmBatch(createFirestore(env, deps), p, {}, NOW)).rejects.toThrow('สต็อกถูกลบ');
  expect(deps.commits).toHaveLength(0);
});
