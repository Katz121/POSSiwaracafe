// Pure member-data helpers for MembersView (UX v2 · WP6).
//
// Perf: the old view filtered ALL orders once per member (299 members × 2.3k
// orders ≈ 690k iterations, twice: stats + favourites), which blocked the main
// thread for ~0.5 s every time Members opened. `buildMemberOrderIndex` walks the
// orders once and every per-member lookup is then a Map hit.
//
// Matching rules are unchanged: an order belongs to a member when
//   (member.phone && order.memberPhone === member.phone)            — by phone
//   OR (!order.memberPhone && nameKey(order.memberNickname) === nameKey(member.name)) — legacy by name
// Buckets keep the orders' original array order, so every total, tie-break
// and "first seen" result is identical to the old full-array filter.

import { getNameKey } from '../../../utils/calculations';

// An order counts toward a member's purchase history as soon as it is placed
// (pending) — not only once completed — so today's orders show immediately.
export const orderCounts = (o) => o.status !== 'cancelled';

// Points earned by a single bill = ฿10 spent → 1 point (same rule the POS and
// QR checkout use: Math.floor(total / 10)).
export const orderEarn = (o) => Math.floor(Number(o.total || 0) / 10);

// Milliseconds for an order, handling Firestore Timestamp ({seconds}), ISO
// strings, or the plain `date` field — used to sort orders newest-first.
export const getOrderMs = (o) => {
  const t = o?.timestamp ?? o?.createdAt;
  if (t && typeof t === 'object' && t.seconds != null) return t.seconds * 1000;
  const ms = new Date(t || o?.date || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

export const orderItemCount = (o) => o.items?.reduce((s, i) => s + Number(i.quantity), 0) || 0;

export const isNameOnlyId = (id) => String(id || '').startsWith('name-only:');

const pushTo = (map, key, entry) => {
  const arr = map.get(key);
  if (arr) arr.push(entry);
  else map.set(key, [entry]);
};

/**
 * One pass over `orders`. Buckets hold `{ order, i }` (i = position in `orders`)
 * so two buckets can be merged back into the original order.
 * Cancelled orders are indexed too (merge/delete rewrite them as before);
 * readers filter with `orderCounts` when they want purchase history.
 */
export function buildMemberOrderIndex(orders = []) {
  const byPhone = new Map();
  const byName = new Map();
  const byId = new Map();
  orders.forEach((order, i) => {
    if (!order) return;
    if (order.id != null) byId.set(order.id, order);
    if (order.memberPhone) {
      pushTo(byPhone, order.memberPhone, { order, i });
    } else {
      const key = getNameKey(order.memberNickname);
      if (key) pushTo(byName, key, { order, i });
    }
  });
  return { byPhone, byName, byId };
}

const mergeByIndex = (a = [], b = []) => {
  if (!a.length) return b;
  if (!b.length) return a;
  const out = [];
  let x = 0;
  let y = 0;
  while (x < a.length && y < b.length) out.push(a[x].i <= b[y].i ? a[x++] : b[y++]);
  while (x < a.length) out.push(a[x++]);
  while (y < b.length) out.push(b[y++]);
  return out;
};

/** Orders linked to one member/identity, in original order. */
export function ordersForMember(index, member, { includeCancelled = false } = {}) {
  const phone = String(member?.phone || '').trim();
  const nameKey = getNameKey(member?.name);
  const phoneHits = phone ? index.byPhone.get(phone) : undefined;
  const nameHits = nameKey ? index.byName.get(nameKey) : undefined;
  const entries = mergeByIndex(phoneHits, nameHits);
  const list = entries.map((e) => e.order);
  return includeCancelled ? list : list.filter(orderCounts);
}

/** Orders that carry only this nickname (no phone) — used by delete to unlink the name. */
export function nameOnlyOrders(index, nameKey) {
  if (!nameKey) return [];
  return (index.byName.get(nameKey) || []).map((e) => e.order);
}

// History reasons that represent a POSITIVE earn credit (order/review approval,
// a previous reconciliation, or a manual top-up). Redeem entries are NOT here,
// so redemptions never count as earn on either side of the audit.
const EARN_REASONS = new Set(['order', 'review', 'recalc', 'manual']);
const parseAt = (at) => {
  const ms = at ? Date.parse(at) : NaN;
  return Number.isFinite(ms) ? ms : NaN;
};

// Earn audit for a single member, scoped to a time window [cutoff, now]:
//   expected = Σ orderEarn over the member's orders placed inside the window
//   credited = current pendingPoints + positive earn credits logged inside the
//              window (pendingPoints has no timestamp, so it always counts —
//              it offsets recent expected earn that hasn't been approved yet)
// Because both sides look only at EARN (never redeem), a member who spent their
// points is not flagged as "short", and confirming a credit can never refund a
// redemption — it only fills purchases that produced no points at all.
export const auditMemberEarn = (m, memberOrders, cutoff) => {
  const expected = memberOrders.reduce((s, o) => s + (getOrderMs(o) >= cutoff ? orderEarn(o) : 0), 0);
  const history = Array.isArray(m.pointsHistory) ? m.pointsHistory : [];
  const creditedInWindow = history.reduce((s, e) => {
    const d = Number(e?.delta || 0);
    const at = parseAt(e?.at);
    const inWindow = Number.isNaN(at) ? true : at >= cutoff; // undated entries count (conservative)
    return s + (d > 0 && inWindow && EARN_REASONS.has(e?.reason) ? d : 0);
  }, 0);
  // Points the owner explicitly REJECTED count as settled too — they were
  // deliberately declined, so they must not reappear as a gap.
  const rejectedInWindow = history.reduce((s, e) => {
    const at = parseAt(e?.at);
    const inWindow = Number.isNaN(at) ? true : at >= cutoff;
    return s + (e?.reason === 'rejected' && inWindow ? Number(e?.amount || 0) : 0);
  }, 0);
  const credited = Number(m.pendingPoints || 0) + creditedInWindow + rejectedInWindow;
  // Points redeemed inside the window — shown to the owner for a sanity check,
  // not used in the gap maths.
  const redeemedNet = history.reduce((s, e) => {
    const at = parseAt(e?.at);
    const inWindow = Number.isNaN(at) ? false : at >= cutoff;
    return s + ((e?.reason === 'redeem' || e?.reason === 'redeem-refund') && inWindow ? Number(e?.delta || 0) : 0);
  }, 0);
  return { expectedEarn: expected, earnGap: expected - credited, redeemed: Math.max(0, -redeemedNet) };
};

/**
 * Member rows with purchase stats + the windowed earn audit, followed by
 * "name-only" projections (nicknames on bills with no member doc).
 * Sorted by items bought, most first (stable → same order as before).
 */
export function processMembers({ members = [], orders = [], index, cutoff }) {
  const memberStats = members.map((m) => {
    const memberOrders = ordersForMember(index, m);
    // Purchase totals stay all-time (display); the earn audit is windowed.
    const totalPurchases = memberOrders.reduce((sum, o) => sum + orderItemCount(o), 0);
    const totalSpent = memberOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const audit = auditMemberEarn(m, memberOrders, cutoff);
    return { ...m, totalPurchases, totalSpent, visitCount: memberOrders.length, ...audit };
  });

  // Orders that carry a nickname no registered member owns.
  const registeredNames = new Set(members.map((m) => getNameKey(m.name)));
  const nameOnlyMap = new Map();
  orders.forEach((o) => {
    if (!orderCounts(o) || o.memberPhone || !o.memberNickname) return;
    const key = getNameKey(o.memberNickname);
    if (!key || registeredNames.has(key)) return;
    const current = nameOnlyMap.get(key) || {
      id: `name-only:${key}`, name: key, phone: '', points: 0,
      totalPurchases: 0, totalSpent: 0, visitCount: 0, expectedEarn: 0, earnGap: 0, redeemed: 0,
    };
    current.totalPurchases += orderItemCount(o);
    current.totalSpent += Number(o.total) || 0;
    current.visitCount += 1;
    // Name-only customers have no member doc → nothing was ever recorded, so
    // the whole expected earn (within the window) is the gap.
    if (getOrderMs(o) >= cutoff) {
      current.expectedEarn += orderEarn(o);
      current.earnGap = current.expectedEarn;
    }
    nameOnlyMap.set(key, current);
  });

  return [...memberStats, ...nameOnlyMap.values()].sort((a, b) => b.totalPurchases - a.totalPurchases);
}

/**
 * Order lines no longer store `image` (stripped at cart time), so favourites
 * look the picture up from the live menu: by id, then by name, then whatever
 * an old order line still carries.
 */
export function buildMenuImageLookup(menu = []) {
  const byId = new Map();
  const byName = new Map();
  for (const m of menu) {
    if (!m?.image) continue;
    if (m.id != null && !byId.has(m.id)) byId.set(m.id, m.image);
    if (m.name && !byName.has(m.name)) byName.set(m.name, m.image);
  }
  return (item) => {
    if (!item) return '';
    return (item.id != null && byId.get(item.id)) || (item.name && byName.get(item.name)) || item.image || '';
  };
}

/** Favourite items + 10 most recent orders for the member sheet. */
export function buildMemberDetail(memberOrders, imageFor = (item) => item.image || '') {
  const itemCounts = {};
  memberOrders.forEach((order) => {
    (order.items || []).forEach((item) => {
      const key = item.name;
      if (!itemCounts[key]) {
        itemCounts[key] = {
          name: item.name,
          image: imageFor(item),
          category: item.category || '',
          count: 0,
          totalSpent: 0,
        };
      } else if (!itemCounts[key].image) {
        itemCounts[key].image = imageFor(item);
      }
      itemCounts[key].count += Number(item.quantity || 1);
      itemCounts[key].totalSpent += Number(item.price || 0) * Number(item.quantity || 1);
    });
  });

  const favorites = Object.values(itemCounts).sort((a, b) => b.count - a.count);
  const recentOrders = [...memberOrders].sort((a, b) => getOrderMs(b) - getOrderMs(a)).slice(0, 10);
  return {
    favorites,
    recentOrders,
    totalOrders: memberOrders.length,
    uniqueItems: Object.keys(itemCounts).length,
  };
}

/** Same-name identities (phone doc + name doc, or several name variants). */
export function findDuplicateGroups(processedMembers, ignoredKeys = []) {
  const ignored = new Set(ignoredKeys);
  const byName = new Map();
  processedMembers.forEach((m) => {
    const key = getNameKey(m.name);
    if (!key) return;
    pushTo(byName, key, m);
  });
  return [...byName.entries()]
    .filter(([key, arr]) => arr.length > 1 && !ignored.has(key))
    .map(([key, arr]) => ({ key, members: arr }));
}

/** Search by phone or name (substring, as before). */
export function filterMembers(rows, term) {
  const t = String(term || '').trim();
  return rows.filter((m) => {
    const phone = String(m.phone || '');
    const name = String(m.name || '');
    if (!t) return phone !== '' || name !== '';
    return phone.includes(t) || name.includes(t);
  });
}
