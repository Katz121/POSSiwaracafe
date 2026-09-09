/**
 * กำไรขั้นต้น · กำไรสุทธิ · จุดคุ้มทุน
 *
 * ทำไมต้องมีไฟล์นี้: ตัวเลขที่หน้าแดชบอร์ดเรียกว่า "กำไร" ทุกวันนี้คือ
 * `รายได้ − รายจ่ายที่บันทึกในเดือนนั้น` ซึ่งทางบัญชีไม่ใช่กำไร แต่คือ
 * **กระแสเงินสด** · ตอนซื้อเมล็ดกาแฟเข้าสต็อก 60,000 เงินไม่ได้หายไป
 * มันเปลี่ยนรูปเป็นของในคลังที่ยังขายได้ การหักทั้งก้อนทันทีทำให้เดือนที่ตุนของ
 * ดูขาดทุนทั้งที่ร้านปกติ และเดือนที่กินของเก่าดูกำไรพุ่งทั้งที่ไม่ได้เก่งขึ้น
 *
 * ไฟล์นี้เพิ่มอีกมุมที่ตัดต้นทุน "ตอนขาย" แทน "ตอนซื้อ":
 *
 *   รายได้
 *   − ต้นทุนวัตถุดิบที่ใช้ไปจริง (COGS จากสูตรเมนู)
 *   = กำไรขั้นต้น            ← ตอบว่าเมนูไหนคุ้ม ตั้งราคาถูกไหม
 *   − ของเสีย
 *   − ค่าใช้จ่ายดำเนินงาน (เช่า ไฟ ค่าแรง การตลาด)
 *   = กำไรสุทธิ              ← ตอบว่าโมเดลร้านนี้ทำเงินได้จริงไหม
 *
 * **กติกาข้อเดียวที่ห้ามพลาด**: รายจ่ายหมวดวัตถุดิบ/สต็อก ห้ามถูกหักในสมการนี้
 * เพราะมันถูกนับผ่าน COGS ไปแล้ว ถ้าหักอีกรอบคือหักซ้ำ · ตัวคัดหมวดอยู่ที่
 * `splitExpenses` ด้านล่าง
 *
 * ฝั่งเงินสดก็ยังคำนวณให้ (`cashFlow`) เพราะร้านตายได้จากทั้งสองทาง กำไรดีแต่
 * เงินสดขาดมือก็เจ๊ง · แต่ฝั่งเงินสดต้อง **ไม่นับของเสีย** เพราะของเสียไม่ใช่เงิน
 * ที่ไหลออก เงินไหลออกไปแล้วตอนซื้อวัตถุดิบ (ของเดิมนับซ้ำตรงนี้)
 */

const WASTE_CATEGORY = 'ของเสีย (Waste)';

/**
 * ต่ำกว่านี้ถือว่าน่าสงสัยว่าผูกสต็อกไม่ครบ · เครื่องดื่มที่ต้นทุนวัตถุดิบต่ำกว่า 8%
 * ของราคาขายแทบไม่มีจริง แค่แก้วกับฝาก็ปาเข้าไป 5-8% แล้ว
 */
const SUSPICIOUS_COST_RATIO = 0.08;

/**
 * หมวดที่ถือเป็น "ซื้อของเข้าคลัง" ไม่ใช่ค่าใช้จ่ายของงวด
 * ต้องตรงกับ STOCK_CATEGORIES + 'วัตถุดิบ' ใน config/constants.js
 * (รับเข้ามาเป็นพารามิเตอร์เพื่อให้ไฟล์นี้เทสต์ได้โดยไม่ผูกกับ constants)
 */
export const DEFAULT_INVENTORY_CATEGORIES = [
  'วัตถุดิบ',
  'เมล็ดกาแฟ',
  'ผงชา/มัทฉะ/โกโก้',
  'นมและผลิตภัณฑ์นม',
  'ไซรัป/ซอส/ท็อปปิ้ง',
  'ผลไม้และของสด',
  'วัตถุดิบเบเกอรี่',
  'บรรจุภัณฑ์',
  'อุปกรณ์และของใช้',
];

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * ต้นทุนวัตถุดิบต่อ 1 หน่วยของรายการที่ขายไป
 *
 * ใช้ stockLinks ที่ติดมากับรายการในบิลก่อน (เมล็ดที่ลูกค้าเลือกถูก merge ไว้
 * ตอนสั่ง) แล้วค่อย fallback ไปสูตรกลางของเมนู สำหรับบิลเก่าที่ยังไม่มี
 *
 * @returns {{ cost: number, costed: boolean }} costed = หาต้นทุนได้จริงหรือไม่
 *   ใช้แยก "ต้นทุน 0 เพราะยังไม่ผูกสต็อก" ออกจาก "ต้นทุน 0 เพราะของแถม"
 */
export function computeUnitCost(orderItem, menuByName, stockById) {
  const menuItem = menuByName.get(orderItem?.name);
  const links = (Array.isArray(orderItem?.stockLinks) && orderItem.stockLinks.length)
    ? orderItem.stockLinks
    : (menuItem?.stockLinks || []);

  const additional = num(menuItem?.additionalCost);
  let cost = additional;
  let linkedAny = false;

  links.forEach((link) => {
    const stockItem = stockById.get(link?.stockId);
    if (!stockItem) return;
    linkedAny = true;
    cost += num(stockItem.unitCost) * num(link?.usage);
  });

  return { cost, costed: linkedAny || additional > 0 };
}

/**
 * แยกรายจ่ายเป็น 3 กอง เพราะแต่ละกองเข้าสมการคนละที่
 *  - inventory : ซื้อของเข้าคลัง · เข้าเฉพาะฝั่งเงินสด ห้ามเข้าฝั่งกำไร
 *  - waste     : ของเสีย · เข้าเฉพาะฝั่งกำไร ห้ามเข้าฝั่งเงินสด
 *  - operating : ที่เหลือ (เช่า ไฟ ค่าแรง การตลาด) · เข้าทั้งสองฝั่ง
 */
export function splitExpenses(expenses = [], inventoryCategories = DEFAULT_INVENTORY_CATEGORIES) {
  const inventorySet = new Set(inventoryCategories);
  const result = { inventory: 0, waste: 0, operating: 0 };

  expenses.forEach((expense) => {
    const amount = num(expense?.amount);
    const category = String(expense?.category || '');
    if (category === WASTE_CATEGORY) result.waste += amount;
    else if (inventorySet.has(category)) result.inventory += amount;
    else result.operating += amount;
  });

  return result;
}

/**
 * สรุปความสามารถทำกำไรของช่วงเวลาหนึ่ง
 *
 * @param {object} input
 * @param {Array}  input.orders   บิลที่ขายแล้วในช่วงนั้น (กรอง status/เดือนมาก่อน)
 * @param {Array}  input.expenses รายจ่ายในช่วงนั้น
 * @param {Array}  input.menu     เมนูทั้งหมด (เอาสูตร fallback + additionalCost)
 * @param {Array}  input.stock    สต็อกทั้งหมด (เอา unitCost)
 * @param {number} [input.extraFixedCosts] ค่าใช้จ่ายคงที่ที่ยังไม่ได้บันทึกในระบบ
 *   (ค่าเช่า/เงินเดือนที่จ่ายนอกระบบ) ใช้กับจุดคุ้มทุนและกำไรสุทธิ
 * @param {string[]} [input.inventoryCategories]
 */
export function computeProfitability({
  orders = [],
  expenses = [],
  menu = [],
  stock = [],
  extraFixedCosts = 0,
  inventoryCategories = DEFAULT_INVENTORY_CATEGORIES,
} = {}) {
  const menuByName = new Map(menu.map((m) => [m.name, m]));
  const stockById = new Map(stock.map((s) => [s.id, s]));

  let revenue = 0;
  let vatCollected = 0;
  let cogs = 0;
  let unitsSold = 0;
  let costedRevenue = 0;
  const uncosted = new Map();
  const suspicious = new Map();

  orders.forEach((order) => {
    // ยอดบิลคือเงินที่รับมาจริง (ผ่านส่วนลดมาแล้ว) แต่ **ต้องหัก VAT ออกก่อน**
    // จึงจะเป็นรายได้ของร้าน · VAT เป็นเงินที่ร้านเก็บแทนสรรพากรแล้วต้องนำส่ง
    // ไม่ใช่รายได้ · ถ้าไม่หัก มาร์จิ้นจะสูงเกินจริงเพราะ COGS ไม่มี VAT อยู่แล้ว
    // (ตอนนี้ร้านเปิด VAT แค่บิลเดียวจาก 2,092 แต่ต้องถูกไว้ก่อนวันที่เปิดใช้จริง)
    const vat = num(order?.vat);
    vatCollected += vat;
    revenue += num(order?.total) - vat;

    (order?.items || []).forEach((item) => {
      const qty = num(item?.quantity) || 1;
      const lineRevenue = num(item?.price) * qty;
      const { cost, costed } = computeUnitCost(item, menuByName, stockById);

      unitsSold += qty;
      cogs += cost * qty;
      if (costed) {
        costedRevenue += lineRevenue;
        // ผูกบางส่วนอันตรายกว่าไม่ผูกเลย เพราะมันผ่านด่าน "คิดต้นทุนแล้ว" ไปได้
        // เคสจริงที่เจอ: เมนูผูกแก้วกับนมไว้ แต่เมล็ดกาแฟอยู่ที่ตัวเลือก (#) และ
        // ตัวเลือกนั้นยังไม่ได้ผูกสต็อก ต้นทุนเลยเหลือแค่ค่าแก้ว 4 บาทจากราคา 80
        const price = num(item?.price);
        if (price > 0 && cost / price < SUSPICIOUS_COST_RATIO) {
          const name = String(item?.name || 'ไม่ระบุ');
          const prev = suspicious.get(name) || { name, quantity: 0, revenue: 0, cost: 0 };
          suspicious.set(name, {
            name,
            quantity: prev.quantity + qty,
            revenue: prev.revenue + lineRevenue,
            cost: prev.cost + cost * qty,
          });
        }
      } else {
        const name = String(item?.name || 'ไม่ระบุ');
        const prev = uncosted.get(name) || { name, quantity: 0, revenue: 0 };
        uncosted.set(name, { name, quantity: prev.quantity + qty, revenue: prev.revenue + lineRevenue });
      }
    });
  });

  const split = splitExpenses(expenses, inventoryCategories);

  // ของเสีย **ไม่ใช่ค่าใช้จ่ายคงที่** ตามหลัก CVP · มันผันแปรตามปริมาณที่ผลิตและขาย
  // เอาไปกองรวมกับค่าเช่าแล้วหารหาจุดคุ้มทุน จะได้ผลว่า "ยิ่งทำของเสีย ยิ่งต้องขาย
  // เยอะขึ้นถึงจะคุ้มค่าเช่า" ซึ่งผิดหลัก · ที่ถูกคือของเสียไปลด **กำไรส่วนเกินต่อหน่วย**
  // เพราะมันคือวัตถุดิบที่จ่ายไปแล้วแต่ไม่ได้กลายเป็นของขาย
  const fixedCosts = split.operating + num(extraFixedCosts);
  const periodCosts = fixedCosts + split.waste;

  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - periodCosts;

  // ฝั่งเงินสด: ของเสียไม่ใช่เงินไหลออก (จ่ายไปแล้วตอนซื้อ) จึงไม่นับ
  const cashOut = split.inventory + split.operating + num(extraFixedCosts);
  const cashFlow = revenue - cashOut;

  // กำไรส่วนเกินต่อหน่วย = (รายได้ − ต้นทุนผันแปรทั้งหมด) ÷ จำนวนที่ขาย
  // ต้นทุนผันแปร = COGS + ของเสีย · นิยามนี้ทำให้สมการปิดพอดี:
  //   netProfit = unitsSold × contributionPerUnit − fixedCosts
  const variableCosts = cogs + split.waste;
  const contributionPerUnit = unitsSold > 0 ? (revenue - variableCosts) / unitsSold : 0;
  const averagePrice = unitsSold > 0 ? revenue / unitsSold : 0;

  // จุดคุ้มทุนคำนวณได้ต่อเมื่อกำไรขั้นต้นต่อหน่วยเป็นบวก ถ้าติดลบแปลว่า
  // ยิ่งขายยิ่งขาดทุน ไม่มีจำนวนไหนที่คุ้มทุนได้
  //
  // ค่าใช้จ่ายคงที่เป็น 0 ไม่ได้แปลว่าร้านไม่มีค่าใช้จ่าย แต่แปลว่ายังไม่ได้บันทึก
  // ค่าเช่า/เงินเดือน/ค่าไฟ เข้าระบบ · ถ้าปล่อยผ่านจะได้ "จุดคุ้มทุน 0 หน่วย
  // ผ่านแล้ว" ซึ่งอ่านแล้วเข้าใจผิดว่ากำไรตั้งแต่แก้วแรก ต้องบอกให้รู้ตัว
  const hasFixedCosts = fixedCosts > 0;
  const canBreakEven = contributionPerUnit > 0;
  const breakEvenUnits = canBreakEven ? Math.ceil(fixedCosts / contributionPerUnit) : null;
  const breakEvenRevenue = canBreakEven ? Math.round(breakEvenUnits * averagePrice) : null;
  const unitsToBreakEven = canBreakEven ? Math.max(0, breakEvenUnits - unitsSold) : null;

  // ความน่าเชื่อถือของ COGS: ยอดขายกี่ % ที่มาจากรายการที่ผูกต้นทุนไว้แล้ว
  // ตัวนี้สำคัญกว่าที่คิด ถ้าผูกสต็อกไม่ครบ กำไรขั้นต้นจะสวยเกินจริงเสมอ
  const grossRevenueFromItems = costedRevenue
    + [...uncosted.values()].reduce((sum, item) => sum + item.revenue, 0);
  const cogsCoverage = grossRevenueFromItems > 0
    ? Math.round((costedRevenue / grossRevenueFromItems) * 100)
    : 0;

  return {
    revenue,
    cogs,
    grossProfit,
    grossMargin: revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0,
    cogsRatio: revenue > 0 ? Math.round((cogs / revenue) * 100) : 0,

    wasteCost: split.waste,
    vatCollected,
    operatingExpenses: split.operating,
    inventoryPurchases: split.inventory,
    extraFixedCosts: num(extraFixedCosts),
    // fixedCosts = ต้นทุนคงที่จริงๆ ใช้หาจุดคุ้มทุน · periodCosts = ทุกอย่างที่หัก
    // จากกำไรขั้นต้นในงวดนี้ (รวมของเสีย) ใช้หากำไรสุทธิ
    fixedCosts,
    periodCosts,
    variableCosts,

    netProfit,
    netMargin: revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0,

    cashFlow,
    // ส่วนต่างระหว่างกำไรกับเงินสด = ของที่ตุนเพิ่ม (บวก) หรือกินสต็อกเก่า (ลบ)
    inventoryMovement: split.inventory - cogs - split.waste,

    unitsSold,
    averagePrice,
    contributionPerUnit,
    breakEvenUnits,
    breakEvenRevenue,
    unitsToBreakEven,
    pastBreakEven: canBreakEven && hasFixedCosts ? unitsSold >= breakEvenUnits : false,
    hasFixedCosts,

    cogsCoverage,
    uncostedItems: [...uncosted.values()].sort((a, b) => b.revenue - a.revenue),
    // ผูกแล้วแต่ต้นทุนต่ำจนน่าสงสัยว่าตกอะไรไป (เช่น เมล็ดอยู่ที่ตัวเลือกที่ยังไม่ผูก)
    suspiciousItems: [...suspicious.values()].sort((a, b) => b.revenue - a.revenue),
  };
}
