import { describe, it, expect } from 'vitest';
import {
  backfillStockTotals,
  backfillTotals,
  buildFixContext,
  currentLineRecipe,
  evaluateLineFix,
  lineDeductions,
  parseModifierNames,
  planBackfill,
} from './stockAuditFix.js';
import { auditDay } from './stockAudit.js';

const stock = [
  { id: 'bean', name: 'เมล็ด', unit: 'กรัม', quantity: 1000, unitCost: 0.5 },
  { id: 'bean2', name: 'เมล็ดใหม่', unit: 'กรัม', quantity: 1000, unitCost: 1 },
  { id: 'milk', name: 'นม', unit: 'มล.', quantity: 5000, unitCost: 0.05 },
  { id: 'cup', name: 'แก้ว', unit: 'ใบ', quantity: 100, unitCost: 2 },
  { id: 'syrup', name: 'ไซรัป', unit: 'มล.', quantity: 500, unitCost: 0.2 },
  { id: 'oldSyrup', name: 'ไซรัปเก่า', unit: 'มล.', quantity: 0, mergedInto: 'syrup' },
];
const mods = [
  { id: 'dark', name: 'คั่วเข้ม', stockLinks: [{ stockId: 'bean', usage: '18' }] },
  { id: 'deadmod', name: 'คั่วอ่อน', stockLinks: [{ stockId: 'gone2', usage: 18 }] },
];
const order = (id, items, extra = {}) => ({
  id, date: '2026-09-23', time: '10:00', status: 'completed', stockDeducted: true, total: 100, items, ...extra,
});
const ctxWith = (menu, beanModifiers = mods, st = stock) => buildFixContext({ stock: st, menu, beanModifiers });

describe('parseModifierNames', () => {
  it('แยกชื่อจาก "#a #b c"', () => {
    expect(parseModifierNames('#คั่วเข้ม #Noko (โทนถั่ว)')).toEqual(['คั่วเข้ม', 'Noko (โทนถั่ว)']);
    expect(parseModifierNames('')).toEqual([]);
  });
});

describe('currentLineRecipe', () => {
  it('รวมสูตรเมนูปัจจุบันกับตัวเลือกตาม modifierIds และบอกลิงก์เสียว่ามาจากตัวเลือกไหน', () => {
    const menu = [{ id: 'am', name: 'อเมริกาโน่', stockLinks: [{ stockId: 'cup', usage: 1 }] }];
    const r = currentLineRecipe({ id: 'am', name: 'อเมริกาโน่', modifierIds: ['deadmod'] }, ctxWith(menu));
    expect(r.links.map((l) => l.stockId)).toEqual(['cup', 'gone2']);
    expect(r.dead).toEqual([{ stockId: 'gone2', source: 'modifier', modifierId: 'deadmod', modifierName: 'คั่วอ่อน' }]);
  });
  it('บิลเก่าไม่มี modifierIds จับตัวเลือกจากชื่อ', () => {
    const menu = [{ id: 'am', name: 'อเมริกาโน่', stockLinks: [{ stockId: 'cup', usage: 1 }] }];
    const r = currentLineRecipe({ id: 'am', name: 'อเมริกาโน่', beanModifier: '#คั่วเข้ม' }, ctxWith(menu));
    expect(r.modifiers.map((m) => m.id)).toEqual(['dark']);
    expect(r.dead).toEqual([]);
  });
});

describe('evaluateLineFix / planBackfill', () => {
  const shotLine = { id: 'shot', name: 'เพิ่มช็อต', price: 20, quantity: 2, stockLinks: [{ stockId: 'gone', usage: 20 }] };
  const brokenMenu = [{ id: 'shot', name: 'เพิ่มช็อต', stockLinks: [{ stockId: 'gone', usage: 20 }] }];
  const fixedMenu = [{ id: 'shot', name: 'เพิ่มช็อต', stockLinks: [{ stockId: 'bean2', usage: 20 }] }];

  it('ยังไม่แก้สูตร = open', () => {
    expect(evaluateLineFix(order('o', [shotLine]), 0, ctxWith(brokenMenu)).state).toBe('open');
  });

  it('แก้สูตรแล้ว บิลเก่าไม่มีบันทึก → ขาดเท่าสูตรใหม่ × จำนวน', () => {
    const r = evaluateLineFix(order('o', [shotLine]), 0, ctxWith(fixedMenu));
    expect(r.state).toBe('needs_backfill');
    expect(r.missing).toEqual({ bean2: 40 });
  });

  it('ตัดย้อนหลังแล้ว (stockBackfill) ไม่ขาดอีก ตัดซ้ำไม่ได้', () => {
    const o = order('o', [shotLine], { stockBackfill: [{ at: 'x', lines: [{ itemKey: '0', applied: { bean2: 40 } }] }] });
    const r = evaluateLineFix(o, 0, ctxWith(fixedMenu));
    expect(r.state).toBe('resolved');
    expect(r.covered).toBe('backfill');
    const plan = planBackfill([{ orderId: 'o', index: 0 }], new Map([['o', o]]), ctxWith(fixedMenu));
    expect(plan.orders).toEqual([]);
  });

  it('บันทึกการตัดบอกว่าไม่มีลิงก์ถูกข้าม (สต็อกถูกลบทีหลัง) = ตอนขายตัดครบแล้ว ไม่ต้องตัดเพิ่ม', () => {
    const o = order('o', [shotLine], { stockDeduction: { applied: { gone: 40 }, skipped: [], unlinked: [] } });
    const r = evaluateLineFix(o, 0, ctxWith(fixedMenu));
    expect(r.state).toBe('resolved');
    expect(r.covered).toBe('at_sale');
  });

  it('บันทึกการตัดบอกลิงก์ที่ถูกข้าม · ตัดเพิ่มเฉพาะส่วนที่ขาด ของที่ตัดแล้วไม่ซ้ำ', () => {
    const line = { id: 'latte', name: 'ลาเต้', quantity: 1, stockLinks: [{ stockId: 'milk', usage: 150 }, { stockId: 'gone', usage: 10 }] };
    const menu = [{ id: 'latte', name: 'ลาเต้', stockLinks: [{ stockId: 'milk', usage: 150 }, { stockId: 'syrup', usage: 10 }] }];
    const o = order('o', [line], { stockDeduction: { applied: { milk: 150 }, skipped: [{ stockId: 'gone', used: 10, item: 'ลาเต้' }], unlinked: [] } });
    expect(lineDeductions(o, ctxWith(menu).stockById, null)[0]).toEqual({ mode: 'partial', applied: { milk: 150 } });
    expect(evaluateLineFix(o, 0, ctxWith(menu)).missing).toEqual({ syrup: 10 });
  });

  it('เมนูไม่ผูกตอนขาย แก้แล้ว → ขาดทั้งสูตร · สูตรที่ชี้สต็อกที่ถูกรวมไปตัดตัวที่เก็บไว้', () => {
    const line = { id: 'cocoa', name: 'โกโก้', quantity: 3, stockLinks: [] };
    const menu = [{ id: 'cocoa', name: 'โกโก้', stockLinks: [{ stockId: 'oldSyrup', usage: 5 }, { stockId: 'cup', usage: 1 }] }];
    const r = evaluateLineFix(order('o', [line]), 0, ctxWith(menu), { requireMenuLinks: true });
    expect(r.missing).toEqual({ syrup: 15, cup: 3 });
  });

  it('บิลที่ยังไม่ตัดสต็อก ไม่ตัดย้อนหลัง', () => {
    const o = order('o', [shotLine], { status: 'pending', stockDeducted: false });
    expect(evaluateLineFix(o, 0, ctxWith(fixedMenu)).state).toBe('not_deducted');
    expect(planBackfill([{ orderId: 'o', index: 0 }], new Map([['o', o]]), ctxWith(fixedMenu)).orders).toEqual([]);
  });

  it('planBackfill รวมยอดต่อสต็อก พร้อมต้นทุน', () => {
    const o1 = order('o1', [shotLine]);
    const o2 = order('o2', [{ ...shotLine, quantity: 1 }]);
    const plan = planBackfill(
      [{ orderId: 'o1', index: 0 }, { orderId: 'o2', index: 0 }, { orderId: 'o2', index: 0 }],
      new Map([['o1', o1], ['o2', o2]]),
      ctxWith(fixedMenu),
    );
    expect(plan.orders.map((o) => o.lines[0].applied)).toEqual([{ bean2: 40 }, { bean2: 20 }]);
    expect(plan.totals).toEqual([{ stockId: 'bean2', name: 'เมล็ดใหม่', unit: 'กรัม', qty: 60, unitCost: 1, cost: 60 }]);
    expect(backfillStockTotals(plan)).toEqual({ bean2: 60 });
  });

  it('backfillTotals รวมทุกครั้งที่ตัดย้อนหลัง', () => {
    expect(backfillTotals({ stockBackfill: [
      { lines: [{ itemKey: '0', applied: { a: 1, b: 2 } }] },
      { lines: [{ itemKey: '1', applied: { a: 0.5 } }] },
    ] })).toEqual({ a: 1.5, b: 2 });
    expect(backfillTotals({})).toEqual({});
  });
});

describe('auditDay · สถานะหลังแก้สูตร', () => {
  const shotLine = { id: 'shot', name: 'เพิ่มช็อต', price: 20, quantity: 1, stockLinks: [{ stockId: 'gone', usage: 20 }] };
  const latteLine = { id: 'latte', name: 'ลาเต้', price: 60, quantity: 3, stockLinks: [{ stockId: 'milk', usage: 150 }] };
  const latteMenu = { id: 'latte', name: 'ลาเต้', stockLinks: [{ stockId: 'milk', usage: 150 }] };
  const orders = [order('o1', [shotLine, latteLine])];

  it('ยังไม่แก้ → open นับในต้องแก้ · verdict bad', () => {
    const menu = [latteMenu, { id: 'shot', name: 'เพิ่มช็อต', stockLinks: [{ stockId: 'gone', usage: 20 }] }];
    const r = auditDay({ orders, stock, menu, date: '2026-09-23', beanModifiers: mods });
    const issue = r.issues.find((i) => i.type === 'item_dead_link');
    expect(issue.state).toBe('open');
    expect(issue.fix).toEqual({ kind: 'menu', menuId: 'shot' });
    expect(r.summary.openCount).toBe(1);
    expect(r.summary.verdict).toBe('bad');
    expect(r.summary.accuracy).toBe(0.75);
  });

  it('แก้สูตรแล้ว → รอตัดย้อนหลัง · ยังนับในต้องแก้ verdict warn', () => {
    const menu = [latteMenu, { id: 'shot', name: 'เพิ่มช็อต', stockLinks: [{ stockId: 'bean2', usage: 20 }] }];
    const r = auditDay({ orders, stock, menu, date: '2026-09-23', beanModifiers: mods });
    const issue = r.issues.find((i) => i.type === 'item_dead_link');
    expect(issue.state).toBe('fixed_pending_backfill');
    expect(issue.lines).toEqual([expect.objectContaining({ orderId: 'o1', index: 0, state: 'needs_backfill', missing: { bean2: 20 } })]);
    expect(r.summary.openCount).toBe(1);
    expect(r.summary.pendingCount).toBe(1);
    expect(r.summary.verdict).toBe('warn');
    expect(r.summary.accuracy).toBe(0.75);
  });

  it('ตัดย้อนหลังแล้ว → เรียบร้อย ไม่นับ · ก่อนแก้ 75% หลังแก้ 100%', () => {
    const menu = [latteMenu, { id: 'shot', name: 'เพิ่มช็อต', stockLinks: [{ stockId: 'bean2', usage: 20 }] }];
    const done = [order('o1', [shotLine, latteLine], { stockBackfill: [{ at: 'x', lines: [{ itemKey: '0', applied: { bean2: 20 } }] }] })];
    const r = auditDay({ orders: done, stock, menu, date: '2026-09-23', beanModifiers: mods });
    expect(r.issues.find((i) => i.type === 'item_dead_link').state).toBe('resolved');
    expect(r.summary.openCount).toBe(0);
    expect(r.summary.resolvedCount).toBe(1);
    expect(r.summary.verdict).toBe('ok');
    expect(r.summary.accuracyBefore).toBe(0.75);
    expect(r.summary.accuracy).toBe(1);
  });

  it('ลิงก์เสียอยู่ในตัวเลือก → ชี้ไปแก้ตัวเลือกนั้น', () => {
    const line = { id: 'am', name: 'อเมริกาโน่', price: 60, quantity: 1, beanModifier: '#คั่วอ่อน', modifierIds: ['deadmod'], stockLinks: [{ stockId: 'cup', usage: 1 }, { stockId: 'gone2', usage: 18 }] };
    const menu = [{ id: 'am', name: 'อเมริกาโน่', stockLinks: [{ stockId: 'cup', usage: 1 }] }];
    const r = auditDay({ orders: [order('o', [line])], stock, menu, date: '2026-09-23', beanModifiers: mods });
    expect(r.issues[0].fix).toEqual({ kind: 'modifier', modifierId: 'deadmod', modifierName: 'คั่วอ่อน' });
  });

  it('ผูกแค่ตัวเลือกตอนขาย แล้วเมนูผูกทีหลัง → รอตัดแก้วย้อนหลัง', () => {
    const line = { id: 'drip', name: 'ดริป', price: 80, quantity: 1, beanModifier: '#คั่วเข้ม', stockLinks: [{ stockId: 'bean', usage: 18 }] };
    const menu = [{ id: 'drip', name: 'ดริป', allowBeanModifier: true, stockLinks: [{ stockId: 'cup', usage: 1 }] }];
    const r = auditDay({ orders: [order('o', [line])], stock, menu, date: '2026-09-23', beanModifiers: mods });
    const issue = r.issues.find((i) => i.type === 'item_modifier_only');
    expect(issue.state).toBe('fixed_pending_backfill');
    expect(issue.lines[0].missing).toEqual({ cup: 1 });
  });

  it('บิลไม่ตรงสูตร หายเมื่อนับสต็อกตัวที่คลาดหลังบิลนั้นแล้ว', () => {
    const line = { id: 'latte', name: 'ลาเต้', price: 60, quantity: 1, stockLinks: [{ stockId: 'milk', usage: 150 }] };
    const o = order('b', [line], { stockDeduction: { at: '2026-09-23T03:00:00.000Z', applied: { milk: 100 } } });
    const before = auditDay({ orders: [o], stock, menu: [latteMenu], date: '2026-09-23' });
    const mis = before.issues.find((i) => i.type === 'bill_mismatch');
    expect(mis.state).toBe('open');
    expect(mis.fix).toEqual({ kind: 'count', stockId: 'milk' });
    const counted = stock.map((s) => (s.id === 'milk' ? { ...s, lastCountedAt: '2026-09-23T09:00:00.000Z' } : s));
    const after = auditDay({ orders: [o], stock: counted, menu: [latteMenu], date: '2026-09-23' });
    expect(after.issues.find((i) => i.type === 'bill_mismatch').state).toBe('resolved');
  });
});
