import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCartLine, calculateCartTotals, replaceCartLine, getCartCrossSell } from './customerCart';
import { buildCheckoutItems } from '../services/checkoutService';

const settings = { cakeSaleCategories: ['Cake'], comboEnabled: true, comboPercent: 10, spendThreshold: 200, spendDiscount: 20 };
const drink = { id: 'drink', name: 'Latte', category: 'Coffee', price: 100 };
const cake = { id: 'cake', name: 'Cake', category: 'Cake', price: 100 };
const totals = (cart, config = settings, points = false) => calculateCartTotals(cart, config, points, points, 50, true);
afterEach(() => vi.useRealTimers());

describe('shared customer cart pricing', () => {
  it('edits exactly one line, retaining quantity and note even when another line matches', () => {
    const old = { ...buildCartLine(drink, null, 100), quantity: 3, note: 'Personal note' };
    const replacement = buildCartLine(drink, null, 25);
    const cart = replaceCartLine([old, replacement], old.cartId, replacement, 'edit-unique');
    expect(cart[0]).toMatchObject({ sweetness: 25, quantity: 3, note: 'หวาน 25% Personal note', cartId: 'edit-unique' });
    expect(cart[1]).toBe(replacement);
    expect(cart.reduce((sum, line) => sum + line.quantity, 0)).toBe(4);
    expect(cart.some((line) => line.cartId === old.cartId)).toBe(false);
  });
  it('offers at most two available cakes by popularity with exact net totals', () => {
    const cart = [buildCartLine(drink)];
    const cakes = [1, 3, 2].map((soldCount) => ({ ...cake, id: String(soldCount), soldCount }));
    const result = getCartCrossSell(cart, [...cakes, { ...cake, soldCount: 99, available: false }], [], settings, false, false, 50, true);
    expect(result.map((entry) => entry.item.id)).toEqual(['3', '2']);
    expect(result[0].extra).toBe(64);
    expect(getCartCrossSell([], cakes, [], settings)).toEqual([]);
    expect(getCartCrossSell([...cart, buildCartLine(cake)], cakes, [], settings)).toEqual([]);
    expect(getCartCrossSell(cart, cakes, [], { ...settings, comboEnabled: false })).toEqual([]);
    expect(getCartCrossSell(cart, cakes, [], { ...settings, comboPercent: 0 })).toEqual([]);
    expect(getCartCrossSell(cart, [], [], settings)).toEqual([]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 11, 18));
    expect(getCartCrossSell(cart, cakes, [], { ...settings, cakeSaleEnabled: true, cakeSalePercent: 20, cakeSaleStart: '17:00', cakeSaleEnd: '20:00' })).toEqual([]);
  });
  it('uses the winning spend discount for net extra, with VAT and points unchanged', () => {
    const cart = [buildCartLine(drink)];
    const after = totals([...cart, buildCartLine(cake)]);
    expect(after).toMatchObject({ subtotal: 200, comboDiscount: 0, spendDiscount: 40, vat: 11, total: 171 });
    expect(after.total - totals(cart).total).toBe(64);
    expect(totals([...cart, buildCartLine(cake)], settings, true)).toMatchObject({ pointsDiscount: 50, total: 118 });
  });
  it('keeps combo on a tie and clamps excessive points to zero payable', () => {
    const config = { ...settings, spendDiscount: 10 };
    expect(totals([buildCartLine(drink), buildCartLine(cake)], config)).toMatchObject({ comboDiscount: 20, spendDiscount: 0 });
    expect(calculateCartTotals([buildCartLine({ ...drink, price: 20 })], settings, true, true, 50, true).total).toBe(0);
  });
  it('retains Happy Hour item pricing and non-cake spend base', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 11, 18));
    const config = { ...settings, cakeSaleEnabled: true, cakeSalePercent: 50, cakeSaleStart: '17:00', cakeSaleEnd: '20:00', spendThreshold: 150 };
    const line = buildCartLine(cake, null, null, null, config);
    expect(line).toMatchObject({ price: 50, originalPrice: 100 });
    expect(line.note).toContain('Happy Hour');
    expect(totals([buildCartLine(drink), line], config)).toMatchObject({ comboDiscount: 0, spendDiscount: 20, total: 139 });
  });
  it('builds additive modifier pricing, merged stock, labels, and the existing checkout shape', () => {
    const item = { ...drink, price: 60, allowBeanModifier: true, stockLinks: [{ stockId: 'bean', usage: 10 }] };
    const mods = [{ id: 'premium', name: 'Premium', price: 75, stockLinks: [{ stockId: 'bean', usage: 5 }] }, { id: 'fruit', name: 'Fruit', price: 80 }];
    const line = buildCartLine(item, mods, 50, 'oat');
    expect(line.price).toBe(95);
    expect(line.stockLinks).toEqual([{ stockId: 'bean', usage: 15 }]);
    expect(line.beanModifier).toBe('#Premium #Fruit');
    expect(buildCheckoutItems([line])[0]).toEqual({ id: 'drink', quantity: 1, modifierIds: ['premium', 'fruit'], sweetness: 50, milkType: 'oat', note: line.note });
    expect(buildCartLine({ ...item, price: 62 }).price).toBe(65);
  });
});

describe('line notes when options are rebuilt', () => {
  const base = { id: 'd1', name: 'บ๊วย', price: 50, category: 'Drinks' };
  it('replaces stale sweetness text and keeps the customer words', async () => {
    const { buildCartLine: build, replaceCartLine: replace } = await import('./customerCart');
    const old = { ...build(base, null, 50), cartId: 'a' };
    old.note = `${old.note} ไม่ใส่น้ำแข็ง`;
    const edited = replace([old], 'a', build(base, null, 25), 'b')[0];
    expect(edited.note).toBe('หวาน 25% ไม่ใส่น้ำแข็ง');
    expect(edited.sweetness).toBe(25);
  });
  it('drops an ended Happy Hour tag and old modifier names', async () => {
    const { customerNotePart, mergeLineNote } = await import('./customerCart');
    const old = { note: '#เมล็ดเก่า นมโอ๊ต หวาน 50% [Happy Hour เค้ก -20%] แยกแก้ว', beanModifier: '#เมล็ดเก่า', milkLabel: 'นมโอ๊ต', sweetness: 50 };
    expect(customerNotePart(old)).toBe('แยกแก้ว');
    expect(mergeLineNote({ note: '#เมล็ดใหม่ หวาน 50%' }, old)).toBe('#เมล็ดใหม่ หวาน 50% แยกแก้ว');
    expect(mergeLineNote({ note: '' }, { note: 'ไม่ใส่น้ำแข็ง' })).toBe('ไม่ใส่น้ำแข็ง');
  });
});
