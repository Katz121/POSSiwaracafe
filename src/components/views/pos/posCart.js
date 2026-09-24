// Pure cart-line logic for the staff POS (no React, unit-tested in posCart.test.js).
// Pricing rules are unchanged from the old PosView inline code; the only fixes are
// (a) order lines no longer copy menu display data (pickOrderLineFields) and
// (b) a latte's milk choice can no longer be dropped (see needsConfirmStep).
import {
  roundUpTo5, getModifierGroups, isBaseModifier, computeModifierPrice, supportsMilkChoice, MILK_OPTIONS,
} from '../../../config/constants';
import { getItemSalePrice, cakeSaleNoteTag, supportsSweetnessChoice } from '../../../utils/promotions';
import { mergeStockLinks } from '../../../utils/stockLinks';
import { pickOrderLineFields } from '../../../utils/customerCart';

export const SWEETNESS_LEVELS = [0, 25, 50, 75, 100];
export const DEFAULT_SWEETNESS = 100;
export const DEFAULT_MILK = 'cow';

/** Option groups of `item` that have at least one option for sale, cheapest first. */
export function getOptionGroups(item, beanModifiers = []) {
  const itemBase = Number(item?.price) || 0;
  const extra = Number(item?.beanExtra) || 0;
  return getModifierGroups(item)
    .map((name) => ({
      name,
      mods: beanModifiers
        .filter((b) => b.available !== false && (b.group || 'เมล็ดกาแฟ') === name)
        .map((mod) => ({
          mod,
          surcharge: isBaseModifier(item, mod) ? 0 : Math.max(0, (Number(mod.price) || 0) + extra - itemBase),
        }))
        .sort((a, b) => a.surcharge - b.surcharge),
    }))
    .filter((g) => g.mods.length > 0);
}

/**
 * Does tapping this menu item need the option sheet?
 * Sweetness, milk (latte) or any option group for sale → yes. The milk check is
 * new: a latte whose bean list was empty and whose sweetness was off used to be
 * added with no milk at all (the QR checkout even rejects that as invalid-milk).
 */
export function needsOptionSheet(item, beanModifiers, saleSettings) {
  if (supportsSweetnessChoice(item, saleSettings)) return true;
  if (supportsMilkChoice(item)) return true;
  return getOptionGroups(item, beanModifiers).length > 0;
}

/**
 * Must the sheet wait for an explicit "เพิ่มลงตะกร้า" tap?
 * Old rule was `showSweetness || multi`, so a single-group latte with no
 * sweetness added the drink on the bean tap and silently dropped the milk the
 * staff had picked. Milk now also requires the confirm step.
 */
export function needsConfirmStep({ groups, showSweetness, showMilk }) {
  return showSweetness || showMilk || groups.length > 1;
}

/**
 * Preselected option per group: the base option (isDefault / baseBeanIds), else
 * the first option with no surcharge. A group with no free option stays empty so
 * staff must choose (no silent upcharge).
 */
export function defaultSelections(item, groups) {
  const picks = {};
  for (const g of groups) {
    const base = g.mods.find(({ mod }) => isBaseModifier(item, mod)) || g.mods.find(({ surcharge }) => surcharge === 0);
    if (base) picks[g.name] = base.mod;
  }
  return picks;
}

/** Plain tap (no options): Happy Hour price, coffee menus rounded up to 5. */
export function buildPlainLine(item, saleSettings) {
  const sale = getItemSalePrice(item, saleSettings);
  const price = item.allowBeanModifier ? roundUpTo5(sale.price) : sale.price;
  return {
    ...pickOrderLineFields(item),
    price,
    ...(sale.onSale ? { originalPrice: sale.originalPrice } : {}),
    quantity: 1,
    note: sale.onSale ? cakeSaleNoteTag(sale.percent) : '',
  };
}

/**
 * Line from the option sheet. Price is additive (computeModifierPrice), as before.
 * A latte with no option group and no sweetness (milk only) is priced like a
 * plain tap so opening the sheet for milk never changes what the drink costs.
 */
export function buildOptionLine(item, modifiers, sweetness = null, milkType = null, saleSettings = {}) {
  const mods = (Array.isArray(modifiers) ? modifiers : [modifiers]).filter(Boolean);
  const milkOnly = mods.length === 0 && sweetness == null;
  const plain = milkOnly ? buildPlainLine(item, saleSettings) : null;
  const price = plain ? plain.price : computeModifierPrice(item, mods);
  const modifierName = mods.map((m) => `#${m.name}`).join(' ');
  const modifierKey = mods.length ? `-${mods.map((m) => m.id).join('-')}` : '';
  const sweetnessKey = sweetness == null ? '' : `-sweet-${sweetness}`;
  const milkKey = milkType ? `-milk-${milkType}` : '';
  const milkLabel = MILK_OPTIONS.find((o) => o.value === milkType)?.label || '';
  const note = [modifierName, milkLabel, sweetness == null ? '' : `หวาน ${sweetness}%`, plain?.note].filter(Boolean).join(' ');
  return {
    ...pickOrderLineFields(item),
    cartId: `${item.id}${modifierKey}${sweetnessKey}${milkKey}`,
    price,
    ...(plain?.originalPrice !== undefined ? { originalPrice: plain.originalPrice } : {}),
    beanModifier: modifierName,
    modifierIds: mods.map((m) => m.id),
    sweetness,
    milkType,
    milkLabel,
    // shared helper: never mutate the menu's own recipe objects
    stockLinks: mergeStockLinks(item.stockLinks, ...mods.map((m) => m.stockLinks)),
    quantity: 1,
    note,
  };
}

/** Add a plain line: merges into an existing plain line of the same menu. */
export function addPlainLine(cart, line) {
  const same = (c) => c.id === line.id && !c.beanModifier && !c.cartId;
  if (cart.some(same)) return cart.map((c) => (same(c) ? { ...c, quantity: c.quantity + 1 } : c));
  return [...cart, line];
}

/** Add an option line: merges by cartId (same menu + same choices). */
export function addOptionLine(cart, line) {
  if (cart.some((c) => c.cartId === line.cartId)) {
    return cart.map((c) => (c.cartId === line.cartId ? { ...c, quantity: c.quantity + 1 } : c));
  }
  return [...cart, line];
}

export const lineKey = (line) => line.cartId || line.id;

/** Order payload lines: whitelist again so edited old orders shed their photos too. */
export const toOrderItems = (cart) => cart.map((line) => pickOrderLineFields(line));

/**
 * "ซ้ำล่าสุด": rebuild up to `limit` lines of the most recent order from the
 * CURRENT menu (today's price and recipe, never the old stored price). A line
 * whose options can't be resolved any more (older orders without modifierIds,
 * option sold out, menu hidden) is skipped rather than guessed.
 */
export function repeatLines(order, { menuById, beanModifiers = [], saleSettings, limit = 3 }) {
  const out = [];
  const lines = (order?.items || []).slice(-limit);
  for (const old of lines) {
    const item = menuById.get(old.id);
    if (!item || item.available === false) continue;
    const groups = getOptionGroups(item, beanModifiers);
    const showSweetness = supportsSweetnessChoice(item, saleSettings);
    const showMilk = supportsMilkChoice(item);
    const qty = Math.max(1, Number(old.quantity) || 1);
    if (!groups.length && !showSweetness && !showMilk) {
      out.push({ ...buildPlainLine(item, saleSettings), quantity: qty });
      continue;
    }
    const ids = Array.isArray(old.modifierIds) ? old.modifierIds : null;
    if (groups.length && !ids) continue;
    const mods = (ids || []).map((id) => groups.flatMap((g) => g.mods.map((m) => m.mod)).find((m) => m.id === id));
    if (mods.some((m) => !m) || mods.length !== groups.length) continue;
    const sweetness = showSweetness ? (SWEETNESS_LEVELS.includes(old.sweetness) ? old.sweetness : DEFAULT_SWEETNESS) : null;
    const milk = showMilk ? (MILK_OPTIONS.some((m) => m.value === old.milkType) ? old.milkType : DEFAULT_MILK) : null;
    out.push({ ...buildOptionLine(item, mods, sweetness, milk, saleSettings), quantity: qty });
  }
  return out;
}
