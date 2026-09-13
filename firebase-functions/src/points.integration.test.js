import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';

const PROJECT_ID = 'siwarapos';
const BASE_PATH = 'artifacts/siwara-pos-v1/public/data';
const APP_ID = 'siwara-pos-v1';

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('points v2 Cloud Functions', () => {
  let db;
  let Timestamp;
  let autoApproveQrPointsHandler;
  let expirePointsHandler;
  let lookupMemberHandler;

  function orderEvent(orderId, after, before = null) {
    return {
      params: { appId: APP_ID, orderId },
      data: {
        before: before
          ? { exists: true, data: () => before }
          : { exists: false, data: () => undefined },
        after: { exists: true, id: orderId, data: () => after },
      },
    };
  }

  beforeAll(async () => {
    process.env.GCLOUD_PROJECT = PROJECT_ID;
    const admin = await import('firebase-admin/firestore');
    Timestamp = admin.Timestamp;
    ({ autoApproveQrPointsHandler, expirePointsHandler, lookupMemberHandler } = await import('./index.js'));
    db = admin.getFirestore();
    await db.recursiveDelete(db.collection('artifacts'));
  });

  afterAll(async () => {
    if (db) await db.terminate();
  });

  describe('auto-approve QR points', () => {
    const phone = '0811111111';

    async function seedQrBill({
      orderId,
      memberId = phone,
      pendingPoints = 8,
      points = 10,
      pointsEarned = 8,
      extraMember = {},
      extraOrder = {},
    }) {
      const order = {
        isPaid: true,
        source: 'qr',
        memberPhone: phone,
        total: 80,
        pointsEarned,
        ...extraOrder,
      };
      await Promise.all([
        db.doc(`${BASE_PATH}/orders/${orderId}`).set(order),
        db.doc(`${BASE_PATH}/members/${memberId}`).set({
          name: 'ลูกค้า QR',
          phone,
          points,
          pendingPoints,
          pendingReason: 'order',
          pendingOrderIds: [orderId],
          pointsHistory: [],
          ...extraMember,
        }),
      ]);
      return order;
    }

    it('moves pending points once, even when the trigger fires twice', async () => {
      const orderId = 'qr-paid-1';
      const after = await seedQrBill({ orderId });
      const event = orderEvent(orderId, after, { ...after, isPaid: false });

      await autoApproveQrPointsHandler(event, db);
      await autoApproveQrPointsHandler(event, db);

      const [member, order] = await Promise.all([
        db.doc(`${BASE_PATH}/members/${phone}`).get(),
        db.doc(`${BASE_PATH}/orders/${orderId}`).get(),
      ]);
      expect(order.data().pointsAutoApproved).toBe(true);
      expect(member.data().points).toBe(18);
      expect(member.data().pendingPoints).toBe(0);
      expect(member.data().pendingReason).toBe('');
      expect(member.data().pendingOrderIds || []).toEqual([]);
      expect(member.data().pointsHistory).toHaveLength(1);
      expect(member.data().pointsHistory[0]).toMatchObject({
        delta: 8,
        reason: 'order',
        by: 'system:auto-qr',
        orderId,
      });
    });

    it('does not touch a POS bill', async () => {
      const orderId = 'pos-paid-1';
      const posPhone = '0822222222';
      const after = {
        isPaid: true,
        source: 'pos',
        memberPhone: posPhone,
        total: 90,
        pointsEarned: 9,
      };
      await Promise.all([
        db.doc(`${BASE_PATH}/orders/${orderId}`).set(after),
        db.doc(`${BASE_PATH}/members/${posPhone}`).set({
          name: 'ลูกค้า POS',
          phone: posPhone,
          points: 4,
          pendingPoints: 9,
          pendingReason: 'order',
          pendingOrderIds: [orderId],
          pointsHistory: [],
        }),
      ]);

      await autoApproveQrPointsHandler(orderEvent(orderId, after, { ...after, isPaid: false }), db);

      const [member, order] = await Promise.all([
        db.doc(`${BASE_PATH}/members/${posPhone}`).get(),
        db.doc(`${BASE_PATH}/orders/${orderId}`).get(),
      ]);
      expect(order.data().pointsAutoApproved).toBeUndefined();
      expect(member.data().points).toBe(4);
      expect(member.data().pendingPoints).toBe(9);
      expect(member.data().pointsHistory).toEqual([]);
    });

    it('sets pointsAutoApproved with take=0 when the owner already approved', async () => {
      const orderId = 'qr-already-approved';
      const memberId = '0833333333';
      const after = await seedQrBill({
        orderId,
        memberId,
        pendingPoints: 0,
        points: 40,
        pointsEarned: 8,
        extraMember: { phone: memberId, pendingOrderIds: [] },
        extraOrder: { memberPhone: memberId },
      });

      await autoApproveQrPointsHandler(orderEvent(orderId, after, { ...after, isPaid: false }), db);

      const [member, order] = await Promise.all([
        db.doc(`${BASE_PATH}/members/${memberId}`).get(),
        db.doc(`${BASE_PATH}/orders/${orderId}`).get(),
      ]);
      expect(order.data().pointsAutoApproved).toBe(true);
      expect(member.data().points).toBe(40);
      expect(member.data().pendingPoints).toBe(0);
      expect(member.data().pointsHistory).toEqual([]);
    });

    it('finds a member by phone query when the doc id is not the phone', async () => {
      const orderId = 'qr-alt-member';
      const after = {
        isPaid: true,
        source: 'qr',
        checkoutRequestId: 'checkout_alt_1',
        memberPhone: '0844444444',
        total: 50,
        pointsEarned: 5,
      };
      await Promise.all([
        db.doc(`${BASE_PATH}/orders/${orderId}`).set(after),
        db.doc(`${BASE_PATH}/members/alt-doc`).set({
          name: 'สมาชิกไอดีอื่น',
          phone: '0844444444',
          points: 1,
          pendingPoints: 5,
          pendingReason: 'order',
          pendingOrderIds: [orderId],
          pointsHistory: [],
        }),
      ]);

      await autoApproveQrPointsHandler(orderEvent(orderId, after), db);

      const member = await db.doc(`${BASE_PATH}/members/alt-doc`).get();
      expect(member.data().points).toBe(6);
      expect(member.data().pendingPoints).toBe(0);
      expect(member.data().pointsHistory[0]).toMatchObject({ by: 'system:auto-qr', orderId, delta: 5 });
    });
  });

  describe('expirePoints', () => {
    const now = new Date('2026-09-13T03:00:00+07:00');

    it('clears pointsExpireAt when expiry months is off', async () => {
      await db.doc(`${BASE_PATH}/config/settings`).set({ pointsExpiryMonths: 0 });
      await db.doc(`${BASE_PATH}/members/exp-off`).set({
        name: 'ปิดหมดอายุ',
        phone: '0850000000',
        points: 20,
        pointsExpireAt: '2026-12-01T00:00:00.000Z',
        lastOrderAt: '2026-06-01T00:00:00.000Z',
      });

      await expirePointsHandler({}, db, now);

      const member = await db.doc(`${BASE_PATH}/members/exp-off`).get();
      expect(member.data().pointsExpireAt).toBeNull();
      expect(member.data().points).toBe(20);
    });

    it('zeros expired points and writes an expire history entry', async () => {
      await db.doc(`${BASE_PATH}/config/settings`).set({ pointsExpiryMonths: 6 });
      await db.doc(`${BASE_PATH}/members/exp-old`).set({
        name: 'หมดอายุ',
        phone: '0850000001',
        points: 35,
        lastOrderAt: Timestamp.fromDate(new Date('2025-01-01T10:00:00+07:00')),
        pointsHistory: [],
        pointsExpireAt: '2025-07-01T03:00:00.000Z',
      });

      await expirePointsHandler({}, db, now);

      const member = await db.doc(`${BASE_PATH}/members/exp-old`).get();
      expect(member.data().points).toBe(0);
      expect(member.data().pointsExpireAt).toBeNull();
      expect(member.data().pointsHistory).toHaveLength(1);
      expect(member.data().pointsHistory[0]).toMatchObject({
        delta: -35,
        reason: 'expire',
        by: 'system:expire',
        note: 'แต้มหมดอายุ ไม่ได้มาซื้อ 6 เดือน',
      });
    });

    it('writes pointsExpireAt when the member is still in time, and skips missing lastOrderAt', async () => {
      await db.doc(`${BASE_PATH}/config/settings`).set({ pointsExpiryMonths: 6 });
      const last = new Date('2026-08-01T10:00:00+07:00');
      await Promise.all([
        db.doc(`${BASE_PATH}/members/exp-fresh`).set({
          name: 'ยังไม่หมด',
          phone: '0850000002',
          points: 12,
          lastOrderAt: last.toISOString(),
        }),
        db.doc(`${BASE_PATH}/members/exp-noload`).set({
          name: 'ไม่มีวันบิล',
          phone: '0850000003',
          points: 99,
        }),
      ]);

      await expirePointsHandler({}, db, now);

      const [fresh, skipped] = await Promise.all([
        db.doc(`${BASE_PATH}/members/exp-fresh`).get(),
        db.doc(`${BASE_PATH}/members/exp-noload`).get(),
      ]);
      expect(fresh.data().points).toBe(12);
      expect(fresh.data().pointsExpireAt).toBe(
        new Date('2027-02-01T10:00:00+07:00').toISOString(),
      );
      expect(skipped.data().points).toBe(99);
      expect(skipped.data().pointsExpireAt).toBeUndefined();
    });
  });

  describe('lookupMember', () => {
    const phone = '0866666666';

    beforeAll(async () => {
      await db.doc(`${BASE_PATH}/members/${phone}`).set({
        name: 'ค้นหาได้',
        phone,
        points: 22,
        pendingPoints: 4,
        pointsExpireAt: '2027-01-01T00:00:00.000Z',
        pointsHistory: [{ delta: 1, reason: 'order' }],
        pendingOrderIds: ['secret-bill'],
        nickname: 'ไม่ส่งออก',
      });
    });

    it('returns only the public fields', async () => {
      const result = await lookupMemberHandler({
        auth: { uid: 'anon-lookup-1' },
        data: { phone },
      }, db);
      expect(result).toEqual({
        exists: true,
        name: 'ค้นหาได้',
        points: 22,
        pendingPoints: 4,
        pointsExpireAt: '2027-01-01T00:00:00.000Z',
      });
      expect(Object.keys(result).sort()).toEqual([
        'exists', 'name', 'pendingPoints', 'points', 'pointsExpireAt',
      ]);
    });

    it('returns exists false for an unknown phone', async () => {
      await expect(lookupMemberHandler({
        auth: { uid: 'anon-lookup-missing' },
        data: { phone: '0899999999' },
      }, db)).resolves.toEqual({ exists: false });
    });

    it('rejects invalid phones and unsigned callers', async () => {
      await expect(lookupMemberHandler({ auth: { uid: 'x' }, data: { phone: '123' } }, db))
        .rejects.toMatchObject({ code: 'invalid-argument' });
      await expect(lookupMemberHandler({ auth: { uid: 'x' }, data: { phone: '08123456789' } }, db))
        .rejects.toMatchObject({ code: 'invalid-argument' });
      await expect(lookupMemberHandler({ data: { phone } }, db))
        .rejects.toBeInstanceOf(HttpsError);
      await expect(lookupMemberHandler({ data: { phone } }, db))
        .rejects.toMatchObject({ code: 'unauthenticated' });
    });

    it('rate-limits a uid after 20 lookups in 10 minutes', async () => {
      const uid = 'anon-rate-limit';
      await db.doc(`${BASE_PATH}/rateLimits/${uid}`).set({
        windowStart: new Date().toISOString(),
        count: 20,
      });
      await expect(lookupMemberHandler({ auth: { uid }, data: { phone } }, db))
        .rejects.toMatchObject({ code: 'resource-exhausted' });

      await db.doc(`${BASE_PATH}/rateLimits/${uid}`).set({
        windowStart: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
        count: 20,
      });
      await expect(lookupMemberHandler({ auth: { uid }, data: { phone } }, db))
        .resolves.toMatchObject({ exists: true });
      const limit = await db.doc(`${BASE_PATH}/rateLimits/${uid}`).get();
      expect(limit.data().count).toBe(1);
    });
  });
});
