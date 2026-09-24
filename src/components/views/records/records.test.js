import { describe, expect, it } from 'vitest';
import {
  billCode, billCustomerName, countBillFilters, matchesBillFilter, matchesBillQuery, normalizeBillFilter, rankBills,
  summarizeStockDeduction,
} from './billSearch';
import { buildCategorySales, categorySalesCsv, presetRange, rangeLabel } from './categorySales';
import { getOrderDate, isDateInRange } from '../../../utils/calculations';

const bill = (over = {}) => ({
  id: 'abcdefZLJE6B', queueNumber: 7, isPaid: false, source: 'pos', status: 'completed',
  items: [{ id: 'm1', name: 'ลาเต้เย็น', quantity: 2, price: 55 }], ...over,
});

describe('bill filters', () => {
  it('normalizes unknown filters to all', () => {
    expect(normalizeBillFilter('unpaid')).toBe('unpaid');
    expect(normalizeBillFilter('nope')).toBe('all');
    expect(normalizeBillFilter(undefined)).toBe('all');
  });

  it('matches status chips and counts them', () => {
    const bills = [bill(), bill({ id: 'x2', isPaid: true, source: 'qr' }), bill({ id: 'x3', source: 'qr' })];
    expect(bills.filter((b) => matchesBillFilter(b, 'unpaid'))).toHaveLength(2);
    expect(bills.filter((b) => matchesBillFilter(b, 'paid'))).toHaveLength(1);
    expect(bills.filter((b) => matchesBillFilter(b, 'qr'))).toHaveLength(2);
    expect(countBillFilters(bills)).toEqual({ all: 3, unpaid: 2, paid: 1, qr: 2 });
  });
});

describe('bill search', () => {
  it('matches the queue number exactly (7 ≠ 17)', () => {
    expect(matchesBillQuery(bill(), '7')).toBe(true);
    expect(matchesBillQuery(bill(), '#7')).toBe(true);
    expect(matchesBillQuery(bill({ queueNumber: 17 }), '7')).toBe(false);
  });

  it('matches code, customer, phone and item names', () => {
    expect(billCode(bill())).toBe('ZLJE6B');
    expect(matchesBillQuery(bill(), 'zlje')).toBe(true);
    expect(matchesBillQuery(bill(), '#ZLJE6B')).toBe(true);
    expect(matchesBillQuery(bill(), 'นุช', 'นุช')).toBe(true);
    expect(matchesBillQuery(bill(), 'ลาเต้')).toBe(true);
    expect(matchesBillQuery(bill(), 'มัทฉะ')).toBe(false);
    expect(matchesBillQuery(bill({ memberPhone: '0812345678' }), '2345')).toBe(true);
    expect(matchesBillQuery(bill(), '   ')).toBe(true);
  });

  it('floats exact queue hits to the top', () => {
    const list = [bill({ id: 'a', queueNumber: 17 }), bill({ id: 'b', queueNumber: 7 })];
    expect(rankBills(list, '7').map((b) => b.id)).toEqual(['b', 'a']);
    expect(rankBills(list, 'ลาเต้')).toBe(list);
  });

  it('resolves the customer name from nickname, name or member list', () => {
    const members = new Map([['0811', { name: 'สมศรี' }]]);
    expect(billCustomerName(bill({ memberNickname: 'นุช' }), members)).toBe('นุช');
    expect(billCustomerName(bill({ memberPhone: '0811' }), members)).toBe('สมศรี');
    expect(billCustomerName(bill(), members)).toBe('');
  });
});

describe('summarizeStockDeduction', () => {
  it('returns null without a record', () => {
    expect(summarizeStockDeduction(bill())).toBeNull();
  });

  it('lists applied stock and items that were not cut', () => {
    const stockById = new Map([['s1', { name: 'นมสด', unit: 'มล.' }]]);
    const order = bill({
      stockDeduction: {
        applied: { s1: 300, gone: 5 },
        skipped: [{ stockId: 'x', used: 1, item: 'มอคค่า' }, { stockId: 'y', used: 1, item: 'มอคค่า' }],
        unlinked: [{ name: 'กาแฟดริป', quantity: 1 }],
      },
    });
    const s = summarizeStockDeduction(order, stockById);
    expect(s.applied).toEqual([
      { stockId: 's1', name: 'นมสด', unit: 'มล.', used: 300 },
      { stockId: 'gone', name: 'วัตถุดิบที่ถูกลบแล้ว', unit: '', used: 5 },
    ]);
    expect(s.missed).toEqual([
      { name: 'กาแฟดริป', reason: 'unlinked', quantity: 1 },
      { name: 'มอคค่า', reason: 'missing' },
    ]);
  });
});

// The pre-v2 CategorySummaryView algorithm, verbatim, as the oracle.
function legacyCategorySales(orders, menu, start, end) {
  const map = new Map();
  orders
    .filter((o) => o.status === 'completed' && isDateInRange(getOrderDate(o), start, end))
    .forEach((order) => {
      (order.items || []).forEach((item) => {
        const fallbackCategory = menu.find((m) => m.id === item.id)?.category;
        const category = String(item.category || fallbackCategory || 'ไม่ระบุหมวดหมู่');
        const quantity = Number(item.quantity) || 0;
        const revenue = (Number(item.price) || 0) * quantity;
        const current = map.get(category) || { category, revenue: 0, quantity: 0 };
        current.revenue += revenue;
        current.quantity += quantity;
        map.set(category, current);
      });
    });
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

describe('buildCategorySales', () => {
  const menu = [{ id: 'm1', category: 'Coffee' }, { id: 'm1', category: 'ไม่ควรใช้' }, { id: 'c1', category: 'Cake' }];
  const orders = [
    { status: 'completed', date: '2026-09-24', items: [{ id: 'm1', name: 'ลาเต้', quantity: 2, price: 55, beanModifier: '#เข้ม' }, { id: 'c1', name: 'บราวนี่', quantity: 1, price: 65 }] },
    { status: 'completed', date: '2026-09-23', items: [{ id: 'zz', name: 'น้ำเปล่า', quantity: 3, price: 10, category: 'อื่นๆ' }, { id: 'nomenu', name: '?', quantity: 1, price: '12.5' }] },
    { status: 'pending', date: '2026-09-24', items: [{ id: 'm1', name: 'ลาเต้', quantity: 9, price: 55 }] },
    { status: 'completed', createdAt: { seconds: 1790000000 }, items: [{ id: 'm1', name: 'ลาเต้', quantity: 1, price: 50 }] },
  ];

  it('matches the legacy numbers for open, single-day and ranged filters', () => {
    for (const [s, e] of [['', ''], ['2026-09-24', '2026-09-24'], ['2026-09-20', '2026-09-24']]) {
      expect(buildCategorySales(orders, menu, s, e).categories).toEqual(legacyCategorySales(orders, menu, s, e));
    }
  });

  it('breaks items and beans down per category', () => {
    const { breakdown, totalRevenue, totalQuantity } = buildCategorySales(orders, menu, '2026-09-24', '2026-09-24');
    expect(breakdown.Coffee.items).toEqual([{ name: 'ลาเต้', quantity: 2, revenue: 110, price: 55 }]);
    expect(breakdown.Coffee.beans).toEqual([{ tag: '#เข้ม', quantity: 2, revenue: 110 }]);
    expect(totalRevenue).toBe(175);
    expect(totalQuantity).toBe(3);
  });

  it('keeps the CSV format and range labels', () => {
    const { categories } = buildCategorySales(orders, menu, '2026-09-24', '2026-09-24');
    expect(categorySalesCsv(categories, rangeLabel('custom', '2026-09-24', '2026-09-24')))
      .toBe('\uFEFF# range: 2026-09-24_to_2026-09-24\ncategory,quantity,revenue\n"Coffee",2,110\n"Cake",1,65');
    expect(rangeLabel('all', '', '')).toBe('all');
  });

  it('computes preset ranges in local time', () => {
    const now = new Date(2026, 8, 24, 23, 30);
    expect(presetRange('today', now)).toEqual({ start: '2026-09-24', end: '2026-09-24' });
    expect(presetRange('week', now)).toEqual({ start: '2026-09-18', end: '2026-09-24' });
    expect(presetRange('month', now)).toEqual({ start: '2026-09-01', end: '2026-09-24' });
    expect(presetRange('all', now)).toEqual({ start: '', end: '' });
    expect(presetRange('custom', now, { start: '2026-09-01', end: '' })).toEqual({ start: '2026-09-01', end: '2026-09-24' });
  });
});
