/**
 * Application Configuration Constants
 * ค่าเริ่มต้นของระบบ - สามารถปรับเปลี่ยนได้ผ่านหน้า Admin Settings
 */

// ==================== SECURITY ====================
export const DEFAULT_ADMIN_PIN = '';

// ==================== POINTS & REWARDS ====================
export const DEFAULT_REDEEM_POINTS_THRESHOLD = 100;  // แต้มขั้นต่ำที่ใช้แลกได้
export const DEFAULT_REDEEM_DISCOUNT_VALUE = 50;     // มูลค่าส่วนลดเมื่อแลกแต้ม (บาท)
export const DEFAULT_OWN_GLASS_DISCOUNT = 5;         // ส่วนลดนำแก้วมาเอง (บาท)
export const POINTS_PER_BAHT = 10;                   // ทุก X บาท ได้ 1 แต้ม

// ==================== MEMBER IDENTITY ====================
// เบอร์โทรคือ "ตัวตน" เดียวของสมาชิก — ชื่อเล่นซ้ำกันได้ (ข้อมูลจริงมี "แพรว" 3 คน
// คนละเบอร์) เบอร์ไม่ซ้ำ ดังนั้น:
//   MEMBER_MIN_PHONE_LENGTH  = ความยาวเบอร์ที่ถือว่า "มีเบอร์จริง"
//   ALLOW_NAME_ONLY_MEMBERS  = false → ลูกค้าที่ไม่มีเบอร์ "ไม่ถูกบันทึกเป็นสมาชิก"
//                              ชื่อเล่นยังติดอยู่บนบิลเหมือนเดิม (ไว้เรียกคิว/ดูยอด)
//                              แต่ไม่สร้าง doc `name:xxx` และไม่สะสมแต้ม
// เปลี่ยนเป็น true = กลับไปพฤติกรรมเดิม (ชื่อเล่นอย่างเดียวก็เป็นสมาชิกได้)
export const MEMBER_MIN_PHONE_LENGTH = 9;
export const ALLOW_NAME_ONLY_MEMBERS = false;

// ==================== TAX ====================
export const VAT_RATE = 0.07;                        // อัตรา VAT 7%
export const VAT_PERCENTAGE = 7;                     // สำหรับแสดงผล

// ==================== PRICE ROUNDING ====================
// ปัดราคาขึ้นเป็นพหุคูณของ 5 (สำหรับเมนูกาแฟ) เช่น 72→75, 102→105
export const roundUpTo5 = (n) => Math.ceil((Number(n) || 0) / 5) * 5;

// ==================== MENU MODIFIER GROUPS ====================
// เมนูหนึ่งเลือกได้หลายกลุ่มตัวเลือก (เช่น "ส้ม" + "เมล็ดกาแฟ") — เก็บใน
// modifierGroups (array). รองรับเมนูเดิมที่ใช้ modifierGroup (string) ตัวเดียว.
export const getModifierGroups = (item) => {
  if (!item?.allowBeanModifier) return [];
  return (Array.isArray(item.modifierGroups) && item.modifierGroups.length)
    ? item.modifierGroups
    : [item.modifierGroup || 'เมล็ดกาแฟ'];
};

// ตัวเลือกที่เป็น "เบส" คงราคาเมนูเดิม (ไม่บวกเพิ่ม)
export const isBaseModifier = (item, mod) =>
  !!mod && (mod.isDefault || (item?.baseBeanIds || []).includes(mod.id));

// ราคารวมแบบบวกเพิ่ม (additive): ฐาน = ราคาเมนู, แต่ละตัวเลือกที่ไม่ใช่เบสบวก
// ส่วนต่างของมัน เช่น ส้มสด 80 (ฐาน 60 → +20) + เมล็ดน้ำช่อ 75 (→ +15). ตัวเลือก
// กลุ่มเดียวจะเท่ากับ max(ราคาเมนู, ราคาตัวเลือก+ส่วนเพิ่ม) แบบเดิมทุกประการ.
export const computeModifierPrice = (item, mods) => {
  const base = Number(item?.price) || 0;
  const extra = Number(item?.beanExtra) || 0;
  const list = (Array.isArray(mods) ? mods : [mods]).filter(Boolean);
  const total = list.reduce((sum, mod) => {
    if (isBaseModifier(item, mod)) return sum;
    return sum + Math.max(0, (Number(mod.price) || 0) + extra - base);
  }, base);
  return roundUpTo5(total);
};

export const supportsMilkChoice = (item) => {
  const name = String(item?.name || '').trim().toLowerCase();
  return name.includes('ลาเต้') || name.includes('latte');
};

export const MILK_OPTIONS = [
  { value: 'cow', label: 'นมวัว', labelEn: "Cow's milk" },
  { value: 'oat', label: 'นมโอ๊ต', labelEn: 'Oat milk' },
];

// ==================== CAKE CLEARANCE (HAPPY HOUR) ====================
export const DEFAULT_CAKE_SALE_PERCENT = 20;         // ส่วนลด % ช่วงล้างสต๊อกเค้ก
export const DEFAULT_CAKE_SALE_START = '17:00';      // เริ่มช่วงลดราคา
export const DEFAULT_CAKE_SALE_END = '20:00';        // สิ้นสุดช่วงลดราคา

// ==================== CAKE + DRINK COMBO ====================
export const DEFAULT_COMBO_PERCENT = 10;             // ส่วนลด % เมื่อสั่งเค้ก + เครื่องดื่มคู่กัน

// ==================== STOCK ====================
export const DEFAULT_STOCK_UNIT = 'ชิ้น';
export const STOCK_CATEGORIES = [
  'เมล็ดกาแฟ',
  'ผงชา/มัทฉะ/โกโก้',
  'นมและผลิตภัณฑ์นม',
  'ไซรัป/ซอส/ท็อปปิ้ง',
  'ผลไม้และของสด',
  'วัตถุดิบเบเกอรี่',
  'บรรจุภัณฑ์',
  'อุปกรณ์และของใช้',
  'อื่น ๆ'
];

export const inferStockCategory = (name) => {
  const value = String(name || '').trim().toLocaleLowerCase();
  const rules = [
    ['เมล็ดกาแฟ', ['เมล็ดกาแฟ', 'เมล็ดคั่ว', 'coffee bean', 'coffee beans']],
    ['ผงชา/มัทฉะ/โกโก้', ['มัทฉะ', 'matcha', 'ชาเขียว', 'ชาไทย', 'โกโก้', 'cocoa', 'อัญชัน', 'ผงชา', 'ผงกาแฟ']],
    ['นมและผลิตภัณฑ์นม', ['นม', 'milk', 'ครีม', 'cream', 'วิป', 'whip', 'เนย', 'butter', 'ชีส', 'cheese']],
    ['ไซรัป/ซอส/ท็อปปิ้ง', ['ไซรัป', 'syrup', 'ซอส', 'sauce', 'ท็อปปิ้ง', 'topping', 'น้ำผึ้ง', 'คาราเมล']],
    ['ผลไม้และของสด', ['น้ำแข็ง', 'ice', 'ผลไม้', 'ส้ม', 'มะนาว', 'เลมอน', 'มะพร้าว', 'สตรอว์เบอร์รี', 'berry']],
    ['วัตถุดิบเบเกอรี่', ['แป้ง', 'flour', 'น้ำตาล', 'sugar', 'เค้ก', 'cake', 'ขนม', 'เจลาติน', 'ฐานรองเค้ก']],
    ['บรรจุภัณฑ์', ['แก้ว', 'ฝา', 'หลอด', 'ถุง', 'กล่อง', 'กระดาษ', 'ทิชชู่', 'สติ๊กเกอร์', 'ถ้วย', 'ช้อน', 'ส้อม']],
    ['อุปกรณ์และของใช้', ['อุปกรณ์', 'เครื่อง', 'ผ้า', 'ถัง', 'น้ำยา', 'ถุงมือ', 'ไม้กวาด', 'ฟองน้ำ']]
  ];
  return rules.find(([, keywords]) => keywords.some(keyword => value.includes(keyword)))?.[0] || 'อื่น ๆ';
};

export const getStockCategory = (item) => item?.category || inferStockCategory(item?.name);
export const DEFAULT_MIN_QUANTITY = 5;               // จำนวนขั้นต่ำเตือนสต็อกใกล้หมด

// ==================== POS ====================
export const DEFAULT_STARTING_CASH = 0;              // เงินทอนตั้งต้น
export const DEFAULT_ITEMS_PER_PAGE = 12;            // จำนวนเมนูต่อหน้า
export const MENU_PAGE_OPTIONS = [3, 6, 9, 12];      // ตัวเลือกจำนวนเมนูต่อหน้า

// ==================== EXPENSE CATEGORIES ====================
export const DEFAULT_EXPENSE_CATEGORY = 'วัตถุดิบ';
export const EXPENSE_CATEGORIES = [
  'วัตถุดิบ',
  ...STOCK_CATEGORIES,
  'ค่าแรง',
  'ค่าเช่า',
  'ค่าน้ำแข็ง',
  'ค่าไฟ',
  'อุปกรณ์',
  'การตลาด',
  'ของเสีย (Waste)'
];

// ==================== UI ====================
export const ANIMATION_DURATION = 500;               // ms
export const DEBOUNCE_DELAY = 200;                   // ms สำหรับ search
export const TOAST_DURATION = 3000;                  // ms

// ==================== API ====================
export const AI_RATE_LIMIT_DELAY = 2000;             // ms ระหว่าง AI calls
export const AI_CACHE_TTL = 15 * 60 * 1000;          // 15 นาที cache timeout
export const AI_CACHE_MAX_SIZE = 100;                 // จำนวน cache entries สูงสุด
export const AI_MAX_RETRIES = 1;                      // จำนวนครั้ง retry สูงสุด
export const AI_CHAT_HISTORY_MAX = 50;                // จำนวน chat history สูงสุด

// ==================== DATE/TIME ====================
export const DATE_LOCALE = 'th-TH';
export const CURRENCY_LOCALE = 'th-TH';
export const CURRENCY_SYMBOL = '฿';

// ==================== PRINT ====================
export const RECEIPT_WIDTH = 80;                     // mm สำหรับเครื่องพิมพ์ใบเสร็จ
export const SHOP_NAME = 'ร้านของคุณ';               // ชื่อร้านบนใบเสร็จ (สามารถเปลี่ยนได้ใน settings)

/**
 * Helper function to format currency
 */
export const formatCurrency = (amount) => {
  return `${CURRENCY_SYMBOL}${Number(amount || 0).toLocaleString(CURRENCY_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2, // cap fraction digits to avoid float residue like 123.45000000000002
  })}`;
};

/**
 * Helper function to format date in Thai
 */
export const formatThaiDate = (date) => {
  return new Date(date).toLocaleDateString(DATE_LOCALE, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};
