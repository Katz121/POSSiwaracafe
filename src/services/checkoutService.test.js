import { describe, expect, it, vi } from 'vitest';
import { buildCheckoutItems, shouldKeepRequestId, submitTrustedCheckout } from './checkoutService';

describe('checkoutService', () => {
  it('sends identity and options but never trusts client prices or totals', () => {
    const result = buildCheckoutItems([{
      id: 'cocoa', quantity: 2, price: 1, total: 2,
      modifierIds: [], sweetness: 50, milkType: null, note: 'ไม่ใส่วิป',
    }]);
    expect(result).toEqual([{
      id: 'cocoa', quantity: 2, modifierIds: [], sweetness: 50, milkType: null, note: 'ไม่ใส่วิป',
    }]);
    expect(result[0]).not.toHaveProperty('price');
    expect(result[0]).not.toHaveProperty('total');
  });

  it('calls the regional checkout callable', async () => {
    const callable = vi.fn(async () => ({ data: { orderId: 'order-1' } }));
    const factory = vi.fn(() => callable);
    const functionsInstance = {};
    const payload = { requestId: 'request_0000000001' };
    await expect(submitTrustedCheckout(functionsInstance, payload, factory))
      .resolves.toEqual({ orderId: 'order-1' });
    expect(factory).toHaveBeenCalledWith(functionsInstance, 'checkoutOrder');
    expect(callable).toHaveBeenCalledWith(payload);
  });

  it('keeps idempotency keys only for ambiguous transport/server failures', () => {
    expect(shouldKeepRequestId('functions/unavailable')).toBe(true);
    expect(shouldKeepRequestId('functions/invalid-argument')).toBe(false);
    expect(shouldKeepRequestId('functions/failed-precondition')).toBe(false);
  });
});
