import { describe, expect, it } from 'vitest';
import {
  billCode, billCustomerName, countBillFilters, matchesBillFilter, matchesBillQuery, normalizeBillFilter, rankBills,
  summarizeStockDeduction,
} from './billSearch';
import { buildCategoryReport, categorySalesCsv, rangeLabel } from './categorySales';
import { periodRange } from '../../../utils/periodRange';
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

describe('buildCategoryReport', () => {
  const menu = [{ id: 'm1', category: 'Coffee' }, { id: 'm1', category: 'ไม่ควรใช้' }, { id: 'c1', category: 'Cake' }];
  const orders = [
    { status: 'completed', date: '2026-09-24', items: [{ id: 'm1', name: 'ลาเต้', quantity: 2, price: 55, beanModifier: '#เข้ม', milkType: 'oat', sweetness: 50 }, { id: 'c1', name: 'บราวนี่', quantity: 1, price: 65 }] },
    { status: 'completed', date: '2026-09-23', items: [{ id: 'zz', name: 'น้ำเปล่า', quantity: 3, price: 10, category: 'อื่นๆ' }, { id: 'nomenu', name: '?', quantity: 1, price: '12.5' }] },
    { status: 'pending', date: '2026-09-24', items: [{ id: 'm1', name: 'ลาเต้', quantity: 9, price: 55 }] },
    { status: 'completed', createdAt: { seconds: 1790000000 }, items: [{ id: 'm1', name: 'ลาเต้', quantity: 1, price: 50 }] },
  ];
  const report = (s, e, list = orders, extra = {}) => buildCategoryReport({ orders: list, menu, start: s, end: e, ...extra });

  it('keeps the legacy gross numbers for open, single-day and ranged filters', () => {
    for (const [s, e] of [['', ''], ['2026-09-24', '2026-09-24'], ['2026-09-20', '2026-09-24']]) {
      const legacy = legacyCategorySales(orders, menu, s, e);
      const got = report(s, e).categories;
      expect(got.map((c) => ({ category: c.category, revenue: c.gross, quantity: c.quantity }))).toEqual(legacy);
    }
  });

  it('spreads the bill discount by line price (net = what was collected)', () => {
    const discounted = [{ status: 'completed', date: '2026-09-24', total: 140, items: [{ id: 'm1', name: 'ลาเต้', quantity: 2, price: 55 }, { id: 'c1', name: 'บราวนี่', quantity: 1, price: 65 }] }];
    const { categories, totals } = report('2026-09-24', '2026-09-24', discounted);
    expect(totals.net).toBeCloseTo(140);
    expect(totals.discount).toBeCloseTo(35);
    expect(categories.find((c) => c.category === 'Coffee').net).toBeCloseTo(110 * 140 / 175);
  });

  it('breaks items and every option group down per category', () => {
    const { breakdown, totals } = report('2026-09-24', '2026-09-24');
    expect(breakdown.Coffee.items).toEqual([expect.objectContaining({ name: 'ลาเต้', quantity: 2, net: 110, price: 55 })]);
    expect(breakdown.Coffee.options).toEqual([
      { group: 'ตัวเลือก (#)', options: [{ label: 'เข้ม', quantity: 2, net: 110 }] },
      { group: 'นม', options: [{ label: 'นมโอ๊ต', quantity: 2, net: 110 }] },
      { group: 'ความหวาน', options: [{ label: '50%', quantity: 2, net: 110 }] },
    ]);
    expect(totals.net).toBe(175);
    expect(totals.quantity).toBe(3);
    expect(totals.bills).toBe(1);
  });

  it('costs lines from the bill recipe', () => {
    const stock = [{ id: 's1', unitCost: 0.1 }];
    const list = [{ status: 'completed', date: '2026-09-24', items: [{ id: 'm1', name: 'ลาเต้', quantity: 2, price: 55, stockLinks: [{ stockId: 's1', usage: 100 }] }, { id: 'c1', name: 'บราวนี่', quantity: 1, price: 65 }] }];
    const { categories, totals } = report('2026-09-24', '2026-09-24', list, { stock });
    const coffee = categories.find((c) => c.category === 'Coffee');
    expect(coffee.cogs).toBeCloseTo(20);
    expect(coffee.marginPct).toBeCloseTo(((110 - 20) / 110) * 100);
    expect(categories.find((c) => c.category === 'Cake').marginPct).toBeNull();
    expect(totals.costCoverage).toBeCloseTo((110 / 175) * 100);
  });

  it('compares with the same-length period before and counts category pairs', () => {
    const { categories, totals, pairs } = report('2026-09-24', '2026-09-24');
    expect(totals.prev).toEqual({ start: '2026-09-23', end: '2026-09-23', net: 42.5, bills: 1 });
    expect(categories.find((c) => c.category === 'Coffee').growth).toBeNull(); // nothing before = no comparison
    expect(pairs).toEqual([{ a: 'Cake', b: 'Coffee', bills: 1, ofA: 100, ofB: 100 }]);
  });

  it('writes every number to the CSV', () => {
    const { categories } = report('2026-09-24', '2026-09-24');
    const csv = categorySalesCsv(categories, rangeLabel('custom', '2026-09-24', '2026-09-24')).split('\n');
    expect(csv[0]).toBe('﻿# range: 2026-09-24_to_2026-09-24');
    expect(csv[1]).toBe('category,quantity,bills,gross,discount,net,avg_per_bill,cogs,gross_profit,margin_pct,cost_coverage_pct,prev_net,growth_pct');
    expect(csv[2]).toBe('"Coffee",2,1,110,0,110,110,0,110,,0,0,');
    expect(rangeLabel('all', '', '')).toBe('all');
  });

  it('computes preset ranges in local time', () => {
    const now = new Date(2026, 8, 24, 23, 30);
    expect(periodRange('today', now)).toEqual({ start: '2026-09-24', end: '2026-09-24' });
    expect(periodRange('week', now)).toEqual({ start: '2026-09-18', end: '2026-09-24' });
    expect(periodRange('month', now)).toEqual({ start: '2026-09-01', end: '2026-09-24' });
    expect(periodRange('all', now)).toEqual({ start: '', end: '' });
    expect(periodRange('custom', now, { start: '2026-09-01', end: '' })).toEqual({ start: '2026-09-01', end: '2026-09-24' });
  });
});
