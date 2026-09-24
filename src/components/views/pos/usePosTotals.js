import { useMemo } from 'react';
import { getComboDiscount, isCakeCategory, isCakeSaleActive } from '../../../utils/promotions';
import { formatBaht } from '../../../utils/format';
import { VAT_RATE } from '../../../config/constants';

/**
 * Bill totals for the staff POS. Moved verbatim out of PosView (pricing rules
 * unchanged) plus the display rows/hints for the checkout bar.
 */
export default function usePosTotals({
  cart, comboSettings, saleSettings, spendThreshold, spendDiscount, reviewDiscount, activePromotion,
  pointsRedeemActive, redeemDiscountValue: REDEEM_DISCOUNT_VALUE, bringOwnGlass, ownGlassDiscount: OWN_GLASS_DISCOUNT, vatEnabled,
}) {
  const subtotal = useMemo(() => cart.reduce((s, i) => s + (Number(i.price) * Number(i.quantity)), 0), [cart]);

  const combo = useMemo(() => getComboDiscount(cart, comboSettings), [cart, comboSettings]);

  // Spend-threshold promo ("โปร 199"): order ≥ X → get Y% off. Applies to the non-cake
  // (drinks) portion only, so a Happy-Hour cake isn't discounted twice by it. Mirrors
  // the customer QR page so staff and customer orders price identically.
  const SPEND_THRESHOLD = Number(spendThreshold) || 0;
  const SPEND_DISCOUNT_PERCENT = Number(spendDiscount) || 0;
  const spendActive = SPEND_THRESHOLD > 0 && SPEND_DISCOUNT_PERCENT > 0;
  const nonCakeSubtotal = useMemo(
    () => cart.reduce(
      (s, i) => (isCakeCategory(i.category, saleSettings) ? s : s + Number(i.price) * Number(i.quantity)),
      0,
    ),
    [cart, saleSettings],
  );
  // Discount the WHOLE order (cake + drink) as one block — but while Happy Hour is
  // running, cakes already carry a per-item discount in their cart price, so fall back
  // to the non-cake portion to avoid discounting a cake twice.
  const spendBase = isCakeSaleActive(saleSettings) ? nonCakeSubtotal : subtotal;
  const rawSpendDiscount = (spendActive && subtotal >= SPEND_THRESHOLD)
    ? Math.round(spendBase * SPEND_DISCOUNT_PERCENT / 100)
    : 0;
  // Combo and spend-threshold do NOT stack — keep only the bigger of the two so the
  // order-level discount can't balloon (same rule as the customer page).
  const rawComboDiscount = combo.applies ? combo.amount : 0;
  const comboWins = rawComboDiscount >= rawSpendDiscount;
  const effectiveComboDiscount = comboWins ? rawComboDiscount : 0;
  const effectiveSpendDiscount = comboWins ? 0 : rawSpendDiscount;

  const reviewDiscountAmount = useMemo(
    () => (reviewDiscount ? Math.round(subtotal * 0.05) : 0),
    [reviewDiscount, subtotal],
  );

  // Item-level promotion part of the discount (shown as its own row).
  const promoItemsDiscount = useMemo(() => cart.reduce((d, item) => (
    item.promoApplied && activePromotion?.discountPercent > 0
      ? d + (Number(item.price) * Number(item.quantity) * (activePromotion.discountPercent / 100))
      : d
  ), 0), [cart, activePromotion]);

  const discountAmount = useMemo(() => {
    let d = 0;
    if (pointsRedeemActive) d += REDEEM_DISCOUNT_VALUE;
    if (bringOwnGlass) d += OWN_GLASS_DISCOUNT;
    d += promoItemsDiscount;
    d += effectiveComboDiscount;  // คอมโบ % (เลือกตัวที่มากกว่าระหว่างคอมโบ/โปรยอดซื้อ)
    d += effectiveSpendDiscount;  // โปรยอดซื้อถึงเกณฑ์ % (เช่น สั่งครบ 199)
    d += reviewDiscountAmount;    // รีวิว 5%
    // Cap at the subtotal so combined discounts can never exceed 100% / go negative.
    return Math.min(subtotal, d);
  }, [pointsRedeemActive, bringOwnGlass, promoItemsDiscount, REDEEM_DISCOUNT_VALUE, OWN_GLASS_DISCOUNT, effectiveComboDiscount, effectiveSpendDiscount, reviewDiscountAmount, subtotal]);

  const vatAmount = useMemo(() => vatEnabled ? Math.round(Math.max(0, subtotal - discountAmount) * VAT_RATE) : 0, [subtotal, discountAmount, vatEnabled]);
  const netTotal = useMemo(() => Math.max(0, (subtotal - discountAmount) + vatAmount), [subtotal, discountAmount, vatAmount]);

  const totalRows = [
    bringOwnGlass && { label: 'ส่วนลดแก้วส่วนตัว', amount: -OWN_GLASS_DISCOUNT },
    reviewDiscount && { label: 'ส่วนลดรีวิว 5%', amount: -reviewDiscountAmount },
    pointsRedeemActive && { label: 'ใช้แต้มสะสม', amount: -REDEEM_DISCOUNT_VALUE },
    promoItemsDiscount > 0 && { label: `โปรโมชั่น ${activePromotion?.title || ''}`.trim(), amount: -Math.round(promoItemsDiscount * 100) / 100 },
    effectiveComboDiscount > 0 && { label: `คอมโบเค้ก + เครื่องดื่ม −${combo.percent}%`, amount: -effectiveComboDiscount },
    effectiveSpendDiscount > 0 && { label: `สั่งครบ ${formatBaht(SPEND_THRESHOLD)} −${SPEND_DISCOUNT_PERCENT}%`, amount: -effectiveSpendDiscount },
    vatAmount > 0 && { label: 'VAT 7%', amount: vatAmount },
  ].filter(Boolean);
  const totalHints = [
    combo.enabled && !combo.applies && combo.hasCake !== combo.hasDrink && cart.length > 0 && effectiveSpendDiscount === 0
      && `เพิ่ม${combo.hasCake ? 'เครื่องดื่ม' : 'เค้ก'} รับส่วนลด ${combo.percent}%`,
    spendActive && effectiveSpendDiscount === 0 && effectiveComboDiscount === 0 && subtotal > 0 && subtotal < SPEND_THRESHOLD
      && `สั่งอีก ${formatBaht(SPEND_THRESHOLD - subtotal)} รับส่วนลด ${SPEND_DISCOUNT_PERCENT}%`,
  ].filter(Boolean);

  return {
    subtotal, combo, spendActive, effectiveComboDiscount, effectiveSpendDiscount, reviewDiscountAmount,
    promoItemsDiscount, discountAmount, vatAmount, netTotal, totalRows, totalHints,
  };
}
