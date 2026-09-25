// "วันนี้" numbers for the owner dashboard (UX v2 · WP3). Pure, unit-tested.
//
// Same money rules as the rest of the dashboard:
//  - sales    = completed orders dated today (sum of `total`)
//  - unpaid   = not paid, not cancelled, dated today (same rule as the nav badge)
//  - expenses = today's expenses excluding non-cash categories (waste + เจ้าของ/พนักงานกิน · cash view, see monthCompare.js)
import { getOrderDate } from '../../../utils/calculations';
import { countUnits } from '../../../utils/salesHistory';
import { addDaysISO } from '../../../utils/format';
import { NON_CASH_EXPENSE_CATEGORIES } from '../../../config/constants';

const orderTimeMs = (o) => {
  if (o?.createdAt?.seconds) return o.createdAt.seconds * 1000;
  if (typeof o?.createdAt?.toDate === 'function') return o.createdAt.toDate().getTime();
  if (o?.timestamp) {
    const t = new Date(o.timestamp).getTime();
    return Number.isFinite(t) ? t : null;
  }
  return null;
};

// Minutes since local midnight, or null when the order carries no time.
const minuteOfDay = (o) => {
  const ms = orderTimeMs(o);
  if (ms == null) return null;
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
};

/**
 * @param {object}  args
 * @param {Array}   args.orders
 * @param {Array}   args.expenses
 * @param {string}  args.today   "YYYY-MM-DD"
 * @param {Date}   [args.now]    clock used for the "same time last week" cut-off
 */
export function computeTodayStats({ orders = [], expenses = [], today, now = new Date() }) {
  let revenue = 0;
  let bills = 0;
  let cups = 0;
  let pieces = 0;
  let unpaidCount = 0;
  let unpaidTotal = 0;

  // Same weekday last week, cut at the same clock time so a half-finished day
  // is never compared with a whole one (same idea as the month comparison).
  const lastWeek = addDaysISO(today, -7);
  const cutoff = now.getHours() * 60 + now.getMinutes();
  let lastWeekRevenue = 0;
  let lastWeekBills = 0;

  for (const o of orders) {
    const day = String(getOrderDate(o)).slice(0, 10);
    if (day === today) {
      if (o.status === 'completed') {
        revenue += Number(o.total) || 0;
        bills += 1;
        const u = countUnits(o);
        cups += u.cups;
        pieces += u.pieces;
      }
      if (!o.isPaid && o.status !== 'cancelled') {
        unpaidCount += 1;
        unpaidTotal += Number(o.total) || 0;
      }
    } else if (day === lastWeek && o.status === 'completed') {
      const m = minuteOfDay(o);
      if (m == null || m <= cutoff) {
        lastWeekRevenue += Number(o.total) || 0;
        lastWeekBills += 1;
      }
    }
  }

  const expenseTotal = expenses
    .filter((e) => String(e.date || '').slice(0, 10) === today && !NON_CASH_EXPENSE_CATEGORIES.includes(e.category))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // Only offer a delta when last week actually had sales by this time.
  const revenueDelta = lastWeekRevenue > 0
    ? Math.round(((revenue - lastWeekRevenue) / lastWeekRevenue) * 1000) / 10
    : null;

  return {
    revenue,
    bills,
    cups,
    pieces,
    unpaidCount,
    unpaidTotal,
    expenseTotal,
    lastWeek,
    lastWeekRevenue,
    lastWeekBills,
    revenueDelta,
  };
}
