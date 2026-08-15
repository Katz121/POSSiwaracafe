import { describe, expect, it } from 'vitest';
import { getModifierGroups } from './constants';

describe('getModifierGroups', () => {
  it('does not attach coffee beans to a regular drink', () => {
    expect(getModifierGroups({ name: 'โกโก้ปั่น' })).toEqual([]);
  });

  it('keeps the legacy coffee-bean fallback for enabled coffee menus', () => {
    expect(getModifierGroups({ name: 'ลาเต้', allowBeanModifier: true }))
      .toEqual(['เมล็ดกาแฟ']);
  });

  it('keeps configured multiple groups for enabled menus', () => {
    expect(getModifierGroups({
      allowBeanModifier: true,
      modifierGroups: ['ส้ม', 'เมล็ดกาแฟ'],
    })).toEqual(['ส้ม', 'เมล็ดกาแฟ']);
  });
});
