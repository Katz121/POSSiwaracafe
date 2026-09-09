/**
 * แนวโน้มรายเดือน · ผลงานรายเมนู · ตัวเลขสรุปที่เจ้าของร้านควรรู้
 *
 * แยกจาก `profitability.js` เพราะไฟล์นั้นตอบคำถามเดียวคือ "เดือนนี้กำไรเท่าไหร่"
 * ส่วนไฟล์นี้ตอบคำถามที่ต้องมองข้ามเดือนและข้ามเมนู เช่น "ขาขึ้นหรือขาลง"
 * "เมนูไหนควรดัน" "ควรขึ้นราคาตัวไหนก่อน"
 *
 * ทุกฟังก์ชันเป็น pure ไม่แตะ Firestore ไม่แตะ React เพื่อให้เทสต์ได้ตรงๆ
 */

import { DEFAULT_INVENTORY_CATEGORIES, computeProfitability, computeUnitCost } from './profitability';

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * เดือนของบิลในรูป YYYY-MM
 *
 * บิลเก่าบางใบมีแต่ createdAt ไม่มี date และมีบางใบที่ date เพี้ยนเป็นรูปแบบไทย
 * (เจอจริงในข้อมูลร้าน เช่น "3/1/256") ตัวไหนอ่านไม่ออกคืน '' แล้วถูกตัดทิ้ง
 * ดีกว่าปล่อยให้ไปโผล่ผิดเดือนแล้วกราฟเพี้ยนโดยไม่มีใครรู้
 */
export function orderMonth(order) {
  const raw = String(order?.date || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(0, 7);
  const seconds = order?.createdAt?.seconds;
  if (seconds) return new Date(seconds * 1000).toISOString().slice(0, 7);
  return '';
}

export function addMonths(month, delta) {
  const [year, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(year, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * ชุดข้อมูลรายเดือนสำหรับกราฟ
 *
 * เดือนที่ไม่มีการขายก็ต้องมีจุดบนกราฟเป็นศูนย์ ไม่ใช่หายไปเฉยๆ ไม่งั้นเส้นจะ
 * ลากข้ามเดือนที่ร้านปิดแล้วอ่านผิดว่ายอดต่อเนื่องมาตลอด
 *
 * @param {number|null} [monthsBack] 6 หรือ 12 · null = ทั้งหมดเท่าที่มีข้อมูล
 */
export function computeMonthlySeries({
  orders = [],
  expenses = [],
  menu = [],
  stock = [],
  monthsBack = null,
  endMonth = null,
  inventoryCategories = DEFAULT_INVENTORY_CATEGORIES,
} = {}) {
  const completed = orders.filter((o) => o?.status === 'completed' && orderMonth(o));
  const present = [...new Set(completed.map(orderMonth))].sort();
  if (!present.length) return [];

  const last = endMonth || present[present.length - 1];
  const first = monthsBack ? addMonths(last, -(monthsBack - 1)) : present[0];

  const wanted = [];
  for (let m = first; m <= last; m = addMonths(m, 1)) wanted.push(m);

  const ordersByMonth = new Map();
  completed.forEach((order) => {
    const m = orderMonth(order);
    if (!ordersByMonth.has(m)) ordersByMonth.set(m, []);
    ordersByMonth.get(m).push(order);
  });

  const expensesByMonth = new Map();
  expenses.forEach((expense) => {
    const m = String(expense?.date || '').slice(0, 7);
    if (!m) return;
    if (!expensesByMonth.has(m)) expensesByMonth.set(m, []);
    expensesByMonth.get(m).push(expense);
  });

  return wanted.map((month) => {
    const monthOrders = ordersByMonth.get(month) || [];
    const result = computeProfitability({
      orders: monthOrders,
      expenses: expensesByMonth.get(month) || [],
      menu,
      stock,
      inventoryCategories,
    });
    return {
      month,
      bills: monthOrders.length,
      revenue: result.revenue,
      cogs: result.cogs,
      grossProfit: result.grossProfit,
      netProfit: result.netProfit,
      cashFlow: result.cashFlow,
      unitsSold: result.unitsSold,
      grossMargin: result.grossMargin,
      cogsRatio: result.cogsRatio,
      cogsCoverage: result.cogsCoverage,
    };
  });
}

/**
 * ผลงานรายเมนู พร้อมส่วนแบ่งยอดขายและส่วนแบ่งกำไร
 *
 * ทำไมต้องมีทั้งสองส่วนแบ่ง: เมนูที่ยอดขายสูงสุดกับเมนูที่ทำกำไรให้ร้านมากสุด
 * มักไม่ใช่ตัวเดียวกัน เค้กราคาแพงแต่ต้นทุนสูงอาจแพ้กาแฟธรรมดาที่ขายถี่
 * ถ้าดูแต่ยอดขายจะทุ่มโปรโมชั่นผิดตัว
 */
export function computeItemPerformance({ orders = [], menu = [], stock = [] } = {}) {
  const menuByName = new Map(menu.map((m) => [m.name, m]));
  const stockById = new Map(stock.map((s) => [s.id, s]));
  const byName = new Map();

  orders.forEach((order) => {
    (order?.items || []).forEach((item) => {
      const name = String(item?.name || 'ไม่ระบุ');
      const qty = num(item?.quantity) || 1;
      const { cost, costed } = computeUnitCost(item, menuByName, stockById);
      const prev = byName.get(name) || {
        name,
        units: 0,
        revenue: 0,
        cogs: 0,
        costed: false,
        category: item?.category || menuByName.get(name)?.category || '',
      };
      byName.set(name, {
        name: prev.name,
        category: prev.category,
        units: prev.units + qty,
        revenue: prev.revenue + num(item?.price) * qty,
        cogs: prev.cogs + cost * qty,
        costed: prev.costed || costed,
      });
    });
  });

  const rows = [...byName.values()];
  const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0);
  const totalProfit = rows.reduce((sum, r) => sum + (r.revenue - r.cogs), 0);

  return rows
    .map((r) => {
      const grossProfit = r.revenue - r.cogs;
      return {
        ...r,
        grossProfit,
        marginPct: r.revenue > 0 ? Math.round((grossProfit / r.revenue) * 100) : 0,
        profitPerUnit: r.units > 0 ? grossProfit / r.units : 0,
        avgPrice: r.units > 0 ? r.revenue / r.units : 0,
        revenueShare: totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0,
        profitShare: totalProfit > 0 ? (grossProfit / totalProfit) * 100 : 0,
      };
    })
    .sort((a, b) => b.grossProfit - a.grossProfit);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * จัดกลุ่มเมนูแบบ menu engineering
 *
 *   star      ขายดี + มาร์จิ้นสูง   ดันต่อ อย่าไปยุ่งกับราคา
 *   workhorse ขายดี + มาร์จิ้นต่ำ   ขึ้นราคาหรือลดต้นทุนตรงนี้ได้ผลไวที่สุด
 *   puzzle    ขายน้อย + มาร์จิ้นสูง ดันการขาย ย้ายไปหน้าแรกของเมนู
 *   dog       ขายน้อย + มาร์จิ้นต่ำ พิจารณาตัดทิ้ง
 *
 * เทียบกับค่ากลางของร้านตัวเอง ไม่ใช่เกณฑ์ลอยๆ เพราะร้านกาแฟกับร้านอาหาร
 * มีมาร์จิ้นคนละโลก · ใช้ median ไม่ใช่ค่าเฉลี่ย เพราะเมนูขายดีสุดตัวเดียว
 * ลากค่าเฉลี่ยขึ้นจนเมนูที่เหลือกลายเป็น "ขายน้อย" ไปหมด
 */
export function classifyMenuEngineering(items = []) {
  // เมนูที่ยังไม่ผูกต้นทุนจะได้มาร์จิ้น 100% ซึ่งไม่จริง ถ้าเอามาคิดค่ากลางด้วย
  // เส้นแบ่งจะเพี้ยนทั้งกระดาน จึงกันออกไปเป็น unknown
  const rated = items.filter((i) => i.costed);
  const unitsMedian = median(rated.map((i) => i.units));
  const marginMedian = median(rated.map((i) => i.marginPct));

  const classified = items.map((item) => {
    if (!item.costed) return { ...item, segment: 'unknown' };
    const popular = item.units >= unitsMedian;
    const profitable = item.marginPct >= marginMedian;
    return {
      ...item,
      segment: popular ? (profitable ? 'star' : 'workhorse') : (profitable ? 'puzzle' : 'dog'),
    };
  });

  return { items: classified, unitsMedian, marginMedian };
}

export const SEGMENT_LABELS = {
  star: { label: 'ดาวเด่น', hint: 'ขายดีและกำไรดี ดันต่อ อย่าไปลดราคา' },
  workhorse: { label: 'ขายดีแต่กำไรบาง', hint: 'ขึ้นราคาหรือลดต้นทุนตรงนี้ได้ผลไวที่สุด' },
  puzzle: { label: 'กำไรดีแต่ขายน้อย', hint: 'ดันการขาย ย้ายไปจุดที่ลูกค้าเห็นก่อน' },
  dog: { label: 'ขายน้อยและกำไรบาง', hint: 'พิจารณาตัดออกจากเมนู' },
  unknown: { label: 'ยังไม่ผูกต้นทุน', hint: 'ผูกสต็อกก่อน ถึงจะรู้ว่าคุ้มหรือไม่' },
};

/**
 * เมนูกี่ตัวรวมกันแล้วสร้างกำไรถึงสัดส่วนที่กำหนด (default 80%)
 * ตัวเลขนี้บอกความเปราะบาง ถ้ากำไร 80% มาจากเมนู 3 ตัว วันที่วัตถุดิบตัวใดตัวหนึ่ง
 * ขาดหรือขึ้นราคา ร้านสะเทือนทันที
 */
export function concentration(items = [], target = 0.8) {
  const positive = items
    .filter((i) => i.grossProfit > 0)
    .sort((a, b) => b.grossProfit - a.grossProfit);
  const total = positive.reduce((sum, i) => sum + i.grossProfit, 0);
  if (total <= 0) return { count: 0, of: items.length, sharePct: Math.round(target * 100) };

  let acc = 0;
  let count = 0;
  for (const item of positive) {
    acc += item.grossProfit;
    count += 1;
    if (acc / total >= target) break;
  }
  return { count, of: items.length, sharePct: Math.round(target * 100) };
}

/** เปลี่ยนแปลงเทียบเดือนก่อนหน้า เป็น % · เดือนก่อนเป็นศูนย์ถือว่าเทียบไม่ได้ */
export function growth(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

/**
 * ตัวเลขสรุปที่เจ้าของร้านควรรู้แต่ระบบยังไม่เคยบอก
 * เน้นตัวที่ "ทำอะไรต่อได้" ไม่ใช่ตัวเลขสวยๆ ที่ดูแล้วจบ
 */
export function computeHeadlineKpis({ orders = [], items = [], profitability = null, series = [] } = {}) {
  const bills = orders.length;
  const revenue = profitability ? profitability.revenue : 0;
  const grossProfit = profitability ? profitability.grossProfit : 0;
  const unitsSold = profitability ? profitability.unitsSold : 0;

  const thisMonth = series.length ? series[series.length - 1] : null;
  const lastMonth = series.length > 1 ? series[series.length - 2] : null;

  return {
    bills,
    // ยอดต่อบิลบอกว่าควรดัน "คนเข้าร้านเพิ่ม" หรือ "ขายเพิ่มต่อคน" คนละกลยุทธ์กัน
    averageTicket: bills > 0 ? revenue / bills : 0,
    grossProfitPerBill: bills > 0 ? grossProfit / bills : 0,
    unitsPerBill: bills > 0 ? unitsSold / bills : 0,
    revenueGrowth: thisMonth && lastMonth ? growth(thisMonth.revenue, lastMonth.revenue) : null,
    profitGrowth: thisMonth && lastMonth ? growth(thisMonth.grossProfit, lastMonth.grossProfit) : null,
    concentration: concentration(items),
    topBySales: [...items].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    topByProfit: [...items].sort((a, b) => b.grossProfit - a.grossProfit).slice(0, 10),
    // ขายดีแต่มาร์จิ้นบาง ขึ้นราคา 5 บาทตรงนี้ได้ผลกว่าออกเมนูใหม่ทั้งตัว
    //
    // ต้องกรองเอาเฉพาะตัวที่ "ขายได้ถึงค่ากลาง" ด้วย ไม่ใช่เรียงมาร์จิ้นต่ำสุดล้วนๆ
    // เมนูที่ขายได้ชิ้นเดียวทั้งเดือนต่อให้มาร์จิ้น 5% ขึ้นราคาไปก็ไม่เปลี่ยนอะไร
    // แต่กินที่ในรายการจนบังตัวที่ขยับแล้วเห็นผลจริง
    // ไม่มี fallback ไปใช้ทั้งหมดเมื่อกรองแล้วเหลือน้อย เพราะ fallback จะลาก
    // เมนูขายชิ้นเดียวกลับเข้ามาบังตัวที่ขยับแล้วเห็นผล · เหลือน้อยแปลว่า
    // ไม่มีอะไรให้ทำจริงๆ ซึ่งเป็นคำตอบที่ถูกต้องกว่ารายการยาวๆ ที่ทำตามไม่ได้
    thinMargin: (() => {
      const rated = items.filter((i) => i.costed && i.units > 0);
      const cutoff = median(rated.map((i) => i.units));
      return rated
        .filter((i) => i.units >= cutoff)
        .sort((a, b) => a.marginPct - b.marginPct)
        .slice(0, 10);
    })(),
  };
}
