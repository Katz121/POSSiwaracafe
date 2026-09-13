import { initializeApp } from 'firebase-admin/app';
import { FieldPath, FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { nextQueueNumber, queueDayStart, countPendingSince } from './queueDay.js';
import { defineSecret } from 'firebase-functions/params';
import { buildTrustedCheckout } from './checkoutLogic.js';
import { notifyShopOrder } from './shopNotification.js';
import {
  buildMemberContext,
  computeDaysAway,
  formatMemberContextLine,
  MEMBER_ORDERS_QUERY_LIMIT,
} from './memberContext.js';
import {
  buildExpireHistoryEntry,
  computeAutoApproveTake,
  computePointsExpireAt,
  isLookupPhone,
  publicMemberLookup,
  resolvePointsEarned,
  shouldAutoApproveQrPoints,
  shouldExpirePoints,
} from './pointsLogic.js';

initializeApp();

const db = getFirestore();
const APP_ID = 'siwara-pos-v1';
const REGION = 'asia-southeast1';
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{16,80}$/;
const PHONE_PATTERN = /^\d{9,15}$/;
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MEMBER_PAGE_SIZE = 100;
const notifySharedSecret = defineSecret('NOTIFY_SHARED_SECRET');

function dataPath(appId = APP_ID) {
  return `artifacts/${appId}/public/data`;
}

function snapshotExists(snap) {
  if (!snap) return false;
  return typeof snap.exists === 'function' ? snap.exists() : !!snap.exists;
}

function snapshotData(snap) {
  return snapshotExists(snap) ? (snap.data() || null) : null;
}

function parseWindowStart(value) {
  if (!value) return 0;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

const errorCodeMap = {
  'invalid-items': 'invalid-argument',
  'invalid-item': 'invalid-argument',
  'note-too-long': 'invalid-argument',
  'invalid-modifiers': 'invalid-argument',
  'invalid-sweetness': 'invalid-argument',
  'invalid-milk': 'invalid-argument',
  'item-unavailable': 'failed-precondition',
  'modifier-unavailable': 'failed-precondition',
  'points-not-eligible': 'failed-precondition',
};

function cleanCustomer(data) {
  const customerName = String(data?.customerName || '').trim();
  const phone = String(data?.phone || '').replace(/\D/g, '');
  if (!customerName || customerName.length > 80) {
    throw new HttpsError('invalid-argument', 'invalid-customer-name');
  }
  if (phone && !PHONE_PATTERN.test(phone)) {
    throw new HttpsError('invalid-argument', 'invalid-phone');
  }
  return { customerName, phone };
}

function requestedDocumentIds(items, field) {
  return [...new Set(items.flatMap((item) => (
    field === 'id' ? [item?.id] : (Array.isArray(item?.modifierIds) ? item.modifierIds : [])
  )).filter(Boolean))];
}

export async function checkoutOrderHandler(request, database = db, sendNotification = notifyShopOrder) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'sign-in-required');

  const data = request.data || {};
  const requestId = String(data.requestId || '');
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    throw new HttpsError('invalid-argument', 'invalid-request-id');
  }
  const requestedItems = data.items;
  if (!Array.isArray(requestedItems) || requestedItems.length < 1 || requestedItems.length > 50) {
    throw new HttpsError('invalid-argument', 'invalid-items');
  }
  const { customerName, phone } = cleanCustomer(data);

  // Keep the Admin paths identical to the client-side Firestore namespace.
  const basePath = `artifacts/${APP_ID}/public/data`;
  const queueRef = database.doc(`${basePath}/config/queue`);
  const settingsRef = database.doc(`${basePath}/config/settings`);
  const orderRef = database.collection(`${basePath}/orders`).doc();
  const requestRef = database.doc(`${basePath}/checkoutRequests/${request.auth.uid}_${requestId}`);
  const memberRef = phone ? database.doc(`${basePath}/members/${phone}`) : null;
  const menuIds = requestedDocumentIds(requestedItems, 'id');
  const modifierIds = requestedDocumentIds(requestedItems, 'modifierIds');
  const menuRefs = menuIds.map((id) => database.doc(`${basePath}/menu/${id}`));
  const modifierRefs = modifierIds.map((id) => database.doc(`${basePath}/beanModifiers/${id}`));

  try {
    const transactionResult = await database.runTransaction(async (transaction) => {
      const existing = await transaction.get(requestRef);
      if (existing.exists) return { response: existing.data().response, order: null };

      // อ่านทีละคำสั่ง ห้ามยิง transaction.get พร้อมกันหลายตัว: Firestore ต่อหนึ่ง
      // ทรานแซกชันรับ read ได้ทีละคำสั่ง การยิงขนาน (Promise.all / promise ที่ยัง
      // ไม่ await) ทำให้ read บางตัวอ้างทรานแซกชันที่ยังไม่พร้อมหรือหมดอายุแล้ว และ
      // ตกด้วย `10 ABORTED: The referenced transaction has expired or is no longer
      // valid` ทุกครั้งจนลูกค้าสั่งของไม่ได้ · เอกสารหลายใบใช้ getAll ซึ่งเป็น read
      // เดียวแบบ batch ไม่ใช่การยิงขนาน
      const pendingQuery = database.collection(`${basePath}/orders`).where('status', '==', 'pending');
      const pendingSnapshot = await transaction.get(pendingQuery);
      const refs = [settingsRef, queueRef, ...menuRefs, ...modifierRefs, ...(memberRef ? [memberRef] : [])];
      const snapshots = await transaction.getAll(...refs);
      const [settingsSnapshot, queueSnapshot] = snapshots;
      const menuStart = 2;
      const modifierStart = menuStart + menuRefs.length;
      const memberSnapshot = memberRef ? snapshots[snapshots.length - 1] : null;
      const menuById = new Map(menuRefs.map((ref, index) => {
        const snapshot = snapshots[menuStart + index];
        return [ref.id, snapshot.exists ? { id: ref.id, ...snapshot.data() } : null];
      }));
      const modifiersById = new Map(modifierRefs.map((ref, index) => {
        const snapshot = snapshots[modifierStart + index];
        return [ref.id, snapshot.exists ? { id: ref.id, ...snapshot.data() } : null];
      }));
      const member = memberSnapshot?.exists ? memberSnapshot.data() : null;
      const now = new Date();
      // lastOrderAt เดิมก่อนถูกทับ — ใช้คำนวณ "หายไปกี่วัน" ให้พนักงาน
      const daysAway = phone ? computeDaysAway(member?.lastOrderAt, now) : null;
      const checkout = buildTrustedCheckout({
        requestedItems,
        menuById,
        modifiersById,
        settings: settingsSnapshot.exists ? settingsSnapshot.data() : {},
        member,
        usePoints: data.usePoints === true,
        now,
      });

      // Queue restarts at 1 every business day (10:00 Bangkok) — see queueDay.js
      const queue = nextQueueNumber(queueSnapshot.exists ? queueSnapshot.data() : null, now);
      const queueNumber = queue.number;
      const createdAt = Timestamp.fromDate(now);
      const date = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(now);
      const time = new Intl.DateTimeFormat('th-TH', {
        timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).format(now);
      const orderData = {
        queueNumber,
        items: checkout.items,
        subtotal: checkout.subtotal,
        discount: checkout.discount,
        vat: checkout.vat,
        total: checkout.total,
        vatIncluded: !!settingsSnapshot.data()?.vatEnabled,
        isPaid: false,
        memberPhone: phone,
        memberNickname: customerName,
        customerName,
        status: 'pending',
        promotionTitle: checkout.promotionTitle,
        promotionDiscountPercent: checkout.promotionDiscountPercent,
        bringOwnGlass: false,
        createdAt,
        date,
        time,
        table: 'QR',
        source: 'qr',
        checkoutRequestId: requestId,
        pointsEarned: checkout.pointsToAdd,
      };
      const response = {
        orderId: orderRef.id,
        queueNumber,
        // Position in today's kitchen line (this order included). Only pending
        // orders from the current business day count, so an old order nobody
        // closed can't make a customer think there are dozens ahead of them.
        pendingCount: countPendingSince(pendingSnapshot.docs, queueDayStart(now)) + 1,
        total: checkout.total,
        daysAway,
      };

      transaction.set(queueRef, { current: queueNumber + 1, day: queue.day }, { merge: true });
      transaction.create(orderRef, orderData);
      if (memberRef) {
        const memberPayload = {
          name: customerName,
          phone,
          lastOrderAt: createdAt,
          pendingReason: 'order',
        };
        if (checkout.pointsToAdd > 0) {
          memberPayload.pendingPoints = FieldValue.increment(checkout.pointsToAdd);
          memberPayload.pendingOrderIds = FieldValue.arrayUnion(orderRef.id);
        }
        if (checkout.redeemDeduct > 0) {
          memberPayload.points = FieldValue.increment(-checkout.redeemDeduct);
          memberPayload.pointsHistory = FieldValue.arrayUnion({
            delta: -checkout.redeemDeduct,
            reason: 'redeem',
            at: now.toISOString(),
            orderId: orderRef.id,
            by: 'system:checkout',
          });
        }
        if (!memberSnapshot?.exists) memberPayload.createdAt = createdAt;
        transaction.set(memberRef, memberPayload, { merge: true });
      }
      transaction.create(requestRef, {
        uid: request.auth.uid,
        orderId: orderRef.id,
        createdAt,
        response,
      });
      return { response, order: { ...orderData, daysAway } };
    });

    // Notify only for a newly-created order. An idempotent replay returns the
    // original response without sending a duplicate shop alert.
    if (transactionResult.order) {
      try {
        const order = transactionResult.order;
        let notifyOrder = order;
        const memberPhone = String(order.memberPhone || '');
        if (memberPhone) {
          try {
            const snap = await database
              .collection(`${basePath}/orders`)
              .where('memberPhone', '==', memberPhone)
              .limit(MEMBER_ORDERS_QUERY_LIMIT)
              .get();
            const ctx = buildMemberContext({
              orders: snap.docs.map((docSnap) => docSnap.data()),
              daysAway: order.daysAway,
            });
            notifyOrder = {
              ...order,
              memberContext: { ...ctx, line: formatMemberContextLine(ctx) },
            };
          } catch (contextError) {
            // ประวัติสมาชิกพังต้องไม่ทำให้บอทออเดอร์เงียบ
            console.error('member context query failed', contextError);
          }
        }
        await sendNotification(notifyOrder, { secret: notifySharedSecret.value() });
      } catch (notificationError) {
        // The order is already committed. Notification failure must never make
        // the customer retry checkout and create uncertainty at the counter.
        console.error('shop notification failed', notificationError);
      }
    }
    return transactionResult.response;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    const message = error?.message || 'checkout-failed';
    const code = errorCodeMap[message];
    if (code) throw new HttpsError(code, message);
    console.error('checkoutOrder failed', error);
    throw new HttpsError('internal', 'checkout-failed');
  }
}

export const checkoutOrder = onCall(
  { region: REGION, timeoutSeconds: 30, secrets: [notifySharedSecret] },
  (request) => checkoutOrderHandler(request),
);

export async function autoApproveQrPointsHandler(event, database = db) {
  const after = snapshotData(event?.data?.after);
  const before = snapshotData(event?.data?.before);
  if (!shouldAutoApproveQrPoints(before, after)) return;

  const appId = event?.params?.appId || APP_ID;
  const orderId = event?.params?.orderId || event?.data?.after?.id;
  if (!orderId) return;
  const base = dataPath(appId);
  const orderRef = database.doc(`${base}/orders/${orderId}`);

  await database.runTransaction(async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    const order = snapshotData(orderSnap);
    // Re-read as if it just flipped to paid so a replay still no-ops on pointsAutoApproved.
    if (!shouldAutoApproveQrPoints({ isPaid: false }, order)) return;

    const phone = String(order.memberPhone);
    let memberRef = database.doc(`${base}/members/${phone}`);
    let memberSnap = await transaction.get(memberRef);
    if (!snapshotExists(memberSnap)) {
      const found = await transaction.get(
        database.collection(`${base}/members`).where('phone', '==', phone).limit(1),
      );
      if (found.empty) {
        transaction.update(orderRef, { pointsAutoApproved: true });
        return;
      }
      memberRef = found.docs[0].ref;
      memberSnap = found.docs[0];
    }

    const member = memberSnap.data() || {};
    const earn = resolvePointsEarned(order);
    const pending = Math.max(0, Number(member.pendingPoints) || 0);
    const take = computeAutoApproveTake(earn, pending);
    const nowIso = new Date().toISOString();
    const payload = {
      pendingOrderIds: FieldValue.arrayRemove(orderId),
    };
    if (take > 0) {
      payload.points = (Number(member.points) || 0) + take;
      payload.pendingPoints = pending - take;
      payload.pointsHistory = FieldValue.arrayUnion({
        delta: take,
        reason: 'order',
        by: 'system:auto-qr',
        orderId,
        at: nowIso,
      });
    }
    if (pending - take <= 0) payload.pendingReason = '';

    transaction.update(memberRef, payload);
    transaction.update(orderRef, { pointsAutoApproved: true });
  });
}

async function forEachMemberPage(database, fn) {
  const col = database.collection(`${dataPath()}/members`);
  let last = null;
  for (;;) {
    let query = col.orderBy(FieldPath.documentId()).limit(MEMBER_PAGE_SIZE);
    if (last) query = query.startAfter(last);
    const snap = await query.get();
    if (snap.empty) return;
    await fn(snap.docs);
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < MEMBER_PAGE_SIZE) return;
  }
}

export async function expirePointsHandler(_event, database = db, now = new Date()) {
  const settingsRef = database.doc(`${dataPath()}/config/settings`);
  const settingsSnap = await settingsRef.get();
  const settings = settingsSnap.exists ? settingsSnap.data() || {} : {};
  const months = Number(settings.pointsExpiryMonths) || 0;

  if (months <= 0) {
    if (settings.pointsExpiryEnabledAt) await settingsRef.update({ pointsExpiryEnabledAt: FieldValue.delete() });
    await forEachMemberPage(database, async (docs) => {
      const toClear = docs.filter((docSnap) => docSnap.data()?.pointsExpireAt);
      if (!toClear.length) return;
      const batch = database.batch();
      toClear.forEach((docSnap) => batch.update(docSnap.ref, { pointsExpireAt: null }));
      await batch.commit();
    });
    return;
  }

  // First run after the owner turns expiry on starts the 30-day grace period.
  let enabledAt = settings.pointsExpiryEnabledAt || null;
  if (!enabledAt) {
    enabledAt = now.toISOString();
    await settingsRef.set({ pointsExpiryEnabledAt: enabledAt }, { merge: true });
  }

  await forEachMemberPage(database, async (docs) => {
    for (const docSnap of docs) {
      const member = docSnap.data() || {};
      const points = Number(member.points) || 0;
      if (points <= 0) continue;
      const expireAt = computePointsExpireAt(member.lastOrderAt, months, enabledAt);
      if (!expireAt) continue;

      if (shouldExpirePoints(member.lastOrderAt, months, now, enabledAt)) {
        await database.runTransaction(async (transaction) => {
          const fresh = await transaction.get(docSnap.ref);
          if (!fresh.exists) return;
          const current = Number(fresh.data()?.points) || 0;
          if (current <= 0) {
            transaction.update(docSnap.ref, { pointsExpireAt: null });
            return;
          }
          transaction.update(docSnap.ref, {
            points: 0,
            pointsExpireAt: null,
            pointsHistory: FieldValue.arrayUnion(
              buildExpireHistoryEntry(current, months, now.toISOString()),
            ),
          });
        });
        continue;
      }

      const iso = expireAt.toISOString();
      if (member.pointsExpireAt !== iso) {
        await docSnap.ref.update({ pointsExpireAt: iso });
      }
    }
  });
}

export async function lookupMemberHandler(request, database = db) {
  if (!request?.auth?.uid) throw new HttpsError('unauthenticated', 'sign-in-required');

  const phone = String(request?.data?.phone || '');
  if (!isLookupPhone(phone)) throw new HttpsError('invalid-argument', 'invalid-phone');

  const uid = request.auth.uid;
  const rateRef = database.doc(`${dataPath()}/rateLimits/${uid}`);
  await database.runTransaction(async (transaction) => {
    const snap = await transaction.get(rateRef);
    const now = Date.now();
    let windowStart = now;
    let count = 0;
    if (snap.exists) {
      const start = parseWindowStart(snap.data()?.windowStart);
      if (start && now - start < RATE_LIMIT_WINDOW_MS) {
        windowStart = start;
        count = Number(snap.data()?.count) || 0;
      }
    }
    if (count >= RATE_LIMIT_MAX) {
      throw new HttpsError('resource-exhausted', 'rate-limit-exceeded');
    }
    transaction.set(rateRef, {
      windowStart: new Date(windowStart).toISOString(),
      count: count + 1,
    });
  });

  const memberRef = database.doc(`${dataPath()}/members/${phone}`);
  const direct = await memberRef.get();
  if (direct.exists) return publicMemberLookup(direct.data());

  const found = await database.collection(`${dataPath()}/members`).where('phone', '==', phone).limit(1).get();
  if (found.empty) return { exists: false };
  return publicMemberLookup(found.docs[0].data());
}

export const autoApproveQrPoints = onDocumentWritten(
  {
    region: REGION,
    document: 'artifacts/{appId}/public/data/orders/{orderId}',
  },
  (event) => autoApproveQrPointsHandler(event),
);

export const expirePoints = onSchedule(
  {
    schedule: '0 3 * * *',
    timeZone: 'Asia/Bangkok',
    region: REGION,
  },
  (event) => expirePointsHandler(event),
);

export const lookupMember = onCall(
  { region: REGION },
  (request) => lookupMemberHandler(request),
);
