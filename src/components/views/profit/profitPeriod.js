import { getISODate } from '../../../utils/calculations';

// ช่วงเวลาเดียวของหน้ากำไรต่อเมนู · สรุป ตารางเตือน ตัวเลือก (#) กราฟ และอันดับเมนู
// ใช้ช่วงเดียวกันทั้งหมด จะได้เห็นว่าเมนูไหนผิดปกติในช่วงที่กำลังดู

export const PROFIT_PRESETS = [
  { value: 'today', label: 'วันนี้' },
  { value: 'week', label: '7 วัน' },
  { value: '30d', label: '30 วัน' },
  { value: 'month', label: 'เดือนนี้' },
  { value: 'lastMonth', label: 'เดือนก่อน' },
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'custom', label: 'เลือกช่วง' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const lastDayOfMonth = (month) => {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};
const prevMonth = (month) => {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

/** { start, end } as ISO days · '' = open end · 'custom' keeps the current range. */
export function profitRange(preset, now = new Date(), current = {}) {
  const today = getISODate(now);
  switch (preset) {
    case 'today': return { start: today, end: today };
    case 'week': return { start: getISODate(new Date(now.getTime() - 6 * DAY_MS)), end: today };
    case '30d': return { start: getISODate(new Date(now.getTime() - 29 * DAY_MS)), end: today };
    case 'month': return { start: `${today.slice(0, 7)}-01`, end: today };
    case 'lastMonth': {
      const m = prevMonth(today.slice(0, 7));
      return { start: `${m}-01`, end: lastDayOfMonth(m) };
    }
    case 'all': return { start: '', end: '' };
    default: return { start: current.start || today, end: current.end || today };
  }
}

/**
 * The month whose fixed costs (rent, salaries) fit this range, else null.
 * Net profit and break-even only mean something over one whole calendar month
 * (or this month so far) · a 7-day range would carry a whole month of rent.
 */
export function fullMonthOf(start, end, today = getISODate()) {
  if (!start || !end || start.slice(8) !== '01' || start.slice(0, 7) !== end.slice(0, 7)) return null;
  const month = start.slice(0, 7);
  return end === lastDayOfMonth(month) || (month === today.slice(0, 7) && end >= today) ? month : null;
}

/** Daily bars up to ~2 months, monthly beyond (an open range counts as long). */
export function defaultChartMode(start, end) {
  if (!start || !end) return 'monthly';
  const days = Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS) + 1;
  return days <= 62 ? 'daily' : 'monthly';
}

export function rangeDays(start, end) {
  if (!start || !end) return null;
  return Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS) + 1);
}

/** Calendar months touched by the range (for the monthly chart), null = open. */
export function monthsBetween(start, end) {
  if (!start || !end) return null;
  const [y1, m1] = start.split('-').map(Number);
  const [y2, m2] = end.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}
