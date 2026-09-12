import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { queueDayKey } from './queueDay.js';

// Runs against the Firestore emulator only (like checkoutTransaction.integration.test.js).
const BASE_PATH = 'artifacts/siwara-pos-v1/public/data';

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('daily queue reset in the checkout transaction', () => {
  let db;
  let checkoutOrderHandler;
  const notify = vi.fn().mockResolvedValue({ success: true });
  const order = (id) => ({
    auth: { uid: `anon-${id}` },
    data: { requestId: `rollover_request_${id}`, customerName: 'ลูกค้า', phone: '', usePoints: false, items: [{ id: 'latte', quantity: 1, sweetness: 50, milkType: 'cow' }] },
  });

  beforeAll(async () => {
    process.env.GCLOUD_PROJECT = 'siwarapos';
    const admin = await import('firebase-admin/firestore');
    ({ checkoutOrderHandler } = await import('./index.js'));
    db = admin.getFirestore();
    await db.recursiveDelete(db.collection('artifacts'));
    await Promise.all([
      db.doc(`${BASE_PATH}/config/settings`).set({ vatEnabled: false, cakeSaleCategories: ['เค้ก'] }),
      // yesterday's business day ended at #903
      db.doc(`${BASE_PATH}/config/queue`).set({ current: 903, day: '2000-01-01' }),
      db.doc(`${BASE_PATH}/menu/latte`).set({ name: 'ลาเต้', category: 'กาแฟ', price: 60, available: true, stockLinks: [] }),
      // an order from a previous day that nobody closed — must not count in today's line
      db.collection(`${BASE_PATH}/orders`).doc('stale').set({ status: 'pending', queueNumber: 900, createdAt: new Date('2000-01-01T12:00:00+07:00') }),
    ]);
  });

  afterAll(async () => { if (db) await db.terminate(); });

  it('restarts at #1 on a new business day and ignores stale pending orders', async () => {
    const first = await checkoutOrderHandler(order('a'), db, notify);
    const second = await checkoutOrderHandler(order('b'), db, notify);
    expect(first.queueNumber).toBe(1);
    expect(first.pendingCount).toBe(1);   // stale order from 2000-01-01 not counted
    expect(second.queueNumber).toBe(2);
    expect(second.pendingCount).toBe(2);  // first order still pending, then ours
    const queue = (await db.doc(`${BASE_PATH}/config/queue`).get()).data();
    expect(queue).toEqual({ current: 3, day: queueDayKey() });
  });
});
