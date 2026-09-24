import { describe, it, expect } from 'vitest';
import {
  scaleRecipe, checkAvailability, detectRecipeCycle, planBatchCompletion, planBatchReversal,
  lastBatchFor, summarizeProduction, buildBatchDoc, usagePerPiece, isPieceUnit, canComplete, canReverse,
  expectedYieldFor, resolveStockId,
} from './production.js';

const map = (list) => new Map(list.map((s) => [s.id, s]));

const straw = { id: 'straw', name: 'สตรอเบอรี่', unit: 'กรัม', quantity: 1000, unitCost: 0.2 };
const sugar = { id: 'sugar', name: 'น้ำตาล', unit: 'กรัม', quantity: 5000, unitCost: 0.03 };
const egg = { id: 'egg', name: 'ไข่ไก่', unit: 'ฟอง', quantity: 30, unitCost: 5 };
const eggOld = { id: 'egg-old', name: 'ไขไก่', unit: 'ฟอง', quantity: 0, unitCost: 5.1, mergedInto: 'egg', archived: true };
const sauce = {
  id: 'sauce', name: 'ซอสสตรอเบอรี่', unit: 'กรัม', kind: 'prep', quantity: 0, unitCost: 0,
  recipe: { expectedYield: 600, ingredients: [{ stockId: 'straw', qty: 500 }, { stockId: 'sugar', qty: 200 }] },
};
const sponge = {
  id: 'sponge', name: 'เนื้อเค้ก', unit: 'ก้อน', kind: 'prep', quantity: 0, unitCost: 0,
  recipe: { expectedYield: 1, ingredients: [{ stockId: 'egg-old', qty: 4 }, { stockId: 'sugar', qty: 100 }] },
};
const slice = {
  id: 'slice', name: 'เค้กสตรอเบอรี่ (ชิ้น)', unit: 'ชิ้น', kind: 'prep', quantity: 2, unitCost: 20,
  recipe: { expectedYield: 10, ingredients: [{ stockId: 'sponge', qty: 1 }, { stockId: 'sauce', qty: 300 }] },
};
const stock = [straw, sugar, egg, eggOld, sauce, sponge, slice];
const byId = map(stock);

describe('usagePerPiece', () => {
  it('divides a whole-cake amount by the pieces cut, 4 decimals', () => {
    expect(usagePerPiece(4, 10)).toBe(0.4);
    expect(usagePerPiece(1, 3)).toBe(0.3333);
    expect(usagePerPiece(250, 8)).toBe(31.25);
    expect(usagePerPiece(4, 0)).toBe(0);
  });
  it('knows piece units', () => {
    expect(isPieceUnit('ชิ้น')).toBe(true);
    expect(isPieceUnit('ก้อน')).toBe(false);
  });
});

describe('scaleRecipe', () => {
  it('multiplies by rounds and attaches names/units', () => {
    expect(scaleRecipe(sauce.recipe, 2, byId)).toEqual([
      { stockId: 'straw', name: 'สตรอเบอรี่', unit: 'กรัม', qty: 1000 },
      { stockId: 'sugar', name: 'น้ำตาล', unit: 'กรัม', qty: 400 },
    ]);
    expect(expectedYieldFor(sauce.recipe, 1.5)).toBe(900);
  });
  it('follows merged ingredients to the kept stock', () => {
    expect(scaleRecipe(sponge.recipe, 1, byId)[0]).toEqual({ stockId: 'egg', name: 'ไข่ไก่', unit: 'ฟอง', qty: 4 });
  });
  it('avoids float noise', () => {
    expect(scaleRecipe({ ingredients: [{ stockId: 'sugar', qty: 0.1 }] }, 3, byId)[0].qty).toBe(0.3);
  });
});

describe('detectRecipeCycle', () => {
  it('accepts nested prep without cycles', () => {
    expect(detectRecipeCycle('slice', slice.recipe, byId)).toBeNull();
  });
  it('catches self use', () => {
    expect(detectRecipeCycle('sauce', { ingredients: [{ stockId: 'sauce', qty: 1 }] }, byId)).toEqual(['sauce', 'sauce']);
  });
  it('catches an indirect cycle (sauce → slice → sauce)', () => {
    const path = detectRecipeCycle('sauce', { ingredients: [{ stockId: 'slice', qty: 1 }] }, byId);
    expect(path).toEqual(['sauce', 'slice', 'sauce']);
  });
  it('catches a cycle through a merged id', () => {
    const m = map([...stock, { id: 'dup', mergedInto: 'sauce', archived: true }]);
    expect(detectRecipeCycle('sauce', { ingredients: [{ stockId: 'dup', qty: 1 }] }, m)).not.toBeNull();
  });
});

describe('checkAvailability', () => {
  it('flags short prep items with a suggested number of rounds', () => {
    const need = scaleRecipe(slice.recipe, 1, byId);
    const res = checkAvailability(need, byId);
    expect(res.ok).toBe(false);
    expect(res.shortCount).toBe(2);
    const s = res.rows.find((r) => r.stockId === 'sauce');
    expect(s).toMatchObject({ need: 300, onHand: 0, short: 300, isPrep: true, suggestRounds: 1 });
    const sp = res.rows.find((r) => r.stockId === 'sponge');
    expect(sp.suggestRounds).toBe(1);
  });
  it('is ok when everything is on hand and merges duplicate lines', () => {
    const res = checkAvailability([{ stockId: 'sugar', qty: 100 }, { stockId: 'sugar', qty: 50 }, { stockId: 'egg-old', qty: 4 }], byId);
    expect(res.ok).toBe(true);
    expect(res.rows.find((r) => r.stockId === 'sugar').need).toBe(150);
    expect(res.rows.find((r) => r.stockId === 'egg')).toBeTruthy();
  });
  it('treats negative on-hand as nothing and missing stock as short', () => {
    const m = map([{ id: 'x', name: 'x', unit: 'g', quantity: -5 }]);
    const res = checkAvailability([{ stockId: 'x', qty: 2 }, { stockId: 'ghost', qty: 1, name: 'ผี' }], m);
    expect(res.rows[0].short).toBe(2);
    expect(res.rows[1]).toMatchObject({ missing: true, short: 1 });
  });
  it('suggests enough rounds to cover the shortage', () => {
    const res = checkAvailability([{ stockId: 'sauce', qty: 1300 }], byId);
    expect(res.rows[0].suggestRounds).toBe(3); // 1300 / 600 → 3
  });
});

describe('planBatchCompletion', () => {
  const batch = { status: 'planned', outputStockId: 'sauce', rounds: 1 };
  it('uses the actual amounts and actual yield for cost', () => {
    const plan = planBatchCompletion({
      batch,
      actualIngredients: [{ stockId: 'straw', qty: 520 }, { stockId: 'sugar', qty: 200 }],
      yieldQty: 550,
      stockById: byId,
    });
    expect(plan.ok).toBe(true);
    expect(plan.decrements).toEqual({ straw: 520, sugar: 200 });
    expect(plan.costTotal).toBe(110); // 520×0.2 + 200×0.03
    expect(plan.unitCost).toBeCloseTo(0.2, 6); // 110 / 550
    expect(plan.outputIncrement).toBe(550);
    expect(plan.newOutputUnitCost).toBeCloseTo(0.2, 6); // nothing on hand before
  });
  it('cost per slice = batch cost ÷ slices actually cut, averaged with what is left', () => {
    const plan = planBatchCompletion({
      batch: { status: 'planned', outputStockId: 'slice' },
      actualIngredients: [{ stockId: 'sponge', qty: 1 }, { stockId: 'sauce', qty: 300 }],
      yieldQty: 9,
      stockById: map([...stock.filter((s) => !['sponge', 'sauce'].includes(s.id)),
        { ...sponge, quantity: 1, unitCost: 40 }, { ...sauce, quantity: 550, unitCost: 0.2 }]),
    });
    expect(plan.costTotal).toBe(100); // 40 + 300×0.2
    expect(plan.unitCost).toBeCloseTo(100 / 9, 6);
    // 2 slices @20 on hand + 9 @11.11 → (40 + 100) / 11
    expect(plan.newOutputUnitCost).toBeCloseTo(140 / 11, 5);
    expect(plan.outputUnitCostBefore).toBe(20);
  });
  it('resolves merged ingredient ids and sums duplicates', () => {
    const plan = planBatchCompletion({
      batch: { status: 'planned', outputStockId: 'sponge' },
      actualIngredients: [{ stockId: 'egg-old', qty: 2 }, { stockId: 'egg', qty: 2 }, { stockId: 'sugar', qty: 0 }],
      yieldQty: 1,
      stockById: byId,
    });
    expect(plan.decrements).toEqual({ egg: 4 });
    expect(plan.costTotal).toBe(20);
  });
  it('is idempotent: a done batch cannot complete again', () => {
    expect(canComplete({ status: 'done' })).toBe(false);
    const again = planBatchCompletion({ batch: { status: 'done', outputStockId: 'sauce' }, actualIngredients: [], yieldQty: 5, stockById: byId });
    expect(again.ok).toBe(false);
  });
  it('rejects zero yield, negative qty, missing stock and self use', () => {
    expect(planBatchCompletion({ batch, actualIngredients: [], yieldQty: 0, stockById: byId }).ok).toBe(false);
    expect(planBatchCompletion({ batch, actualIngredients: [{ stockId: 'straw', qty: -1 }], yieldQty: 5, stockById: byId }).ok).toBe(false);
    expect(planBatchCompletion({ batch, actualIngredients: [{ stockId: 'ghost', qty: 1 }], yieldQty: 5, stockById: byId }).ok).toBe(false);
    expect(planBatchCompletion({ batch, actualIngredients: [{ stockId: 'sauce', qty: 1 }], yieldQty: 5, stockById: byId }).ok).toBe(false);
  });
  it('counts ingredients without a cost', () => {
    const m = map([...stock, { id: 'free', name: 'ฟรี', unit: 'g', quantity: 10, unitCost: 0 }]);
    const plan = planBatchCompletion({ batch, actualIngredients: [{ stockId: 'free', qty: 1 }], yieldQty: 1, stockById: m });
    expect(plan.uncostedCount).toBe(1);
  });
});

describe('planBatchReversal', () => {
  const done = {
    status: 'done', outputStockId: 'sauce', yieldQty: 550, unitCost: 0.2, outputUnitCostBefore: 0,
    actualIngredients: [{ stockId: 'straw', qty: 520, unitCost: 0.2 }, { stockId: 'sugar', qty: 200, unitCost: 0.03 }],
  };
  it('returns ingredients and removes the output', () => {
    const m = map([...stock.filter((s) => s.id !== 'sauce'), { ...sauce, quantity: 550, unitCost: 0.2 }]);
    const plan = planBatchReversal({ batch: done, stockById: m });
    expect(plan.ok).toBe(true);
    expect(plan.increments).toEqual({ straw: 520, sugar: 200 });
    expect(plan.outputDecrement).toBe(550);
    // nothing left and no earlier cost → keep the last known cost (0 would make the menu look free)
    expect(plan.newOutputUnitCost).toBe(0.2);
    expect(plan.ingredientUnitCosts.straw).toBeCloseTo(0.2, 6);
  });
  it('un-averages the output cost when other stock remains', () => {
    // 100 @0.1 before, + 550 @0.2 → avg 0.184615…; removing the batch gives back 0.1
    const avg = (100 * 0.1 + 550 * 0.2) / 650;
    const m = map([...stock.filter((s) => s.id !== 'sauce'), { ...sauce, quantity: 650, unitCost: avg }]);
    const plan = planBatchReversal({ batch: { ...done, outputUnitCostBefore: 0.1 }, stockById: m });
    expect(plan.newOutputUnitCost).toBeCloseTo(0.1, 5);
  });
  it('only reverses done batches (no double return)', () => {
    expect(canReverse({ status: 'cancelled' })).toBe(false);
    expect(planBatchReversal({ batch: { ...done, status: 'cancelled' }, stockById: byId }).ok).toBe(false);
  });
});

describe('history helpers', () => {
  const batches = [
    { id: 'b1', status: 'done', outputStockId: 'sauce', date: '2026-09-20', doneAt: '2026-09-20T10:00:00Z', costTotal: 100 },
    { id: 'b2', status: 'done', outputStockId: 'sauce', date: '2026-09-23', doneAt: '2026-09-23T10:00:00Z', costTotal: 50.5 },
    { id: 'b3', status: 'planned', outputStockId: 'sauce', date: '2026-09-24' },
    { id: 'b4', status: 'done', outputStockId: 'slice', date: '2026-09-23', doneAt: '2026-09-23T08:00:00Z', costTotal: 10.25 },
    { id: 'b5', status: 'cancelled', outputStockId: 'slice', date: '2026-09-23', costTotal: 999 },
  ];
  it('lastBatchFor picks the latest done batch of that output', () => {
    expect(lastBatchFor('sauce', batches).id).toBe('b2');
    expect(lastBatchFor('sponge', batches)).toBeNull();
    const m = map([{ id: 'old-sauce', mergedInto: 'sauce' }, sauce]);
    expect(lastBatchFor('old-sauce', batches, m).id).toBe('b2');
  });
  it('summarizeProduction lists done batches of the day only', () => {
    const s = summarizeProduction(batches, '2026-09-23');
    expect(s.batches.map((b) => b.id)).toEqual(['b4', 'b2']);
    expect(s.costTotal).toBe(60.75);
  });
  it('buildBatchDoc drops empty lines and stores the expected yield', () => {
    const doc = buildBatchDoc({ date: '2026-09-24', output: sauce, rounds: 2, ingredients: [{ stockId: 'straw', qty: 1000, name: 'สตรอเบอรี่', unit: 'กรัม' }, { stockId: 'sugar', qty: 0 }] });
    expect(doc.status).toBe('planned');
    expect(doc.plannedIngredients).toHaveLength(1);
    expect(doc.expectedYield).toBe(1200);
    expect(doc.outputUnit).toBe('กรัม');
  });
  it('re-exports resolveStockId', () => {
    expect(resolveStockId('egg-old', byId)).toBe('egg');
  });
});
