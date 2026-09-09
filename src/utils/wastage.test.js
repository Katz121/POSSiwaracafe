import { describe, it, expect } from 'vitest';
import {
  buildWasteExpenseTitle, computeMenuWaste, computeOrderStockUsage, computeRecipeUsage,
  portionsFromUsage, usageFromPortions,
} from './wastage';

// เค้ก 1 ก้อนทุน 280 ตัดได้ 8 ชิ้น → ชิ้นละ 35 บาท
const stockById = new Map([
  ['cake', { id: 'cake', unitCost: 280, unit: 'ก้อน' }],
  ['box', { id: 'box', unitCost: 3, unit: 'ใบ' }],
]);
const cakeSlice = {
  name: 'เค้กมะพร้าว (ชิ้น)',
  additionalCost: 0,
  stockLinks: [{ stockId: 'cake', usage: 0.125 }, { stockId: 'box', usage: 1 }],
};

describe('usageFromPortions / portionsFromUsage', () => {
  it('เค้ก 1 ก้อนตัดได้ 8 ชิ้น ใช้ก้อนละ 0.125 ต่อชิ้น', () => {
    expect(usageFromPortions(8)).toBe(0.125);
    expect(portionsFromUsage(0.125)).toBe(8);
  });

  it('แปลงไปกลับแล้วต้องได้ค่าเดิม', () => {
    [2, 4, 6, 8, 10, 12, 16].forEach((n) => {
      expect(portionsFromUsage(usageFromPortions(n))).toBeCloseTo(n, 10);
    });
  });

  it('จำนวนชิ้นเป็นศูนย์หรือติดลบต้องได้ 0 ไม่ใช่ Infinity', () => {
    expect(usageFromPortions(0)).toBe(0);
    expect(usageFromPortions(-3)).toBe(0);
    expect(usageFromPortions('ไม่ใช่ตัวเลข')).toBe(0);
    expect(portionsFromUsage(0)).toBe(0);
  });
});

describe('computeRecipeUsage', () => {
  it('คูณจำนวนแล้วรวมตาม stockId', () => {
    expect(computeRecipeUsage(cakeSlice.stockLinks, 3)).toEqual({ cake: 0.375, box: 3 });
  });

  it('ลิงก์ที่ไม่มี stockId ต้องถูกข้าม', () => {
    expect(computeRecipeUsage([{ usage: 5 }, { stockId: 'box', usage: 1 }], 2)).toEqual({ box: 2 });
  });

  it('usage ที่เก็บเป็นสตริงต้องคำนวณได้', () => {
    expect(computeRecipeUsage([{ stockId: 'cake', usage: '0.125' }], '4')).toEqual({ cake: 0.5 });
  });
});

describe('computeOrderStockUsage', () => {
  it('รวมทุกรายการในบิล และรวม stockId ซ้ำเข้าด้วยกัน', () => {
    const usage = computeOrderStockUsage({
      items: [
        { quantity: 2, stockLinks: [{ stockId: 'cake', usage: 0.125 }] },
        { quantity: 1, stockLinks: [{ stockId: 'cake', usage: 0.125 }, { stockId: 'box', usage: 1 }] },
      ],
    });
    expect(usage).toEqual({ cake: 0.375, box: 1 });
  });

  it('บิลว่างหรือไม่มี items ต้องไม่พัง', () => {
    expect(computeOrderStockUsage({})).toEqual({});
    expect(computeOrderStockUsage(null)).toEqual({});
  });
});

describe('computeMenuWaste', () => {
  it('ตีมูลค่าของเสียด้วยราคาทุน และตัดสต็อกตามสูตร', () => {
    const w = computeMenuWaste({ menuItem: cakeSlice, quantity: 3, stockById });
    expect(w.costPerUnit).toBe(38); // 280×0.125 + 3×1
    expect(w.cost).toBe(114);
    expect(w.usageByStock).toEqual({ cake: 0.375, box: 3 });
    expect(w.costed).toBe(true);
  });

  it('ห้ามใช้ราคาขายตีมูลค่า · ราคาขายไม่ถูกแตะเลย', () => {
    const w = computeMenuWaste({
      menuItem: { ...cakeSlice, price: 120 }, quantity: 1, stockById,
    });
    expect(w.cost).toBe(38); // ไม่ใช่ 120
  });

  it('เมนูที่คิดต้นทุนจาก additionalCost อย่างเดียวก็ตีมูลค่าได้', () => {
    const w = computeMenuWaste({
      menuItem: { name: 'เค้กซื้อมาขาย', additionalCost: 45, stockLinks: [] },
      quantity: 2, stockById,
    });
    expect(w.cost).toBe(90);
    expect(w.costed).toBe(true);
    expect(w.usageByStock).toEqual({});
  });

  it('เมนูที่ยังไม่ผูกต้นทุน ต้องบอกว่าตีมูลค่าไม่ได้ ไม่ใช่บันทึกศูนย์เงียบๆ', () => {
    const w = computeMenuWaste({
      menuItem: { name: 'เค้กใหม่', stockLinks: [] }, quantity: 5, stockById,
    });
    expect(w.costed).toBe(false);
    expect(w.cost).toBe(0);
  });

  it('ลิงก์ที่ชี้ไปสต็อกที่ถูกลบแล้ว ต้องนับไว้เตือน ไม่ใช่คิดเป็นทุนศูนย์เงียบๆ', () => {
    const w = computeMenuWaste({
      menuItem: { name: 'เค้ก', stockLinks: [{ stockId: 'ที่ถูกลบ', usage: 1 }] },
      quantity: 2, stockById,
    });
    expect(w.missingLinks).toBe(1);
    expect(w.costed).toBe(false);
    expect(w.usageByStock).toEqual({});
  });

  it('จำนวนติดลบต้องถูกปัดเป็นศูนย์ ไม่ใช่ไปเพิ่มสต็อกกลับ', () => {
    const w = computeMenuWaste({ menuItem: cakeSlice, quantity: -4, stockById });
    expect(w.cost).toBe(0);
    expect(w.usageByStock).toEqual({ cake: 0, box: 0 });
  });

  it('ขายครบทั้งก้อนกับทิ้งทั้งก้อน ต้องตัดสต็อกเท่ากันพอดี', () => {
    const sold = computeOrderStockUsage({ items: [{ quantity: 8, stockLinks: cakeSlice.stockLinks }] });
    const wasted = computeMenuWaste({ menuItem: cakeSlice, quantity: 8, stockById });
    expect(wasted.usageByStock.cake).toBeCloseTo(sold.cake, 10);
    expect(sold.cake).toBe(1);
  });
});

describe('buildWasteExpenseTitle', () => {
  it('ใช้รูปแบบเดียวกับที่หน้าคลังบันทึกอยู่ เพื่อให้รายงานจัดกลุ่มได้เหมือนกัน', () => {
    expect(buildWasteExpenseTitle('เค้กมะพร้าว (ชิ้น)', 3)).toBe('ของเสีย: เค้กมะพร้าว (ชิ้น) (x3 ชิ้น)');
  });
});
