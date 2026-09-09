/**
 * การตัดแบ่ง (yield) และของเสียของสินค้าสำเร็จรูป เช่นเค้กที่ตัดขายเป็นชิ้น
 *
 * ระบบนี้เป็นสินค้าคงเหลือแบบต่อเนื่อง (perpetual inventory) อยู่แล้ว:
 *   ซื้อของ  → สต็อกเพิ่ม + บันทึกรายจ่ายหมวดวัตถุดิบ
 *   ขายของ  → สต็อกลดตามสูตรของบิลนั้น (ดู stockDeducted ใน App.jsx)
 *   ของเสีย → สต็อกลด + บันทึกรายจ่ายหมวดของเสีย
 *
 * เค้กจึงไม่ต้องมีโครงสร้างข้อมูลใหม่ · เก็บ "เค้กทั้งก้อน" เป็นสต็อกหนึ่งรายการ
 * แล้วให้เมนู "เค้กชิ้น" ผูกสต็อกนั้นด้วย usage = 1 ÷ จำนวนชิ้นที่ตัดได้
 * ตัดได้ 8 ชิ้นก็ใช้ 0.125 ก้อนต่อชิ้น · ขาย 8 ชิ้นก็ครบพอดี 1 ก้อน
 *
 * ที่ขาดคือเครื่องมือ ไม่ใช่โมเดล: เจ้าของร้านไม่ควรต้องมานั่งคิดว่า 1/8 = 0.125
 * และไม่ควรต้องแปลง "เหลือ 3 ชิ้น" เป็น "0.375 ก้อน" ด้วยตัวเอง
 *
 * **กฎบัญชีที่ห้ามฝ่าฝืน**
 * 1. ของเสียตีมูลค่าด้วย **ราคาทุน** เท่านั้น ห้ามใช้ราคาขาย · ราคาขายมีกำไรที่
 *    ไม่เคยเกิดขึ้นจริงปนอยู่ ถ้าเอามาบันทึกเป็นรายจ่ายจะกลายเป็นการรับรู้ขาดทุน
 *    เกินกว่าที่เสียไปจริง
 * 2. ของเสียต้องทำสองอย่างพร้อมกันเสมอ: ตัดสต็อกออก **และ** บันทึกรายจ่าย
 *    ถ้าตัดสต็อกอย่างเดียวจะไม่มีใครเห็นว่าเสียไปเท่าไหร่ · ถ้าบันทึกรายจ่าย
 *    อย่างเดียวสต็อกจะค้างของที่ไม่มีอยู่จริง
 * 3. เมนูที่ยังไม่ผูกต้นทุน ตีมูลค่าของเสียไม่ได้ · ต้องบอกให้รู้ ไม่ใช่บันทึก 0
 *    แล้วปล่อยให้เข้าใจว่าทิ้งแล้วไม่เสียอะไร
 */

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** ปริมาณสต็อกที่ใช้ไปจากสูตรหนึ่งชุด คูณจำนวน · คืนเป็น { stockId: หน่วย } */
export function computeRecipeUsage(stockLinks = [], quantity = 1) {
  const usage = {};
  const qty = num(quantity);
  (Array.isArray(stockLinks) ? stockLinks : []).forEach((link) => {
    if (!link?.stockId) return;
    usage[link.stockId] = (usage[link.stockId] || 0) + qty * num(link.usage);
  });
  return usage;
}

/**
 * ปริมาณสต็อกที่บิลหนึ่งใช้ไปทั้งใบ
 * แต่ละรายการพกสูตรของตัวเอง (เมนู + ตัวเลือกที่เลือก) มาตั้งแต่ตอนสั่ง
 * จึงสะท้อนสิ่งที่ขายไปจริง ไม่ใช่สูตรกลางของเมนูในวันนี้
 */
export function computeOrderStockUsage(order) {
  const usage = {};
  (order?.items || []).forEach((item) => {
    const lineUsage = computeRecipeUsage(item?.stockLinks, num(item?.quantity));
    Object.entries(lineUsage).forEach(([stockId, used]) => {
      usage[stockId] = (usage[stockId] || 0) + used;
    });
  });
  return usage;
}

/**
 * แปลง "1 หน่วยสต็อก ตัดได้กี่ชิ้น" เป็นปริมาณที่ใช้ต่อชิ้น
 * เค้ก 1 ก้อนตัดได้ 8 ชิ้น → ชิ้นละ 0.125 ก้อน
 */
export function usageFromPortions(portions) {
  const n = num(portions);
  return n > 0 ? 1 / n : 0;
}

/** ทางกลับ ใช้แสดงในช่องกรอกว่าค่าที่บันทึกไว้เท่ากับกี่ชิ้นต่อหน่วย */
export function portionsFromUsage(usage) {
  const n = num(usage);
  return n > 0 ? 1 / n : 0;
}

/**
 * มูลค่าและปริมาณสต็อกของ "ของเสียระดับเมนู" เช่นเค้กที่ตัดไว้แล้วขายไม่หมด
 *
 * @param {object} input
 * @param {object} input.menuItem เมนูที่จะตัดทิ้ง (ต้องมี stockLinks หรือ additionalCost)
 * @param {number} input.quantity จำนวนชิ้นที่ทิ้ง
 * @param {Map}    input.stockById แผนที่สต็อกปัจจุบัน ใช้หาราคาทุนและกันลิงก์ที่ตายแล้ว
 * @returns {{costPerUnit:number, cost:number, usageByStock:object, costed:boolean,
 *            missingLinks:number}}
 */
export function computeMenuWaste({ menuItem, quantity = 1, stockById = new Map() } = {}) {
  const qty = Math.max(0, num(quantity));
  const links = Array.isArray(menuItem?.stockLinks) ? menuItem.stockLinks : [];

  let costPerUnit = num(menuItem?.additionalCost);
  let linkedAny = costPerUnit > 0;
  let missingLinks = 0;
  const usageByStock = {};

  links.forEach((link) => {
    if (!link?.stockId) return;
    const stockItem = stockById.get(link.stockId);
    if (!stockItem) {
      // ลิงก์ชี้ไปสต็อกที่ถูกลบแล้ว · นับไว้เพื่อเตือน ไม่ใช่เงียบแล้วตีเป็นศูนย์
      missingLinks += 1;
      return;
    }
    linkedAny = true;
    costPerUnit += num(stockItem.unitCost) * num(link.usage);
    usageByStock[link.stockId] = (usageByStock[link.stockId] || 0) + qty * num(link.usage);
  });

  return {
    costPerUnit,
    cost: costPerUnit * qty,
    usageByStock,
    costed: linkedAny,
    missingLinks,
  };
}

/**
 * ข้อความสำหรับบันทึกรายจ่ายของเสีย ให้รูปแบบเดียวกับที่หน้าคลังใช้อยู่
 * เพื่อให้รายงานจัดกลุ่มได้เหมือนกันและ splitExpenses คัดหมวดถูก
 */
export function buildWasteExpenseTitle(menuName, quantity, unitLabel = 'ชิ้น') {
  return `ของเสีย: ${String(menuName || 'ไม่ระบุ')} (x${num(quantity)} ${unitLabel})`;
}
