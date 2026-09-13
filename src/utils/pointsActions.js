import { arrayUnion, arrayRemove, increment, runTransaction, doc } from 'firebase/firestore';
import { computeOrderStockUsage } from './wastage.js';

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
export async function runDeleteOrderTransaction(db, appId, order, stockList, memberDocId = order?.memberPhone, by = undefined) {
  let clawbackPoints = 0;
  await runTransaction(db, async transaction => {
    const orderRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', order.id);
    const earned = typeof order?.pointsEarned === 'number' ? order.pointsEarned : Math.floor(Number(order?.total || 0) / 10);
    let memberSnap = null;
    let memberRef = null;
    if (memberDocId && earned > 0) {
      memberRef = doc(db, 'artifacts', appId, 'public', 'data', 'members', memberDocId);
      memberSnap = await transaction.get(memberRef);
    }

    if (order?.stockDeducted) {
      const usageByStock = computeOrderStockUsage(order);
      Object.entries(usageByStock).forEach(([stockId, used]) => {
        if (used <= 0) return;
        const stockItem = stockList.find(s => s.id === stockId);
        if (!stockItem) return;
        transaction.update(doc(db, 'artifacts', appId, 'public', 'data', 'stock', stockId), {
          quantity: increment(used)
        });
      });
    }
    transaction.delete(orderRef);

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

      if (hasUpdate) {
        payload.pendingOrderIds = arrayRemove(order.id);
        transaction.update(memberRef, payload);
      }
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
