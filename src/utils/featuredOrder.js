/**
 * featuredOrder — manual ordering for "เมนูแนะนำ" (isFeatured items).
 *
 * The owner arranges featured menus in เมนู → จัดลำดับเมนูแนะนำ; each item gets a
 * numeric `featuredOrder`. Used by the QR "เมนูแนะนำ" rail and the POS "แนะนำ"
 * tab (+ its quick-add shortcuts) so both show the same order.
 * Items never arranged (no featuredOrder) go after arranged ones, keeping their
 * existing relative order.
 */

const orderOf = (item) => {
  const n = Number(item?.featuredOrder);
  return Number.isFinite(n) ? n : Infinity;
};

/** Stable sort by featuredOrder (unset last). Returns a new array. */
export const sortByFeaturedOrder = (items = []) =>
  items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (orderOf(a.item) - orderOf(b.item)) || (a.index - b.index))
    .map(({ item }) => item);

/** Move the item at `from` to `to` (both indexes into `items`). Returns a new array. */
export const moveItem = (items, from, to) => {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

/**
 * Firestore updates needed to persist `orderedItems` as featuredOrder 1..n.
 * Skips items whose order is already correct so saving writes only what changed.
 * @returns {{ id: string, featuredOrder: number }[]}
 */
export const featuredOrderUpdates = (orderedItems = []) =>
  orderedItems
    .map((item, index) => ({ id: item.id, featuredOrder: index + 1, prev: item.featuredOrder }))
    .filter(({ featuredOrder, prev }) => Number(prev) !== featuredOrder)
    .map(({ id, featuredOrder }) => ({ id, featuredOrder }));
