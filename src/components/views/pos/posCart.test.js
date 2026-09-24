import { describe, expect, it } from 'vitest';
import {
  getOptionGroups, needsOptionSheet, needsConfirmStep, defaultSelections,
  buildPlainLine, buildOptionLine, addPlainLine, addOptionLine, toOrderItems, repeatLines,
} from './posCart';
import { supportsMilkChoice } from '../../../config/constants';
import { supportsSweetnessChoice } from '../../../utils/promotions';

const settings = { cakeSaleCategories: ['Cake'] };
const dark = { id: 'dark', name: 'คั่วเข้ม', group: 'เมล็ดกาแฟ', price: 50, isDefault: true, stockLinks: [{ stockId: 'bean-dark', usage: 18 }] };
const light = { id: 'light', name: 'คั่วอ่อน', group: 'เมล็ดกาแฟ', price: 70, stockLinks: [{ stockId: 'bean-light', usage: 18 }] };
const orange = { id: 'orange', name: 'ส้มสด', group: 'ส้ม', price: 80 };
const mods = [dark, light, orange];
const latte = {
  id: 'latte', name: 'ลาเต้เย็น', category: 'Coffee', price: 50, allowBeanModifier: true, modifierGroups: ['เมล็ดกาแฟ'],
  image: 'data:image/jpeg;base64,' + 'A'.repeat(5000), description: 'หอมนม', posterImage: 'p.png', soldCount: 12, isFeatured: true,
  stockLinks: [{ stockId: 'milk', usage: 150 }],
};
const cake = { id: 'cake', name: 'ช็อคโกแลตมูส', category: 'Cake', price: 89, image: 'x.jpg', stockLinks: [{ stockId: 'cake', usage: 1 }] };

describe('menu display data never reaches an order line', () => {
  it('plain and option lines carry no image/description/poster/soldCount', () => {
    const lines = [buildPlainLine(cake, settings), buildOptionLine(latte, [dark], 100, 'oat', settings)];
    for (const line of lines) {
      for (const key of ['image', 'description', 'posterImage', 'soldCount', 'isFeatured', 'allowBeanModifier']) expect(line).not.toHaveProperty(key);
      expect(Object.values(line).includes(undefined)).toBe(false);
      expect(line.stockLinks.length).toBeGreaterThan(0);
    }
  });
  it('toOrderItems strips photos from lines of an old order being edited', () => {
    const oldLine = { ...latte, quantity: 2, note: 'x' };
    const [item] = toOrderItems([oldLine]);
    expect(item).not.toHaveProperty('image');
    expect(item).toMatchObject({ id: 'latte', quantity: 2, note: 'x', stockLinks: latte.stockLinks });
  });
});

describe('pricing is unchanged', () => {
  it('additive option price and merged recipe', () => {
    const line = buildOptionLine(latte, [light], 100, 'cow', settings);
    expect(line.price).toBe(70);
    expect(line.stockLinks).toEqual([{ stockId: 'milk', usage: 150 }, { stockId: 'bean-light', usage: 18 }]);
    expect(line.note).toBe('#คั่วอ่อน นมวัว หวาน 100%');
    expect(line.cartId).toBe('latte-light-sweet-100-milk-cow');
    expect(line.modifierIds).toEqual(['light']);
  });
  it('plain coffee rounds up to 5, cake keeps its price', () => {
    expect(buildPlainLine({ ...latte, price: 52 }, settings).price).toBe(55);
    expect(buildPlainLine(cake, settings)).toMatchObject({ price: 89, quantity: 1, note: '' });
  });
  it('merges repeated taps', () => {
    const a = addPlainLine(addPlainLine([], buildPlainLine(cake, settings)), buildPlainLine(cake, settings));
    expect(a).toHaveLength(1);
    expect(a[0].quantity).toBe(2);
    const l = buildOptionLine(latte, [dark], 100, 'oat', settings);
    const b = addOptionLine(addOptionLine(a, l), l);
    expect(b).toHaveLength(2);
    expect(b[1].quantity).toBe(2);
  });
});

describe('option sheet defaults (latte + oat in 4 taps)', () => {
  it('preselects the base bean so "เพิ่มลงตะกร้า" is enabled at once', () => {
    const groups = getOptionGroups(latte, mods);
    expect(groups.map((g) => g.name)).toEqual(['เมล็ดกาแฟ']);
    expect(defaultSelections(latte, groups)).toEqual({ 'เมล็ดกาแฟ': dark });
  });
  it('does not preselect a group whose cheapest option costs extra', () => {
    const item = { ...latte, price: 40, modifierGroups: ['ส้ม'] };
    expect(defaultSelections(item, getOptionGroups(item, mods))).toEqual({});
  });
});

describe('milk selection is never dropped (audit bug, PosView.jsx:1384)', () => {
  // One option group + milk choice + sweetness switched off for this menu.
  const noSweetLatte = { ...latte, sweetnessChoice: false };
  const groups = getOptionGroups(noSweetLatte, mods);
  const ctx = { groups, showSweetness: supportsSweetnessChoice(noSweetLatte, settings), showMilk: supportsMilkChoice(noSweetLatte) };

  it('reproduces the old rule: single group without sweetness skipped the confirm step', () => {
    const oldNeedsConfirm = ctx.showSweetness || groups.length > 1;
    expect(ctx.showMilk).toBe(true);
    expect(oldNeedsConfirm).toBe(false); // → bean tap called addToCartWithBean(item, mod) with milkType = null
  });
  it('now waits for the confirm tap and keeps the chosen milk', () => {
    expect(needsConfirmStep(ctx)).toBe(true);
    const line = buildOptionLine(noSweetLatte, [dark], null, 'oat', settings);
    expect(line).toMatchObject({ milkType: 'oat', milkLabel: 'นมโอ๊ต', sweetness: null, note: '#คั่วเข้ม นมโอ๊ต' });
  });
  it('a latte with no options and no sweetness still opens the sheet for milk, priced like a plain tap', () => {
    const bare = { id: 'l2', name: 'Latte', category: 'Coffee', price: 52, sweetnessChoice: false };
    expect(needsOptionSheet(bare, mods, settings)).toBe(true);
    const line = buildOptionLine(bare, [], null, 'oat', settings);
    expect(line).toMatchObject({ price: 52, milkType: 'oat', note: 'นมโอ๊ต' });
  });
  it('plain items still add on one tap', () => {
    expect(needsOptionSheet(cake, mods, settings)).toBe(false);
  });
});

describe('ซ้ำล่าสุด rebuilds from the current menu', () => {
  const menuById = new Map([[latte.id, latte], [cake.id, cake]]);
  it('uses today\'s price and skips lines it cannot resolve', () => {
    const order = { items: [
      { id: 'gone', name: 'x', price: 10, quantity: 1 },
      { id: 'cake', name: 'ช็อคโกแลตมูส', price: 50, quantity: 2 },
      { id: 'latte', price: 70, quantity: 1, modifierIds: ['light'], sweetness: 50, milkType: 'oat' },
      { id: 'latte', price: 70, quantity: 1, beanModifier: '#คั่วอ่อน' }, // old order: no modifierIds
    ] };
    const lines = repeatLines(order, { menuById, beanModifiers: mods, saleSettings: settings });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ id: 'cake', price: 89, quantity: 2 });
    expect(lines[1]).toMatchObject({ id: 'latte', price: 70, sweetness: 50, milkType: 'oat', cartId: 'latte-light-sweet-50-milk-oat' });
  });
});
