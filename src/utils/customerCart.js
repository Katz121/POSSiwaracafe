import { computeModifierPrice, roundUpTo5, MILK_OPTIONS, VAT_RATE, getModifierGroups, supportsMilkChoice } from '../config/constants';
import { getItemSalePrice, cakeSaleNoteTag, getComboDiscount, isCakeCategory, isCakeSaleActive, supportsSweetnessChoice } from './promotions';
import { mergeStockLinks } from './stockLinks';

export function buildCartLine(item, modifier = null, sweetness = null, milkType = null, settingsData = {}) {
    // modifier อาจเป็นตัวเดียวหรือเป็นลิสต์ (หนึ่งตัวต่อกลุ่ม เช่น ส้ม + เมล็ดกาแฟ)
    const mods = (Array.isArray(modifier) ? modifier : [modifier]).filter(Boolean);
    const modifierName = mods.map(m => `#${m.name}`).join(' ');
    const sweetnessKey = sweetness == null ? '' : `-sweet-${sweetness}`;
    const milkKey = milkType ? `-milk-${milkType}` : '';
    const modifierKey = mods.length ? `-${mods.map(m => m.id).join('-')}` : '';
    const cartId = `${item.id}${modifierKey}${sweetnessKey}${milkKey}`;
    const stockLinks = mods.reduce((acc, m) => mergeStockLinks(acc, m.stockLinks || []), item.stockLinks || []);

    // For modifier path keep original pricing; for plain items apply sale if active
    let finalPrice;
    let saleFields = {};
    if (mods.length) {
      // ราคารวมแบบบวกเพิ่ม: ฐาน = ราคาเมนู, ตัวเลือกที่ไม่ใช่เบสบวกส่วนต่างของมัน
      // (ส้มสด +20, เมล็ดพรีเมียมต่างหาก). กลุ่มเดียวยังเท่ากับสูตร max เดิม.
      finalPrice = computeModifierPrice(item, mods);
    } else {
      const sale = getItemSalePrice(item, settingsData);
      finalPrice = sale.price;
      if (sale.onSale) {
        saleFields = {
          originalPrice: sale.originalPrice,
        };
      }
      // Coffee menus: round the charged price up to the nearest 5 baht.
      if (item.allowBeanModifier) finalPrice = roundUpTo5(finalPrice);
    }

      // Build note: for sale items append the sale tag
      const sweetnessNote = sweetness == null ? '' : `หวาน ${sweetness}%`;
      const milkLabel = MILK_OPTIONS.find(option => option.value === milkType)?.label || '';
      let note = [modifierName, milkLabel, sweetnessNote].filter(Boolean).join(' ');
      if (!mods.length && saleFields.originalPrice !== undefined) {
        const sale = getItemSalePrice(item, settingsData);
        const tag = cakeSaleNoteTag(sale.percent);
        note = note ? `${note} ${tag}` : tag;
      }

  return {
          ...item,
          cartId,
          price: finalPrice,
          ...saleFields,
          beanModifier: modifierName,
          modifierIds: mods.map((modifier) => modifier.id),
          sweetness,
          milkType,
          milkLabel,
          stockLinks,
          quantity: 1,
          note,
        };
}

export function calculateCartTotals(cart, settingsData, pointsEligible, usePoints, redeemDiscountValue, vatEnabled) {
    const subtotal = cart.reduce((s, i) => s + Number(i.price) * Number(i.quantity), 0);
    // Both the combo "set" promo (see getComboDiscount) and the spend-threshold promo
    // discount the whole cart as one bundle (cake + drink together). The only exception is
    // while Happy Hour is running: cakes already carry a per-item discount in their price,
    // so the spend promo falls back to the non-cake (drinks) portion to avoid double-discount.
    const nonCakeSubtotal = cart.reduce(
      (s, i) => (isCakeCategory(i.category, settingsData) ? s : s + Number(i.price) * Number(i.quantity)),
      0,
    );
    const combo = getComboDiscount(cart, settingsData);
    const rawComboDiscount = combo.applies ? combo.amount : 0;
    const pointsDiscount = (pointsEligible && usePoints) ? redeemDiscountValue : 0;
    // Spend-threshold discount: order ≥ X → get Y% off (0 = disabled)
    const spendThreshold = Number(settingsData.spendThreshold) || 0;
    const spendDiscountPercent = Number(settingsData.spendDiscount) || 0; // a % off once the threshold is reached
    const spendActive = spendThreshold > 0 && spendDiscountPercent > 0;
    const spendBase = isCakeSaleActive(settingsData) ? nonCakeSubtotal : subtotal;
    const rawSpendDiscount = (spendActive && subtotal >= spendThreshold) ? Math.round(spendBase * spendDiscountPercent / 100) : 0;
    const spendRemaining = (spendActive && subtotal > 0 && subtotal < spendThreshold) ? (spendThreshold - subtotal) : 0;
    // Combo and spend-threshold do NOT stack — keep only the bigger of the two so the
    // order-level discount can't balloon. Happy-hour is already in item prices; points
    // (a redeemed member reward) still stacks. These effective values also drive the UI.
    const comboWins = rawComboDiscount >= rawSpendDiscount;
    const comboDiscount = comboWins ? rawComboDiscount : 0;
    const spendDiscount = comboWins ? 0 : rawSpendDiscount;
    const discount = Math.min(subtotal, comboDiscount + pointsDiscount + spendDiscount);
    const vat = vatEnabled ? Math.round(Math.max(0, subtotal - discount) * VAT_RATE) : 0;
    const total = Math.max(0, subtotal - discount + vat);
    return {
      subtotal, combo, pointsDiscount, spendThreshold, spendDiscountPercent,
      spendActive, spendRemaining, comboDiscount, spendDiscount, discount, vat, total,
    };
}

// A line's `note` is ONE string that the kitchen, bills and receipt show as-is:
// the auto text from its options ("#เมล็ด นมโอ๊ต หวาน 50%" + Happy Hour tag),
// then anything the customer typed. When the options are rebuilt (edit / cart
// restore) the auto part must be regenerated, or staff would read stale text
// such as "หวาน 50%" on a drink that is now 25%. Keep only the customer's words.
export function customerNotePart(oldLine) {
  let rest = String(oldLine?.note || '').replace(/\[Happy Hour เค้ก -\d+%\]/g, ' ');
  const autoTokens = [
    oldLine?.beanModifier,
    oldLine?.milkLabel,
    oldLine?.sweetness == null ? '' : `หวาน ${oldLine.sweetness}%`,
  ].filter(Boolean);
  for (const token of autoTokens) rest = rest.split(token).join(' ');
  return rest.replace(/\s+/g, ' ').trim();
}

/** Fresh auto note of `newLine` + the customer's own words from `oldLine`. */
export function mergeLineNote(newLine, oldLine) {
  return [newLine.note, customerNotePart(oldLine)].filter(Boolean).join(' ');
}

// Keep separate line identities when editing: a later fresh add must never merge
// into a line whose choices have changed but whose former ID matches that add.
export function replaceCartLine(cart, oldId, line, newId) {
  return cart.map((old) => (old.cartId || old.id) === oldId
    ? { ...line, cartId: newId, quantity: old.quantity, note: mergeLineNote(line, old) } : old);
}

export function getCartCrossSell(cart, cakeItems, modifiers, settings, pointsEligible, usePoints, redeemDiscountValue, vatEnabled, sweetness = 100) {
  const current = calculateCartTotals(cart, settings, pointsEligible, usePoints, redeemDiscountValue, vatEnabled);
  if (!current.combo.enabled || !current.combo.hasDrink || current.combo.hasCake) return [];
  return cakeItems.filter((item) => item.available !== false)
    .sort((a, b) => Number(b.soldCount || 0) - Number(a.soldCount || 0))
    .map((item) => {
      const mods = getModifierGroups(item).map((group) => modifiers
        .filter((m) => m.available !== false && (m.group || 'เมล็ดกาแฟ') === group)
        .sort((a, b) => computeModifierPrice(item, [a]) - computeModifierPrice(item, [b]))[0]).filter(Boolean);
      const line = buildCartLine(item, mods, supportsSweetnessChoice(item, settings) ? sweetness : null, supportsMilkChoice(item) ? 'cow' : null, settings);
      const next = calculateCartTotals([...cart, line], settings, pointsEligible, usePoints, redeemDiscountValue, vatEnabled);
      return { item, line, extra: next.total - current.total, applies: next.combo.applies };
    }).filter((candidate) => candidate.applies).slice(0, 2);
}
