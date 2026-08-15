import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { buildTrustedCheckout } from './checkoutLogic.js';
import { notifyShopOrder } from './shopNotification.js';

initializeApp();

const db = getFirestore();
const APP_ID = 'siwara-pos-v1';
const REGION = 'asia-southeast1';
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{16,80}$/;
const PHONE_PATTERN = /^\d{9,15}$/;
const notifySharedSecret = defineSecret('NOTIFY_SHARED_SECRET');

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

      const pendingQuery = database.collection(`${basePath}/orders`).where('status', '==', 'pending');
      const pendingSnapshotPromise = transaction.get(pendingQuery);
      const refs = [settingsRef, queueRef, ...menuRefs, ...modifierRefs, ...(memberRef ? [memberRef] : [])];
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
      const pendingSnapshot = await pendingSnapshotPromise;
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
      const checkout = buildTrustedCheckout({
        requestedItems,
        menuById,
        modifiersById,
        settings: settingsSnapshot.exists ? settingsSnapshot.data() : {},
        member,
        usePoints: data.usePoints === true,
        now,
      });

      const queueNumber = queueSnapshot.exists ? Number(queueSnapshot.data().current) || 1 : 1;
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
      };
      const response = {
        orderId: orderRef.id,
        queueNumber,
        pendingCount: pendingSnapshot.size + 1,
        total: checkout.total,
      };

      transaction.set(queueRef, { current: queueNumber + 1 }, { merge: true });
      transaction.create(orderRef, orderData);
      if (memberRef) {
        const memberPayload = {
          name: customerName,
          phone,
          lastOrderAt: createdAt,
          pendingReason: 'order',
        };
        if (checkout.pointsToAdd > 0) memberPayload.pendingPoints = FieldValue.increment(checkout.pointsToAdd);
        if (checkout.redeemDeduct > 0) {
          memberPayload.points = FieldValue.increment(-checkout.redeemDeduct);
          memberPayload.pointsHistory = FieldValue.arrayUnion({
            delta: -checkout.redeemDeduct,
            reason: 'redeem',
            at: now.toISOString(),
            orderId: orderRef.id,
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
      return { response, order: orderData };
    });

    // Notify only for a newly-created order. An idempotent replay returns the
    // original response without sending a duplicate shop alert.
    if (transactionResult.order) {
      try {
        await sendNotification(transactionResult.order, { secret: notifySharedSecret.value() });
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
