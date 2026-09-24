// Firestore side of a physical count. One transaction = one atomic commit:
//   stockCounts/{new}  ← the record
//   stock/{id}         ← quantity += (counted − system) + lastCounted* fields
// The system quantity is read INSIDE the transaction, so a sale that deducts
// stock between opening the sheet and pressing save is not lost: Firestore
// retries the transaction with the new quantity and the variance follows it.
import { collection, doc, increment, runTransaction } from 'firebase/firestore';
import { db, appId, auth } from '../../../services/firebase';
import { getISODate } from '../../../utils/calculations';
import { buildStockCount, staffLabel, stockCountPatch } from '../../../utils/stockCount';

const dataCol = (name) => collection(db, 'artifacts', appId, 'public', 'data', name);

/**
 * mode 'match'  → counted = the fresh system qty (variance 0, quantity untouched)
 * mode 'set'    → counted = countedQty; stock is moved to it
 * Resolves to the saved record.
 */
export async function saveStockCount({ item, mode, countedQty, note = '' }) {
  const stockRef = doc(dataCol('stock'), item.id);
  const countRef = doc(dataCol('stockCounts'));
  const now = new Date();
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(stockRef);
    if (!snap.exists()) throw new Error('stock-missing');
    const fresh = { id: item.id, ...snap.data() };
    const systemQty = Number(fresh.quantity) || 0;
    const record = buildStockCount({
      item: fresh,
      systemQty,
      countedQty: mode === 'match' ? systemQty : countedQty,
      date: getISODate(now),
      countedAt: now.toISOString(),
      countedBy: staffLabel(auth.currentUser?.email),
      note,
    });
    tx.set(countRef, record);
    const patch = stockCountPatch(record);
    if (record.variance !== 0) patch.quantity = increment(record.variance);
    tx.update(stockRef, patch);
    return { id: countRef.id, ...record };
  });
}
