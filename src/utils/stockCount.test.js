import { describe, it, expect } from 'vitest';
import {
  parseCountInput, countVariance, varianceCost, staffLabel, buildStockCount, stockCountPatch,
  daysSinceCount, isCountedOn, countStatus, normalizeFilterWithCount, matchesCountFilter,
  countProgress, summarizeCounts, varianceWords, COUNT_FILTER,
} from './stockCount.js';

const milk = { id: 'milk', name: 'นมสด', unit: 'ขวด', unitCost: 45, quantity: 10 };
// Local-time ISO for a given local day/hour (what new Date().toISOString() stores).
const at = (day, h = 10) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`).toISOString();

describe('parseCountInput', () => {
  it('reads plain, grouped and decimal numbers', () => {
    expect(parseCountInput('12')).toBe(12);
    expect(parseCountInput(' 1,250.5 ')).toBe(1250.5);
    expect(parseCountInput(0)).toBe(0);
  });
  it('rejects blank, junk and negatives', () => {
    expect(parseCountInput('')).toBeNull();
    expect(parseCountInput('  ')).toBeNull();
    expect(parseCountInput('abc')).toBeNull();
    expect(parseCountInput('-2')).toBeNull();
    expect(parseCountInput(null)).toBeNull();
  });
});

describe('variance + cost', () => {
  it('counted − system, float noise removed', () => {
    expect(countVariance(10, 8)).toBe(-2);
    expect(countVariance(0.3, 0.1 + 0.2)).toBe(0);
    expect(countVariance(100.1, 100.25)).toBe(0.15);
    expect(countVariance(-3, 0)).toBe(3); // negative system stock counted as empty
  });
  it('costs the variance at unit cost', () => {
    expect(varianceCost(-2, 45)).toBe(-90);
    expect(varianceCost(0.15, 0.0521)).toBe(0.01);
    expect(varianceCost(3, undefined)).toBe(0);
  });
});

describe('staffLabel', () => {
  it('strips the staff auth domain', () => {
    expect(staffLabel('siwara@staff.siwara.local')).toBe('siwara');
    expect(staffLabel('')).toBe('');
    expect(staffLabel('bob')).toBe('bob');
  });
});

describe('buildStockCount', () => {
  it('builds a mismatch record', () => {
    const r = buildStockCount({ item: milk, systemQty: 10, countedQty: 8, date: '2026-09-24', countedAt: 'T', countedBy: 'siwara', note: '  ของเสีย ' });
    expect(r).toEqual({
      stockId: 'milk', stockName: 'นมสด', unit: 'ขวด', date: '2026-09-24', countedAt: 'T', countedBy: 'siwara',
      systemQty: 10, countedQty: 8, variance: -2, varianceCost: -90, adjusted: true, note: 'ของเสีย',
    });
    expect(stockCountPatch(r)).toEqual({ lastCountedAt: 'T', lastCountedBy: 'siwara', lastCountVariance: -2 });
  });
  it('a match is not an adjustment', () => {
    const r = buildStockCount({ item: milk, systemQty: 10, countedQty: 10, date: 'd', countedAt: 't' });
    expect(r.variance).toBe(0);
    expect(r.varianceCost).toBe(0);
    expect(r.adjusted).toBe(false);
    expect(r.note).toBe('');
  });
});

describe('days since count', () => {
  it('counts local calendar days, not 24h blocks', () => {
    expect(daysSinceCount(at('2026-09-24', 1), '2026-09-24')).toBe(0);
    expect(daysSinceCount(at('2026-09-23', 23), '2026-09-24')).toBe(1);
    expect(daysSinceCount(at('2026-09-21', 8), '2026-09-24')).toBe(3);
    expect(daysSinceCount(undefined, '2026-09-24')).toBeNull();
    expect(daysSinceCount('garbage', '2026-09-24')).toBeNull();
  });
  it('isCountedOn', () => {
    expect(isCountedOn({ lastCountedAt: at('2026-09-24') }, '2026-09-24')).toBe(true);
    expect(isCountedOn({ lastCountedAt: at('2026-09-23') }, '2026-09-24')).toBe(false);
    expect(isCountedOn({}, '2026-09-24')).toBe(false);
  });
  it('countStatus labels', () => {
    const today = '2026-09-24';
    expect(countStatus({}, today)).toMatchObject({ key: 'never', label: 'ยังไม่เคยตรวจ' });
    expect(countStatus({ lastCountedAt: at(today) }, today)).toMatchObject({ key: 'today', tone: 'ok', label: 'ตรวจแล้ววันนี้' });
    expect(countStatus({ lastCountedAt: at('2026-09-23') }, today)).toMatchObject({ key: 'recent', label: 'ตรวจเมื่อวาน' });
    expect(countStatus({ lastCountedAt: at('2026-09-21') }, today)).toMatchObject({ key: 'recent', label: 'ตรวจเมื่อ 3 วันก่อน' });
    expect(countStatus({ lastCountedAt: at('2026-09-10') }, today)).toMatchObject({ key: 'stale', tone: 'warn', days: 14 });
  });
});

describe('uncounted filter', () => {
  const base = (v) => (['all', 'low', 'out'].includes(v) ? v : 'all');
  it('normalizes with the count filter', () => {
    expect(normalizeFilterWithCount('uncounted', base)).toBe(COUNT_FILTER);
    expect(normalizeFilterWithCount('low', base)).toBe('low');
    expect(normalizeFilterWithCount('nope', base)).toBe('all');
  });
  it('hides only items counted today, and only for that filter', () => {
    const today = '2026-09-24';
    const done = { lastCountedAt: at(today) };
    const old = { lastCountedAt: at('2026-09-20') };
    expect(matchesCountFilter(done, 'uncounted', today)).toBe(false);
    expect(matchesCountFilter(old, 'uncounted', today)).toBe(true);
    expect(matchesCountFilter({}, 'uncounted', today)).toBe(true);
    expect(matchesCountFilter(done, 'all', today)).toBe(true);
  });
  it('progress', () => {
    const today = '2026-09-24';
    const items = [{ lastCountedAt: at(today) }, {}, { lastCountedAt: at('2026-09-01') }];
    expect(countProgress(items, today)).toEqual({ done: 1, total: 3, left: 2, ratio: 1 / 3 });
    expect(countProgress([], today).ratio).toBe(0);
  });
});

describe('summarizeCounts', () => {
  const c = (stockId, variance, varianceCost, countedAt, countedBy = 'a') => ({
    stockId, stockName: stockId, variance, varianceCost, countedAt, countedBy,
  });
  it('keeps the latest count per item and totals the ฿', () => {
    const s = summarizeCounts([
      c('milk', -2, -90, '2026-09-24T03:00:00.000Z'),
      c('milk', -1, -45, '2026-09-24T05:00:00.000Z', 'b'), // recount wins
      c('cup', 0, 0, '2026-09-24T04:00:00.000Z'),
      c('bean', 50, 25, '2026-09-24T04:30:00.000Z'),
      c('syrup', -0.5, -60, '2026-09-24T04:40:00.000Z'),
    ]);
    expect(s.items).toBe(4);
    expect(s.matched).toBe(1);
    expect(s.mismatched).toBe(3);
    expect(s.mismatchedRows.map((r) => r.stockId)).toEqual(['syrup', 'milk', 'bean']);
    expect(s.totalCost).toBe(-80);
    expect(s.lossCost).toBe(-105);
    expect(s.gainCost).toBe(25);
    expect(s.recounts).toBe(1);
    expect(s.counters).toEqual([{ name: 'a', count: 3 }, { name: 'b', count: 1 }]);
  });
  it('empty day', () => {
    const s = summarizeCounts([]);
    expect(s).toMatchObject({ items: 0, matched: 0, mismatched: 0, totalCost: 0 });
  });
});

describe('varianceWords', () => {
  it('reads like staff talk', () => {
    expect(varianceWords(0, 'ขวด')).toBe('ตรง');
    expect(varianceWords(-2, 'ขวด')).toBe('ขาด 2 ขวด');
    expect(varianceWords(1250.5, 'กรัม')).toBe('เกิน 1,250.5 กรัม');
  });
});
