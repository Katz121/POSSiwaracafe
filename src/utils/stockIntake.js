import { STOCK_CATEGORIES } from '../config/constants';

// หมวดหมู่ที่ถือเป็นสินค้าคงคลัง ต้องมีการอัพเดตสต็อกเมื่อมีการซื้อ
export const INVENTORY_CATEGORIES = ['วัตถุดิบ', ...STOCK_CATEGORIES];

// ตรวจสอบว่าหมวดหมู่นี้เป็นสินค้าคงคลังหรือไม่
export function isInventoryCategory(cat) {
  return INVENTORY_CATEGORIES.includes(cat);
}

// ปัดเศษตัวเงินให้เหลือ 2 ตำแหน่ง เพื่อลบ float noise เช่น 400.00000000004 -> 400
export function roundMoney(n) {
  const val = Number(n);
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

// ปัดเศษต้นทุนต่อหน่วยให้เหลือ 6 ตำแหน่ง สำหรับป้องกัน float noise ตอนหาร
export function roundUnitCost(n) {
  const val = Number(n);
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 1000000) / 1000000;
}

// จัดให้หน่วยต่างๆ อยู่ในรูปแบบมาตรฐานเดียวกัน เพื่อง่ายต่อการคำนวณและเปรียบเทียบ
export function normalizeUnit(u) {
  if (typeof u !== 'string') return '';
  const trimmed = u.trim();
  const lower = trimmed.toLocaleLowerCase('en');
  
  const map = {
    'g': 'กรัม', 'gram': 'กรัม', 'grams': 'กรัม', 'ก.': 'กรัม', 'กร.': 'กรัม', 'กรัม': 'กรัม',
    'kg': 'กิโลกรัม', 'กก.': 'กิโลกรัม', 'กิโล': 'กิโลกรัม', 'กิโลกรัม': 'กิโลกรัม',
    'ml': 'มล.', 'มล': 'มล.', 'มล.': 'มล.', 'cc': 'มล.', 'ซีซี': 'มล.', 'มิลลิลิตร': 'มล.',
    'l': 'ลิตร', 'ล.': 'ลิตร', 'ลิตร': 'ลิตร',
    'pcs': 'ชิ้น', 'pc': 'ชิ้น', 'ea': 'ชิ้น', 'อัน': 'ชิ้น', 'ชิ้น': 'ชิ้น'
  };
  
  return map[lower] || trimmed;
}

// หาตัวคูณเพื่อแปลงหน่วยจาก fromUnit ไปยัง toUnit
export function unitFactor(fromUnit, toUnit) {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  
  if (from === to) return 1;
  if (from === 'กิโลกรัม' && to === 'กรัม') return 1000;
  if (from === 'กรัม' && to === 'กิโลกรัม') return 0.001;
  if (from === 'ลิตร' && to === 'มล.') return 1000;
  if (from === 'มล.' && to === 'ลิตร') return 0.001;
  
  return null;
}

// ทำความสะอาดชื่อ ลบ space ส่วนเกิน และเปลี่ยนเป็นพิมพ์เล็กเพื่อใช้ค้นหา
export function normalizeName(s) {
  if (typeof s !== 'string') return '';
  return s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('th');
}

// คำนวณต้นทุนเฉลี่ยถ่วงน้ำหนัก
// สาเหตุ: ถ้าสต็อกเดิมติดลบ หรือต้นทุนเดิมไม่ถูกต้อง จะข้ามการเอาของเก่ามาคิดเพื่อไม่ให้ราคาพัง
export function weightedAverageUnitCost({ onHandQty, onHandUnitCost, inQty, inUnitCost }) {
  const oldQty = Number(onHandQty) || 0;
  const oldCost = Number(onHandUnitCost) || 0;
  const newQty = Number(inQty) || 0;
  const newCost = Number(inUnitCost) || 0;

  if (oldQty <= 0 || oldCost <= 0 || !Number.isFinite(oldCost)) {
    return roundUnitCost(newCost);
  }

  const totalQty = oldQty + newQty;
  if (totalQty <= 0) return roundUnitCost(newCost);
  
  return roundUnitCost(((oldQty * oldCost) + (newQty * newCost)) / totalQty);
}

// ค้นหาสต็อกที่ตรงกับ alias (เช่น บาร์โค้ด หรือชื่อเรียกเดิมตอนซื้อ)
export function findAliasMatch(stockItems, { barcode, title }) {
  const barcodeQuery = typeof barcode === 'string' && barcode.trim() !== '' && /^\d+$/.test(barcode.trim()) ? barcode.trim() : null;
  const titleQuery = normalizeName(title);

  for (const stock of stockItems) {
    if (!Array.isArray(stock.purchaseAliases)) continue;
    
    for (const alias of stock.purchaseAliases) {
      if (barcodeQuery && alias.barcode === barcodeQuery) {
        return { stock, alias };
      }
      if (titleQuery && alias.title && normalizeName(alias.title) === titleQuery) {
        return { stock, alias };
      }
    }
  }
  
  return null;
}

// ค้นหาสต็อกที่น่าจะเป็นไปได้จากชื่อที่รับเข้ามา
export function findStockCandidates(stockItems, title, limit = 3) {
  const query = normalizeName(title);
  if (!query) return [];

  // ถ้าตรงเป๊ะ คืนตัวนั้นตัวเดียว
  const exactMatch = stockItems.find(s => normalizeName(s.name) === query);
  if (exactMatch) return [exactMatch];

  // ค้นหาแบบให้คะแนน
  const queryTokens = query.split(' ').filter(Boolean);
  const scored = stockItems.map(stock => {
    const stockName = normalizeName(stock.name);
    let score = 0;
    
    if (stockName.includes(query) || query.includes(stockName)) {
      score += 2;
    }
    
    const stockTokens = stockName.split(' ').filter(Boolean);
    for (const qt of queryTokens) {
      if (stockTokens.includes(qt)) {
        score += 1;
      }
    }
    
    return { stock, score, name: stockName };
  }).filter(item => item.score > 0);
  
  // เรียงตามคะแนน และตามตัวอักษร
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name, 'th');
  });
  
  return scored.slice(0, limit).map(item => item.stock);
}

// วางแผนการเพิ่มสต็อก คำนวณจำนวนและราคาตามหน่วยฐานของสต็อก
export function planStockIntake({ quantity, unit, amount }, stock, alias = null) {
  const qty = Number(quantity) || 0;
  const amt = Number(amount) || 0;
  
  const factor = (alias && alias.toBase != null) ? Number(alias.toBase) : unitFactor(unit, stock.unit);
  
  // แปลงหน่วยไม่ได้
  if (factor == null || factor <= 0) {
    return { 
      ok: false, 
      reason: 'unit-mismatch', 
      fromUnit: unit, 
      toUnit: stock.unit 
    };
  }
  
  const inQty = qty * factor;
  const inUnitCost = inQty > 0 ? roundUnitCost(amt / inQty) : 0;
  const newUnitCost = weightedAverageUnitCost({ 
    onHandQty: stock.quantity, 
    onHandUnitCost: stock.unitCost, 
    inQty, 
    inUnitCost 
  });
  
  const newQuantity = (Number(stock.quantity) || 0) + inQty;
  
  return {
    ok: true,
    stockId: stock.id,
    stockUnit: stock.unit,
    inQty,
    inUnitCost,
    newUnitCost,
    newQuantity
  };
}

// สมทบหลายรายการลงสต็อกเดียวกัน (เช่น บิลเดียวกันมีการซื้อของซ้ำกัน 2 บรรทัด)
export function applyIntakesSequentially(stock, lines) {
  let currentQty = Number(stock.quantity) || 0;
  let currentCost = Number(stock.unitCost) || 0;
  
  const plans = [];
  
  for (const line of lines) {
    const fakeStock = { ...stock, quantity: currentQty, unitCost: currentCost };
    const plan = planStockIntake(line, fakeStock, line.alias);
    
    plans.push(plan);
    
    if (plan.ok) {
      currentQty = plan.newQuantity;
      currentCost = plan.newUnitCost;
    }
  }
  
  return {
    plans,
    final: {
      quantity: currentQty,
      unitCost: currentCost
    }
  };
}

// สร้าง object ของรายจ่ายเพื่อเตรียมบันทึกลง Firestore
export function buildExpenseRecord(line, { date, plan = null, extra = {} }) {
  let title = String(line.title || '').trim();
  if (title.length > 120) title = title.substring(0, 120);
  
  const qty = Number(line.quantity) || 0;
  const amt = Number(line.amount) || 0;
  
  // ถ้ายอดจำนวนเท่ากับ 0 ก็เก็บค่า unitCost ตามยอดเงิน
  const pricePerUnit = qty > 0 ? roundUnitCost(amt / qty) : roundMoney(amt);
  
  // ห้ามเดาหมวดให้ · 'อื่น ๆ' อยู่ใน STOCK_CATEGORIES ถ้าตกไปเงียบๆ รายจ่ายอย่างค่าไฟ
  // จะถูกนับเป็นวัตถุดิบแล้วหลุดจากสมการกำไร (บั๊กเดิมของบอท Telegram)
  if (!line.category) throw new Error('buildExpenseRecord: category is required');

  const record = {
    title,
    quantity: qty,
    unit: String(line.unit || '').trim(),
    pricePerUnit,
    amount: roundMoney(amt),
    category: line.category,
    date,
    ...extra
  };
  
  if (plan && plan.ok) {
    record.stockId = plan.stockId;
    record.stockQuantity = plan.inQty;
    record.stockUnit = plan.stockUnit;
  }
  
  return record;
}
