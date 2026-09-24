import { describe, it, expect } from 'vitest';
import { applyMilkSwap, defaultMilkSwap, isMilkSwapSet, resolveMilkSwap } from './milkSwap.js';

const stock = [
  { id: 'cow', name: 'นมจืด' },
  { id: 'fresh', name: ' นมสด ' },
  { id: 'foam', name: 'นมตีฟอง' },
  { id: 'oat', name: 'นมโอ๊ต' },
  { id: 'oatside', name: 'นม oatside' },
  { id: 'condensed', name: 'นมข้นหวาน' },
  { id: 'cow-old', name: 'นมจืด', mergedInto: 'cow', archived: true },
  { id: 'cup', name: 'แก้ว 16oz' },
];
const swap = { oat: { from: ['cow', 'fresh', 'foam'], to: 'oat' } };

describe('defaultMilkSwap / resolveMilkSwap', () => {
  it('derives cow milks by exact name and นมโอ๊ต as target, skipping merged stock', () => {
    expect(defaultMilkSwap(stock)).toEqual({ oat: { from: ['cow', 'fresh', 'foam'], to: 'oat' } });
  });

  it('no oat stock → to is null', () => {
    expect(defaultMilkSwap([{ id: 'cow', name: 'นมจืด' }]).oat.to).toBeNull();
    expect(defaultMilkSwap().oat).toEqual({ from: [], to: null });
  });

  it('uses the saved setting when valid, default otherwise', () => {
    const saved = { oat: { from: ['cow'], to: 'oatside' } };
    expect(isMilkSwapSet(saved)).toBe(true);
    expect(resolveMilkSwap(saved, stock)).toEqual({ oat: { from: ['cow'], to: 'oatside' }, isDefault: false });
    expect(resolveMilkSwap(undefined, stock)).toEqual({ ...defaultMilkSwap(stock), isDefault: true });
    expect(resolveMilkSwap({ oat: { from: ['cow'] } }, stock).isDefault).toBe(true);
  });

  it('saved to: "" means switched off, not the default', () => {
    const off = resolveMilkSwap({ oat: { from: [], to: '' } }, stock);
    expect(off).toEqual({ oat: { from: [], to: null }, isDefault: false });
    expect(applyMilkSwap({ milkType: 'oat', stockLinks: [{ stockId: 'cow', usage: 1 }] }, off)).toEqual([{ stockId: 'cow', usage: 1 }]);
  });

  it('drops the target from its own from-list', () => {
    expect(resolveMilkSwap({ oat: { from: ['cow', 'oat'], to: 'oat' } }, stock).oat.from).toEqual(['cow']);
  });
});

describe('applyMilkSwap', () => {
  const links = [{ stockId: 'cow', usage: 150 }, { stockId: 'cup', usage: 1 }];

  it('oat line: cow milk link becomes oat milk, same usage, order kept', () => {
    expect(applyMilkSwap({ milkType: 'oat', stockLinks: links }, swap)).toEqual([
      { stockId: 'oat', usage: 150 }, { stockId: 'cup', usage: 1 },
    ]);
  });

  it('does not mutate the original links', () => {
    const item = { milkType: 'oat', stockLinks: [{ stockId: 'cow', usage: 150 }] };
    applyMilkSwap(item, swap);
    expect(item.stockLinks).toEqual([{ stockId: 'cow', usage: 150 }]);
  });

  it('cow / missing milkType / no config → original links untouched', () => {
    expect(applyMilkSwap({ milkType: 'cow', stockLinks: links }, swap)).toBe(links);
    expect(applyMilkSwap({ stockLinks: links }, swap)).toBe(links);
    expect(applyMilkSwap({ milkType: 'oat', stockLinks: links }, undefined)).toBe(links);
    expect(applyMilkSwap({ milkType: 'oat', stockLinks: links }, { oat: { from: ['cow'], to: null } })).toBe(links);
  });

  it('several cow milks + existing oat merge into one oat link by summing', () => {
    const item = { milkType: 'oat', stockLinks: [
      { stockId: 'cup', usage: 1 },
      { stockId: 'cow', usage: 100 },
      { stockId: 'foam', usage: '50' },
      { stockId: 'oat', usage: 10 },
    ] };
    expect(applyMilkSwap(item, swap)).toEqual([{ stockId: 'cup', usage: 1 }, { stockId: 'oat', usage: 160 }]);
  });

  it('non-cow milk (นมข้นหวาน) is never swapped', () => {
    const item = { milkType: 'oat', stockLinks: [{ stockId: 'condensed', usage: 20 }] };
    expect(applyMilkSwap(item, swap)).toEqual([{ stockId: 'condensed', usage: 20 }]);
  });

  it('with stockById, a link to a doc merged into cow milk is swapped too', () => {
    const byId = new Map(stock.map((s) => [s.id, s]));
    const item = { milkType: 'oat', stockLinks: [{ stockId: 'cow-old', usage: 120 }] };
    expect(applyMilkSwap(item, swap, byId)).toEqual([{ stockId: 'oat', usage: 120 }]);
    expect(applyMilkSwap(item, swap)).toEqual([{ stockId: 'cow-old', usage: 120 }]);
  });
});
