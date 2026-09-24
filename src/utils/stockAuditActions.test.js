import { describe, expect, it, vi, beforeEach } from 'vitest';

const store = new Map();
vi.mock('firebase/firestore', () => ({
  increment: (n) => ({ __inc: n }),
  arrayUnion: (...items) => ({ __union: items }),
  doc: (_db, ...parts) => ({ path: parts.join('/') }),
  runTransaction: async (_db, fn) => fn({
    get: async (ref) => ({ exists: () => store.has(ref.path), data: () => structuredClone(store.get(ref.path)) }),
    update: (ref, payload) => {
      const cur = store.get(ref.path);
      for (const [k, v] of Object.entries(payload)) {
        if (v && v.__inc !== undefined) cur[k] = Number(cur[k] || 0) + v.__inc;
        else if (v && v.__union) cur[k] = [...(cur[k] || []), ...v.__union];
        else cur[k] = v;
      }
    },
  }),
}));

import { runBackfillTransaction, runDeductBillTransaction } from './stockAuditActions.js';

const base = 'artifacts/app/public/data';
const stock = [{ id: 'bean2', name: 'เมล็ดใหม่', unit: 'กรัม', quantity: 1000 }];
const menu = [{ id: 'shot', name: 'เพิ่มช็อต', stockLinks: [{ stockId: 'bean2', usage: 20 }] }];
const line = { id: 'shot', name: 'เพิ่มช็อต', quantity: 2, stockLinks: [{ stockId: 'gone', usage: 20 }] };

beforeEach(() => {
  store.clear();
  store.set(`${base}/stock/bean2`, { quantity: 1000 });
});

describe('runBackfillTransaction', () => {
  it('ตัดที่ขาดครั้งเดียว · กดซ้ำไม่ตัดซ้ำ', async () => {
    store.set(`${base}/orders/o1`, { status: 'completed', stockDeducted: true, items: [line] });
    const refs = [{ orderId: 'o1', index: 0 }];
    const first = await runBackfillTransaction({}, 'app', refs, { stock, menu }, 'me');
    expect(first).toEqual({ orders: 1, totals: { bean2: 40 } });
    expect(store.get(`${base}/stock/bean2`).quantity).toBe(960);
    expect(store.get(`${base}/orders/o1`).stockBackfill[0]).toMatchObject({ by: 'me', lines: [{ itemKey: '0', name: 'เพิ่มช็อต', applied: { bean2: 40 } }] });
    const again = await runBackfillTransaction({}, 'app', refs, { stock, menu }, 'me');
    expect(again).toEqual({ orders: 0, totals: {} });
    expect(store.get(`${base}/stock/bean2`).quantity).toBe(960);
  });

  it('ข้ามบิลที่ยังไม่ตัดสต็อก และบิลที่ถูกลบไปแล้ว', async () => {
    store.set(`${base}/orders/o2`, { status: 'pending', items: [line] });
    const r = await runBackfillTransaction({}, 'app', [{ orderId: 'o2', index: 0 }, { orderId: 'nope', index: 0 }], { stock, menu });
    expect(r.orders).toBe(0);
    expect(store.get(`${base}/stock/bean2`).quantity).toBe(1000);
  });
});

describe('runDeductBillTransaction', () => {
  it('ตัดบิลที่เสร็จแต่ไม่ถูกตัด และทำครั้งเดียว', async () => {
    store.set(`${base}/orders/o3`, { status: 'completed', items: [{ name: 'x', quantity: 1, stockLinks: [{ stockId: 'bean2', usage: 18 }] }] });
    const plan = await runDeductBillTransaction({}, 'app', 'o3', stock, null, 'me');
    expect(plan.applied).toEqual({ bean2: 18 });
    expect(store.get(`${base}/stock/bean2`).quantity).toBe(982);
    expect(store.get(`${base}/orders/o3`)).toMatchObject({ stockDeducted: true, stockDeduction: { applied: { bean2: 18 }, by: 'me', milkSwapApplied: false } });
    expect(await runDeductBillTransaction({}, 'app', 'o3', stock, null)).toBeNull();
    expect(store.get(`${base}/stock/bean2`).quantity).toBe(982);
  });
});
