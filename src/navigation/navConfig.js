import {
  ShoppingCart, ChefHat, Receipt, Cake, Package, ClipboardCheck, ClipboardList, BookOpen,
  Users, LayoutDashboard, TrendingUp, PieChart, Target, Wallet, Landmark, Settings, CookingPot,
} from 'lucide-react';

/**
 * Single source of truth for the shell (UX v2 spec §5).
 *
 *  key        existing view key · setView('stock') / handleViewChange('admin') keep working
 *  hash       path after "#/" · `#/stock-audit?tab=links`
 *  label      sidebar / menu-sheet label (Thai, final)
 *  short      rail / tab-bar label (fits 72px)
 *  section    section id (see NAV_SECTIONS)
 *  protected  PIN-gated when the app lock is active (same rule as before)
 *  phoneTab   shown in the phone bottom tab bar
 *  rail       shown in the collapsed icon rail (everything else via "เพิ่มเติม")
 *  badgeKey   key into the `badges` object computed in App.jsx
 *  subParam   one extra path segment mapped to a param (`#/settings/<tab>`)
 */
export const NAV_ITEMS = [
  { key: 'pos', hash: 'pos', label: 'ขาย', short: 'ขาย', icon: ShoppingCart, section: 'front', phoneTab: true, rail: true },
  { key: 'merchant', hash: 'kitchen', label: 'ออเดอร์/ครัว', short: 'ออเดอร์', icon: ChefHat, section: 'front', phoneTab: true, rail: true, badgeKey: 'merchant' },
  { key: 'bills', hash: 'bills', label: 'บิลวันนี้', short: 'บิล', icon: Receipt, section: 'front', phoneTab: true, rail: true, badgeKey: 'bills' },
  { key: 'cake_queue', hash: 'cake-queue', label: 'คิวเค้ก', short: 'คิวเค้ก', icon: Cake, section: 'front', rail: true, badgeKey: 'cake_queue' },

  { key: 'stock', hash: 'stock', label: 'สต็อก', short: 'สต็อก', icon: Package, section: 'inventory', phoneTab: true, rail: true, badgeKey: 'stock' },
  { key: 'production', hash: 'production', label: 'ผลิตวันนี้', short: 'ผลิต', icon: CookingPot, section: 'inventory' },
  { key: 'stock_audit', hash: 'stock-audit', label: 'สรุปขาย & สต็อก', short: 'ตรวจสต็อก', icon: ClipboardCheck, section: 'inventory', badgeKey: 'stock_audit' },
  { key: 'menu_manage', hash: 'menu', label: 'เมนู', short: 'เมนู', icon: ClipboardList, section: 'inventory', protected: true },
  { key: 'recipes', hash: 'recipes', label: 'สูตร', short: 'สูตร', icon: BookOpen, section: 'inventory' },

  { key: 'members_manage', hash: 'members', label: 'สมาชิก', short: 'สมาชิก', icon: Users, section: 'customers', badgeKey: 'members_manage' },

  { key: 'dashboard', hash: 'reports/overview', label: 'ภาพรวม', short: 'ภาพรวม', icon: LayoutDashboard, section: 'reports', rail: true },
  { key: 'sales_history', hash: 'reports/sales', label: 'ประวัติการขาย', short: 'ประวัติขาย', icon: TrendingUp, section: 'reports' },
  { key: 'category_summary', hash: 'reports/categories', label: 'ยอดขายตามหมวด', short: 'ตามหมวด', icon: PieChart, section: 'reports' },
  { key: 'profitability', hash: 'reports/profit', label: 'กำไรต่อเมนู', short: 'กำไร', icon: Target, section: 'reports' },
  { key: 'expenses', hash: 'expenses', label: 'รายจ่าย', short: 'รายจ่าย', icon: Wallet, section: 'reports' },
  { key: 'financial', hash: 'reports/finance', label: 'วางแผนการเงิน', short: 'การเงิน', icon: Landmark, section: 'reports' },

  { key: 'admin', hash: 'settings', label: 'ตั้งค่าร้าน', short: 'ตั้งค่า', icon: Settings, section: 'settings', protected: true, subParam: 'tab' },
];

export const NAV_SECTIONS = [
  { id: 'front', label: 'หน้าร้าน' },
  { id: 'inventory', label: 'สต็อก & เมนู' },
  { id: 'customers', label: 'ลูกค้า' },
  { id: 'reports', label: 'รายงาน' },
  { id: 'settings', label: 'ตั้งค่า' },
];

export const DEFAULT_VIEW = 'pos';

/** Views where the ≥1024px sidebar auto-collapses to the rail (grid needs the width). */
export const AUTO_COLLAPSE_VIEWS = ['pos', 'merchant'];

export const NAV_BY_KEY = Object.fromEntries(NAV_ITEMS.map((item) => [item.key, item]));

export const PROTECTED_VIEWS = NAV_ITEMS.filter((item) => item.protected).map((item) => item.key);

export const isProtectedView = (key) => Boolean(NAV_BY_KEY[key]?.protected);

export const navSections = () =>
  NAV_SECTIONS.map((section) => ({
    ...section,
    items: NAV_ITEMS.filter((item) => item.section === section.id),
  }));
