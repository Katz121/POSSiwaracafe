import { describe, it, expect } from 'vitest';
import {
  addMonths, classifyMenuEngineering, computeHeadlineKpis, computeItemPerformance,
  computeDailySeries, computeModifierCoverage, computeMonthlySeries, concentration, growth, orderMonth,
} from './menuInsights';

const stock = [{ id: 'bean', unitCost: 0.5 }, { id: 'cup', unitCost: 4 }];
const menu = [
  { name: 'ลาเต้', stockLinks: [{ stockId: 'bean', usage: 18 }, { stockId: 'cup', usage: 1 }] }, // ทุน 13
  { name: 'เค้ก', additionalCost: 35, stockLinks: [] },
  { name: 'ยังไม่ผูก', stockLinks: [] },
];
const order = (month, total, items) => ({ status: 'completed', date: `${month}-15`, total, items });

describe('orderMonth', () => {
  it('อ่านจากฟิลด์ date รูปแบบมาตรฐาน', () => {
    expect(orderMonth({ date: '2026-08-30' })).toBe('2026-08');
  });
  it('บิลเก่าที่มีแต่ createdAt ต้องยังอ่านเดือนได้', () => {
    expect(orderMonth({ createdAt: { seconds: Date.UTC(2026, 4, 9) / 1000 } })).toBe('2026-05');
  });
  it('date เพี้ยนแบบที่เจอจริงในข้อมูล ต้องถูกตัดทิ้ง ไม่ใช่เดาเดือน', () => {
    expect(orderMonth({ date: '3/1/256' })).toBe('');
    expect(orderMonth({})).toBe('');
  });
});

describe('addMonths', () => {
  it('ข้ามปีได้ถูกต้อง', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-09', -5)).toBe('2026-04');
  });
});

describe('computeMonthlySeries', () => {
  const orders = [
    order('2026-06', 100, [{ name: 'ลาเต้', price: 100, quantity: 1 }]),
    order('2026-08', 200, [{ name: 'ลาเต้', price: 100, quantity: 2 }]),
  ];

  it('เดือนที่ไม่มีการขายต้องมีจุดบนกราฟเป็นศูนย์ ไม่ใช่หายไป', () => {
    const s = computeMonthlySeries({ orders, expenses: [], menu, stock });
    expect(s.map(r => r.month)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(s[1]).toMatchObject({ revenue: 0, bills: 0, grossProfit: 0 });
  });

  it('monthsBack ตัดช่วงย้อนหลังได้ และนับเดือนล่าสุดรวมด้วย', () => {
    const s = computeMonthlySeries({ orders, expenses: [], menu, stock, monthsBack: 2 });
    expect(s.map(r => r.month)).toEqual(['2026-07', '2026-08']);
  });

  it('คิดกำไรขั้นต้นต่อเดือนถูกต้องและไม่หักค่าซื้อวัตถุดิบซ้ำ', () => {
    const s = computeMonthlySeries({
      orders,
      expenses: [{ date: '2026-08-02', category: 'วัตถุดิบ', amount: 5000 }],
      menu, stock, monthsBack: 1,
    });
    expect(s[0]).toMatchObject({ month: '2026-08', revenue: 200, cogs: 26, grossProfit: 174 });
    expect(s[0].cashFlow).toBe(-4800); // เงินสดยังเห็นการตุนของ
  });

  it('บิลที่ยังไม่ปิดต้องไม่เข้ากราฟ', () => {
    const s = computeMonthlySeries({
      orders: [{ status: 'pending', date: '2026-08-01', total: 999, items: [] }],
      expenses: [], menu, stock,
    });
    expect(s).toEqual([]);
  });
});

describe('computeDailySeries', () => {
  const daily = (date, total, items) => ({ status: 'completed', date, total, items });
  const orders = [
    daily('2026-08-01', 160, [{ name: 'ลาเต้', price: 80, quantity: 2 }]),
    daily('2026-08-01', 80, [{ name: 'ลาเต้', price: 80, quantity: 1 }]),
    daily('2026-08-03', 80, [{ name: 'ลาเต้', price: 80, quantity: 1 }]),
  ];

  it('รวมยอดต่อวันและเติมวันที่ร้านไม่ได้ขายเป็นศูนย์', () => {
    const s = computeDailySeries({ orders, menu, stock, days: 3 });
    expect(s.map(r => r.day)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
    expect(s[0]).toMatchObject({ bills: 2, revenue: 240, cogs: 39, grossProfit: 201 });
    expect(s[1]).toMatchObject({ bills: 0, revenue: 0, grossProfit: 0 });
  });

  it('คิดยอดเฉลี่ยต่อบิลรายวัน และวันที่ไม่มีบิลต้องไม่หารศูนย์', () => {
    const s = computeDailySeries({ orders, menu, stock, days: 3 });
    expect(s[0].averageTicket).toBe(120);
    expect(s[1].averageTicket).toBe(0);
  });

  it('ข้ามเดือนได้ถูกต้อง', () => {
    const s = computeDailySeries({
      orders: [daily('2026-09-01', 80, [{ name: 'ลาเต้', price: 80, quantity: 1 }])],
      menu, stock, days: 3,
    });
    expect(s.map(r => r.day)).toEqual(['2026-08-30', '2026-08-31', '2026-09-01']);
  });

  it('ไม่คืนกำไรสุทธิรายวัน เพราะค่าเช่าถูกบันทึกเป็นก้อนเดียว หารรายวันแล้วหลอกตา', () => {
    const s = computeDailySeries({ orders, menu, stock, days: 1 });
    expect(s[0].netProfit).toBeUndefined();
    expect(s[0].cashFlow).toBeUndefined();
  });
});

describe('computeModifierCoverage', () => {
  const mods = [
    { name: 'คั่วเข้ม', stockLinks: [{ stockId: 'bean', usage: 18 }] },
    { name: 'คั่วกลาง', stockLinks: [] },
    { name: 'ยังไม่เคยขาย', stockLinks: [{ stockId: 'bean', usage: 18 }] },
    { name: 'ลิงก์เสีย', stockLinks: [{ stockId: 'สต็อกที่ถูกลบ', usage: 18 }] },
  ];
  const orders = [
    order('2026-08', 160, [
      { name: 'อเมริกาโน่', price: 80, quantity: 2, beanModifier: '#คั่วเข้ม' },
    ]),
    order('2026-08', 50, [
      { name: 'อเมริกาโน่', price: 50, quantity: 1, beanModifier: '#คั่วกลาง' },
    ]),
    order('2026-08', 90, [
      { name: 'อเมริกาโน่', price: 90, quantity: 1, beanModifier: '#เมล็ดที่ลบไปแล้ว' },
    ]),
  ];

  it('รวมยอดขายที่วิ่งผ่านตัวเลือกแต่ละตัว และตัด # นำหน้าออก', () => {
    const c = computeModifierCoverage({ orders, beanModifiers: mods, stock });
    expect(c.rows[0]).toMatchObject({ name: 'คั่วเข้ม', units: 2, revenue: 160, linked: true });
  });

  it('แยกตัวเลือกที่ยังไม่ผูก ออกจากตัวเลือกที่ถูกลบไปแล้ว', () => {
    const c = computeModifierCoverage({ orders, beanModifiers: mods, stock });
    expect(c.unlinked.map(r => r.name)).toEqual(['คั่วกลาง']);
    expect(c.missing.map(r => r.name)).toEqual(['เมล็ดที่ลบไปแล้ว']);
  });

  it('คิด % ยอดขายที่ต้นทุนตัวเลือกครอบคลุมถึง', () => {
    const c = computeModifierCoverage({ orders, beanModifiers: mods, stock });
    expect(c.totalRevenue).toBe(300);
    expect(c.linkedRevenue).toBe(160);
    expect(c.coveragePct).toBe(53);
  });

  it('stockLink ที่ชี้ไปสต็อกที่ถูกลบแล้ว ไม่นับว่าผูก', () => {
    const c = computeModifierCoverage({
      orders: [order('2026-08', 80, [{ name: 'x', price: 80, quantity: 1, beanModifier: '#ลิงก์เสีย' }])],
      beanModifiers: mods, stock,
    });
    expect(c.unlinked.map(r => r.name)).toEqual(['ลิงก์เสีย']);
  });

  it('บอกตัวเลือกที่ยังไม่เคยถูกสั่งด้วย จะได้ผูกไว้ก่อนขาย', () => {
    const c = computeModifierCoverage({ orders, beanModifiers: mods, stock });
    expect(c.neverSold.map(r => r.name)).toContain('ยังไม่เคยขาย');
  });

  it('ไม่มีบิลที่ใช้ตัวเลือกเลย ต้องไม่หารศูนย์', () => {
    const c = computeModifierCoverage({ orders: [], beanModifiers: mods, stock });
    expect(c.coveragePct).toBe(0);
    expect(c.rows).toEqual([]);
  });
});

describe('computeItemPerformance', () => {
  const orders = [
    order('2026-08', 300, [
      { name: 'ลาเต้', price: 80, quantity: 2 },   // ยอด 160 ทุน 26 กำไร 134
      { name: 'เค้ก', price: 140, quantity: 1 },   // ยอด 140 ทุน 35 กำไร 105
    ]),
  ];

  it('รวมยอด ต้นทุน และกำไรต่อเมนู พร้อมส่วนแบ่ง', () => {
    const items = computeItemPerformance({ orders, menu, stock });
    const latte = items.find(i => i.name === 'ลาเต้');
    expect(latte).toMatchObject({ units: 2, revenue: 160, cogs: 26, grossProfit: 134, marginPct: 84 });
    expect(Math.round(latte.revenueShare)).toBe(53);
    expect(Math.round(latte.profitShare)).toBe(56);
  });

  it('เรียงตามกำไร ไม่ใช่ยอดขาย เพราะสองอย่างนี้มักคนละตัวกัน', () => {
    const items = computeItemPerformance({ orders, menu, stock });
    expect(items[0].name).toBe('ลาเต้'); // ยอดน้อยกว่าเค้กต่อชิ้น แต่กำไรรวมสูงกว่า
  });

  it('เมนูที่ยังไม่ผูกต้นทุนถูกทำเครื่องหมายไว้ ไม่ใช่ปล่อยผ่านเป็นทุน 0', () => {
    const items = computeItemPerformance({
      orders: [order('2026-08', 60, [{ name: 'ยังไม่ผูก', price: 60, quantity: 1 }])],
      menu, stock,
    });
    expect(items[0]).toMatchObject({ costed: false, cogs: 0, marginPct: 100 });
  });
});

describe('classifyMenuEngineering', () => {
  it('แบ่ง 4 กลุ่มด้วยค่ากลางของร้านเอง', () => {
    const items = [
      { name: 'A', units: 100, marginPct: 80, costed: true },
      { name: 'B', units: 100, marginPct: 20, costed: true },
      { name: 'C', units: 2, marginPct: 80, costed: true },
      { name: 'D', units: 2, marginPct: 20, costed: true },
    ];
    const { items: out } = classifyMenuEngineering(items);
    expect(out.map(i => i.segment)).toEqual(['star', 'workhorse', 'puzzle', 'dog']);
  });

  it('เมนูที่ยังไม่ผูกต้นทุนต้องไม่ถูกนับเข้าค่ากลาง ไม่งั้นเส้นแบ่งเพี้ยนทั้งกระดาน', () => {
    const items = [
      { name: 'A', units: 10, marginPct: 50, costed: true },
      { name: 'B', units: 10, marginPct: 60, costed: true },
      { name: 'ผี', units: 999, marginPct: 100, costed: false },
    ];
    const { items: out, unitsMedian, marginMedian } = classifyMenuEngineering(items);
    expect(unitsMedian).toBe(10);
    expect(marginMedian).toBe(55);
    expect(out.find(i => i.name === 'ผี').segment).toBe('unknown');
  });

  it('ไม่มีเมนูที่ผูกต้นทุนเลย ต้องไม่ระเบิด', () => {
    const { items: out, unitsMedian } = classifyMenuEngineering([{ name: 'X', units: 5, marginPct: 100, costed: false }]);
    expect(unitsMedian).toBe(0);
    expect(out[0].segment).toBe('unknown');
  });
});

describe('concentration', () => {
  it('บอกว่ากี่เมนูรวมกันได้กำไร 80%', () => {
    // 700 = 70% ยังไม่ถึง · บวก 150 เป็น 85% ถึงแล้ว จึงตอบ 2
    const items = [
      { grossProfit: 700 }, { grossProfit: 150 }, { grossProfit: 100 }, { grossProfit: 50 },
    ];
    expect(concentration(items)).toEqual({ count: 2, of: 4, sharePct: 80 });
  });

  it('เมนูเดียวที่ถึง 80% พอดี ต้องตอบ 1 ไม่ใช่เผื่อไปอีกตัว', () => {
    const items = [{ grossProfit: 800 }, { grossProfit: 150 }, { grossProfit: 50 }];
    expect(concentration(items).count).toBe(1);
  });

  it('ไม่มีกำไรเลยต้องไม่หารศูนย์', () => {
    expect(concentration([{ grossProfit: 0 }])).toEqual({ count: 0, of: 1, sharePct: 80 });
  });
});

describe('growth', () => {
  it('คิด % เทียบเดือนก่อน', () => {
    expect(growth(150, 100)).toBe(50);
    expect(growth(50, 100)).toBe(-50);
  });
  it('เดือนก่อนเป็นศูนย์ ถือว่าเทียบไม่ได้ ไม่ใช่โต 100%', () => {
    expect(growth(100, 0)).toBeNull();
  });
});

describe('computeHeadlineKpis', () => {
  it('คิดยอดต่อบิลและการเติบโตจากชุดรายเดือน', () => {
    const kpis = computeHeadlineKpis({
      orders: [{ total: 100 }, { total: 300 }],
      items: [{ name: 'A', grossProfit: 90, revenue: 100, units: 2, costed: true, marginPct: 90 }],
      profitability: { revenue: 400, grossProfit: 300, unitsSold: 8 },
      series: [{ revenue: 200, grossProfit: 100 }, { revenue: 400, grossProfit: 300 }],
    });
    expect(kpis.bills).toBe(2);
    expect(kpis.averageTicket).toBe(200);
    expect(kpis.grossProfitPerBill).toBe(150);
    expect(kpis.unitsPerBill).toBe(4);
    expect(kpis.revenueGrowth).toBe(100);
    expect(kpis.profitGrowth).toBe(200);
  });

  it('thinMargin ต้องตัดเมนูที่ขายน้อยทิ้ง เพราะขึ้นราคาแล้วไม่เปลี่ยนอะไร', () => {
    const items = [
      // ขายน้อยมากแต่มาร์จิ้นต่ำสุด ไม่ควรติดอันดับ
      { name: 'ขายชิ้นเดียว', units: 1, marginPct: 2, costed: true },
      ...Array.from({ length: 6 }, (_, n) => ({
        name: `ขายดี${n}`, units: 50 + n, marginPct: 20 + n, costed: true,
      })),
    ];
    const { thinMargin } = computeHeadlineKpis({ items });
    expect(thinMargin.map(i => i.name)).not.toContain('ขายชิ้นเดียว');
    // ค่ากลางของ [1,50,51,52,53,54,55] คือ 52 · ขายดี0 กับ 1 จึงตกเกณฑ์ไปด้วย
    // เหลือ 52-55 แล้วมาร์จิ้นต่ำสุดในกลุ่มนั้นคือขายดี2
    expect(thinMargin[0].name).toBe('ขายดี2');
  });

  it('เมนูมาร์จิ้นต่ำกว่าแต่ขายน้อยกว่าค่ากลาง ต้องไม่ถูกลากกลับเข้ามา', () => {
    const items = [
      { name: 'A', units: 10, marginPct: 30, costed: true },
      { name: 'B', units: 1, marginPct: 10, costed: true },
    ];
    const { thinMargin } = computeHeadlineKpis({ items });
    expect(thinMargin.map(i => i.name)).toEqual(['A']);
  });

  it('ไม่มีบิลเลยต้องไม่หารศูนย์', () => {
    const kpis = computeHeadlineKpis({});
    expect(kpis.averageTicket).toBe(0);
    expect(kpis.revenueGrowth).toBeNull();
  });
});
