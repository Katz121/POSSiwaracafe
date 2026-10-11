import { describe, expect, it } from 'vitest';
import { planStripDeadLinks } from './stockAuditActions';

describe('planStripDeadLinks', () => {
  const stockById = new Map([['milk', { id: 'milk' }], ['old', { id: 'old', mergedInto: 'milk' }]]);
  it('เอาเฉพาะลิงก์ที่สต็อกถูกลบ · ตัวที่ถูกรวมยังถือว่าอยู่', () => {
    const order = {
      items: [{ name: 'มัทฉะลาเต้', stockLinks: [{ stockId: 'milk', usage: 150 }, { stockId: 'gone', usage: 3 }, { stockId: 'old', usage: 1 }] }, { name: 'น้ำ' }],
      stockDeduction: { skipped: [{ stockId: 'gone', used: 3, item: 'มัทฉะลาเต้' }, { stockId: 'milk2' }] },
    };
    const p = planStripDeadLinks(order, stockById);
    expect(p.changed).toBe(true);
    expect(p.removed).toEqual(['gone']);
    expect(p.items[0].stockLinks).toEqual([{ stockId: 'milk', usage: 150 }, { stockId: 'old', usage: 1 }]);
    expect(p.items[1]).toBe(order.items[1]);
    expect(p.skipped).toEqual([]);
  });
  it('ไม่มีลิงก์เสีย = ไม่แก้', () => {
    expect(planStripDeadLinks({ items: [{ stockLinks: [{ stockId: 'milk', usage: 1 }] }] }, stockById).changed).toBe(false);
  });
});
