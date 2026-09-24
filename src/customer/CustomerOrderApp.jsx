/**
 * CustomerOrderApp — Self-service QR ordering page
 * Standalone component; does NOT import AppContext or App.jsx internals.
 * Customers scan a QR code, browse the menu, add to cart, enter their name, and submit.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingCart,
  X,
  Search,
  ChevronLeft,
  Coffee,
  AlertCircle,
  Flame,
  Star,
  Cake,
  Gift,
} from 'lucide-react';
import {
  signInAnonymously,
  onAuthStateChanged,
} from 'firebase/auth';
import { lookupMemberByPhone } from '../services/memberLookup';
import {
  LOOKUP_DEBOUNCE_MS,
  canRedeemOnSubmit,
  canSubmitOrder,
  clearRememberedPhone,
  decideNameAutofill,
  decideReorderIdentity,
  initialNameAutofillState,
  phoneToPrefillOnCheckout,
  readRememberedPhone,
  shouldApplyLookupResult,
  writeRememberedPhone,
} from '../utils/memberAutofill';
// Full Firestore SDK (~95 KB gzip) is NOT imported statically: the menu is read
// via firestore/lite, and the full SDK is only needed for writes (funnel counters,
// checkout fallback), so it loads lazily after the menu has painted.
import { auth, functions, appId } from '../services/firebaseCore';
import { liteDb, menuLiteReader, fetchMenuCollectionsLite } from '../services/firebaseLite';
import { buildCheckoutItems, shouldKeepRequestId, submitTrustedCheckout } from '../services/checkoutService';
import { fetchPublicMenu, readCachedPublicMenu, writeCachedPublicMenu, SENSITIVE_SETTINGS_KEYS } from '../utils/publicMenu';
import { sendQrBeacon } from '../services/qrBeacon';
import {
  QR_LOAD_TIMEOUT_MS,
  bundleFromCache,
  isMenuReadyFromSources,
  isQrLoadTimeoutError,
  readWithRetry,
  shouldShowQrLoadError,
  shouldShowQrSpinner,
  withTimeout,
} from '../utils/qrMenuLoad';
// Direct imports, not the ../components/ui barrel (which drags Table, Select,
// Tabs, StockUsageInput → utils/wastage, ... onto the customer page).
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import { formatCurrency, roundUpTo5, getModifierGroups, supportsMilkChoice, MEMBER_MIN_PHONE_LENGTH, normalizeThaiPhoneInput } from '../config/constants';
import { getItemSalePrice, COMBO_PROMO_TITLE, isCakeSaleActive, isCakeCategory, supportsSweetnessChoice } from '../utils/promotions';
import { bumpMenuSoldCount } from '../utils/menuSales';
import { sortByFeaturedOrder } from '../utils/featuredOrder';
import { buildCartLine, calculateCartTotals, replaceCartLine, getCartCrossSell } from '../utils/customerCart';
import { trackFunnelStep } from '../utils/qrFunnel';
import { readCartDraft, restoreCartDraft, saveCartDraft, clearCartDraft, readLastSweetness, rememberSweetness } from '../utils/cartDraft';
import { applyCustomerSEO } from '../utils/seo';
import { getEligibleRewards, toggleRewardSelection } from '../utils/rewards';
import { dispField, lineOptionSummary, defaultOptionNote } from './display';
import { MenuCard, MenuRow } from './MenuItems';
import { CategoryChips } from './CategoryNav';
import { sectionDomId, useScrollSpy } from './scrollSpy';
import OptionSheet from './OptionSheet';
import ItemDetailSheet from './ItemDetailSheet';
import CartSheet from './CartSheet';
import SuccessScreen from './SuccessScreen';

// Lazy full-SDK helpers (see the firebaseCore import above).
const loadFullDb = () => import('../services/firebase').then((m) => m.db);
const loadCheckoutFallback = () => import('../services/checkoutFallback');
const trackStep = (step) => { loadFullDb().then((db) => trackFunnelStep(db, appId, step)).catch(() => {}); };
const whenIdle = (fn) => {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout: 2000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 300);
  return () => clearTimeout(id);
};

// ---------------------------------------------------------------------------
// i18n: Thai/English UI chrome for the customer-facing QR ordering page.
// Menu/category names come from Firestore and are intentionally NOT translated.
// ---------------------------------------------------------------------------
const QR_LANG_STORAGE_KEY = 'qr_lang';

// Feature flag — set to true to bring back the auto-running welcome popup.
// Disabled for now per request; all popup code stays intact but costs nothing
// while the flag is off (JSX and welcomeItems computation are both gated).
const WELCOME_POPUP_ENABLED = false;

const TX = {
  th: {
    bestSellerBadgeText: 'ขายดี',
    posterBadgeShort: 'เรื่องราว',
    viewDetails: 'ดูรายละเอียด',
    chooseOptionHint: 'เลือกแบบที่นิยมไว้ให้แล้ว เปลี่ยนได้ตามชอบ',
    chooseOptionTapHint: 'แตะตัวเลือกเพื่อเพิ่มลงตะกร้า',
    cheaperBy: (price) => `ถูกลง ${price}`,
    cartCount: (n) => `${n} รายการ`,
    removeItem: 'ลบรายการ',
    decrease: 'ลดจำนวน',
    increase: 'เพิ่มจำนวน',
    saveNote: 'บันทึกหมายเหตุ',
    orderSent: 'ส่งออเดอร์เข้าครัวแล้ว',
    redeemedReward: 'รางวัลที่แลกในบิลนี้',
    rewardRedeem: (name) => `แลก ${name}`,
    rewardCost: (n) => `${n} แต้ม`,
    featuredChip: 'แนะนำ',
    menuSections: 'หมวดเมนู',
    searchResults: (n) => `พบ ${n} เมนู`,
    clearSearch: 'ล้างคำค้น',
    otherCategory: 'อื่นๆ',
    customerInfo: 'ข้อมูลผู้สั่ง',
    back: 'กลับไปเลือกเมนู',
    payAtCounterHint: 'ส่งออเดอร์แล้วชำระเงินที่เคาน์เตอร์',
    cartButton: (n) => `ตะกร้า ${n} รายการ`,
    editCart: 'แก้ไข',
    crossSell: (pct) => `ทานคู่กันลด ${pct}%`,
    netAdd: (price) => `+ เพิ่ม · จ่ายเพิ่มสุทธิ ${price}`,
    lastSweetness: (level) => `ล่าสุดคุณเลือก ${level}%`,
    editOptions: 'แก้ตัวเลือก',
    saveOptions: 'บันทึกตัวเลือก',
    draftRestored: 'กู้ตะกร้าเดิมให้แล้ว',
    draftDropped: 'บางรายการหมดแล้ว',
    appLoading: 'กำลังโหลดเมนู...',
    menuLoadSlow: 'โหลดเมนูช้าผิดปกติ',
    menuLoadSlowDesc: 'อินเทอร์เน็ตหน่วงนิดนึงค่ะ กดลองใหม่อีกครั้งได้เลยนะคะ',
    menuLoadRetry: 'ลองใหม่',
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
    bestSellerRailTitle: 'เมนูขายดี',
    featuredRailTitle: 'เมนูแนะนำ',
    cakeRailTitle: 'เค้กวันนี้',
    cakeRailSubtitle: 'อบสดใหม่ มีจำนวนจำกัด',
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
    posterBadge: 'แตะดูเรื่องราว',
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
    nameHintAutofilled: 'ใส่ชื่อให้แล้วค่ะ แก้ได้ถ้าไม่ใช่ชื่อที่ต้องการ',
    memberPhoneShortcut: 'สมาชิกกรอกแค่เบอร์ได้เลยค่ะ เดี๋ยวชื่อขึ้นให้เอง',
    phoneLabel: 'เบอร์โทร สำหรับสะสมแต้ม',
    phonePlaceholder: 'กรอกเบอร์โทรได้เลย (ไม่บังคับ)',
    memberStatus: (name, points) => `สมาชิก: ${name} • ${points} แต้ม`,
    defaultCustomerName: 'ลูกค้า',
    pointsReady: (val) => `🎉 ครบแล้ว! แลกส่วนลด ฿${val} ได้เลย`,
    pointsRemaining: (rem, val) => `อีก ${rem} แต้ม แลกส่วนลด ฿${val}`,
    lookupChecking: 'กำลังดูให้นะคะ',
    lookupFailedHint: 'เช็คเบอร์ไม่ได้นะคะ แต่สั่งได้ตามปกติค่ะ',
    newPhoneHint: 'เบอร์นี้ยังไม่เป็นสมาชิก จะเริ่มสะสมแต้มจากบิลนี้ค่ะ',
    noPhoneHint: 'ไม่ใส่เบอร์ก็สั่งได้ แต่บิลนี้จะไม่สะสมแต้ม',
    notMe: 'ไม่ใช่ฉัน',
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
    yourQueue: 'เลขคิวของคุณ',
    kitchenPosition: 'ลำดับของคุณในครัว',
    positionN: (n) => `ที่ ${n}`,
    orderNumber: (n) => `เลขออเดอร์ #${n} · แจ้งพนักงานได้`,
    ordersAhead: (n) => `มี ${n} ออเดอร์ก่อนหน้าคุณ`,
    preparingDrink: 'กำลังทำเครื่องดื่มของคุณ ☕',
    payAtCounter: 'กรุณาชำระเงินที่เคาน์เตอร์',
    staffWillCall: 'พนักงานจะเรียกชื่อเมื่อเครื่องดื่มพร้อม',
    reviewThanks: 'ขอบคุณสำหรับรีวิว 💚',
    reviewPrompt: 'ถูกใจร้านเราไหม? 💚',
    reviewDesc: 'ฝากรีวิวให้เราหน่อยน้า เป็นกำลังใจให้ร้านมากๆ 🙏',
    writeReview: 'เขียนรีวิว',
    reviewDiscountNote: '📣 รีวิวแล้ว แจ้งพนักงานตอนจ่ายเงิน รับส่วนลด 5% ทันที!',
    lineTitle: 'เป็นสมาชิกร้านผ่านไลน์',
    lineDesc: 'แอดไลน์ @siwara ไว้เช็คแต้มสะสม สั่งล่วงหน้า ไม่ต้องรอคิว และรู้ก่อนใครเมื่อมีเมนูใหม่',
    lineButton: 'แอดไลน์ @siwara',
    orderAgain: 'สั่งเพิ่ม / สั่งใหม่',
    soldOutError: (names) => `ขออภัย "${names}" เพิ่งหมด กรุณานำออกจากตะกร้าแล้วลองใหม่อีกครั้ง`,
    submitFailedError: (code) => `สั่งออเดอร์ไม่สำเร็จ (${code}) — ลองใหม่อีกครั้ง`,
  },
  en: {
    bestSellerBadgeText: 'Best seller',
    posterBadgeShort: 'Story',
    viewDetails: 'View details',
    chooseOptionHint: 'The usual choice is preselected · change anything you like',
    chooseOptionTapHint: 'Tap an option to add it to your cart',
    cheaperBy: (price) => `${price} less`,
    cartCount: (n) => `${n} item${n > 1 ? 's' : ''}`,
    removeItem: 'Remove item',
    decrease: 'Decrease quantity',
    increase: 'Increase quantity',
    saveNote: 'Save note',
    orderSent: 'Your order is in the kitchen',
    redeemedReward: 'Reward redeemed on this bill',
    rewardRedeem: (name) => `Redeem ${name}`,
    rewardCost: (n) => `${n} points`,
    featuredChip: 'Picks',
    menuSections: 'Menu sections',
    searchResults: (n) => `${n} item${n === 1 ? '' : 's'} found`,
    clearSearch: 'Clear search',
    otherCategory: 'Other',
    customerInfo: 'Your details',
    back: 'Back to menu',
    payAtCounterHint: 'Place the order, then pay at the counter',
    cartButton: (n) => `Cart, ${n} item${n > 1 ? 's' : ''}`,
    editCart: 'Edit',
    crossSell: (pct) => `Pair them for ${pct}% off`,
    netAdd: (price) => `+ Add · Net extra ${price}`,
    lastSweetness: (level) => `Last time: ${level}%`,
    editOptions: 'Edit options',
    saveOptions: 'Save options',
    draftRestored: 'Your cart has been restored',
    draftDropped: 'Some items are no longer available',
    appLoading: 'Loading menu...',
    menuLoadSlow: 'Menu is taking too long',
    menuLoadSlowDesc: 'The connection seems slow. Please try again.',
    menuLoadRetry: 'Try again',
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
    bestSellerRailTitle: 'Best sellers',
    featuredRailTitle: 'Featured',
    cakeRailTitle: 'Today’s cakes',
    cakeRailSubtitle: 'Freshly baked, limited quantities',
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
    posterBadge: 'Tap for the story',
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
    nameHintAutofilled: "We filled this in for you — edit it if it's not right",
    memberPhoneShortcut: "Members: just enter your phone — we'll fill in your name",
    phoneLabel: 'Phone, to earn points',
    phonePlaceholder: 'Enter your phone (optional)',
    memberStatus: (name, points) => `Member: ${name} • ${points} points`,
    defaultCustomerName: 'Customer',
    pointsReady: (val) => `🎉 Ready! Redeem for ฿${val} off`,
    pointsRemaining: (rem, val) => `${rem} points left to redeem ฿${val} off`,
    lookupChecking: 'Checking your number',
    lookupFailedHint: "Couldn't check the number, but you can still order",
    newPhoneHint: "This number isn't a member yet — this order starts earning points",
    noPhoneHint: 'You can order without a phone, but this bill earns no points',
    notMe: 'Not me',
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
    yourQueue: 'Your queue number',
    kitchenPosition: 'Your place in the kitchen line',
    positionN: (n) => `No. ${n}`,
    orderNumber: (n) => `Order #${n} · show this to staff`,
    ordersAhead: (n) => `${n} order${n > 1 ? 's' : ''} ahead of you`,
    preparingDrink: 'Preparing your drink ☕',
    payAtCounter: 'Please pay at the counter',
    staffWillCall: "Staff will call your name when it's ready",
    reviewThanks: 'Thanks for the review 💚',
    reviewPrompt: 'Enjoyed your visit? 💚',
    reviewDesc: 'Leave us a review — it means a lot! 🙏',
    writeReview: 'Write a review',
    reviewDiscountNote: '📣 Show your review to staff at checkout for 5% off!',
    lineTitle: 'Join us on LINE',
    lineDesc: 'Add @siwara to check your points, pre-order to skip the queue, and hear about new menu items first.',
    lineButton: 'Add @siwara on LINE',
    orderAgain: 'Order again',
    soldOutError: (names) => `Sorry, "${names}" just sold out — please remove it from your cart and try again`,
    submitFailedError: (code) => `Order failed (${code}) — please try again`,
  },
};

// Popular first: most-ordered (soldCount) at the top, least at the back, so
// the top of every section surfaces what customers order most. Ties fall back
// to name for a stable order.
const byPopularity = (a, b) =>
  (Number(b.soldCount || 0) - Number(a.soldCount || 0)) ||
  String(a.name || '').localeCompare(String(b.name || ''), 'th');

const makeT = (lang) => (key, ...args) => {
  const entry = TX[lang]?.[key] ?? TX.th[key] ?? key;
  return typeof entry === 'function' ? entry(...args) : entry;
};

// ---------------------------------------------------------------------------
// Sub-component: LanguageToggle — TH/EN switch shown in the header
// ---------------------------------------------------------------------------
function LanguageToggle({ lang, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="shrink-0 flex items-center gap-0.5 p-1 min-h-11 rounded-full bg-[var(--bg-sunken)] text-xs font-bold"
      aria-label="Toggle language / สลับภาษา"
    >
      {['th', 'en'].map((code) => (
        <span
          key={code}
          className={`px-2.5 py-1.5 rounded-full ${lang === code ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-[var(--elev-1)]' : 'text-[var(--text-muted)]'}`}
        >
          {code.toUpperCase()}
        </span>
      ))}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: FeaturedRail · horizontal, swipeable row of photo cards.
// (The best-seller rail used to auto-scroll as a marquee; moving targets are
// hard to tap and ignore reduced-motion, so every rail is now static.)
// ---------------------------------------------------------------------------
function FeaturedRail({ title, subtitle, icon: Icon, items, onAdd, onView, settingsData, bestSellerIds, t, lang, sectionRef, wide = false, priorityCount = 0 }) {
  if (!items || items.length === 0) return null;
  return (
    <section ref={sectionRef} aria-label={title}>
      <div className="px-4 mb-2 flex items-baseline gap-2">
        <h3 className="flex items-center gap-1.5 text-base font-bold text-[var(--text-primary)] leading-snug">
          {Icon && <Icon size={18} className="text-[var(--accent)]" aria-hidden="true" />}
          {title}
        </h3>
        {subtitle && <p className="text-xs text-[var(--text-muted)] truncate">{subtitle}</p>}
      </div>
      <div className="flex gap-3 overflow-x-auto px-4 pb-2 snap-x scroll-px-4 scrollbar-hide">
        {items.map((item, i) => (
          <div key={item.id} className={`${wide ? 'w-48' : 'w-40'} shrink-0 snap-start`}>
            <MenuCard
              item={item}
              onAdd={onAdd}
              onView={onView}
              settingsData={settingsData}
              isBestSeller={bestSellerIds.has(item.id)}
              t={t}
              lang={lang}
              priority={i < priorityCount}
            />
          </div>
        ))}
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
<div key={key} className="w-36 flex-shrink-0 mr-3 bg-[var(--bg-secondary)] rounded-[var(--radius)] border border-[var(--border-color)] shadow-[var(--elev-1)] overflow-hidden">
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
<p className="font-semibold text-[var(--text-primary)] text-xs leading-tight line-clamp-2 min-h-[2rem]">{dispField(item, lang)}</p>
          <div className="mt-1">
            {p.onSale ? (
              <div className="flex items-baseline gap-1">
<span className="text-[var(--text-muted)] text-[10px] line-through">{formatCurrency(p.original)}</span>
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
className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[61] mx-auto max-w-md bg-[var(--bg-secondary)] rounded-[var(--radius)] shadow-[var(--elev-3)] overflow-hidden"
          >
            {/* Header */}
            <div className="relative px-5 pt-5 pb-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white">
              <button
                onClick={onClose}
                aria-label={t('close')}
            className="absolute top-3 right-3 w-8 h-8 rounded-[var(--radius-sm)] bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              >
                <X size={18} />
              </button>
              <p className="text-white/80 text-xs font-semibold">{t('welcomeGreeting')}</p>
<h2 className="font-bold text-xl leading-tight">{t('welcomeTitle')}</h2>
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
// Sub-component: CheckoutStep · who is ordering (name, phone, points) + order summary + submit
// ---------------------------------------------------------------------------
const panel = 'bg-[var(--bg-surface)] rounded-[var(--radius-lg)] shadow-[var(--elev-1)]';

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
  pointsRewardsEnabled,
  pointsRewards,
  redeemRewardId,
  onToggleReward,
  lookupStatus = 'idle',
  nameSource = 'empty',
  onNotMe,
  // discount breakdown
  comboDiscount,
  pointsDiscount,
  spendDiscount,
  t,
  lang = 'th',
}) {
  const itemCount = cart.reduce((s, i) => s + Number(i.quantity), 0);
  const canSubmit = canSubmitOrder({ customerName, cartLength: itemCount, submitting });
  const eligibleRewards = pointsRewardsEnabled && member ? getEligibleRewards(pointsRewards, memberPoints) : [];

  return (
    <div className="min-h-dvh bg-[var(--bg-canvas)] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[var(--bg-surface)] border-b border-[var(--border-color)]">
        <div className="max-w-2xl mx-auto px-2 h-16 flex items-center gap-1">
          <button
            type="button"
            onClick={onBack}
            aria-label={t('back')}
            className="w-11 h-11 rounded-full flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          >
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-[length:var(--fs-xl)] leading-[var(--lh-xl)] font-bold text-[var(--text-primary)]">{t('confirmOrder')}</h1>
        </div>
      </header>

      <div className="flex-1 w-full max-w-2xl mx-auto px-4 pt-4 pb-44 space-y-4">
        {/* Who is ordering: the name is how staff call the order */}
        <section className={`${panel} px-4 py-4 space-y-4`} aria-label={t('customerInfo')}>
          <div>
            <Input
              label={t('yourName')}
              placeholder={t('namePlaceholder')}
              value={customerName}
              onChange={(e) => onNameChange(e.target.value)}
              maxLength={60}
              autoComplete="given-name"
              autoFocus
            />
            <p className="text-xs text-[var(--text-muted)] mt-1.5">
              {nameSource === 'autofill' ? t('nameHintAutofilled') : t('nameHint')}
            </p>
          </div>

          {/* Phone input for membership */}
          <div className="pt-4 border-t border-[var(--border-color)]">
            <p className="text-sm text-[var(--text-secondary)] mb-2">{t('memberPhoneShortcut')}</p>
            <Input
              label={t('phoneLabel')}
              placeholder={t('phonePlaceholder')}
              value={customerPhone}
              // Keep digits only: "081 234 5678" / "081-234-5678" still becomes a
              // full 10-digit number instead of being cut off by maxLength, and a
              // phone-autofilled "+66 81 234 5678" becomes 0812345678.
              onChange={(e) => onPhoneChange(normalizeThaiPhoneInput(e.target.value))}
              inputMode="numeric"
              autoComplete="tel"
            />
            {/* Member status line + points progress */}
            <div aria-live="polite" className="mt-2">
              {member && lookupStatus !== 'checking' ? (
                <div className="flex items-start justify-between gap-3 rounded-[var(--radius)] bg-[var(--accent-soft)] px-3 py-2.5">
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-sm text-[var(--accent-soft-fg)] font-semibold">
                      {t('memberStatus', member.name || t('defaultCustomerName'), memberPoints)}
                    </p>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {memberPoints >= redeemPointsThreshold
                        ? t('pointsReady', redeemDiscountValue)
                        : t('pointsRemaining', redeemPointsThreshold - memberPoints, redeemDiscountValue)}
                    </p>
                  </div>
                  {onNotMe && (
                    <button
                      type="button"
                      onClick={onNotMe}
                      className="shrink-0 min-h-11 px-2 -my-1.5 -mr-1 text-sm text-[var(--text-secondary)] underline underline-offset-2"
                    >
                      {t('notMe')}
                    </button>
                  )}
                </div>
              ) : lookupStatus === 'checking' ? (
                <p className="text-sm text-[var(--text-secondary)]">{t('lookupChecking')}</p>
              ) : lookupStatus === 'error' ? (
                <p className="text-sm text-[var(--text-secondary)]">{t('lookupFailedHint')}</p>
              ) : customerPhone.length >= MEMBER_MIN_PHONE_LENGTH ? (
                <p className="text-sm text-[var(--text-secondary)]">{t('newPhoneHint')}</p>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">{t('noPhoneHint')}</p>
              )}
            </div>
          </div>

          {/* Points redemption toggle */}
          {pointsEligible && (
            <button
              type="button"
              role="switch"
              aria-checked={usePoints}
              onClick={onTogglePoints}
              className={`w-full min-h-14 flex items-center justify-between gap-3 px-4 py-3 rounded-[var(--radius)] border-2 text-left transition-colors ${
                usePoints ? 'bg-[var(--accent-soft)] border-[var(--accent)]' : 'bg-[var(--bg-surface)] border-[var(--border-strong)]'
              }`}
            >
              <span className={`flex items-center gap-2 font-semibold ${usePoints ? 'text-[var(--accent-soft-fg)]' : 'text-[var(--text-primary)]'}`}>
                <Gift size={18} aria-hidden="true" />
                {t('usePointsToggle', redeemPointsThreshold, redeemDiscountValue)}
              </span>
              <span className={`relative shrink-0 w-12 h-7 rounded-full transition-colors ${usePoints ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'}`} aria-hidden="true">
                <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-[var(--elev-1)] transition-transform ${usePoints ? 'translate-x-5' : ''}`} />
              </span>
            </button>
          )}

          {eligibleRewards.length > 0 && (
            <div className="space-y-2" role="radiogroup">
              {eligibleRewards.map((reward) => {
                const selected = redeemRewardId === reward.id;
                return (
                  <label
                    key={reward.id}
                    className={`w-full min-h-14 flex items-center justify-between gap-3 px-4 py-3 rounded-[var(--radius)] border-2 cursor-pointer transition-colors ${
                      selected ? 'bg-[var(--accent-soft)] border-[var(--accent)]' : 'bg-[var(--bg-surface)] border-[var(--border-strong)]'
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <span className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${selected ? 'border-[var(--accent)]' : 'border-[var(--border-strong)]'}`} aria-hidden="true">
                        {selected && <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]" />}
                      </span>
                      <span className={`font-semibold ${selected ? 'text-[var(--accent-soft-fg)]' : 'text-[var(--text-primary)]'}`}>
                        {t('rewardRedeem', reward.name)}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-bold text-[var(--state-warn)] bg-[var(--state-warn-soft)] px-2 py-1 rounded-full num">
                      {t('rewardCost', reward.cost)}
                    </span>
                    <input
                      type="radio"
                      className="sr-only"
                      checked={selected}
                      onChange={() => onToggleReward(reward.id)}
                    />
                  </label>
                );
              })}
            </div>
          )}
        </section>

        {/* Order summary */}
        <section className={`${panel} overflow-hidden`}>
          <div className="px-4 pt-4 pb-2 flex items-baseline justify-between gap-2">
            <h2 className="font-bold text-[var(--text-primary)]">{t('orderedItems')}</h2>
            <button type="button" onClick={onBack} className="min-h-11 -my-2 px-2 text-sm font-semibold text-[var(--accent-soft-fg)]">{t('editCart')}</button>
          </div>
          <ul className="divide-y divide-[var(--border-color)]">
            {cart.map((line) => {
              const id = line.cartId || line.id;
              const options = lineOptionSummary(line, t, lang);
              const customNote = line.note && line.note !== defaultOptionNote(line) ? line.note : '';
              return (
                <li key={id} className="px-4 py-3 flex items-start gap-3">
                  <span className="shrink-0 min-w-7 h-7 px-1.5 rounded-full bg-[var(--bg-sunken)] text-sm font-bold text-[var(--text-secondary)] flex items-center justify-center num">{line.quantity}×</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[var(--text-primary)] leading-snug">{dispField(line, lang)}</p>
                    {options && <p className="text-sm text-[var(--text-secondary)] leading-snug">{options}</p>}
                    {customNote && <p className="text-sm text-[var(--text-muted)] leading-snug">{customNote}</p>}
                  </div>
                  <span className="shrink-0 font-semibold text-[var(--text-primary)] num">
                    {formatCurrency(Number(line.price) * Number(line.quantity))}
                  </span>
                </li>
              );
            })}
          </ul>

          {/* Totals */}
          <dl className="px-4 py-3 space-y-1.5 border-t border-[var(--border-color)] bg-[var(--bg-sunken)] text-sm">
            <div className="flex justify-between text-[var(--text-secondary)]">
              <dt>{t('itemsPrice')}</dt>
              <dd className="num">{formatCurrency(subtotal)}</dd>
            </div>
            {comboDiscount > 0 && (
              <div className="flex justify-between text-[var(--state-danger)]">
                <dt>{t('comboDiscountLabel')}</dt>
                <dd className="num">-{formatCurrency(comboDiscount)}</dd>
              </div>
            )}
            {pointsDiscount > 0 && (
              <div className="flex justify-between text-[var(--accent)]">
                <dt>{t('pointsDiscountLabel')}</dt>
                <dd className="num">-{formatCurrency(pointsDiscount)}</dd>
              </div>
            )}
            {spendDiscount > 0 && (
              <div className="flex justify-between text-[var(--state-warn)]">
                <dt>{t('spendDiscountLabel')}</dt>
                <dd className="num">-{formatCurrency(spendDiscount)}</dd>
              </div>
            )}
            {vatEnabled && (
              <div className="flex justify-between text-[var(--text-secondary)]">
                <dt>{t('vatLabel')}</dt>
                <dd className="num">{formatCurrency(vat)}</dd>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-[var(--border-color)] text-[var(--text-primary)]">
              <dt className="font-bold text-base">{t('grandTotal')}</dt>
              <dd className="font-bold text-xl text-[var(--accent)] num">{formatCurrency(total)}</dd>
            </div>
          </dl>
        </section>

        {/* Error message */}
        {submitError && (
          <div role="alert" className="bg-[var(--state-danger-soft)] border border-[var(--state-danger)] rounded-[var(--radius)] px-4 py-3 flex items-start gap-2 text-[var(--state-danger)]">
            <AlertCircle size={18} className="shrink-0 mt-0.5" aria-hidden="true" />
            <span className="text-sm font-medium">{submitError}</span>
          </div>
        )}
      </div>

      {/* Submit bar (fixed) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-[var(--bg-surface)] border-t border-[var(--border-color)] shadow-[var(--elev-3)] pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-2xl mx-auto px-4 pt-3 pb-3 space-y-2">
          <p className="text-center text-xs text-[var(--text-muted)]">{t('payAtCounterHint')}</p>
          <Button
            variant="primary"
            size="xl"
            fullWidth
            onClick={onSubmit}
            loading={submitting}
            disabled={!canSubmit}
          >
            {submitting ? t('submitting') : (
              <span className="flex w-full items-center justify-between gap-3">
                <span>{t('submitOrder')}</span>
                <span className="num">{formatCurrency(total)}</span>
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
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
  const [loadError, setLoadError] = useState(null);
  const [hasPainted, setHasPainted] = useState(false);

  // --- UI state ---
  // The menu is one page of category sections; the sticky chip bar follows the
  // section being read (scroll-spy) and jumps to a section on tap.
  const [searchQuery, setSearchQuery] = useState('');
  const stickyBarRef = useRef(null);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [beanModalOpen, setBeanModalOpen] = useState(false);
  const [pendingItem, setPendingItem] = useState(null);
  const [editingLine, setEditingLine] = useState(null);
  const [draftNotice, setDraftNotice] = useState(null);
  const [draftReady, setDraftReady] = useState(false);
  const [menuReady, setMenuReady] = useState(false);
  const [suggestedLine, setSuggestedLine] = useState(null);
  const draftRestoredRef = useRef(false);
  const [scrollTarget, setScrollTarget] = useState(null); // section key to jump to after the next render
  const [detailItem, setDetailItem] = useState(null); // full-screen image/poster view

  // --- Cart & checkout state ---
  const [cart, setCart] = useState([]);
  const [view, setView] = useState('menu'); // 'menu' | 'checkout' | 'success'
  const [nameAutofill, setNameAutofill] = useState(initialNameAutofillState);
  const customerName = nameAutofill.customerName;
  const [customerPhone, setCustomerPhone] = useState('');
  const [usePoints, setUsePoints] = useState(false);
  const [redeemRewardId, setRedeemRewardId] = useState(null);
  const [lookupStatus, setLookupStatus] = useState('idle');
  const lookupSeqRef = useRef(0);
  const customerPhoneRef = useRef('');
  customerPhoneRef.current = customerPhone;
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successQueue, setSuccessQueue] = useState(null);
  // Keep the same key across ambiguous network retries so the backend returns
  // the original order instead of charging points / incrementing queue twice.
  const checkoutRequestIdRef = useRef(null);
  // What the current requestId was issued for. The backend treats a repeated
  // requestId as "same order" and returns the existing one, so if the cart or
  // customer changed since (e.g. restored draft, then edited) a new id is needed
  // — otherwise the new items would silently never reach the kitchen.
  const requestSignatureRef = useRef(null);
  const lastSuccessAtRef = useRef(0);

  // ---------------------------------------------------------------------------
  // Anonymous sign-in (8s timeout — a hung SDK used to spin forever)
  // ---------------------------------------------------------------------------
  const authedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (cancelled) return;
      if (user) {
        authedRef.current = true;
        setAuthed(true);
        setLoadError(null);
      } else {
        signInAnonymously(auth).catch(() => {
          if (cancelled) return;
          sendQrBeacon('error_auth');
          setLoadError('error_auth');
          setLoading(false);
        });
      }
    });
    const timer = setTimeout(() => {
      if (cancelled || authedRef.current) return;
      sendQrBeacon('error_auth');
      setLoadError((prev) => prev || 'error_auth');
      setLoading(false);
    }, QR_LOAD_TIMEOUT_MS);
    return () => {
      cancelled = true;
      unsubAuth();
      clearTimeout(timer);
    };
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
    setHasPainted(true);
  }, [applySettings]);

  // Paint from localStorage immediately — do not wait for anonymous auth.
  // Revalidate from Firestore once authed (see load() below).
  useEffect(() => {
    const cached = readCachedPublicMenu(appId);
    const bundle = bundleFromCache(cached);
    if (!bundle) return;
    applyBundle(bundle);
    setLoading(false);
    sendQrBeacon('menu_ok');
  }, [applyBundle]);

  const finishLoad = useCallback((ready) => {
    setLoading(false);
    setMenuReady(ready);
    if (ready) {
      setLoadError(null);
      sendQrBeacon('menu_ok');
    }
  }, []);

  const load = useCallback(async () => {
    const base = ['artifacts', appId, 'public', 'data'];
    const seq = ++loadSeqRef.current;
    const isStale = () => loadSeqRef.current !== seq;
    const startedAt = Date.now();
    const budgetLeft = () => Math.max(1, QR_LOAD_TIMEOUT_MS - (Date.now() - startedAt));

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
      sendQrBeacon('menu_ok');
    } else {
      setLoading(true);
    }

    // 2) Refresh from the single bundle doc (1 read). When we already painted
    //    from a stale cache this happens in the background with no spinner.
    let bundle = null;
    let sourceMenuReady = false;
    try {
      bundle = await withTimeout(
        readWithRetry(() => fetchPublicMenu(liteDb, appId, menuLiteReader)),
        QR_LOAD_TIMEOUT_MS,
        'error_menu',
      );
    } catch (err) {
      if (isQrLoadTimeoutError(err)) {
        if (isStale()) return;
        sendQrBeacon('error_menu');
        finishLoad(Boolean(cached));
        if (!cached) setLoadError('error_menu');
        return;
      }
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
        // Lite reads go directly to the server and reject when offline. They
        // have no cache metadata; a successful empty response is authoritative.
        const [menuSnap, catsSnap, beansSnap] = await withTimeout(
          readWithRetry(() => fetchMenuCollectionsLite(appId)),
          budgetLeft(),
          'error_menu',
        );
        if (isStale()) return;
        sourceMenuReady = true;
        setMenu(menuSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCategories(catsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setBeanModifiers(beansSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setHasPainted(true);
      } catch (err) {
        if (isQrLoadTimeoutError(err)) {
          if (!isStale()) {
            sendQrBeacon('error_menu');
            finishLoad(false);
            setLoadError('error_menu');
          }
          return;
        }
        // Both paths failed — keep whatever defaults we have so the page renders.
      }

      // `config/settings` เปิดให้เฉพาะพนักงานอ่าน (มี adminPin กับ geminiApiKey อยู่)
      // ลูกค้าจะถูกปฏิเสธเป็นปกติ จึงต้องอ่านแยกและกลืน error เอง
      // ถ้าเอาไปรวมใน Promise.all ข้างบน การถูกปฏิเสธจะลากให้เมนูหายทั้งหน้า
      // ค่าที่ลูกค้าต้องใช้อยู่ใน config/publicMenu อยู่แล้ว ทางนี้เป็นแค่ตาข่ายรอง
      // สำหรับกรณีที่ยังไม่เคยเผยแพร่ bundle
      // Don't let a hung settings read keep the spinner up — menu already painted.
      menuLiteReader.getDoc(menuLiteReader.doc(liteDb, ...base, 'config', 'settings')).then((settingsSnap) => {
        if (isStale()) return;
        const settingsRaw = settingsSnap.exists() ? { ...settingsSnap.data() } : {};
        for (const key of SENSITIVE_SETTINGS_KEYS) delete settingsRaw[key];
        applySettings(settingsRaw);
      }).catch(() => {
        // ลูกค้าอ่านไม่ได้ตามที่ตั้งใจ · ใช้ค่าเริ่มต้นต่อไป เมนูยังสั่งได้
      });
    }
    if (!isStale()) {
      const ready = isMenuReadyFromSources({ bundle, cached, sourceMenuReady });
      finishLoad(ready);
      // Both the bundle and the fallback collections failed WITHOUT tripping our
      // 8s timeout (e.g. Firestore returned "unavailable" fast, or a blocked
      // network). Without this the page would fall through to an empty menu that
      // sits on "ยังไม่มีเมนู" forever — show the retry screen instead.
      if (!ready && !cached) {
        sendQrBeacon('error_menu');
        setLoadError('error_menu');
      }
    }
  }, [applyBundle, applySettings, finishLoad]);

  // Invalidate any in-flight load() run (unmount / effect re-run).
  const cancelLoad = useCallback(() => {
    loadSeqRef.current++;
  }, []);

  const handleRetryLoad = useCallback(() => {
    sendQrBeacon('retry');
    // Reload also recreates the Firebase transport; local cache and draft survive.
    window.location.reload();
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

  const searchTerm = searchQuery.trim().toLowerCase();
  const isSearching = searchTerm !== '';
  // A search looks through the whole menu (every section).
  const searchResults = useMemo(() => (!searchTerm ? [] : availableMenu
    .filter((item) =>
      item.name.toLowerCase().includes(searchTerm) ||
      (item.description || '').toLowerCase().includes(searchTerm) ||
      (item.nameEn || '').toLowerCase().includes(searchTerm) ||
      (item.descriptionEn || '').toLowerCase().includes(searchTerm))
    .sort(byPopularity)), [availableMenu, searchTerm]);

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
    () => sortByFeaturedOrder(availableMenu.filter((m) => m.isFeatured)),
    [availableMenu],
  );
  const bestSellerIds = useMemo(() => new Set(bestSellers.map((m) => m.id)), [bestSellers]);
  // ใช้ชื่อหมวดเป็นทางสำรองเฉพาะการจัดแสดง เพื่อไม่เปลี่ยนกติกาส่วนลดเดิม
  const cakeItems = useMemo(() => availableMenu.filter(item =>
    isCakeCategory(item.category, settingsData) ||
    ((!Array.isArray(settingsData?.cakeSaleCategories) || settingsData.cakeSaleCategories.length === 0) && /เค้ก|cake/i.test(item.category || ''))
  ), [availableMenu, settingsData]);

  // ---------------------------------------------------------------------------
  // Category sections, ordered by the category `order` field so the shop
  // controls the sequence (e.g. มัทฉะ pinned to the front). We sort here rather
  // than trusting the bundle's array order · the published order can be
  // clobbered by an older POS tab republishing. Categories without `order` fall
  // to the end; items whose category is not in the list get a trailing section.
  // ---------------------------------------------------------------------------
  const categoryEnByName = useMemo(() => Object.fromEntries(
    categories.filter((c) => c.name && c.nameEn).map((c) => [c.name, c.nameEn]),
  ), [categories]);
  const menuSections = useMemo(() => {
    const byCategory = new Map();
    for (const item of availableMenu) {
      const name = item.category || '';
      if (!byCategory.has(name)) byCategory.set(name, []);
      byCategory.get(name).push(item);
    }
    const ordered = [...categories]
      .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
      .map((c) => c.name)
      .filter(Boolean);
    const names = [...new Set([...ordered, ...byCategory.keys()])].filter((name) => byCategory.get(name)?.length);
    return names.map((name, i) => ({ key: `c${i}`, name, items: [...byCategory.get(name)].sort(byPopularity) }));
  }, [availableMenu, categories]);
  const sectionLabel = (name) => (!name ? t('otherCategory') : (lang === 'en' && categoryEnByName[name]) || name);

  const hasHighlights = cakeItems.length > 0 || bestSellers.length > 0 || featuredItems.length > 0;
  const navItems = useMemo(() => [
    ...(hasHighlights ? [{ key: 'featured', label: t('featuredChip') }] : []),
    ...menuSections.map((section) => ({
      key: section.key,
      label: !section.name ? t('otherCategory') : (lang === 'en' && categoryEnByName[section.name]) || section.name,
      count: section.items.length,
    })),
  ], [hasHighlights, menuSections, t, lang, categoryEnByName]);
  const navKeys = useMemo(() => navItems.map((n) => n.key), [navItems]);
  const getStickyOffset = useCallback(() => stickyBarRef.current?.offsetHeight ?? 0, []);
  const { active: activeSection, jumpTo } = useScrollSpy(navKeys, getStickyOffset, !isSearching && view === 'menu' && hasPainted);

  useEffect(() => {
    if (!scrollTarget) return;
    jumpTo(scrollTarget);
    setScrollTarget(null);
  }, [scrollTarget, jumpTo]);

  const selectSection = useCallback((key) => {
    if (isSearching) {
      setSearchQuery('');
      setScrollTarget(key); // jump once the sections are back on the page
    } else {
      jumpTo(key);
    }
  }, [isSearching, jumpTo]);

  useEffect(() => {
    if (!menuReady || loading || !authed || draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    const draft = readCartDraft();
    if (draft) {
      const restored = restoreCartDraft(draft, menu, beanModifiers, settingsData);
      setCart((current) => [...restored.cart, ...current]);
      checkoutRequestIdRef.current = restored.cart.length ? draft.checkoutRequestId : null;
      requestSignatureRef.current = restored.cart.length ? draft.requestSignature || null : null;
      if (draft.cart.length) setDraftNotice(restored.dropped ? 'dropped' : 'restored');
    }
    setDraftReady(true);
  }, [menuReady, loading, authed, menu, beanModifiers, settingsData]);

  useEffect(() => {
    if (!draftReady) return;
    if (view === 'success' || !cart.length) {
      clearCartDraft();
      checkoutRequestIdRef.current = null;
    } else {
      saveCartDraft({ cart, checkoutRequestId: checkoutRequestIdRef.current, requestSignature: requestSignatureRef.current });
    }
  }, [draftReady, cart, customerName, customerPhone, view]);

  useEffect(() => {
    if (!draftNotice) return;
    const timer = setTimeout(() => setDraftNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [draftNotice]);

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
  // Membership / points derivations
  // ---------------------------------------------------------------------------
  const redeemPointsThreshold = Number(settingsData.redeemPointsThreshold) || 50;
  const redeemDiscountValue = Number(settingsData.redeemDiscountValue) || 50;

  // Prefill the last phone saved on this device when checkout opens empty.
  useEffect(() => {
    if (view !== 'checkout') return;
    const remembered = readRememberedPhone();
    if (!remembered) return;
    setCustomerPhone((current) => phoneToPrefillOnCheckout(current, remembered));
  }, [view]);

  // Drop a stale member (and the points toggle) as soon as the typed phone
  // no longer matches — waiting for lookup would let submit send usePoints
  // for the previous person and the backend rejects the whole order.
  useEffect(() => {
    const phone = normalizeThaiPhoneInput(customerPhone);
    if (!member || member.phone === phone) return;
    setMember(null);
    setUsePoints(false);
      setRedeemRewardId(null);
  }, [customerPhone, member]);

  useEffect(() => {
    if (!member || member.phone !== normalizeThaiPhoneInput(customerPhone)) {
      setUsePoints(false);
      setRedeemRewardId(null);
    }
  }, [member, customerPhone]);

  // Look up the member by phone on demand (debounced) instead of loading the
  // whole members collection on every QR scan — keeps Firestore reads minimal.
  useEffect(() => {
    const phone = normalizeThaiPhoneInput(customerPhone);
    if (phone.length < MEMBER_MIN_PHONE_LENGTH) {
      lookupSeqRef.current += 1;
      setMember(null);
      setUsePoints(false);
      setRedeemRewardId(null);
      setLookupStatus('idle');
      setNameAutofill((state) => decideNameAutofill(state, { type: 'phone-below-min', phone }));
      return undefined;
    }

    const seq = lookupSeqRef.current + 1;
    lookupSeqRef.current = seq;
    setLookupStatus('checking');
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const data = await lookupMemberByPhone(phone);
        if (!shouldApplyLookupResult({
          cancelled,
          seq,
          currentSeq: lookupSeqRef.current,
          resultPhone: phone,
          currentPhone: customerPhoneRef.current,
        })) return;
        if (data.exists) {
          setMember({ id: phone, phone, name: data.name, points: data.points, pendingPoints: data.pendingPoints, pointsExpireAt: data.pointsExpireAt });
          setLookupStatus('found');
          setNameAutofill((state) => decideNameAutofill(state, { type: 'lookup-hit', phone, memberName: data.name }));
        } else {
          setMember(null);
          setUsePoints(false);
      setRedeemRewardId(null);
          setLookupStatus('new');
          setNameAutofill((state) => decideNameAutofill(state, { type: 'lookup-miss', phone }));
        }
      } catch {
        if (!shouldApplyLookupResult({
          cancelled,
          seq,
          currentSeq: lookupSeqRef.current,
          resultPhone: phone,
          currentPhone: customerPhoneRef.current,
        })) return;
        setMember(null);
        setUsePoints(false);
      setRedeemRewardId(null);
        setLookupStatus('error');
        setNameAutofill((state) => decideNameAutofill(state, { type: 'lookup-error', phone }));
      }
    }, LOOKUP_DEBOUNCE_MS);
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
    return calculateCartTotals(cart, settingsData, pointsEligible, usePoints, redeemDiscountValue, settings.vatEnabled);
    // `nowTick` is a deliberate extra dep: getComboDiscount/isCakeSaleActive read the
    // wall clock, so totals must refresh as the Happy Hour window opens/closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, settingsData, pointsEligible, usePoints, redeemDiscountValue, settings.vatEnabled, nowTick]);
  const {
    subtotal, combo, pointsDiscount, spendThreshold, spendDiscountPercent,
    spendActive, spendRemaining, comboDiscount, spendDiscount, vat, total,
  } = totals;

  const crossSell = useMemo(
    () => getCartCrossSell(cart, cakeItems, beanModifiers, settingsData, pointsEligible, usePoints, redeemDiscountValue, settings.vatEnabled, readLastSweetness() ?? 100),
    // nowTick: combo/Happy Hour depend on the clock, same as `totals`
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart, cakeItems, beanModifiers, settingsData, pointsEligible, usePoints, redeemDiscountValue, settings.vatEnabled, nowTick],
  );

  const navigateCombo = () => {
    // Missing a cake → the cake rail (or the cake section); missing a drink →
    // the first section that is not cake.
    setSearchQuery('');
    const cakeCategories = new Set(cakeItems.map((item) => item.category));
    const target = !combo.hasCake
      ? (cakeItems.length ? 'cake' : menuSections.find((s) => cakeCategories.has(s.name))?.key)
      : menuSections.find((s) => !cakeCategories.has(s.name))?.key;
    if (target) setScrollTarget(target);
  };

  // ---------------------------------------------------------------------------
  // Cart operations
  // ---------------------------------------------------------------------------
  // Anonymous funnel counters (see utils/qrFunnel.js) · each step once per session,
  // fire-and-forget so a failed write can never affect ordering.
  // 'view' waits for an idle moment so the lazy full-SDK download never competes
  // with the first paint; it also warms the SDK + checkout fallback for later.
  useEffect(() => {
    if (!(authed && (menuReady || hasPainted))) return undefined;
    return whenIdle(() => { trackStep('view'); loadCheckoutFallback().catch(() => {}); });
  }, [authed, menuReady, hasPainted]);
  useEffect(() => { if (cartDrawerOpen) trackStep('cart'); }, [cartDrawerOpen]);
  // Checkout and success start at the top; going back to the menu returns to
  // where the customer was browsing.
  const menuScrollRef = useRef(0);
  useEffect(() => {
    window.scrollTo(0, view === 'menu' ? menuScrollRef.current : 0);
  }, [view]);
  useEffect(() => {
    if (view === 'checkout') trackStep('checkout');
    if (view === 'success') trackStep('order');
  }, [view]);

  const addToCart = useCallback((item, modifier = null, sweetness = null, milkType = null) => {
    const line = buildCartLine(item, modifier, sweetness, milkType, settingsData);
    trackStep('add'); // once per session · never blocks
    setCart((prev) => {
      const existing = prev.find((c) => (c.cartId || c.id) === line.cartId);
      return existing ? prev.map((c) => c === existing ? { ...c, quantity: c.quantity + 1 } : c) : [...prev, line];
    });
  }, [settingsData]);

  const handleMenuItemClick = useCallback((item) => {
    // Only offer options from this menu's group(s) that are in stock (not hidden)
    const groups = getModifierGroups(item);
    const availableBeans = beanModifiers.filter((b) => b.available !== false && groups.includes(b.group || 'เมล็ดกาแฟ'));
    setEditingLine(null);
    setSuggestedLine(null);
    if (supportsSweetnessChoice(item, settingsData) || supportsMilkChoice(item) || (item.allowBeanModifier && availableBeans.length > 0)) {
      setPendingItem(item);
      setBeanModalOpen(true);
    } else {
      addToCart(item);
    }
  }, [addToCart, beanModifiers, settingsData]);

  // "Add to cart" inside the full-screen menu view continues into the normal flow.
  const handleDetailAdd = useCallback((item) => {
    setDetailItem(null);
    handleMenuItemClick(item);
  }, [handleMenuItemClick]);

  const handleBeanSelect = useCallback((item, modifiers, sweetness, milkType) => {
    if (supportsSweetnessChoice(item, settingsData)) rememberSweetness(sweetness);
    if (editingLine) {
      const line = buildCartLine(item, modifiers, sweetness, milkType, settingsData);
      const newId = `edit-${crypto.randomUUID()}`;
      setCart((prev) => replaceCartLine(prev, editingLine.cartId || editingLine.id, line, newId));
      setCartDrawerOpen(true);
    } else addToCart(item, modifiers, sweetness, milkType);
    setEditingLine(null);
    setBeanModalOpen(false);
    setPendingItem(null);
  }, [addToCart, editingLine, settingsData]);

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
      const phone = customerPhone.trim();
      const redeem = canRedeemOnSubmit({ usePoints, member, phone, pointsEligible });
      const signature = JSON.stringify([customerName.trim(), phone, redeem, buildCheckoutItems(cart)]);
      if (requestSignatureRef.current !== signature) checkoutRequestIdRef.current = null;
      const requestId = checkoutRequestIdRef.current || crypto.randomUUID();
      checkoutRequestIdRef.current = requestId;
      requestSignatureRef.current = signature;
      saveCartDraft({ cart, checkoutRequestId: requestId, requestSignature: signature });
      const result = await submitTrustedCheckout(functions, {
        requestId,
        customerName: customerName.trim(),
        phone,
        usePoints: redeem,
        items: buildCheckoutItems(cart),
      });

      // --- Best-selling counter (best-effort; never blocks the order) ---
      bumpMenuSoldCount(cart);

      setSuccessQueue({ number: result.queueNumber || 0, pending: result.pendingCount || 0 });
      lastSuccessAtRef.current = Date.now();
      requestSignatureRef.current = null;
      checkoutRequestIdRef.current = null;
      writeRememberedPhone(phone);
      clearCartDraft();
      setView('success');
    } catch (err) {
      console.error('[QR order submit] failed:', err);
      const code = err?.code || err?.message || 'unknown';

      // Backend ล่ม (เช่น billing ปิด → Cloud Run ไม่รับ request) ไม่ใช่ความผิดลูกค้า
      // เขียนออเดอร์ลง Firestore ตรงๆ แทน ร้านจะได้ไม่ต้องหยุดรับออเดอร์ทั้งวัน
      const checkoutFallback = await loadCheckoutFallback().catch(() => null);
      if (checkoutFallback?.isBackendDown(code)) {
        try {
          const fallback = await checkoutFallback.submitCheckoutDirect(await loadFullDb(), appId, {
            uid: auth.currentUser?.uid,
            requestId: checkoutRequestIdRef.current,
            customerName: customerName.trim(),
            phone: customerPhone.trim(),
            cart,
            totals,
            vatIncluded: !!settings.vatEnabled,
            promotionTitle: comboDiscount > 0
              ? COMBO_PROMO_TITLE
              : (spendDiscount > 0 ? `สั่งครบ ฿${spendThreshold.toLocaleString()} -${spendDiscountPercent}%` : ''),
            promotionDiscountPercent: comboDiscount > 0 ? (combo.percent || 0) : spendDiscountPercent,
          });
          bumpMenuSoldCount(cart);
          setSuccessQueue({ number: fallback.queueNumber || 0, pending: fallback.pendingCount || 0 });
          lastSuccessAtRef.current = Date.now();
          requestSignatureRef.current = null;
          checkoutRequestIdRef.current = null;
          writeRememberedPhone(customerPhone.trim());
          clearCartDraft();
          setView('success');
          return;
        } catch (fallbackErr) {
          console.error('[QR order submit] direct-write fallback failed:', fallbackErr);
        }
      }

      if (!shouldKeepRequestId(code)) checkoutRequestIdRef.current = null;
      saveCartDraft({ cart, checkoutRequestId: checkoutRequestIdRef.current, requestSignature: requestSignatureRef.current });
      setSubmitError(t('submitFailedError', code));
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Reset to order again
  // ---------------------------------------------------------------------------
  // "สั่งเพิ่ม" keeps the name + phone so a second round (a friend's drink,
  // another cake) doesn't mean typing everything again; both stay editable at
  // checkout. Only within 10 minutes of the last order, so on a shared device
  // the next customer doesn't inherit someone's phone (and points). Points are
  // re-chosen per order.
  const REORDER_KEEP_MS = 10 * 60 * 1000;
  const handleReset = () => {
    setCart([]);
    const keepIdentity = Date.now() - lastSuccessAtRef.current <= REORDER_KEEP_MS;
    setNameAutofill((state) => decideReorderIdentity(state, { keepIdentity }));
    if (!keepIdentity) setCustomerPhone('');
    requestSignatureRef.current = null;
    setUsePoints(false);
      setRedeemRewardId(null);
    setSubmitError('');
    setSuccessQueue(null);
    checkoutRequestIdRef.current = null;
    menuScrollRef.current = 0;
    setView('menu');
  };

  const handleNameChange = (nextName) => {
    setNameAutofill((state) => decideNameAutofill(state, { type: 'name-input', nextName }));
  };

  const handleNotMe = () => {
    setNameAutofill((state) => decideNameAutofill(state, { type: 'not-me' }));
    setCustomerPhone('');
    setMember(null);
    setUsePoints(false);
      setRedeemRewardId(null);
    setLookupStatus('idle');
    clearRememberedPhone();
  };

  // Review reward = 10 points PENDING the shop's approval (we can't verify the
  // external review, so the owner approves it on the members page). Once per phone.
  // ---------------------------------------------------------------------------
  // Loading / timeout screen
  // ---------------------------------------------------------------------------
  if (shouldShowQrLoadError({ loadError, menuReady, hasPainted })) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--bg-secondary)] px-6">
        <EmptyState
          icon="error"
          title={t('menuLoadSlow')}
          description={t('menuLoadSlowDesc')}
          actionLabel={t('menuLoadRetry')}
          onAction={handleRetryLoad}
        />
      </div>
    );
  }

  if (shouldShowQrSpinner({ loading, authed, menuReady, loadError, hasPainted })) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--bg-secondary)] gap-4">
        <Spinner size="xl" color="emerald" />
          <p className="text-[var(--text-muted)] font-medium text-sm">{t('appLoading')}</p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Success screen
  // ---------------------------------------------------------------------------
  if (view === 'success') {
    return (
      <SuccessScreen
        queueNumber={successQueue}
        customerName={customerName}
        onReset={handleReset}
        reviewUrl={settingsData.reviewUrl}
        t={t}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Checkout step
  // ---------------------------------------------------------------------------
  if (view === 'checkout') {
    return (
      <CheckoutStep
        cart={cart}
        subtotal={subtotal}
        vat={vat}
        total={total}
        vatEnabled={settings.vatEnabled}
        customerName={customerName}
        onNameChange={handleNameChange}
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
        onTogglePoints={() => {
          const res = toggleRewardSelection(usePoints, redeemRewardId, 'discount');
          setUsePoints(res.usePoints);
          setRedeemRewardId(res.redeemRewardId);
        }}
        lookupStatus={lookupStatus}
        nameSource={nameAutofill.nameSource}
        onNotMe={handleNotMe}
        redeemPointsThreshold={redeemPointsThreshold}
        redeemDiscountValue={redeemDiscountValue}
        pointsRewardsEnabled={settingsData.pointsRewardsEnabled}
        pointsRewards={settingsData.pointsRewards}
        redeemRewardId={redeemRewardId}
        onToggleReward={(id) => {
          const res = toggleRewardSelection(usePoints, redeemRewardId, 'reward', id);
          setUsePoints(res.usePoints);
          setRedeemRewardId(res.redeemRewardId);
        }}
        comboDiscount={comboDiscount}
        pointsDiscount={pointsDiscount}
        spendDiscount={spendDiscount}
        t={t}
        lang={lang}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Menu browsing view
  // ---------------------------------------------------------------------------
  const itemCount = cart.reduce((s, i) => s + Number(i.quantity), 0);
  const spendReached = subtotal >= spendThreshold;

  return (
    <div className="min-h-dvh bg-[var(--bg-canvas)]">
      {/* ---- Shopfront header (scrolls away; the chip bar below stays) ---- */}
      <header className="bg-[var(--bg-surface)]">
        <div className="max-w-5xl mx-auto px-4 pt-4 pb-3 space-y-3">
          <div className="flex items-center gap-3">
            <span className="shrink-0 w-12 h-12 rounded-[var(--radius)] bg-[var(--surface-inverse)] text-[var(--text-on-inverse)] flex items-center justify-center" aria-hidden="true">
              <Coffee size={24} strokeWidth={1.8} />
            </span>
            <div className="flex-1 min-w-0">
              <h1 className="text-[length:var(--fs-2xl)] leading-[var(--lh-2xl)] font-bold text-[var(--text-primary)] truncate">{settings.shopName}</h1>
              <p className="text-sm text-[var(--text-secondary)] leading-snug">{t('orderViaQr')}</p>
            </div>
            <LanguageToggle lang={lang} onToggle={toggleLang} />
          </div>
          <div className="relative">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              enterKeyHint="search"
              className="w-full min-h-12 bg-[var(--bg-sunken)] rounded-full pl-10 pr-12 text-base text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-transparent focus:outline-none focus:border-[var(--accent)] focus:bg-[var(--bg-surface)] [&::-webkit-search-cancel-button]:hidden"
            />
            {isSearching && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label={t('clearSearch')}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-[var(--text-secondary)]"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ---- Sticky category bar (scroll-spy) ---- */}
      <div ref={stickyBarRef} className="sticky top-0 z-20 bg-[var(--bg-surface)] border-b border-[var(--border-color)] shadow-[var(--elev-1)]">
        <div className="max-w-5xl mx-auto">
          {isSearching ? (
            <div className="px-4 py-2 min-h-[60px] flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[var(--text-secondary)]" role="status">{t('searchResults', searchResults.length)}</p>
              <Button variant="secondary" size="md" onClick={() => setSearchQuery('')}>{t('clearSearch')}</Button>
            </div>
          ) : (
            <CategoryChips items={navItems} active={activeSection} onSelect={selectSection} ariaLabel={t('menuSections')} />
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto">
        {/* ---- Notices & promotions ---- */}
        {draftNotice && (
          <p role="status" className="mx-4 mt-3 rounded-[var(--radius)] bg-[var(--accent-soft)] px-4 py-2.5 text-sm font-medium text-[var(--accent-soft-fg)]">
            {t('draftRestored')}{draftNotice === 'dropped' ? ` · ${t('draftDropped')}` : ''}
          </p>
        )}
        <AnimatePresence>
          {/* Happy Hour (only when a cake is actually available) */}
          {happyHourActive && (
            <motion.div
              key="happy-hour"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mx-4 mt-3 rounded-[var(--radius)] px-4 py-3 bg-[var(--state-warn-soft)] border border-[var(--state-warn)] flex items-center gap-3"
            >
              <Cake size={24} className="shrink-0 text-[var(--state-warn)]" aria-hidden="true" />
              <div className="flex-1 leading-snug">
                <p className="text-[var(--text-primary)] font-bold text-sm">{t('happyHourBanner', happyHourPercent, happyHourLeftText)}</p>
                <p className="text-[var(--text-secondary)] text-xs">{t('happyHourUntil', settingsData.cakeSaleEnd)}</p>
              </div>
            </motion.div>
          )}
          {combo.enabled && combo.percent > 0 && (combo.hasCake !== combo.hasDrink) && !happyHourActive && !(spendActive && spendReached) && (
            <motion.button
              key="combo-nudge"
              type="button"
              onClick={navigateCombo}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mx-4 mt-3 w-[calc(100%-2rem)] min-h-12 text-left bg-[var(--accent-soft)] rounded-[var(--radius)] px-4 py-3 flex items-center gap-2"
            >
              <span className="flex-1 text-[var(--accent-soft-fg)] font-semibold text-sm">
                {combo.hasCake ? t('comboNudgeCake', combo.percent) : t('comboNudgeDrink', combo.percent)}
              </span>
              <span aria-hidden="true" className="text-[var(--accent-soft-fg)] text-lg">›</span>
            </motion.button>
          )}
          {comboDiscount > 0 && (
            <motion.div
              key="combo-applied"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mx-4 mt-3 bg-[var(--accent)] rounded-[var(--radius)] px-4 py-3"
            >
              <span className="text-[var(--text-on-accent)] font-semibold text-sm">{t('comboApplied', combo.percent)}</span>
            </motion.div>
          )}
          {spendActive && comboDiscount === 0 && (
            <motion.div
              key="spend-progress"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`mx-4 mt-3 rounded-[var(--radius)] px-4 py-3 ${spendReached ? 'bg-[var(--accent-soft)]' : 'bg-[var(--state-warn-soft)]'}`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className={`font-bold text-sm ${spendReached ? 'text-[var(--accent-soft-fg)]' : 'text-[var(--text-primary)]'}`}>
                  {spendReached
                    ? (spendDiscount > 0
                        ? t('spendReachedWithDiscount', spendDiscountPercent)
                        : t('spendReachedNoDiscount', formatCurrency(spendThreshold)))
                    : subtotal === 0
                      ? t('spendStart', formatCurrency(spendThreshold), spendDiscountPercent)
                      : t('spendRemaining', formatCurrency(spendRemaining), spendDiscountPercent)}
                </span>
                <span className="text-xs font-semibold text-[var(--text-secondary)] shrink-0 num">
                  {formatCurrency(Math.min(subtotal, spendThreshold))}/{formatCurrency(spendThreshold)}
                </span>
              </div>
              <div className="h-2 bg-[var(--bg-surface)] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ${spendReached ? 'bg-[var(--accent)]' : 'bg-[var(--state-warn)]'}`}
                  style={{ width: `${Math.min(100, spendThreshold > 0 ? (subtotal / spendThreshold) * 100 : 0)}%` }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="pb-36">
          {isSearching ? (
            /* ---- Search results (whole menu) ---- */
            <section className="px-4 pt-4" aria-label={t('searchResults', searchResults.length)}>
              {searchResults.length === 0 ? (
                <EmptyState icon="search" title={t('noMenuFound')} description={t('noMenuFoundDesc', searchQuery.trim())} />
              ) : (
                <div className="grid gap-2.5 md:grid-cols-2">
                  {searchResults.map((item) => (
                    <MenuRow key={item.id} item={item} onAdd={handleMenuItemClick} onView={setDetailItem} settingsData={settingsData} isBestSeller={bestSellerIds.has(item.id)} t={t} lang={lang} />
                  ))}
                </div>
              )}
            </section>
          ) : (
            <>
              {/* ---- Featured: cake of the day, best sellers, shop picks ---- */}
              {hasHighlights && (
                <section id={sectionDomId('featured')} aria-labelledby="featured-heading" className="pt-5 space-y-5">
                  <h2 id="featured-heading" className="sr-only">{t('featuredChip')}</h2>
                  {/* The cake rail comes first: its first photos are the page's LCP image */}
                  <div id={sectionDomId('cake')}>
                    <FeaturedRail
                      title={t('cakeRailTitle')}
                      subtitle={t('cakeRailSubtitle')}
                      icon={Cake}
                      items={cakeItems}
                      onAdd={handleMenuItemClick}
                      onView={setDetailItem}
                      settingsData={settingsData}
                      bestSellerIds={bestSellerIds}
                      t={t}
                      lang={lang}
                      wide
                      priorityCount={2}
                    />
                  </div>
                  <FeaturedRail
                    title={t('bestSellerRailTitle')}
                    icon={Flame}
                    items={bestSellers}
                    onAdd={handleMenuItemClick}
                    onView={setDetailItem}
                    settingsData={settingsData}
                    bestSellerIds={bestSellerIds}
                    t={t}
                    lang={lang}
                  />
                  <FeaturedRail
                    title={t('featuredRailTitle')}
                    icon={Star}
                    items={featuredItems}
                    onAdd={handleMenuItemClick}
                    onView={setDetailItem}
                    settingsData={settingsData}
                    bestSellerIds={bestSellerIds}
                    t={t}
                    lang={lang}
                  />
                </section>
              )}

              {/* ---- One section per category ---- */}
              {menuSections.length === 0 && !hasHighlights ? (
                <div className="px-4 pt-8">
                  <EmptyState icon="default" title={t('noMenuYet')} description={t('noMenuYetDesc')} />
                </div>
              ) : menuSections.map((section) => (
                <section key={section.key} id={sectionDomId(section.key)} aria-labelledby={`${sectionDomId(section.key)}-h`} className="px-4 pt-7">
                  <h2 id={`${sectionDomId(section.key)}-h`} className="mb-3 flex items-baseline gap-2 text-[length:var(--fs-xl)] leading-[var(--lh-xl)] font-bold text-[var(--text-primary)]">
                    {sectionLabel(section.name)}
                    <span className="text-sm font-medium text-[var(--text-muted)] num">{section.items.length}</span>
                  </h2>
                  <div className="grid gap-2.5 md:grid-cols-2">
                    {section.items.map((item) => (
                      <MenuRow key={item.id} item={item} onAdd={handleMenuItemClick} onView={setDetailItem} settingsData={settingsData} isBestSeller={bestSellerIds.has(item.id)} t={t} lang={lang} />
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}
        </main>
      </div>

      {/* ---- Sticky cart bar ---- */}
      {itemCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] pointer-events-none">
          <button
            type="button"
            onClick={() => setCartDrawerOpen(true)}
            aria-label={`${t('cartButton', itemCount)} · ${formatCurrency(total)}`}
            className="pointer-events-auto w-full max-w-xl mx-auto min-h-14 flex items-center gap-3 px-4 rounded-[var(--radius)] bg-[var(--accent)] text-[var(--text-on-accent)] shadow-[var(--elev-3)] active:scale-[0.99] transition-transform"
          >
            <span className="relative shrink-0" aria-hidden="true">
              <ShoppingCart size={22} />
              <span className="absolute -top-2 -right-2.5 min-w-5 h-5 px-1 rounded-full bg-[var(--bg-surface)] text-[var(--accent-soft-fg)] text-xs font-bold flex items-center justify-center num">{itemCount}</span>
            </span>
            <span className="flex-1 text-left font-bold text-base pl-1">{t('viewCart')}</span>
            <span className="font-bold text-lg num">{formatCurrency(total)}</span>
          </button>
        </div>
      )}

      {/* ---- Cart ---- */}
      <CartSheet
        crossSell={crossSell}
        comboPercent={combo.percent}
        onAdd={(item) => {
          handleMenuItemClick(item);
          setSuggestedLine(crossSell.find((candidate) => candidate.item.id === item.id)?.line || null);
        }}
        onEditOptions={(line) => {
          const item = availableMenu.find((candidate) => candidate.id === line.id);
          if (!item) return;
          setEditingLine(line);
          setPendingItem(item);
          setCartDrawerOpen(false);
          setBeanModalOpen(true);
        }}
        isOpen={cartDrawerOpen}
        cart={cart}
        total={total}
        onClose={() => setCartDrawerOpen(false)}
        onUpdateQty={updateQty}
        onRemove={removeItem}
        onUpdateNote={updateNote}
        onProceed={() => {
          setCartDrawerOpen(false);
          menuScrollRef.current = window.scrollY;
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

      {/* ---- Menu detail: whole photo / story poster + description ---- */}
      <ItemDetailSheet
        item={detailItem}
        settingsData={settingsData}
        isBestSeller={detailItem ? bestSellerIds.has(detailItem.id) : false}
        onAdd={handleDetailAdd}
        onClose={() => setDetailItem(null)}
        t={t}
        lang={lang}
      />

      {/* ---- Options (bean / sweetness / milk) ---- */}
      <OptionSheet
        preset={editingLine || suggestedLine}
        editing={!!editingLine}
        isOpen={beanModalOpen}
        item={pendingItem}
        modifiers={beanModifiers.filter((b) => b.available !== false && getModifierGroups(pendingItem).includes(b.group || 'เมล็ดกาแฟ'))}
        settingsData={settingsData}
        onSelect={handleBeanSelect}
        onClose={() => {
          if (editingLine) setCartDrawerOpen(true);
          setEditingLine(null);
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
