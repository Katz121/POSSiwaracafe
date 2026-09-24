import { Coffee, Database, Lock, Percent, QrCode, Star, Store, Wallet, Zap } from 'lucide-react';

/**
 * Settings sub-routes · `#/settings/<key>` (spec §7 WP6).
 * The key is the route segment; keep them stable, other screens link here.
 */
export const SETTINGS_TABS = [
  { key: 'close', label: 'ปิดยอดวันนี้', hint: 'ยอดขาย รายจ่าย เงินทอน', icon: Wallet },
  { key: 'shop', label: 'ร้าน & ใบเสร็จ', hint: 'ข้อมูลร้าน ใบเสร็จ VAT ผู้ช่วย AI', icon: Store },
  { key: 'promotions', label: 'โปรโมชั่น & ส่วนลด', hint: 'ลดราคาเค้ก คอมโบ ครบยอด แก้วส่วนตัว', icon: Percent },
  { key: 'modifiers', label: 'ตัวเลือกเมนู', hint: 'เมล็ดกาแฟ มัทฉะ และการผูกสต็อก', icon: Coffee },
  { key: 'quick', label: 'รายจ่ายด่วน', hint: 'ปุ่มลัดในหน้ารายจ่าย', icon: Zap },
  { key: 'points', label: 'แต้มสมาชิก', hint: 'เกณฑ์แลกแต้ม หมดอายุ ของแลก', icon: Star },
  { key: 'security', label: 'ความปลอดภัย', hint: 'PIN และการล็อกเครื่อง', icon: Lock },
  { key: 'qr', label: 'QR สั่งเอง', hint: 'QR หน้าร้าน และสถิติการสั่ง', icon: QrCode },
  { key: 'data', label: 'ข้อมูล', hint: 'ส่งออก สำรอง ยอดย้อนหลัง', icon: Database },
];

export const DEFAULT_SETTINGS_TAB = 'close';

const KEYS = new Set(SETTINGS_TABS.map((t) => t.key));

// Old admin tab / panel names (context `adminTab`, bookmarks, other views).
const ALIASES = {
  stats: 'close', daily: 'close', monthly: 'close', expenses: 'close', summary: 'close',
  settings: 'shop', receipt: 'shop', general: 'shop', ai: 'shop',
  promotion: 'promotions', promo: 'promotions', discounts: 'promotions',
  manage: 'modifiers', beanModifiers: 'modifiers', beans: 'modifiers', modifier: 'modifiers',
  quickExpenses: 'quick',
  rewards: 'points', member: 'points',
  pin: 'security', lock: 'security',
  funnel: 'qr', 'qr-order': 'qr',
  backdatedSales: 'data', backup: 'data', danger: 'data',
};

/** Route segment / legacy key → a valid tab key, or null. */
export function normalizeSettingsTab(key) {
  if (!key) return null;
  const k = String(key).trim();
  if (KEYS.has(k)) return k;
  return ALIASES[k] || null;
}

export const tabByKey = (key) => SETTINGS_TABS.find((t) => t.key === key) || null;
