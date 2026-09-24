/**
 * ปุ่มแก้ในแท็บ "ต้องแก้" ที่เขียน Firestore · ทำใน runTransaction เดียวเสมอ อ่านบิลสดก่อนคำนวณ
 *
 * - runBackfillTransaction: ตัดสต็อกที่ขาดย้อนหลัง (หลังแก้สูตร) · บันทึกลงบิลที่ `stockBackfill`
 *   คำนวณซ้ำจากบิลที่อ่านใน transaction ทุกครั้ง กดซ้ำ/สองเครื่องพร้อมกันก็ไม่ตัดซ้ำ
 * - runDeductBillTransaction: บิลเสร็จแต่ไม่ถูกตัด → ตัดตามสูตรในบิล เหมือน App.updateStatus ทุกอย่าง
 */
import { arrayUnion, doc, increment, runTransaction } from 'firebase/firestore';
import { backfillStockTotals, buildFixContext, planBackfill } from './stockAuditFix.js';
import { planOrderDeduction } from './stockAudit.js';

const dataDoc = (db, appId, col, id) => doc(db, 'artifacts', appId, 'public', 'data', col, id);

/**
 * @param {Array<{orderId, index, requireMenuLinks}>} lineRefs จาก issue.lines ที่ state = needs_backfill
 * @param {{stock, menu, beanModifiers, milkSwap}} data ข้อมูลปัจจุบันจาก context (สูตร/ตัวเลือก)
 * @returns {Promise<{orders: number, totals: Object<string, number>}>}
 */
export async function runBackfillTransaction(db, appId, lineRefs, data, by = '') {
  const orderIds = [...new Set((lineRefs || []).map((r) => r.orderId).filter(Boolean))];
  if (!orderIds.length) return { orders: 0, totals: {} };
  return runTransaction(db, async (tx) => {
    const snaps = await Promise.all(orderIds.map((id) => tx.get(dataDoc(db, appId, 'orders', id))));
    const fresh = new Map();
    snaps.forEach((snap, i) => {
      if (snap.exists()) fresh.set(orderIds[i], { id: orderIds[i], ...snap.data() });
    });
    const ctx = buildFixContext(data);
    const plan = planBackfill(lineRefs, fresh, ctx);

    // สต็อกปลายทางต้องยังอยู่จริง (ไม่ถูกลบ/รวม) ตอนเขียน
    const wanted = Object.keys(backfillStockTotals(plan));
    const stockSnaps = await Promise.all(wanted.map((id) => tx.get(dataDoc(db, appId, 'stock', id))));
    const usable = new Set(wanted.filter((id, i) => stockSnaps[i].exists() && !stockSnaps[i].data()?.mergedInto));

    const at = new Date().toISOString();
    const totals = {};
    let count = 0;
    plan.orders.forEach((o) => {
      const lines = o.lines
        .map((l) => ({
          itemKey: l.itemKey,
          name: l.name,
          applied: Object.fromEntries(Object.entries(l.applied).filter(([id]) => usable.has(id))),
        }))
        .filter((l) => Object.keys(l.applied).length);
      if (!lines.length) return;
      lines.forEach((l) => Object.entries(l.applied).forEach(([id, qty]) => {
        totals[id] = Math.round(((totals[id] || 0) + qty) * 1000) / 1000;
      }));
      tx.update(dataDoc(db, appId, 'orders', o.orderId), { stockBackfill: arrayUnion({ at, by, lines }) });
      count += 1;
    });
    Object.entries(totals).forEach(([id, qty]) => {
      tx.update(dataDoc(db, appId, 'stock', id), { quantity: increment(-qty) });
    });
    return { orders: count, totals };
  });
}

/**
 * ตัดสต็อกบิลที่เสร็จแล้วแต่ไม่ถูกตัด · บันทึกแบบเดียวกับ App.updateStatus
 * @returns {Promise<object|null>} แผนที่ตัด หรือ null ถ้าบิลไม่อยู่ในสภาพที่ตัดได้แล้ว
 */
export async function runDeductBillTransaction(db, appId, orderId, stock, milkSwap, by = '') {
  return runTransaction(db, async (tx) => {
    const ref = dataDoc(db, appId, 'orders', orderId);
    const snap = await tx.get(ref);
    if (!snap.exists()) return null;
    const order = { id: orderId, ...snap.data() };
    if (order.status !== 'completed' || order.stockDeducted) return null;
    const stockById = new Map((stock || []).map((s) => [s.id, s]));
    const plan = planOrderDeduction(order, stockById, { milkSwap });
    Object.entries(plan.applied).forEach(([stockId, used]) => {
      tx.update(dataDoc(db, appId, 'stock', stockId), { quantity: increment(-used) });
    });
    tx.update(ref, {
      stockDeducted: true,
      stockDeduction: {
        at: new Date().toISOString(),
        by,
        applied: plan.applied,
        skipped: plan.skipped,
        unlinked: plan.unlinked,
        milkSwapApplied: Boolean(milkSwap),
      },
    });
    return plan;
  });
}
