import { inferStockCategory } from '../../../src/config/constants.js';
import { normalizeUnit, roundMoney } from '../../../src/utils/stockIntake.js';

export function inferExpenseCategory(title) {
  const value = String(title || '').toLocaleLowerCase('th');
  const rules = [
    ['ค่าไฟ', ['ไฟ', 'ค่าไฟ']], ['ค่าน้ำแข็ง', ['น้ำแข็ง']],
    ['ค่าแรง', ['ค่าแรง', 'เงินเดือน', 'ค่าจ้าง']], ['ค่าเช่า', ['ค่าเช่า']],
    ['การตลาด', ['โฆษณา', 'ads', 'บูสต์']], ['อุปกรณ์', ['อุปกรณ์']],
  ];
  const expense = rules.find(([, words]) => words.some(w => value.includes(w)))?.[0];
  if (expense) return expense;
  // ค่าปริยายของแอปไม่ใช่หลักฐานว่าเป็นสินค้าคงคลัง ต้องให้คนเลือกเอง
  const stock = inferStockCategory(title);
  return stock === 'อื่น ๆ' ? null : stock;
}
export const MANUAL_FORMATS = 'รายจ่าย ชื่อ จำนวน หน่วย ยอด [บาท]\nรายจ่าย ชื่อ | จำนวน | หน่วย | ยอด\nรายจ่าย ชื่อ ยอด [บาท]\nหลายรายการ: ขึ้นหัว รายจ่าย แล้วเขียนทีละบรรทัด';
export function parseManualExpense(text) {
  const value = String(text || '').trim().replace(/\s*บาท\s*$/, '').trim();
  // รับเครื่องหมายเข้ารูปแบบเต็มก่อน แล้วตรวจค่าทีหลัง ไม่ให้จำนวนติดลบกลายเป็นส่วนของชื่อ
  const number = '(-?\\d[\\d,]*(?:\\.\\d+)?)';
  let parts;
  if (value.includes('|')) {
    parts = value.split('|').map(s => s.trim());
    if (parts.length !== 4) return null;
  } else {
    const full = value.match(new RegExp(`^(.+?)\\s+${number}\\s+(\\S+)\\s+${number}$`));
    if (full) parts = full.slice(1);
    else {
      const short = value.match(new RegExp(`^(.+?)\\s+${number}$`));
      if (!short) return null;
      parts = [short[1], '1', 'ครั้ง', short[2]];
    }
  }
  const [title, qty, unit, total] = parts;
  const numeric = s => /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s) ? Number(s.replace(/,/g, '')) : NaN;
  const quantity = numeric(qty), amount = numeric(total);
  if (!title || !unit || !Number.isFinite(quantity) || !Number.isFinite(amount) || quantity <= 0 || roundMoney(amount) <= 0) return null;
  return { title: title.slice(0, 120), quantity, unit: normalizeUnit(unit), amount: roundMoney(amount), category: inferExpenseCategory(title) };
}
export function parseManualExpenses(text) {
  if (!/^รายจ่าย(?:\s|$)/.test(String(text).trim())) return null;
  const rows = String(text).trim().replace(/^รายจ่าย\s*/, '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const lines = rows.map(parseManualExpense);
  return lines.length && lines.every(Boolean) ? lines : null;
}
export function parseEdit(text, length) {
  const match = String(text).trim().match(/^แก้ไข\s+(\d+)\s+(.+)$/);
  if (!match) return null;
  const lineIdx = Number(match[1]) - 1, line = parseManualExpense(match[2]);
  return line && lineIdx >= 0 && lineIdx < length ? { lineIdx, line } : null;
}
export function parseCallback(data) {
  const match = String(data || '').match(/^(?:([cxre]):([a-z0-9]{8})|([sk]):([a-z0-9]{8}):(\d+):(\d+|new|skip))$/);
  if (!match || new TextEncoder().encode(data).length > 64) return null;
  const action = match[1] || match[3];
  if (action === 'k' && !/^\d+$/.test(match[6])) return null;
  return { action, batchId: match[2] || match[4], ...(match[3] ? { lineIdx: Number(match[5]), pick: match[6] } : {}) };
}
export const bangkokISODate = (now = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
export function expenseDate(receiptDate, now) {
  const today = bangkokISODate(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receiptDate || '')) return today;
  const stamp = Date.parse(`${receiptDate}T00:00:00Z`);
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== receiptDate) return today;
  const age = (Date.parse(today) - stamp) / 86400000;
  return age >= 0 && age <= 14 ? receiptDate : today;
}
