// Pure helpers for the inventory screens (status, filters, route params).
import { isArchivedStock } from '../../../utils/stockMerge';
import { DEFAULT_MIN_QUANTITY, DEFAULT_STOCK_UNIT, STOCK_CATEGORIES, getStockCategory, isEquipmentStock } from '../../../config/constants';

/**
 * Reorder point. Same fallback as the dashboard's low-stock alert
 * (alertService: `Number(minQuantity) || 5`) so the counts always agree
 * with the "ต้องจัดการ" link that opens `#/stock?filter=low`.
 */
export const reorderPoint = (item) => Number(item?.minQuantity) || DEFAULT_MIN_QUANTITY;

export const STOCK_STATUS = {
  negative: { key: 'negative', label: 'ติดลบ', tone: 'danger', rank: 3 },
  out: { key: 'out', label: 'หมด', tone: 'danger', rank: 2 },
  low: { key: 'low', label: 'ใกล้หมด', tone: 'warn', rank: 1 },
  ok: { key: 'ok', label: 'พอ', tone: 'ok', rank: 0 },
  equipment: { key: 'equipment', label: 'ของใช้', tone: 'neutral', rank: 0 },
};

export function stockStatus(item) {
  // อุปกรณ์/ของใช้ ใช้ซ้ำได้ ไม่มีวันใกล้หมด
  if (isEquipmentStock(item)) return STOCK_STATUS.equipment;
  const qty = Number(item?.quantity) || 0;
  if (qty < 0) return STOCK_STATUS.negative;
  if (qty === 0) return STOCK_STATUS.out;
  if (qty <= reorderPoint(item)) return STOCK_STATUS.low;
  return STOCK_STATUS.ok;
}

/** 'low' = at or under the reorder point (includes out/negative, like the alert). */
export const needsRestock = (item) => stockStatus(item).rank > 0;
export const isOut = (item) => stockStatus(item).rank >= 2;

// 'merged' = รายการที่ถูกรวมเข้ากับตัวอื่นแล้ว (mergedInto) · ซ่อนจากตัวกรองอื่นทั้งหมด
export const STOCK_FILTERS = ['all', 'low', 'out', 'merged'];
export const normalizeStockFilter = (value) => (STOCK_FILTERS.includes(value) ? value : 'all');

export function matchesStockFilter(item, filter) {
  if (filter === 'merged') return isArchivedStock(item);
  if (isArchivedStock(item)) return false;
  if (filter === 'low') return needsRestock(item);
  if (filter === 'out') return isOut(item);
  return true;
}

export function matchesStockSearch(item, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return String(item?.name ?? '').toLowerCase().includes(q)
    || getStockCategory(item).toLowerCase().includes(q);
}

/**
 * Worst first (negative → out → low → ok), then the category order used
 * everywhere else, then the furthest below its reorder point.
 */
export function sortStockForReview(stock) {
  const categoryIndex = new Map(STOCK_CATEGORIES.map((category, index) => [category, index]));
  const catRank = (item) => categoryIndex.get(getStockCategory(item)) ?? STOCK_CATEGORIES.length;
  const gap = (item) => reorderPoint(item) - (Number(item.quantity) || 0);
  return [...stock].sort((a, b) => (
    stockStatus(b).rank - stockStatus(a).rank
    || catRank(a) - catRank(b)
    || gap(b) - gap(a)
    || String(a.name ?? '').localeCompare(String(b.name ?? ''), 'th')
  ));
}

// ── Stock audit route params ────────────────────────────────────────────────
// Internal tab keys stay as the view had them (sold|stock|issues|menu). The
// public URL vocabulary uses `links` for the menu-link tab (Dashboard and
// MenuManage already link to `#/stock-audit?tab=links`).
export const AUDIT_TABS = ['sold', 'stock', 'issues', 'menu', 'production'];

export function auditTabFromParam(value) {
  if (value === 'links') return 'menu';
  return AUDIT_TABS.includes(value) ? value : 'sold';
}

export const auditTabToParam = (tab) => (tab === 'menu' ? 'links' : tab);

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A valid `YYYY-MM-DD` not after `today`, else `today`. */
export function auditDateFromParam(value, today) {
  if (typeof value !== 'string' || !ISO_DAY.test(value)) return today;
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return today;
  return value > today ? today : value;
}

/** Params for the URL: defaults are left out so the hash stays short. */
export function auditParams({ date, tab, today }) {
  const params = {};
  if (date && date !== today) params.date = date;
  if (tab && tab !== 'sold') params.tab = auditTabToParam(tab);
  return params;
}

// ── Add / edit item form values (same shape StockView always saved) ────────
export const emptyStockItem = () => ({ name: '', category: 'อื่น ๆ', quantity: 0, unit: DEFAULT_STOCK_UNIT, minQuantity: DEFAULT_MIN_QUANTITY, unitCost: 0 });
export const stockItemForm = (item) => ({
  name: item.name || '',
  category: getStockCategory(item),
  quantity: item.quantity || 0,
  unit: item.unit || DEFAULT_STOCK_UNIT,
  minQuantity: item.minQuantity || DEFAULT_MIN_QUANTITY,
  unitCost: item.unitCost || 0,
});
