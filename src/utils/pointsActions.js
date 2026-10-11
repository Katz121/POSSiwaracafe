import { arrayUnion, arrayRemove, increment, runTransaction, doc } from 'firebase/firestore';
import { computeOrderStockUsage } from './wastage.js';
import { resolveStockId } from './stockMerge.js';
import { backfillTotals } from './stockAuditFix.js';

// Points a bill earned are taken back from pending first, then the balance; never below zero.
export function planEarnClawback({ points = 0, pendingPoints = 0 }, earned) {
  if (!Number.isFinite(earned) || earned <= 0) return { fromPending: 0, fromPoints: 0 };
  let remain = earned;
  const fromPending = Math.min(remain, Math.max(0, Number(pendingPoints) || 0));
  remain -= fromPending;
  const fromPoints = Math.min(remain, Math.max(0, Number(points) || 0));
  return { fromPending, fromPoints };
}

// Delete a bill, restore its stock and take back the points it earned — one transaction.
/** แต้มที่บิลอ้างว่าลูกค้าใช้ · POS เก็บ pointsRedeem* · QR เก็บ redeemedReward.cost (ไปที่เบอร์ของบิล) */
export function redeemedPointsOf(order, memberDocId) {
  if (order?.pointsRedeemed && order.pointsRedeemId && Number(order.pointsRedeemAmount) > 0) {
    return { memberId: order.pointsRedeemId, amount: Number(order.pointsRedeemAmount) };
  }
  const cost = Number(order?.redeemedReward?.cost) || 0;
  if (cost > 0 && memberDocId) return { memberId: memberDocId, amount: cost };
  return null;
}

/**
 * คืนได้เมื่อประวัติแต้มของสมาชิก (เขียนโดย server/พนักงาน) มีรายการแลกของบิลนี้จริง
 * ห้ามเชื่อตัวเลขในบิลอย่างเดียว · ลูกค้าสร้างบิลทางสำรองได้เอง ใส่ "ใช้ไป 9,999 แต้ม" แล้วรอร้านลบ = เสกแต้ม
 * ยังไม่เคยคืน (redeem-refund ของบิลเดียวกัน) · บิล POS เก่าที่ประวัติไม่มีเลขบิล = ไม่คืนอัตโนมัติ
 */
export function verifiedRefund(claim, memberData, orderId) {
  if (!claim || !memberData) return null;
  const history = Array.isArray(memberData.pointsHistory) ? memberData.pointsHistory : [];
  const redeemed = history.some((h) => h?.reason === 'redeem' && h.orderId === orderId && Number(h.delta) === -claim.amount);
  const refunded = history.some((h) => h?.reason === 'redeem-refund' && h.orderId === orderId);
  return redeemed && !refunded ? claim : null;
}

export async function runDeleteOrderTransaction(db, appId, staleOrder, stockList, memberDocId = staleOrder?.memberPhone, by = undefined) {
  let clawbackPoints = 0;
  await runTransaction(db, async transaction => {
    const orderRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', staleOrder.id);
    // อ่านบิลสด · กดยืนยันซ้ำ/อีกเครื่องลบไปแล้ว = ไม่ทำอะไร (เดิมคืนสต็อก+หักแต้มซ้ำ)
    // อีกเครื่องเพิ่งกดเสร็จ = ใช้ stockDeducted ล่าสุด ไม่ใช่ข้อมูลค้างในเครื่อง
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) return;
    const order = { id: staleOrder.id, ...orderSnap.data() };
    if (order.status === 'cancelled') return; // ยกเลิกไปแล้ว (อีกเครื่อง/กดซ้ำ)
    const earned = typeof order?.pointsEarned === 'number' ? order.pointsEarned : Math.floor(Number(order?.total || 0) / 10);
    let memberSnap = null;
    let memberRef = null;
    if (memberDocId && earned > 0) {
      memberRef = doc(db, 'artifacts', appId, 'public', 'data', 'members', memberDocId);
      memberSnap = await transaction.get(memberRef);
    }
    const claim = redeemedPointsOf(order, memberDocId);
    let claimSnap = null;
    if (claim) {
      claimSnap = claim.memberId === memberDocId && memberSnap
        ? memberSnap
        : await transaction.get(doc(db, 'artifacts', appId, 'public', 'data', 'members', claim.memberId));
    }

    if (order?.stockDeducted) {
      // คืนตามที่ตัดไปจริง (บันทึกไว้ในบิลตอนกดเสร็จ) · บิลเก่าไม่มีบันทึกค่อยคำนวณจากสูตร
      // สต็อกที่ถูกรวมไปแล้ว (mergedInto) คืนเข้าตัวที่เก็บไว้ ไม่ใช่ตัวที่เก็บเข้ากรุ
      const usageByStock = order.stockDeduction?.applied || computeOrderStockUsage(order);
      const stockById = new Map(stockList.map(s => [s.id, s]));
      const restore = {};
      // + ที่ตัดย้อนหลังจากหน้า "สรุปขาย & สต็อก" (stockBackfill · ดู stockAuditFix.js)
      const entries = [...Object.entries(usageByStock), ...Object.entries(backfillTotals(order))];
      entries.forEach(([stockId, used]) => {
        if (used <= 0) return;
        const target = resolveStockId(stockId, stockById);
        if (!stockById.has(target)) return;
        restore[target] = (restore[target] || 0) + used;
      });
      Object.entries(restore).forEach(([stockId, used]) => {
        transaction.update(doc(db, 'artifacts', appId, 'public', 'data', 'stock', stockId), {
          quantity: increment(used)
        });
      });
    }
    // ยกเลิก ไม่ลบ · เก็บบิลไว้ให้ย้อนดูได้ว่าใครยกเลิกบิลไหนเมื่อไหร่ (หน้าบิล → ยกเลิกแล้ว)
    // stockDeducted=false: คืนสต็อกแล้ว · ทุกหน้ารายงานนับเฉพาะ completed อยู่แล้ว
    transaction.update(orderRef, {
      status: 'cancelled',
      cancelledFrom: order.status || '',
      cancelledAt: new Date().toISOString(),
      cancelledBy: by || '',
      stockDeducted: false,
      ...(order.stockDeducted ? { stockRestoredAt: new Date().toISOString() } : {}),
    });

    // คืนแต้มที่ลูกค้าใช้แลกกับบิลนี้ (เดิมไม่คืน ลูกค้าเสียแต้มฟรี) · คนเดียวกับคนได้แต้ม = รวมในการเขียนเดียว
    const redeemed = verifiedRefund(claim, claimSnap?.exists() ? claimSnap.data() : null, order.id);
    const at = new Date().toISOString();
    const refundEntry = redeemed ? { delta: redeemed.amount, reason: 'redeem-refund', orderId: order.id, at, ...(by ? { by } : {}) } : null;
    const refundHere = Boolean(redeemed && memberSnap?.exists() && redeemed.memberId === memberDocId);

    if (memberSnap?.exists()) {
      const mData = memberSnap.data();
      const { fromPending, fromPoints } = planEarnClawback(mData, earned);
      clawbackPoints = fromPending + fromPoints;
      const payload = {};
      
      let hasUpdate = false;
      if (clawbackPoints > 0) {
        hasUpdate = true;
        if (fromPending > 0) payload.pendingPoints = increment(-fromPending);
        if (fromPoints > 0) {
          payload.points = increment(-fromPoints);
          const historyEntry = {
            delta: -fromPoints,
            reason: 'manual',
            orderId: order.id,
            at: new Date().toISOString()
          };
          if (by) historyEntry.by = by;
          payload.pointsHistory = arrayUnion(historyEntry);
        }
      }
      
      if (earned > 0 || mData.pendingOrderIds?.includes(order.id)) hasUpdate = true;

      if (refundHere) {
        hasUpdate = true;
        payload.points = increment(redeemed.amount - fromPoints);
        payload.pointsHistory = fromPoints > 0
          ? arrayUnion({ delta: -fromPoints, reason: 'manual', orderId: order.id, at, ...(by ? { by } : {}) }, refundEntry)
          : arrayUnion(refundEntry);
      }

      if (hasUpdate) {
        payload.pendingOrderIds = arrayRemove(order.id);
        transaction.update(memberRef, payload);
      }
    }
    if (redeemed && !refundHere) {
      transaction.set(doc(db, 'artifacts', appId, 'public', 'data', 'members', redeemed.memberId), {
        points: increment(redeemed.amount),
        pointsHistory: arrayUnion(refundEntry),
      }, { merge: true });
    }
  });
  return clawbackPoints;
}

// Pure function for calculating edit bill points
export function planBillEditPoints({ oldMember, newMemberId, oldEarned, newEarned }) {
  let oldMemberUpdates = null;
  let newMemberUpdates = null;
  
  if (oldMember?.id === newMemberId) {
     const diff = newEarned - oldEarned;
     if (diff > 0) {
        oldMemberUpdates = { pendingPointsUpdate: diff, pendingOrderIdsAction: 'add' };
     } else if (diff < 0) {
        const { fromPending, fromPoints } = planEarnClawback(oldMember, Math.abs(diff));
        oldMemberUpdates = { 
           pendingPointsUpdate: fromPending === 0 ? 0 : -fromPending, 
           pointsUpdate: fromPoints === 0 ? 0 : -fromPoints,
           clawbackFromPoints: fromPoints 
        };
     }
  } else {
     if (oldMember && oldEarned > 0) {
        const { fromPending, fromPoints } = planEarnClawback(oldMember, oldEarned);
        oldMemberUpdates = {
           pendingPointsUpdate: fromPending === 0 ? 0 : -fromPending,
           pointsUpdate: fromPoints === 0 ? 0 : -fromPoints,
           clawbackFromPoints: fromPoints,
           pendingOrderIdsAction: 'remove'
        };
     }
     if (newMemberId && newEarned > 0) {
        newMemberUpdates = { pendingPointsUpdate: newEarned, pendingOrderIdsAction: 'add' };
     }
  }
  
  return { oldMemberUpdates, newMemberUpdates };
}

// All decisions use the transaction snapshot, including on Firestore retries.
export async function settlePendingPoints(db, memberRef, approve, by = undefined) {
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(memberRef);
    const member = snapshot.exists() ? snapshot.data() : {};
    const pending = Number(member.pendingPoints || 0);
    if (!Number.isFinite(pending) || pending <= 0) return 0;
    const at = new Date().toISOString();
    
    const historyEntry = approve
        ? { delta: pending, reason: member.pendingReason || 'review', at }
        : { delta: 0, reason: 'rejected', amount: pending, at };
        
    if (by) historyEntry.by = by;
    if (member.pendingOrderIds && member.pendingOrderIds.length > 0) {
        historyEntry.orderIds = member.pendingOrderIds;
    }
    
    const payload = {
      pendingPoints: 0,
      pendingReason: '',
      pendingOrderIds: [],
      pointsHistory: arrayUnion(historyEntry),
    };
    if (approve) payload.points = increment(pending);
    transaction.update(memberRef, payload);
    return pending;
  });
}

// Acquire synchronously before the first await; share the lock across actions.
export async function withInFlightGuard(inFlight, ids, action, onChange = () => {}) {
  const keys = [...new Set(ids.filter(Boolean))];
  if (!keys.length || keys.some(id => inFlight.has(id))) return;
  keys.forEach(id => inFlight.add(id));
  try {
    onChange(new Set(inFlight));
    return await action();
  } finally {
    keys.forEach(id => inFlight.delete(id));
    onChange(new Set(inFlight));
  }
}
