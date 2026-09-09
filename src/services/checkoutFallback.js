/**
 * Direct-to-Firestore checkout fallback (ใช้เมื่อ Cloud Function ล่ม)
 *
 * ทำไมต้องมี: 2026-09-09 บัญชีเรียกเก็บเงินของโปรเจกต์ถูกปิด → Cloud Run หยุดรับ
 * request ทั้งหมด → callable `checkoutOrder` คืน `functions/internal` → ลูกค้าสั่งของ
 * ไม่ได้เลยทั้งร้าน ทั้งที่ Firestore ยังทำงานปกติดี ตัวนี้คือทางออกฉุกเฉิน: เขียน
 * ออเดอร์ลง Firestore ตรงๆ แบบเดียวกับที่หน้า POS ของพนักงานทำอยู่แล้ว
 *
 * ข้อแลก (ต้องรู้ก่อนใช้): ราคาถูกคำนวณฝั่ง client ไม่ได้ผ่าน `buildTrustedCheckout`
 * ฝั่งเซิร์ฟเวอร์ ใครแก้ JS ในเบราว์เซอร์ก็ยัดราคาเองได้ · เพราะงั้นเส้นทางนี้ทำงาน
 * เฉพาะตอน callable ล่มจริงเท่านั้น (ดู `isBackendDown`) และทุกออเดอร์ที่ผ่านทางนี้
 * ถูกปั๊ม `trustedCheckout: false` ไว้ให้ร้านตรวจย้อนหลังได้
 *
 * firestore.rules อนุญาตอยู่แล้ว: `config/queue` เปิดให้ลูกค้า read+write เพื่อกดคิว
 * ในทรานแซกชัน และ `orders/{id}` เปิดให้ create ได้ถ้า status เป็น pending
 */

import {
  collection, doc, getCountFromServer, increment, query, runTransaction, where,
} from 'firebase/firestore';

/** โค้ด error ที่แปลว่า "backend ล่ม" ไม่ใช่ "ข้อมูลลูกค้าผิด" */
const BACKEND_DOWN_CODES = new Set([
  'functions/internal',
  'functions/unavailable',
  'functions/deadline-exceeded',
  'functions/unknown',
  'internal',
  'unavailable',
  'deadline-exceeded',
  'unknown',
]);

export function isBackendDown(code) {
  return BACKEND_DOWN_CODES.has(String(code || ''));
}

function bangkokDate(now) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function bangkokTime(now) {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(now);
}

/**
 * เขียนออเดอร์ลง Firestore ตรงๆ · คืนรูปแบบเดียวกับที่ callable คืน
 * เพื่อให้ฝั่งเรียกใช้ไม่ต้องแยกเคส
 *
 * @returns {Promise<{orderId: string, queueNumber: number, pendingCount: number, total: number}>}
 */
export async function submitCheckoutDirect(db, appId, {
  uid,
  requestId,
  customerName,
  phone = '',
  cart,
  totals,
  usePoints = false,
  member = null,
  redeemPointsThreshold = 100,
  vatIncluded = false,
  promotionTitle = '',
  promotionDiscountPercent = 0,
}) {
  const base = ['artifacts', appId, 'public', 'data'];
  const queueRef = doc(db, ...base, 'config', 'queue');
  // id คงที่ต่อ requestId → กดส่งซ้ำจะไม่เกิดออเดอร์ซ้ำ
  const orderRef = doc(db, ...base, 'orders', `qr_${uid}_${requestId}`.slice(0, 120));
  const memberRef = phone ? doc(db, ...base, 'members', phone) : null;

  const now = new Date();
  const total = Number(totals.total) || 0;
  const redeemDeduct = usePoints && member && Number(member.points || 0) >= redeemPointsThreshold
    ? redeemPointsThreshold
    : 0;
  const pointsToAdd = Math.floor(total / 10);

  const queueNumber = await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(orderRef);
    // ส่งซ้ำด้วย requestId เดิม = ออเดอร์เดิม ไม่กดคิวใหม่ ไม่แจกแต้มซ้ำ
    if (existing.exists()) return Number(existing.data().queueNumber) || 0;

    const queueSnapshot = await transaction.get(queueRef);
    const nextQueue = queueSnapshot.exists() ? Number(queueSnapshot.data().current) || 1 : 1;

    transaction.set(orderRef, {
      queueNumber: nextQueue,
      items: cart,
      subtotal: Number(totals.subtotal) || 0,
      discount: Number(totals.discount) || 0,
      vat: Number(totals.vat) || 0,
      total,
      vatIncluded,
      isPaid: false,
      memberPhone: phone,
      memberNickname: customerName,
      customerName,
      status: 'pending',
      promotionTitle,
      promotionDiscountPercent,
      bringOwnGlass: false,
      createdAt: now,
      date: bangkokDate(now),
      time: bangkokTime(now),
      table: 'QR',
      source: 'qr',
      checkoutRequestId: requestId,
      // ปั๊มไว้ให้ร้านรู้ว่าออเดอร์นี้ไม่ได้ผ่านการตรวจราคาฝั่งเซิร์ฟเวอร์
      trustedCheckout: false,
    });
    transaction.set(queueRef, { current: nextQueue + 1 }, { merge: true });

    if (memberRef) {
      const memberPayload = {
        name: customerName,
        phone,
        lastOrderAt: now,
        pendingReason: 'order',
      };
      if (pointsToAdd > 0) memberPayload.pendingPoints = increment(pointsToAdd);
      if (redeemDeduct > 0) memberPayload.points = increment(-redeemDeduct);
      transaction.set(memberRef, memberPayload, { merge: true });
    }

    return nextQueue;
  });

  // จำนวนคิวที่รออยู่ ใช้โชว์บนหน้าสำเร็จเท่านั้น · นับนอกทรานแซกชันเพราะ Web SDK
  // ทำ query ในทรานแซกชันไม่ได้ · พังก็ไม่เป็นไร ออเดอร์บันทึกไปแล้ว
  let pendingCount = 0;
  try {
    const snapshot = await getCountFromServer(
      query(collection(db, ...base, 'orders'), where('status', '==', 'pending')),
    );
    pendingCount = snapshot.data().count;
  } catch {
    pendingCount = 0;
  }

  return { orderId: orderRef.id, queueNumber, pendingCount, total };
}
