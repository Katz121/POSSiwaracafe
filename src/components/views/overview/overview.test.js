import { describe, it, expect } from 'vitest';
import { comparisonRanges, summarizeRange, growthPercent, compareMonths, previousMonth } from './monthCompare';
import { computeTodayStats } from './todayStats';
import { buildMenuImageLookup } from './menuImage';

const order = (date, total, extra = {}) => ({ status: 'completed', date, total, items: [], isPaid: true, ...extra });

describe('comparisonRanges', () => {
  it('current month compares the same days of the previous month', () => {
    expect(comparisonRanges('2026-09', '2026-09-24')).toEqual({
      current: { start: '2026-09-01', end: '2026-09-24' },
      previous: { start: '2026-08-01', end: '2026-08-24' },
      days: 24,
      partial: true,
    });
  });
  it('clamps to the shorter previous month (Mar 31 → Feb 1–28)', () => {
    const r = comparisonRanges('2026-03', '2026-03-31');
    expect(r.previous).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(r.partial).toBe(false);
  });
  it('a finished month compares whole months', () => {
    expect(comparisonRanges('2026-08', '2026-09-24')).toEqual({
      current: { start: '2026-08-01', end: '2026-08-31' },
      previous: { start: '2026-07-01', end: '2026-07-31' },
      days: 31,
      partial: false,
    });
  });
  it('crosses the year boundary', () => {
    expect(comparisonRanges('2026-01', '2026-01-10').previous).toEqual({ start: '2025-12-01', end: '2025-12-10' });
    expect(previousMonth('2026-01')).toBe('2025-12');
  });
});

describe('summarizeRange / compareMonths', () => {
  const orders = [
    order('2026-09-02', 100),
    order('2026-09-24', 50),
    order('2026-09-10', 999, { status: 'cancelled' }),
    order('2026-08-05', 80),
    order('2026-08-24', 20),
    order('2026-08-25', 1000), // outside the matching range
  ];
  const expenses = [
    { date: '2026-09-03', amount: 30, category: 'วัตถุดิบ' },
    { date: '2026-09-03', amount: 500, category: 'ของเสีย (Waste)' },
    { date: '2026-08-03', amount: 40, category: 'ค่าไฟ' },
    { date: '2026-08-30', amount: 400, category: 'ค่าเช่า' },
  ];

  it('uses the dashboard cash rules (completed only, waste excluded)', () => {
    const s = summarizeRange({ orders, expenses, range: { start: '2026-09-01', end: '2026-09-30' } });
    expect(s).toMatchObject({ revenue: 150, cost: 30, profit: 120, count: 2 });
  });

  it('never compares a partial month with a full month', () => {
    const c = compareMonths({ orders, expenses, selectedMonth: '2026-09', todayISO: '2026-09-24' });
    expect(c.previous).toMatchObject({ revenue: 100, cost: 40, count: 2 });
    expect(c.current.revenue).toBe(150);
    expect(c.growth.revenue).toBe(50);
    expect(c.growth.count).toBe(0);
  });

  it('a past month includes every day of both months', () => {
    const c = compareMonths({ orders, expenses, selectedMonth: '2026-08', todayISO: '2026-09-24' });
    expect(c.current).toMatchObject({ revenue: 1100, cost: 440 });
  });

  it('reads createdAt when an order has no date field', () => {
    const ts = { seconds: new Date(2026, 8, 5, 10, 0).getTime() / 1000 };
    const s = summarizeRange({ orders: [{ status: 'completed', total: 70, createdAt: ts }], range: { start: '2026-09-01', end: '2026-09-30' } });
    expect(s.revenue).toBe(70);
  });
});

describe('growthPercent', () => {
  it('keeps the old convention when the previous value is 0', () => {
    expect(growthPercent(10, 0)).toBe(100);
    expect(growthPercent(0, 0)).toBe(0);
  });
  it('uses |previous| so a swing from loss to profit is growth', () => {
    expect(growthPercent(500, -1000)).toBe(150);
    expect(growthPercent(-1500, -1000)).toBe(-50);
  });
  it('rounds to whole percent', () => {
    expect(growthPercent(48353, 77852)).toBe(-38);
  });
});

describe('computeTodayStats', () => {
  const at = (y, m, d, h, min) => ({ seconds: new Date(y, m - 1, d, h, min).getTime() / 1000 });
  const now = new Date(2026, 8, 24, 12, 0);
  const orders = [
    order('2026-09-24', 100, { items: [{ quantity: 2, category: 'กาแฟ' }] }),
    order('2026-09-24', 60, { status: 'pending', isPaid: false }),
    order('2026-09-24', 40, { status: 'cancelled', isPaid: false }),
    order('2026-09-17', 50, { createdAt: at(2026, 9, 17, 11, 0) }),
    order('2026-09-17', 500, { createdAt: at(2026, 9, 17, 15, 0) }), // after "now" · excluded
  ];
  const expenses = [
    { date: '2026-09-24', amount: 25, category: 'วัตถุดิบ' },
    { date: '2026-09-24', amount: 90, category: 'ของเสีย (Waste)' },
  ];
  const s = computeTodayStats({ orders, expenses, today: '2026-09-24', now });

  it('counts completed sales, bills and units', () => {
    expect(s).toMatchObject({ revenue: 100, bills: 1, cups: 2, pieces: 0 });
  });
  it('unpaid = not paid and not cancelled', () => {
    expect(s).toMatchObject({ unpaidCount: 1, unpaidTotal: 60 });
  });
  it('expenses exclude waste', () => {
    expect(s.expenseTotal).toBe(25);
  });
  it('compares with the same weekday last week up to the same time', () => {
    expect(s.lastWeek).toBe('2026-09-17');
    expect(s.lastWeekRevenue).toBe(50);
    expect(s.revenueDelta).toBe(100);
  });
  it('gives no delta when last week had no sales yet', () => {
    expect(computeTodayStats({ orders: orders.slice(0, 1), today: '2026-09-24', now }).revenueDelta).toBeNull();
  });
});

describe('buildMenuImageLookup', () => {
  const lookup = buildMenuImageLookup([
    { id: 'a', name: 'ลาเต้', image: 'menu-a.jpg' },
    { id: 'b', name: 'มอคค่า', image: 'menu-b.jpg' },
    { id: 'c', name: 'ไม่มีรูป' },
  ]);
  it('prefers the menu image by id', () => {
    expect(lookup({ id: 'a', name: 'ชื่อเก่า', image: 'old.jpg' })).toBe('menu-a.jpg');
  });
  it('falls back to name, then to the stored item image', () => {
    expect(lookup({ id: 'gone', name: 'มอคค่า' })).toBe('menu-b.jpg');
    expect(lookup({ id: 'c', name: 'ไม่มีรูป', image: 'old.jpg' })).toBe('old.jpg');
    expect(lookup({ name: 'ไม่รู้จัก' })).toBe('');
  });
});
