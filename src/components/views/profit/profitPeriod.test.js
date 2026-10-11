import { describe, expect, it } from 'vitest';
import { defaultChartMode, fullMonthOf, profitRange, rangeDays } from './profitPeriod';

const now = new Date('2026-10-11T10:00:00+07:00');

describe('profitRange', () => {
  it('builds presets', () => {
    expect(profitRange('today', now)).toEqual({ start: '2026-10-11', end: '2026-10-11' });
    expect(profitRange('week', now)).toEqual({ start: '2026-10-05', end: '2026-10-11' });
    expect(profitRange('30d', now)).toEqual({ start: '2026-09-12', end: '2026-10-11' });
    expect(profitRange('month', now)).toEqual({ start: '2026-10-01', end: '2026-10-11' });
    expect(profitRange('lastMonth', now)).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(profitRange('lastMonth', new Date('2026-01-15T10:00:00+07:00'))).toEqual({ start: '2025-12-01', end: '2025-12-31' });
    expect(profitRange('all', now)).toEqual({ start: '', end: '' });
    expect(profitRange('custom', now, { start: '2026-08-02', end: '2026-08-09' })).toEqual({ start: '2026-08-02', end: '2026-08-09' });
  });
});

describe('fullMonthOf', () => {
  it('accepts a whole month or this month so far only', () => {
    expect(fullMonthOf('2026-09-01', '2026-09-30', '2026-10-11')).toBe('2026-09');
    expect(fullMonthOf('2026-10-01', '2026-10-11', '2026-10-11')).toBe('2026-10');
    expect(fullMonthOf('2026-09-01', '2026-09-20', '2026-10-11')).toBeNull();
    expect(fullMonthOf('2026-10-05', '2026-10-11', '2026-10-11')).toBeNull();
    expect(fullMonthOf('2026-08-01', '2026-09-30', '2026-10-11')).toBeNull();
    expect(fullMonthOf('', '', '2026-10-11')).toBeNull();
  });
});

describe('chart mode', () => {
  it('daily up to ~2 months', () => {
    expect(defaultChartMode('2026-09-12', '2026-10-11')).toBe('daily');
    expect(defaultChartMode('2026-05-01', '2026-10-11')).toBe('monthly');
    expect(defaultChartMode('', '')).toBe('monthly');
    expect(rangeDays('2026-10-05', '2026-10-11')).toBe(7);
  });
});
