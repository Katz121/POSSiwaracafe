import { describe, expect, it } from 'vitest';
import { expenseCategoryOf, inferExpenseCategory, inferOperatingCategory } from './expenseCategory';
import { buildExpenseRecord, planStockIntake } from './stockIntake';
import { applyExpenseTitle } from '../components/views/inventory/expenseModel';
import { inferStockCategory } from '../config/constants';

describe('หมวดรายจ่ายตรงกับสต็อก', () => {
  const syrup = { id: 's1', name: 'ไซรัปส้ม', unit: 'มล.', quantity: 0, unitCost: 0, category: 'ไซรัป/ซอส/ท็อปปิ้ง' };
  const stockById = new Map([[syrup.id, syrup]]);

  it('รายจ่ายเก่า "วัตถุดิบ" ที่ลงสต็อกแล้ว แสดงเป็นหมวดของสต็อก', () => {
    expect(expenseCategoryOf({ category: 'วัตถุดิบ', stockId: 's1' }, stockById)).toBe('ไซรัป/ซอส/ท็อปปิ้ง');
    expect(expenseCategoryOf({ category: 'ค่าไฟ', stockId: 's1' }, stockById)).toBe('ค่าไฟ');
    expect(expenseCategoryOf({ category: 'วัตถุดิบ' }, stockById)).toBe('วัตถุดิบ');
    expect(expenseCategoryOf({ category: 'วัตถุดิบ', stockId: 'gone' }, stockById)).toBe('วัตถุดิบ');
  });

  it('บันทึกใหม่ใช้หมวดของสต็อกที่ลงไป', () => {
    const line = { title: 'ไซรัปส้ม', quantity: 1, unit: 'มล.', amount: 100, category: 'วัตถุดิบ' };
    const rec = buildExpenseRecord(line, { date: '2026-10-11', plan: planStockIntake(line, syrup) });
    expect(rec.category).toBe('ไซรัป/ซอส/ท็อปปิ้ง');
    expect(rec.stockId).toBe('s1');
  });

  it('น้ำแข็ง = ค่าใช้จ่ายร้าน ไม่ใช่ผลไม้', () => {
    expect(inferStockCategory('น้ำแข็งหลอด')).toBe('อื่น ๆ');
    expect(inferExpenseCategory('น้ำแข็งหลอด')).toBe('ค่าน้ำแข็ง');
    expect(inferOperatingCategory('มะนาว')).toBeNull();
    const form = { title: '', category: 'วัตถุดิบ', unit: 'ชิ้น', pricePerUnit: '' };
    expect(applyExpenseTitle(form, 'น้ำแข็ง', [], []).category).toBe('ค่าน้ำแข็ง');
    expect(applyExpenseTitle({ ...form, category: 'ค่าเช่า' }, 'น้ำแข็ง', [], []).category).toBe('ค่าเช่า');
  });
});
