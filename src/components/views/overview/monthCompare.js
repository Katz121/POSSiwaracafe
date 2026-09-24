// Month-over-month comparison for the owner dashboard (UX v2 · WP3).
//
// Owner decision 2026-09-24: compare MATCHING day ranges. On Sep 24 the
// dashboard compares Sep 1–24 with Aug 1–24, never a partial month with a full
// one (that always read as "revenue −38%"). A month that is already over is
// compared in full with the full previous month.
//
// The money rules are the same as the dashboard's month cards and must stay so:
//  - revenue  = sum of `total` of completed orders
//  - cost     = expenses excluding the waste category (waste is already paid
//               for when the ingredients were bought · see DashboardView)
//  - net cash = revenue − cost
// Pure functions only (no React, no Firestore) so they are unit-tested.
import { getOrderDate } from '../../../utils/calculations';
import { countUnits } from '../../../utils/salesHistory';
import { matchingMonthRanges, toISODateLocal } from '../../../utils/format';

export const WASTE_CATEGORY = 'ของเสีย (Waste)';

const lastDayOfMonth = (isoMonth) => {
  const [y, m] = isoMonth.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

const pad = (n) => String(n).padStart(2, '0');

/** "2026-09" → "2026-08" (no UTC shift, unlike `new Date('2026-09-01').toISOString()`). */
export function previousMonth(isoMonth) {
  const [y, m] = isoMonth.split('-').map(Number);
  return toISODateLocal(new Date(y, m - 2, 1)).slice(0, 7);
}

/**
 * The two date ranges to compare for `selectedMonth` ("YYYY-MM") as seen on
 * `todayISO` ("YYYY-MM-DD").
 *  - current month → month-to-date vs the same days of the previous month
 *    (day clamped to the previous month's length: Mar 31 → Feb 1–28/29)
 *  - past month    → whole month vs whole previous month
 * Returns { current: {start,end}, previous: {start,end}, partial, days }.
 */
export function comparisonRanges(selectedMonth, todayISO) {
  const thisMonth = String(todayISO).slice(0, 7);
  if (selectedMonth === thisMonth) {
    const r = matchingMonthRanges(todayISO);
    return { ...r, partial: r.days < lastDayOfMonth(selectedMonth) };
  }
  const prev = previousMonth(selectedMonth);
  const days = lastDayOfMonth(selectedMonth);
  return {
    current: { start: `${selectedMonth}-01`, end: `${selectedMonth}-${pad(days)}` },
    previous: { start: `${prev}-01`, end: `${prev}-${pad(lastDayOfMonth(prev))}` },
    days,
    partial: false,
  };
}

const inRange = (iso, { start, end }) => Boolean(iso) && iso >= start && iso <= end;

/** Cash-view totals for one inclusive ISO date range. */
export function summarizeRange({ orders = [], expenses = [], range }) {
  const rangeOrders = orders.filter((o) => o.status === 'completed' && inRange(String(getOrderDate(o)).slice(0, 10), range));
  const rangeExpenses = expenses.filter((e) => inRange(String(e.date || '').slice(0, 10), range));
  const revenue = rangeOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const cost = rangeExpenses
    .filter((e) => e.category !== WASTE_CATEGORY)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const units = rangeOrders.reduce((acc, o) => {
    const { cups, pieces } = countUnits(o);
    return { cups: acc.cups + cups, pieces: acc.pieces + pieces };
  }, { cups: 0, pieces: 0 });
  return {
    revenue,
    cost,
    profit: revenue - cost,
    count: rangeOrders.length,
    cups: units.cups,
    pieces: units.pieces,
  };
}

/**
 * Whole-percent change. Previous 0 → 100 when something appeared, else 0 (same
 * convention the dashboard always used). The denominator is |previous| so a
 * move from −1,000 to +500 reads as growth, not as a decline.
 */
export function growthPercent(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (p === 0) return c > 0 ? 100 : 0;
  return Math.round(((c - p) / Math.abs(p)) * 100);
}

/** Everything the comparison card needs, in one call. */
export function compareMonths({ orders, expenses, selectedMonth, todayISO }) {
  const ranges = comparisonRanges(selectedMonth, todayISO);
  const current = summarizeRange({ orders, expenses, range: ranges.current });
  const previous = summarizeRange({ orders, expenses, range: ranges.previous });
  return {
    ranges,
    current,
    previous,
    growth: {
      revenue: growthPercent(current.revenue, previous.revenue),
      profit: growthPercent(current.profit, previous.profit),
      count: growthPercent(current.count, previous.count),
      cost: growthPercent(current.cost, previous.cost),
    },
  };
}
