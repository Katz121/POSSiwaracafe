/**
 * รวมสูตรวัตถุดิบของเมนู เข้ากับสูตรของตัวเลือก (#) ที่ลูกค้าเลือก
 *
 * ใช้ตอนหยิบของลงตะกร้า ผลลัพธ์ถูกเก็บลงบิลเพื่อให้รายงานต้นทุนย้อนหลังรู้ว่า
 * แก้วนั้นใช้เมล็ดหรือผงตัวไหนจริงๆ ไม่ใช่เดาจากสูตรกลางของเมนูในวันนี้
 *
 * เดิมมีโค้ดรวมสองชุดแยกกันระหว่างหน้าลูกค้ากับหน้า POS และผิดคนละแบบ:
 *
 * 1. หน้าลูกค้าบวกฟิลด์ `quantity` ทั้งที่ฟิลด์จริงชื่อ `usage` · เวลาที่เมนูกับ
 *    ตัวเลือกผูกสต็อกตัวเดียวกัน ปริมาณของตัวเลือกจึงหายไปเงียบๆ เช่นเมนูผูก
 *    เมล็ด 20 กรัม ตัวเลือกอีก 18 กรัม ควรได้ 38 แต่ได้ 20
 * 2. หน้า POS บวก `usage` ถูก แต่ทำ shallow copy ของอาเรย์แล้วเขียนทับ
 *    `existing.usage` ซึ่งเป็นอ็อบเจ็กต์ตัวเดียวกับที่อยู่ในสูตรของเมนูใน state
 *    การหยิบลงตะกร้าแต่ละครั้งจึงไปบวกสะสมทับสูตรกลางของเมนูไปเรื่อยๆ
 *
 * ตัวนี้จึงคืนอ็อบเจ็กต์ใหม่ทั้งหมดเสมอ ไม่แตะของเดิม และบวกที่ `usage`
 * ปริมาณในข้อมูลจริงมีทั้งตัวเลขและสตริง (`usage: "20"`) จึงแปลงเป็นตัวเลขก่อนบวก
 */

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * @param {Array} itemLinks สูตรของเมนู
 * @param {Array} modifierLinks สูตรของตัวเลือกที่เลือก (ส่งหลายชุดได้)
 * @returns {Array<{stockId: string, usage: number}>} สูตรรวม ไม่มี stockId ซ้ำ
 */
export function mergeStockLinks(itemLinks = [], ...modifierLinks) {
  const merged = new Map();

  [itemLinks, ...modifierLinks].forEach((links) => {
    (Array.isArray(links) ? links : []).forEach((link) => {
      const stockId = link?.stockId;
      if (!stockId) return;
      const prev = merged.get(stockId);
      merged.set(stockId, prev
        ? { ...prev, usage: prev.usage + num(link.usage) }
        : { ...link, stockId, usage: num(link.usage) });
    });
  });

  return [...merged.values()];
}
