/**
 * CustomerOrderApp — Self-service QR ordering page
 * Standalone component; does NOT import AppContext or App.jsx internals.
 * Customers scan a QR code, browse the menu, add to cart, enter their name, and submit.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingCart,
  Plus,
  Minus,
  X,
  Check,
  Search,
  ChevronDown,
  Coffee,
  AlertCircle,
  RefreshCw,
  FileText,
  Star,
} from 'lucide-react';
import {
  signInAnonymously,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  collection,
  doc,
  addDoc,
  runTransaction,
  serverTimestamp,
  increment,
  arrayUnion,
  setDoc,
  getDoc,
  getDocs,
  getCountFromServer,
  query,
  where,
} from 'firebase/firestore';
import { auth, db, appId } from '../services/firebase';
import { fetchPublicMenu, readCachedPublicMenu, writeCachedPublicMenu, SENSITIVE_SETTINGS_KEYS } from '../utils/publicMenu';
import { Button, Modal, Input, Spinner, EmptyState } from '../components/ui';
import { formatCurrency, VAT_RATE, roundUpTo5, getModifierGroups, isBaseModifier, computeModifierPrice, supportsMilkChoice, MILK_OPTIONS, MEMBER_MIN_PHONE_LENGTH, ALLOW_NAME_ONLY_MEMBERS } from '../config/constants';
import { getISODate } from '../utils/calculations';
import { getItemSalePrice, cakeSaleNoteTag, getComboDiscount, COMBO_PROMO_TITLE, isCakeSaleActive, isCakeCategory } from '../utils/promotions';
import { bumpMenuSoldCount } from '../utils/menuSales';
import { notifyNewOrderToLine } from '../services/lineNotify';
import { applyCustomerSEO } from '../utils/seo';
import { getNameKey } from '../utils/calculations';

// ---------------------------------------------------------------------------
// i18n: Thai/English UI chrome for the customer-facing QR ordering page.
// Menu/category names come from Firestore and are intentionally NOT translated.
// ---------------------------------------------------------------------------
const QR_LANG_STORAGE_KEY = 'qr_lang';

const milkLabelForLanguage = (milkType, lang) => {
  const option = MILK_OPTIONS.find((candidate) => candidate.value === milkType);
  return lang === 'en' ? option?.labelEn : option?.label;
};

// Feature flag — set to true to bring back the auto-running welcome popup.
// Disabled for now per request; all popup code stays intact but costs nothing
// while the flag is off (JSX and welcomeItems computation are both gated).
const WELCOME_POPUP_ENABLED = false;

const TX = {
  th: {
    appLoading: 'กำลังโหลดเมนู...',
    orderViaQr: 'สั่งออเดอร์ผ่าน QR',
    searchPlaceholder: 'ค้นหาเมนู...',
    categoryAll: 'ทั้งหมด',
    noMenuFound: 'ไม่พบเมนูที่ค้นหา',
    noMenuFoundDesc: (q) => `ไม่พบ "${q}" ลองค้นหาคำอื่น`,
    noMenuYet: 'ยังไม่มีเมนู',
    noMenuYetDesc: 'กรุณารอสักครู่',
    allMenuHeading: 'เมนูทั้งหมด',
    viewAllMenu: (n) => `ดูเมนูทั้งหมด (+${n}) ▾`,
    bestSellerBadge: '🔥 ขายดี',
    featuredBadge: 'แนะนำ',
    startingFrom: 'เริ่มต้น ',
    startingFromShort: 'เริ่ม ',
    bestSellerRailTitle: '🔥 เมนูขายดี',
    featuredRailTitle: '⭐ เมนูแนะนำ',
    happyHourBanner: (pct, left) => `Happy Hour! เค้กลด ${pct}% · เหลืออีก ${left} ⏳`,
    happyHourUntil: (end) => `ถึง ${end} น. · รีบสั่งก่อนหมดเวลา!`,
    hoursShort: 'ชม.',
    minutesShort: 'นาที',
    comboNudgeCake: (pct) => `เพิ่มเครื่องดื่มอีก 1 แก้ว รับส่วนลด ${pct}%! 🥤`,
    comboNudgeDrink: (pct) => `เพิ่มเค้กอีก 1 ชิ้น รับส่วนลด ${pct}%! 🍰`,
    comboApplied: (pct) => `🎉 คุณได้รับส่วนลดคอมโบ ${pct}% แล้ว`,
    spendReachedWithDiscount: (pct) => `🎉 ได้ส่วนลด ${pct}% แล้ว!`,
    spendReachedNoDiscount: (amt) => `🎉 สั่งครบ ${amt} แล้ว!`,
    spendStart: (amt, pct) => `🛍️ สั่งครบ ${amt} รับส่วนลด ${pct}%`,
    spendRemaining: (amt, pct) => `🎁 อีกแค่ ${amt} รับส่วนลด ${pct}%!`,
    cartTitle: 'รายการสั่ง',
    cartEmptyTitle: 'ยังไม่มีรายการ',
    cartEmptyDesc: 'กลับไปเพิ่มเมนูที่ต้องการ',
    notePlaceholder: 'หมายเหตุ (เช่น ไม่ใส่น้ำตาล)',
    addNote: 'เพิ่มหมายเหตุ',
    cartTotal: 'ยอดรวม',
    proceed: 'ดำเนินการต่อ',
    viewCart: 'ดูตะกร้า',
    chooseOption: 'เลือกตัวเลือก',
    total: 'รวม',
    addToCart: 'เพิ่มลงตะกร้า',
    chooseAllGroups: 'เลือกให้ครบทุกกลุ่ม',
    sweetness: 'ระดับความหวาน',
    milkType: 'ชนิดนม',
    cancel: 'ยกเลิก',
    chooseOptionFor: 'เลือกตัวเลือกสำหรับ',
    confirmOrder: 'ยืนยันออเดอร์',
    orderedItems: 'รายการที่สั่ง',
    itemsPrice: 'ราคาสินค้า',
    comboDiscountLabel: 'คอมโบเค้ก+เครื่องดื่ม',
    pointsDiscountLabel: 'ส่วนลดแต้มสมาชิก',
    spendDiscountLabel: 'ส่วนลดสั่งครบยอด',
    vatLabel: 'VAT 7%',
    grandTotal: 'ยอดรวม',
    yourName: 'ชื่อของคุณ *',
    namePlaceholder: 'กรอกชื่อเพื่อรับออเดอร์',
    nameHint: 'ชื่อนี้จะใช้เรียกออเดอร์ของคุณ',
    phoneLabel: 'เบอร์โทร (สำหรับสะสมแต้ม)',
    phonePlaceholder: 'กรอกเบอร์โทร (ไม่บังคับ)',
    memberStatus: (name, points) => `สมาชิก: ${name} • ${points} แต้ม`,
    defaultCustomerName: 'ลูกค้า',
    pointsReady: (val) => `🎉 ครบแล้ว! แลกส่วนลด ฿${val} ได้เลย`,
    pointsRemaining: (rem, val) => `อีก ${rem} แต้ม แลกส่วนลด ฿${val}`,
    newPhoneHint: 'เบอร์ใหม่ — ระบบจะสมัครสมาชิกให้อัตโนมัติ และเริ่มสะสมแต้ม',
    noPhoneHint: 'ไม่ใส่เบอร์ก็สั่งได้ แต่บิลนี้จะไม่สะสมแต้ม',
    usePointsToggle: (threshold, val) => `ใช้ ${threshold} แต้ม แลกส่วนลด ฿${val}`,
    submitting: 'กำลังส่งออเดอร์...',
    submitOrder: 'ส่งออเดอร์',
    welcomeGreeting: 'ยินดีต้อนรับ ☕',
    welcomeTitle: 'เมนูแนะนำ & ขายดี',
    welcomeDesc: 'ที่ลูกค้าสั่งบ่อยที่สุด — ลองดูก่อนสั่งได้เลย',
    welcomeCta: 'เริ่มสั่งเลย →',
    close: 'ปิด',
    orderOf: 'ออเดอร์ของ',
    queueBefore: 'มีคิวก่อนหน้า · คิวของคุณ',
    preparingDrink: 'กำลังทำเครื่องดื่มของคุณ ☕',
    payAtCounter: 'กรุณาชำระเงินที่เคาน์เตอร์',
    staffWillCall: 'พนักงานจะเรียกชื่อเมื่อเครื่องดื่มพร้อม',
    reviewThanks: 'ขอบคุณสำหรับรีวิว 💚',
    reviewPrompt: 'ถูกใจร้านเราไหม? 💚',
    reviewDesc: 'ฝากรีวิวให้เราหน่อยน้า เป็นกำลังใจให้ร้านมากๆ 🙏',
    writeReview: 'เขียนรีวิว',
    reviewDiscountNote: '📣 รีวิวแล้ว แจ้งพนักงานตอนจ่ายเงิน รับส่วนลด 5% ทันที!',
    orderAgain: 'สั่งเพิ่ม / สั่งใหม่',
    soldOutError: (names) => `ขออภัย "${names}" เพิ่งหมด กรุณานำออกจากตะกร้าแล้วลองใหม่อีกครั้ง`,
    submitFailedError: (code) => `สั่งออเดอร์ไม่สำเร็จ (${code}) — ลองใหม่อีกครั้ง`,
  },
  en: {
    appLoading: 'Loading menu...',
    orderViaQr: 'Order via QR',
    searchPlaceholder: 'Search menu...',
    categoryAll: 'All',
    noMenuFound: 'No matching items',
    noMenuFoundDesc: (q) => `No results for "${q}" — try another search`,
    noMenuYet: 'No menu items yet',
    noMenuYetDesc: 'Please check back shortly',
    allMenuHeading: 'All items',
    viewAllMenu: (n) => `View all (+${n}) ▾`,
    bestSellerBadge: '🔥 Best seller',
    featuredBadge: 'Featured',
    startingFrom: 'From ',
    startingFromShort: 'From ',
    bestSellerRailTitle: '🔥 Best sellers',
    featuredRailTitle: '⭐ Featured',
    happyHourBanner: (pct, left) => `Happy Hour! ${pct}% off cakes · ${left} left ⏳`,
    happyHourUntil: (end) => `Until ${end} · order before time runs out!`,
    hoursShort: 'hr',
    minutesShort: 'min',
    comboNudgeCake: (pct) => `Add 1 more drink to get ${pct}% off! 🥤`,
    comboNudgeDrink: (pct) => `Add 1 more cake to get ${pct}% off! 🍰`,
    comboApplied: (pct) => `🎉 Combo discount of ${pct}% applied`,
    spendReachedWithDiscount: (pct) => `🎉 You got ${pct}% off!`,
    spendReachedNoDiscount: (amt) => `🎉 You've reached ${amt}!`,
    spendStart: (amt, pct) => `🛍️ Spend ${amt} to get ${pct}% off`,
    spendRemaining: (amt, pct) => `🎁 Just ${amt} more for ${pct}% off!`,
    cartTitle: 'Your order',
    cartEmptyTitle: 'Cart is empty',
    cartEmptyDesc: 'Go back and add some items',
    notePlaceholder: 'Note (e.g. no sugar)',
    addNote: 'Add note',
    cartTotal: 'Total',
    proceed: 'Continue',
    viewCart: 'View cart',
    chooseOption: 'Choose option',
    total: 'Total',
    addToCart: 'Add to cart',
    chooseAllGroups: 'Select all groups',
    sweetness: 'Sweetness level',
    milkType: 'Milk',
    cancel: 'Cancel',
    chooseOptionFor: 'Choose options for',
    confirmOrder: 'Confirm order',
    orderedItems: 'Order items',
    itemsPrice: 'Items total',
    comboDiscountLabel: 'Cake + drink combo',
    pointsDiscountLabel: 'Member points discount',
    spendDiscountLabel: 'Spend threshold discount',
    vatLabel: 'VAT 7%',
    grandTotal: 'Total',
    yourName: 'Your name *',
    namePlaceholder: 'Enter your name to receive your order',
    nameHint: "This name will be called when your order is ready",
    phoneLabel: 'Phone (to earn points)',
    phonePlaceholder: 'Enter phone (optional)',
    memberStatus: (name, points) => `Member: ${name} • ${points} points`,
    defaultCustomerName: 'Customer',
    pointsReady: (val) => `🎉 Ready! Redeem for ฿${val} off`,
    pointsRemaining: (rem, val) => `${rem} points left to redeem ฿${val} off`,
    newPhoneHint: "New number — you'll be signed up automatically and start earning points",
    noPhoneHint: 'You can order without a phone, but this bill earns no points',
    usePointsToggle: (threshold, val) => `Use ${threshold} points for ฿${val} off`,
    submitting: 'Placing order...',
    submitOrder: 'Place order',
    welcomeGreeting: 'Welcome ☕',
    welcomeTitle: 'Featured & Best sellers',
    welcomeDesc: "Customers' favorites — take a look before you order",
    welcomeCta: 'Start ordering →',
    close: 'Close',
    orderOf: 'Order for',
    queueBefore: 'People ahead of you · your number',
    preparingDrink: 'Preparing your drink ☕',
    payAtCounter: 'Please pay at the counter',
    staffWillCall: "Staff will call your name when it's ready",
    reviewThanks: 'Thanks for the review 💚',
    reviewPrompt: 'Enjoyed your visit? 💚',
    reviewDesc: 'Leave us a review — it means a lot! 🙏',
    writeReview: 'Write a review',
    reviewDiscountNote: '📣 Show your review to staff at checkout for 5% off!',
    orderAgain: 'Order again',
    soldOutError: (names) => `Sorry, "${names}" just sold out — please remove it from your cart and try again`,
    submitFailedError: (code) => `Order failed (${code}) — please try again`,
  },
};

const makeT = (lang) => (key, ...args) => {
  const entry = TX[lang]?.[key] ?? TX.th[key] ?? key;
  return typeof entry === 'function' ? entry(...args) : entry;
};

// Menu/category/bean names come from Firestore (the shop's own data). When the
// customer switches to English we show the `<field>En` value if the owner has
// filled it in, otherwise we fall back to the original Thai. `field` defaults to
// 'name' → 'nameEn'; pass 'description' for 'descriptionEn'.
const dispField = (obj, lang, field = 'name') => {
  if (!obj) return '';
  const en = obj[`${field}En`];
  return lang === 'en' && en ? en : (obj[field] || '');
};

// Modifier-group headings are a small fixed set (not their own Firestore docs),
// so they are translated with a static map rather than a `nameEn` field.
const GROUP_EN = {
  'เมล็ดกาแฟ': 'Coffee Beans',
  'ผงมัทฉะ': 'Matcha Powder',
  'ส้ม': 'Orange',
};
const dispGroup = (name, lang) => (lang === 'en' && GROUP_EN[name]) ? GROUP_EN[name] : (name || '');

// ---------------------------------------------------------------------------
// Sub-component: LanguageToggle — TH/EN switch shown in the header
// ---------------------------------------------------------------------------
function LanguageToggle({ lang, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
      style={{ minHeight: 32 }}
      aria-label="Toggle language / สลับภาษา"
    >
      <span className={lang === 'th' ? 'text-emerald-600' : 'text-gray-400'}>TH</span>
      <span className="text-gray-300">|</span>
      <span className={lang === 'en' ? 'text-emerald-600' : 'text-gray-400'}>EN</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Helper: merge stock links from a menu item and a bean modifier
// ---------------------------------------------------------------------------
function mergeStockLinks(itemLinks = [], modifierLinks = []) {
  const map = {};
  [...itemLinks, ...modifierLinks].forEach((link) => {
    const key = link.stockId || link.id || link.name;
    if (map[key]) {
      map[key] = { ...map[key], quantity: (map[key].quantity || 0) + (link.quantity || 0) };
    } else {
      map[key] = { ...link };
    }
  });
  return Object.values(map);
}

// ---------------------------------------------------------------------------
// Sub-component: MenuItemCard
// ---------------------------------------------------------------------------
function MenuItemCard({ item, onAdd, settingsData, isBestSeller = false, t, lang = 'th' }) {
  const hasImage = Boolean(item.image);
  const sale = getItemSalePrice(item, settingsData);
  // Coffee menus display prices rounded up to the nearest 5 baht.
  const dp = (p) => (item.allowBeanModifier ? roundUpTo5(p) : p);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileTap={{ scale: 0.97 }}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col cursor-pointer active:shadow-inner"
      onClick={() => onAdd(item)}
    >
      {/* Image */}
      <div className="relative w-full aspect-[4/3] bg-emerald-50 flex items-center justify-center overflow-hidden">
        {hasImage ? (
          <img
            src={item.image}
            alt={item.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <Coffee size={36} className="text-emerald-300" strokeWidth={1.5} />
        )}
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {isBestSeller && (
            <span className="bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {t('bestSellerBadge')}
            </span>
          )}
          {item.isFeatured && (
            <span className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {t('featuredBadge')}
            </span>
          )}
        </div>
        {sale.onSale && (
          <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
            Happy Hour -{sale.percent}%
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1 flex-1">
        <p className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2">{dispField(item, lang)}</p>
        {dispField(item, lang, 'description') && (
          <p className="text-gray-400 text-xs leading-tight line-clamp-2">{dispField(item, lang, 'description')}</p>
        )}
        <div className="mt-auto pt-2 flex items-center justify-between">
          {sale.onSale ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-gray-400 text-xs line-through leading-none">
                {item.allowBeanModifier ? t('startingFrom') : ''}{formatCurrency(dp(sale.originalPrice))}
              </span>
              <span className="text-red-500 font-bold text-base leading-none">
                {item.allowBeanModifier ? t('startingFrom') : ''}{formatCurrency(dp(sale.price))}
              </span>
            </div>
          ) : (
            <span className="text-emerald-600 font-bold text-base">
              {item.allowBeanModifier ? t('startingFrom') : ''}{formatCurrency(dp(item.price))}
            </span>
          )}
          <div className="w-9 h-9 bg-emerald-500 rounded-full flex items-center justify-center shadow-md">
            <Plus size={18} className="text-white" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: HighlightRail — horizontal carousel of highlighted menu items
// ---------------------------------------------------------------------------
function HighlightRail({ title, items, onAdd, settingsData, bestSellerIds, autoScroll = false, t, lang = 'th' }) {
  const [paused, setPaused] = useState(false);
  if (!items || items.length === 0) return null;

  const card = (item, key, extra = '') => (
    <div key={key} className={`w-40 flex-shrink-0 ${extra}`}>
      <MenuItemCard
        item={item}
        onAdd={onAdd}
        settingsData={settingsData}
        isBestSeller={bestSellerIds ? bestSellerIds.has(item.id) : true}
        t={t}
        lang={lang}
      />
    </div>
  );

  // Static (scrollable) rail unless this rail opts into auto-scroll AND has
  // enough items to overflow. Only the best-seller rail enables autoScroll.
  if (!autoScroll || items.length <= 2) {
    return (
      <section>
        <h2 className="text-sm font-bold text-gray-700 mb-2 px-4">{title}</h2>
        <div className="flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-hide">
          {items.map((item) => card(item, item.id))}
        </div>
      </section>
    );
  }

  // Auto-scrolling marquee: the items are duplicated so translating -50% loops
  // seamlessly; it pauses while the customer hovers/touches so they can tap.
  return (
    <section>
      <h2 className="text-sm font-bold text-gray-700 mb-2 px-4">{title}</h2>
      <div className="overflow-hidden pb-1">
        <div
          className="flex w-max animate-marquee"
          style={{
            animationDuration: `${items.length * 4}s`,
            animationPlayState: paused ? 'paused' : 'running',
          }}
          onPointerEnter={() => setPaused(true)}
          onPointerLeave={() => setPaused(false)}
          onPointerCancel={() => setPaused(false)}
        >
          {[...items, ...items].map((item, i) => card(item, `${item.id}-${i}`, 'mr-3'))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: WelcomePopup — auto-running showcase of best-seller + featured
// menus. Pure display (no add-to-cart); appears once per session on entry so
// every visitor immediately sees what the shop is known for. Pulls straight
// from the live menu (isPinnedBest = ขายดี, isFeatured = แนะนำ).
// ---------------------------------------------------------------------------
function WelcomePopup({ isOpen, items, settingsData, onClose, t, lang = 'th' }) {
  const [paused, setPaused] = useState(false);

  // Price shown follows the same rules as MenuItemCard (sale + 5-baht rounding
  // for coffee menus) so the popup never contradicts the grid below.
  const priceOf = (item) => {
    const sale = getItemSalePrice(item, settingsData);
    const dp = (p) => (item.allowBeanModifier ? roundUpTo5(p) : p);
    return { display: dp(sale.price), onSale: sale.onSale, original: dp(sale.originalPrice) };
  };

  const card = (item, key) => {
    const p = priceOf(item);
    const badge = item.isPinnedBest ? { text: t('bestSellerBadge'), cls: 'bg-orange-500' } : { text: `⭐ ${t('featuredBadge')}`, cls: 'bg-emerald-500' };
    return (
      <div key={key} className="w-36 flex-shrink-0 mr-3 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="relative w-full aspect-[4/3] bg-emerald-50 flex items-center justify-center overflow-hidden">
          {item.image ? (
            <img src={item.image} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <Coffee size={32} className="text-emerald-300" strokeWidth={1.5} />
          )}
          <span className={`absolute top-1.5 left-1.5 text-white text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>
            {badge.text}
          </span>
        </div>
        <div className="p-2.5">
          <p className="font-semibold text-gray-900 text-xs leading-tight line-clamp-2 min-h-[2rem]">{dispField(item, lang)}</p>
          <div className="mt-1">
            {p.onSale ? (
              <div className="flex items-baseline gap-1">
                <span className="text-gray-400 text-[10px] line-through">{formatCurrency(p.original)}</span>
                <span className="text-red-500 font-bold text-sm">{formatCurrency(p.display)}</span>
              </div>
            ) : (
              <span className="text-emerald-600 font-bold text-sm">
                {item.allowBeanModifier ? t('startingFromShort') : ''}{formatCurrency(p.display)}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && items.length > 0 && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[61] mx-auto max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="relative px-5 pt-5 pb-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white">
              <button
                onClick={onClose}
                aria-label={t('close')}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              >
                <X size={18} />
              </button>
              <p className="text-white/80 text-xs font-semibold">{t('welcomeGreeting')}</p>
              <h2 className="font-black text-xl leading-tight">{t('welcomeTitle')}</h2>
              <p className="text-white/85 text-xs mt-0.5">{t('welcomeDesc')}</p>
            </div>

            {/* Auto-running marquee */}
            <div className="py-4 overflow-hidden">
              <div
                className="flex w-max animate-marquee"
                style={{
                  paddingLeft: '1rem',
                  animationDuration: `${Math.max(items.length, 4) * 4}s`,
                  animationPlayState: paused ? 'paused' : 'running',
                }}
                onPointerEnter={() => setPaused(true)}
                onPointerLeave={() => setPaused(false)}
                onPointerCancel={() => setPaused(false)}
              >
                {[...items, ...items].map((item, i) => card(item, `${item.id}-${i}`))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 pt-1">
              <Button variant="primary" size="lg" fullWidth onClick={onClose} noUppercase>
                {t('welcomeCta')}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: BeanModifierModal — picker for bean/blend selection
// ---------------------------------------------------------------------------
function BeanModifierModal({ isOpen, item, modifiers, onSelect, onClose, t, lang = 'th' }) {
  // เลือกตัวเลือกต่อกลุ่ม (เช่น { 'ส้ม': mod, 'เมล็ดกาแฟ': mod })
  const [selections, setSelections] = useState({});
  const [sweetness, setSweetness] = useState(100);
  const [milkType, setMilkType] = useState('cow');
  // เคลียร์ตัวเลือกทุกครั้งที่เปิดเมนูใหม่ หรือเปิด modal ขึ้นมาใหม่ (แม้เป็นเมนูเดิม)
  // (ปรับ state ตอน render ตามแนวทาง React)
  const [lastItemId, setLastItemId] = useState(item?.id);
  const [wasOpen, setWasOpen] = useState(isOpen);
  const itemChanged = item?.id !== lastItemId;
  const justOpened = isOpen && !wasOpen;
  if (itemChanged || isOpen !== wasOpen) {
    if (itemChanged) setLastItemId(item?.id);
    if (isOpen !== wasOpen) setWasOpen(isOpen);
    if (itemChanged || justOpened) {
      setSelections({});
      setSweetness(100);
      setMilkType('cow');
    }
  }

  const itemBase = Number(item?.price) || 0;
  const extra = Number(item?.beanExtra) || 0;

  // กลุ่มที่มีตัวเลือกพร้อมขายจริงเท่านั้น (modifiers ส่งมาเฉพาะที่ available แล้ว)
  const groups = item
    ? getModifierGroups(item)
        .map((g) => ({
          name: g,
          mods: modifiers
            .filter((m) => (m.group || 'เมล็ดกาแฟ') === g)
            .map((mod) => ({
              mod,
              surcharge: isBaseModifier(item, mod) ? 0 : Math.max(0, (Number(mod.price) || 0) + extra - itemBase),
            }))
            .sort((a, b) => a.surcharge - b.surcharge),
        }))
        .filter((g) => g.mods.length > 0)
    : [];
  const multi = groups.length > 1;
  const allChosen = groups.every((g) => selections[g.name]);
  const chosenMods = groups.map((g) => selections[g.name]).filter(Boolean);
  const previewPrice = item ? computeModifierPrice(item, chosenMods) : 0;
  const showSweetness = item && !isCakeCategory(item.category);
  const showMilkChoice = supportsMilkChoice(item);
  const needsConfirmButton = showSweetness || multi;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('chooseOption')}
      size="sm"
      footer={
        needsConfirmButton ? (
          <div className="w-full space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="font-semibold text-gray-700">{t('total')}</span>
              <span className="font-bold text-lg text-emerald-600">{formatCurrency(previewPrice)}</span>
            </div>
            <Button variant="primary" size="lg" fullWidth disabled={!allChosen} noUppercase
              onClick={() => onSelect(item, chosenMods, sweetness, showMilkChoice ? milkType : null)}>
              {allChosen ? t('addToCart') : t('chooseAllGroups')}
            </Button>
            <Button variant="ghost" fullWidth onClick={onClose} className="text-gray-400">{t('cancel')}</Button>
          </div>
        ) : (
          <Button variant="ghost" fullWidth onClick={onClose} className="text-gray-400">
            {t('cancel')}
          </Button>
        )
      }
    >
      {item && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">{t('chooseOptionFor')} <strong>{dispField(item, lang)}</strong></p>
          {groups.map((group) => (
            <div key={group.name} className="space-y-2">
              {multi && <p className="text-xs font-black uppercase tracking-widest text-gray-400 ml-1">{dispGroup(group.name, lang)}</p>}
              {group.mods.map(({ mod, surcharge }) => {
                const selected = selections[group.name]?.id === mod.id;
                // กลุ่มเดียว = แตะแล้วเพิ่มทันที (UX เดิม); หลายกลุ่ม = แตะเพื่อเลือกในกลุ่ม
                const onClick = needsConfirmButton
                  ? () => setSelections((prev) => ({ ...prev, [group.name]: mod }))
                  : () => onSelect(item, mod);
                return (
                  <motion.button
                    key={mod.id}
                    whileTap={{ scale: 0.97 }}
                    onClick={onClick}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left min-h-[56px] ${selected ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-300' : 'border-gray-100 hover:border-emerald-400 hover:bg-emerald-50'}`}
                  >
                    <span className="font-semibold text-gray-800">{dispField(mod, lang)}</span>
                    <span className={`font-bold ${surcharge > 0 ? 'text-orange-500' : 'text-emerald-600'}`}>
                      {formatCurrency(computeModifierPrice(item, [mod]))}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          ))}
          {showSweetness && (
            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400 ml-1">{t('sweetness')}</p>
              <div className="grid grid-cols-5 gap-2">
                {[0, 25, 50, 75, 100].map((level) => (
                  <button key={level} type="button" onClick={() => setSweetness(level)}
                    className={`min-h-[44px] rounded-xl border-2 text-xs font-bold transition-all ${sweetness === level ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-200' : 'border-gray-100 text-gray-600 hover:border-emerald-300'}`}>
                    {level}%
                  </button>
                ))}
              </div>
            </div>
          )}
          {showMilkChoice && (
            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400 ml-1">{t('milkType')}</p>
              <div className="grid grid-cols-2 gap-2">
                {MILK_OPTIONS.map((option) => (
                  <button key={option.value} type="button" onClick={() => setMilkType(option.value)}
                    className={`min-h-[48px] rounded-xl border-2 text-sm font-bold transition-all ${milkType === option.value ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-200' : 'border-gray-100 text-gray-600 hover:border-emerald-300'}`}>
                    {lang === 'en' ? option.labelEn : option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: CartDrawer — slide-up drawer with cart contents
// ---------------------------------------------------------------------------
function CartDrawer({ isOpen, cart, onClose, onUpdateQty, onRemove, onUpdateNote, total, onProceed, t, lang = 'th' }) {
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteValue, setNoteValue] = useState('');

  const startEditNote = (cartId, currentNote) => {
    setEditingNoteId(cartId);
    setNoteValue(currentNote || '');
  };

  const saveNote = (cartId) => {
    onUpdateNote(cartId, noteValue);
    setEditingNoteId(null);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: '85vh' }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h2 className="font-bold text-lg text-gray-900">{t('cartTitle')}</h2>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-3">
              {cart.length === 0 ? (
                <EmptyState
                  icon="cart"
                  title={t('cartEmptyTitle')}
                  description={t('cartEmptyDesc')}
                  size="sm"
                />
              ) : (
                cart.map((cartItem) => {
                  const id = cartItem.cartId || cartItem.id;
                  const sweetnessNote = cartItem.sweetness == null ? '' : `หวาน ${cartItem.sweetness}%`;
                  const defaultOptionNote = [cartItem.beanModifier, cartItem.milkLabel, sweetnessNote].filter(Boolean).join(' ');
                  return (
                    <div key={id} className="bg-gray-50 rounded-2xl p-3 space-y-2">
                      <div className="flex items-start gap-3">
                        {/* Name & modifier */}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-gray-900 leading-tight">{dispField(cartItem, lang)}</p>
                          {cartItem.beanModifier && cartItem.beanModifier !== '' && (
                            <p className="text-xs text-emerald-600 font-medium">{cartItem.beanModifier}</p>
                          )}
                          {cartItem.sweetness != null && (
                            <p className="text-xs text-orange-500 font-medium">{t('sweetness')}: {cartItem.sweetness}%</p>
                          )}
                          {cartItem.milkLabel && (
                            <p className="text-xs text-sky-600 font-medium">{t('milkType')}: {milkLabelForLanguage(cartItem.milkType, lang) || cartItem.milkLabel}</p>
                          )}
                          <p className="text-emerald-600 font-bold text-sm mt-0.5">
                            {formatCurrency(Number(cartItem.price) * Number(cartItem.quantity))}
                          </p>
                        </div>

                        {/* Qty controls */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => onUpdateQty(id, cartItem.quantity - 1)}
                            className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 hover:bg-red-100 hover:text-red-600 transition-colors"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="w-6 text-center font-bold text-gray-800 text-sm">
                            {cartItem.quantity}
                          </span>
                          <button
                            onClick={() => onUpdateQty(id, cartItem.quantity + 1)}
                            className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white hover:bg-emerald-600 transition-colors"
                          >
                            <Plus size={14} />
                          </button>
                        </div>

                        {/* Remove */}
                        <button
                          onClick={() => onRemove(id)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      {/* Note */}
                      {editingNoteId === id ? (
                        <div className="flex gap-2">
                          <input
                            autoFocus
                            value={noteValue}
                            onChange={(e) => setNoteValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveNote(id); }}
                            placeholder={t('notePlaceholder')}
                            className="flex-1 text-xs border border-gray-200 rounded-xl px-3 py-1.5 bg-white focus:outline-none focus:border-emerald-400"
                          />
                          <button
                            onClick={() => saveNote(id)}
                            className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white flex-shrink-0"
                          >
                            <Check size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditNote(id, cartItem.note)}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-emerald-600 transition-colors"
                        >
                          <FileText size={12} />
                          <span>{cartItem.note && cartItem.note !== defaultOptionNote ? cartItem.note : t('addNote')}</span>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer: total + proceed (always visible, never overlaps items) */}
            {cart.length > 0 && (
              <div className="flex-shrink-0 border-t border-gray-100 px-5 py-4 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-500 font-medium">{t('cartTotal')}</span>
                  <span className="font-black text-lg text-emerald-600">{formatCurrency(total)}</span>
                </div>
                <Button variant="primary" size="lg" fullWidth onClick={onProceed}>
                  {t('proceed')}
                </Button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: StickyCartBar — fixed bottom bar showing cart summary
// ---------------------------------------------------------------------------
function StickyCartBar({ cart, total, onClick, t }) {
  const itemCount = cart.reduce((s, i) => s + Number(i.quantity), 0);

  if (itemCount === 0) return null;

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-6 pt-2"
    >
      <button
        onClick={onClick}
        className="w-full bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white rounded-2xl flex items-center justify-between px-5 py-4 shadow-xl transition-colors"
        style={{ minHeight: 56 }}
      >
        <span className="bg-white/20 rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm">
          {itemCount}
        </span>
        <span className="font-bold text-base flex items-center gap-2">
          <ShoppingCart size={18} />
          {t('viewCart')}
        </span>
        <span className="font-bold text-base">{formatCurrency(total)}</span>
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: CheckoutStep — name input + order summary + submit
// ---------------------------------------------------------------------------
function CheckoutStep({
  cart,
  subtotal,
  vat,
  total,
  vatEnabled,
  customerName,
  onNameChange,
  onSubmit,
  onBack,
  submitting,
  submitError,
  // member / points props
  customerPhone,
  onPhoneChange,
  member,
  memberPoints,
  pointsEligible,
  usePoints,
  onTogglePoints,
  redeemPointsThreshold,
  redeemDiscountValue,
  // discount breakdown
  comboDiscount,
  pointsDiscount,
  spendDiscount,
  t,
  lang = 'th',
}) {
  const itemCount = cart.reduce((s, i) => s + Number(i.quantity), 0);
  const canSubmit = customerName.trim().length > 0 && itemCount > 0 && !submitting;

  return (
    <motion.div
      key="checkout"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      className="flex flex-col min-h-screen bg-gray-50"
    >
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"
        >
          <ChevronDown size={20} className="rotate-90" />
        </button>
        <h1 className="font-bold text-gray-900 text-lg">{t('confirmOrder')}</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 pb-40">
        {/* Order items summary */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="font-bold text-gray-800">{t('orderedItems')}</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {cart.map((cartItem) => {
              const id = cartItem.cartId || cartItem.id;
              const sweetnessNote = cartItem.sweetness == null ? '' : `หวาน ${cartItem.sweetness}%`;
              const defaultOptionNote = [cartItem.beanModifier, cartItem.milkLabel, sweetnessNote].filter(Boolean).join(' ');
              return (
                <div key={id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-800 leading-tight">{dispField(cartItem, lang)}</p>
                    {cartItem.beanModifier && cartItem.beanModifier !== '' && (
                      <p className="text-xs text-emerald-600">{cartItem.beanModifier}</p>
                    )}
                    {cartItem.sweetness != null && (
                      <p className="text-xs text-orange-500">{t('sweetness')}: {cartItem.sweetness}%</p>
                    )}
                    {cartItem.milkLabel && (
                      <p className="text-xs text-sky-600">{t('milkType')}: {milkLabelForLanguage(cartItem.milkType, lang) || cartItem.milkLabel}</p>
                    )}
                    {cartItem.note && cartItem.note !== defaultOptionNote && (
                      <p className="text-xs text-gray-400">{cartItem.note}</p>
                    )}
                  </div>
                  <span className="text-sm text-gray-500 flex-shrink-0">x{cartItem.quantity}</span>
                  <span className="font-semibold text-sm text-gray-900 flex-shrink-0">
                    {formatCurrency(Number(cartItem.price) * Number(cartItem.quantity))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Totals */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4 space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>{t('itemsPrice')}</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {comboDiscount > 0 && (
            <div className="flex justify-between text-sm text-red-500">
              <span>{t('comboDiscountLabel')}</span>
              <span>-{formatCurrency(comboDiscount)}</span>
            </div>
          )}
          {pointsDiscount > 0 && (
            <div className="flex justify-between text-sm text-emerald-600">
              <span>{t('pointsDiscountLabel')}</span>
              <span>-{formatCurrency(pointsDiscount)}</span>
            </div>
          )}
          {spendDiscount > 0 && (
            <div className="flex justify-between text-sm text-amber-600">
              <span>{t('spendDiscountLabel')}</span>
              <span>-{formatCurrency(spendDiscount)}</span>
            </div>
          )}
          {vatEnabled && (
            <div className="flex justify-between text-sm text-gray-500">
              <span>{t('vatLabel')}</span>
              <span>{formatCurrency(vat)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base text-gray-900 pt-2 border-t border-gray-100">
            <span>{t('grandTotal')}</span>
            <span className="text-emerald-600">{formatCurrency(total)}</span>
          </div>
        </div>

        {/* Customer name input */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4 space-y-4">
          <Input
            label={t('yourName')}
            placeholder={t('namePlaceholder')}
            value={customerName}
            onChange={(e) => onNameChange(e.target.value)}
            maxLength={60}
            autoFocus
          />
          <p className="text-xs text-gray-400 -mt-2">{t('nameHint')}</p>

          {/* Phone input for membership */}
          <div>
            <Input
              label={t('phoneLabel')}
              placeholder={t('phonePlaceholder')}
              value={customerPhone}
              onChange={(e) => onPhoneChange(e.target.value)}
              inputMode="numeric"
              maxLength={10}
            />
            {/* Member status line + points progress */}
            {member ? (
              <div className="mt-1.5 space-y-0.5">
                <p className="text-xs text-emerald-600 font-medium">
                  {t('memberStatus', member.name || t('defaultCustomerName'), memberPoints)}
                </p>
                <p className="text-xs text-amber-600 font-bold">
                  {memberPoints >= redeemPointsThreshold
                    ? t('pointsReady', redeemDiscountValue)
                    : t('pointsRemaining', redeemPointsThreshold - memberPoints, redeemDiscountValue)}
                </p>
              </div>
            ) : customerPhone.length >= MEMBER_MIN_PHONE_LENGTH ? (
              <p className="text-xs text-gray-500 mt-1.5">
                {t('newPhoneHint')}
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-1.5">
                {t('noPhoneHint')}
              </p>
            )}
          </div>

          {/* Points redemption toggle */}
          {pointsEligible && (
            <motion.button
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              type="button"
              onClick={onTogglePoints}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 transition-all ${
                usePoints
                  ? 'bg-emerald-50 border-emerald-400'
                  : 'bg-gray-50 border-gray-200 hover:border-emerald-300'
              }`}
              style={{ minHeight: 44 }}
            >
              <span className={`text-sm font-semibold ${usePoints ? 'text-emerald-700' : 'text-gray-700'}`}>
                {t('usePointsToggle', redeemPointsThreshold, redeemDiscountValue)}
              </span>
              <div
                className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                  usePoints ? 'bg-emerald-500' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    usePoints ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </div>
            </motion.button>
          )}
        </div>

        {/* Error message */}
        <AnimatePresence>
          {submitError && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-red-600"
            >
              <AlertCircle size={16} />
              <span className="text-sm font-medium">{submitError}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Submit button (fixed) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-4">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={onSubmit}
          loading={submitting}
          disabled={!canSubmit}
        >
          {submitting ? t('submitting') : t('submitOrder')}
        </Button>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: SuccessScreen
// ---------------------------------------------------------------------------
function SuccessScreen({ customerName, onReset, reviewUrl, queueNumber, t }) {
  const hasReviewUrl = typeof reviewUrl === 'string' && reviewUrl.trim() !== '';
  const [reviewDone, setReviewDone] = useState(false);

  // Hosts we'll hand off to the Google Maps app. reviewUrl is admin-set but the
  // settings doc is writable by any anonymous client, so treat it as untrusted.
  const MAPS_HOSTS = ['maps.app.goo.gl', 'g.page', 'goo.gl', 'maps.google.com', 'www.google.com', 'search.google.com'];

  const handleReviewClick = () => {
    const url = reviewUrl.trim();
    // Many customers aren't signed into Google in their (in-app) browser, which
    // makes leaving a review painful. On Android, force the link into the Google
    // Maps app — where they're usually already signed in — and fall back to the
    // browser if Maps isn't installed. iOS/desktop open normally (a Maps
    // universal link still opens the app when it's installed).
    if (/Android/i.test(navigator.userAgent || '')) {
      try {
        const u = new URL(url);
        if (u.protocol === 'https:' && MAPS_HOSTS.includes(u.host)) {
          // Rebuild from parsed pieces (no hash / userinfo) so the untrusted URL
          // can't inject extra intent params, and confine it to Google Maps.
          const safeHostPath = u.host + u.pathname + u.search;
          window.location.href =
            `intent://${safeHostPath}#Intent;scheme=https;package=com.google.android.apps.maps;` +
            `S.browser_fallback_url=${encodeURIComponent(u.toString())};end`;
          setReviewDone(true);
          return;
        }
      } catch {
        // invalid URL — fall through to opening a normal tab
      }
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    setReviewDone(true);
  };

  return (
    <motion.div
      key="success"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-emerald-50 to-white px-6 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
        className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-emerald-200"
      >
        <Check size={44} className="text-white" strokeWidth={3} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="space-y-3"
      >
        <p className="text-gray-500 font-medium text-sm">{t('orderOf')}</p>
        <h1 className="font-black text-3xl text-gray-900">{customerName}</h1>

        {queueNumber > 1 ? (
          <div className="bg-emerald-500 text-white rounded-3xl px-8 py-5 inline-block shadow-lg shadow-emerald-200 my-4">
            <p className="text-sm font-medium opacity-80 mb-1">{t('queueBefore')}</p>
            <p className="text-5xl font-black tracking-tight">#{queueNumber}</p>
          </div>
        ) : (
          <p className="text-emerald-600 font-black text-2xl leading-relaxed mt-4">
            {t('preparingDrink')}
          </p>
        )}
        <p className="text-gray-600 font-semibold text-base leading-relaxed">
          {t('payAtCounter')}
        </p>
        <p className="text-gray-400 text-sm">
          {t('staffWillCall')}
        </p>
      </motion.div>

      {/* Review prompt card */}
      {hasReviewUrl && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="mt-8 w-full max-w-xs bg-white rounded-2xl shadow-sm border border-emerald-100 px-5 py-4 text-center"
        >
          {reviewDone ? (
            <p className="font-bold text-emerald-600 text-base py-2">{t('reviewThanks')}</p>
          ) : (
            <>
              <p className="font-bold text-gray-900 text-base mb-1">{t('reviewPrompt')}</p>
              <p className="text-gray-500 text-sm mb-4 leading-relaxed">
                {t('reviewDesc')}
              </p>
              <Button
                variant="primary"
                size="md"
                fullWidth
                leftIcon={<Star size={16} />}
                onClick={handleReviewClick}
                noUppercase
              >
                {t('writeReview')}
              </Button>
            </>
          )}
          {/* Review is verified in person — show the review, then staff applies 5% at payment */}
          <p className="text-emerald-700 text-sm font-semibold mt-3 leading-relaxed">
            {t('reviewDiscountNote')}
          </p>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="mt-6 w-full max-w-xs"
      >
        <Button
          variant="outline"
          size="lg"
          fullWidth
          onClick={onReset}
          leftIcon={<RefreshCw size={18} />}
          noUppercase
        >
          {t('orderAgain')}
        </Button>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
function CustomerOrderApp() {
  // --- Language state (persisted so returning customers keep their choice) ---
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem(QR_LANG_STORAGE_KEY);
      return saved === 'en' || saved === 'th' ? saved : 'th';
    } catch {
      return 'th';
    }
  });
  const t = useMemo(() => makeT(lang), [lang]);
  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const next = prev === 'th' ? 'en' : 'th';
      try { localStorage.setItem(QR_LANG_STORAGE_KEY, next); } catch { /* private mode */ }
      return next;
    });
  }, []);

  // --- Auth & data state ---
  const [authed, setAuthed] = useState(false);
  const [menu, setMenu] = useState([]);
  const [categories, setCategories] = useState([]);
  const [beanModifiers, setBeanModifiers] = useState([]);
  const [settings, setSettings] = useState({ shopName: 'ร้านกาแฟ', vatEnabled: true });
  const [settingsData, setSettingsData] = useState({});
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);

  // --- UI state ---
  const [activeCategory, setActiveCategory] = useState('ทั้งหมด');
  const [searchQuery, setSearchQuery] = useState('');
  // Show a curated short list per category first (less choice paralysis); the
  // customer expands to the full list on demand. Resets when the view changes.
  const [showAllItems, setShowAllItems] = useState(false);
  useEffect(() => { setShowAllItems(false); }, [activeCategory, searchQuery]);
  const MENU_PREVIEW_COUNT = 8;
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [beanModalOpen, setBeanModalOpen] = useState(false);
  const [pendingItem, setPendingItem] = useState(null);

  // --- Cart & checkout state ---
  const [cart, setCart] = useState([]);
  const [view, setView] = useState('menu'); // 'menu' | 'checkout' | 'success'
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [usePoints, setUsePoints] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successQueue, setSuccessQueue] = useState(null);

  // ---------------------------------------------------------------------------
  // Anonymous sign-in
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthed(true);
      } else {
        signInAnonymously(auth).catch(() => {
          // If sign-in fails, still try to load data in case rules allow
          setAuthed(true);
        });
      }
    });
    return () => unsubAuth();
  }, []);

  // ---------------------------------------------------------------------------
  // Menu data — single one-time read from the prebuilt config/publicMenu bundle
  // (1 Firestore read) instead of realtime listeners on 4 sources. Falls back to
  // reading the 4 sources once if the bundle has not been published yet.
  // ---------------------------------------------------------------------------
  // Each load() run takes its own sequence number; bumping the counter (a newer
  // run starting, or unmount) cancels older in-flight runs without a later run
  // ever "un-cancelling" an earlier one (which a shared boolean ref would do).
  const loadSeqRef = useRef(0);

  const applySettings = useCallback((data = {}) => {
    setSettings({
      shopName: data.shopName || 'ร้านกาแฟ',
      vatEnabled: data.vatEnabled !== false,
    });
    setSettingsData(data || {});
  }, []);

  const applyBundle = useCallback((bundle) => {
    setMenu(bundle.menu || []);
    setCategories(bundle.categories || []);
    setBeanModifiers(bundle.beanModifiers || []);
    applySettings(bundle.settings || {});
  }, [applySettings]);

  const load = useCallback(async () => {
    const base = ['artifacts', appId, 'public', 'data'];
    const seq = ++loadSeqRef.current;
    const isStale = () => loadSeqRef.current !== seq;

    // 1) Paint instantly from the per-device cache for a fast first frame, then
    //    ALWAYS revalidate against the latest bundle below (step 2). The shop
    //    toggles menu items on/off through the day (e.g. a cake selling out), and
    //    customers MUST see the current menu — so never skip the read on a fresh
    //    cache. Customer reads are negligible for quota (~1 per load); freshness
    //    wins. The cache only gives a fast first paint while the read runs.
    const cached = readCachedPublicMenu(appId);
    if (cached) {
      applyBundle(cached.bundle);
      setLoading(false);
    } else {
      setLoading(true);
    }

    // 2) Refresh from the single bundle doc (1 read). When we already painted
    //    from a stale cache this happens in the background with no spinner.
    let bundle = null;
    try {
      bundle = await fetchPublicMenu(db, appId);
    } catch {
      // Read failed (e.g. rules not deployed yet / transient) — fall through to
      // the source-collection fallback below instead of showing an empty menu.
      bundle = null;
    }
    if (isStale()) return;

    if (bundle) {
      applyBundle(bundle);
      writeCachedPublicMenu(appId, bundle);
    } else if (!cached) {
      // No bundle and nothing cached — fall back to the 4 sources once so the
      // page still works (bundle not published yet, or the read above failed).
      try {
        const [menuSnap, catsSnap, beansSnap, settingsSnap] = await Promise.all([
          getDocs(collection(db, ...base, 'menu')),
          getDocs(collection(db, ...base, 'categories')),
          getDocs(collection(db, ...base, 'beanModifiers')),
          getDoc(doc(db, ...base, 'config', 'settings')),
        ]);
        if (isStale()) return;
        setMenu(menuSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCategories(catsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setBeanModifiers(beansSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        // Strip admin-only secrets (adminPin, geminiApiKey, startingCash) before
        // they touch customer state — the published bundle already strips these,
        // but this raw-doc fallback must too, otherwise a customer device would
        // read AND (with offline persistence) cache the admin PIN to disk.
        let settingsRaw = settingsSnap.exists() ? { ...settingsSnap.data() } : {};
        for (const key of SENSITIVE_SETTINGS_KEYS) delete settingsRaw[key];
        applySettings(settingsRaw);
      } catch {
        // Both paths failed — keep whatever defaults we have so the page renders.
      }
    }
    if (!isStale()) setLoading(false);
  }, [applyBundle, applySettings]);

  // Invalidate any in-flight load() run (unmount / effect re-run).
  const cancelLoad = useCallback(() => {
    loadSeqRef.current++;
  }, []);

  useEffect(() => {
    if (!authed) return;
    load();
    return cancelLoad;
  }, [authed, load, cancelLoad]);

  // ---------------------------------------------------------------------------
  // Derived: filtered menu
  // ---------------------------------------------------------------------------
  const availableMenu = useMemo(
    () => menu.filter((item) => item.available !== false),
    [menu],
  );

  const filteredMenu = useMemo(() => availableMenu
    .filter((item) => {
      const matchCat = activeCategory === 'ทั้งหมด' || item.category === activeCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchSearch = q === '' ||
        item.name.toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q) ||
        (item.nameEn || '').toLowerCase().includes(q) ||
        (item.descriptionEn || '').toLowerCase().includes(q);
      return matchCat && matchSearch;
    })
    // Popular first: most-ordered (soldCount) at the top, least at the back, so
    // the preview slice and the top of the list surface what customers order
    // most. Ties fall back to name for a stable order.
    .sort((a, b) =>
      (Number(b.soldCount || 0) - Number(a.soldCount || 0)) ||
      String(a.name || '').localeCompare(String(b.name || ''), 'th'),
    ), [availableMenu, activeCategory, searchQuery]);

  // ---------------------------------------------------------------------------
  // Highlights: ขายดี (by soldCount) + แนะนำ (isFeatured)
  // Shown only on the default "ทั้งหมด" view without an active search.
  // ---------------------------------------------------------------------------
  // Best-sellers = ONLY items the shop manually pins (no auto-fill from sales).
  const bestSellers = useMemo(
    () => availableMenu.filter((m) => m.isPinnedBest),
    [availableMenu],
  );
  const featuredItems = useMemo(
    () => availableMenu.filter((m) => m.isFeatured),
    [availableMenu],
  );
  const bestSellerIds = useMemo(() => new Set(bestSellers.map((m) => m.id)), [bestSellers]);
  const showHighlights = activeCategory === 'ทั้งหมด' && searchQuery.trim() === '';

  // Welcome popup items = ขายดี first, then แนะนำ (deduped). Showcase only.
  // Skipped entirely while the popup feature flag is off.
  const welcomeItems = useMemo(() => {
    if (!WELCOME_POPUP_ENABLED) return [];
    const seen = new Set();
    return [...bestSellers, ...featuredItems].filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [bestSellers, featuredItems]);

  // Auto-open once per browser session (sessionStorage) once the menu has loaded
  // and there is something to highlight. Closing it marks the session as seen.
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const welcomeShownRef = useRef(false);
  useEffect(() => {
    if (!WELCOME_POPUP_ENABLED || loading || welcomeShownRef.current || welcomeItems.length === 0) return;
    let seen = false;
    try { seen = sessionStorage.getItem('siwara_welcome_seen') === '1'; } catch { /* private mode */ }
    if (!seen) {
      welcomeShownRef.current = true;
      setWelcomeOpen(true);
    }
  }, [loading, welcomeItems.length]);

  const closeWelcome = useCallback(() => {
    setWelcomeOpen(false);
    try { sessionStorage.setItem('siwara_welcome_seen', '1'); } catch { /* private mode */ }
  }, []);

  // SEO: enrich <head> (title, description, JSON-LD menu) from the live shop data
  // once it has loaded. Re-runs if the menu/shop name changes within the session.
  useEffect(() => {
    if (loading || menu.length === 0) return;
    applyCustomerSEO({ shopName: settings.shopName, menu, categories });
  }, [loading, menu, categories, settings.shopName]);

  // Re-render every minute so the Happy Hour banner (and sale prices) appear and
  // disappear automatically as the time window opens/closes during a session.
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // Happy Hour banner: only when the cake sale window is active AND at least one
  // cake item is actually available today (some days there's no cake to sell).
  const happyHourActive =
    isCakeSaleActive(settingsData) &&
    availableMenu.some((m) => isCakeCategory(m.category, settingsData));
  const happyHourPercent = Math.round(Number(settingsData.cakeSalePercent) || 0);
  // Minutes left until the sale window ends (recomputed every minute via nowTick).
  const happyHourLeft = (() => {
    if (!happyHourActive) return 0;
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(settingsData.cakeSaleEnd || ''));
    if (!m) return 0;
    const endMin = Number(m[1]) * 60 + Number(m[2]);
    const now = new Date();
    let diff = endMin - (now.getHours() * 60 + now.getMinutes());
    if (diff < 0) diff += 1440; // window crosses midnight
    return diff;
  })();
  const happyHourLeftText = happyHourLeft >= 60
    ? `${Math.floor(happyHourLeft / 60)} ${t('hoursShort')} ${happyHourLeft % 60} ${t('minutesShort')}`
    : `${happyHourLeft} ${t('minutesShort')}`;

  // ---------------------------------------------------------------------------
  // Category list: "ทั้งหมด" + each category, ordered by the `order` field so the
  // shop controls the tab sequence (e.g. มัทฉะ pinned to the front). We sort here
  // rather than trusting the bundle's array order — the published order can be
  // clobbered by an older POS tab republishing, so the tab bar owns its own sort.
  // Categories without `order` fall to the end, keeping their relative order.
  // ---------------------------------------------------------------------------
  const orderedCategories = [...categories].sort(
    (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
  );
  const categoryNames = ['ทั้งหมด', ...new Set(orderedCategories.map((c) => c.name).filter(Boolean))];
  // Thai category name → English (only where the owner filled `nameEn`), used to
  // localise the category tabs in EN mode. The tab VALUE stays the Thai name so
  // it still matches `item.category`; only the label is swapped.
  const categoryEnByName = Object.fromEntries(
    categories.filter((c) => c.name && c.nameEn).map((c) => [c.name, c.nameEn])
  );

  // ---------------------------------------------------------------------------
  // Membership / points derivations
  // ---------------------------------------------------------------------------
  const redeemPointsThreshold = Number(settingsData.redeemPointsThreshold) || 100;
  const redeemDiscountValue = Number(settingsData.redeemDiscountValue) || 50;

  // Look up the member by phone on demand (debounced) instead of loading the
  // whole members collection on every QR scan — keeps Firestore reads minimal.
  useEffect(() => {
    const phone = customerPhone.trim();
    if (phone.length < 9) { setMember(null); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'members', phone));
        if (!cancelled) setMember(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      } catch {
        if (!cancelled) setMember(null);
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [customerPhone]);

  const memberPoints = Number(member?.points || 0);
  const pointsEligible = !!member && memberPoints >= redeemPointsThreshold;

  // ---------------------------------------------------------------------------
  // Cart totals
  // ---------------------------------------------------------------------------
  // Memoised in one pass — these figures were previously recomputed several
  // times per render (grid, banners, cart bar, drawer, checkout all read them).
  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, i) => s + Number(i.price) * Number(i.quantity), 0);
    // Both the combo "set" promo (see getComboDiscount) and the spend-threshold promo
    // discount the whole cart as one bundle (cake + drink together). The only exception is
    // while Happy Hour is running: cakes already carry a per-item discount in their price,
    // so the spend promo falls back to the non-cake (drinks) portion to avoid double-discount.
    const nonCakeSubtotal = cart.reduce(
      (s, i) => (isCakeCategory(i.category, settingsData) ? s : s + Number(i.price) * Number(i.quantity)),
      0,
    );
    const combo = getComboDiscount(cart, settingsData);
    const rawComboDiscount = combo.applies ? combo.amount : 0;
    const pointsDiscount = (pointsEligible && usePoints) ? redeemDiscountValue : 0;
    // Spend-threshold discount: order ≥ X → get Y% off (0 = disabled)
    const spendThreshold = Number(settingsData.spendThreshold) || 0;
    const spendDiscountPercent = Number(settingsData.spendDiscount) || 0; // a % off once the threshold is reached
    const spendActive = spendThreshold > 0 && spendDiscountPercent > 0;
    const spendBase = isCakeSaleActive(settingsData) ? nonCakeSubtotal : subtotal;
    const rawSpendDiscount = (spendActive && subtotal >= spendThreshold) ? Math.round(spendBase * spendDiscountPercent / 100) : 0;
    const spendRemaining = (spendActive && subtotal > 0 && subtotal < spendThreshold) ? (spendThreshold - subtotal) : 0;
    // Combo and spend-threshold do NOT stack — keep only the bigger of the two so the
    // order-level discount can't balloon. Happy-hour is already in item prices; points
    // (a redeemed member reward) still stacks. These effective values also drive the UI.
    const comboWins = rawComboDiscount >= rawSpendDiscount;
    const comboDiscount = comboWins ? rawComboDiscount : 0;
    const spendDiscount = comboWins ? 0 : rawSpendDiscount;
    const discount = Math.min(subtotal, comboDiscount + pointsDiscount + spendDiscount);
    const vat = settings.vatEnabled ? Math.round(Math.max(0, subtotal - discount) * VAT_RATE) : 0;
    const total = Math.max(0, subtotal - discount + vat);
    return {
      subtotal, combo, pointsDiscount, spendThreshold, spendDiscountPercent,
      spendActive, spendRemaining, comboDiscount, spendDiscount, discount, vat, total,
    };
    // `nowTick` is a deliberate extra dep: getComboDiscount/isCakeSaleActive read the
    // wall clock, so totals must refresh as the Happy Hour window opens/closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, settingsData, pointsEligible, usePoints, redeemDiscountValue, settings.vatEnabled, nowTick]);
  const {
    subtotal, combo, pointsDiscount, spendThreshold, spendDiscountPercent,
    spendActive, spendRemaining, comboDiscount, spendDiscount, discount, vat, total,
  } = totals;

  // ---------------------------------------------------------------------------
  // Cart operations
  // ---------------------------------------------------------------------------
  const addToCart = useCallback((item, modifier = null, sweetness = null, milkType = null) => {
    // modifier อาจเป็นตัวเดียวหรือเป็นลิสต์ (หนึ่งตัวต่อกลุ่ม เช่น ส้ม + เมล็ดกาแฟ)
    const mods = (Array.isArray(modifier) ? modifier : [modifier]).filter(Boolean);
    const modifierName = mods.map(m => `#${m.name}`).join(' ');
    const sweetnessKey = sweetness == null ? '' : `-sweet-${sweetness}`;
    const milkKey = milkType ? `-milk-${milkType}` : '';
    const modifierKey = mods.length ? `-${mods.map(m => m.id).join('-')}` : '';
    const cartId = `${item.id}${modifierKey}${sweetnessKey}${milkKey}`;
    const stockLinks = mods.reduce((acc, m) => mergeStockLinks(acc, m.stockLinks || []), item.stockLinks || []);

    // For modifier path keep original pricing; for plain items apply sale if active
    let finalPrice;
    let saleFields = {};
    if (mods.length) {
      // ราคารวมแบบบวกเพิ่ม: ฐาน = ราคาเมนู, ตัวเลือกที่ไม่ใช่เบสบวกส่วนต่างของมัน
      // (ส้มสด +20, เมล็ดพรีเมียมต่างหาก). กลุ่มเดียวยังเท่ากับสูตร max เดิม.
      finalPrice = computeModifierPrice(item, mods);
    } else {
      const sale = getItemSalePrice(item, settingsData);
      finalPrice = sale.price;
      if (sale.onSale) {
        saleFields = {
          originalPrice: sale.originalPrice,
        };
      }
      // Coffee menus: round the charged price up to the nearest 5 baht.
      if (item.allowBeanModifier) finalPrice = roundUpTo5(finalPrice);
    }

    setCart((prev) => {
      const existing = prev.find((c) => (c.cartId || c.id) === cartId);
      if (existing) {
        return prev.map((c) =>
          (c.cartId || c.id) === cartId
            ? { ...c, quantity: c.quantity + 1 }
            : c,
        );
      }

      // Build note: for sale items append the sale tag
      const sweetnessNote = sweetness == null ? '' : `หวาน ${sweetness}%`;
      const milkLabel = MILK_OPTIONS.find(option => option.value === milkType)?.label || '';
      let note = [modifierName, milkLabel, sweetnessNote].filter(Boolean).join(' ');
      if (!mods.length && saleFields.originalPrice !== undefined) {
        const sale = getItemSalePrice(item, settingsData);
        const tag = cakeSaleNoteTag(sale.percent);
        note = note ? `${note} ${tag}` : tag;
      }

      return [
        ...prev,
        {
          ...item,
          cartId,
          price: finalPrice,
          ...saleFields,
          beanModifier: modifierName,
          sweetness,
          milkType,
          milkLabel,
          stockLinks,
          quantity: 1,
          note,
        },
      ];
    });
  }, [settingsData]);

  const handleMenuItemClick = useCallback((item) => {
    // Only offer options from this menu's group(s) that are in stock (not hidden)
    const groups = getModifierGroups(item);
    const availableBeans = beanModifiers.filter((b) => b.available !== false && groups.includes(b.group || 'เมล็ดกาแฟ'));
    if (!isCakeCategory(item.category) || (item.allowBeanModifier && availableBeans.length > 0)) {
      setPendingItem(item);
      setBeanModalOpen(true);
    } else {
      addToCart(item);
    }
  }, [addToCart, beanModifiers]);

  const handleBeanSelect = useCallback((item, modifiers, sweetness, milkType) => {
    addToCart(item, modifiers, sweetness, milkType);
    setBeanModalOpen(false);
    setPendingItem(null);
  }, [addToCart]);

  const updateQty = useCallback((cartId, newQty) => {
    if (newQty <= 0) {
      setCart((prev) => prev.filter((c) => (c.cartId || c.id) !== cartId));
    } else {
      setCart((prev) =>
        prev.map((c) =>
          (c.cartId || c.id) === cartId ? { ...c, quantity: newQty } : c,
        ),
      );
    }
  }, []);

  const removeItem = useCallback((cartId) => {
    setCart((prev) => prev.filter((c) => (c.cartId || c.id) !== cartId));
  }, []);

  const updateNote = useCallback((cartId, note) => {
    setCart((prev) =>
      prev.map((c) =>
        (c.cartId || c.id) === cartId ? { ...c, note } : c,
      ),
    );
  }, []);

  // ---------------------------------------------------------------------------
  // Order submission
  // ---------------------------------------------------------------------------
  const handleSubmit = async () => {
    if (!customerName.trim() || cart.length === 0 || submitting) return;

    setSubmitting(true);
    setSubmitError('');

    try {
      const base = ['artifacts', appId, 'public', 'data'];
      const queueRef = doc(db, ...base, 'config', 'queue');
      const phone = customerPhone.trim();

      // Re-validate availability against a fresh menu snapshot (1 read) before we
      // burn a queue number — the customer's menu may be up to the cache TTL stale,
      // so an item could have been marked sold-out since they added it. Fail-open:
      // any error here must NOT block a legitimate order.
      try {
        const fresh = await fetchPublicMenu(db, appId);
        if (fresh && Array.isArray(fresh.menu)) {
          const availableIds = new Set(
            fresh.menu.filter((m) => m.available !== false).map((m) => m.id),
          );
          const soldOut = cart.filter((c) => !availableIds.has(c.id));
          if (soldOut.length > 0) {
            const names = [...new Set(soldOut.map((c) => c.name))].join(', ');
            setSubmitError(t('soldOutError', names));
            applyBundle(fresh);              // refresh the menu so the UI matches reality
            writeCachedPublicMenu(appId, fresh);
            setSubmitting(false);
            return;
          }
          writeCachedPublicMenu(appId, fresh); // menu still valid — keep cache current
        }
      } catch {
        // Fresh read failed (network / rules) — proceed rather than block the order.
      }

      let assignedQueue;
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(queueRef);
        const current = snap.exists() ? (snap.data().current || 1) : 1;
        assignedQueue = current;
        tx.set(queueRef, { current: current + 1 }, { merge: true });
      });

      // Strip heavy display-only fields (base64 image, description) so the order
      // doc stays small — avoids Firestore's 1 MiB limit and speeds up the write.
      // Views fall back to the menu's own image via the kept item id.
      const leanItems = cart.map((c) => {
        const lean = { ...c };
        delete lean.image;
        delete lean.description;
        return lean;
      });

      const orderData = {
        queueNumber: assignedQueue,
        items: leanItems,
        subtotal: Number(subtotal),
        discount: Number(discount),
        vat: Number(vat),
        total: Number(total),
        vatIncluded: settings.vatEnabled,
        isPaid: false,
        memberPhone: phone,
        memberNickname: customerName.trim(),
        customerName: customerName.trim(),
        status: 'pending',
        promotionTitle: combo.applies ? COMBO_PROMO_TITLE : '',
        promotionDiscountPercent: combo.applies ? combo.percent : 0,
        bringOwnGlass: false,
        createdAt: serverTimestamp(),
        date: getISODate(),
        time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        table: 'QR',
        source: 'qr',
      };

      await addDoc(collection(db, ...base, 'orders'), orderData);

      // --- Best-selling counter (best-effort; never blocks the order) ---
      bumpMenuSoldCount(cart);

      // --- LINE notification to the shop (best-effort; never blocks) ---
      notifyNewOrderToLine({
        queueNumber: assignedQueue,
        customerName: customerName.trim(),
        items: leanItems,
        total,
        time: orderData.time,
      });

      // --- Member side-effect (non-blocking) ---
      // Identity mirrors PosView: the PHONE is the member id, full stop.
      // A customer who skips the phone field is a guest — their name still rides
      // on the bill (queue call + sales history) but no member doc is created and
      // no points accrue. Name-based ids (`name:${nameKey}`) merged different
      // people who happened to share a nickname, so they are off by default.
      const phoneValid = phone.length >= MEMBER_MIN_PHONE_LENGTH;
      const nameKey = getNameKey(customerName);
      const nameValid = nameKey.length > 0;
      const memberId = phoneValid
        ? phone
        : (nameValid && ALLOW_NAME_ONLY_MEMBERS ? `name:${nameKey}` : null);

      if (memberId) {
        try {
          const memberRef = doc(db, ...base, 'members', memberId);
          const pointsToAdd = Math.floor(total / 10);
          const redeemDeduct = (usePoints && pointsEligible) ? redeemPointsThreshold : 0;

          // `member` state is only ever loaded by phone lookup, so a name-based
          // id never resolves to an existing member here — that's fine, it just
          // means createdAt gets (re)stamped, matching PosView's !existingMember path.
          // Compare against the doc id (always the phone it was looked up by), NOT a
          // stored `phone` field — older member docs whose id IS the phone may lack
          // that field, and re-stamping createdAt would destroy their join date.
          const isExisting = !!member && phoneValid && member.id === phone;
          const memberPayload = {
            name: customerName.trim(),
            lastOrderAt: serverTimestamp(),
          };
          if (phoneValid) memberPayload.phone = phone;
          // Earned points are held in pendingPoints until the owner approves them
          // on the Members page. Redemption is applied in real time.
          if (pointsToAdd > 0) {
            memberPayload.pendingPoints = increment(pointsToAdd);
            memberPayload.pendingReason = 'order';
          }
          if (redeemDeduct > 0) {
            memberPayload.points = increment(-redeemDeduct);
          }
          if (!isExisting) {
            memberPayload.createdAt = serverTimestamp();
          }
          // History records the real-time redemption now; earned points are
          // logged to history when the owner approves them.
          const now = new Date().toISOString();
          const entries = [];
          if (redeemDeduct > 0) entries.push({ delta: -redeemDeduct, reason: 'redeem', at: now });
          if (entries.length > 0) memberPayload.pointsHistory = arrayUnion(...entries);
          await setDoc(memberRef, memberPayload, { merge: true });
        } catch {
          // Member write failure is non-critical — order already saved
        }
      }

      // Queue shown to the customer = number of orders still pending (real load).
      // 1 (only this order) → no number, just "preparing". Best-effort; never blocks.
      try {
        const snap = await getCountFromServer(
          query(collection(db, ...base, 'orders'), where('status', '==', 'pending')),
        );
        setSuccessQueue(snap.data().count || 0);
      } catch {
        setSuccessQueue(0);
      }
      setView('success');
    } catch (err) {
      // Surface the real cause: 'permission-denied' (rules), 'invalid-argument'
      // (bad/oversized doc), 'unavailable' (network/offline), etc.
      console.error('[QR order submit] failed:', err);
      const code = err?.code || err?.message || 'unknown';
      setSubmitError(t('submitFailedError', code));
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Reset to order again
  // ---------------------------------------------------------------------------
  const handleReset = () => {
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setUsePoints(false);
    setSubmitError('');
    setSuccessQueue(null);
    setView('menu');
  };

  // Review reward = 10 points PENDING the shop's approval (we can't verify the
  // external review, so the owner approves it on the members page). Once per phone.
  // ---------------------------------------------------------------------------
  // Loading screen
  // ---------------------------------------------------------------------------
  if (loading || !authed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white gap-4">
        <Spinner size="xl" color="emerald" />
        <p className="text-gray-400 font-medium text-sm">{t('appLoading')}</p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Success screen
  // ---------------------------------------------------------------------------
  if (view === 'success') {
    return (
      <AnimatePresence mode="wait">
        <SuccessScreen
          queueNumber={successQueue}
          customerName={customerName}
          onReset={handleReset}
          reviewUrl={settingsData.reviewUrl}
          t={t}
        />
      </AnimatePresence>
    );
  }

  // ---------------------------------------------------------------------------
  // Checkout step
  // ---------------------------------------------------------------------------
  if (view === 'checkout') {
    return (
      <AnimatePresence mode="wait">
        <CheckoutStep
          cart={cart}
          subtotal={subtotal}
          vat={vat}
          total={total}
          vatEnabled={settings.vatEnabled}
          customerName={customerName}
          onNameChange={setCustomerName}
          onSubmit={handleSubmit}
          onBack={() => setView('menu')}
          submitting={submitting}
          submitError={submitError}
          customerPhone={customerPhone}
          onPhoneChange={setCustomerPhone}
          member={member}
          memberPoints={memberPoints}
          pointsEligible={pointsEligible}
          usePoints={usePoints}
          onTogglePoints={() => setUsePoints((v) => !v)}
          redeemPointsThreshold={redeemPointsThreshold}
          redeemDiscountValue={redeemDiscountValue}
          comboDiscount={comboDiscount}
          pointsDiscount={pointsDiscount}
          spendDiscount={spendDiscount}
          t={t}
          lang={lang}
        />
      </AnimatePresence>
    );
  }

  // ---------------------------------------------------------------------------
  // Menu browsing view
  // ---------------------------------------------------------------------------
  const itemCount = cart.reduce((s, i) => s + Number(i.quantity), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ---- Header ---- */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-black text-gray-900 text-xl leading-tight">{settings.shopName}</h1>
            <p className="text-emerald-500 text-xs font-semibold mt-0.5">{t('orderViaQr')}</p>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle lang={lang} onToggle={toggleLang} />
            {itemCount > 0 && (
              <button
                onClick={() => setCartDrawerOpen(true)}
                className="relative w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 hover:bg-emerald-100 transition-colors"
              >
                <ShoppingCart size={22} />
                <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                  {itemCount}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full bg-gray-100 rounded-xl py-2.5 pl-9 pr-4 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-hide">
          {categoryNames.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                activeCategory === cat
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat === 'ทั้งหมด' ? t('categoryAll') : (lang === 'en' && categoryEnByName[cat] ? categoryEnByName[cat] : cat)}
            </button>
          ))}
        </div>
      </header>

      {/* ---- Happy Hour banner (only when a cake is actually available) ---- */}
      <AnimatePresence>
        {happyHourActive && (
          <motion.div
            key="happy-hour"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-4 mt-3 rounded-2xl px-4 py-3 bg-gradient-to-r from-amber-400 to-orange-500 shadow-lg flex items-center gap-3"
          >
            <span className="text-2xl">🍰</span>
            <div className="leading-tight flex-1">
              <p className="text-white font-black text-sm">{t('happyHourBanner', happyHourPercent, happyHourLeftText)}</p>
              <p className="text-white/90 font-semibold text-xs">
                {t('happyHourUntil', settingsData.cakeSaleEnd)}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Combo nudge banner ---- */}
      <AnimatePresence>
        {combo.enabled && combo.percent > 0 && (combo.hasCake !== combo.hasDrink) && !happyHourActive && !(spendActive && subtotal >= spendThreshold) && (
          <motion.div
            key="combo-nudge"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-4 mt-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center gap-2"
          >
            <span className="text-emerald-700 font-semibold text-sm">
              {combo.hasCake
                ? t('comboNudgeCake', combo.percent)
                : t('comboNudgeDrink', combo.percent)}
            </span>
          </motion.div>
        )}
        {comboDiscount > 0 && (
          <motion.div
            key="combo-applied"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-4 mt-3 bg-emerald-500 rounded-2xl px-4 py-3 flex items-center gap-2"
          >
            <span className="text-white font-semibold text-sm">
              {t('comboApplied', combo.percent)}
            </span>
          </motion.div>
        )}
        {spendActive && comboDiscount === 0 && (
          <motion.div
            key="spend-progress"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`mx-4 mt-3 rounded-2xl px-4 py-3 border ${subtotal >= spendThreshold ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className={`font-bold text-sm ${subtotal >= spendThreshold ? 'text-emerald-600' : 'text-amber-700'}`}>
                {subtotal >= spendThreshold
                  ? (spendDiscount > 0
                      ? t('spendReachedWithDiscount', spendDiscountPercent)
                      : t('spendReachedNoDiscount', formatCurrency(spendThreshold)))
                  : subtotal === 0
                    ? t('spendStart', formatCurrency(spendThreshold), spendDiscountPercent)
                    : t('spendRemaining', formatCurrency(spendRemaining), spendDiscountPercent)}
              </span>
              <span className="text-[11px] font-bold text-gray-400 shrink-0">
                {formatCurrency(Math.min(subtotal, spendThreshold))}/{formatCurrency(spendThreshold)}
              </span>
            </div>
            <div className="h-2 bg-black/5 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-500"
                initial={false}
                animate={{ width: `${Math.min(100, spendThreshold > 0 ? (subtotal / spendThreshold) * 100 : 0)}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 20 }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Highlight rails: ขายดี + แนะนำ ---- */}
      {showHighlights && (bestSellers.length > 0 || featuredItems.length > 0) && (
        <div className="pt-4 space-y-5">
          {bestSellers.length > 0 && (
            <HighlightRail
              title={t('bestSellerRailTitle')}
              items={bestSellers}
              onAdd={handleMenuItemClick}
              settingsData={settingsData}
              autoScroll
              t={t}
              lang={lang}
            />
          )}
          {featuredItems.length > 0 && (
            <HighlightRail
              title={t('featuredRailTitle')}
              items={featuredItems}
              onAdd={handleMenuItemClick}
              settingsData={settingsData}
              bestSellerIds={bestSellerIds}
              t={t}
              lang={lang}
            />
          )}
        </div>
      )}

      {/* ---- Menu grid ---- */}
      <main className="px-4 py-4 pb-32">
        {showHighlights && (bestSellers.length > 0 || featuredItems.length > 0) && (
          <h2 className="text-sm font-bold text-gray-700 mb-3 px-0.5">{t('allMenuHeading')}</h2>
        )}
        {filteredMenu.length === 0 ? (
          <EmptyState
            icon={searchQuery ? 'search' : 'default'}
            title={searchQuery ? t('noMenuFound') : t('noMenuYet')}
            description={searchQuery ? t('noMenuFoundDesc', searchQuery) : t('noMenuYetDesc')}
          />
        ) : (
          <>
            <motion.div
              layout
              className="grid grid-cols-2 gap-3"
            >
              <AnimatePresence>
                {(showAllItems || searchQuery.trim() ? filteredMenu : filteredMenu.slice(0, MENU_PREVIEW_COUNT)).map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    onAdd={handleMenuItemClick}
                    settingsData={settingsData}
                    isBestSeller={bestSellerIds.has(item.id)}
                    t={t}
                    lang={lang}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
            {!showAllItems && !searchQuery.trim() && filteredMenu.length > MENU_PREVIEW_COUNT && (
              <button
                onClick={() => setShowAllItems(true)}
                className="mt-4 w-full py-3 rounded-2xl border-2 border-emerald-200 text-emerald-600 font-bold text-sm bg-white hover:bg-emerald-50 transition-colors active:scale-[0.98]"
              >
                {t('viewAllMenu', filteredMenu.length - MENU_PREVIEW_COUNT)}
              </button>
            )}
          </>
        )}
      </main>

      {/* ---- Sticky cart bar ---- */}
      <AnimatePresence>
        {itemCount > 0 && (
          <StickyCartBar
            cart={cart}
            total={total}
            onClick={() => setCartDrawerOpen(true)}
            t={t}
          />
        )}
      </AnimatePresence>

      {/* ---- Cart drawer ---- */}
      <CartDrawer
        isOpen={cartDrawerOpen}
        cart={cart}
        total={total}
        onClose={() => setCartDrawerOpen(false)}
        onUpdateQty={updateQty}
        onRemove={removeItem}
        onUpdateNote={updateNote}
        onProceed={() => {
          setCartDrawerOpen(false);
          setView('checkout');
        }}
        t={t}
        lang={lang}
      />

      {/* ---- Welcome popup: auto-running ขายดี + แนะนำ showcase (feature-flagged) ---- */}
      {WELCOME_POPUP_ENABLED && (
        <WelcomePopup
          isOpen={welcomeOpen}
          items={welcomeItems}
          settingsData={settingsData}
          onClose={closeWelcome}
          t={t}
          lang={lang}
        />
      )}

      {/* ---- Bean modifier modal ---- */}
      <BeanModifierModal
        isOpen={beanModalOpen}
        item={pendingItem}
        modifiers={beanModifiers.filter((b) => b.available !== false && getModifierGroups(pendingItem).includes(b.group || 'เมล็ดกาแฟ'))}
        onSelect={handleBeanSelect}
        onClose={() => {
          setBeanModalOpen(false);
          setPendingItem(null);
        }}
        t={t}
        lang={lang}
      />
    </div>
  );
}

CustomerOrderApp.displayName = 'CustomerOrderApp';

export default CustomerOrderApp;
