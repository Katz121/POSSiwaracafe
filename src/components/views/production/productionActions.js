// Firestore writes for production (ผลิตวันนี้), prep items, stock merge and
// unit fixes. All numbers come from the pure planners in utils/production.js
// and utils/stockMerge.js; this file only reads fresh docs inside a
// transaction, re-plans on them, and writes the result.
import {
  collection, doc, addDoc, updateDoc, writeBatch, runTransaction, increment, serverTimestamp,
} from 'firebase/firestore';
import { db, appId } from '../../../services/firebase';
import {
  BATCH_STATUS, buildBatchDoc, planBatchCompletion, planBatchReversal, resolveStockId, detectRecipeCycle,
} from '../../../utils/production';
import { planMerge, roundQty6 } from '../../../utils/stockMerge';
import { roundUnitCost } from '../../../utils/stockIntake';

const base = ['artifacts', appId, 'public', 'data'];
const stockRef = (id) => doc(db, ...base, 'stock', id);
const batchRef = (id) => doc(db, ...base, 'productionBatches', id);
export const batchesCol = () => collection(db, ...base, 'productionBatches');

const nowIso = () => new Date().toISOString();

/** Standard recipe for ONE round, from ingredients entered for `rounds` rounds. */
export function recipeFromIngredients(ingredients, rounds, expectedYieldTotal, note) {
  const r = Number(rounds) > 0 ? Number(rounds) : 1;
  return {
    ingredients: ingredients
      .filter((l) => l?.stockId && Number(l.qty) > 0)
      .map((l) => ({ stockId: l.stockId, qty: roundQty6(Number(l.qty) / r) })),
    expectedYield: roundQty6((Number(expectedYieldTotal) || 0) / r),
    ...(note ? { note } : {}),
  };
}

/** Create a planned batch. Optionally store the ingredients as the prep's standard recipe. */
/** ราคาขายต่อชิ้น = ราคาทั้งก้อน ÷ ชิ้นที่ตัดได้ (2 ตำแหน่ง) */
export const piecePrice = (wholePrice, pieces) => (Number(pieces) > 0 ? Math.round((Number(wholePrice) / Number(pieces)) * 100) / 100 : 0);

export async function createBatch({ output, rounds, ingredients, date, note, by, saveAsStandard, expectedYieldTotal }) {
  const data = buildBatchDoc({ date, output, rounds, ingredients, note, by });
  if (Number(expectedYieldTotal) > 0) data.expectedYield = roundQty6(expectedYieldTotal);
  data.createdAt = nowIso();
  const ref = await addDoc(batchesCol(), data);
  if (saveAsStandard) {
    await updateDoc(stockRef(output.id), { recipe: recipeFromIngredients(ingredients, rounds, expectedYieldTotal, output.recipe?.note) });
  }
  return ref.id;
}

/**
 * ทำเสร็จ · one transaction: batch must still be planned (a second tap or a
 * second device gets "already done" and nothing is deducted twice).
 */
export async function completeBatch({ batchId, actualIngredients, yieldQty, stockById, by, wholePrice = 0 }) {
  return runTransaction(db, async (tx) => {
    const bSnap = await tx.get(batchRef(batchId));
    if (!bSnap.exists()) throw new Error('ไม่พบรายการผลิตนี้');
    const batch = { id: bSnap.id, ...bSnap.data() };
    if (batch.status !== BATCH_STATUS.PLANNED) throw new Error('รายการนี้บันทึกไปแล้ว');

    // Resolve merged ids with the local map, then read every doc fresh.
    const outputId = resolveStockId(batch.outputStockId, stockById);
    const lines = actualIngredients.map((l) => ({ ...l, stockId: resolveStockId(l.stockId, stockById) }));
    const ids = [...new Set([outputId, ...lines.map((l) => l.stockId).filter(Boolean)])];
    const fresh = new Map();
    for (const id of ids) {
      const snap = await tx.get(stockRef(id));
      if (snap.exists()) {
        const data = { id, ...snap.data() };
        if (data.mergedInto) throw new Error(`${data.name || 'สต็อก'} ถูกรวมไปแล้ว · ปิดแล้วเปิดใหม่อีกครั้ง`);
        fresh.set(id, data);
      }
    }
    const plan = planBatchCompletion({ batch: { ...batch, outputStockId: outputId }, actualIngredients: lines, yieldQty, stockById: fresh });
    if (!plan.ok) throw new Error(plan.error);

    Object.entries(plan.decrements).forEach(([id, qty]) => {
      tx.update(stockRef(id), { quantity: increment(-qty) });
    });
    tx.update(stockRef(plan.outputStockId), {
      quantity: increment(plan.outputIncrement),
      unitCost: plan.newOutputUnitCost,
      lastProducedAt: nowIso(),
      ...(wholePrice > 0 ? { wholePrice } : {}),
    });
    tx.update(batchRef(batchId), {
      status: BATCH_STATUS.DONE,
      outputStockId: plan.outputStockId,
      actualIngredients: plan.lines,
      yieldQty: plan.outputIncrement,
      costTotal: plan.costTotal,
      unitCost: plan.unitCost,
      outputUnitCostBefore: plan.outputUnitCostBefore,
      outputUnitCostAfter: plan.newOutputUnitCost,
      doneAt: nowIso(),
      doneBy: by || '',
      // ราคาทั้งก้อน ÷ ชิ้นที่ตัดได้จริงรอบนี้ · เก็บไว้ดูย้อนหลังว่ารอบไหนตัดได้คุ้มแค่ไหน
      ...(wholePrice > 0 ? { wholePrice, pricePerPiece: piecePrice(wholePrice, plan.outputIncrement) } : {}),
    });
    return plan;
  });
}

/** ย้อนรายการที่ทำเสร็จ · returns ingredients and removes the output in one transaction. */
export async function reverseBatch({ batchId, stockById, by }) {
  return runTransaction(db, async (tx) => {
    const bSnap = await tx.get(batchRef(batchId));
    if (!bSnap.exists()) throw new Error('ไม่พบรายการผลิตนี้');
    const batch = { id: bSnap.id, ...bSnap.data() };
    if (batch.status !== BATCH_STATUS.DONE) throw new Error('รายการนี้ถูกย้อนหรือยกเลิกไปแล้ว');
    const outputId = resolveStockId(batch.outputStockId, stockById);
    const lines = (batch.actualIngredients || []).map((l) => ({ ...l, stockId: resolveStockId(l.stockId, stockById) }));
    const ids = [...new Set([outputId, ...lines.map((l) => l.stockId)])];
    const fresh = new Map();
    for (const id of ids) {
      const snap = await tx.get(stockRef(id));
      if (snap.exists()) fresh.set(id, { id, ...snap.data() });
    }
    const plan = planBatchReversal({ batch: { ...batch, outputStockId: outputId, actualIngredients: lines }, stockById: fresh });
    if (!plan.ok) throw new Error(plan.error);
    Object.entries(plan.increments).forEach(([id, qty]) => {
      const update = { quantity: increment(qty) };
      if (plan.ingredientUnitCosts[id] > 0) update.unitCost = plan.ingredientUnitCosts[id];
      tx.update(stockRef(id), update);
    });
    tx.update(stockRef(plan.outputStockId), { quantity: increment(-plan.outputDecrement), unitCost: plan.newOutputUnitCost });
    tx.update(batchRef(batchId), { status: BATCH_STATUS.CANCELLED, reversedAt: nowIso(), reversedBy: by || '' });
    return plan;
  });
}

/** ยกเลิกรายการที่ยังไม่ได้ทำ · no stock effect. */
export async function cancelPlannedBatch({ batchId, by }) {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(batchRef(batchId));
    if (!snap.exists()) throw new Error('ไม่พบรายการผลิตนี้');
    if (snap.data().status !== BATCH_STATUS.PLANNED) throw new Error('รายการนี้ไม่ได้อยู่ในสถานะรอทำ');
    tx.update(batchRef(batchId), { status: BATCH_STATUS.CANCELLED, cancelledAt: nowIso(), cancelledBy: by || '' });
  });
}

/** Estimated cost per unit of a recipe from current stock costs (0 when unknown). */
export function estimateRecipeUnitCost(recipe, stockById) {
  const y = Number(recipe?.expectedYield) || 0;
  if (y <= 0) return 0;
  const total = (recipe?.ingredients || []).reduce((sum, l) => {
    const s = stockById.get(resolveStockId(l.stockId, stockById));
    return sum + (Number(s?.unitCost) || 0) * (Number(l.qty) || 0);
  }, 0);
  return roundUnitCost(total / y);
}

/**
 * Create / update a prep item (a stock doc with kind 'prep').
 * Throws when the recipe would loop back to itself.
 */
export async function savePrepItem({ id, form, stockById }) {
  const recipe = {
    ingredients: (form.ingredients || [])
      .filter((l) => l?.stockId && Number(l.qty) > 0)
      .map((l) => ({ stockId: l.stockId, qty: roundQty6(l.qty) })),
    expectedYield: roundQty6(form.expectedYield),
    ...(form.note ? { note: String(form.note).slice(0, 300) } : {}),
  };
  const selfId = id || '__new__';
  const cycle = detectRecipeCycle(selfId, recipe, stockById);
  if (cycle) {
    const names = cycle.map((x) => (x === '__new__' ? form.name : stockById.get(x)?.name || x));
    throw new Error(`สูตรวนกลับมาที่ตัวเอง: ${names.join(' → ')}`);
  }
  const data = {
    name: String(form.name).trim(),
    unit: String(form.unit).trim(),
    category: form.category || 'วัตถุดิบเบเกอรี่',
    kind: 'prep',
    recipe,
    minQuantity: Number(form.minQuantity) || 0,
  };
  const days = Number(form.shelfLifeDays);
  data.shelfLifeDays = days > 0 ? days : null;
  const wholePrice = Number(form.wholePrice);
  data.wholePrice = wholePrice > 0 ? wholePrice : null;
  if (id) {
    await updateDoc(stockRef(id), data);
    return id;
  }
  const ref = await addDoc(collection(db, ...base, 'stock'), {
    ...data,
    quantity: 0,
    // a first guess so menus linked to it are costed before the first batch;
    // the first batch replaces it (weighted average ignores an empty stock)
    unitCost: estimateRecipeUnitCost(recipe, stockById),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * รวมรายการซ้ำ · re-plans on docs read inside the transaction so a sale that
 * lands between preview and confirm is not lost.
 */
export async function runMerge({ keepId, mergeIds, stock, menu, beanModifiers, by }) {
  return runTransaction(db, async (tx) => {
    const draft = planMerge({ keepId, mergeIds, stock, menu, beanModifiers });
    if (!draft.ok) throw new Error(draft.error);
    const read = async (col, id) => {
      const snap = await tx.get(doc(db, ...base, col, id));
      return snap.exists() ? { id, ...snap.data() } : null;
    };
    const freshStock = new Map();
    for (const id of [keepId, ...draft.merged.map((m) => m.id), ...draft.chains.map((c) => c.id), ...draft.recipeUpdates.map((r) => r.id)]) {
      if (!freshStock.has(id)) freshStock.set(id, await read('stock', id));
    }
    const freshMenu = new Map();
    for (const u of draft.menuUpdates) freshMenu.set(u.id, await read('menu', u.id));
    const freshMods = new Map();
    for (const u of draft.modifierUpdates) freshMods.set(u.id, await read('beanModifiers', u.id));

    const swap = (list, fresh) => list.map((x) => (fresh.has(x.id) ? fresh.get(x.id) : x)).filter(Boolean);
    const plan = planMerge({
      keepId, mergeIds, stock: swap(stock, freshStock), menu: swap(menu, freshMenu), beanModifiers: swap(beanModifiers, freshMods),
    });
    if (!plan.ok) throw new Error(plan.error);

    const at = nowIso();
    tx.update(stockRef(keepId), plan.keep.update);
    plan.merged.forEach((m) => tx.update(stockRef(m.id), { ...m.update, mergedAt: at, mergedBy: by || '' }));
    plan.chains.forEach((c) => tx.update(stockRef(c.id), { mergedInto: c.mergedInto }));
    plan.recipeUpdates.forEach((r) => tx.update(stockRef(r.id), { recipe: r.recipe }));
    plan.menuUpdates.forEach((u) => tx.update(doc(db, ...base, 'menu', u.id), { stockLinks: u.stockLinks }));
    plan.modifierUpdates.forEach((u) => tx.update(doc(db, ...base, 'beanModifiers', u.id), { stockLinks: u.stockLinks }));
    return plan;
  });
}

/** แก้หน่วยสะกดผิดทั้งร้าน · label only, quantities unchanged. */
export async function runUnitFixes(fixes) {
  const batch = writeBatch(db);
  fixes.forEach((f) => batch.update(stockRef(f.id), { unit: f.to }));
  await batch.commit();
}
