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
