// ประวัติสต็อกรายตัว · ประกอบจากบันทึกที่ระบบมีอยู่แล้ว ไม่ต้องเริ่มนับใหม่
//  ขาย          orders.stockDeduction.applied (+ stockBackfill ตัดย้อนหลัง) · รวมเป็นรายวัน
//  รับเข้า       expenses ที่มี stockId + stockQuantity
//  ของเสีย       expenses หมวดของเสีย (ใหม่มี stockId · เก่าจับจากชื่อ "ของเสีย: ชื่อ (xN หน่วย)")
//  เจ้าของ/พนักงานกิน expenses.staffMeal.applied
//  ตรวจนับ       stockCounts (variance ≠ 0)
//  ผลิต          productionBatches (ใช้วัตถุดิบ / ได้ของเตรียม / ย้อนรายการ)
//  ปรับยอดเอง     stockMoves (ปุ่ม +/− · ปรับยอดให้ตรง · แก้ตัวเลขคงเหลือ) เริ่มเก็บ 2026-10-11
// สต็อกที่ถูกรวมเข้ามา (mergedInto) นับประวัติของตัวเดิมด้วย

import { WASTE_CATEGORY } from '../config/constants.js';
import { resolveStockId } from './stockMerge.js';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round3 = (n) => Math.round(n * 1000) / 1000;

const tsMs = (v) => {
  if (!v) return null;
  if (typeof v === 'number') return v;
  if (v.seconds) return v.seconds * 1000;
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
const dayOf = (ms, fallback = '') => {
  if (ms == null) return fallback;
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const MOVE_KINDS = {
  sale: { label: 'ขาย', dir: -1 },
  backfill: { label: 'ตัดย้อนหลัง', dir: -1 },
  intake: { label: 'รับเข้า', dir: 1 },
  waste: { label: 'ของเสีย', dir: -1 },
  staff: { label: 'เจ้าของ/พนักงานกิน', dir: -1 },
  count: { label: 'ตรวจนับ', dir: 0 },
  produceUse: { label: 'ใช้ผลิต', dir: -1 },
  produceOut: { label: 'ผลิตได้', dir: 1 },
  produceUndo: { label: 'ย้อนการผลิต', dir: 0 },
  manual: { label: 'ปรับยอด', dir: 0 },
};

const MANUAL_LABEL = { stepper: 'ปุ่ม +/−', correction: 'ปรับยอดให้ตรง', edit: 'แก้ตัวเลขคงเหลือ' };

/**
 * @returns {Array<{ key, kind, label, qty, at, date, detail, count? }>} ใหม่สุดก่อน · qty เป็น +/− หน่วยของสต็อก
 */
export function buildStockHistory({ item, stock = [], orders = [], expenses = [], counts = [], batches = [], moves = [] }) {
  if (!item?.id) return [];
  const stockById = new Map(stock.map((s) => [s.id, s]));
  const mine = (id) => !!id && resolveStockId(id, stockById) === item.id;
  const out = [];
  const push = (e) => { if (e.qty !== 0) out.push({ ...e, qty: round3(e.qty), label: e.label || MOVE_KINDS[e.kind].label }); };

  // ขาย · รวมรายวัน (วันละหลายสิบบิล รายตัวอ่านไม่ไหว)
  const salesByDay = new Map();
  orders.forEach((o) => {
    if (o?.status !== 'completed') return;
    const applied = o.stockDeducted ? o.stockDeduction?.applied || {} : {};
    const used = Object.entries(applied).reduce((s, [id, q]) => (mine(id) ? s + num(q) : s), 0);
    if (used > 0) {
      const at = tsMs(o.stockDeduction?.at) ?? tsMs(o.createdAt);
      const date = o.date || dayOf(at);
      const row = salesByDay.get(date) || { key: `sale-${date}`, kind: 'sale', qty: 0, at: 0, date, count: 0 };
      row.qty -= used;
      row.count += 1;
      row.at = Math.max(row.at, at || 0);
      salesByDay.set(date, row);
    }
    (o.stockBackfill || []).forEach((b, i) => {
      const q = (b.lines || []).reduce((s, l) => s + Object.entries(l.applied || {}).reduce((t, [id, v]) => (mine(id) ? t + num(v) : t), 0), 0);
      const at = tsMs(b.at);
      if (q > 0) push({ key: `bf-${o.id}-${i}`, kind: 'backfill', qty: -q, at, date: dayOf(at, o.date), detail: `บิล #${o.queueNumber ?? ''}`.trim() });
    });
  });
  salesByDay.forEach((row) => push({ ...row, detail: `${row.count} บิล` }));

  expenses.forEach((e) => {
    const at = tsMs(e.createdAt);
    const date = e.date || dayOf(at);
    if (e.staffMeal?.applied) {
      const q = Object.entries(e.staffMeal.applied).reduce((s, [id, v]) => (mine(id) ? s + num(v) : s), 0);
      if (q > 0) push({ key: `staff-${e.id}`, kind: 'staff', qty: -q, at, date, detail: e.title || '' });
      return;
    }
    if (e.category === WASTE_CATEGORY) {
      let q = 0;
      if (e.stockId) q = mine(e.stockId) ? num(e.stockQuantity) : 0;
      else {
        const m = String(e.title || '').match(/^ของเสีย: (.+) \(x([\d.]+) /);
        if (m && m[1] === item.name) q = num(m[2]);
      }
      if (q > 0) push({ key: `waste-${e.id}`, kind: 'waste', qty: -q, at, date, detail: e.note || '' });
      return;
    }
    if (mine(e.stockId) && num(e.stockQuantity) > 0) {
      push({ key: `in-${e.id}`, kind: 'intake', qty: num(e.stockQuantity), at, date, detail: `${e.quantity ?? ''} ${e.unit || ''} · ฿${num(e.amount).toLocaleString('th-TH')}`.trim() });
    }
  });

  counts.forEach((c) => {
    if (!mine(c.stockId) || !num(c.variance)) return;
    const at = tsMs(c.countedAt);
    push({ key: `count-${c.id}`, kind: 'count', qty: num(c.variance), at, date: c.date || dayOf(at), detail: `ระบบ ${c.systemQty} → นับได้ ${c.countedQty}${c.countedBy ? ` · ${c.countedBy}` : ''}` });
  });

  batches.forEach((b) => {
    if (b.status !== 'done' && b.status !== 'cancelled') return;
    const doneAt = tsMs(b.doneAt);
    const name = b.outputName || stockById.get(b.outputStockId)?.name || 'ของเตรียม';
    const used = (b.actualIngredients || []).reduce((s, l) => (mine(l.stockId) ? s + num(l.qty) : s), 0);
    if (used > 0) push({ key: `pu-${b.id}`, kind: 'produceUse', qty: -used, at: doneAt, date: dayOf(doneAt), detail: `ทำ ${name}` });
    if (mine(b.outputStockId) && num(b.yieldQty) > 0) push({ key: `po-${b.id}`, kind: 'produceOut', qty: num(b.yieldQty), at: doneAt, date: dayOf(doneAt), detail: '' });
    if (b.status === 'cancelled' && b.reversedAt) {
      const at = tsMs(b.reversedAt);
      const back = used - (mine(b.outputStockId) ? num(b.yieldQty) : 0);
      if (back) push({ key: `pr-${b.id}`, kind: 'produceUndo', qty: back, at, date: dayOf(at), detail: `ย้อน ${name}` });
    }
  });

  moves.forEach((m) => {
    if (!mine(m.stockId)) return;
    const at = tsMs(m.at);
    push({ key: `mv-${m.id}`, kind: 'manual', label: MANUAL_LABEL[m.reason] || MOVE_KINDS.manual.label, qty: num(m.delta), at, date: m.date || dayOf(at), detail: [m.note, m.by].filter(Boolean).join(' · ') });
  });

  return out.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.at || 0) - (a.at || 0));
}

/** ยอดรวมเข้า/ออกของรายการที่ส่งมา */
export function summarizeHistory(rows) {
  return rows.reduce((s, r) => {
    if (r.qty > 0) s.in += r.qty; else s.out += -r.qty;
    return s;
  }, { in: 0, out: 0 });
}

/** เอกสาร stockMoves สำหรับการปรับยอดที่ไม่มีบันทึกอื่น */
export function buildStockMove({ item, before, after, reason, by = '', note = '', now = new Date() }) {
  return {
    stockId: String(item.id),
    stockName: String(item.name || ''),
    unit: String(item.unit || ''),
    reason,
    before: round3(num(before)),
    after: round3(num(after)),
    delta: round3(num(after) - num(before)),
    at: now.toISOString(),
    date: dayOf(now.getTime()),
    by: String(by || ''),
    note: String(note || '').slice(0, 200),
  };
}
