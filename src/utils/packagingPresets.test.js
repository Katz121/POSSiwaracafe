import { describe, it, expect } from 'vitest';
import { defaultPackagingPresets, resolvePackagingPresets, applyPackagingPreset } from './packagingPresets.js';

const stock = [
  { id: 'c14', name: 'แก้ว 14 oz' }, { id: 'c16k', name: 'แก้วน้ำพร้อมฝา 16z ขุ่น' }, { id: 'c16', name: 'แก้ว 16 oz' },
  { id: 'st', name: 'หลอด' }, { id: 'st2', name: 'หลอดเล็ก' }, { id: 'old', name: 'แก้ว 14 oz', mergedInto: 'c14' },
];
describe('packagingPresets', () => {
  it('ค่าเริ่มต้นเดาจากชื่อสต็อกของร้าน', () => {
    const p = defaultPackagingPresets(stock);
    expect(p.map((x) => [x.label, x.links[0].stockId])).toEqual([['แก้ว 14oz', 'c14'], ['แก้ว 16oz ขุ่น', 'c16k'], ['แก้ว 16oz ใส', 'c16'], ['หลอด', 'st']]);
  });
  it('ใช้ค่าที่ร้านตั้ง ตัดลิงก์สต็อกที่หายไป', () => {
    const r = resolvePackagingPresets([{ id: 'a', label: 'ชุดใส+หลอด', links: [{ stockId: 'c16', usage: 1 }, { stockId: 'gone', usage: 1 }, { stockId: 'st', usage: 1 }] }, { id: 'b', label: 'ว่าง', links: [] }], stock);
    expect(r.isDefault).toBe(false);
    expect(r.presets).toEqual([{ id: 'a', label: 'ชุดใส+หลอด', links: [{ stockId: 'c16', usage: 1 }, { stockId: 'st', usage: 1 }] }]);
  });
  it('ใส่ลงสูตรไม่ซ้ำ และโหมดทั้งก้อนคูณจำนวนชิ้น', () => {
    const preset = { links: [{ stockId: 'c16', usage: 1 }, { stockId: 'st', usage: 1 }] };
    const r = applyPackagingPreset([{ stockId: 'st', usage: 1 }], preset);
    expect(r.added).toBe(1);
    expect(r.links.map((l) => l.stockId)).toEqual(['st', 'c16']);
    expect(applyPackagingPreset([], preset, { whole: true, pieces: 8 }).links[0]).toEqual({ stockId: 'c16', usage: 1, perWhole: '8' });
  });
});
