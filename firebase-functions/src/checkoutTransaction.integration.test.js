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
    expect(member.data().pendingOrderIds).toEqual([orders.docs[0].id]);
    expect(orders.docs[0].data().pointsEarned).toBe(1);
    expect(member.data().pointsHistory).toEqual([
      expect.objectContaining({
        delta: -100,
        reason: 'redeem',
        by: 'system:checkout',
        orderId: orders.docs[0].id,
      }),
    ]);
  });

  const reward = { id: 'shot', name: 'เพิ่มช็อต', cost: 20, enabled: true };
  const rewardRequest = (suffix, extra = {}) => ({
    auth: { uid: 'reward-customer' },
    data: { requestId: `reward_checkout_${suffix}`, customerName: 'ลูกค้า', phone: PHONE,
      redeemRewardId: 'shot', items: [{ id: 'latte', quantity: 1, sweetness: 50, milkType: 'cow' }], ...extra },
  });
  async function seedReward(settings = {}, points = 20) {
    await db.doc(`${BASE_PATH}/config/settings`).set({
      vatEnabled: false, pointsRewardsEnabled: true, pointsRewards: [reward], ...settings,
    });
    await db.doc(`${BASE_PATH}/members/${PHONE}`).set({ points, pendingPoints: 0 });
  }

  it('persists reward and history atomically and redeems only once on replay', async () => {
    await seedReward();
    const notify = vi.fn().mockResolvedValue({ success: true });
    const request = rewardRequest('success');
    const result = await checkoutOrderHandler(request, db, notify);
    expect(await checkoutOrderHandler(request, db, notify)).toEqual(result);
    expect(result.total).toBe(60);
    const order = (await db.doc(`${BASE_PATH}/orders/${result.orderId}`).get()).data();
    expect(order).toMatchObject({ redeemedReward: { id: 'shot', name: reward.name, cost: 20 }, discount: 0, pointsEarned: 6 });
    const member = (await db.doc(`${BASE_PATH}/members/${PHONE}`).get()).data();
    expect(member).toMatchObject({ points: 0, pendingPoints: 6 });
    expect(member.pointsHistory).toEqual([expect.objectContaining({
      delta: -20, reason: 'redeem', by: 'system:checkout', note: reward.name, orderId: result.orderId,
    })]);
    expect(notify).toHaveBeenCalledOnce();
  });

  it.each([
    ['disabled', { pointsRewardsEnabled: false }, 20, {}, 'reward-unavailable', 'failed-precondition'],
    ['missing', { pointsRewards: [] }, 20, {}, 'reward-unavailable', 'failed-precondition'],
    ['inactive', { pointsRewards: [{ ...reward, enabled: false }] }, 20, {}, 'reward-unavailable', 'failed-precondition'],
    ['poor', {}, 19, {}, 'points-not-eligible', 'failed-precondition'],
    ['conflict', {}, 20, { usePoints: true }, 'redeem-conflict', 'invalid-argument'],
  ])('rejects %s without writing order, queue or member', async (suffix, settings, points, extra, message, code) => {
    await seedReward(settings, points);
    const beforeOrders = await db.collection(`${BASE_PATH}/orders`).get();
    const beforeQueue = (await db.doc(`${BASE_PATH}/config/queue`).get()).data();
    const notify = vi.fn();
    await expect(checkoutOrderHandler(rewardRequest(suffix, extra), db, notify)).rejects.toMatchObject({ message, code });
    expect((await db.collection(`${BASE_PATH}/orders`).get()).size).toBe(beforeOrders.size);
    expect((await db.doc(`${BASE_PATH}/config/queue`).get()).data()).toEqual(beforeQueue);
    expect((await db.doc(`${BASE_PATH}/members/${PHONE}`).get()).data()).toEqual({ points, pendingPoints: 0 });
    expect(notify).not.toHaveBeenCalled();
  });

  it('prevents concurrent redemptions from overspending the same points', async () => {
    await seedReward();
    const notify = vi.fn().mockResolvedValue({ success: true });
    const results = await Promise.allSettled([
      checkoutOrderHandler(rewardRequest('concurrent_a'), db, notify),
      checkoutOrderHandler(rewardRequest('concurrent_b'), db, notify),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected').reason.message).toBe('points-not-eligible');
    expect((await db.doc(`${BASE_PATH}/members/${PHONE}`).get()).data().points).toBe(0);
    expect(notify).toHaveBeenCalledOnce();
  });

});
