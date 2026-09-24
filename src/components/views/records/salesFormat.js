import { formatThaiDate } from '../../../utils/format';

// Labels for the sales-history tables. Display only.

export const monthLabel = (key) => (key === 'unknown' ? 'ไม่ระบุวันที่' : formatThaiDate(key, { style: 'month' }));

export const dayLabel = (key) => formatThaiDate(key, { weekday: true });

const WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
export const weekdayName = (key) => WEEKDAYS[new Date(`${key}T00:00:00`).getDay()];

/** "+12%" / "−8%" / "—" for a percent change (null = no previous value). */
export const signedPercent = (n) => (n === null || n === undefined || !Number.isFinite(n)
  ? '—'
  : `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n))}%`);

/** Short axis label for a chart bar: 48,193 → "48.2k". */
export const compactBaht = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toLocaleString('th-TH', { maximumFractionDigits: 1 })}k`;
  return v.toLocaleString('th-TH', { maximumFractionDigits: 0 });
};
