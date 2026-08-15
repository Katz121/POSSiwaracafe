const VAT_RATE = 0.07;
const SWEETNESS_LEVELS = new Set([0, 25, 50, 75, 100]);
const MILK_TYPES = new Set(['cow', 'oat']);
const MILK_LABELS = { cow: 'นมวัว', oat: 'นมโอ๊ต' };

const number = (value) => Number(value) || 0;
const norm = (value) => String(value || '').trim().toLowerCase();
const roundUpTo5 = (value) => Math.ceil(number(value) / 5) * 5;

function bangkokMinutes(now) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

function toMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
}

export function isCakeCategory(category, settings) {
  const categories = settings?.cakeSaleCategories;
  return Array.isArray(categories) && categories.map(norm).includes(norm(category));
}

export function isCakeSaleActive(settings, now = new Date()) {
  if (!settings?.cakeSaleEnabled || number(settings.cakeSalePercent) <= 0) return false;
  const start = toMinutes(settings.cakeSaleStart);
  const end = toMinutes(settings.cakeSaleEnd);
  if (start == null || end == null || start === end) return false;
  const current = bangkokMinutes(now);
  return start < end ? current >= start && current < end : current >= start || current < end;
}

function supportsMilkChoice(item) {
  const name = norm(item?.name);
  return name.includes('ลาเต้') || name.includes('latte');
}

function getModifierGroups(item) {
  if (!item?.allowBeanModifier) return [];
  return Array.isArray(item.modifierGroups) && item.modifierGroups.length
    ? item.modifierGroups
    : [item.modifierGroup || 'เมล็ดกาแฟ'];
}

function isBaseModifier(item, modifier) {
  return !!modifier && (modifier.isDefault || (item?.baseBeanIds || []).includes(modifier.id));
}

function computeModifierPrice(item, modifiers) {
  const base = number(item.price);
  const extra = number(item.beanExtra);
  const total = modifiers.reduce((sum, modifier) => (
    isBaseModifier(item, modifier)
      ? sum
      : sum + Math.max(0, number(modifier.price) + extra - base)
  ), base);
  return roundUpTo5(total);
}

function mergeStockLinks(itemLinks = [], modifierLinks = []) {
  const links = new Map();
  [...itemLinks, ...modifierLinks].forEach((link) => {
    const key = link?.stockId || link?.id || link?.name;
    if (!key) return;
    const previous = links.get(key);
    links.set(key, previous
      ? { ...previous, quantity: number(previous.quantity) + number(link.quantity) }
      : { ...link });
  });
  return [...links.values()];
}

function itemSalePrice(item, settings, now) {
  const originalPrice = number(item.price);
  if (item.excludeFromSale || !isCakeSaleActive(settings, now) || !isCakeCategory(item.category, settings)) {
    return { price: originalPrice, originalPrice: null, percent: 0 };
  }
  const percent = Math.max(0, Math.min(100, number(settings.cakeSalePercent)));
  return {
    price: Math.max(0, Math.round(originalPrice * (1 - percent / 100))),
    originalPrice,
    percent,
  };
}

function validateRequestedItem(requested) {
  const quantity = Number(requested?.quantity);
  if (!requested?.id || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
    throw new Error('invalid-item');
  }
  if (requested.note != null && String(requested.note).length > 200) throw new Error('note-too-long');
}

export function buildTrustedCheckout({
  requestedItems,
  menuById,
  modifiersById,
  settings = {},
  member = null,
  usePoints = false,
  now = new Date(),
}) {
  if (!Array.isArray(requestedItems) || requestedItems.length < 1 || requestedItems.length > 50) {
    throw new Error('invalid-items');
  }

  const items = requestedItems.map((requested) => {
    validateRequestedItem(requested);
    const item = menuById.get(requested.id);
    if (!item || item.available === false) throw new Error('item-unavailable');

    const modifierIds = Array.isArray(requested.modifierIds) ? requested.modifierIds : [];
    if (modifierIds.length > 5 || new Set(modifierIds).size !== modifierIds.length) {
      throw new Error('invalid-modifiers');
    }
    const modifiers = modifierIds.map((id) => modifiersById.get(id));
    if (modifiers.some((modifier) => !modifier || modifier.available === false)) {
      throw new Error('modifier-unavailable');
    }
    const allowedGroups = new Set(getModifierGroups(item));
    const chosenGroups = modifiers.map((modifier) => modifier.group || 'เมล็ดกาแฟ');
    if (
      chosenGroups.some((group) => !allowedGroups.has(group)) ||
      new Set(chosenGroups).size !== chosenGroups.length ||
      chosenGroups.length !== allowedGroups.size
    ) {
      throw new Error('invalid-modifiers');
    }

    const isCake = isCakeCategory(item.category, settings);
    const sweetness = requested.sweetness == null ? null : Number(requested.sweetness);
    if ((!isCake && !SWEETNESS_LEVELS.has(sweetness)) || (isCake && sweetness != null)) {
      throw new Error('invalid-sweetness');
    }
    const milkType = requested.milkType || null;
    if ((milkType && (!supportsMilkChoice(item) || !MILK_TYPES.has(milkType))) || (!milkType && supportsMilkChoice(item))) {
      throw new Error('invalid-milk');
    }

    let price;
    let originalPrice = null;
    let salePercent = 0;
    if (modifiers.length) {
      price = computeModifierPrice(item, modifiers);
    } else {
      const sale = itemSalePrice(item, settings, now);
      price = item.allowBeanModifier ? roundUpTo5(sale.price) : sale.price;
      originalPrice = sale.originalPrice;
      salePercent = sale.percent;
    }

    const modifierName = modifiers.map((modifier) => `#${modifier.name}`).join(' ');
    const generatedNote = [
      modifierName,
      milkType ? MILK_LABELS[milkType] : '',
      sweetness == null ? '' : `หวาน ${sweetness}%`,
      salePercent ? `[Happy Hour เค้ก -${salePercent}%]` : '',
    ].filter(Boolean).join(' ');
    const stockLinks = modifiers.reduce(
      (links, modifier) => mergeStockLinks(links, modifier.stockLinks || []),
      item.stockLinks || [],
    );

    return {
      id: item.id,
      name: item.name,
      nameEn: item.nameEn || '',
      category: item.category || '',
      price,
      ...(originalPrice == null ? {} : { originalPrice }),
      beanModifier: modifierName,
      sweetness,
      milkType,
      milkLabel: milkType ? MILK_LABELS[milkType] : '',
      stockLinks,
      quantity: Number(requested.quantity),
      note: String(requested.note || '').trim() || generatedNote,
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const happyHour = isCakeSaleActive(settings, now);
  const hasCake = items.some((item) => isCakeCategory(item.category, settings));
  const hasDrink = items.some((item) => !isCakeCategory(item.category, settings));
  const comboPercent = Math.max(0, Math.min(100, number(settings.comboPercent)));
  const comboApplies = !!settings.comboEnabled && comboPercent > 0 && hasCake && hasDrink && !happyHour;
  const rawComboDiscount = comboApplies ? Math.round(subtotal * comboPercent / 100) : 0;

  const nonCakeSubtotal = items.reduce((sum, item) => (
    isCakeCategory(item.category, settings) ? sum : sum + item.price * item.quantity
  ), 0);
  const spendThreshold = number(settings.spendThreshold);
  const spendPercent = number(settings.spendDiscount);
  const spendBase = happyHour ? nonCakeSubtotal : subtotal;
  const rawSpendDiscount = spendThreshold > 0 && spendPercent > 0 && subtotal >= spendThreshold
    ? Math.round(spendBase * spendPercent / 100)
    : 0;

  const redeemThreshold = number(settings.redeemPointsThreshold) || 100;
  const redeemValue = number(settings.redeemDiscountValue) || 50;
  const redeemDeduct = usePoints && member && number(member.points) >= redeemThreshold ? redeemThreshold : 0;
  if (usePoints && redeemDeduct === 0) throw new Error('points-not-eligible');
  const pointsDiscount = redeemDeduct > 0 ? redeemValue : 0;
  const promotionDiscount = Math.max(rawComboDiscount, rawSpendDiscount);
  const discount = Math.min(subtotal, promotionDiscount + pointsDiscount);
  const vat = settings.vatEnabled ? Math.round(Math.max(0, subtotal - discount) * VAT_RATE) : 0;
  const total = Math.max(0, subtotal - discount + vat);

  return {
    items,
    subtotal,
    discount,
    vat,
    total,
    redeemDeduct,
    pointsToAdd: Math.floor(total / 10),
    promotionTitle: rawComboDiscount >= rawSpendDiscount && comboApplies ? 'คอมโบเค้ก + เครื่องดื่ม' : '',
    promotionDiscountPercent: rawComboDiscount >= rawSpendDiscount && comboApplies ? comboPercent : 0,
  };
}
