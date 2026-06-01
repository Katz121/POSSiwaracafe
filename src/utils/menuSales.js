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
 * Recompute soldCount for every menu item from the full order history and write
 * the absolute totals. Use this to backfill the best-seller counter from past
 * orders (the incremental bumps only cover orders placed after launch).
 * @param {Array} menu   - all menu docs ({ id, ... })
 * @param {Array} orders - all order docs ({ items: [{ id, quantity }], ... })
 * @returns {Promise<{ updated: number, total: number }>}
 */
export async function recomputeAllSoldCounts(menu = [], orders = []) {
  const totals = {};
  for (const o of orders) {
    for (const it of (o && o.items) || []) {
      const id = it && it.id;
      const qty = Number(it && it.quantity) || 0;
      if (!id || qty <= 0) continue;
      totals[id] = (totals[id] || 0) + qty;
    }
  }

  const base = ['artifacts', appId, 'public', 'data', 'menu'];
  const results = await Promise.allSettled(
    menu.map((m) => updateDoc(doc(db, ...base, m.id), { soldCount: totals[m.id] || 0 })),
  );
  return {
    updated: results.filter((r) => r.status === 'fulfilled').length,
    total: menu.length,
  };
}

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
