// Shared display formatters (UX v2 · WP0 contract).
// Presentation only: never feed these strings back into calculations.

const toNumber = (value) => {
  const n = typeof value === 'string' ? Number(value.replace(/,/g, '')) : Number(value);
  return Number.isFinite(n) ? n : 0;
};

// Round to 2 dp first so float noise (38312.276 / 0.1+0.2) never leaks into the UI.
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Plain number with Thai grouping. Up to `maxDecimals` (default 2) decimals,
 * trailing zeros dropped: 1234.5 → "1,234.5", 1200 → "1,200".
 */
export function formatNumber(value, { maxDecimals = 2, minDecimals = 0 } = {}) {
  const n = toNumber(value);
  return n.toLocaleString('th-TH', {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: Math.max(minDecimals, maxDecimals),
  });
}

/**
 * Baht amount: "฿38,312.28", "฿1,200", "-฿45.50".
 * Whole amounts show no decimals; anything with satang shows exactly 2.
 * `sign: true` prefixes "+" for positive values (deltas).
 */
export function formatBaht(value, { sign = false, decimals } = {}) {
  const n = round2(toNumber(value));
  const abs = Math.abs(n);
  const hasSatang = Math.round(abs * 100) % 100 !== 0;
  const digits = decimals ?? (hasSatang ? 2 : 0);
  const body = abs.toLocaleString('th-TH', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const prefix = n < 0 ? '-' : sign && n > 0 ? '+' : '';
  return `${prefix}฿${body}`;
}

/**
 * Percent. `value` is already in percent units (12.34 → "12.3%").
 * Pass `{ ratio: true }` when the value is a 0..1 ratio (0.1234 → "12.3%").
 */
export function formatPercent(value, { digits = 1, sign = false, ratio = false } = {}) {
  let n = toNumber(value);
  if (ratio) n *= 100;
  const body = Math.abs(n).toLocaleString('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
  const prefix = n < 0 ? '-' : sign && n > 0 ? '+' : '';
  return `${prefix}${body}%`;
}

/**
 * Accepts Date, ISO date "YYYY-MM-DD" (parsed as LOCAL midnight, not UTC),
 * ISO datetime, epoch ms, or a Firestore Timestamp ({ seconds } / toDate()).
 */
export function toDate(input) {
  if (input == null || input === '') return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  if (typeof input?.toDate === 'function') return input.toDate();
  if (typeof input === 'object' && Number.isFinite(input.seconds)) return new Date(input.seconds * 1000);
  if (typeof input === 'number') return new Date(input);
  if (typeof input === 'string') {
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(input);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3] || 1));
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const TH_MONTH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_MONTH_LONG = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_WEEKDAY_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

/**
 * Thai Buddhist-era date. Implemented by hand (not Intl) so the output is the
 * same on every device/ICU build.
 *  style 'short'  → "24 ก.ย. 69"
 *  style 'medium' → "24 ก.ย. 2569"   (default)
 *  style 'long'   → "24 กันยายน 2569"
 *  style 'month'  → "กันยายน 2569"
 *  weekday: true  → prefix "พ. "
 */
export function formatThaiDate(input, { style = 'medium', weekday = false } = {}) {
  const d = toDate(input);
  if (!d) return '';
  const be = d.getFullYear() + 543;
  const day = d.getDate();
  const mon = d.getMonth();
  let out;
  if (style === 'short') out = `${day} ${TH_MONTH_SHORT[mon]} ${String(be).slice(-2)}`;
  else if (style === 'long') out = `${day} ${TH_MONTH_LONG[mon]} ${be}`;
  else if (style === 'month') out = `${TH_MONTH_LONG[mon]} ${be}`;
  else out = `${day} ${TH_MONTH_SHORT[mon]} ${be}`;
  return weekday && style !== 'month' ? `${TH_WEEKDAY_SHORT[d.getDay()]} ${out}` : out;
}

/** 24-hour clock "HH:mm" (add seconds with { seconds: true }). */
export function formatTime(input, { seconds = false } = {}) {
  const d = toDate(input);
  if (!d) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const base = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return seconds ? `${base}:${pad(d.getSeconds())}` : base;
}

/** Local ISO date "YYYY-MM-DD" for a Date (no UTC shift). */
export function toISODateLocal(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Shift an ISO date by whole days ("2026-09-24", -1 → "2026-09-23"). */
export function addDaysISO(iso, days) {
  const d = toDate(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + days);
  return toISODateLocal(d);
}

/** Shift an ISO month "YYYY-MM" by whole months. */
export function addMonthsISO(isoMonth, months) {
  const d = toDate(isoMonth);
  if (!d) return isoMonth;
  const shifted = new Date(d.getFullYear(), d.getMonth() + months, 1);
  return toISODateLocal(shifted).slice(0, 7);
}

/**
 * Month-to-date range and the matching range of the previous month, for a
 * like-for-like comparison (owner decision 2026-09-24: compare the same number
 * of days). Day is clamped to the previous month's length, so Mar 31 compares
 * with Feb 1–28/29.
 *
 * matchingMonthRanges('2026-09-24') →
 *   { current: { start: '2026-09-01', end: '2026-09-24' },
 *     previous: { start: '2026-08-01', end: '2026-08-24' }, days: 24 }
 */
export function matchingMonthRanges(isoDate) {
  const d = toDate(isoDate);
  if (!d) return null;
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const prevLast = new Date(y, m, 0).getDate();
  const prevDay = Math.min(day, prevLast);
  const prevStart = new Date(y, m - 1, 1);
  return {
    current: { start: toISODateLocal(new Date(y, m, 1)), end: toISODateLocal(d) },
    previous: { start: toISODateLocal(prevStart), end: toISODateLocal(new Date(y, m - 1, prevDay)) },
    days: day,
  };
}
