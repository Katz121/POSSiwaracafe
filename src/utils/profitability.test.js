import { describe, it, expect } from 'vitest';
import { computeProfitability, computeUnitCost, splitExpenses } from './profitability';

const stock = [
  { id: 'bean', unitCost: 0.5 },   // บาทต่อกรัม
  { id: 'milk', unitCost: 0.03 },  // บาทต่อมิลลิลิตร
  { id: 'cup', unitCost: 4 },      // บาทต่อใบ
];

const menu = [
  {
    name: 'ลาเต้',
    additionalCost: 0,
    stockLinks: [
      { stockId: 'bean', usage: 18 },   // 9
      { stockId: 'milk', usage: 200 },  // 6
      { stockId: 'cup', usage: 1 },     // 4
    ],
  },
  { name: 'เค้กมะพร้าว', additionalCost: 35, stockLinks: [] },
  { name: 'เมนูยังไม่ผูกสต็อก', stockLinks: [] },
];

const order = (total, items) => ({ total, items });

describe('computeUnitCost', () => {
  const menuByName = new Map(menu.map((m) => [m.name, m]));
  const stockById = new Map(stock.map((s) => [s.id, s]));

  it('รวมต้นทุนจากทุก stockLink', () => {
    const { cost, costed } = computeUnitCost({ name: 'ลาเต้' }, menuByName, stockById);
    expect(cost).toBe(19);
    expect(costed).toBe(true);
  });

  it('ใช้ stockLinks ที่ติดมากับบิลก่อนสูตรกลาง (ลูกค้าเลือกเมล็ดพิเศษ)', () => {
    const { cost } = computeUnitCost(
      { name: 'ลาเต้', stockLinks: [{ stockId: 'bean', usage: 40 }] },
      menuByName,
      stockById,
    );
    expect(cost).toBe(20);
  });

  it('additionalCost อย่างเดียวก็ถือว่าคิดต้นทุนแล้ว', () => {
    const { cost, costed } = computeUnitCost({ name: 'เค้กมะพร้าว' }, menuByName, stockById);
    expect(cost).toBe(35);
    expect(costed).toBe(true);
  });

  it('เมนูที่ยังไม่ผูกอะไรเลย ต้องรายงานว่าไม่ได้คิดต้นทุน ไม่ใช่ต้นทุน 0', () => {
    const { cost, costed } = computeUnitCost({ name: 'เมนูยังไม่ผูกสต็อก' }, menuByName, stockById);
    expect(cost).toBe(0);
    expect(costed).toBe(false);
  });

  it('บิลเก่าที่สูตรชี้ไปสต็อกที่ถูกลบ ต้องถอยไปประมาณจากสูตรปัจจุบัน ไม่ใช่ตีเป็นศูนย์', () => {
    // เคสจริง: เจ้าของร้านเพิ่งมาผูกสต็อกทีหลัง เมล็ดตัวเก่าถูกลบไปแล้ว
    // 181 จาก 198 แก้วของอเมริกาโน่ #คั่วเข้ม ตกกรณีนี้ มาร์จิ้นเลยขึ้น 99%
    const r = computeUnitCost(
      { name: 'ลาเต้', stockLinks: [{ stockId: 'ของที่ลบไปแล้ว', usage: 10 }] },
      menuByName,
      stockById,
    );
    expect(r.cost).toBe(19); // สูตรปัจจุบันของลาเต้
    expect(r.costed).toBe(true);
    expect(r.estimated).toBe(true);
    expect(r.missingLinks).toBe(1);
  });

  it('ประมาณจากสูตรปัจจุบันต้องรวมตัวเลือกที่ลูกค้าเลือกด้วย', () => {
    const modifiersByName = new Map([
      ['คั่วเข้ม', { name: 'คั่วเข้ม', stockLinks: [{ stockId: 'bean', usage: 18 }] }],
    ]);
    const r = computeUnitCost(
      { name: 'เค้กมะพร้าว', beanModifier: '#คั่วเข้ม', stockLinks: [{ stockId: 'ตายแล้ว', usage: 1 }] },
      menuByName, stockById, modifiersByName,
    );
    expect(r.cost).toBe(44); // additionalCost 35 + เมล็ด 18g × 0.5
    expect(r.estimated).toBe(true);
  });

  it('บิลที่มีลิงก์ตายปนอยู่ ต้องประมาณใหม่ทั้งชุด ไม่ใช่คิดเฉพาะตัวที่เหลือ', () => {
    // เคสจริงที่พบมากที่สุด: บิลเก็บ [แก้ว(ยังอยู่), เมล็ด(ถูกลบ)]
    // ถ้าคิดเฉพาะแก้วจะได้ต้นทุนไม่ครบแบบเงียบๆ ซึ่งอันตรายกว่าไม่มีเลย
    const modifiersByName = new Map([
      ['คั่วเข้ม', { name: 'คั่วเข้ม', stockLinks: [{ stockId: 'bean', usage: 18 }] }],
    ]);
    const r = computeUnitCost(
      { name: 'ลาเต้', beanModifier: '#คั่วเข้ม',
        stockLinks: [{ stockId: 'cup', usage: 1 }, { stockId: 'เมล็ดที่ถูกลบ', usage: 18 }] },
      menuByName, stockById, modifiersByName,
    );
    // สูตรปัจจุบันของลาเต้ (เมล็ด 18g + แก้ว) รวมกับตัวเลือกอีก 18g
    expect(r.cost).toBe(28);
    expect(r.estimated).toBe(true);
    expect(r.missingLinks).toBe(1);
  });

  it('สูตรในบิลที่ยังใช้ได้ ต้องไม่ถูกแทนที่ด้วยสูตรปัจจุบัน', () => {
    const r = computeUnitCost(
      { name: 'ลาเต้', stockLinks: [{ stockId: 'bean', usage: 40 }] },
      menuByName, stockById,
    );
    expect(r.cost).toBe(20); // ใช้ 40g ตามบิล ไม่ใช่ 18g ตามสูตรวันนี้
    expect(r.estimated).toBe(false);
  });

  it('ประมาณไม่ได้เลย (ทั้งบิลและสูตรปัจจุบันตายหมด) ต้องบอกว่าคิดต้นทุนไม่ได้', () => {
    const r = computeUnitCost(
      { name: 'ยังไม่ผูก', stockLinks: [{ stockId: 'ตายแล้ว', usage: 5 }] },
      menuByName, stockById,
    );
    expect(r.costed).toBe(false);
    expect(r.cost).toBe(0);
    expect(r.estimated).toBe(false);
  });
});

describe('splitExpenses', () => {
  it('แยกของเข้าคลัง ของเสีย และค่าใช้จ่ายดำเนินงาน ออกจากกัน', () => {
    const result = splitExpenses([
      { category: 'วัตถุดิบ', amount: 5000 },
      { category: 'เมล็ดกาแฟ', amount: 3000 },
      { category: 'บรรจุภัณฑ์', amount: 1200 },
      { category: 'ของเสีย (Waste)', amount: 400 },
      { category: 'ค่าเช่า', amount: 15000 },
      { category: 'ค่าไฟ', amount: 2500 },
    ]);
    expect(result.inventory).toBe(9200);
    expect(result.waste).toBe(400);
    expect(result.operating).toBe(17500);
  });

  it('หมวดที่ไม่รู้จักถือเป็นค่าใช้จ่ายดำเนินงาน ไม่ใช่ของเข้าคลัง', () => {
    expect(splitExpenses([{ category: 'ค่าซ่อมเครื่อง', amount: 800 }]).operating).toBe(800);
  });
});

describe('computeProfitability', () => {
  const orders = [
    order(160, [{ name: 'ลาเต้', price: 80, quantity: 2 }]),
    order(80, [{ name: 'ลาเต้', price: 80, quantity: 1 }]),
  ];

  it('กำไรขั้นต้นตัดต้นทุนตอนขาย ไม่ใช่ตอนซื้อ', () => {
    const r = computeProfitability({
      orders,
      // ตุนของ 60,000 ในเดือนนี้ แต่ใช้จริงแค่ 3 แก้ว
      expenses: [{ category: 'วัตถุดิบ', amount: 60000 }],
      menu,
      stock,
    });
    expect(r.revenue).toBe(240);
    expect(r.cogs).toBe(57);          // 19 × 3
    expect(r.grossProfit).toBe(183);
    expect(r.grossMargin).toBe(76);
  });

  it('ห้ามหักค่าซื้อวัตถุดิบซ้ำในกำไรสุทธิ (ถูกนับผ่าน COGS แล้ว)', () => {
    const r = computeProfitability({
      orders,
      expenses: [
        { category: 'วัตถุดิบ', amount: 60000 },
        { category: 'ค่าเช่า', amount: 100 },
      ],
      menu,
      stock,
    });
    // 240 − 57 − 100 · ไม่มี 60000 ในสมการนี้
    expect(r.netProfit).toBe(83);
    expect(r.inventoryPurchases).toBe(60000);
  });

  it('ของเสียนับในกำไร แต่ไม่นับในเงินสด (เงินออกไปแล้วตอนซื้อ)', () => {
    const r = computeProfitability({
      orders,
      expenses: [
        { category: 'วัตถุดิบ', amount: 1000 },
        { category: 'ของเสีย (Waste)', amount: 200 },
      ],
      menu,
      stock,
    });
    expect(r.netProfit).toBe(240 - 57 - 200);
    // เงินสด: 240 − 1000 · ของเสีย 200 ไม่ถูกหักซ้ำ
    expect(r.cashFlow).toBe(-760);
  });

  it('เดือนที่ตุนของหนัก เงินสดติดลบได้ทั้งที่กำไรเป็นบวก', () => {
    const r = computeProfitability({
      orders,
      expenses: [{ category: 'วัตถุดิบ', amount: 500 }],
      menu,
      stock,
    });
    expect(r.grossProfit).toBeGreaterThan(0);
    expect(r.cashFlow).toBeLessThan(0);
    expect(r.inventoryMovement).toBe(500 - 57); // ของในคลังเพิ่มขึ้นเท่านี้
  });

  it('จุดคุ้มทุน = ค่าใช้จ่ายคงที่ ÷ กำไรขั้นต้นต่อหน่วย', () => {
    const r = computeProfitability({
      orders,
      expenses: [{ category: 'ค่าเช่า', amount: 610 }],
      menu,
      stock,
    });
    expect(r.contributionPerUnit).toBe(61); // (240 − 57) ÷ 3
    expect(r.breakEvenUnits).toBe(10);      // 610 ÷ 61
    expect(r.unitsToBreakEven).toBe(7);     // ขายไป 3 แล้ว
    expect(r.pastBreakEven).toBe(false);
  });

  it('ค่าใช้จ่ายคงที่นอกระบบถูกนับในจุดคุ้มทุนและกำไรสุทธิ', () => {
    const r = computeProfitability({
      orders, expenses: [], menu, stock, extraFixedCosts: 610,
    });
    expect(r.fixedCosts).toBe(610);
    expect(r.breakEvenUnits).toBe(10);
    expect(r.netProfit).toBe(183 - 610);
  });

  it('ถ้ากำไรขั้นต้นต่อหน่วยติดลบ ต้องบอกว่าไม่มีจุดคุ้มทุน ไม่ใช่คืนเลขมั่ว', () => {
    const r = computeProfitability({
      orders: [order(10, [{ name: 'ลาเต้', price: 10, quantity: 1 }])],
      expenses: [{ category: 'ค่าเช่า', amount: 5000 }],
      menu,
      stock,
    });
    expect(r.contributionPerUnit).toBeLessThan(0);
    expect(r.breakEvenUnits).toBeNull();
    expect(r.unitsToBreakEven).toBeNull();
    expect(r.pastBreakEven).toBe(false);
  });

  it('รายงานว่ายอดขายกี่ % ที่ผูกต้นทุนไว้แล้ว และเมนูไหนยังไม่ผูก', () => {
    const r = computeProfitability({
      orders: [
        order(80, [{ name: 'ลาเต้', price: 80, quantity: 1 }]),
        order(120, [{ name: 'เมนูยังไม่ผูกสต็อก', price: 60, quantity: 2 }]),
      ],
      expenses: [],
      menu,
      stock,
    });
    expect(r.cogsCoverage).toBe(40); // 80 จาก 200
    expect(r.uncostedItems).toEqual([
      { name: 'เมนูยังไม่ผูกสต็อก', quantity: 2, revenue: 120 },
    ]);
  });

  it('ยังไม่ได้บันทึกค่าใช้จ่ายคงที่ ต้องไม่บอกว่าผ่านจุดคุ้มทุนแล้ว', () => {
    const r = computeProfitability({ orders, expenses: [], menu, stock });
    expect(r.hasFixedCosts).toBe(false);
    expect(r.pastBreakEven).toBe(false);
  });

  it('เมล็ดกาแฟที่ลูกค้าเลือก (#ตัวเลือก) ถูกคิดต้นทุนผ่าน stockLinks ที่แนบมากับบิล', () => {
    const r = computeProfitability({
      orders: [order(80, [{
        name: 'เอสเพรสโซ่เย็น',
        price: 80,
        quantity: 1,
        beanModifier: '#คั่วเข้ม',
        // ตอนสั่ง ระบบรวม stockLinks ของเมนู (แก้ว) กับของเมล็ดที่เลือก (18 กรัม) ไว้แล้ว
        stockLinks: [{ stockId: 'cup', usage: 1 }, { stockId: 'bean', usage: 18 }],
      }])],
      expenses: [],
      menu: [{ name: 'เอสเพรสโซ่เย็น', additionalCost: 2.5, stockLinks: [{ stockId: 'cup', usage: 1 }] }],
      stock,
    });
    expect(r.cogs).toBe(15.5); // 2.5 + 4 + 9
    expect(r.cogsCoverage).toBe(100);
    expect(r.suspiciousItems).toEqual([]);
  });

  it('ผูกแค่บางส่วน (เมล็ดอยู่ที่ตัวเลือกที่ยังไม่ผูก) ต้องถูกจับว่าน่าสงสัย', () => {
    const r = computeProfitability({
      // ผูกแต่แก้ว 4 บาท จากราคา 80 = 5% ต่ำผิดปกติ
      orders: [order(80, [{ name: 'เอสเพรสโซ่เย็น', price: 80, quantity: 1, stockLinks: [{ stockId: 'cup', usage: 1 }] }])],
      expenses: [],
      menu: [{ name: 'เอสเพรสโซ่เย็น', stockLinks: [] }],
      stock,
    });
    expect(r.cogsCoverage).toBe(100); // ผ่านด่าน "คิดต้นทุนแล้ว" ได้
    expect(r.suspiciousItems).toEqual([
      { name: 'เอสเพรสโซ่เย็น', quantity: 1, revenue: 80, cost: 4 },
    ]);
  });

  it('ต้นทุนสมเหตุสมผลต้องไม่ถูกจับว่าน่าสงสัย', () => {
    const r = computeProfitability({
      orders: [order(80, [{ name: 'ลาเต้', price: 80, quantity: 1 }])],
      expenses: [], menu, stock,
    });
    expect(r.suspiciousItems).toEqual([]); // 19 จาก 80 = 24%
  });

  it('VAT ไม่ใช่รายได้ของร้าน ต้องถูกหักออกจากยอดก่อนคิดกำไร', () => {
    const r = computeProfitability({
      // ลูกค้าจ่าย 107 (สินค้า 100 + VAT 7) · รายได้ของร้านคือ 100
      orders: [{ total: 107, vat: 7, items: [{ name: 'ลาเต้', price: 100, quantity: 1 }] }],
      expenses: [], menu, stock,
    });
    expect(r.revenue).toBe(100);
    expect(r.vatCollected).toBe(7);
    expect(r.grossProfit).toBe(81); // 100 − 19
  });

  it('ของเสียไม่ใช่ค่าใช้จ่ายคงที่ ต้องไม่ดันจุดคุ้มทุนให้สูงขึ้น', () => {
    const base = {
      orders, expenses: [{ category: 'ค่าเช่า', amount: 610 }], menu, stock,
    };
    const clean = computeProfitability(base);
    const wasted = computeProfitability({
      ...base,
      expenses: [...base.expenses, { category: 'ของเสีย (Waste)', amount: 300 }],
    });
    // ค่าเช่าเท่าเดิม ค่าใช้จ่ายคงที่จึงต้องเท่าเดิม
    expect(clean.fixedCosts).toBe(610);
    expect(wasted.fixedCosts).toBe(610);
    // ของเสียไปลดกำไรส่วนเกินต่อหน่วยแทน
    expect(wasted.contributionPerUnit).toBeLessThan(clean.contributionPerUnit);
    // และยังหักออกจากกำไรสุทธิครบ
    expect(wasted.netProfit).toBe(clean.netProfit - 300);
    expect(wasted.periodCosts).toBe(910);
  });

  it('สมการต้องปิดพอดี: กำไรสุทธิ = จำนวนขาย × กำไรส่วนเกินต่อหน่วย − ค่าใช้จ่ายคงที่', () => {
    const r = computeProfitability({
      orders,
      expenses: [
        { category: 'ค่าเช่า', amount: 500 },
        { category: 'ของเสีย (Waste)', amount: 120 },
        { category: 'วัตถุดิบ', amount: 9000 },
      ],
      menu, stock, extraFixedCosts: 250,
    });
    expect(r.unitsSold * r.contributionPerUnit - r.fixedCosts).toBeCloseTo(r.netProfit, 6);
  });

  it('ที่จุดคุ้มทุนพอดี กำไรสุทธิต้องเป็นศูนย์', () => {
    const r = computeProfitability({
      orders, expenses: [{ category: 'ค่าเช่า', amount: 610 }], menu, stock,
    });
    expect(r.breakEvenUnits * r.contributionPerUnit - r.fixedCosts).toBeGreaterThanOrEqual(0);
    // ขายน้อยกว่าจุดคุ้มทุนหนึ่งหน่วย ต้องยังขาดทุน
    expect((r.breakEvenUnits - 1) * r.contributionPerUnit - r.fixedCosts).toBeLessThan(0);
  });

  it('ไม่มีออเดอร์เลยต้องไม่ระเบิดหรือหารศูนย์', () => {
    const r = computeProfitability({ orders: [], expenses: [], menu, stock });
    expect(r.revenue).toBe(0);
    expect(r.grossMargin).toBe(0);
    expect(r.contributionPerUnit).toBe(0);
    expect(r.breakEvenUnits).toBeNull();
    expect(r.cogsCoverage).toBe(0);
  });
});
