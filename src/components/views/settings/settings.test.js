import { describe, it, expect } from 'vitest';
import { SETTINGS_TABS, normalizeSettingsTab } from './tabs';
import { parseHash, buildHash } from '../../../navigation/routes';
import { draftFromConfig, buildSettingsPayload, modifierLinkHealth } from './settingsModel';

describe('settings tabs', () => {
  it('accepts every tab key and the legacy admin panel names', () => {
    SETTINGS_TABS.forEach((t) => expect(normalizeSettingsTab(t.key)).toBe(t.key));
    expect(normalizeSettingsTab('beanModifiers')).toBe('modifiers');
    expect(normalizeSettingsTab('quickExpenses')).toBe('quick');
    expect(normalizeSettingsTab('settings')).toBe('shop');
    expect(normalizeSettingsTab('daily')).toBe('close');
    expect(normalizeSettingsTab('backdatedSales')).toBe('data');
    expect(normalizeSettingsTab('nope')).toBeNull();
    expect(normalizeSettingsTab('')).toBeNull();
  });

  it('round-trips through the hash router as #/settings/<tab>', () => {
    expect(parseHash('#/settings/modifiers')).toEqual({ view: 'admin', params: { tab: 'modifiers' } });
    expect(buildHash('admin', { tab: 'security' })).toBe('#/settings/security');
    expect(buildHash('admin', {})).toBe('#/settings');
  });
});

describe('settings model', () => {
  // geminiApiKey เลิกใช้แล้ว (AI ย้ายไป Muse) · ยังอยู่ใน Firestore ได้ แต่ payload ห้ามเขียนทับ/ล้างมัน
  it('builds exactly the old config/settings payload from a draft (minus the retired Gemini key)', () => {
    const draft = draftFromConfig({
      adminPin: '9999', redeemPointsThreshold: '60', pointsExpiryMonths: 3, redeemDiscountValue: 40, ownGlassDiscount: 5,
      geminiApiKey: 'k', startingCash: 500, reviewUrl: 'https://x', shopName: 'S', receiptPaperWidth: 58,
      cakeSaleEnabled: true, cakeSaleCategories: ['Cake'], cakeSalePercent: 20, cakeSaleStart: '13:00', cakeSaleEnd: '17:00',
      comboEnabled: true, comboPercent: 10, spendThreshold: 300, spendDiscount: 5,
      pointsRewardsEnabled: true, pointsRewards: [{ id: 'a', name: ' วิป ', cost: '2.7', enabled: true }, { id: 'b', name: '  ', cost: 3 }],
    });
    const payload = buildSettingsPayload(draft, { serverTimestamp: () => 'TS' });
    expect(payload).not.toHaveProperty('geminiApiKey');
    expect(payload).toEqual({
      adminPin: '9999', redeemPointsThreshold: 60, pointsExpiryMonths: 3, redeemDiscountValue: 40,
      ownGlassDiscount: 5, startingCash: 500, reviewUrl: 'https://x', shopName: 'S', shopAddress: '', shopPhone: '', taxId: '',
      receiptFooter: '', receiptPaperWidth: 58, cakeSaleEnabled: true, cakeSaleCategories: ['Cake'], cakeSalePercent: 20,
      cakeSaleStart: '13:00', cakeSaleEnd: '17:00', comboEnabled: true, comboPercent: 10, spendThreshold: 300, spendDiscount: 5,
      pointsRewardsEnabled: true, pointsRewards: [{ id: 'a', name: 'วิป', cost: 2, enabled: true }], updatedAt: 'TS',
    });
  });

  it('flags modifiers whose stock links point at deleted stock', () => {
    const stock = [{ id: 's1', name: 'เมล็ด A', unitCost: 2 }];
    const health = modifierLinkHealth([
      { id: 'ok', stockLinks: [{ stockId: 's1', usage: 18 }] },
      { id: 'dead', stockLinks: [{ stockId: 'gone', usage: 18 }] },
      { id: 'partial', stockLinks: [{ stockId: 's1', usage: 1 }, { stockId: 'gone', usage: 1 }] },
      { id: 'none' },
    ], stock);
    expect(health.get('ok')).toMatchObject({ status: 'ok', broken: false, aliveCount: 1 });
    expect(health.get('dead')).toMatchObject({ status: 'dead', broken: true, deadCount: 1, aliveCount: 0 });
    expect(health.get('partial')).toMatchObject({ status: 'partial', broken: true, deadCount: 1, aliveCount: 1 });
    expect(health.get('none')).toMatchObject({ status: 'unlinked', broken: false });
    expect(health.get('ok').cost).toBe(36);
  });
});
