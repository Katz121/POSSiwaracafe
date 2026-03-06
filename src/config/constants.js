/**
 * Application Configuration Constants
 * ค่าเริ่มต้นของระบบ - สามารถปรับเปลี่ยนได้ผ่านหน้า Admin Settings
 */

// ==================== SECURITY ====================
export const DEFAULT_ADMIN_PIN = '1234';

// ==================== POINTS & REWARDS ====================
export const DEFAULT_REDEEM_POINTS_THRESHOLD = 100;  // แต้มขั้นต่ำที่ใช้แลกได้
export const DEFAULT_REDEEM_DISCOUNT_VALUE = 50;     // มูลค่าส่วนลดเมื่อแลกแต้ม (บาท)
export const DEFAULT_OWN_GLASS_DISCOUNT = 5;         // ส่วนลดนำแก้วมาเอง (บาท)
export const POINTS_PER_BAHT = 10;                   // ทุก X บาท ได้ 1 แต้ม

// ==================== TAX ====================
export const VAT_RATE = 0.07;                        // อัตรา VAT 7%
export const VAT_PERCENTAGE = 7;                     // สำหรับแสดงผล

// ==================== STOCK ====================
export const DEFAULT_STOCK_UNIT = 'ชิ้น';
export const DEFAULT_MIN_QUANTITY = 5;               // จำนวนขั้นต่ำเตือนสต็อกใกล้หมด

// ==================== POS ====================
export const DEFAULT_STARTING_CASH = 0;              // เงินทอนตั้งต้น
export const DEFAULT_ITEMS_PER_PAGE = 12;            // จำนวนเมนูต่อหน้า
export const MENU_PAGE_OPTIONS = [3, 6, 9, 12];      // ตัวเลือกจำนวนเมนูต่อหน้า

// ==================== EXPENSE CATEGORIES ====================
export const DEFAULT_EXPENSE_CATEGORY = 'วัตถุดิบ';
export const EXPENSE_CATEGORIES = [
  'วัตถุดิบ',
  'ค่าแรง',
  'ค่าเช่า',
  'ค่าน้ำ/ค่าไฟ',
  'อุปกรณ์',
  'การตลาด',
  'ของเสีย (Waste)',
  'อื่นๆ'
];

// ==================== UI ====================
export const ANIMATION_DURATION = 500;               // ms
export const DEBOUNCE_DELAY = 200;                   // ms สำหรับ search
export const TOAST_DURATION = 3000;                  // ms

// ==================== API ====================
export const AI_RATE_LIMIT_DELAY = 2000;             // ms ระหว่าง AI calls

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
  return `${CURRENCY_SYMBOL}${Number(amount || 0).toLocaleString(CURRENCY_LOCALE)}`;
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
