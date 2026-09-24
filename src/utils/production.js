/**
 * ผลิตของเตรียม (ซอส เนื้อเค้ก เค้กชิ้น เค้กก้อน) · "วันนี้จะทำอะไร"
 *
 * โมเดล: ของเตรียมคือสต็อกหนึ่งรายการ (`kind: 'prep'`) ที่มีสูตรมาตรฐาน 1 รอบ
 * (`recipe: { ingredients:[{stockId, qty}], expectedYield }`) · การผลิตหนึ่งครั้งคือ
 * เอกสาร productionBatches หนึ่งใบ:
 *
 *   planned ── ทำเสร็จ ──▶ done ── ย้อนรายการ ──▶ cancelled (คืนสต็อก)
 *      └──── ยกเลิก ─────▶ cancelled (ไม่แตะสต็อก)
 *
 * ทำเสร็จ = ตัดวัตถุดิบตามที่ใช้จริง + เพิ่มของเตรียมตามที่ได้จริง
 *
 * **กฎบัญชี**
 * 1. การผลิตคือ "เปลี่ยนรูป" ของในคลัง ไม่ใช่ซื้อ ไม่ใช่ขาย · ห้ามบันทึกรายจ่าย
 *    วัตถุดิบถูกนับเป็นรายจ่ายไปแล้วตอนซื้อ (stockIntake) และจะกลายเป็น COGS
 *    ตอนขายเค้กชิ้นผ่านต้นทุนของเค้กชิ้น (profitability.js) · บันทึกซ้ำคือหักซ้ำ
 * 2. มูลค่าที่ย้ายต้องเท่ากันสองฝั่ง: ต้นทุนวัตถุดิบที่ตัดออก = มูลค่าผลผลิตที่เพิ่มเข้า
 *    (ต้นทุนต่อหน่วยผลผลิต = ต้นทุนรวม ÷ จำนวนที่ได้จริง ไม่ใช่ที่สูตรคาด)
 *    ทำเค้กได้ 9 ชิ้นแทน 10 ต้นทุนต่อชิ้นต้องแพงขึ้น ไม่ใช่หายไป 1 ชิ้นเงียบๆ
 * 3. ต้นทุนผลผลิตคงเหลือใช้ถัวเฉลี่ยถ่วงน้ำหนัก กติกาเดียวกับรับของเข้า
 *    (`weightedAverageUnitCost` ใน stockIntake.js) ไม่เขียนสูตรใหม่
 *
 * ทั้งไฟล์เป็นฟังก์ชันบริสุทธิ์ ไม่แตะ Firestore · เทสต์ใน production.test.js
 */

import { roundMoney, roundUnitCost, weightedAverageUnitCost } from './stockIntake.js';
import { resolveStockId, roundQty6 } from './stockMerge.js';

export { resolveStockId };

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const BATCH_STATUS = { PLANNED: 'planned', DONE: 'done', CANCELLED: 'cancelled' };

/** หน่วยที่นับเป็นชิ้น → หน้าทำเสร็จถาม "ตัดได้กี่ชิ้น" แทน "ได้เท่าไหร่" */
const PIECE_UNITS = new Set(['ชิ้น', 'pcs', 'pc', 'ea', 'อัน']);
export const isPieceUnit = (unit) => PIECE_UNITS.has(String(unit || '').trim().toLowerCase());

export const isPrep = (item) => item?.kind === 'prep';

/** ปริมาณต่อชิ้น เมื่อกรอกเป็น "ต่อก้อน ÷ ตัดได้กี่ชิ้น" · เก็บ 4 ตำแหน่ง (ไข่ 4 ฟอง ÷ 10 = 0.4) */
export function usagePerPiece(perWhole, pieces) {
  const p = num(pieces);
  if (p <= 0) return 0;
  return Math.round((num(perWhole) / p) * 10000) / 10000;
}

// ── สูตร ─────────────────────────────────────────────────────────────────────

/**
 * วัตถุดิบของสูตรมาตรฐาน × จำนวนรอบ
 * @returns {Array<{stockId, name, unit, qty}>}
 */
export function scaleRecipe(recipe, rounds = 1, stockById = new Map()) {
  const r = num(rounds);
  const out = [];
  const byId = new Map();
  (recipe?.ingredients || []).forEach((line) => {
    if (!line?.stockId) return;
    const id = resolveStockId(line.stockId, stockById);
    const s = stockById.get(id);
    const qty = roundQty6(num(line.qty) * r);
    const prev = byId.get(id);
    if (prev) { prev.qty = roundQty6(prev.qty + qty); return; }
    const row = { stockId: id, name: String(s?.name || line.name || ''), unit: String(s?.unit || line.unit || ''), qty };
    byId.set(id, row);
    out.push(row);
  });
  return out;
}

/** ผลที่สูตรคาดว่าจะได้ × จำนวนรอบ */
export const expectedYieldFor = (recipe, rounds = 1) => roundQty6(num(recipe?.expectedYield) * num(rounds));

/**
 * สูตรนี้วนไหม (A ใช้ B, B ใช้ A · หรือใช้ตัวเอง)
 * @returns {string[] | null} เส้นทางที่วน [A, B, A] หรือ null ถ้าไม่วน
 */
export function detectRecipeCycle(stockId, recipe, stockById = new Map()) {
  const target = resolveStockId(stockId, stockById);
  const visit = (id, path, seen) => {
    const rid = resolveStockId(id, stockById);
    if (rid === target) return [...path, rid];
    if (seen.has(rid)) return null;
    seen.add(rid);
    const sub = stockById.get(rid)?.recipe?.ingredients || [];
    for (const line of sub) {
      if (!line?.stockId) continue;
      const found = visit(line.stockId, [...path, rid], seen);
      if (found) return found;
    }
    return null;
  };
  const seen = new Set();
  for (const line of recipe?.ingredients || []) {
    if (!line?.stockId) continue;
    const found = visit(line.stockId, [target], seen);
    if (found) return found;
  }
  return null;
}

// ── เช็คของพอไหม ────────────────────────────────────────────────────────────

/**
 * เทียบของที่ต้องใช้กับคงเหลือ · ของเตรียมที่ไม่พอ → หน้าจอเสนอ "ทำก่อน"
 * @returns {{ rows: Array<{stockId,name,unit,need,onHand,short,isPrep,missing,suggestRounds}>, ok:boolean, shortCount:number }}
 */
export function checkAvailability(ingredients = [], stockById = new Map()) {
  const byId = new Map();
  ingredients.forEach((line) => {
    if (!line?.stockId) return;
    const id = resolveStockId(line.stockId, stockById);
    const prev = byId.get(id);
    if (prev) { prev.need = roundQty6(prev.need + num(line.qty)); return; }
    byId.set(id, { stockId: id, name: String(line.name || ''), unit: String(line.unit || ''), need: roundQty6(num(line.qty)) });
  });
  const rows = [...byId.values()].map((row) => {
    const s = stockById.get(row.stockId);
    const onHand = num(s?.quantity);
    const short = s ? roundQty6(Math.max(0, row.need - Math.max(0, onHand))) : row.need;
    const prep = isPrep(s);
    const perRound = num(s?.recipe?.expectedYield);
    return {
      ...row,
      name: String(s?.name || row.name),
      unit: String(s?.unit || row.unit),
      onHand,
      short,
      isPrep: prep,
      missing: !s,
      // ทำก่อนกี่รอบถึงจะพอ · ปัดขึ้น อย่างน้อย 1 รอบ
      suggestRounds: prep && short > 0 ? Math.max(1, Math.ceil(short / (perRound > 0 ? perRound : short))) : 0,
    };
  });
  const shortCount = rows.filter((r) => r.short > 0 && r.need > 0).length;
  return { rows, ok: shortCount === 0, shortCount };
}

// ── ทำเสร็จ / ย้อนรายการ ─────────────────────────────────────────────────────

export const canComplete = (batch) => batch?.status === BATCH_STATUS.PLANNED;
export const canReverse = (batch) => batch?.status === BATCH_STATUS.DONE;
export const canCancelPlanned = (batch) => batch?.status === BATCH_STATUS.PLANNED;

/**
 * แผนตอนกด "ทำเสร็จแล้ว"
 *
 * @param {object} input
 * @param {object} input.batch               เอกสาร batch (ต้อง planned)
 * @param {Array}  input.actualIngredients   ที่ใช้จริง [{stockId, qty}]
 * @param {number} input.yieldQty            ได้จริง (เค้ก = ตัดได้กี่ชิ้น)
 * @param {Map}    input.stockById           สต็อกตอนนี้ (อ่านสดในทรานแซกชัน)
 * @returns {{ ok:true, outputStockId, decrements, lines, outputIncrement, costTotal, unitCost,
 *             newOutputUnitCost, outputUnitCostBefore, uncostedCount }
 *         | { ok:false, error:string }}
 */
export function planBatchCompletion({ batch, actualIngredients = [], yieldQty, stockById = new Map() } = {}) {
  if (!canComplete(batch)) return { ok: false, error: 'รายการนี้ไม่ได้อยู่ในสถานะรอทำ (อาจบันทึกไปแล้ว)' };
  const outputStockId = resolveStockId(batch.outputStockId, stockById);
  const output = stockById.get(outputStockId);
  if (!output) return { ok: false, error: 'ไม่พบสต็อกของผลผลิต' };
  const y = num(yieldQty);
  if (!(y > 0)) return { ok: false, error: 'กรอกผลที่ได้จริงมากกว่า 0' };

  const decrements = {};
  const byId = new Map();
  for (const line of actualIngredients) {
    if (!line?.stockId) continue;
    const q = num(line.qty);
    if (q < 0) return { ok: false, error: 'ปริมาณวัตถุดิบติดลบไม่ได้' };
    if (q === 0) continue;
    const id = resolveStockId(line.stockId, stockById);
    if (id === outputStockId) return { ok: false, error: 'ใช้ผลผลิตเป็นวัตถุดิบของตัวเองไม่ได้' };
    const s = stockById.get(id);
    if (!s) return { ok: false, error: `ไม่พบสต็อก ${line.name || id}` };
    const prev = byId.get(id);
    if (prev) prev.qty = roundQty6(prev.qty + q);
    else byId.set(id, { stockId: id, name: String(s.name || ''), unit: String(s.unit || ''), qty: roundQty6(q), unitCost: num(s.unitCost) });
  }
  const lines = [...byId.values()].map((l) => ({ ...l, cost: roundMoney(l.qty * l.unitCost) }));
  lines.forEach((l) => { decrements[l.stockId] = l.qty; });

  const rawCost = lines.reduce((sum, l) => sum + l.qty * l.unitCost, 0);
  const costTotal = roundMoney(rawCost);
  const unitCost = roundUnitCost(rawCost / y);
  const outputUnitCostBefore = num(output.unitCost);
  const newOutputUnitCost = weightedAverageUnitCost({
    onHandQty: output.quantity,
    onHandUnitCost: outputUnitCostBefore,
    inQty: y,
    inUnitCost: unitCost,
  });

  return {
    ok: true,
    outputStockId,
    decrements,
    lines,
    outputIncrement: roundQty6(y),
    costTotal,
    unitCost,
    newOutputUnitCost,
    outputUnitCostBefore,
    uncostedCount: lines.filter((l) => l.unitCost <= 0).length,
  };
}

/**
 * แผนย้อนรายการที่ทำเสร็จแล้ว (คืนวัตถุดิบ + เอาผลผลิตออก)
 *
 * ต้นทุนผลผลิตหลังเอาออก: ถอดรอบนี้ออกจากค่าเฉลี่ย (Q·c − y·u) ÷ (Q − y)
 * ถ้าถอดไม่ได้ (เหลือ ≤ 0 หรือได้ค่าติดลบเพราะมีการขาย/รับเข้าหลังจากนั้น) ใช้ต้นทุนก่อนผลิตที่จำไว้
 * ถ้าก่อนผลิตไม่มีต้นทุน ใช้ต้นทุนล่าสุดต่อ · ตั้งเป็น 0 จะทำให้เมนูที่ผูกอยู่ดูเหมือนได้ของฟรี
 * วัตถุดิบที่คืนถัวเฉลี่ยกลับด้วยต้นทุนที่ตัดไปจริงตอนนั้น (กติกาเดียวกับรับของเข้า)
 */
export function planBatchReversal({ batch, stockById = new Map() } = {}) {
  if (!canReverse(batch)) return { ok: false, error: 'ย้อนได้เฉพาะรายการที่ทำเสร็จแล้ว' };
  const outputStockId = resolveStockId(batch.outputStockId, stockById);
  const output = stockById.get(outputStockId);
  if (!output) return { ok: false, error: 'ไม่พบสต็อกของผลผลิต' };
  const y = num(batch.yieldQty);
  const u = num(batch.unitCost);
  const Q = num(output.quantity);
  const c = num(output.unitCost);
  const left = Q - y;
  const remainingValue = Q * c - y * u;
  let newOutputUnitCost;
  if (left > 0 && remainingValue > 0) newOutputUnitCost = roundUnitCost(remainingValue / left);
  else newOutputUnitCost = num(batch.outputUnitCostBefore) > 0 ? roundUnitCost(batch.outputUnitCostBefore) : roundUnitCost(c);

  const increments = {};
  const ingredientUnitCosts = {};
  for (const line of batch.actualIngredients || []) {
    if (!line?.stockId || !(num(line.qty) > 0)) continue;
    const id = resolveStockId(line.stockId, stockById);
    const s = stockById.get(id);
    if (!s) return { ok: false, error: `ไม่พบสต็อก ${line.name || id}` };
    increments[id] = roundQty6((increments[id] || 0) + num(line.qty));
    const back = num(line.unitCost);
    if (back > 0) {
      ingredientUnitCosts[id] = weightedAverageUnitCost({
        onHandQty: s.quantity, onHandUnitCost: s.unitCost, inQty: increments[id], inUnitCost: back,
      });
    }
  }
  return { ok: true, outputStockId, increments, outputDecrement: roundQty6(y), newOutputUnitCost, ingredientUnitCosts };
}

// ── ประวัติ ───────────────────────────────────────────────────────────────────

const batchTime = (b) => String(b?.doneAt || b?.createdAt || b?.date || '');

/** ครั้งล่าสุดที่ทำเสร็จของผลผลิตนี้ · ใช้ปุ่ม "ใช้เหมือนครั้งที่แล้ว" */
export function lastBatchFor(outputStockId, batches = [], stockById = new Map()) {
  const target = resolveStockId(outputStockId, stockById);
  return batches
    .filter((b) => b?.status === BATCH_STATUS.DONE && resolveStockId(b.outputStockId, stockById) === target)
    .sort((a, b) => batchTime(b).localeCompare(batchTime(a)))[0] || null;
}

/** สรุปรายการที่ทำเสร็จของวันหนึ่ง · หน้า "สรุปขาย & สต็อก" */
export function summarizeProduction(batches = [], date) {
  const done = batches
    .filter((b) => b?.status === BATCH_STATUS.DONE && (!date || b.date === date))
    .sort((a, b) => batchTime(a).localeCompare(batchTime(b)));
  return {
    batches: done,
    count: done.length,
    costTotal: roundMoney(done.reduce((s, b) => s + num(b.costTotal), 0)),
  };
}

/** เอกสาร batch ใหม่ (สถานะ planned) · createdAt ใส่จากฝั่งผู้เรียก */
export function buildBatchDoc({ date, output, rounds = 1, ingredients = [], note = '', by = '' }) {
  const clean = ingredients
    .filter((l) => l?.stockId && num(l.qty) > 0)
    .map((l) => ({ stockId: l.stockId, name: String(l.name || ''), unit: String(l.unit || ''), qty: roundQty6(l.qty) }));
  return {
    date,
    status: BATCH_STATUS.PLANNED,
    outputStockId: output.id,
    outputName: String(output.name || ''),
    outputUnit: String(output.unit || ''),
    rounds: num(rounds) || 1,
    plannedIngredients: clean,
    actualIngredients: [],
    yieldQty: 0,
    expectedYield: expectedYieldFor(output.recipe, rounds),
    costTotal: 0,
    unitCost: 0,
    createdBy: by,
    note: String(note || '').slice(0, 300),
  };
}
