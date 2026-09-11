import { getModifierGroups, supportsMilkChoice, MILK_OPTIONS } from '../config/constants';
import { supportsSweetnessChoice } from './promotions';
import { buildCartLine, mergeLineNote } from './customerCart';

export const validSweetness = (value) => [0, 25, 50, 75, 100].includes(value);
export function readLastSweetness() {
  try {
    const raw = localStorage.getItem('qr_last_sweetness');
    const value = /^(0|25|50|75|100)$/.test(raw ?? '') ? Number(raw) : null;
    return validSweetness(value) ? value : null;
  } catch { return null; }
}
export function rememberSweetness(value) {
  if (validSweetness(value)) {
    try { localStorage.setItem('qr_last_sweetness', String(value)); } catch { /* Storage optional. */ }
  }
}
export function readCartDraft(now = Date.now()) {
  try { return validateCartDraft(JSON.parse(sessionStorage.getItem('qr_cart_draft')), now); }
  catch { return null; }
}
export function validateCartDraft(draft, now = Date.now()) {
  if (!draft || !Array.isArray(draft.cart) || !Number.isFinite(draft.savedAt)
    || now < draft.savedAt || now - draft.savedAt >= 3 * 60 * 60 * 1000) return null;
  // Name/phone are deliberately NOT kept (shared devices) — only the cart.
  return {
    cart: draft.cart,
    savedAt: draft.savedAt,
    checkoutRequestId: typeof draft.checkoutRequestId === 'string' ? draft.checkoutRequestId : null,
    requestSignature: typeof draft.requestSignature === 'string' ? draft.requestSignature : null,
  };
}
export function clearCartDraft() {
  try { sessionStorage.removeItem('qr_cart_draft'); } catch { /* Storage optional. */ }
}
export function saveCartDraft(draft) {
  if (!draft.cart.length) { clearCartDraft(); return; }
  try { sessionStorage.setItem('qr_cart_draft', JSON.stringify({ ...draft, savedAt: Date.now() })); }
  catch { /* Storage optional. */ }
}
export function restoreCartDraft(draft, menu, modifiers, settings) {
  let dropped = false;
  const cart = [];
  for (const old of draft.cart) {
    const item = menu.find((m) => m.id === old?.id && m.available !== false);
    if (!item || !Number.isInteger(old.quantity) || old.quantity <= 0) { dropped = true; continue; }
    const groups = getModifierGroups(item);
    const ids = Array.isArray(old.modifierIds) ? old.modifierIds : [];
    const mods = ids.map((id) => modifiers.find((m) => m.id === id && m.available !== false && groups.includes(m.group || 'เมล็ดกาแฟ')));
    // Do not silently replace an unavailable selected option with a different recipe.
    if (mods.some((m) => !m) || (item.allowBeanModifier && groups.some((g) =>
      modifiers.some((m) => m.available !== false && (m.group || 'เมล็ดกาแฟ') === g)
      && !mods.some((m) => (m.group || 'เมล็ดกาแฟ') === g)))) { dropped = true; continue; }
    const sweetness = supportsSweetnessChoice(item, settings) ? (validSweetness(old.sweetness) ? old.sweetness : 100) : null;
    const milk = supportsMilkChoice(item) ? (MILK_OPTIONS.some((m) => m.value === old.milkType) ? old.milkType : 'cow') : null;
    const line = buildCartLine(item, mods, sweetness, milk, settings);
    // Rebuild the auto part of the note (options, Happy Hour tag may have ended)
    // and keep only what the customer typed — see mergeLineNote.
    cart.push({ ...line, cartId: `draft-${cart.length}-${item.id}`, quantity: old.quantity, note: mergeLineNote(line, old) });
  }
  return { cart, dropped };
}
