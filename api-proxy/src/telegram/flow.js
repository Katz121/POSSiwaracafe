import { EXPENSE_CATEGORIES, STOCK_CATEGORIES, DEFAULT_MIN_QUANTITY, inferStockCategory } from '../../../src/config/constants.js';
import { isInventoryCategory, findAliasMatch, findStockCandidates, normalizeName, normalizeUnit, planStockIntake, applyIntakesSequentially, buildExpenseRecord, roundMoney } from '../../../src/utils/stockIntake.js';
import { createWrite, updateWrite, serverTime, increment, appendMissingElements } from '../firestore.js';
import { escapeTelegramHtml as h } from './api.js';
import { expenseDate } from './parse.js';

export const PENDING_KEY = '__expense_pending:';
export const validPending = p => p?.v === 2 && /^[a-z0-9]{8}$/.test(p.batchId) && Array.isArray(p.lines) && p.lines.length > 0;
export function newPending(lines, source = 'manual', extra = {}) {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return { ...extra, v: 2, batchId: Array.from(bytes, n => (n % 36).toString(36)).join(''), source, lines };
}
const newStock = (pending, line, i) => ({ id: `tg_${pending.batchId}_s${i}`, name: line.title, category: STOCK_CATEGORIES.includes(line.category) ? line.category : inferStockCategory(line.title), quantity: 0, unit: normalizeUnit(line.unit), minQuantity: DEFAULT_MIN_QUANTITY, unitCost: 0 });
const usablePlan = plan => plan.ok && Number.isFinite(plan.inQty) && plan.inQty > 0 && Number.isFinite(plan.newUnitCost);

export function resolveLines(pending, stocks) {
  const running = new Map(stocks.map(s => [s.id, { ...s }]));
  for (const [i, line] of pending.lines.entries()) {
    delete line.plan;
    delete line.unresolved;
    if (!EXPENSE_CATEGORIES.includes(line.category)) { line.unresolved = 'category'; continue; }
    if (!isInventoryCategory(line.category) || line.pick === 'skip') continue;
    let stock;
    if (line.pick === 'new') stock = newStock(pending, line, i);
    else if (line.stockId) stock = running.get(line.stockId);
    else {
      // ค้นบาร์โค้ดแยกก่อน เพื่อไม่ให้ชื่อ alias ที่อยู่ก่อนหน้าบังบาร์โค้ดจริง
      const match = (line.barcode && findAliasMatch(stocks, { barcode: line.barcode })) || findAliasMatch(stocks, { title: line.title });
      const candidates = findStockCandidates(stocks, line.title);
      line.candidates = candidates.map(s => ({ id: s.id, name: s.name }));
      if (match) { stock = running.get(match.stock.id); line.alias = match.alias; }
      else if (candidates[0] && normalizeName(candidates[0].name) === normalizeName(line.title)) stock = running.get(candidates[0].id);
    }
    if (!stock) { line.unresolved = 'stock'; line.candidates = findStockCandidates(stocks, line.title).map(s => ({ id: s.id, name: s.name })); continue; }
    line.stockId = stock.id;
    line.stockName = stock.name;
    line.stockUnit = stock.unit;
    line.plan = planStockIntake(line, stock, line.alias);
    if (!usablePlan(line.plan)) line.unresolved = 'factor';
    else running.set(stock.id, { ...stock, quantity: line.plan.newQuantity, unitCost: line.plan.newUnitCost });
  }
  return pending;
}

export function preview(pending, now) {
  delete pending.awaiting;
  const texts = [pending.source === 'receipt' ? '🧾 <b>ตรวจสอบใบเสร็จก่อนบันทึก</b>' : '📝 <b>ตรวจสอบรายจ่ายก่อนบันทึก</b>'];
  if (pending.source === 'receipt') texts.push(`วันที่ใบเสร็จ: ${h(pending.receiptDate || 'ไม่ระบุ')} · วันที่บันทึก: ${h(expenseDate(pending.receiptDate, now))}`);
  pending.lines.forEach((line, i) => {
    texts.push(`\n<b>${i + 1}. ${h(line.title)}</b>`, `${h(line.quantity)} ${h(line.unit)} · ฿${h(line.amount)} · ${h(line.category || 'ยังไม่เลือกหมวด')}`);
    if (line.unresolved) texts.push(`⚠️ ต้องเลือก ${line.unresolved === 'category' ? 'หมวดหมู่' : line.unresolved === 'stock' ? 'สต็อก' : 'อัตราแปลงหน่วย'}`);
    else if (line.plan) texts.push(`→ ลงสต๊อก ${h(line.stockName)} +${h(line.plan.inQty)} ${h(line.plan.stockUnit)} · ต้นทุนเฉลี่ยใหม่ ฿${h(line.plan.newUnitCost)}/${h(line.plan.stockUnit)}`);
    else texts.push('→ ไม่ลงสต๊อก');
  });
  const total = roundMoney(pending.lines.reduce((sum, l) => sum + l.amount, 0));
  texts.push(`\nรวมทั้งหมด: ฿${h(total)}`);
  if (pending.total != null && Math.abs(total - pending.total) > 1) texts.push(`⚠️ ยอดรวมรายการไม่ตรงกับใบเสร็จ (฿${h(pending.total)})`);
  const bid = pending.batchId;
  const button = (text, data) => ({ text, callback_data: data });
  const cancel = [button('ยกเลิก', `x:${bid}`)];
  let keyboard = [];
  const i = pending.lines.findIndex(l => l.unresolved);
  if (i >= 0) {
    const line = pending.lines[i];
    if (line.unresolved === 'category') {
      for (let n = 0; n < EXPENSE_CATEGORIES.length; n += 2) keyboard.push(EXPENSE_CATEGORIES.slice(n, n + 2).map((cat, j) => button(cat, `k:${bid}:${i}:${n + j}`)));
    } else if (line.unresolved === 'stock') {
      keyboard = (line.candidates || []).map((s, n) => [button(s.name, `s:${bid}:${i}:${n}`)]);
      keyboard.push([button('➕ สร้างสต็อกใหม่', `s:${bid}:${i}:new`), button('ไม่ลงสต๊อก', `s:${bid}:${i}:skip`)]);
    } else {
      pending.awaiting = { kind: 'factor', lineIdx: i };
      texts.push(`1 ${h(line.unit)} = กี่ ${h(line.stockUnit)}? ตอบเป็นตัวเลข`);
    }
  } else {
    keyboard = [[button('✅ ยืนยันบันทึก', `c:${bid}`), button('✏️ แก้ไข', `e:${bid}`)]];
    if (pending.source === 'receipt') keyboard.push([button('🔎 รีเชคด้วย AI', `r:${bid}`)]);
  }
  keyboard.push(cancel);
  return { text: texts.join('\n'), keyboard };
}

export async function confirmBatch(db, pending, user, now) {
  if (!validPending(pending) || pending.lines.some(l => l.unresolved || !EXPENSE_CATEGORIES.includes(l.category))) throw new Error('ยังมีรายการที่ต้องเลือก');
  let moves = [];
  await db.runTransaction(async tx => {
    const grouped = new Map();
    pending.lines.forEach((l, i) => {
      if (!isInventoryCategory(l.category) || l.pick === 'skip') return;
      const id = l.pick === 'new' ? `tg_${pending.batchId}_s${i}` : l.stockId;
      if (!id) throw new Error('ยังไม่ได้เลือกสต็อก');
      if (!grouped.has(id)) grouped.set(id, []);
      grouped.get(id).push({ ...l, index: i });
    });
    const existing = [...grouped].filter(([, lines]) => lines[0].pick !== 'new');
    const fresh = await tx.getAll(existing.map(([id]) => db.name('stock', id)));
    const stocks = new Map(existing.map(([id], i) => [id, fresh[i]]));
    const plans = new Map(), writes = [];
    moves = [];
    for (const [id, lines] of grouped) {
      const isNew = lines[0].pick === 'new';
      const stock = isNew ? newStock(pending, lines[0], lines[0].index) : stocks.get(id);
      if (!stock) throw new Error('สต็อกถูกลบแล้ว กรุณาส่งรายการใหม่');
      const result = applyIntakesSequentially(stock, lines);
      if (result.plans.some(p => !usablePlan(p))) throw new Error('หน่วยสต็อกเปลี่ยน กรุณาตรวจสอบใหม่');
      result.plans.forEach((p, i) => plans.set(lines[i].index, p));
      const quantity = result.plans.reduce((s, p) => s + p.inQty, 0);
      const fields = { unitCost: result.final.unitCost, lastPurchaseUnitCost: result.plans.at(-1).inUnitCost };
      const transforms = [serverTime('lastPurchaseAt')];
      const aliases = lines.filter(l => l.rememberAlias).map(l => l.alias);
      if (aliases.length) transforms.push(appendMissingElements('purchaseAliases', aliases));
      if (isNew) {
        // id อยู่ในชื่อเอกสารแล้ว ไม่เก็บซ้ำเป็นฟิลด์ (สต็อกที่แอปสร้างก็ไม่มีฟิลด์ id)
        const data = { ...stock };
        delete data.id;
        writes.push(createWrite(db.name('stock', id), { ...data, ...fields, quantity: result.final.quantity }, transforms));
      } else writes.push(updateWrite(db.name('stock', id), fields, [increment('quantity', quantity), ...transforms]));
      moves.push(`${stock.name} +${quantity} ${stock.unit}`);
    }
    const expenses = pending.lines.map((line, i) => createWrite(db.name('expenses', `tg_${pending.batchId}_${i}`), buildExpenseRecord(line, { date: expenseDate(pending.receiptDate, now), plan: plans.get(i), extra: { source: 'telegram', entry: pending.source, tgBatchId: pending.batchId, createdBy: { tgUserId: user?.id ?? null, name: [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || '' }, ...(line.barcode ? { barcode: line.barcode } : {}) } }), [serverTime('createdAt')]));
    // เอกสารรายจ่ายและสต็อกต้องสำเร็จพร้อมกัน จึงไม่เกิดครึ่งบิลเมื่อเครือข่ายหลุด
    return [...expenses, ...writes];
  });
  return `${pending.lines.length} รายการ · ฿${roundMoney(pending.lines.reduce((s, l) => s + l.amount, 0))}${moves.length ? `\n${moves.join('\n')}` : ''}`;
}
