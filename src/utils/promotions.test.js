import { describe, expect, it } from 'vitest';
import { supportsSweetnessChoice } from './promotions';

const settings = { cakeSaleCategories: ['เค้ก', 'Cake'] };

describe('supportsSweetnessChoice', () => {
  it('does not show sweetness for cake items', () => {
    expect(supportsSweetnessChoice({ category: 'เค้ก' }, settings)).toBe(false);
  });

  it('shows sweetness for drinks', () => {
    expect(supportsSweetnessChoice({ category: 'เครื่องดื่ม' }, settings)).toBe(true);
  });

  it('lets the per-item toggle turn sweetness off for a drink', () => {
    expect(supportsSweetnessChoice({ category: 'เครื่องดื่ม', sweetnessChoice: false }, settings)).toBe(false);
  });

  it('lets the per-item toggle turn sweetness on for a cake-category item', () => {
    expect(supportsSweetnessChoice({ category: 'เค้ก', sweetnessChoice: true }, settings)).toBe(true);
  });
});
