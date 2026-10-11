import { describe, it, expect } from 'vitest';
import {
  resolveStockId, suggestDuplicates, planMerge, mergedUnitCost, normalizeUnit, planUnitFixes,
  normalizeStockName, editDistance, isArchivedStock, activeStock,
} from './stockMerge.js';

const map = (list) => new Map(list.map((s) => [s.id, s]));

describe('resolveStockId', () => {
  it('returns the id itself when not merged', () => {
    expect(resolveStockId('a', map([{ id: 'a' }]))).toBe('a');
  });
  it('follows a mergedInto chain to the end', () => {
    const m = map([{ id: 'a', mergedInto: 'b' }, { id: 'b', mergedInto: 'c' }, { id: 'c' }]);
    expect(resolveStockId('a', m)).toBe('c');
    expect(resolveStockId('b', m)).toBe('c');
  });
  it('stops on a cycle instead of looping forever', () => {
    const m = map([{ id: 'a', mergedInto: 'b' }, { id: 'b', mergedInto: 'a' }]);
    expect(['a', 'b']).toContain(resolveStockId('a', m));
    const self = map([{ id: 'x', mergedInto: 'x' }]);
    expect(resolveStockId('x', self)).toBe('x');
  });
  it('keeps unknown ids (dead links stay dead)', () => {
    expect(resolveStockId('ghost', map([]))).toBe('ghost');
    expect(resolveStockId('a', map([{ id: 'a', mergedInto: 'gone' }]))).toBe('gone');
  });
});

describe('normalizeUnit / planUnitFixes', () => {
  it('maps the กรัท typo to กรัม', () => {
    expect(normalizeUnit('กรัท')).toBe('กรัม');
    expect(normalizeUnit(' กรัม ')).toBe('กรัม');
    expect(normalizeUnit('ฟอง')).toBe('ฟอง');
  });
  it('lists only items whose unit changes', () => {
    const fixes = planUnitFixes([
      { id: '1', name: 'แป้งกวนไส้', unit: 'กรัท' },
      { id: '2', name: 'น้ำตาล', unit: 'กรัม' },
      { id: '3', name: 'ไข่', unit: 'ฟอง' },
      { id: '4', name: 'นม', unit: 'ml' },
      { id: '5', name: 'ไม่มีหน่วย' },
    ]);
    expect(fixes).toEqual([
      { id: '1', name: 'แป้งกวนไส้', from: 'กรัท', to: 'กรัม' },
      { id: '4', name: 'นม', from: 'ml', to: 'มล.' },
    ]);
  });
});

describe('suggestDuplicates', () => {
  const stock = [
    { id: 'egg', name: 'ไข่ไก่', unit: 'ฟอง', quantity: 297 },
    { id: 'egg2', name: 'ไขไก่', unit: 'ฟอง', quantity: 69.8 },
    { id: 'sug', name: 'น้ำตาลเบเกอรี่', unit: 'กรัม', quantity: 5509 },
    { id: 'sug2', name: 'น้ำตาลทรายเบเกอรี่', unit: 'กรัม', quantity: 9924 },
    { id: 'whip', name: 'วิปครีม กล่องเหลือง', unit: 'กรัม', quantity: 4000 },
    { id: 'whip2', name: 'วิปปิ้งครีม กล่องเหลือง', unit: 'กรัม', quantity: 1860 },
    { id: 'fill', name: 'แป้งกวนไส้', unit: 'กรัท', quantity: 418 },
    { id: 'fill2', name: 'แป้งกวนใส้', unit: 'กรัม', quantity: 500 },
    { id: 'white', name: 'น้ำตาลทราย', unit: 'กรัม', quantity: 11942 },
    { id: 'red', name: 'น้ำตาลทรายแดง', unit: 'กรัม', quantity: 1000 },
    { id: 'eggkg', name: 'ไข่ไก่', unit: 'กิโลกรัม', quantity: 1 },
    { id: 'old', name: 'ไข่ไก่', unit: 'ฟอง', archived: true, mergedInto: 'egg' },
  ];
  const found = suggestDuplicates(stock);
  const has = (a, b) => found.find((p) => p.ids.includes(a) && p.ids.includes(b));

  it('finds the known real duplicates as strong', () => {
    expect(has('egg', 'egg2')?.strength).toBe('strong');
    expect(has('sug', 'sug2')?.strength).toBe('strong');
    expect(has('whip', 'whip2')?.strength).toBe('strong');
    expect(has('fill', 'fill2')?.strength).toBe('strong'); // กรัท ≡ กรัม
  });
  it('marks a trailing qualifier as weak only', () => {
    expect(has('white', 'red')?.strength).toBe('weak');
  });
  it('skips different sizes and short near-names', () => {
    const extra = suggestDuplicates([
      { id: 'b1', name: 'กล่องเค้ก ขนาด 1 ปอนด์', unit: 'ชิ้น' },
      { id: 'b2', name: 'กล่องเค้ก ขนาด 2 ปอนด์', unit: 'ชิ้น' },
      { id: 'c1', name: 'แก้ว 16 oz', unit: 'ใบ' },
      { id: 'c2', name: 'แก้ว 14 oz', unit: 'ใบ' },
      { id: 'm1', name: 'นมจืด', unit: 'กรัม' },
      { id: 'm2', name: 'เนยจืด', unit: 'กรัม' },
      { id: 'd1', name: 'น้ำดื่ม', unit: 'ขวด' },
      { id: 'd2', name: 'น้ำดื้ม', unit: 'ขวด' },
      { id: 'e1', name: 'บลูเบอรี่', unit: 'กรัม' },
      { id: 'e2', name: 'บลูเบอรี่สด', unit: 'กรัม' },
    ]);
    const pair = (a, b) => extra.find((p) => p.ids.includes(a) && p.ids.includes(b));
    expect(pair('b1', 'b2')).toBeUndefined();
    expect(pair('c1', 'c2')).toBeUndefined();
    expect(pair('m1', 'm2')).toBeUndefined();
    expect(pair('d1', 'd2')?.strength).toBe('strong');
    expect(pair('e1', 'e2')?.strength).toBe('weak');
  });
  it('never pairs different units or archived items', () => {
    expect(has('egg', 'eggkg')).toBeUndefined();
    expect(has('egg', 'old')).toBeUndefined();
  });
  it('puts the larger on-hand item first (default keep)', () => {
    expect(has('egg', 'egg2').ids[0]).toBe('egg');
  });
  it('strong suggestions come before weak ones', () => {
    const firstWeak = found.findIndex((p) => p.strength === 'weak');
    expect(found.slice(firstWeak).every((p) => p.strength === 'weak')).toBe(true);
  });
  it('helpers', () => {
    expect(normalizeStockName(' วิปครีม (กล่อง เหลือง) ')).toBe('วิปครีมกล่องเหลือง');
    expect(editDistance('ไข่ไก่', 'ไขไก่')).toBe(1);
    expect(isArchivedStock({ mergedInto: 'x' })).toBe(true);
    expect(activeStock(stock).some((s) => s.id === 'old')).toBe(false);
  });
});

describe('mergedUnitCost', () => {
  it('weights by on-hand quantity (same rule as intake)', () => {
    // 297 @4.988679 + 69.8 @5.075 → 5.005077…
    const c = mergedUnitCost([{ quantity: 297, unitCost: 4.988679 }, { quantity: 69.8, unitCost: 5.075 }]);
    expect(c).toBeCloseTo((297 * 4.988679 + 69.8 * 5.075) / 366.8, 6);
  });
  it('skips negative quantities and zero/unknown costs', () => {
    expect(mergedUnitCost([{ quantity: 10, unitCost: 2 }, { quantity: -5, unitCost: 100 }, { quantity: 10, unitCost: 0 }])).toBe(2);
  });
  it('falls back to the first known cost when nothing is on hand', () => {
    expect(mergedUnitCost([{ quantity: -1, unitCost: 0 }, { quantity: 0, unitCost: '3.5' }])).toBe(3.5);
    expect(mergedUnitCost([{ quantity: 0 }, { quantity: 0 }])).toBe(0);
  });
});

describe('planMerge', () => {
  const stock = [
    { id: 'egg', name: 'ไข่ไก่', unit: 'ฟอง', quantity: 10, unitCost: 5, purchaseAliases: [{ title: 'ไข่เบอร์ 2' }] },
    { id: 'egg2', name: 'ไขไก่', unit: 'ฟอง', quantity: 4, unitCost: 6 },
    { id: 'older', name: 'ไข่ (เก่า)', unit: 'ฟอง', quantity: 0, mergedInto: 'egg2', archived: true },
    { id: 'flour', name: 'แป้ง', unit: 'กรัม', quantity: 100, unitCost: 0.05 },
    { id: 'sauce', name: 'ซอส', unit: 'กรัม', kind: 'prep', quantity: 0, recipe: { expectedYield: 500, ingredients: [{ stockId: 'egg2', qty: 2 }, { stockId: 'egg', qty: 1 }, { stockId: 'flour', qty: 50 }] } },
  ];
  const menu = [
    { id: 'm1', name: 'มูส', stockLinks: [{ stockId: 'egg2', usage: 0.2 }, { stockId: 'flour', usage: 9 }] },
    { id: 'm2', name: 'ทั้งสองตัว', stockLinks: [{ stockId: 'egg', usage: 0.1 }, { stockId: 'egg2', usage: 0.2 }] },
    { id: 'm3', name: 'ไม่เกี่ยว', stockLinks: [{ stockId: 'flour', usage: 1 }] },
  ];
  const beanModifiers = [{ id: 'b1', name: '#ไข่', stockLinks: [{ stockId: 'egg2', usage: 1 }] }];
  const plan = planMerge({ keepId: 'egg', mergeIds: ['egg2'], stock, menu, beanModifiers });

  it('sums quantity and weights the cost', () => {
    expect(plan.ok).toBe(true);
    expect(plan.keep.update.quantity).toBe(14);
    expect(plan.keep.update.unitCost).toBeCloseTo((10 * 5 + 4 * 6) / 14, 6);
  });
  it('archives merged docs instead of deleting', () => {
    expect(plan.merged).toEqual([expect.objectContaining({ id: 'egg2', update: { mergedInto: 'egg', archived: true, quantity: 0 } })]);
  });
  it('re-points older merges (chains) straight to the keeper', () => {
    expect(plan.chains).toEqual([{ id: 'older', mergedInto: 'egg' }]);
  });
  it('rewrites menu links and sums usage when a menu had both ids', () => {
    const m1 = plan.menuUpdates.find((u) => u.id === 'm1');
    expect(m1.stockLinks).toEqual([{ stockId: 'egg', usage: 0.2 }, { stockId: 'flour', usage: 9 }]);
    const m2 = plan.menuUpdates.find((u) => u.id === 'm2');
    expect(m2.stockLinks).toEqual([{ stockId: 'egg', usage: 0.3 }]);
    expect(plan.menuUpdates.find((u) => u.id === 'm3')).toBeUndefined();
    expect(plan.summary.menuCount).toBe(2);
  });
  it('rewrites bean modifiers and prep recipes', () => {
    expect(plan.modifierUpdates).toEqual([{ id: 'b1', name: '#ไข่', stockLinks: [{ stockId: 'egg', usage: 1 }] }]);
    const sauce = plan.recipeUpdates.find((r) => r.id === 'sauce');
    expect(sauce.recipe.ingredients).toEqual([{ stockId: 'egg', qty: 3 }, { stockId: 'flour', qty: 50 }]);
    expect(sauce.recipe.expectedYield).toBe(500);
  });
  it('keeps the old name as a purchase alias so receipts land on the keeper', () => {
    expect(plan.keep.update.purchaseAliases).toEqual([{ title: 'ไข่เบอร์ 2' }, { title: 'ไขไก่' }]);
  });
  it('refuses bad input', () => {
    expect(planMerge({ keepId: 'egg', mergeIds: ['flour'], stock, menu }).ok).toBe(false); // unit
    expect(planMerge({ keepId: 'egg', mergeIds: [], stock }).ok).toBe(false);
    expect(planMerge({ keepId: 'egg', mergeIds: ['egg'], stock }).ok).toBe(false);
    expect(planMerge({ keepId: 'older', mergeIds: ['egg'], stock }).ok).toBe(false); // archived keeper
    expect(planMerge({ keepId: 'nope', mergeIds: ['egg'], stock }).ok).toBe(false);
  });
  it('accepts กรัท ≡ กรัม and normalizes the keeper unit', () => {
    const p = planMerge({
      keepId: 'a',
      mergeIds: ['b'],
      stock: [{ id: 'a', name: 'แป้งกวนไส้', unit: 'กรัท', quantity: 418.4, unitCost: 0.074 }, { id: 'b', name: 'แป้งกวนใส้', unit: 'กรัม', quantity: 500, unitCost: 0.074 }],
    });
    expect(p.ok).toBe(true);
    expect(p.keep.update.unit).toBe('กรัม');
    expect(p.keep.update.quantity).toBe(918.4);
    expect(p.keep.update.unitCost).toBe(0.074);
  });
  it('merged negative stock still counts toward the total', () => {
    const p = planMerge({ keepId: 'a', mergeIds: ['b'], stock: [{ id: 'a', name: 'x', unit: 'ชิ้น', quantity: 10, unitCost: 2 }, { id: 'b', name: 'y', unit: 'ชิ้น', quantity: -3, unitCost: 9 }] });
    expect(p.keep.update.quantity).toBe(7);
    expect(p.keep.update.unitCost).toBe(2);
  });
});

describe('findStockUsers / isRetiredStock', () => {
  it('splits users into on-sale (must fix) and hidden (warn only)', async () => {
    const { findStockUsers, isRetiredStock, isArchivedStock } = await import('./stockMerge.js');
    const menu = [
      { name: 'ลาเต้', stockLinks: [{ stockId: 's1', usage: 1 }] },
      { name: 'เมนูเก่า', available: false, stockLinks: [{ stockId: 's1', usage: 1 }] },
      { name: 'ชา', stockLinks: [{ stockId: 's2', usage: 1 }] },
    ];
    const beanModifiers = [{ name: 'คั่วอ่อน', stockLinks: [{ stockId: 's1', usage: 18 }] }];
    expect(findStockUsers('s1', { menu, beanModifiers })).toEqual({ active: ['เมนู ลาเต้', 'ตัวเลือก คั่วอ่อน'], hidden: ['เมนู เมนูเก่า'] });
    expect(findStockUsers('zz', { menu, beanModifiers })).toEqual({ active: [], hidden: [] });
    expect(isRetiredStock({ archived: true })).toBe(true);
    expect(isRetiredStock({ archived: true, mergedInto: 'x' })).toBe(false);
    expect(isArchivedStock({ archived: true })).toBe(true);
  });
});
