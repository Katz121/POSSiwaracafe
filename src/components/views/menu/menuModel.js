import { auditMenuLinks, LINK_STATUS } from '../../../utils/stockAudit.js';

// Pure helpers for the menu page (no React, no Firestore) · tested in menu.test.js

/** A blank editor form (same shape the old "เตรียมเพิ่มเมนูใหม่" button reset to). */
export const emptyMenuItem = () => ({
  name: '', nameEn: '', price: '', category: '', image: '', description: '', descriptionEn: '',
  recommended: false, isFeatured: false, isPinnedBest: false, available: true, stockLinks: [],
});

export const UNCATEGORIZED = 'ไม่ระบุหมวดหมู่';

/** Filters accepted from the chips and from `#/menu?filter=` */
export const STOCK_FILTERS = ['all', 'unlinked', 'broken', 'modifier', 'linked'];
export const HIGHLIGHT_FILTERS = ['all', 'featured', 'pinned'];

export const stockFilterFromParam = (value) => {
  if (value === 'dead') return 'broken';
  return STOCK_FILTERS.includes(value) ? value : 'all';
};

/**
 * Per-menu stock-link and cost status.
 * Link status comes from `auditMenuLinks` (same source as the nav badge and the
 * stock-audit "ผูกสต็อก" tab) so every screen agrees; cost/margin keeps the
 * pre-v2 formula (live links × unitCost + additionalCost).
 *
 * @returns {Map<string, { status, aliveCount, deadCount, costed, totalCost, marginPercent, suspicious }>}
 */
export function buildMenuStatus({ menu = [], stock = [], beanModifiers = [] } = {}) {
  const stockById = new Map(stock.map((s) => [s.id, s]));
  const audit = auditMenuLinks({ menu, stock, beanModifiers, includeHidden: true });
  const byId = new Map(audit.items.map((i) => [i.id, i]));
  return new Map(menu.map((item) => {
    const a = byId.get(item.id);
    const alive = (item.stockLinks || []).filter((link) => link?.stockId && stockById.has(link.stockId));
    const linkCost = alive.reduce((sum, link) => sum + Number(stockById.get(link.stockId).unitCost || 0) * Number(link.usage || 0), 0);
    const totalCost = linkCost + Number(item.additionalCost || 0);
    const costed = alive.length > 0 || Number(item.additionalCost) > 0;
    const price = Number(item.price) || 0;
    return [item.id, {
      status: a?.status || LINK_STATUS.UNLINKED,
      aliveCount: a?.alive.length ?? alive.length,
      deadCount: a?.dead.length ?? 0,
      costed,
      totalCost,
      marginPercent: Math.round((price - totalCost) / (price || 1) * 100),
      // same threshold as profitability · linking only packaging makes margin look too good
      suspicious: costed && price > 0 && totalCost / price < 0.08,
    }];
  }));
}

export function matchesStockFilter(status, filter) {
  if (!status) return filter === 'all';
  switch (filter) {
    case 'unlinked': return status.status === LINK_STATUS.UNLINKED;
    case 'broken': return status.deadCount > 0;
    case 'modifier': return status.status === LINK_STATUS.MODIFIER_ONLY;
    case 'linked': return status.aliveCount > 0;
    default: return true;
  }
}

export function matchesHighlight(item, filter) {
  if (filter === 'featured') return item.isFeatured === true || item.recommended === true;
  if (filter === 'pinned') return item.isPinnedBest === true;
  return true;
}

export function matchesSearch(item, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return [item.name, item.nameEn, item.category].some((v) => String(v || '').toLowerCase().includes(q));
}

/** Counts for the chips (over the whole menu, not the filtered list). */
export function countStockFilters(menu, statusById) {
  const counts = { all: menu.length, unlinked: 0, broken: 0, modifier: 0, linked: 0 };
  menu.forEach((item) => {
    const s = statusById.get(item.id);
    ['unlinked', 'broken', 'modifier', 'linked'].forEach((f) => { if (matchesStockFilter(s, f)) counts[f] += 1; });
  });
  return counts;
}

/**
 * Group by category in the shop's tab order (dynamicCategories), "แนะนำ" first,
 * unknown categories after, alphabetically. Inside a group: on sale first
 * (unchanged from v1), then by name.
 */
export function groupMenu(items, categories = []) {
  const order = new Map(categories.map((c, i) => [c.name, i]));
  const groups = new Map();
  items.forEach((item) => {
    const cat = item.category || UNCATEGORIZED;
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(item);
  });
  const rank = (name) => (name === 'แนะนำ' ? -1 : order.has(name) ? order.get(name) : Number.MAX_SAFE_INTEGER);
  return [...groups.keys()]
    .sort((a, b) => (rank(a) - rank(b)) || a.localeCompare(b, 'th'))
    .map((name) => ({
      name,
      items: groups.get(name).slice().sort((a, b) => ((a.available === false ? 1 : 0) - (b.available === false ? 1 : 0))
        || String(a.name || '').localeCompare(String(b.name || ''), 'th')),
    }));
}
