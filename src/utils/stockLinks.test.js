import { describe, it, expect } from 'vitest';
import { mergeStockLinks } from './stockLinks';

describe('mergeStockLinks', () => {
  it('สต็อกคนละตัว ต้องได้ครบทุกตัว', () => {
    const merged = mergeStockLinks(
      [{ stockId: 'cup', usage: 1 }],
      [{ stockId: 'bean', usage: 18 }],
    );
    expect(merged).toEqual([
      { stockId: 'cup', usage: 1 },
      { stockId: 'bean', usage: 18 },
    ]);
  });

  it('สต็อกตัวเดียวกัน ต้องบวกกัน ไม่ใช่ทับกัน (เมนูผูกเมล็ด 20 ตัวเลือกอีก 18 = 38)', () => {
    const merged = mergeStockLinks(
      [{ stockId: 'bean', usage: 20 }],
      [{ stockId: 'bean', usage: 18 }],
    );
    expect(merged).toEqual([{ stockId: 'bean', usage: 38 }]);
  });

  it('ปริมาณที่เก็บมาเป็นสตริงต้องบวกได้ ไม่ใช่ต่อสตริง', () => {
    const merged = mergeStockLinks(
      [{ stockId: 'bean', usage: '20' }],
      [{ stockId: 'bean', usage: '18' }],
    );
    expect(merged).toEqual([{ stockId: 'bean', usage: 38 }]);
  });

  it('เลือกหลายตัวเลือกพร้อมกันต้องบวกครบทุกชุด', () => {
    const merged = mergeStockLinks(
      [{ stockId: 'bean', usage: 10 }],
      [{ stockId: 'bean', usage: 5 }],
      [{ stockId: 'bean', usage: 3 }, { stockId: 'syrup', usage: 2 }],
    );
    expect(merged).toEqual([
      { stockId: 'bean', usage: 18 },
      { stockId: 'syrup', usage: 2 },
    ]);
  });

  it('ห้ามแก้อาเรย์หรืออ็อบเจ็กต์ต้นทาง เพราะมันคือสูตรกลางของเมนูใน state', () => {
    const menuLinks = [{ stockId: 'bean', usage: 20 }];
    const modLinks = [{ stockId: 'bean', usage: 18 }];
    mergeStockLinks(menuLinks, modLinks);
    mergeStockLinks(menuLinks, modLinks); // หยิบลงตะกร้าซ้ำต้องไม่สะสมทับของเดิม
    expect(menuLinks).toEqual([{ stockId: 'bean', usage: 20 }]);
    expect(modLinks).toEqual([{ stockId: 'bean', usage: 18 }]);
  });

  it('ลิงก์ที่ไม่มี stockId ต้องถูกตัดทิ้ง ไม่ใช่กลายเป็นคีย์ undefined', () => {
    expect(mergeStockLinks([{ usage: 5 }, { stockId: 'cup', usage: 1 }])).toEqual([
      { stockId: 'cup', usage: 1 },
    ]);
  });

  it('ค่าปริมาณที่อ่านไม่ออกให้เป็นศูนย์ ไม่ใช่ NaN ลามไปทั้งต้นทุน', () => {
    expect(mergeStockLinks([{ stockId: 'bean', usage: 'ยี่สิบ' }])).toEqual([
      { stockId: 'bean', usage: 0 },
    ]);
  });

  it('ไม่ส่งอะไรมาเลยต้องได้อาเรย์ว่าง ไม่ใช่พัง', () => {
    expect(mergeStockLinks()).toEqual([]);
    expect(mergeStockLinks(null, undefined)).toEqual([]);
  });
});
