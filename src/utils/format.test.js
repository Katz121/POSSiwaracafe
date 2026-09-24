import { describe, it, expect } from 'vitest';
import {
  formatBaht, formatNumber, formatPercent, formatThaiDate, formatTime, toDate,
  addDaysISO, addMonthsISO, matchingMonthRanges,
} from './format';

describe('formatBaht', () => {
  it('rounds float noise to 2 decimals (dashboard ฿38,312.276 bug)', () => {
    expect(formatBaht(38312.276)).toBe('฿38,312.28');
  });
  it('always shows 2 decimals when there is satang', () => {
    expect(formatBaht(32719.8)).toBe('฿32,719.80');
  });
  it('shows no decimals for whole amounts', () => {
    expect(formatBaht(1200)).toBe('฿1,200');
    expect(formatBaht(0)).toBe('฿0');
  });
  it('treats near-whole float noise as whole', () => {
    expect(formatBaht(0.1 + 0.2 + 99.7)).toBe('฿100');
  });
  it('puts the minus before the baht sign', () => {
    expect(formatBaht(-45.5)).toBe('-฿45.50');
  });
  it('supports an explicit + sign for deltas', () => {
    expect(formatBaht(20, { sign: true })).toBe('+฿20');
    expect(formatBaht(0, { sign: true })).toBe('฿0');
  });
  it('is safe with junk input', () => {
    expect(formatBaht(undefined)).toBe('฿0');
    expect(formatBaht('abc')).toBe('฿0');
    expect(formatBaht('1,234.5')).toBe('฿1,234.50');
  });
  it('can force decimals', () => {
    expect(formatBaht(10, { decimals: 2 })).toBe('฿10.00');
  });
});

describe('formatNumber / formatPercent', () => {
  it('groups and trims', () => {
    expect(formatNumber(1234.5)).toBe('1,234.5');
    expect(formatNumber(1.23456, { maxDecimals: 3 })).toBe('1.235');
  });
  it('formats percent units and ratios', () => {
    expect(formatPercent(12.345)).toBe('12.3%');
    expect(formatPercent(0.5, { ratio: true })).toBe('50%');
    expect(formatPercent(-3.21, { digits: 0 })).toBe('-3%');
    expect(formatPercent(4, { sign: true })).toBe('+4%');
  });
});

describe('dates', () => {
  it('parses ISO dates as local midnight', () => {
    const d = toDate('2026-09-24');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(24);
  });
  it('accepts Firestore-like timestamps', () => {
    const d = toDate({ seconds: 0 });
    expect(d.getTime()).toBe(0);
  });
  it('formats Thai Buddhist-era dates', () => {
    expect(formatThaiDate('2026-09-24')).toBe('24 ก.ย. 2569');
    expect(formatThaiDate('2026-09-24', { style: 'short' })).toBe('24 ก.ย. 69');
    expect(formatThaiDate('2026-09-24', { style: 'long' })).toBe('24 กันยายน 2569');
    expect(formatThaiDate('2026-09', { style: 'month' })).toBe('กันยายน 2569');
    expect(formatThaiDate('2026-09-24', { weekday: true })).toBe('พฤ. 24 ก.ย. 2569');
    expect(formatThaiDate(null)).toBe('');
  });
  it('formats 24h time', () => {
    expect(formatTime(new Date(2026, 8, 24, 7, 5, 9))).toBe('07:05');
    expect(formatTime(new Date(2026, 8, 24, 17, 5, 9), { seconds: true })).toBe('17:05:09');
  });
  it('shifts days and months', () => {
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28');
    expect(addMonthsISO('2026-01', -1)).toBe('2025-12');
  });
});

describe('matchingMonthRanges', () => {
  it('compares month-to-date with the same days last month', () => {
    expect(matchingMonthRanges('2026-09-24')).toEqual({
      current: { start: '2026-09-01', end: '2026-09-24' },
      previous: { start: '2026-08-01', end: '2026-08-24' },
      days: 24,
    });
  });
  it('clamps to the shorter previous month', () => {
    expect(matchingMonthRanges('2026-03-31').previous).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });
  it('crosses the year boundary', () => {
    expect(matchingMonthRanges('2026-01-15').previous).toEqual({ start: '2025-12-01', end: '2025-12-15' });
  });
});
