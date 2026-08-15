import { describe, expect, it } from 'vitest';
import { summarizeMergedBills, validateMergedBills } from './billMerge';

const bills = [
  { id: 'a', status: 'completed', isPaid: false, total: 60, date: '2026-08-15' },
  { id: 'b', status: 'completed', isPaid: false, total: 75, date: '2026-08-15' },
  { id: 'c', status: 'completed', isPaid: true, total: 90, date: '2026-08-15' },
];

describe('merged bill payment', () => {
  it('summarizes only selected bills', () => {
    expect(summarizeMergedBills(bills, new Set(['a', 'b']))).toMatchObject({ count: 2, total: 135 });
  });

  it('accepts two completed unpaid bills from the same date', () => {
    expect(validateMergedBills(bills.slice(0, 2))).toBe(true);
  });

  it('rejects a paid bill', () => {
    expect(() => validateMergedBills([bills[0], bills[2]])).toThrow('bill-already-paid');
  });

  it('requires at least two bills', () => {
    expect(() => validateMergedBills([bills[0]])).toThrow('select-at-least-two-bills');
  });
});
