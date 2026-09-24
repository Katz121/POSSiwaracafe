import { describe, it, expect } from 'vitest';
import {
  classifyLinks,
  auditMenuLinks,
  auditDay,
  auditDays,
  planOrderDeduction,
  negativeStock,
  LINK_STATUS,
} from './stockAudit.js';

const stock = [
  { id: 'bean', name: 'เมล็ด', unit: 'กรัม', quantity: 1000, unitCost: 0.5, minQuantity: 200 },
  { id: 'milk', name: 'นม', unit: 'มล.', quantity: 150, unitCost: 0.05, minQuantity: 200 },
  { id: 'cup', name: 'แก้ว', unit: 'ใบ', quantity: -3, unitCost: 2 },
];
const stockById = new Map(stock.map((s) => [s.id, s]));

const menu = [
  { id: 'latte', name: 'ลาเต้', price: 60, stockLinks: [{ stockId: 'milk', usage: '150' }, { stockId: 'cup', usage: 1 }], soldCount: 50 },
  { id: 'nuts', name: 'ถั่ว', price: 20, soldCount: 10 },
  { id: 'soda', name: 'โซดา', price: 40, stockLinks: [{ stockId: 'gone', usage: 1 }] },
  { id: 'mocha', name: 'มอคค่า', price: 70, stockLinks: [{ stockId: 'milk', usage: 100 }, { stockId: 'gone', usage: 5 }] },
  { id: 'drip', name: 'ดริป', price: 80, allowBeanModifier: true },
  { id: 'off', name: 'ปิดขาย', price: 10, available: false },
];
const beanModifiers = [
  { id: 'm1', name: '#คั่วกลาง', stockLinks: [{ stockId: 'bean', usage: 18 }] },
  { id: 'm2', name: '#คั่วเข้ม', stockLinks: [{ stockId: 'gone2', usage: 18 }] },
  { id: 'm3', name: 'หวานน้อย' },
];

const order = (id, items, extra = {}) => ({
  id, date: '2026-09-23', time: '10:00', status: 'completed', stockDeducted: true, total: items.reduce((s, i) => s + i.price * i.quantity, 0), items, ...extra,
});

describe('classifyLinks', () => {
  it('แยกลิงก์ที่สต็อกยังอยู่กับที่ถูกลบ', () => {
    expect(classifyLinks([], stockById).status).toBe(LINK_STATUS.UNLINKED);
    expect(classifyLinks([{ stockId: 'gone', usage: 1 }], stockById).status).toBe(LINK_STATUS.DEAD);
    const partial = classifyLinks([{ stockId: 'milk', usage: '2' }, { stockId: 'gone', usage: 1 }], stockById);
    expect(partial.status).toBe(LINK_STATUS.PARTIAL);
    expect(partial.alive[0]).toMatchObject({ stockId: 'milk', usage: 2, name: 'นม' });
    expect(classifyLinks([{ stockId: 'milk', usage: 1 }], stockById).status).toBe(LINK_STATUS.OK);
  });
});

describe('auditMenuLinks', () => {
  it('นับเฉพาะเมนูที่เปิดขาย และจัดสถานะแต่ละเมนู', () => {
    const r = auditMenuLinks({ menu, stock, beanModifiers });
    expect(r.counts.total).toBe(5);
    const by = Object.fromEntries(r.items.map((i) => [i.id, i.status]));
    expect(by).toEqual({ latte: 'ok', nuts: 'unlinked', soda: 'dead', mocha: 'partial', drip: 'modifier_only' });
    expect(r.needsAttention).toBe(3);
    // เรียงจากหนักสุดก่อน
    expect(r.items[0].id).toBe('soda');
  });
  it('เตือนตัวเลือกที่ลิงก์เสีย แต่ไม่เตือนตัวเลือกที่ไม่มีสูตรเลย', () => {
    const r = auditMenuLinks({ menu, stock, beanModifiers });
    expect(r.modifiers.map((m) => m.name)).toEqual(['#คั่วเข้ม']);
  });
  it('includeHidden รวมเมนูปิดขาย', () => {
    expect(auditMenuLinks({ menu, stock, includeHidden: true }).counts.total).toBe(6);
  });
});

describe('planOrderDeduction', () => {
  it('รวมปริมาณตามจำนวน ข้ามสต็อกที่ถูกลบ และจดรายการที่ไม่ผูก', () => {
    const plan = planOrderDeduction(order('o1', [
      { id: 'latte', name: 'ลาเต้', price: 60, quantity: 2, stockLinks: [{ stockId: 'milk', usage: '150' }, { stockId: 'cup', usage: 1 }] },
      { id: 'mocha', name: 'มอคค่า', price: 70, quantity: 1, stockLinks: [{ stockId: 'milk', usage: 100 }, { stockId: 'gone', usage: 5 }] },
      { id: 'nuts', name: 'ถั่ว', price: 20, quantity: 3 },
    ]), stockById);
    expect(plan.applied).toEqual({ milk: 400, cup: 2 });
    expect(plan.skipped).toEqual([{ stockId: 'gone', used: 5, item: 'มอคค่า' }]);
    expect(plan.unlinked).toEqual([{ name: 'ถั่ว', quantity: 3 }]);
  });
  it('ปัดเลขลอย', () => {
    const plan = planOrderDeduction(order('o', [{ name: 'x', price: 1, quantity: 3, stockLinks: [{ stockId: 'bean', usage: 0.1 }] }]), stockById);
    expect(plan.applied.bean).toBe(0.3);
  });
});

describe('auditDay', () => {
  const latteLine = { id: 'latte', name: 'ลาเต้', price: 60, quantity: 2, stockLinks: [{ stockId: 'milk', usage: '150' }, { stockId: 'cup', usage: 1 }] };
  const orders = [
    order('o1', [latteLine, { id: 'nuts', name: 'ถั่ว', price: 20, quantity: 1 }], { queueNumber: 1 }),
    order('o2', [{ id: 'nuts', name: 'ถั่ว', price: 20, quantity: 2 }], { queueNumber: 2, time: '11:00' }),
    order('o3', [{ ...latteLine, quantity: 1 }], { status: 'pending', stockDeducted: false, queueNumber: 3 }),
    order('o4', [{ id: 'soda', name: 'โซดา', price: 40, quantity: 1, stockLinks: [{ stockId: 'gone', usage: 1 }] }], { queueNumber: 4 }),
    order('old', [latteLine], { date: '2026-09-22' }),
    order('bk', [{ name: 'ยอดย้อนหลัง', price: 500, quantity: 1 }], { isBackdated: true }),
  ];

  it('สรุปยอดขาย ตัดเฉพาะบิลที่เสร็จแล้ว และข้ามยอดย้อนหลัง', () => {
    const r = auditDay({ orders, stock, menu, date: '2026-09-23' });
    expect(r.summary.bills).toBe(4);
    expect(r.summary.completed).toBe(3);
    expect(r.summary.waiting).toBe(1);
    expect(r.summary.units).toBe(7);
    const latte = r.sold.find((s) => s.name === 'ลาเต้');
    expect(latte.quantity).toBe(3);
    expect(latte.stock.find((s) => s.stockId === 'milk').total).toBe(450);
    const milk = r.stockUsed.find((s) => s.stockId === 'milk');
    // บิล o3 ยังค้าง ไม่ควรนับว่าตัดไปแล้ว
    expect(milk.used).toBe(300);
    expect(milk.low).toBe(true);
    expect(r.stockUsed.find((s) => s.stockId === 'cup').negative).toBe(true);
  });

  it('รวมคำเตือนของเมนูเดียวกันเป็นข้อเดียว', () => {
    const r = auditDay({ orders, stock, menu, date: '2026-09-23' });
    const nuts = r.issues.filter((i) => i.type === 'item_unlinked');
    expect(nuts).toHaveLength(1);
    expect(nuts[0].quantity).toBe(3);
    expect(nuts[0].message).toContain('ใน 2 บิล');
    const dead = r.issues.find((i) => i.type === 'item_dead_link');
    expect(dead.severity).toBe('error');
    expect(r.summary.verdict).toBe('bad');
    expect(r.issues[0].severity).toBe('error');
  });

  it('จับบิลที่เสร็จแต่ไม่ถูกตัด', () => {
    const r = auditDay({ orders: [order('x', [latteLine], { stockDeducted: false })], stock, menu, date: '2026-09-23' });
    expect(r.summary.billsMissed).toBe(1);
    expect(r.issues.some((i) => i.type === 'bill_not_deducted')).toBe(true);
    expect(r.stockUsed).toHaveLength(0);
  });

  it('เทียบบันทึกการตัดจริงกับสูตร', () => {
    const good = order('g', [latteLine], { stockDeduction: { applied: { milk: 300, cup: 2 } } });
    const bad = order('b', [latteLine], { stockDeduction: { applied: { milk: 150, cup: 2 } } });
    const r = auditDay({ orders: [good, bad], stock, menu, date: '2026-09-23' });
    expect(r.summary.billsRecorded).toBe(2);
    expect(r.summary.billsMismatch).toBe(1);
    const mis = r.issues.find((i) => i.type === 'bill_mismatch');
    expect(mis.orderId).toBe('b');
    expect(mis.diffs).toEqual([{ stockId: 'milk', name: 'นม', expected: 300, applied: 150 }]);
  });

  it('วันที่ตัดครบทุกอย่างได้ ok และแม่นยำ 100%', () => {
    const r = auditDay({ orders: [order('ok', [latteLine])], stock: stock.map((s) => ({ ...s, quantity: 5000 })), menu, date: '2026-09-23' });
    expect(r.summary.verdict).toBe('ok');
    expect(r.summary.accuracy).toBe(1);
  });

  it('ปันส่วนลดระดับบิลลงรายการ', () => {
    const r = auditDay({ orders: [order('d', [latteLine], { total: 100 })], stock, menu, date: '2026-09-23' });
    expect(r.summary.revenue).toBe(100);
    expect(r.sold[0].revenue).toBe(100);
  });

  it('ผูกแค่ตัวเลือกเป็นข้อสังเกต ไม่ลดคะแนน', () => {
    const drip = { id: 'drip', name: 'ดริป', price: 80, quantity: 1, beanModifier: '#คั่วกลาง', stockLinks: [{ stockId: 'bean', usage: 18 }] };
    const r = auditDay({ orders: [order('dr', [drip])], stock: stock.map((s) => ({ ...s, quantity: 5000 })), menu, date: '2026-09-23' });
    expect(r.summary.unitsModifierOnly).toBe(1);
    expect(r.summary.accuracy).toBe(1);
    expect(r.issues[0].severity).toBe('info');
    expect(r.summary.verdict).toBe('ok');
  });

  it('วันที่ไม่มีบิล', () => {
    expect(auditDay({ orders, stock, menu, date: '2026-01-01' }).summary.verdict).toBe('empty');
  });
});

describe('auditDays / negativeStock', () => {
  it('สรุปหลายวัน', () => {
    const rows = auditDays({ orders: [order('a', [{ name: 'ถั่ว', price: 20, quantity: 1 }])], stock, menu, dates: ['2026-09-22', '2026-09-23'] });
    expect(rows.map((r) => r.verdict)).toEqual(['empty', 'warn']);
  });
  it('หาสต็อกติดลบ', () => {
    expect(negativeStock(stock)).toEqual([{ id: 'cup', name: 'แก้ว', unit: 'ใบ', quantity: -3 }]);
  });
});

describe('merged stock (mergedInto)', () => {
  const mStock = [
    { id: 'egg', name: 'ไข่ไก่', unit: 'ฟอง', quantity: 100, unitCost: 5 },
    { id: 'egg-old', name: 'ไขไก่', unit: 'ฟอง', quantity: 0, unitCost: 5.1, mergedInto: 'egg', archived: true },
    { id: 'egg-older', name: 'ไข่', unit: 'ฟอง', quantity: 0, mergedInto: 'egg-old', archived: true },
  ];
  const mById = new Map(mStock.map((s) => [s.id, s]));

  it('classifyLinks treats merged ids as alive and points them at the keeper', () => {
    const res = classifyLinks([{ stockId: 'egg-old', usage: 0.2 }, { stockId: 'egg-older', usage: 1 }], mById);
    expect(res.status).toBe(LINK_STATUS.OK);
    expect(res.dead).toHaveLength(0);
    expect(res.alive.map((a) => a.stockId)).toEqual(['egg', 'egg']);
    expect(res.alive[0].name).toBe('ไข่ไก่');
  });

  it('planOrderDeduction deducts from the keeper, not the archived doc', () => {
    const order = { items: [
      { name: 'มูส', quantity: 2, stockLinks: [{ stockId: 'egg-old', usage: 0.2 }] },
      { name: 'ทาร์ต', quantity: 1, stockLinks: [{ stockId: 'egg', usage: 1 }] },
    ] };
    const plan = planOrderDeduction(order, mById);
    expect(plan.applied).toEqual({ egg: 1.4 });
    expect(plan.skipped).toEqual([]);
  });

  it('auditMenuLinks does not report merged links as broken', () => {
    const res = auditMenuLinks({ menu: [{ id: 'm', name: 'มูส', stockLinks: [{ stockId: 'egg-old', usage: 0.2 }] }], stock: mStock });
    expect(res.items[0].status).toBe(LINK_STATUS.OK);
    expect(res.needsAttention).toBe(0);
  });

  it('auditDay: an old bill deducted before the merge is not a mismatch', () => {
    const order = {
      id: 'o1', date: '2026-09-24', status: 'completed', stockDeducted: true,
      stockDeduction: { applied: { 'egg-old': 0.4 } },
      items: [{ id: 'm', name: 'มูส', price: 50, quantity: 2, stockLinks: [{ stockId: 'egg-old', usage: 0.2 }] }],
    };
    const res = auditDay({ orders: [order], stock: mStock, date: '2026-09-24' });
    expect(res.summary.billsMismatch).toBe(0);
    expect(res.summary.verdict).toBe('ok');
    expect(res.stockUsed.map((s) => s.stockId)).toEqual(['egg']);
  });
});
