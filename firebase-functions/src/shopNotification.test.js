import { describe, expect, it, vi } from 'vitest';
import { buildShopNotification, notifyShopOrder } from './shopNotification.js';

const order = {
  queueNumber: 12,
  customerName: 'Test customer',
  total: 75,
  time: '12:30',
  items: [{ name: 'Cocoa frappe', beanModifier: '', quantity: 1, price: 75 }],
};

describe('shop notification', () => {
  it('only sends trusted order display fields', () => {
    expect(buildShopNotification(order)).toEqual({
      type: 'order',
      queueNumber: 12,
      customerName: 'Test customer',
      total: 75,
      time: '12:30',
      items: [{ name: 'Cocoa frappe', quantity: 1 }],
    });
  });

  it('forwards a trusted memberContext payload for the shop telegram line', () => {
    expect(buildShopNotification({
      ...order,
      memberContext: {
        isRegular: true,
        favoriteItem: 'มัทฉะลาเต้',
        orderCount: 8,
        daysAway: 20,
        extra: 'drop-me',
        line: '⭐ ลูกค้าประจำ · ชอบ มัทฉะลาเต้ · หายไป 20 วัน',
      },
    })).toEqual({
      type: 'order',
      queueNumber: 12,
      customerName: 'Test customer',
      total: 75,
      time: '12:30',
      items: [{ name: 'Cocoa frappe', quantity: 1 }],
      memberContext: {
        isRegular: true,
        favoriteItem: 'มัทฉะลาเต้',
        orderCount: 8,
        daysAway: 20,
        line: '⭐ ลูกค้าประจำ · ชอบ มัทฉะลาเต้ · หายไป 20 วัน',
      },
    });
  });

  it('builds memberContext.line when the caller only sent structured fields', () => {
    expect(buildShopNotification({
      ...order,
      memberContext: {
        isRegular: true,
        favoriteItem: 'มัทฉะลาเต้',
        orderCount: 5,
        daysAway: null,
      },
    }).memberContext).toEqual({
      isRegular: true,
      favoriteItem: 'มัทฉะลาเต้',
      orderCount: 5,
      daysAway: null,
      line: '⭐ ลูกค้าประจำ · ชอบ มัทฉะลาเต้',
    });
  });

  it('posts the order to the protected worker endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, channel: 'telegram' }),
    });

    await expect(notifyShopOrder(order, { secret: 'test-secret', fetchImpl }))
      .resolves.toEqual({ success: true, channel: 'telegram' });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer test-secret');
  });

  it('reports a rejected notification without leaking the response body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: 'provider detail' }),
    });

    await expect(notifyShopOrder(order, { secret: 'test-secret', fetchImpl }))
      .rejects.toThrow('shop-notification-failed:502');
  });
});
