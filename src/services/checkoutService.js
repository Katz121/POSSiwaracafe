import { httpsCallable } from 'firebase/functions';

export function buildCheckoutItems(cart) {
  return (cart || []).map((item) => ({
    id: item.id,
    quantity: Number(item.quantity),
    modifierIds: Array.isArray(item.modifierIds) ? item.modifierIds : [],
    sweetness: item.sweetness ?? null,
    milkType: item.milkType || null,
    note: String(item.note || '').trim(),
  }));
}

export async function submitTrustedCheckout(
  functionsInstance,
  payload,
  callableFactory = httpsCallable,
) {
  const checkoutOrder = callableFactory(functionsInstance, 'checkoutOrder');
  const result = await checkoutOrder(payload);
  return result.data;
}

export function shouldKeepRequestId(errorCode) {
  return ['functions/internal', 'functions/unavailable', 'functions/deadline-exceeded', 'functions/unknown']
    .includes(errorCode);
}
