import { getStockCategory, inferStockCategory, INVENTORY_CATEGORIES } from '../config/constants.js';

// หมวดรายจ่ายที่ไม่ใช่ของเข้าคลัง ดูจากชื่อ · ใช้ทั้งแอปและบอท Telegram (เดิมอยู่ใน api-proxy)
// น้ำแข็ง = ค่าใช้จ่ายร้าน ไม่ตัดต่อแก้ว ไม่นับสต็อก (วาเลือก 2026-10-11)
const EXPENSE_RULES = [
  ['ค่าไฟ', ['ไฟ', 'ค่าไฟ']], ['ค่าน้ำแข็ง', ['น้ำแข็ง']],
  ['ค่าแรง', ['ค่าแรง', 'เงินเดือน', 'ค่าจ้าง']], ['ค่าเช่า', ['ค่าเช่า']],
  ['การตลาด', ['โฆษณา', 'ads', 'บูสต์']], ['อุปกรณ์', ['อุปกรณ์']],
];

/** หมวดค่าใช้จ่ายร้าน (ไม่ใช่วัตถุดิบ) จากชื่อ · ไม่เข้ากฎ = null */
export function inferOperatingCategory(title) {
  const value = String(title || '').toLocaleLowerCase('th');
  return EXPENSE_RULES.find(([, words]) => words.some((w) => value.includes(w)))?.[0] || null;
}

export function inferExpenseCategory(title) {
  const expense = inferOperatingCategory(title);
  if (expense) return expense;
  // ค่าปริยายของแอปไม่ใช่หลักฐานว่าเป็นสินค้าคงคลัง ต้องให้คนเลือกเอง
  const stock = inferStockCategory(title);
  return stock === 'อื่น ๆ' ? null : stock;
}

/**
 * หมวดที่แสดงของรายจ่าย · ซื้อของเข้าคลังที่ลงสต็อกแล้ว (stockId) ใช้หมวดของสต็อกตัวนั้น
 * รายจ่ายเก่าที่บันทึกเป็น "วัตถุดิบ" รวมๆ จะได้ตรงกับหน้าสต็อก · ค่าใช้จ่ายร้านคงหมวดเดิม
 */
export function expenseCategoryOf(expense, stockById) {
  const own = expense?.category || 'อื่น ๆ';
  const item = expense?.stockId ? stockById?.get(expense.stockId) : null;
  if (!item || !INVENTORY_CATEGORIES.includes(own)) return own;
  const stockCat = getStockCategory(item);
  return INVENTORY_CATEGORIES.includes(stockCat) ? stockCat : own;
}
