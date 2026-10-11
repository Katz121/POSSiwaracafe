import { describe, expect, it } from 'vitest';
import { planEditDeduction } from './stockAudit';

const stockById = new Map([['milk', { id: 'milk' }], ['nut', { id: 'nut' }], ['cup', { id: 'cup' }]]);
const original = {
  stockDeducted: true,
  stockDeduction: { applied: { milk: 150, cup: 1 }, milkSwapApplied: false },
  items: [{ name: 'ลาเต้', quantity: 1, stockLinks: [{ stockId: 'milk', usage: 150 }, { stockId: 'cup', usage: 1 }] }],
};

describe('planEditDeduction', () => {
  it('เพิ่มถั่วหลังตัดแล้ว = ตัดถั่วเพิ่ม 1 · ของเดิมไม่ตัดซ้ำ', () => {
    const items = [...original.items, { name: 'ถั่ว', quantity: 1, stockLinks: [{ stockId: 'nut', usage: 1 }] }];
    const p = planEditDeduction(original, items, stockById, null);
    expect(p.cut).toEqual({ nut: 1 });
    expect(p.applied).toEqual({ milk: 150, cup: 1, nut: 1 });
  });

  it('ลดจำนวน/เอาออก = คืนเข้าสต็อก', () => {
    const p = planEditDeduction(original, [], stockById, null);
    expect(p.cut).toEqual({ milk: -150, cup: -1 });
    expect(p.applied).toEqual({});
  });

  it('ไม่เปลี่ยนรายการ = ไม่แตะสต็อก', () => {
    expect(planEditDeduction(original, original.items, stockById, null).cut).toEqual({});
  });
});
