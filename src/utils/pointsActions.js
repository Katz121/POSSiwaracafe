import { arrayUnion, increment, runTransaction } from 'firebase/firestore';

// All decisions use the transaction snapshot, including on Firestore retries.
export async function settlePendingPoints(db, memberRef, approve) {
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(memberRef);
    const member = snapshot.exists() ? snapshot.data() : {};
    const pending = Number(member.pendingPoints || 0);
    if (!Number.isFinite(pending) || pending <= 0) return 0;
    const at = new Date().toISOString();
    const payload = {
      pendingPoints: 0,
      pendingReason: '',
      pointsHistory: arrayUnion(approve
        ? { delta: pending, reason: member.pendingReason || 'review', at }
        : { delta: 0, reason: 'rejected', amount: pending, at }),
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
