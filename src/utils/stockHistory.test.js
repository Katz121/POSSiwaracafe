import { describe, expect, it } from 'vitest';
import { buildStockHistory, buildStockMove, summarizeHistory } from './stockHistory';

const milk = { id: 'milk', name: 'นมสด', unit: 'มล.' };
const oldMilk = { id: 'old', name: 'นมสดเก่า', unit: 'มล.', mergedInto: 'milk', archived: true };
const stock = [milk, oldMilk];

describe('buildStockHistory', () => {
  const orders = [
    { id: 'o1', status: 'completed', date: '2026-10-10', stockDeducted: true, stockDeduction: { at: '2026-10-10T03:00:00Z', applied: { milk: 150, cup: 1 } } },
    { id: 'o2', status: 'completed', date: '2026-10-10', stockDeducted: true, stockDeduction: { at: '2026-10-10T05:00:00Z', applied: { old: 100 } } },
    { id: 'o3', status: 'cancelled', date: '2026-10-10', stockDeducted: true, stockDeduction: { applied: { milk: 999 } } },
    { id: 'o4', status: 'completed', date: '2026-10-09', queueNumber: 7, stockBackfill: [{ at: '2026-10-11T01:00:00Z', lines: [{ applied: { milk: 30 } }] }] },
  ];
  const expenses = [
    { id: 'e1', date: '2026-10-08', stockId: 'milk', stockQuantity: 2000, quantity: 2, unit: 'ขวด', amount: 180, category: 'นมและผลิตภัณฑ์นม' },
    { id: 'e2', date: '2026-10-09', category: 'ของเสีย (Waste)', title: 'ของเสีย: นมสด (x200 มล.)', amount: 18 },
    { id: 'e3', date: '2026-10-09', category: 'เจ้าของ/พนักงานกิน', staffMeal: { applied: { milk: 120 } }, title: 'ลาเต้' },
  ];
  const counts = [{ id: 'c1', stockId: 'milk', date: '2026-10-07', countedAt: '2026-10-07T10:00:00Z', systemQty: 500, countedQty: 450, variance: -50 }];
  const batches = [{ id: 'b1', status: 'done', doneAt: '2026-10-06T02:00:00Z', outputName: 'ครีมชีส', outputStockId: 'cream', yieldQty: 5, actualIngredients: [{ stockId: 'milk', qty: 300 }] }];
  const moves = [{ id: 'm1', stockId: 'milk', reason: 'stepper', delta: 1, at: '2026-10-11T09:00:00Z', date: '2026-10-11' }];

  const rows = buildStockHistory({ item: milk, stock, orders, expenses, counts, batches, moves });

  it('รวมทุกแหล่ง เรียงใหม่สุดก่อน · ขายรวมรายวัน + ตัวที่ถูกรวมเข้ามา', () => {
    expect(rows.map((r) => [r.date, r.kind, r.qty])).toEqual([
      ['2026-10-11', 'manual', 1],
      ['2026-10-11', 'backfill', -30],
      ['2026-10-10', 'sale', -250],
      ['2026-10-09', 'waste', -200],
      ['2026-10-09', 'staff', -120],
      ['2026-10-08', 'intake', 2000],
      ['2026-10-07', 'count', -50],
      ['2026-10-06', 'produceUse', -300],
    ]);
    expect(rows.find((r) => r.kind === 'sale').detail).toBe('2 บิล');
    expect(rows[0].label).toBe('ปุ่ม +/−');
  });

  it('สรุปเข้า/ออก', () => {
    expect(summarizeHistory(rows)).toEqual({ in: 2001, out: 950 });
  });

  it('ของเสียใหม่ใช้ stockId · ย้อนการผลิตคืนวัตถุดิบ', () => {
    const r = buildStockHistory({
      item: milk, stock,
      expenses: [{ id: 'w', category: 'ของเสีย (Waste)', stockId: 'milk', stockQuantity: 40, date: '2026-10-11', title: 'อะไรก็ได้' }],
      batches: [{ id: 'b2', status: 'cancelled', doneAt: '2026-10-05T01:00:00Z', reversedAt: '2026-10-05T02:00:00Z', outputStockId: 'x', yieldQty: 3, actualIngredients: [{ stockId: 'milk', qty: 100 }] }],
    });
    expect(r.map((x) => [x.kind, x.qty])).toEqual([['waste', -40], ['produceUndo', 100], ['produceUse', -100]]);
  });

  it('buildStockMove เก็บก่อน/หลัง', () => {
    const m = buildStockMove({ item: milk, before: 10, after: 7.5, reason: 'correction', by: 'a@b', now: new Date(2026, 9, 11, 12) });
    expect(m).toMatchObject({ stockId: 'milk', delta: -2.5, before: 10, after: 7.5, date: '2026-10-11', reason: 'correction' });
  });
});

describe('ของเสีย/พนักงานกินจากหน้าเมนู', () => {
  it('อ่านจาก waste.applied / staffMeal.applied', () => {
    const milk = { id: 'milk', name: 'นมสด', unit: 'มล.' };
    const rows = buildStockHistory({
      item: milk, stock: [milk],
      expenses: [
        { id: 'w1', category: 'ของเสีย (Waste)', title: 'ของเสีย: ลาเต้ x2', date: '2026-10-11', waste: { applied: { milk: 300 } } },
        { id: 's1', category: 'เจ้าของ/พนักงานกิน', title: 'พนักงานกิน: ลาเต้ x1', date: '2026-10-11', staffMeal: { applied: { milk: 150 } } },
      ],
    });
    expect(rows.map((r) => [r.kind, r.qty]).sort()).toEqual([['staff', -150], ['waste', -300]]);
  });
});
