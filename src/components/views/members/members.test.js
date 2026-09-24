import { describe, it, expect } from 'vitest';
import { getNameKey } from '../../../utils/calculations';
import {
  buildMemberOrderIndex, ordersForMember, nameOnlyOrders, processMembers, auditMemberEarn,
  orderCounts, orderEarn, getOrderMs, buildMenuImageLookup, buildMemberDetail, findDuplicateGroups, filterMembers,
} from './memberData';

// ── Oracle: the pre-v2 MembersView algorithm, verbatim (per-member full scans) ──
function legacyMemberOrders(orders, m) {
  const nameKey = getNameKey(m.name);
  const phone = String(m.phone || '').trim();
  return orders.filter((o) => {
    if (!orderCounts(o)) return false;
    if (phone && o.memberPhone === phone) return true;
    if (!nameKey) return false;
    return !o.memberPhone && getNameKey(o.memberNickname) === nameKey;
  });
}
function legacyProcess(members, orders, cutoff) {
  const memberStats = members.map((m) => {
    const memberOrders = legacyMemberOrders(orders, m);
    const totalPurchases = memberOrders.reduce((sum, o) => sum + (o.items?.reduce((s, i) => s + Number(i.quantity), 0) || 0), 0);
    const totalSpent = memberOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const audit = auditMemberEarn(m, memberOrders, cutoff);
    return { ...m, totalPurchases, totalSpent, ...audit };
  });
  const nameOnlyMap = new Map();
  orders
    .filter((o) => orderCounts(o) && !o.memberPhone && o.memberNickname)
    .forEach((o) => {
      const key = getNameKey(o.memberNickname);
      if (!key) return;
      if (members.some((m) => getNameKey(m.name) === key)) return;
      const current = nameOnlyMap.get(key) || { id: `name-only:${key}`, name: key, phone: '', points: 0, totalPurchases: 0, totalSpent: 0, expectedEarn: 0, earnGap: 0, redeemed: 0 };
      current.totalPurchases += o.items?.reduce((s, i) => s + Number(i.quantity), 0) || 0;
      current.totalSpent += Number(o.total) || 0;
      if (getOrderMs(o) >= cutoff) {
        current.expectedEarn += orderEarn(o);
        current.earnGap = current.expectedEarn;
      }
      nameOnlyMap.set(key, current);
    });
  return [...memberStats, ...nameOnlyMap.values()].sort((a, b) => b.totalPurchases - a.totalPurchases);
}

// Deterministic pseudo-random data (no Math.random → reproducible failures).
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
function fixture(seed = 7) {
  const r = rng(seed);
  const names = ['นุช', 'แพรว', ' แพรว ', 'บอส', 'มิ้นท์', 'Ann', '', 'โอ๊ต'];
  const phones = ['0811111111', '0822222222', '0833333333', ' 0844444444 ', '', ''];
  const members = [];
  for (let i = 0; i < 30; i++) {
    const phone = phones[Math.floor(r() * phones.length)];
    const name = names[Math.floor(r() * names.length)];
    members.push({
      id: phone.trim() || `name:${name.trim() || 'x' + i}`,
      phone, name, points: Math.floor(r() * 80), pendingPoints: r() < 0.2 ? 5 : 0,
      pointsHistory: r() < 0.5 ? [{ delta: 3, reason: 'order', at: new Date(Date.now() - r() * 30 * 864e5).toISOString() }] : [],
    });
  }
  const now = Date.now();
  const orders = [];
  for (let i = 0; i < 600; i++) {
    const byPhone = r() < 0.5;
    orders.push({
      id: `o${i}`,
      status: r() < 0.1 ? 'cancelled' : (r() < 0.5 ? 'completed' : 'pending'),
      memberPhone: byPhone ? phones[Math.floor(r() * phones.length)].trim() : '',
      memberNickname: names[Math.floor(r() * names.length)],
      total: Math.floor(r() * 300),
      createdAt: { seconds: Math.floor((now - r() * 40 * 864e5) / 1000) },
      items: [{ id: `m${Math.floor(r() * 5)}`, name: `เมนู ${Math.floor(r() * 5)}`, quantity: 1 + Math.floor(r() * 3), price: 45 }],
    });
  }
  return { members, orders, cutoff: now - 14 * 864e5 };
}

describe('member order index', () => {
  it('returns exactly the orders the old per-member filter returned, in the same order', () => {
    const { members, orders } = fixture();
    const index = buildMemberOrderIndex(orders);
    for (const m of members) {
      expect(ordersForMember(index, m).map((o) => o.id)).toEqual(legacyMemberOrders(orders, m).map((o) => o.id));
    }
  });

  it('processMembers matches the legacy stats + audit for every row', () => {
    for (const seed of [1, 7, 42]) {
      const { members, orders, cutoff } = fixture(seed);
      const index = buildMemberOrderIndex(orders);
      const fresh = processMembers({ members, orders, index, cutoff }).map((row) => { const rest = { ...row }; delete rest.visitCount; return rest; });
      expect(fresh).toEqual(legacyProcess(members, orders, cutoff));
    }
  });

  it('includeCancelled keeps cancelled bills (merge re-points them too)', () => {
    const orders = [
      { id: 'a', memberPhone: '081', status: 'cancelled' },
      { id: 'b', memberPhone: '081', status: 'completed' },
      { id: 'c', memberPhone: '', memberNickname: 'นุช', status: 'cancelled' },
    ];
    const index = buildMemberOrderIndex(orders);
    expect(ordersForMember(index, { phone: '081', name: 'นุช' }).map((o) => o.id)).toEqual(['b']);
    expect(ordersForMember(index, { phone: '081', name: 'นุช' }, { includeCancelled: true }).map((o) => o.id)).toEqual(['a', 'b', 'c']);
    expect(nameOnlyOrders(index, 'นุช').map((o) => o.id)).toEqual(['c']);
    expect(index.byId.get('b').id).toBe('b');
  });

  it('is linear: 300 members × 2.3k orders stays well under the old cost', () => {
    const members = Array.from({ length: 300 }, (_, i) => ({ id: `08${i}`, phone: `08${i}`, name: `n${i}` }));
    const orders = Array.from({ length: 2300 }, (_, i) => ({ id: `o${i}`, memberPhone: `08${i % 300}`, status: 'completed', total: 50, items: [{ quantity: 1 }] }));
    const t0 = performance.now();
    const index = buildMemberOrderIndex(orders);
    const rows = processMembers({ members, orders, index, cutoff: 0 });
    const ms = performance.now() - t0;
    expect(rows).toHaveLength(300);
    expect(rows.reduce((s, m) => s + m.visitCount, 0)).toBe(2300);
    expect(ms).toBeLessThan(100);
  });
});

describe('member detail', () => {
  it('looks favourite images up from the live menu (id → name → stored image)', () => {
    const imageFor = buildMenuImageLookup([
      { id: 'm1', name: 'ลาเต้', image: 'latte.webp' },
      { id: 'm2', name: 'มอคค่า', image: 'mocha.webp' },
    ]);
    const orders = [
      { id: 'o1', createdAt: { seconds: 10 }, items: [{ id: 'm1', name: 'ลาเต้ (ชื่อเก่า)', quantity: 2, price: 50 }] },
      { id: 'o2', createdAt: { seconds: 20 }, items: [{ name: 'มอคค่า', quantity: 1, price: 55 }] },
      { id: 'o3', createdAt: { seconds: 30 }, items: [{ name: 'เมนูที่ลบแล้ว', image: 'old.png', quantity: 1, price: 40 }] },
    ];
    const detail = buildMemberDetail(orders, imageFor);
    const byName = Object.fromEntries(detail.favorites.map((f) => [f.name, f]));
    expect(byName['ลาเต้ (ชื่อเก่า)'].image).toBe('latte.webp');
    expect(byName['มอคค่า'].image).toBe('mocha.webp');
    expect(byName['เมนูที่ลบแล้ว'].image).toBe('old.png');
    expect(detail.favorites[0].name).toBe('ลาเต้ (ชื่อเก่า)');
    expect(detail.recentOrders.map((o) => o.id)).toEqual(['o3', 'o2', 'o1']);
    expect(detail.totalOrders).toBe(3);
    expect(detail.uniqueItems).toBe(3);
  });

  it('groups duplicates by trimmed name and honours hidden groups', () => {
    const rows = [{ id: '1', name: 'แพรว' }, { id: '2', name: ' แพรว' }, { id: '3', name: 'บอส' }, { id: '4', name: 'บอส' }];
    expect(findDuplicateGroups(rows).map((g) => g.key)).toEqual(['แพรว', 'บอส']);
    expect(findDuplicateGroups(rows, ['บอส']).map((g) => g.key)).toEqual(['แพรว']);
  });

  it('filters by phone or name substring', () => {
    const rows = [{ phone: '0811', name: 'นุช' }, { phone: '0822', name: 'บอส' }];
    expect(filterMembers(rows, '081')).toHaveLength(1);
    expect(filterMembers(rows, 'บอ')[0].phone).toBe('0822');
    expect(filterMembers(rows, '')).toHaveLength(2);
  });
});
