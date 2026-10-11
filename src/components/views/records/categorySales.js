import { getOrderDate, getOrderTimeMs, isDateInRange } from '../../../utils/calculations';
import { billNetRatio, growth } from '../../../utils/menuInsights';
import { computeUnitCost } from '../../../utils/profitability';
import { defaultChartMode, previousRange } from '../../../utils/periodRange';
import { MILK_OPTIONS } from '../../../config/constants';

// ยอดขายตามหมวด · บิลสำเร็จเท่านั้น · หมวด = หมวดในบรรทัดบิล ถ้าไม่มีใช้หมวดของเมนู
// ถ้าไม่มีอีก "ไม่ระบุหมวดหมู่"
// ยอดสุทธิ = ราคา × จำนวน × billNetRatio (ปันส่วนลดท้ายบิลตามสัดส่วนราคา · กติกาเดียวกับ
// หน้ากำไรต่อเมนู) · ต้นทุน = computeUnitCost (สูตรในบิลก่อน สูตรปัจจุบันเป็นค่าประมาณ)

const UNKNOWN = 'ไม่ระบุหมวดหมู่';
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const milkLabel = new Map(MILK_OPTIONS.map((m) => [m.value, m.label]));

const categoryOf = (item, menuCategoryById) =>
  String(item?.category || menuCategoryById.get(item?.id) || UNKNOWN);

/** Option choices on a line, as [group, label] pairs (the drill-down shows every group). */
function lineOptions(item) {
  const out = [];
  const tag = String(item?.beanModifier || '').trim();
  if (tag) out.push(['ตัวเลือก (#)', tag.replace(/^#/, '')]);
  if (item?.milkType) out.push(['นม', milkLabel.get(item.milkType) || String(item.milkType)]);
  if (item?.sweetness !== undefined && item?.sweetness !== null && item?.sweetness !== '') out.push(['ความหวาน', `${num(item.sweetness)}%`]);
  return out;
}

const trendKey = (iso, daily) => (daily ? iso : iso.slice(0, 7));

/**
 * @returns {{
 *   categories: Array, breakdown: Object, totals: Object,
 *   trend: { daily: boolean, rows: Array, keys: string[] },
 *   hours: { hours: number[], rows: Array }, pairs: Array,
 * }}
 */
export function buildCategoryReport({ orders = [], menu = [], stock = [], beanModifiers = [], start = '', end = '' } = {}) {
  // First menu entry per id wins, like the old `menu.find(m => m.id === item.id)`.
  const menuCategoryById = new Map();
  menu.forEach((m) => { if (!menuCategoryById.has(m.id)) menuCategoryById.set(m.id, m?.category); });
  const menuByName = new Map(menu.map((m) => [m.name, m]));
  const stockById = new Map(stock.map((s) => [s.id, s]));
  const modifiersByName = new Map(beanModifiers.map((m) => [String(m?.name || '').trim(), m]));

  const completed = orders.filter((o) => o?.status === 'completed');
  const inRange = completed.filter((o) => isDateInRange(getOrderDate(o), start, end));
  const prev = previousRange(start, end);
  const prevOrders = prev ? completed.filter((o) => isDateInRange(getOrderDate(o), prev.start, prev.end)) : [];
  const daily = defaultChartMode(start, end) === 'daily';

  const cats = new Map();
  const cat = (name) => {
    if (!cats.has(name)) {
      cats.set(name, {
        category: name, gross: 0, net: 0, quantity: 0, cogs: 0, costedNet: 0, bills: 0,
        hours: new Array(24).fill(0), items: new Map(), options: new Map(),
      });
    }
    return cats.get(name);
  };
  const trend = new Map();
  const pairCounts = new Map();
  let billsWithTime = 0;

  inRange.forEach((order) => {
    const ratio = billNetRatio(order);
    const ms = getOrderTimeMs(order);
    const hour = ms == null ? null : new Date(ms).getHours();
    if (hour != null) billsWithTime += 1;
    const key = trendKey(getOrderDate(order) || '', daily);
    const seen = new Set();

    (order.items || []).forEach((item) => {
      const name = categoryOf(item, menuCategoryById);
      const c = cat(name);
      const quantity = num(item.quantity);
      const gross = num(item.price) * quantity;
      const net = gross * ratio;
      const { cost, costed } = computeUnitCost(item, menuByName, stockById, modifiersByName);

      c.gross += gross;
      c.net += net;
      c.quantity += quantity;
      if (costed) { c.cogs += cost * quantity; c.costedNet += net; }
      if (hour != null) c.hours[hour] += net;
      seen.add(name);

      const itemName = String(item.name);
      const row = c.items.get(itemName) || { name: itemName, quantity: 0, net: 0, cogs: 0, costedNet: 0 };
      row.quantity += quantity;
      row.net += net;
      if (costed) { row.cogs += cost * quantity; row.costedNet += net; }
      c.items.set(itemName, row);

      lineOptions(item).forEach(([group, label]) => {
        if (!c.options.has(group)) c.options.set(group, new Map());
        const g = c.options.get(group);
        const opt = g.get(label) || { label, quantity: 0, net: 0 };
        opt.quantity += quantity;
        opt.net += net;
        g.set(label, opt);
      });

      if (key) {
        const t = trend.get(key) || { key };
        t[name] = (t[name] || 0) + net;
        trend.set(key, t);
      }
    });

    seen.forEach((name) => { cats.get(name).bills += 1; });
    const list = [...seen].sort();
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const k = `${list[i]}\u0000${list[j]}`;
        pairCounts.set(k, (pairCounts.get(k) || 0) + 1);
      }
    }
  });

  const prevNet = new Map();
  let prevTotal = 0;
  prevOrders.forEach((order) => {
    const ratio = billNetRatio(order);
    (order.items || []).forEach((item) => {
      const name = categoryOf(item, menuCategoryById);
      const net = num(item.price) * num(item.quantity) * ratio;
      prevNet.set(name, (prevNet.get(name) || 0) + net);
      prevTotal += net;
    });
  });

  const marginOf = (r) => (r.costedNet > 0 ? ((r.costedNet - r.cogs) / r.costedNet) * 100 : null);
  const categories = [...cats.values()].map((c) => ({
    category: c.category,
    gross: c.gross,
    net: c.net,
    discount: c.gross - c.net,
    quantity: c.quantity,
    bills: c.bills,
    avgPerBill: c.bills ? c.net / c.bills : 0,
    cogs: c.cogs,
    grossProfit: c.net - c.cogs,
    marginPct: marginOf(c),
    costCoverage: c.net > 0 ? (c.costedNet / c.net) * 100 : 0,
    prevNet: prev ? prevNet.get(c.category) || 0 : null,
    growth: prev ? growth(c.net, prevNet.get(c.category) || 0) : null,
  })).sort((a, b) => b.net - a.net);

  const breakdown = {};
  cats.forEach((c) => {
    breakdown[c.category] = {
      items: [...c.items.values()]
        .map((r) => ({ ...r, price: r.quantity ? r.net / r.quantity : 0, grossProfit: r.net - r.cogs, marginPct: marginOf(r) }))
        .sort((a, b) => b.quantity - a.quantity),
      options: [...c.options.entries()].map(([group, opts]) => ({
        group,
        options: [...opts.values()].sort((a, b) => b.quantity - a.quantity),
      })),
      // หมวดที่ตกลงไปจากช่วงก่อนแต่ไม่มีขายเลยในช่วงนี้จะไม่อยู่ในตาราง (ไม่มีแถว)
    };
  });

  const sum = (key) => categories.reduce((s, c) => s + (c[key] || 0), 0);
  const net = sum('net');
  const costedNet = [...cats.values()].reduce((s, c) => s + c.costedNet, 0);
  const cogs = sum('cogs');
  const totals = {
    gross: sum('gross'),
    net,
    discount: sum('gross') - net,
    quantity: sum('quantity'),
    bills: inRange.length,
    avgPerBill: inRange.length ? net / inRange.length : 0,
    cogs,
    grossProfit: net - cogs,
    marginPct: costedNet > 0 ? ((costedNet - cogs) / costedNet) * 100 : null,
    costCoverage: net > 0 ? (costedNet / net) * 100 : 0,
    prev: prev ? { ...prev, net: prevTotal, bills: prevOrders.length } : null,
    growth: prev ? growth(net, prevTotal) : null,
    billGrowth: prev ? growth(inRange.length, prevOrders.length) : null,
  };

  const hourList = [];
  const allHours = new Array(24).fill(0);
  cats.forEach((c) => c.hours.forEach((v, h) => { allHours[h] += v; }));
  allHours.forEach((v, h) => { if (v > 0) hourList.push(h); });
  const hours = {
    // ช่วงชั่วโมงต่อเนื่องจากชั่วโมงแรกถึงชั่วโมงสุดท้ายที่มีขาย (ไม่มีช่องโหว่กลางตาราง)
    hours: hourList.length ? Array.from({ length: hourList[hourList.length - 1] - hourList[0] + 1 }, (_, i) => hourList[0] + i) : [],
    rows: categories.map((c) => ({ category: c.category, values: cats.get(c.category).hours })),
    billsWithTime,
  };

  const pairs = [...pairCounts.entries()].map(([k, bills]) => {
    const [a, b] = k.split('\u0000');
    const billsA = cats.get(a).bills;
    const billsB = cats.get(b).bills;
    return { a, b, bills, ofA: billsA ? (bills / billsA) * 100 : 0, ofB: billsB ? (bills / billsB) * 100 : 0 };
  }).sort((x, y) => y.bills - x.bills);

  return {
    categories,
    breakdown,
    totals,
    trend: { daily, rows: [...trend.values()].sort((a, b) => a.key.localeCompare(b.key)), keys: categories.map((c) => c.category) },
    hours,
    pairs,
  };
}

/** CSV · one row per category with every number on the page. */
export function categorySalesCsv(categories, label) {
  const headers = ['category', 'quantity', 'bills', 'gross', 'discount', 'net', 'avg_per_bill', 'cogs', 'gross_profit', 'margin_pct', 'cost_coverage_pct', 'prev_net', 'growth_pct'];
  const round = (v) => (v === null || v === undefined ? '' : Math.round(v * 100) / 100);
  const rows = categories.map((c) => ([
    `"${String(c.category).replace(/"/g, '""')}"`,
    num(c.quantity), num(c.bills), round(c.gross), round(c.discount), round(c.net), round(c.avgPerBill),
    round(c.cogs), round(c.grossProfit), round(c.marginPct), round(c.costCoverage), round(c.prevNet), c.growth ?? '',
  ].join(',')));
  return '﻿' + [`# range: ${label}`, headers.join(','), ...rows].join('\n');
}

export function rangeLabel(preset, start, end) {
  if (preset === 'all') return 'all';
  return `${start || 'start'}_to_${end || 'end'}`;
}
