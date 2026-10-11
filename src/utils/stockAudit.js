/**
 * ตรวจการตัดสต็อก · ตอบคำถามเจ้าของร้านว่า "วันนี้ขายอะไรไป ตัดสต็อกอะไรไป และตัดถูกไหม"
 *
 * ระบบตัดสต็อกตอนบิลถูกกด "เสร็จ" (ดู `updateStatus` ใน App.jsx) โดยใช้สูตรที่แต่ละรายการ
 * พกมาในบิล (`item.stockLinks` = สูตรเมนู + ตัวเลือกที่ลูกค้าเลือก) · จุดที่ตัดพลาดได้แบบเงียบๆ:
 *
 * 1. **เมนูไม่ได้ผูกสต็อก** · รายการนั้นไม่มีสูตร ขายไปกี่แก้วสต็อกก็ไม่ขยับ
 * 2. **ผูกกับสต็อกที่ถูกลบไปแล้ว** · ตัวตัดสต็อกข้ามไปเงียบๆ (`if (!stockItem) return`)
 *    ข้อมูลจริง 2026-09-24: เมนูที่เปิดขาย 31 รายการยังชี้ไป stockId ที่ไม่มีอยู่แล้ว
 * 3. **บิลเสร็จแต่ไม่ถูกตัด** · `status === 'completed'` แต่ไม่มีธง `stockDeducted`
 * 4. **ตัดไม่ตรงกับที่ควร** · บิลที่ตัดหลังมีบันทึก `stockDeduction` เทียบของที่ตัดจริงกับสูตรได้ตรงๆ
 *
 * สต็อกที่ถูกรวมเข้ากับอีกตัว (`mergedInto` · ดู stockMerge.js) ยังมีเอกสารอยู่ ·
 * ทุกฟังก์ชันที่นี่เดินตาม `mergedInto` ไปตัวปลายทางก่อนเสมอ บิลเก่าที่ชี้ตัวเดิมจึงไม่ขึ้น
 * ลิงก์เสีย และบิลที่ค้างตอนรวมจะไปตัดตัวที่เก็บไว้ ไม่ใช่ตัวที่เก็บเข้ากรุ
 * (ผู้เรียกต้องส่งสต็อก "ทั้งหมด" รวมตัวที่ถูกรวมแล้ว ไม่ใช่เฉพาะที่แสดงบนจอ)
 *
 * ทั้งไฟล์เป็นฟังก์ชันบริสุทธิ์ ไม่แตะ Firestore · เทสต์ใน stockAudit.test.js
 */

import { getOrderDate } from './calculations.js';
import { resolveStockId } from './stockMerge.js';
import { applyMilkSwap } from './milkSwap.js';
import { buildFixContext, currentLineRecipe, evaluateLineFix, lineDeductions, orderMilkSwap, priorBackfill } from './stockAuditFix.js';

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** ปัดทศนิยมกันเลขลอยอย่าง 0.30000000000000004 ตอนเทียบและแสดงผล */
export const roundQty = (value) => Math.round(num(value) * 1000) / 1000;

export const LINK_STATUS = {
  OK: 'ok',
  /** ผูกแค่ผ่านตัวเลือก (เช่นเมล็ดกาแฟ) · ตัวเมนูเองไม่มีสูตร แก้ว/นม/น้ำแข็งจึงไม่ถูกตัด */
  MODIFIER_ONLY: 'modifier_only',
  /** บางลิงก์ชี้ไปสต็อกที่ถูกลบ · ตัดได้แค่บางส่วน */
  PARTIAL: 'partial',
  /** ทุกลิงก์ชี้ไปสต็อกที่ถูกลบ · ไม่ถูกตัดอะไรเลย */
  DEAD: 'dead',
  UNLINKED: 'unlinked',
};

export const STATUS_LABEL = {
  ok: 'ผูกครบ',
  modifier_only: 'ผูกแค่ตัวเลือก',
  partial: 'ลิงก์เสียบางตัว',
  dead: 'ลิงก์เสียทั้งหมด',
  unlinked: 'ยังไม่ผูกสต็อก',
};

// ลำดับความรุนแรง ใช้เลือกสถานะที่แย่ที่สุดของกลุ่ม
const SEVERITY = { ok: 0, modifier_only: 1, partial: 2, unlinked: 3, dead: 4 };
export const worstStatus = (a, b) => ((SEVERITY[b] ?? 0) > (SEVERITY[a] ?? 0) ? b : a);

/** เมนูที่ขายได้จริงตอนนี้ · ปิดขายหรือตั้งไม่นับยอดขายไม่ต้องเตือน */
export const isSellable = (item) => item?.available !== false && !item?.excludeFromSale;

/**
 * แยกลิงก์สูตรหนึ่งชุดเป็นตัวที่ยังมีสต็อกอยู่กับตัวที่สต็อกถูกลบ
 * @returns {{ status: string, alive: Array, dead: Array }}
 */
export function classifyLinks(links, stockById) {
  const valid = (Array.isArray(links) ? links : []).filter((l) => l?.stockId);
  const alive = [];
  const dead = [];
  valid.forEach((link) => {
    const stockId = resolveStockId(link.stockId, stockById);
    const stock = stockById.get(stockId);
    const row = {
      stockId,
      usage: num(link.usage),
      name: stock?.name || '',
      unit: stock?.unit || '',
    };
    (stock ? alive : dead).push(row);
  });
  let status = LINK_STATUS.OK;
  if (!valid.length) status = LINK_STATUS.UNLINKED;
  else if (!alive.length) status = LINK_STATUS.DEAD;
  else if (dead.length) status = LINK_STATUS.PARTIAL;
  return { status, alive, dead };
}

/**
 * สุขภาพการผูกสต็อกของทุกเมนู และตัวเลือก (#) ที่มีสูตร
 *
 * @param {object} input
 * @param {Array} input.menu
 * @param {Array} input.stock
 * @param {Array} [input.beanModifiers]
 * @param {boolean} [input.includeHidden] รวมเมนูที่ปิดขายด้วย (default ไม่รวม · ไม่อยากเตือนของที่ไม่ได้ขาย)
 */
export function auditMenuLinks({ menu = [], stock = [], beanModifiers = [], includeHidden = false } = {}) {
  const stockById = new Map(stock.map((s) => [s.id, s]));
  const liveModifiers = beanModifiers.filter((m) => (m?.stockLinks || []).length);

  const items = menu
    .filter((m) => includeHidden || isSellable(m))
    .map((m) => {
      const { status: ownStatus, alive, dead } = classifyLinks(m.stockLinks, stockById);
      // เมนูกาแฟบางตัวไม่มีสูตรของตัวเอง แต่ได้เมล็ดจากตัวเลือกที่ลูกค้าต้องเลือกทุกครั้ง
      // ไม่ถือว่า "ไม่ผูก" ทั้งหมด แต่แก้ว/นม/ไซรัปของเมนูจะไม่ถูกตัด จึงเตือนระดับเบากว่า
      const takesModifier = Boolean(m.allowBeanModifier || (m.modifierGroups || []).length || m.modifierGroup);
      const status = ownStatus === LINK_STATUS.UNLINKED && takesModifier && liveModifiers.length
        ? LINK_STATUS.MODIFIER_ONLY
        : ownStatus;
      return {
        id: m.id,
        name: m.name || '(ไม่มีชื่อ)',
        category: m.category || '',
        price: num(m.price),
        sellable: isSellable(m),
        soldCount: num(m.soldCount),
        status,
        alive,
        dead,
      };
    })
    .sort((a, b) => (SEVERITY[b.status] - SEVERITY[a.status]) || (b.soldCount - a.soldCount));

  const modifiers = beanModifiers
    .map((m) => {
      const { status, alive, dead } = classifyLinks(m.stockLinks, stockById);
      return { id: m.id, name: m.name || '', group: m.group || m.modifierGroup || '', status, alive, dead };
    })
    // ตัวเลือกที่ไม่มีสูตรเป็นเรื่องปกติ (เช่น "หวานน้อย") · เตือนเฉพาะที่ลิงก์เสีย
    .filter((m) => m.status === LINK_STATUS.DEAD || m.status === LINK_STATUS.PARTIAL);

  const counts = { total: items.length, ok: 0, modifier_only: 0, partial: 0, dead: 0, unlinked: 0 };
  items.forEach((i) => { counts[i.status] += 1; });
  const needsAttention = counts.unlinked + counts.dead + counts.partial;

  return { items, modifiers, counts, needsAttention };
}

/**
 * บันทึกการตัดสต็อกของบิลหนึ่งใบ เก็บลงบิลตอนกด "เสร็จ"
 * ทำให้ย้อนมาตรวจได้ว่าตัดอะไรไปจริงเท่าไหร่ ไม่ต้องเดาจากสต็อกคงเหลือ
 *
 * @param {object} [options]
 * @param {object} [options.milkSwap] นมโอ๊ตตัดแทนนมวัว (ดู milkSwap.js)
 * @returns {{ applied: Object<string, number>, skipped: Array, unlinked: Array }}
 */
export function planOrderDeduction(order, stockById, options = {}) {
  const applied = {};
  const skipped = [];
  const unlinked = [];
  (order?.items || []).forEach((item) => {
    const qty = num(item?.quantity);
    const links = applyMilkSwap(item, options.milkSwap, stockById).filter((l) => l?.stockId);
    if (!links.length) {
      if (qty > 0) unlinked.push({ name: String(item?.name || ''), quantity: qty });
      return;
    }
    links.forEach((link) => {
      const used = qty * num(link.usage);
      if (used <= 0) return;
      const stockId = resolveStockId(link.stockId, stockById);
      if (!stockById.has(stockId)) {
        skipped.push({ stockId: link.stockId, used: roundQty(used), item: String(item?.name || '') });
        return;
      }
      applied[stockId] = roundQty((applied[stockId] || 0) + used);
    });
  });
  return { applied, skipped, unlinked };
}

/**
 * แก้บิลที่ตัดสต็อกไปแล้ว (เพิ่ม/ลด/เปลี่ยนรายการ) · คิดสูตรใหม่ของทั้งบิลแล้วเทียบกับที่ตัดไว้
 * `cut[stockId]` > 0 = ตัดเพิ่ม · < 0 = คืนเข้าสต็อก · `applied` = บันทึกใหม่ของบิล
 * เดิมแก้บิลแล้วไม่ปรับสต็อกเลย ของที่เพิ่มหลังตัดไม่ถูกตัด (บิลคิว 26/31 · 2026-10-11)
 * ใช้นมโอ๊ตแทนตามบันทึกเดิมของบิล (milkSwapApplied) ให้ตรงกับหน้าตรวจ
 */
export function planEditDeduction(originalOrder, newItems, stockById, milkSwap) {
  const swap = originalOrder?.stockDeduction?.milkSwapApplied ? milkSwap : null;
  const plan = planOrderDeduction({ items: newItems }, stockById, { milkSwap: swap });
  // เทียบกับที่ตัดตอนขาย (applied) เท่านั้น · ตัดย้อนหลัง (stockBackfill) ไม่นับทั้งสองฝั่ง
  // เพราะตะกร้าตอนแก้บิลใช้ stockLinks เดิมของบิล ซึ่งไม่มีสูตรที่ตัดย้อนหลัง · stockBackfill คงไว้ในบิล
  // บิลเก่าที่ตัดแล้วแต่ไม่มีบันทึก (ก่อนมี stockDeduction) ใช้สูตรในบิลเดิมแทน กันตัดซ้ำทั้งบิล
  const before = {};
  const add = (id, used) => {
    const rid = resolveStockId(id, stockById);
    before[rid] = roundQty((before[rid] || 0) + num(used));
  };
  const recorded = originalOrder?.stockDeduction?.applied
    || planOrderDeduction(originalOrder, stockById, { milkSwap: swap }).applied;
  Object.entries(recorded).forEach(([id, used]) => add(id, used));
  const cut = {};
  new Set([...Object.keys(before), ...Object.keys(plan.applied)]).forEach((id) => {
    const d = roundQty((plan.applied[id] || 0) - (before[id] || 0));
    if (d !== 0 && stockById.has(id)) cut[id] = d;
  });
  return { cut, applied: plan.applied, skipped: plan.skipped, unlinked: plan.unlinked, milkSwapApplied: Boolean(swap) };
}

/** ปุ่มแก้ของข้อที่ยังเปิดอยู่ · ลิงก์เสียในตัวเลือก → ไปแก้ตัวเลือก · เมนูถูกลบ → ไปตรวจนับ */
function fixTarget(recipe, menuId) {
  if (!recipe?.menu) return { kind: 'count' };
  const menuDead = recipe.dead.some((d) => d.source === 'menu');
  const modDead = recipe.dead.find((d) => d.source === 'modifier');
  if (modDead && !menuDead) return { kind: 'modifier', modifierId: modDead.modifierId, modifierName: modDead.modifierName };
  return { kind: 'menu', menuId: recipe.menu.id || menuId };
}

const orderTime = (order) => {
  if (order?.time) return String(order.time);
  const s = order?.createdAt?.seconds;
  if (!s) return '';
  const d = new Date(s * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * สรุปรายการที่ขายได้ + สต็อกที่ถูกตัด + ผลตรวจความถูกต้อง ของวันเดียว
 *
 * @param {object} input
 * @param {Array} input.orders ทุกบิล (กรองวันในนี้)
 * @param {Array} input.stock สต็อกปัจจุบัน
 * @param {Array} [input.menu] ใช้บอกว่าเมนูที่ไม่ได้ผูกในบิล ตอนนี้ผูกแล้วหรือยัง
 * @param {string} input.date YYYY-MM-DD
 * @param {object} [input.milkSwap] นมโอ๊ตตัดแทนนมวัว (ดู milkSwap.js)
 * @param {Array} [input.beanModifiers] ตัวเลือก (#) ปัจจุบัน · ใช้ดูว่าแก้สูตรแล้วหรือยัง (stockAuditFix.js)
 *
 * ทุกข้อใน `issues` มี `state`:
 * - 'open' ยังต้องแก้
 * - 'fixed_pending_backfill' แก้สูตรแล้ว แต่บิลที่ขายไปยังตัดขาด · กด "ตัดสต็อกที่ขาดย้อนหลัง"
 * - 'resolved' เรียบร้อยแล้ว (ตัดย้อนหลังแล้ว / ตอนขายตัดครบ / นับสต็อกแล้ว)
 * ผลตัดสิน (verdict) และความแม่นยำ (`accuracy`) ดูเฉพาะข้อที่ยังไม่เรียบร้อย ·
 * `accuracyBefore` = ความแม่นยำตามบิลเดิมก่อนแก้ ไว้โชว์ "ก่อนแก้ 76% → หลังตัดย้อนหลัง 100%"
 */
export function auditDay({ orders = [], stock = [], menu = [], date, milkSwap, beanModifiers = [] } = {}) {
  const stockById = new Map(stock.map((s) => [s.id, s]));
  const menuById = new Map(menu.map((m) => [m.id, m]));
  const menuByName = new Map(menu.map((m) => [String(m.name || '').trim(), m]));
  const fixCtx = buildFixContext({ stock, menu, beanModifiers, milkSwap });

  const dayOrders = orders
    .filter((o) => getOrderDate(o) === date && o.status !== 'cancelled')
    // ยอดขายย้อนหลังที่แอดมินคีย์เป็นก้อน ไม่มีรายการเมนูจริง ไม่เกี่ยวกับสต็อก
    .filter((o) => !o.isBackdated);

  const soldByKey = new Map();
  const usageByStock = new Map();
  const issues = [];
  const summary = {
    date,
    bills: dayOrders.length,
    completed: 0,
    waiting: 0,
    units: 0,
    revenue: 0,
    unitsOk: 0,
    unitsModifierOnly: 0,
    unitsUnlinked: 0,
    unitsDead: 0,
    unitsPartial: 0,
    billsMissed: 0,
    billsMismatch: 0,
    billsRecorded: 0,
    cost: 0,
    unitsAccurate: 0,
  };

  const addIssue = (issue) => issues.push(issue);
  const itemIssues = new Map();

  dayOrders.forEach((order) => {
    const completed = order.status === 'completed';
    const deducted = completed && Boolean(order.stockDeducted);
    // บิลที่ตัดไปแล้วโดยไม่มีป้าย milkSwapApplied = ตัดก่อนมีระบบนมโอ๊ต (ตัดนมวัวจริง)
    // ตรวจตามกติกาตอนตัด ไม่งั้นบิลนมโอ๊ตเก่าขึ้น "ตัดไม่ตรงสูตร" ทั้งที่ระบบทำตามกติกาสมัยนั้น
    const orderSwap = orderMilkSwap(order, milkSwap);
    let deductions = null; // lineDeductions ของบิลนี้ · คำนวณเมื่อมีบรรทัดที่มีปัญหาเท่านั้น
    let prior = null;
    if (completed) summary.completed += 1; else summary.waiting += 1;

    const lines = order.items || [];
    const lineSum = lines.reduce((s, it) => s + num(it?.price) * (num(it?.quantity) || 1), 0);
    const billTotal = num(order.total);
    // ปันส่วนลดระดับบิลลงรายการตามสัดส่วนราคา · กฎเดียวกับ menuInsights
    const ratio = lineSum > 0 && billTotal > 0 ? billTotal / lineSum : 1;

    const bill = { orderId: order.id, queueNumber: order.queueNumber ?? null, time: orderTime(order) };

    if (completed && !order.stockDeducted) {
      summary.billsMissed += 1;
      addIssue({
        severity: 'error',
        type: 'bill_not_deducted',
        ...bill,
        state: 'open',
        fix: { kind: 'deduct_bill', orderId: order.id },
        message: 'บิลเสร็จแล้วแต่ไม่ถูกตัดสต็อก',
      });
    }

    lines.forEach((item, index) => {
      const qty = num(item?.quantity) || 1;
      const name = String(item?.name || 'ไม่ระบุ');
      const modifier = String(item?.beanModifier || '').trim();
      const key = `${item?.id || name}::${modifier}`;
      const { status: rawStatus, alive, dead } = classifyLinks(applyMilkSwap(item, orderSwap, stockById), stockById);
      const currentMenu = menuById.get(item?.id) || menuByName.get(name.trim());
      // สูตรในบิลมีแต่ของจากตัวเลือก (เมล็ด) · ตัวเมนูเองไม่มีสูตร แก้ว/นม/ไซรัปจึงไม่ถูกตัด
      // ตอนขายเมนูไม่มีสูตร: ตอนนี้เมนูยังไม่มีสูตร หรือสูตรในบิลมีแต่ของจากตัวเลือกล้วนๆ
      // (เมนูเพิ่งผูกทีหลัง · ยังต้องตัดแก้ว/นมย้อนหลัง)
      const recipe = rawStatus === LINK_STATUS.OK && modifier && currentMenu ? currentLineRecipe(item, fixCtx) : null;
      const menuHadNone = Boolean(recipe) && (
        (!(currentMenu.stockLinks || []).length && !(currentMenu.stockLinkId))
        || (recipe.modifiers.length > 0 && alive.every((l) => recipe.modifiers.some((m) => (m.stockLinks || [])
          .some((ml) => ml?.stockId && resolveStockId(ml.stockId, stockById) === l.stockId))))
      );
      const status = menuHadNone ? LINK_STATUS.MODIFIER_ONLY : rawStatus;
      let lineFix = null;
      if (status !== LINK_STATUS.OK) {
        if (!deductions) {
          deductions = lineDeductions(order, stockById, milkSwap);
          prior = priorBackfill(order, stockById);
        }
        lineFix = evaluateLineFix(order, index, fixCtx, {
          requireMenuLinks: status === LINK_STATUS.UNLINKED || status === LINK_STATUS.MODIFIER_ONLY,
          deductions,
          prior,
        });
      }
      // แก้แล้ว (ตัดครบ/ตัดย้อนหลังแล้ว) หรือบิลยังไม่ตัด (รอตัดตอนเสร็จ) นับว่าตรงสูตร
      if (status === LINK_STATUS.OK || status === LINK_STATUS.MODIFIER_ONLY
        || lineFix?.state === 'resolved' || lineFix?.state === 'not_deducted') summary.unitsAccurate += qty;

      summary.units += qty;
      summary.revenue += num(item?.price) * qty * ratio;
      if (status === LINK_STATUS.OK) summary.unitsOk += qty;
      else if (status === LINK_STATUS.MODIFIER_ONLY) summary.unitsModifierOnly += qty;
      else if (status === LINK_STATUS.UNLINKED) summary.unitsUnlinked += qty;
      else if (status === LINK_STATUS.DEAD) summary.unitsDead += qty;
      else if (status === LINK_STATUS.PARTIAL) summary.unitsPartial += qty;

      const prev = soldByKey.get(key) || {
        key,
        menuId: item?.id || currentMenu?.id || null,
        name,
        modifier,
        category: item?.category || currentMenu?.category || '',
        quantity: 0,
        revenue: 0,
        bills: 0,
        status: LINK_STATUS.OK,
        stock: new Map(),
        deadLinks: 0,
        deadOrders: [],
        menuLinkedNow: currentMenu ? (currentMenu.stockLinks || []).length > 0 : null,
      };
      prev.quantity += qty;
      prev.revenue += num(item?.price) * qty * ratio;
      prev.bills += 1;
      prev.status = worstStatus(prev.status, status);
      prev.deadLinks += dead.length;
      if (dead.length && !prev.deadOrders.includes(order.id)) prev.deadOrders.push(order.id);
      alive.forEach((link) => {
        const row = prev.stock.get(link.stockId) || { ...link, perUnit: link.usage, total: 0 };
        row.total += link.usage * qty;
        prev.stock.set(link.stockId, row);
      });
      soldByKey.set(key, prev);

      // สต็อกที่ควรถูกตัดของวันนี้ · นับเฉพาะบิลที่ตัดไปแล้วจริง บิลค้างยังไม่ควรขยับสต็อก
      if (deducted) {
        alive.forEach((link) => {
          const s = stockById.get(link.stockId);
          const row = usageByStock.get(link.stockId) || {
            stockId: link.stockId,
            name: s?.name || '',
            unit: s?.unit || '',
            used: 0,
            onHand: num(s?.quantity),
            minQuantity: num(s?.minQuantity),
            unitCost: num(s?.unitCost),
            items: new Map(),
          };
          const used = link.usage * qty;
          row.used += used;
          row.items.set(name, (row.items.get(name) || 0) + qty);
          usageByStock.set(link.stockId, row);
        });
      }

      if (status !== LINK_STATUS.OK) {
        // รวมตามเมนู ไม่ใช่ตามบรรทัด · ถั่วขาย 5 บิลควรเป็นคำเตือนเดียว "×5 ใน 5 บิล"
        const type = status === LINK_STATUS.UNLINKED ? 'item_unlinked'
          : status === LINK_STATUS.MODIFIER_ONLY ? 'item_modifier_only' : 'item_dead_link';
        const ikey = `${type}::${name}`;
        const agg = itemIssues.get(ikey) || {
          severity: status === LINK_STATUS.MODIFIER_ONLY ? 'info'
            : status === LINK_STATUS.PARTIAL || status === LINK_STATUS.UNLINKED ? 'warn' : 'error',
          type,
          status,
          item: name,
          menuId: currentMenu?.id || item?.id || null,
          fixedNow: false,
          deadCount: 0,
          quantity: 0,
          bills: [],
          lines: [],
          fix: null,
        };
        agg.quantity += qty;
        agg.lines.push({
          orderId: order.id,
          index,
          quantity: qty,
          state: lineFix.state,
          missing: lineFix.missing,
          covered: lineFix.covered || null,
          requireMenuLinks: status === LINK_STATUS.UNLINKED || status === LINK_STATUS.MODIFIER_ONLY,
        });
        if (lineFix.state === 'open' && !agg.fix) agg.fix = fixTarget(lineFix.recipe, currentMenu?.id || item?.id || null);
        agg.deadCount = Math.max(agg.deadCount, dead.length);
        agg.status = worstStatus(agg.status, status);
        if (agg.status === LINK_STATUS.DEAD) agg.severity = 'error';
        agg.bills.push(bill);
        itemIssues.set(ikey, agg);
      }
    });

    // บิลที่ตัดหลังมีบันทึก · เทียบของที่ตัดจริงกับที่สูตรบอกทีละวัตถุดิบ
    const record = order.stockDeduction;
    if (deducted && record && record.applied) {
      summary.billsRecorded += 1;
      const expected = planOrderDeduction(order, stockById, { milkSwap: orderSwap }).applied;
      // บิลที่ตัดก่อนรวมสต็อกบันทึก id เดิมไว้ · แปลงไปตัวปลายทางก่อนเทียบ
      const recorded = {};
      Object.entries(record.applied).forEach(([id, used]) => {
        const rid = resolveStockId(id, stockById);
        recorded[rid] = (recorded[rid] || 0) + num(used);
      });
      const ids = new Set([...Object.keys(expected), ...Object.keys(recorded)]);
      const diffs = [];
      ids.forEach((id) => {
        const want = roundQty(expected[id] || 0);
        const got = roundQty(recorded[id] || 0);
        // สต็อกที่ตอนนี้ถูกลบไปแล้ว ถือว่าตอนตัดยังอยู่ ไม่นับเป็นความคลาดเคลื่อน
        if (want !== got && stockById.has(id)) {
          diffs.push({ stockId: id, name: stockById.get(id)?.name || id, expected: want, applied: got });
        }
      });
      if (diffs.length) {
        summary.billsMismatch += 1;
        // นับสต็อกของจริงหลังบิลนี้ครบทุกตัวที่คลาด = ยอดในระบบถูกแก้ด้วยการนับแล้ว
        const at = String(record.at || '');
        const counted = Boolean(at) && diffs.every((d) => String(stockById.get(d.stockId)?.lastCountedAt || '') > at);
        addIssue({
          severity: 'error',
          type: 'bill_mismatch',
          ...bill,
          diffs,
          state: counted ? 'resolved' : 'open',
          fix: { kind: 'count', stockId: diffs[0].stockId },
          message: `ตัดสต็อกไม่ตรงสูตร ${diffs.length} รายการ`,
        });
      }
    }
  });

  itemIssues.forEach((agg) => {
    const states = agg.lines.map((l) => l.state);
    agg.state = states.includes('open') ? 'open'
      : states.includes('needs_backfill') ? 'fixed_pending_backfill' : 'resolved';
    agg.fixedNow = agg.state !== 'open';
    agg.missingUnits = agg.lines.filter((l) => l.state === 'needs_backfill').reduce((s, l) => s + l.quantity, 0);
    const where = agg.bills.length > 1 ? ` ใน ${agg.bills.length} บิล` : '';
    let message;
    if (agg.type === 'item_unlinked') {
      message = agg.fixedNow
        ? `${agg.item} ×${agg.quantity}${where} ไม่ถูกตัดสต็อก · ตอนขายยังไม่ผูก (ตอนนี้ผูกแล้ว)`
        : `${agg.item} ×${agg.quantity}${where} ไม่ถูกตัดสต็อก เพราะเมนูยังไม่ผูกสต็อก`;
    } else if (agg.type === 'item_modifier_only' && agg.fixedNow) {
      message = `${agg.item} ×${agg.quantity}${where} ตัดแค่ตัวเลือก · ตอนขายเมนูยังไม่มีสูตร (ตอนนี้ผูกแล้ว)`;
    } else if (agg.type === 'item_modifier_only') {
      message = `${agg.item} ×${agg.quantity}${where} ตัดแค่ตัวเลือก (เช่นเมล็ด) · ตัวเมนูยังไม่มีสูตร แก้ว/นมไม่ถูกตัด`;
    } else if (agg.status === LINK_STATUS.DEAD) {
      message = `${agg.item} ×${agg.quantity}${where} ไม่ถูกตัดเลย · สูตรชี้ไปสต็อกที่ถูกลบแล้ว`;
    } else {
      message = `${agg.item} ×${agg.quantity}${where} ตัดไม่ครบ · ${agg.deadCount} วัตถุดิบในสูตรถูกลบไปแล้ว`;
    }
    const first = agg.bills[0] || {};
    addIssue({ ...agg, time: first.time || '', queueNumber: first.queueNumber ?? null, orderId: first.orderId, message });
  });

  const sold = [...soldByKey.values()]
    .map((row) => ({ ...row, stock: [...row.stock.values()].map((s) => ({ ...s, total: roundQty(s.total) })) }))
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);

  const stockUsed = [...usageByStock.values()]
    .map((row) => {
      const used = roundQty(row.used);
      return {
        ...row,
        used,
        cost: used * row.unitCost,
        items: [...row.items.entries()].map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity),
        negative: row.onHand < 0,
        low: row.onHand >= 0 && row.minQuantity > 0 && row.onHand <= row.minQuantity,
      };
    })
    .sort((a, b) => b.cost - a.cost || b.used - a.used);

  summary.cost = stockUsed.reduce((s, r) => s + r.cost, 0);
  summary.revenue = Math.round(summary.revenue * 100) / 100;

  stockUsed.filter((r) => r.negative).forEach((r) => addIssue({
    severity: 'warn',
    type: 'stock_negative',
    stockId: r.stockId,
    item: r.name,
    state: 'open',
    fix: { kind: 'count', stockId: r.stockId },
    message: `${r.name} คงเหลือติดลบ (${roundQty(r.onHand)} ${r.unit}) · ของเข้ายังไม่ได้ลง หรือสูตรใช้เกินจริง`,
  }));

  // ความแม่นยำ = สัดส่วนหน่วยที่ขายแล้วตัดสต็อกได้ตามสูตรที่ร้านตั้งไว้
  // (ผูกแค่ตัวเลือกนับว่าตัดตามสูตร · แจ้งแยกเป็นข้อสังเกต ไม่ลดคะแนน)
  // accuracyBefore = ตามบิลเดิม · accuracy = หลังนับบรรทัดที่แก้แล้ว/ตัดย้อนหลังแล้วว่าตรงสูตร
  const accuracyBefore = summary.units > 0 ? (summary.unitsOk + summary.unitsModifierOnly) / summary.units : 1;
  const accuracy = summary.units > 0 ? Math.min(1, summary.unitsAccurate / summary.units) : 1;
  const open = issues.filter((i) => i.state === 'open');
  const pending = issues.filter((i) => i.state === 'fixed_pending_backfill');
  const errors = open.filter((i) => i.severity === 'error').length;
  // แก้สูตรแล้วแต่ยังไม่ตัดย้อนหลัง · สต็อกยังขาดอยู่จริง วันนั้นยังเป็น "warn"
  const warnings = open.filter((i) => i.severity === 'warn').length + pending.length;
  const verdict = summary.bills === 0 ? 'empty' : errors > 0 ? 'bad' : warnings > 0 ? 'warn' : 'ok';
  const openCount = open.filter((i) => i.severity !== 'info').length + pending.length;
  const resolvedCount = issues.filter((i) => i.state === 'resolved').length;

  const STATE_ORDER = { open: 0, fixed_pending_backfill: 1, resolved: 2 };
  const order = { error: 0, warn: 1, info: 2 };
  issues.sort((a, b) => (STATE_ORDER[a.state] - STATE_ORDER[b.state])
    || (order[a.severity] - order[b.severity]) || String(a.time).localeCompare(String(b.time)));

  return {
    summary: { ...summary, accuracy, accuracyBefore, errors, warnings, verdict, openCount, pendingCount: pending.length, resolvedCount },
    sold,
    stockUsed,
    issues,
  };
}

/**
 * สรุปหลายวันแบบย่อ · ใช้ทำแถบ "7 วันล่าสุด ตัดถูกไหม"
 * @param {string[]} dates
 */
export function auditDays({ orders = [], stock = [], menu = [], dates = [], milkSwap, beanModifiers = [] } = {}) {
  return dates.map((date) => {
    const { summary } = auditDay({ orders, stock, menu, date, milkSwap, beanModifiers });
    return {
      date,
      bills: summary.bills,
      units: summary.units,
      revenue: summary.revenue,
      accuracy: summary.accuracy,
      errors: summary.errors,
      warnings: summary.warnings,
      verdict: summary.verdict,
    };
  });
}

/** สต็อกที่คงเหลือติดลบทั้งหมด · สัญญาณว่าตัวเลขในระบบไม่ตรงของจริง */
export function negativeStock(stock = []) {
  return stock.filter((s) => num(s.quantity) < 0).map((s) => ({ id: s.id, name: s.name, unit: s.unit, quantity: num(s.quantity) }));
}
