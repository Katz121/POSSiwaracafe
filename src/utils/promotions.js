/**
 * Promotions / time-based pricing helpers
 *
 * Currently powers the "ล้างสต๊อกเค้ก" (cake clearance / happy-hour) feature:
 * during a configurable daily time window, items in the configured categories
 * are offered at a percentage discount. Used by BOTH the staff POS and the
 * customer QR-ordering page so pricing stays identical on both sides.
 *
 * Settings keys (stored on the `config/settings` Firestore doc):
 *   cakeSaleEnabled    boolean
 *   cakeSaleCategories string[]   // category names treated as "cake"
 *   cakeSalePercent    number     // 0-100
 *   cakeSaleStart      "HH:MM"
 *   cakeSaleEnd        "HH:MM"
 *   reviewUrl          string     // (unrelated to pricing — used by the review prompt)
 */

// "HH:MM" -> minutes since midnight, or null if invalid
const toMinutes = (hhmm) => {
  if (typeof hhmm !== 'string') return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
};

const norm = (s) => String(s || '').trim().toLowerCase();

/**
 * Is the cake-clearance window currently active?
 * Handles windows that cross midnight (e.g. 22:00 → 02:00).
 */
export const isCakeSaleActive = (settings, now = new Date()) => {
  if (!settings || !settings.cakeSaleEnabled) return false;
  const percent = Number(settings.cakeSalePercent) || 0;
  if (percent <= 0) return false;
  const start = toMinutes(settings.cakeSaleStart);
  const end = toMinutes(settings.cakeSaleEnd);
  if (start == null || end == null || start === end) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  return start < end ? (cur >= start && cur < end) : (cur >= start || cur < end);
};

/** Does this category count as a "cake" category in the current settings? */
export const isCakeCategory = (category, settings) => {
  const cats = settings && settings.cakeSaleCategories;
  if (!Array.isArray(cats) || cats.length === 0) return false;
  return cats.map(norm).includes(norm(category));
};

/**
 * Effective pricing for a menu item given the current sale state.
 * @returns {{ onSale: boolean, percent: number, originalPrice: number, price: number }}
 */
export const getItemSalePrice = (item, settings, now = new Date()) => {
  const originalPrice = Number(item && item.price) || 0;
  if (isCakeSaleActive(settings, now) && isCakeCategory(item && item.category, settings)) {
    const percent = Math.max(0, Math.min(100, Number(settings.cakeSalePercent) || 0));
    const price = Math.max(0, Math.round(originalPrice * (1 - percent / 100)));
    return { onSale: percent > 0, percent, originalPrice, price };
  }
  return { onSale: false, percent: 0, originalPrice, price: originalPrice };
};

/** Note tag appended to discounted cart/order items so it shows on receipts/bills. */
export const cakeSaleNoteTag = (percent) => `[Happy Hour เค้ก -${percent}%]`;

// ---------------------------------------------------------------------------
// Cake + Drink combo
// "Cake" = an item whose category is in cakeSaleCategories.
// "Drink" = any item that is NOT a cake category (cafe items are mostly drinks).
// When the cart has at least one cake AND one non-cake item, a % discount applies.
// Settings keys: comboEnabled (bool), comboPercent (number 0-100).
// ---------------------------------------------------------------------------
const cartSubtotal = (cart) =>
  (cart || []).reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 0), 0);

/**
 * Evaluate the cake+drink combo for a cart.
 * @returns {{ enabled, applies, percent, amount, hasCake, hasDrink }}
 */
export const getComboDiscount = (cart, settings) => {
  const enabled = !!(settings && settings.comboEnabled);
  const percent = Math.max(0, Math.min(100, Number(settings && settings.comboPercent) || 0));
  const items = cart || [];
  const hasCake = items.some((i) => isCakeCategory(i.category, settings));
  const hasDrink = items.some((i) => !isCakeCategory(i.category, settings));
  // Combo is OFF while Happy Hour is running — both promos exist to move cakes,
  // so running them together would double up on the same goal.
  const applies = enabled && percent > 0 && hasCake && hasDrink && items.length > 0 && !isCakeSaleActive(settings);
  // Discount applies to the NON-cake portion only — cakes are excluded from
  // order-level promos so a Happy-Hour cake can't be discounted twice.
  const nonCakeSubtotal = items
    .filter((i) => !isCakeCategory(i.category, settings))
    .reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 0), 0);
  const amount = applies ? Math.round(nonCakeSubtotal * (percent / 100)) : 0;
  return { enabled, applies, percent, amount, hasCake, hasDrink };
};

export const COMBO_PROMO_TITLE = 'คอมโบเค้ก + เครื่องดื่ม';
