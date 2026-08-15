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
});
