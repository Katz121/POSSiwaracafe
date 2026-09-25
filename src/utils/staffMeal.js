/**
 * เจ้าของ/พนักงานกินจากหน้าขาย (POS cart)
 *
 * ปัญหาเดิม: ชีต WasteSheet ในหน้าจัดการเมนูตัดสต็อกจากสูตรของ "เมนูเปล่า" เท่านั้น
 * เครื่องดื่มที่มีตัวเลือก ("#" เช่น เมล็ด มัทฉะ นม ความหวาน) จึงตัดไม่ครบ เพราะสูตร
 * ของตัวเลือกถูกรวมเข้าบรรทัดตะกร้าแล้วตอนกด (ดู mergeStockLinks ใน posCart.js)
 * วิธีแก้คือให้พนักงานกดของลงตะกร้าเหมือนขายปกติ แล้วเรียกฟังก์ชันนี้กับ
 * toOrderItems(cart) ตรงๆ สูตรที่รวมมาแล้วจึงถูกตัดครบเหมือนบิลขายจริง
 *
 * ห้ามเขียนตัววางแผนตัดสต็อกขึ้นมาใหม่: ใช้ planOrderDeduction เจ้าเดียวกับตอน
 * ปิดบิลขายจริง เพื่อให้ของที่ตัดตอนพนักงานกินตรงกับของที่ตัดตอนขายทุกประการ
 * (รวมกฎนมโอ๊ตตัดแทนนมวัวที่ส่งผ่าน milkSwap มาด้วย)
 *
 * กฎบัญชีเดียวกับของเสีย (ดู wastage.js): ตีมูลค่าด้วยราคาทุน (unitCost) ห้ามใช้
 * ราคาขาย เพราะราคาขายมีกำไรที่ไม่เคยเกิดขึ้นจริงปนอยู่ · บันทึกเป็นรายจ่ายหมวด
 * STAFF_MEAL_CATEGORY (อยู่ใน NON_CASH_EXPENSE_CATEGORIES คือจ่ายไปแล้วตอนซื้อ
 * วัตถุดิบ ไม่ใช่เงินไหลออก) · ไม่สร้างบิลขาย ไม่นับยอดขาย ไม่ให้แต้มสมาชิก
 *
 * ทั้งไฟล์เป็นฟังก์ชันบริสุทธิ์ ไม่แตะ React/Firestore · เทสต์ใน staffMeal.test.js
 */

import { planOrderDeduction } from './stockAudit.js';
import { roundMoney } from './stockIntake.js';

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** ข้อความอธิบายใต้ชีต บอกพนักงานว่าปุ่มนี้ทำอะไรกับสต็อกและบัญชี */
export const STAFF_MEAL_NOTE = 'ตัดสต็อกตามสูตร · ลงรายจ่ายตามราคาทุน · ไม่นับเป็นยอดขาย';

/**
 * ชื่อตัวเลือก '#' ของบรรทัดตะกร้า · บรรทัดจริงจาก toOrderItems เก็บไว้ใน
 * `beanModifier` (posCart.js ตั้งชื่อตัวแปรตอนสร้างว่า modifierName) ส่วน
 * `modifierName` รองรับเผื่อผู้เรียกส่งมาในชื่อนั้นโดยตรง
 */
const lineModifierName = (item) => item?.modifierName ?? item?.beanModifier ?? '';

/**
 * วางแผนตัดสต็อก + ตีมูลค่าทุน + เตรียมข้อความลงรายจ่าย ของเจ้าของ/พนักงานกิน
 *
 * @param {Array} items   order lines (toOrderItems(cart)) · stockLinks ของแต่ละ
 *                        บรรทัดรวมสูตรตัวเลือกมาแล้ว ไม่ต้องรวมซ้ำ
 * @param {Map} stockById Map ของเอกสารสต็อก (มี unitCost)
 * @param {object} [options] { milkSwap } ก้อนเดียวกับที่ App ส่งให้ planOrderDeduction
 * @returns {{ applied: object, skipped: Array, unlinked: Array, cost: number, lines: Array, title: string }}
 */
export function planStaffMeal(items, stockById, options = {}) {
  const list = Array.isArray(items) ? items : [];
  // applied/skipped/unlinked คืนตามที่ planner กลางคำนวณได้เลย ไม่ตีความซ้ำ
  const plan = planOrderDeduction({ items: list }, stockById, options);

  // applied ชี้ id สต็อกปลายทางที่ยังมีชีวิตแล้ว (resolveStockId ข้างใน planner)
  // จึงคูณ unitCost ได้ตรง ไม่ต้องตาม mergedInto เอง
  let raw = 0;
  Object.entries(plan.applied).forEach(([stockId, used]) => {
    raw += num(used) * num(stockById.get(stockId)?.unitCost);
  });
  const cost = roundMoney(raw);

  // เก็บแค่พอแสดงผลและพอตรวจย้อนหลังบนรายจ่าย · modifierName ใส่เฉพาะบรรทัดที่มี
  const lines = list.map((item) => {
    const line = { name: String(item?.name || ''), quantity: num(item?.quantity) };
    const modifierName = lineModifierName(item);
    if (modifierName) line.modifierName = String(modifierName);
    return line;
  });

  let title = `เจ้าของ/พนักงานกิน: ${lines.map((l) => `${l.name}${l.modifierName ? ` ${l.modifierName}` : ''} x${l.quantity}`).join(', ')}`;
  if (title.length > 120) title = `${title.slice(0, 119)}…`;

  return { applied: plan.applied, skipped: plan.skipped, unlinked: plan.unlinked, cost, lines, title };
}
