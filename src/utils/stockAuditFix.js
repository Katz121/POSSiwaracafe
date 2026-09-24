/**
 * ตรวจใหม่หลังแก้สูตร + ตัดสต็อกที่ขาดย้อนหลัง (backfill)
 *
 * ปัญหาเดิม: บิลที่ขายไปตอนสูตรยังเสีย (ชี้สต็อกที่ถูกลบ / เมนูยังไม่ผูก) ขึ้น "ต้องแก้" ตลอดไป
 * แม้เจ้าของร้านแก้สูตรแล้ว เพราะหน้าตรวจดูแต่สูตรที่ติดมากับบิล
 *
 * ไฟล์นี้ตอบ 2 คำถามต่อบรรทัดในบิล:
 * 1. **สูตรปัจจุบันแก้แล้วหรือยัง** · สูตรเมนูตอนนี้ + สูตรตัวเลือก (#) ตอนนี้ ของตัวเลือกที่บรรทัดนั้นเลือก
 *    (ตาม `modifierIds` · บิลเก่าไม่มีก็จับจากชื่อใน `beanModifier` "#คั่วเข้ม #..." แทน)
 * 2. **ขาดไปเท่าไหร่** · สูตรปัจจุบัน × จำนวน − ที่บรรทัดนั้นตัดไปจริง − ที่ตัดย้อนหลังไปแล้ว
 *    - บิลที่มีบันทึก `stockDeduction` ใช้ `skipped` บอกว่าลิงก์ไหนไม่ถูกตัดจริง
 *      ถ้าบรรทัดลิงก์เสียแต่ตอนตัดไม่มีอะไรถูกข้าม = สต็อกถูกลบทีหลัง ตอนขายตัดครบแล้ว ไม่ต้องตัดเพิ่ม
 *    - บิลเก่าไม่มีบันทึก ประเมินจากลิงก์ในบิลที่ยังมีสต็อกอยู่ตอนนี้
 *    - ตัดย้อนหลังแล้วบันทึกลงบิลที่ `stockBackfill` (อาเรย์ · ต่อบรรทัดใช้ `itemKey` = ลำดับบรรทัด)
 *      คำนวณซ้ำจากบิลล่าสุดทุกครั้ง จึงตัดซ้ำไม่ได้
 *
 * ฟังก์ชันบริสุทธิ์ ไม่แตะ Firestore · เทสต์ใน stockAuditFix.test.js
 */

import { resolveStockId } from './stockMerge.js';
import { applyMilkSwap } from './milkSwap.js';
import { mergeStockLinks } from './stockLinks.js';

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const round = (value) => Math.round(num(value) * 1000) / 1000;
const cleanName = (s) => String(s || '').trim().replace(/^#+/, '').trim();

/**
 * นมโอ๊ตที่ใช้ตรวจบิลนี้ · บิลที่ตัดแล้วโดยไม่มีป้าย milkSwapApplied = ตัดก่อนมีระบบนมโอ๊ต
 * ตรวจตามกติกาตอนตัด (ตัดนมวัว) ไม่งั้นนับซ้ำ
 */
export const orderMilkSwap = (order, milkSwap) => (
  order?.stockDeducted && !order?.stockDeduction?.milkSwapApplied ? null : milkSwap
);

/** "#คั่วเข้ม #Noko (โทนถั่ว)" → ['คั่วเข้ม', 'Noko (โทนถั่ว)'] */
export function parseModifierNames(beanModifier) {
  return String(beanModifier || '')
    .split('#')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** ของที่ใช้ซ้ำทุกบรรทัด · สร้างครั้งเดียวต่อการตรวจ */
export function buildFixContext({ stock = [], menu = [], beanModifiers = [], milkSwap = null } = {}) {
  const modifierByName = new Map();
  beanModifiers.forEach((m) => {
    const key = cleanName(m?.name);
    if (key && !modifierByName.has(key)) modifierByName.set(key, m);
  });
  return {
    stockById: new Map(stock.map((s) => [s.id, s])),
    menuById: new Map(menu.map((m) => [m.id, m])),
    menuByName: new Map(menu.map((m) => [String(m.name || '').trim(), m])),
    modifierById: new Map(beanModifiers.map((m) => [m.id, m])),
    modifierByName,
    milkSwap,
  };
}

const isAlive = (stockId, stockById) => stockById.has(resolveStockId(stockId, stockById));
const validLinks = (links) => (Array.isArray(links) ? links : []).filter((l) => l?.stockId);

/**
 * สูตรปัจจุบันของบรรทัดหนึ่งในบิล
 * @returns {{ menu: object|null, menuLinks: Array, modifiers: Array, missingModifiers: string[],
 *   links: Array, dead: Array<{stockId, source: 'menu'|'modifier', modifierId?, modifierName?}> }}
 */
export function currentLineRecipe(item, ctx) {
  const name = String(item?.name || '').trim();
  const menu = ctx.menuById.get(item?.id) || ctx.menuByName.get(name) || null;
  const menuLinks = validLinks(menu?.stockLinks);

  const modifiers = [];
  const missingModifiers = [];
  const ids = Array.isArray(item?.modifierIds) ? item.modifierIds.filter(Boolean) : [];
  if (ids.length) {
    ids.forEach((id) => {
      const mod = ctx.modifierById.get(id);
      if (mod) modifiers.push(mod); else missingModifiers.push(id);
    });
  } else {
    parseModifierNames(item?.beanModifier).forEach((n) => {
      const mod = ctx.modifierByName.get(cleanName(n));
      if (mod) modifiers.push(mod); else missingModifiers.push(n);
    });
  }

  const dead = [];
  menuLinks.forEach((l) => {
    if (!isAlive(l.stockId, ctx.stockById)) dead.push({ stockId: l.stockId, source: 'menu' });
  });
  modifiers.forEach((m) => {
    validLinks(m.stockLinks).forEach((l) => {
      if (!isAlive(l.stockId, ctx.stockById)) {
        dead.push({ stockId: l.stockId, source: 'modifier', modifierId: m.id, modifierName: cleanName(m.name) });
      }
    });
  });

  const links = mergeStockLinks(menuLinks, ...modifiers.map((m) => validLinks(m.stockLinks)));
  return { menu, menuLinks, modifiers, missingModifiers, links, dead };
}

/**
 * แก้สูตรแล้วหรือยัง
 * @param {boolean} requireMenuLinks ปัญหา "ยังไม่ผูก / ผูกแค่ตัวเลือก" ต้องให้ตัวเมนูเองมีสูตรแล้ว
 */
export function isRecipeFixed(recipe, requireMenuLinks) {
  if (!recipe.menu) return false;
  if (recipe.dead.length) return false;
  if (!recipe.links.length) return false;
  if (requireMenuLinks && !recipe.menuLinks.length) return false;
  return true;
}

/**
 * บรรทัดไหนในบิลตัดอะไรไปตอนกด "เสร็จ" · ต่อบรรทัด
 * mode: 'full' (มีบันทึก และไม่มีลิงก์ถูกข้าม) · 'partial' (มีบันทึก มีลิงก์ถูกข้าม) ·
 *       'none' (บรรทัดไม่มีสูตร) · 'guess' (บิลเก่าไม่มีบันทึก เดาจากสต็อกที่ยังอยู่)
 * @returns {Array<{ mode: string, applied: Object<string, number> }>}
 */
export function lineDeductions(order, stockById, milkSwap) {
  const swap = orderMilkSwap(order, milkSwap);
  const record = order?.stockDeduction;
  const hasRecord = Boolean(record && record.applied);
  // ลิงก์ที่ถูกข้ามตอนตัด · จับคู่ด้วยชื่อรายการ + stockId เดิม (ก่อน resolve) ทีละตัว
  const skippedLeft = new Map();
  if (hasRecord) {
    (record.skipped || []).forEach((s) => {
      const key = `${String(s?.item || '')}::${s?.stockId}`;
      skippedLeft.set(key, (skippedLeft.get(key) || 0) + 1);
    });
  }
  return (order?.items || []).map((item) => {
    const qty = num(item?.quantity);
    const links = validLinks(applyMilkSwap(item, swap, stockById));
    const applied = {};
    if (!links.length) return { mode: 'none', applied };
    let skippedAny = false;
    links.forEach((link) => {
      const used = qty * num(link.usage);
      if (used <= 0) return;
      const stockId = resolveStockId(link.stockId, stockById);
      if (hasRecord) {
        const key = `${String(item?.name || '')}::${link.stockId}`;
        const left = skippedLeft.get(key) || 0;
        if (left > 0) {
          skippedLeft.set(key, left - 1);
          skippedAny = true;
          return;
        }
      } else if (!stockById.has(stockId)) {
        return;
      }
      applied[stockId] = round((applied[stockId] || 0) + used);
    });
    if (!hasRecord) return { mode: 'guess', applied };
    return { mode: skippedAny ? 'partial' : 'full', applied };
  });
}

/** ที่ตัดย้อนหลังไปแล้วของบิลนี้ · Map<itemKey, {stockId: qty}> */
export function priorBackfill(order, stockById) {
  const out = new Map();
  (Array.isArray(order?.stockBackfill) ? order.stockBackfill : []).forEach((entry) => {
    (entry?.lines || []).forEach((line) => {
      const key = String(line?.itemKey ?? '');
      const row = out.get(key) || {};
      Object.entries(line?.applied || {}).forEach(([id, qty]) => {
        const rid = resolveStockId(id, stockById);
        row[rid] = round((row[rid] || 0) + num(qty));
      });
      out.set(key, row);
    });
  });
  return out;
}

/** รวมปริมาณที่ตัดย้อนหลังของบิล (ทุกบรรทัด) · ใช้ตอนลบบิลเพื่อคืนสต็อก */
export function backfillTotals(order) {
  const out = {};
  (Array.isArray(order?.stockBackfill) ? order.stockBackfill : []).forEach((entry) => {
    (entry?.lines || []).forEach((line) => {
      Object.entries(line?.applied || {}).forEach(([id, qty]) => {
        if (num(qty) > 0) out[id] = round((out[id] || 0) + num(qty));
      });
    });
  });
  return out;
}

/**
 * สถานะการแก้ของบรรทัดที่มีปัญหา
 *
 * state:
 * - 'open'           ยังไม่ได้แก้สูตร (หรือเมนูถูกลบ)
 * - 'not_deducted'   แก้สูตรแล้ว แต่บิลยังไม่ถูกตัดสต็อก (ค้าง/เสร็จแต่ไม่ถูกตัด) · ตัดย้อนหลังไม่ได้
 * - 'needs_backfill' แก้สูตรแล้ว ยังขาด `missing`
 * - 'resolved'       แก้สูตรแล้ว และไม่ขาดแล้ว (ตอนขายตัดครบ หรือตัดย้อนหลังแล้ว)
 *
 * @param {object} order
 * @param {number} index ลำดับบรรทัดใน order.items
 * @param {object} ctx จาก buildFixContext
 * @param {object} [opts]
 * @param {boolean} [opts.requireMenuLinks]
 * @param {Array} [opts.deductions] lineDeductions ของบิลนี้ (ส่งมาเพื่อไม่คำนวณซ้ำ)
 * @param {Map} [opts.prior] priorBackfill ของบิลนี้
 */
export function evaluateLineFix(order, index, ctx, opts = {}) {
  const item = order?.items?.[index];
  const recipe = currentLineRecipe(item, ctx);
  const fixed = isRecipeFixed(recipe, Boolean(opts.requireMenuLinks));
  const base = { index, itemKey: String(index), name: String(item?.name || ''), quantity: num(item?.quantity), recipe, missing: {} };
  if (!fixed) return { ...base, state: 'open' };
  if (!(order?.status === 'completed' && order?.stockDeducted)) return { ...base, state: 'not_deducted' };

  const deductions = opts.deductions || lineDeductions(order, ctx.stockById, ctx.milkSwap);
  const done = deductions[index] || { mode: 'none', applied: {} };
  // มีบันทึกว่าตอนตัดไม่มีลิงก์ถูกข้าม · ปัญหาเป็นแค่ลิงก์เสีย (สต็อกถูกลบทีหลัง) = ตอนขายตัดครบแล้ว
  if (done.mode === 'full' && !opts.requireMenuLinks) return { ...base, state: 'resolved', covered: 'at_sale' };

  const swap = orderMilkSwap(order, ctx.milkSwap);
  const current = {};
  const qty = num(item?.quantity);
  validLinks(applyMilkSwap({ ...item, stockLinks: recipe.links }, swap, ctx.stockById)).forEach((link) => {
    const used = qty * num(link.usage);
    if (used <= 0) return;
    const stockId = resolveStockId(link.stockId, ctx.stockById);
    if (!ctx.stockById.has(stockId)) return;
    current[stockId] = round((current[stockId] || 0) + used);
  });
  const prior = (opts.prior || priorBackfill(order, ctx.stockById)).get(String(index)) || {};
  const missing = {};
  Object.entries(current).forEach(([stockId, want]) => {
    const gap = round(want - num(done.applied[stockId]) - num(prior[stockId]));
    if (gap > 0) missing[stockId] = gap;
  });
  const backfilled = Object.keys(prior).length > 0;
  if (!Object.keys(missing).length) return { ...base, state: 'resolved', covered: backfilled ? 'backfill' : 'at_sale' };
  return { ...base, state: 'needs_backfill', missing };
}

/**
 * แผนตัดย้อนหลังจากรายการบรรทัด (`{orderId, index, requireMenuLinks}`) · คำนวณใหม่จากบิลที่ส่งมา
 * ใช้ทั้งตอนแสดงตัวอย่าง และใน transaction (ส่งบิลที่อ่านสดมา)
 *
 * @returns {{ orders: Array<{orderId, queueNumber, time, lines: Array<{itemKey, name, quantity, applied}>}>,
 *   totals: Array<{stockId, name, unit, qty, cost}>, cost: number }}
 */
export function planBackfill(lineRefs, ordersById, ctx) {
  const byOrder = new Map();
  (lineRefs || []).forEach((ref) => {
    const list = byOrder.get(ref.orderId) || [];
    list.push(ref);
    byOrder.set(ref.orderId, list);
  });

  const orders = [];
  const totals = new Map();
  byOrder.forEach((refs, orderId) => {
    const order = ordersById.get(orderId);
    if (!order || order.status !== 'completed' || !order.stockDeducted) return;
    const deductions = lineDeductions(order, ctx.stockById, ctx.milkSwap);
    const prior = priorBackfill(order, ctx.stockById);
    const seen = new Set();
    const lines = [];
    refs.forEach((ref) => {
      if (seen.has(ref.index)) return;
      seen.add(ref.index);
      const res = evaluateLineFix(order, ref.index, ctx, { requireMenuLinks: ref.requireMenuLinks, deductions, prior });
      if (res.state !== 'needs_backfill') return;
      lines.push({ itemKey: res.itemKey, name: res.name, quantity: res.quantity, applied: res.missing });
      Object.entries(res.missing).forEach(([stockId, qty]) => {
        const s = ctx.stockById.get(stockId);
        const row = totals.get(stockId) || { stockId, name: s?.name || stockId, unit: s?.unit || '', qty: 0, unitCost: num(s?.unitCost) };
        row.qty = round(row.qty + qty);
        totals.set(stockId, row);
      });
    });
    if (lines.length) orders.push({ orderId, queueNumber: order.queueNumber ?? null, time: order.time || '', lines });
  });

  const totalRows = [...totals.values()]
    .map((r) => ({ ...r, cost: Math.round(r.qty * r.unitCost * 100) / 100 }))
    .sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name));
  return { orders, totals: totalRows, cost: totalRows.reduce((s, r) => s + r.cost, 0) };
}

/** ใช้ใน runTransaction · รวมยอดที่จะหักต่อสต็อก */
export function backfillStockTotals(plan) {
  const out = {};
  plan.orders.forEach((o) => o.lines.forEach((l) => {
    Object.entries(l.applied).forEach(([id, qty]) => { out[id] = round((out[id] || 0) + qty); });
  }));
  return out;
}
