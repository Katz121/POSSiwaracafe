import { describe, expect, it } from 'vitest';
import {
  auditDateFromParam, auditParams, auditTabFromParam, matchesStockFilter, normalizeStockFilter, sortStockForReview, stockStatus,
} from './stockStatus';
import {
  applyExpenseTitle, buildTitleSuggestions, displayUnitCost, intakeFormFor, rankTitleSuggestions, resolveStockIntake, toExpenseLine, validateExpense,
} from './expenseModel';

const milk = { id: 'm', name: 'นมสด', unit: 'มล.', quantity: 2000, unitCost: 0.05, minQuantity: 1000, category: 'นมและผลิตภัณฑ์นม' };

describe('stockStatus', () => {
  it('classifies negative / out / low / ok with the alert fallback min of 5', () => {
    expect(stockStatus({ quantity: -2, minQuantity: 3 }).key).toBe('negative');
    expect(stockStatus({ quantity: 0, minQuantity: 3 }).key).toBe('out');
    expect(stockStatus({ quantity: 3, minQuantity: 3 }).key).toBe('low');
    expect(stockStatus({ quantity: 4, minQuantity: 0 }).key).toBe('low'); // 0 → 5, like alertService
    expect(stockStatus({ quantity: 6, minQuantity: 5 }).key).toBe('ok');
  });

  it('filter=low includes out/negative (matches the dashboard low-stock link)', () => {
    expect(matchesStockFilter({ quantity: 0, minQuantity: 3 }, 'low')).toBe(true);
    expect(matchesStockFilter({ quantity: -1 }, 'out')).toBe(true);
    expect(matchesStockFilter({ quantity: 2, minQuantity: 3 }, 'out')).toBe(false);
    expect(normalizeStockFilter('weird')).toBe('all');
    expect(normalizeStockFilter('low')).toBe('low');
    // merged (archived) items only show under their own chip
    expect(matchesStockFilter({ quantity: 0, mergedInto: 'x', archived: true }, 'all')).toBe(false);
    expect(matchesStockFilter({ quantity: 0, mergedInto: 'x', archived: true }, 'out')).toBe(false);
    expect(matchesStockFilter({ quantity: 0, mergedInto: 'x', archived: true }, 'merged')).toBe(true);
    expect(matchesStockFilter({ quantity: 5 }, 'merged')).toBe(false);
    expect(normalizeStockFilter('merged')).toBe('merged');
  });

  it('sorts worst first', () => {
    const rows = sortStockForReview([
      { id: 'a', name: 'a', quantity: 10, minQuantity: 1 },
      { id: 'b', name: 'b', quantity: 0, minQuantity: 1 },
      { id: 'c', name: 'c', quantity: -1, minQuantity: 1 },
      { id: 'd', name: 'd', quantity: 1, minQuantity: 2 },
    ]);
    expect(rows.map((r) => r.id)).toEqual(['c', 'b', 'd', 'a']);
  });
});

describe('stock audit params', () => {
  it('maps links ↔ menu and defaults unknown tabs to sold', () => {
    expect(auditTabFromParam('links')).toBe('menu');
    expect(auditTabFromParam('issues')).toBe('issues');
    expect(auditTabFromParam('nope')).toBe('sold');
    expect(auditParams({ date: '2026-09-23', tab: 'menu', today: '2026-09-24' })).toEqual({ date: '2026-09-23', tab: 'links' });
    expect(auditParams({ date: '2026-09-24', tab: 'sold', today: '2026-09-24' })).toEqual({});
  });

  it('accepts only valid past/today ISO dates', () => {
    expect(auditDateFromParam('2026-09-23', '2026-09-24')).toBe('2026-09-23');
    expect(auditDateFromParam('2026-09-30', '2026-09-24')).toBe('2026-09-24');
    expect(auditDateFromParam('23/09/2026', '2026-09-24')).toBe('2026-09-24');
    expect(auditDateFromParam(undefined, '2026-09-24')).toBe('2026-09-24');
  });
});

describe('expense / intake form', () => {
  it('prefills receiving from the stock item like picking its name in Expenses', () => {
    const viaStock = intakeFormFor(milk);
    const viaTitle = applyExpenseTitle({ title: '', quantity: '', unit: 'ชิ้น', pricePerUnit: '', amount: '', category: 'วัตถุดิบ' }, 'นมสด', ['นมสด'], [milk]);
    expect(viaStock).toEqual(viaTitle);
    expect(viaStock).toMatchObject({ title: 'นมสด', unit: 'มล.', pricePerUnit: 0.05, category: 'นมและผลิตภัณฑ์นม' });
  });

  it('plans the intake onto the same stock row with the weighted average cost', () => {
    const form = { ...intakeFormFor(milk), quantity: '2000', amount: '140' };
    expect(validateExpense(form)).toEqual({});
    const line = toExpenseLine(form);
    expect(line).toEqual({ title: 'นมสด', quantity: 2000, unit: 'มล.', amount: 140, category: 'นมและผลิตภัณฑ์นม' });
    const { plan, targetStock, newStock, unitMismatch } = resolveStockIntake(line, [milk]);
    expect(targetStock.id).toBe('m');
    expect(newStock).toBe(false);
    expect(unitMismatch).toBe(false);
    expect(plan).toMatchObject({ ok: true, inQty: 2000, inUnitCost: 0.07, newQuantity: 4000, newUnitCost: 0.06 });
  });

  it('converts litres into the stock unit and flags impossible units', () => {
    const litre = resolveStockIntake({ title: 'นมสด', quantity: 2, unit: 'ลิตร', amount: 140, category: 'นมและผลิตภัณฑ์นม' }, [milk]);
    expect(litre.plan).toMatchObject({ ok: true, inQty: 2000 });
    const box = resolveStockIntake({ title: 'นมสด', quantity: 2, unit: 'กล่อง', amount: 140, category: 'นมและผลิตภัณฑ์นม' }, [milk]);
    expect(box.unitMismatch).toBe(true);
    expect(box.plan).toBeNull();
  });

  it('requires qty and cost for inventory categories', () => {
    const errors = validateExpense({ title: 'นมสด', quantity: '', unit: 'มล.', pricePerUnit: '', amount: '', category: 'วัตถุดิบ' });
    expect(Object.keys(errors).sort()).toEqual(['amount', 'pricePerUnit', 'quantity']);
  });

  it('shows the derived unit cost without float noise', () => {
    expect(displayUnitCost({ quantity: '3', amount: '100', pricePerUnit: '' })).toBe('33.3333');
    expect(displayUnitCost({ quantity: '', amount: '', pricePerUnit: '12' })).toBe('12');
  });

  it('suggests names from stock and history, best match first', () => {
    const list = buildTitleSuggestions([milk], [{ title: 'ค่าไฟ' }, { title: 'นมสด ' }]);
    expect(list).toEqual(['ค่าไฟ', 'นมสด']);
    expect(rankTitleSuggestions(['ครีมนมสด', 'นมสด', 'นมข้น'], 'นม')).toEqual(['นมข้น', 'นมสด', 'ครีมนมสด']);
  });
});

describe('title suggestions skip deleted stock', () => {
  it('ไม่แนะนำชื่อซื้อวัตถุดิบเก่าที่ไม่มีในสต็อกแล้ว', () => {
    const list = buildTitleSuggestions([{ name: 'นมสดโฟร์โมสต์' }], [
      { title: 'นมสด Meiji', category: 'นมและผลิตภัณฑ์นม' },
      { title: 'นมสดโฟร์โมสต์', category: 'วัตถุดิบ' },
      { title: 'ค่าไฟ', category: 'ค่าไฟ' },
      { title: 'ของเสีย: นมสด (x1 มล.)', category: 'ของเสีย (Waste)' },
    ]);
    expect(list).toEqual(['ค่าไฟ', 'นมสดโฟร์โมสต์']);
  });
});
