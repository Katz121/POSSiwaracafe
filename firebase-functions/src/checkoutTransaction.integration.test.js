import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const PROJECT_ID = 'siwarapos';
const BASE_PATH = 'artifacts/siwara-pos-v1/public/data';
const PHONE = '0812345678';

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('checkout Firestore transaction', () => {
  let db;
  let checkoutOrderHandler;

  beforeAll(async () => {
    process.env.GCLOUD_PROJECT = PROJECT_ID;
    const admin = await import('firebase-admin/firestore');
    ({ checkoutOrderHandler } = await import('./index.js'));
    db = admin.getFirestore();
    await db.recursiveDelete(db.collection('artifacts'));

    await Promise.all([
      db.doc(`${BASE_PATH}/config/settings`).set({
        vatEnabled: false,
        redeemPointsThreshold: 100,
        redeemDiscountValue: 50,
        cakeSaleCategories: ['เค้ก'],
      }),
      db.doc(`${BASE_PATH}/config/queue`).set({ current: 7 }),
      db.doc(`${BASE_PATH}/menu/latte`).set({
        name: 'ลาเต้',
        category: 'กาแฟ',
        price: 60,
        available: true,
        stockLinks: [],
      }),
      db.doc(`${BASE_PATH}/members/${PHONE}`).set({
        name: 'ลูกค้า',
        phone: PHONE,
        points: 120,
        pendingPoints: 0,
      }),
    ]);
  });

  afterAll(async () => {
    if (db) await db.terminate();
  });

  it('replays the same response without duplicating order, queue, or points', async () => {
    const request = {
      auth: { uid: 'anonymous-customer-1' },
      data: {
        requestId: 'checkout_request_0001',
        customerName: 'ลูกค้า',
        phone: PHONE,
        usePoints: true,
        items: [{ id: 'latte', quantity: 1, sweetness: 50, milkType: 'cow' }],
      },
    };

    const sendNotification = vi.fn().mockResolvedValue({ success: true, channel: 'telegram' });
    const first = await checkoutOrderHandler(request, db, sendNotification);
    const retry = await checkoutOrderHandler(request, db, sendNotification);

    expect(retry).toEqual(first);
    expect(first.queueNumber).toBe(7);
    expect(first.pendingCount).toBe(1);
    expect(first.total).toBe(10);
    expect(sendNotification).toHaveBeenCalledOnce();
    expect(sendNotification.mock.calls[0][0]).toMatchObject({
      queueNumber: 7,
      customerName: request.data.customerName,
      total: 10,
    });

    const [orders, queue, member, requests] = await Promise.all([
      db.collection(`${BASE_PATH}/orders`).get(),
      db.doc(`${BASE_PATH}/config/queue`).get(),
      db.doc(`${BASE_PATH}/members/${PHONE}`).get(),
      db.collection(`${BASE_PATH}/checkoutRequests`).get(),
    ]);
    expect(orders.size).toBe(1);
    expect(requests.size).toBe(1);
    expect(queue.data().current).toBe(8);
    expect(member.data().points).toBe(20);
    expect(member.data().pendingPoints).toBe(1);
  });
});
