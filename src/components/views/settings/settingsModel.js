// Settings draft ⇄ `config/settings` payload (moved verbatim from AdminView so
// the exact Firestore write is unit-tested), plus read-only modifier link health.

import { classifyLinks } from '../../../utils/stockAudit';
import {
  DEFAULT_ADMIN_PIN,
  DEFAULT_REDEEM_POINTS_THRESHOLD,
  DEFAULT_REDEEM_DISCOUNT_VALUE,
  DEFAULT_OWN_GLASS_DISCOUNT,
  DEFAULT_STARTING_CASH,
  DEFAULT_CAKE_SALE_PERCENT,
  DEFAULT_CAKE_SALE_START,
  DEFAULT_CAKE_SALE_END,
  DEFAULT_COMBO_PERCENT,
} from '../../../config/constants';

/** Config context values → the editable draft (same fallbacks as before). */
export function draftFromConfig(c = {}) {
  return {
    adminPin: c.adminPin || DEFAULT_ADMIN_PIN,
    redeemPointsThreshold: Number(c.redeemPointsThreshold) || DEFAULT_REDEEM_POINTS_THRESHOLD,
    pointsExpiryMonths: c.pointsExpiryMonths || 0,
    redeemDiscountValue: Number(c.redeemDiscountValue) || DEFAULT_REDEEM_DISCOUNT_VALUE,
    ownGlassDiscount: Number(c.ownGlassDiscount) || DEFAULT_OWN_GLASS_DISCOUNT,
    startingCash: Number(c.startingCash) || DEFAULT_STARTING_CASH,
    reviewUrl: c.reviewUrl || '',
    shopName: c.shopName || '',
    shopAddress: c.shopAddress || '',
    shopPhone: c.shopPhone || '',
    taxId: c.taxId || '',
    receiptFooter: c.receiptFooter || '',
    receiptPaperWidth: c.receiptPaperWidth || 80,
    cakeSaleEnabled: c.cakeSaleEnabled === true,
    cakeSaleCategories: Array.isArray(c.cakeSaleCategories) ? c.cakeSaleCategories : [],
    cakeSalePercent: Number(c.cakeSalePercent) || DEFAULT_CAKE_SALE_PERCENT,
    cakeSaleStart: c.cakeSaleStart || DEFAULT_CAKE_SALE_START,
    cakeSaleEnd: c.cakeSaleEnd || DEFAULT_CAKE_SALE_END,
    comboEnabled: c.comboEnabled === true,
    comboPercent: Number(c.comboPercent) || DEFAULT_COMBO_PERCENT,
    spendThreshold: Number(c.spendThreshold) || 0,
    spendDiscount: Number(c.spendDiscount) || 0,
    pointsRewardsEnabled: c.pointsRewardsEnabled === true,
    pointsRewards: Array.isArray(c.pointsRewards) ? c.pointsRewards : [],
  };
}

/** Draft → the `setDoc(config/settings, payload, { merge: true })` body. Unchanged. */
export function buildSettingsPayload(settingsDraft, { serverTimestamp }) {
  return {
    adminPin: settingsDraft.adminPin,
    redeemPointsThreshold: Number(settingsDraft.redeemPointsThreshold),
    pointsExpiryMonths: Number(settingsDraft.pointsExpiryMonths || 0),
    redeemDiscountValue: Number(settingsDraft.redeemDiscountValue),
    ownGlassDiscount: Number(settingsDraft.ownGlassDiscount),
    startingCash: Number(settingsDraft.startingCash),
    reviewUrl: String(settingsDraft.reviewUrl || ''),
    shopName: String(settingsDraft.shopName || ''),
    shopAddress: String(settingsDraft.shopAddress || ''),
    shopPhone: String(settingsDraft.shopPhone || ''),
    taxId: String(settingsDraft.taxId || ''),
    receiptFooter: String(settingsDraft.receiptFooter || ''),
    receiptPaperWidth: Number(settingsDraft.receiptPaperWidth) === 58 ? 58 : 80,
    cakeSaleEnabled: settingsDraft.cakeSaleEnabled === true,
    cakeSaleCategories: Array.isArray(settingsDraft.cakeSaleCategories) ? settingsDraft.cakeSaleCategories : [],
    cakeSalePercent: Number(settingsDraft.cakeSalePercent) || 0,
    cakeSaleStart: String(settingsDraft.cakeSaleStart || DEFAULT_CAKE_SALE_START),
    cakeSaleEnd: String(settingsDraft.cakeSaleEnd || DEFAULT_CAKE_SALE_END),
    comboEnabled: settingsDraft.comboEnabled === true,
    comboPercent: Number(settingsDraft.comboPercent) || 0,
    spendThreshold: Number(settingsDraft.spendThreshold) || 0,
    spendDiscount: Number(settingsDraft.spendDiscount) || 0,
    pointsRewardsEnabled: settingsDraft.pointsRewardsEnabled === true,
    pointsRewards: (settingsDraft.pointsRewards || [])
      .map(r => ({ ...r, name: String(r.name || '').trim(), cost: Math.max(1, Math.floor(Number(r.cost) || 1)) }))
      .filter(r => r.name !== ''),
    updatedAt: serverTimestamp(),
  };
}

/**
 * Per modifier: link status from stockAudit.classifyLinks (read-only) plus the
 * ingredient cost of live links (mirrors the menu cost calc).
 * `broken` = at least one link points at stock that was deleted.
 */
export function modifierLinkHealth(beanModifiers = [], stock = []) {
  const stockById = new Map(stock.map((s) => [s.id, s]));
  return new Map(beanModifiers.map((mod) => {
    const { status, alive, dead } = classifyLinks(mod.stockLinks, stockById);
    const cost = (mod.stockLinks || []).reduce((sum, link) => {
      const s = stockById.get(link?.stockId);
      return sum + (Number(s?.unitCost || 0) * Number(link?.usage || 0));
    }, 0) + Number(mod.additionalCost || 0);
    return [mod.id, {
      status,
      broken: dead.length > 0,
      aliveCount: alive.length,
      deadCount: dead.length,
      deadIds: new Set(dead.map((d) => d.stockId)),
      cost,
    }];
  }));
}
