/**
 * Menu sales counter
 *
 * Maintains a `soldCount` field on each menu doc so we can show "ขายดี"
 * (best-selling) items without having to read the whole orders collection
 * on the customer QR page. Called once per completed order from BOTH the
 * staff POS and the customer QR-ordering flow.
 *
 * Best-effort: failures here must never block or fail an order. Aggregates
 * by menu id so bean-modifier variants (which share one menu doc) count once.
 */

import { doc, updateDoc, increment } from 'firebase/firestore';
import { db, appId } from '../services/firebase';

/**
 * Increment soldCount on menu docs for each sold line item.
 * @param {Array<{id?: string, quantity?: number}>} items - order line items
 */
export async function bumpMenuSoldCount(items = []) {
  const totals = {};
  for (const it of items) {
    const id = it && it.id;
    const qty = Number(it && it.quantity) || 0;
    if (!id || qty <= 0) continue;
    totals[id] = (totals[id] || 0) + qty;
  }

  const ids = Object.keys(totals);
  if (ids.length === 0) return;

  const base = ['artifacts', appId, 'public', 'data', 'menu'];
  // Per-item updates wrapped in allSettled: one missing/stale menu doc must
  // not drop the counts for the rest of the cart.
  await Promise.allSettled(
    ids.map((id) =>
      updateDoc(doc(db, ...base, id), { soldCount: increment(totals[id]) }),
    ),
  );
}
