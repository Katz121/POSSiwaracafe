// Physical stock count ("ตรวจนับสต็อกหน้างาน") · pure helpers.
//
// A count compares what the system says (`systemQty`, read fresh inside the
// save transaction) with what staff actually found on the shelf
// (`countedQty`). variance = counted − system: negative = ของขาด (loss),
// positive = ของเกิน. Records live in `stockCounts`; the latest one is also
// denormalised on the stock doc (lastCountedAt / lastCountedBy /
// lastCountVariance) so the stock list can show "ตรวจแล้ววันนี้" without a query.

import { formatNumber, toDate, toISODateLocal } from './format.js';

const round3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Parse what staff typed. Accepts "1,250", " 3.5 ". Returns a number ≥ 0, or
 * null for blank / not a number / negative (you can't find −2 bottles).
 */
export function parseCountInput(value) {
  if (value == null) return null;
  const s = String(value).replace(/,/g, '').trim();
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return round3(n);
}

/** counted − system, rounded to 3 dp (grams/ml keep their decimals). */
export const countVariance = (systemQty, countedQty) => round3(num(countedQty) - num(systemQty));

/** Baht value of a variance at the item's unit cost (2 dp). */
export const varianceCost = (variance, unitCost) => round2(num(variance) * num(unitCost));

/** Staff id from the auth email ("siwara@staff.siwara.local" → "siwara"). */
export function staffLabel(email) {
  const s = String(email || '').trim();
  if (!s) return '';
  const at = s.indexOf('@');
  return at > 0 ? s.slice(0, at) : s;
}

/**
 * The `stockCounts` document. `systemQty` must be the value read inside the
 * transaction, so the variance matches what is actually applied.
 */
export function buildStockCount({ item, systemQty, countedQty, date, countedAt, countedBy = '', note = '' }) {
  const system = round3(num(systemQty));
  const counted = round3(num(countedQty));
  const variance = countVariance(system, counted);
  return {
    stockId: String(item?.id || ''),
    stockName: String(item?.name || ''),
    unit: String(item?.unit || ''),
    date: String(date),
    countedAt: String(countedAt),
    countedBy: String(countedBy || ''),
    systemQty: system,
    countedQty: counted,
    variance,
    varianceCost: varianceCost(variance, item?.unitCost),
    adjusted: variance !== 0,
    note: String(note || '').trim().slice(0, 200),
  };
}

/** Fields written onto the stock doc alongside the count. */
export const stockCountPatch = (record) => ({
  lastCountedAt: record.countedAt,
  lastCountedBy: record.countedBy,
  lastCountVariance: record.variance,
});

// ── "when was this last counted" ────────────────────────────────────────────

/** Whole local days between the last count and `today` (YYYY-MM-DD); null = never. */
export function daysSinceCount(lastCountedAt, today) {
  const at = toDate(lastCountedAt);
  const t = toDate(today);
  if (!at || !t) return null;
  const countedDay = toDate(toISODateLocal(at));
  const diff = Math.round((t.getTime() - countedDay.getTime()) / 86400000);
  return Math.max(0, diff);
}

export const isCountedOn = (item, date) => daysSinceCount(item?.lastCountedAt, date) === 0;

/** Days before an old count turns amber in the list. */
export const COUNT_STALE_DAYS = 7;

/**
 * Row badge. key: today | recent | stale | never.
 * label is short enough for a phone row.
 */
export function countStatus(item, today) {
  const days = daysSinceCount(item?.lastCountedAt, today);
  if (days == null) return { key: 'never', label: 'ยังไม่เคยตรวจ', tone: 'neutral', days: null };
  if (days === 0) return { key: 'today', label: 'ตรวจแล้ววันนี้', tone: 'ok', days };
  const label = days === 1 ? 'ตรวจเมื่อวาน' : `ตรวจเมื่อ ${formatNumber(days)} วันก่อน`;
  return { key: days >= COUNT_STALE_DAYS ? 'stale' : 'recent', label, tone: days >= COUNT_STALE_DAYS ? 'warn' : 'neutral', days };
}

// ── stock list filter (`#/stock?filter=uncounted`) ──────────────────────────

export const COUNT_FILTER = 'uncounted';

/** Extends the stock list's own normalizer with the count filter. */
export const normalizeFilterWithCount = (value, normalizeStockFilter) => (
  value === COUNT_FILTER ? COUNT_FILTER : normalizeStockFilter(value)
);

/** true unless the filter is "uncounted" and the item was counted `today`. */
export const matchesCountFilter = (item, filter, today) => (
  filter !== COUNT_FILTER || !isCountedOn(item, today)
);

/** "ตรวจแล้ว 12/40" for a set of items. */
export function countProgress(items, today) {
  const total = items.length;
  const done = items.filter((i) => isCountedOn(i, today)).length;
  return { done, total, left: total - done, ratio: total ? done / total : 0 };
}

// ── day summary for the audit page ──────────────────────────────────────────

const byCountedAt = (a, b) => String(a.countedAt || '').localeCompare(String(b.countedAt || ''));

/**
 * Summarise one day's `stockCounts` docs. An item counted twice keeps only its
 * latest count for the matched/variance totals (the earlier one was corrected),
 * but every count stays in `history`.
 */
export function summarizeCounts(counts = []) {
  const history = [...counts].sort(byCountedAt);
  const latest = new Map();
  history.forEach((c) => latest.set(c.stockId, c));
  const items = [...latest.values()];
  const mismatched = items
    .filter((c) => num(c.variance) !== 0)
    .sort((a, b) => Math.abs(num(b.varianceCost)) - Math.abs(num(a.varianceCost))
      || Math.abs(num(b.variance)) - Math.abs(num(a.variance)));
  const matched = items.filter((c) => num(c.variance) === 0);
  const sum = (list) => round2(list.reduce((s, c) => s + num(c.varianceCost), 0));
  const counters = new Map();
  items.forEach((c) => {
    const who = c.countedBy || 'ไม่ระบุ';
    counters.set(who, (counters.get(who) || 0) + 1);
  });
  return {
    items: items.length,
    matched: matched.length,
    mismatched: mismatched.length,
    mismatchedRows: mismatched,
    matchedRows: matched.sort((a, b) => String(a.stockName).localeCompare(String(b.stockName), 'th')),
    totalCost: sum(mismatched),
    lossCost: sum(mismatched.filter((c) => num(c.varianceCost) < 0)),
    gainCost: sum(mismatched.filter((c) => num(c.varianceCost) > 0)),
    counters: [...counters.entries()].map(([name, n]) => ({ name, count: n })).sort((a, b) => b.count - a.count),
    recounts: history.length - items.length,
    history,
  };
}

/** Words for a variance: "ขาด 2 ขวด" / "เกิน 0.5 กก." / "ตรง". */
export function varianceWords(variance, unit = '') {
  const v = num(variance);
  if (v === 0) return 'ตรง';
  const q = formatNumber(Math.abs(v), { maxDecimals: 3 });
  return `${v < 0 ? 'ขาด' : 'เกิน'} ${q}${unit ? ` ${unit}` : ''}`;
}
