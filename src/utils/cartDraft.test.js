import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateCartDraft, restoreCartDraft, saveCartDraft, readCartDraft, readLastSweetness, rememberSweetness } from './cartDraft';

const item = { id: 'a', name: 'Latte', price: 65, category: 'Coffee', available: true };
const draft = { cart: [{ id: 'a', price: 1, quantity: 3, note: 'Keep my note', sweetness: 25, milkType: 'oat' }], customerName: 'Name', customerPhone: '0812345678', checkoutRequestId: 'uncertain-submit-id', savedAt: 1000 };
afterEach(() => vi.unstubAllGlobals());

describe('cart drafts', () => {
  it('rejects corrupt, expired, and future drafts at the three-hour boundary', () => {
    expect(validateCartDraft(null)).toBeNull();
    expect(validateCartDraft({ ...draft, cart: {} }, 1000)).toBeNull();
    expect(validateCartDraft(draft, 999)).toBeNull();
    expect(validateCartDraft(draft, 1000 + 10800000)).toBeNull();
    expect(validateCartDraft(draft, 1000 + 10799999).checkoutRequestId).toBe('uncertain-submit-id');
    // name/phone of a previous customer must never come back (shared devices)
    const restored = validateCartDraft(draft, 1500);
    expect(restored.customerName).toBeUndefined();
    expect(restored.customerPhone).toBeUndefined();
  });
  it('rebuilds current prices while preserving quantity, note, and choices', () => {
    const result = restoreCartDraft(draft, [item], [], {});
    expect(result.dropped).toBe(false);
    expect(result.cart[0]).toMatchObject({ price: 65, quantity: 3, sweetness: 25, milkType: 'oat' });
    // auto option text is rebuilt, the customer's own words are kept
    expect(result.cart[0].note).toBe('นมโอ๊ต หวาน 25% Keep my note');
  });
  it('drops missing, unavailable and malformed lines', () => {
    expect(restoreCartDraft(draft, [], [], {})).toEqual({ cart: [], dropped: true });
    expect(restoreCartDraft(draft, [{ ...item, available: false }], [], {}).cart).toEqual([]);
    expect(restoreCartDraft({ cart: [null, { id: 'a', quantity: -1 }] }, [item], [], {}).cart).toEqual([]);
  });
  it('drops unavailable selected modifiers and refreshes current modifier price and stock', () => {
    const menu = [{ ...item, allowBeanModifier: true, modifierGroups: ['Beans'] }];
    const saved = { cart: [{ ...draft.cart[0], modifierIds: ['premium'] }] };
    expect(restoreCartDraft(saved, menu, [], {}).dropped).toBe(true);
    const mods = [{ id: 'premium', name: 'New name', group: 'Beans', price: 95, stockLinks: [{ stockId: 'new', usage: 18 }] }];
    expect(restoreCartDraft(saved, menu, mods, {}).cart[0]).toMatchObject({ price: 95, beanModifier: '#New name', stockLinks: mods[0].stockLinks });
  });
  it('keeps separate identical restored lines and quantities', () => {
    const restored = restoreCartDraft({ cart: [draft.cart[0], draft.cart[0]] }, [item], [], {}).cart;
    expect(restored.reduce((sum, line) => sum + line.quantity, 0)).toBe(6);
    expect(new Set(restored.map((line) => line.cartId)).size).toBe(2);
  });
  it('persists request IDs and clears an empty draft', () => {
    const data = new Map();
    vi.stubGlobal('sessionStorage', { setItem: (k, v) => data.set(k, v), getItem: (k) => data.get(k), removeItem: (k) => data.delete(k) });
    saveCartDraft(draft);
    expect(readCartDraft().checkoutRequestId).toBe('uncertain-submit-id');
    saveCartDraft({ cart: [] });
    expect(readCartDraft()).toBeNull();
  });
  it('tolerates denied storage on all reads and writes', () => {
    const fail = () => { throw new Error('denied'); };
    vi.stubGlobal('sessionStorage', { getItem: fail, setItem: fail, removeItem: fail });
    vi.stubGlobal('localStorage', { getItem: fail, setItem: fail });
    expect(readCartDraft()).toBeNull();
    expect(readLastSweetness()).toBeNull();
    expect(() => { saveCartDraft(draft); saveCartDraft({ cart: [] }); rememberSweetness(50); }).not.toThrow();
  });
  it('remembers only valid sweetness, including zero', () => {
    let value = null;
    vi.stubGlobal('localStorage', { getItem: () => value, setItem: (_, next) => { value = next; } });
    expect(readLastSweetness()).toBeNull();
    for (const level of [0, 25, 50, 75, 100]) { rememberSweetness(level); expect(readLastSweetness()).toBe(level); }
    rememberSweetness(30);
    expect(readLastSweetness()).toBe(100);
    value = '30';
    expect(readLastSweetness()).toBeNull();
  });
});
