import { describe, expect, it } from 'vitest';
import { effectiveRecipe, recipeDraftText } from './recipeDraft';

const stockById = new Map([
  ['milk', { id: 'milk', name: 'นมสด', unit: 'มล.' }],
  ['cup', { id: 'cup', name: 'แก้ว 16oz', unit: 'ใบ' }],
  ['flour', { id: 'flour', name: 'แป้ง', unit: 'กรัม' }],
]);

describe('recipeDraft', () => {
  it('ดึงวัตถุดิบที่ผูก ข้ามลิงก์เสีย และบอกตัวเลือก', () => {
    const latte = { id: 'm1', allowBeanModifier: true, modifierGroups: ['เมล็ดกาแฟ'], stockLinks: [{ stockId: 'milk', usage: 150 }, { stockId: 'cup', usage: 1 }, { stockId: 'gone', usage: 5 }] };
    expect(recipeDraftText(latte, stockById)).toBe('วัตถุดิบต่อ 1 ที่\n• นมสด 150 มล.\n• แก้ว 16oz 1 ใบ\n• + เมล็ดกาแฟ ตามที่ลูกค้าเลือก');
  });

  it('เค้กแบบสูตรทั้งก้อน แสดงปริมาณทั้งก้อน', () => {
    const cake = { id: 'c', recipeMode: 'whole', recipePieces: 10, stockLinks: [{ stockId: 'flour', usage: 25 }] };
    expect(recipeDraftText(cake, stockById)).toBe('วัตถุดิบทั้งก้อน (ตัดได้ 10 ชิ้น)\n• แป้ง 250 กรัม');
  });

  it('สูตรที่เขียนเองชนะ · ไม่มีอะไรผูก = null', () => {
    const latte = { id: 'm1', stockLinks: [{ stockId: 'milk', usage: 150 }] };
    expect(effectiveRecipe({ m1: { text: 'สูตรของร้าน' } }, latte, stockById)).toEqual({ text: 'สูตรของร้าน', auto: false });
    expect(effectiveRecipe({ m1: { text: '  ' } }, latte, stockById).auto).toBe(true);
    expect(effectiveRecipe({}, { id: 'x' }, stockById)).toBeNull();
  });
});
