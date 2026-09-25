/**
 * เทสต์ planStaffMeal (vitest) · ใช้ stockLinks ที่รวมสูตรตัวเลือกมาแล้วบนบรรทัด
 * เหมือนบรรทัดจริงจาก toOrderItems(cart) ไม่ต้องผ่าน OptionSheet
 */
import { describe, it, expect } from 'vitest';
import { planStaffMeal, STAFF_MEAL_NOTE } from './staffMeal.js';

const stockById = new Map([
  ['bean-a', { id: 'bean-a', name: 'เมล็ด A', unit: 'กรัม', unitCost: 10, quantity: 1000 }],
  ['milk', { id: 'milk', name: 'นมวัว', unit: 'มล.', unitCost: 2.5, quantity: 5000 }],
  ['cup', { id: 'cup', name: 'แก้ว', unit: 'ใบ', unitCost: 3, quantity: 500 }],
]);

describe('planStaffMeal', () => {
  it('คิดต้นทุน = ของที่ใช้จริงคูณราคาทุนของแต่ละตัว', () => {
    const items = [{
      name: 'ลาเต้', quantity: 2,
      stockLinks: [
        { stockId: 'bean-a', usage: 3 },
        { stockId: 'milk', usage: 4 },
      ],
    }];
    const plan = planStaffMeal(items, stockById, {});
    expect(plan.applied).toEqual({ 'bean-a': 6, milk: 8 });
    // (6 x 10) + (8 x 2.5) = 80 · ราคาขายของเมนูไม่ถูกนำมาคิด
    expect(plan.cost).toBe(80);
  });

  it('ตัดสต็อกจากสูตรตัวเลือกที่รวมมาแล้วบนบรรทัด (base + modifier)', () => {
    const items = [{
      name: 'ลาเต้',
      beanModifier: '#เมล็ด A',
      quantity: 1,
      // สูตรเมนู (แก้ว) + สูตรตัวเลือก (เมล็ด A) รวมกันมาแล้วตอนกดลงตะกร้า
      stockLinks: [
        { stockId: 'cup', usage: 1 },
        { stockId: 'bean-a', usage: 2 },
      ],
    }];
    const plan = planStaffMeal(items, stockById, {});
    expect(plan.applied).toEqual({ cup: 1, 'bean-a': 2 });
    expect(plan.cost).toBe(3 + 20);
    expect(plan.lines).toEqual([{ name: 'ลาเต้', modifierName: '#เมล็ด A', quantity: 1 }]);
  });

  it('ลิงก์ชี้ไปสต็อกที่ถูกลบแล้วอยู่ใน skipped และไม่ถูกคิดต้นทุน', () => {
    const items = [{
      name: 'มัทฉะลาเต้', quantity: 1,
      stockLinks: [
        { stockId: 'matcha-deleted', usage: 5 },
        { stockId: 'milk', usage: 2 },
      ],
    }];
    const plan = planStaffMeal(items, stockById, {});
    expect(plan.skipped).toEqual([{ stockId: 'matcha-deleted', used: 5, item: 'มัทฉะลาเต้' }]);
    expect(plan.applied).toEqual({ milk: 2 });
    // ของที่ถูกลบไม่ถูกคิดต้นทุน · มูลค่าที่ได้จึงต่ำกว่าจริง (ชีตเตือนไว้)
    expect(plan.cost).toBe(5);
  });

  it('บรรทัดที่ไม่มีสูตรอยู่ใน unlinked และไม่มีต้นทุน', () => {
    const items = [{ name: 'น้ำเปล่า', quantity: 3 }];
    const plan = planStaffMeal(items, stockById, {});
    expect(plan.applied).toEqual({});
    expect(plan.unlinked).toEqual([{ name: 'น้ำเปล่า', quantity: 3 }]);
    expect(plan.cost).toBe(0);
    expect(plan.lines).toEqual([{ name: 'น้ำเปล่า', quantity: 3 }]);
  });

  it('title รวมชื่อ ตัวเลือก และจำนวน · ยาวเกิน 120 ตัวอักษรตัดแล้วเติม …', () => {
    const items = [
      { name: 'ลาเต้', beanModifier: '#เมล็ด A', quantity: 2 },
      { name: 'เค้ก', quantity: 1 },
    ];
    const short = planStaffMeal(items, stockById, {});
    expect(short.title).toBe('เจ้าของ/พนักงานกิน: ลาเต้ #เมล็ด A x2, เค้ก x1');

    const longItems = Array.from({ length: 10 }, (_, i) => ({
      name: `เมนูเครื่องดื่มชื่อยาวมากหมายเลข ${i + 1}`, quantity: 2,
      stockLinks: [{ stockId: 'cup', usage: 1 }],
    }));
    const long = planStaffMeal(longItems, stockById, {});
    expect(long.title.endsWith('…')).toBe(true);
    expect(long.title.length).toBeLessThanOrEqual(120);
  });

  it('ส่ง options (milkSwap) ต่อให้ planner กลางโดยไม่พัง', () => {
    const items = [{ name: 'ลาเต้', quantity: 1, stockLinks: [{ stockId: 'milk', usage: 2 }] }];
    const plain = planStaffMeal(items, stockById, {});
    const emptySwap = planStaffMeal(items, stockById, { milkSwap: undefined });
    expect(emptySwap).toEqual(plain);
    // หมายเหตุ: เคสที่สลับนมแล้วของที่ตัดเปลี่ยนจริงไม่ได้เขียน เพราะต้องปั้น
    // ก้อน milkSwap ให้ตรงกับ applyMilkSwap ใน milkSwap.js ซึ่งไม่ได้อยู่ใน
    // ต้นฉบับที่ส่งมาให้รอบนี้ (ไม่กล้าเดารูปร่างแล้วเขียนเทสต์ผิด)
  });

  it('STAFF_MEAL_NOTE บอกผลของปุ่มนี้ครบสามอย่าง', () => {
    expect(STAFF_MEAL_NOTE).toBe('ตัดสต็อกตามสูตร · ลงรายจ่ายตามราคาทุน · ไม่นับเป็นยอดขาย');
  });
});
