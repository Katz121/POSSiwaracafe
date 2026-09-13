import { describe, expect, it } from 'vitest';
import { buildTrustedCheckout, isCakeSaleActive } from './checkoutLogic.js';

const menu = new Map([
  ['latte', { id: 'latte', name: 'ลาเต้', category: 'กาแฟ', price: 60, available: true, stockLinks: [] }],
  ['cake', { id: 'cake', name: 'เค้ก', category: 'เค้ก', price: 100, available: true, stockLinks: [] }],
]);
const noModifiers = new Map();
const baseSettings = { cakeSaleCategories: ['เค้ก'], vatEnabled: false };
const atBangkok = (iso) => new Date(iso);

describe('trusted checkout pricing', () => {
  it('ignores client prices and calculates from menu data', () => {
    const result = buildTrustedCheckout({
      requestedItems: [{ id: 'latte', quantity: 2, sweetness: 50, milkType: 'cow', price: 1 }],
      menuById: menu,
      modifiersById: noModifiers,
      settings: baseSettings,
    });
    expect(result.subtotal).toBe(120);
    expect(result.total).toBe(120);
    expect(result.items[0].price).toBe(60);
  });

  it('rejects a sold-out item', () => {
    const unavailable = new Map([['latte', { ...menu.get('latte'), available: false }]]);
    expect(() => buildTrustedCheckout({
      requestedItems: [{ id: 'latte', quantity: 1, sweetness: 100, milkType: 'cow' }],
      menuById: unavailable,
      modifiersById: noModifiers,
      settings: baseSettings,
    })).toThrow('item-unavailable');
  });

  it('rejects coffee-bean modifiers on a regular drink', () => {
    const modifiers = new Map([['bean', {
      id: 'bean', name: 'เมล็ดพิเศษ', group: 'เมล็ดกาแฟ', price: 70, available: true,
    }]]);
    expect(() => buildTrustedCheckout({
      requestedItems: [{
        id: 'latte', quantity: 1, sweetness: 100, milkType: 'cow', modifierIds: ['bean'],
      }],
      menuById: menu,
      modifiersById: modifiers,
      settings: baseSettings,
    })).toThrow('invalid-modifiers');
  });

  it('calculates cake happy hour in Bangkok time', () => {
    const settings = {
      ...baseSettings,
      cakeSaleEnabled: true,
      cakeSalePercent: 20,
      cakeSaleStart: '17:00',
      cakeSaleEnd: '20:00',
    };
    const now = atBangkok('2026-08-15T11:00:00.000Z'); // 18:00 Bangkok
    expect(isCakeSaleActive(settings, now)).toBe(true);
    const result = buildTrustedCheckout({
      requestedItems: [{ id: 'cake', quantity: 1, sweetness: null, milkType: null }],
      menuById: menu,
      modifiersById: noModifiers,
      settings,
      now,
    });
    expect(result.total).toBe(80);
    expect(result.items[0].originalPrice).toBe(100);
  });

  it('atomically validates points from the server-side member snapshot', () => {
    const result = buildTrustedCheckout({
      requestedItems: [{ id: 'latte', quantity: 1, sweetness: 100, milkType: 'oat' }],
      menuById: menu,
      modifiersById: noModifiers,
      settings: { ...baseSettings, redeemPointsThreshold: 100, redeemDiscountValue: 50 },
      member: { points: 120 },
      usePoints: true,
    });
    expect(result.redeemDeduct).toBe(100);
    expect(result.discount).toBe(50);
    expect(result.total).toBe(10);
  });

  it('rejects point redemption when current points are insufficient', () => {
    expect(() => buildTrustedCheckout({
      requestedItems: [{ id: 'latte', quantity: 1, sweetness: 100, milkType: 'cow' }],
      menuById: menu,
      modifiersById: noModifiers,
      settings: { ...baseSettings, redeemPointsThreshold: 100, redeemDiscountValue: 50 },
      member: { points: 90 },
      usePoints: true,
    })).toThrow('points-not-eligible');
  });
});

describe('การรวมสูตรเมนูกับตัวเลือก', () => {
  const beanMenu = new Map([
    ['americano', { id: 'americano', name: 'อเมริกาโน่', category: 'กาแฟ', price: 60,
      available: true, allowBeanModifier: true, modifierGroups: ['เมล็ดกาแฟ'],
      stockLinks: [{ stockId: 'bean', usage: 20 }, { stockId: 'cup', usage: 1 }] }],
  ]);
  const darkRoast = new Map([
    ['dark', { id: 'dark', name: 'คั่วเข้ม', group: 'เมล็ดกาแฟ', price: 60, available: true,
      stockLinks: [{ stockId: 'bean', usage: 18 }] }],
  ]);

  it('สต็อกตัวเดียวกันต้องบวกกัน ไม่ใช่ทับกัน (เมนู 20 + ตัวเลือก 18 = 38)', () => {
    const result = buildTrustedCheckout({
      requestedItems: [{ id: 'americano', quantity: 1, modifierIds: ['dark'], sweetness: 100, milkType: null }],
      menuById: beanMenu,
      modifiersById: darkRoast,
      settings: baseSettings,
    });
    const bean = result.items[0].stockLinks.find((l) => l.stockId === 'bean');
    expect(bean.usage).toBe(38);
  });

  it('สต็อกคนละตัวต้องอยู่ครบ ไม่ถูกกลืนหาย', () => {
    const result = buildTrustedCheckout({
      requestedItems: [{ id: 'americano', quantity: 1, modifierIds: ['dark'], sweetness: 100, milkType: null }],
      menuById: beanMenu,
      modifiersById: darkRoast,
      settings: baseSettings,
    });
    expect(result.items[0].stockLinks.map((l) => l.stockId).sort()).toEqual(['bean', 'cup']);
    expect(result.items[0].stockLinks.find((l) => l.stockId === 'cup').usage).toBe(1);
  });

  it('ปริมาณที่เก็บเป็นสตริงต้องบวกได้ ไม่ใช่ต่อสตริง', () => {
    const stringUsage = new Map([
      ['dark', { ...darkRoast.get('dark'), stockLinks: [{ stockId: 'bean', usage: '18' }] }],
    ]);
    const result = buildTrustedCheckout({
      requestedItems: [{ id: 'americano', quantity: 1, modifierIds: ['dark'], sweetness: 100, milkType: null }],
      menuById: beanMenu,
      modifiersById: stringUsage,
      settings: baseSettings,
    });
    expect(result.items[0].stockLinks.find((l) => l.stockId === 'bean').usage).toBe(38);
  });
});

describe('per-item sweetness toggle (sweetnessChoice)', () => {
  const bottled = { id: 'poh', name: 'โพ้ สปาร์กลิงที', category: 'Italian Soda', price: 159, available: true, stockLinks: [], sweetnessChoice: false };
  const sweetCake = { id: 'sweetcake', name: 'บิงซู', category: 'เค้ก', price: 90, available: true, stockLinks: [], sweetnessChoice: true };
  const menuWithToggles = new Map([...menu, ['poh', bottled], ['sweetcake', sweetCake]]);
  const run = (items) => buildTrustedCheckout({ requestedItems: items, menuById: menuWithToggles, modifiersById: noModifiers, settings: baseSettings });

  it('accepts a drink with sweetness switched off and no sweetness sent', () => {
    expect(run([{ id: 'poh', quantity: 1, sweetness: null, milkType: null }]).total).toBe(159);
  });
  it('rejects a sweetness value on an item that has sweetness switched off', () => {
    expect(() => run([{ id: 'poh', quantity: 1, sweetness: 50, milkType: null }])).toThrow('invalid-sweetness');
  });
  it('requires a sweetness level on a cake-category item switched on', () => {
    expect(run([{ id: 'sweetcake', quantity: 1, sweetness: 50, milkType: null }]).total).toBe(90);
    expect(() => run([{ id: 'sweetcake', quantity: 1, sweetness: null, milkType: null }])).toThrow('invalid-sweetness');
  });
  it('keeps the old default for menus without the toggle', () => {
    expect(() => run([{ id: 'latte', quantity: 1, sweetness: null, milkType: 'cow' }])).toThrow('invalid-sweetness');
    expect(run([{ id: 'cake', quantity: 1, sweetness: null, milkType: null }]).total).toBe(100);
  });
});


describe('points rewards', () => {
  const reward = { id: 'shot', name: 'เพิ่มช็อต', cost: 20, enabled: true };
  const settings = { ...baseSettings, pointsRewardsEnabled: true, pointsRewards: [reward] };
  const checkout = (extra = {}) => buildTrustedCheckout({
    requestedItems: [{ id: 'latte', quantity: 1, sweetness: 50, milkType: 'cow' }],
    menuById: menu, modifiersById: noModifiers, settings,
    member: { points: 20 }, redeemRewardId: 'shot', ...extra,
  });

  it('deducts the configured cost without discounting money', () => {
    expect(checkout()).toMatchObject({ redeemDeduct: 20, discount: 0, total: 60,
      pointsToAdd: 6, redeemedReward: { id: 'shot', name: 'เพิ่มช็อต', cost: 20 } });
  });
  it('keeps promotions and VAT when redeeming a reward', () => {
    expect(checkout({ settings: { ...settings, spendThreshold: 50, spendDiscount: 10, vatEnabled: true } }))
      .toMatchObject({ discount: 6, vat: 4, total: 58, redeemDeduct: 20 });
  });
  it('rejects simultaneous cash and reward redemption', () => {
    expect(() => checkout({ usePoints: true })).toThrow('redeem-conflict');
  });
  it.each([false, undefined, 'true'])('requires an explicit enabled switch: %s', (enabled) => {
    expect(() => checkout({ settings: { ...settings, pointsRewardsEnabled: enabled } })).toThrow('reward-unavailable');
  });
  it.each([[], null, [{ ...reward, enabled: false }], [{ ...reward, id: 'other' }]])('rejects unavailable rewards: %j', (pointsRewards) => {
    expect(() => checkout({ settings: { ...settings, pointsRewards } })).toThrow('reward-unavailable');
  });
  it.each([0, -1, 1.5, '20', NaN, Infinity])('rejects invalid cost: %s', (cost) => {
    expect(() => checkout({ settings: { ...settings, pointsRewards: [{ ...reward, cost }] } })).toThrow('reward-unavailable');
  });
  it.each([null, {}, { points: 19 }, { points: 'invalid' }])('requires eligible member: %j', (member) => {
    expect(() => checkout({ member })).toThrow('points-not-eligible');
  });
  it('defaults to no reward and preserves cash redemption with rewards disabled', () => {
    expect(checkout({ redeemRewardId: null, settings: baseSettings })).toMatchObject({ redeemedReward: null, redeemDeduct: 0, total: 60 });
    expect(checkout({ redeemRewardId: null, usePoints: true, member: { points: 50 },
      settings: { ...baseSettings, redeemPointsThreshold: 50, redeemDiscountValue: 50 } }))
      .toMatchObject({ redeemedReward: null, redeemDeduct: 50, discount: 50, total: 10 });
  });
});
