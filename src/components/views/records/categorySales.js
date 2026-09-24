import { getISODate, getOrderDate, isDateInRange } from '../../../utils/calculations';

// Category sales for a date range (moved out of CategorySummaryView, same rules):
// completed bills only · category = line category, else the menu item's
// category, else "ไม่ระบุหมวดหมู่" · revenue = line price × quantity.

const categoryOf = (item, menuCategoryById) =>
  String(item.category || menuCategoryById.get(item.id) || 'ไม่ระบุหมวดหมู่');

export function buildCategorySales(orders = [], menu = [], start = '', end = '') {
  // First menu entry per id wins, like the old `menu.find(m => m.id === item.id)`.
  const menuCategoryById = new Map();
  menu.forEach((m) => { if (!menuCategoryById.has(m.id)) menuCategoryById.set(m.id, m?.category); });

  const totals = new Map();
  const items = {};
  const beans = {};

  orders
    .filter((o) => o.status === 'completed' && isDateInRange(getOrderDate(o), start, end))
    .forEach((order) => {
      (order.items || []).forEach((item) => {
        const category = categoryOf(item, menuCategoryById);
        const quantity = Number(item.quantity) || 0;
        const revenue = (Number(item.price) || 0) * quantity;

        const current = totals.get(category) || { category, revenue: 0, quantity: 0 };
        current.revenue += revenue;
        current.quantity += quantity;
        totals.set(category, current);

        if (!items[category]) items[category] = {};
        const itemName = String(item.name);
        if (!items[category][itemName]) {
          items[category][itemName] = { name: itemName, quantity: 0, revenue: 0, price: Number(item.price) || 0 };
        }
        items[category][itemName].quantity += quantity;
        items[category][itemName].revenue += revenue;

        if (item.beanModifier && String(item.beanModifier).startsWith('#')) {
          const tag = String(item.beanModifier);
          if (!beans[category]) beans[category] = {};
          if (!beans[category][tag]) beans[category][tag] = { tag, quantity: 0, revenue: 0 };
          beans[category][tag].quantity += quantity;
          beans[category][tag].revenue += revenue;
        }
      });
    });

  const categories = Array.from(totals.values()).sort((a, b) => b.revenue - a.revenue);
  const breakdown = {};
  Object.keys(items).forEach((cat) => {
    breakdown[cat] = {
      items: Object.values(items[cat]).sort((a, b) => b.quantity - a.quantity),
      beans: beans[cat] ? Object.values(beans[cat]).sort((a, b) => b.quantity - a.quantity) : [],
    };
  });
  const totalRevenue = categories.reduce((s, c) => s + c.revenue, 0);
  const totalQuantity = categories.reduce((s, c) => s + c.quantity, 0);
  return { categories, breakdown, totalRevenue, totalQuantity };
}

export const CATEGORY_PRESETS = [
  { value: 'today', label: 'วันนี้' },
  { value: 'week', label: '7 วัน' },
  { value: 'month', label: 'เดือนนี้' },
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'custom', label: 'เลือกช่วง' },
];

/** Date range for a preset. 'all' → open range; 'custom' keeps the given one. */
export function presetRange(preset, now = new Date(), current = {}) {
  const today = getISODate(now);
  switch (preset) {
    case 'all': return { start: '', end: '' };
    case 'week': return { start: getISODate(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)), end: today };
    case 'month': return { start: `${today.slice(0, 7)}-01`, end: today };
    case 'today': return { start: today, end: today };
    default: return { start: current.start || today, end: current.end || today };
  }
}

/** CSV exactly as the pre-v2 export (range comment line + category,quantity,revenue). */
export function categorySalesCsv(categories, rangeLabel) {
  const headers = ['category', 'quantity', 'revenue'];
  const rows = categories.map((cat) => ([
    `"${String(cat.category).replace(/"/g, '""')}"`,
    Number(cat.quantity) || 0,
    Number(cat.revenue) || 0,
  ].join(',')));
  return '\uFEFF' + [`# range: ${rangeLabel}`, headers.join(','), ...rows].join('\n');
}

export function rangeLabel(preset, start, end) {
  if (preset === 'all') return 'all';
  return `${start || 'start'}_to_${end || 'end'}`;
}
