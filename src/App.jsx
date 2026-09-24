import React, { useState, useCallback, useMemo, useEffect, lazy, Suspense } from 'react';
import { Lock, Trash2, Coffee } from 'lucide-react';

// UI Components
import { Modal, Button, Spinner, Input, ErrorBoundary, Banner, useToast, useMediaQuery } from './components/ui';

// Navigation (hash router + shell) · UX v2 spec §5
import {
  useHashRoute, RouteProvider, AppSidebar, MobileTabBar, NavMenuSheet,
  isProtectedView, gateRoute, AUTO_COLLAPSE_VIEWS, NAV_ITEMS,
} from './navigation';

// Firebase Imports
import {
  doc, updateDoc, writeBatch, increment
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db, appId } from './services/firebase';
import useStaffAuth from './hooks/useStaffAuth';
import usePosData from './hooks/usePosData';
import StaffLogin from './components/StaffLogin';

// AI Service (Rate-Limited, Cached, with History)
import {
  callGeminiAPISecure,
  buildHistoricalContext,
  getChatHistory,
  addToChatHistory,
  clearChatHistory,
  exportChatHistory,
  getApiStats,
  clearCache as clearAICache
} from './services/aiService';

// Context Provider
import { AppProvider } from './context/AppContext';

// Hooks & Services
import useKeyboardShortcuts, { KeyboardShortcutsHelp } from './hooks/useKeyboardShortcuts.jsx';
import NewOrderAlert from './components/NewOrderAlert';
import useNewQrOrderAlert from './hooks/useNewQrOrderAlert';
import useDarkMode from './hooks/useDarkMode';
import { getISODate, getOrderDate } from './utils/calculations';
import { planOrderDeduction, auditMenuLinks } from './utils/stockAudit';
import { activeStock } from './utils/stockMerge';
import { resolveMilkSwap } from './utils/milkSwap';
import { runDeleteOrderTransaction } from './utils/pointsActions';

// View Components (Lazy Loaded for Performance)
const PosView = lazy(() => import('./components/views/PosView'));
const MerchantView = lazy(() => import('./components/views/MerchantView'));
const BillsView = lazy(() => import('./components/views/BillsView'));
const DashboardView = lazy(() => import('./components/views/DashboardView'));
const CategorySummaryView = lazy(() => import('./components/views/CategorySummaryView'));
const StockView = lazy(() => import('./components/views/StockView'));
const ProfitabilityView = lazy(() => import('./components/views/ProfitabilityView'));
const ExpensesView = lazy(() => import('./components/views/ExpensesView'));
const MenuManageView = lazy(() => import('./components/views/MenuManageView'));
const RecipesView = lazy(() => import('./components/views/RecipesView'));
const MembersView = lazy(() => import('./components/views/MembersView'));
const AdminView = lazy(() => import('./components/views/AdminView'));
const FinancialView = lazy(() => import('./components/views/FinancialView'));
const SalesHistoryView = lazy(() => import('./components/views/SalesHistoryView'));
const CakeQueueView = lazy(() => import('./components/views/CakeQueueView'));
const StockAuditView = lazy(() => import('./components/views/StockAuditView'));
const ProductionView = lazy(() => import('./components/views/ProductionView'));
// Dev-only component gallery at #/__ui (dead-code-eliminated from production builds).
const UiGallery = import.meta.env.DEV ? lazy(() => import('./navigation/UiGallery')) : null;

const SIDEBAR_COLLAPSED_KEY = 'pos_sidebar_collapsed';
const readSidebarCollapsed = () => {
  try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'; } catch { return false; }
};

// One-way token derived from the PIN. Stored on a "remembered" device so the app
// stays unlocked across restarts — and so that changing the PIN later
// automatically re-locks every remembered device (the token no longer matches).
//
// Uses PBKDF2 (Web Crypto) with a random per-device salt so the stored token
// cannot be reversed to recover the PIN, even though the PIN itself is
// low-entropy. The salt lives next to the token; PBKDF2's work factor is what
// makes offline brute force of the PIN impractical.
const DEVICE_TOKEN_KEY = 'pos_device_token';
const DEVICE_SALT_KEY = 'pos_device_salt';
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));

// How long a Firestore write may go unacknowledged by the server before we tell
// staff the screen can't be trusted yet. Well above normal round-trip latency so
// a slow-but-healthy network never cries wolf.
const DB_WRITE_SLOW_MS = 10000;

const pinDeviceToken = async (pin) => {
  const enc = new TextEncoder();
  let salt = localStorage.getItem(DEVICE_SALT_KEY);
  if (!salt) {
    salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    localStorage.setItem(DEVICE_SALT_KEY, salt);
  }
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 200000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return b64(new Uint8Array(bits));
};

// --- Main App Component ---
export default function App() {
  // 1. Core States
  const { user, isAuthLoading } = useStaffAuth();
  // The URL hash is the source of truth for the current view (refresh / back work).
  const { view: routeViewRaw, params: routeParams, navigate } = useHashRoute();
  const routeView = routeViewRaw === '__ui' && !UiGallery ? 'pos' : routeViewRaw;
  const { isDark, toggle: toggleDarkMode } = useDarkMode();
  const toast = useToast();

  // Data States from hook
  const {
    isSyncing, settingsLoaded, syncError, orders, menu, stock, expenses, members, dynamicCategories, beanModifiers, quickExpenses, queueCounter, queueInfo, recipes,
    pinEnabled, vatEnabled, adminPin, redeemPointsThreshold, pointsExpiryMonths, redeemDiscountValue, pointsRewardsEnabled, pointsRewards, ownGlassDiscount, geminiApiKey, startingCash,
    reviewUrl, shopName, shopAddress, shopPhone, taxId, receiptFooter, receiptPaperWidth, cakeSaleEnabled, cakeSaleCategories, cakeSalePercent, cakeSaleStart, cakeSaleEnd,
    comboEnabled, comboPercent, spendThreshold, spendDiscount, milkSwapSetting
  } = usePosData(user, appId);
  // นมโอ๊ตตัดแทนนมวัว · ค่าที่ใช้จริง (ตั้งไว้ หรือค่าเริ่มต้นจากชื่อสต็อก)
  const milkSwap = useMemo(() => resolveMilkSwap(milkSwapSetting, stock), [milkSwapSetting, stock]);

  // App-level lock state — persisted in sessionStorage so a page refresh within the tab stays unlocked
  const [appUnlocked, setAppUnlocked] = useState(() => sessionStorage.getItem('pos_unlocked') === '1');
  const [lockPinInput, setLockPinInput] = useState('');
  const [lockPinError, setLockPinError] = useState('');
  const [rememberDevice, setRememberDevice] = useState(false);

  // Shared UI States
  const [errorMessage, setErrorMessage] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [targetView, setTargetView] = useState(null);
  const [targetParams, setTargetParams] = useState(null);
  const [activePromotion, setActivePromotion] = useState(null);
  const [orderToCancel, setOrderToCancel] = useState(null);
  const [editingOrderId, setEditingOrderId] = useState(null); // Global editing state
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(readSidebarCollapsed);
  const [showNavMenu, setShowNavMenu] = useState(false);
  const [adminTab, setAdminTab] = useState(null);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);

  // Constants
  const ADMIN_PIN = adminPin || '';

  // Whether this device was previously trusted ("จำอุปกรณ์นี้") for the CURRENT
  // PIN. Computed async (PBKDF2) once the PIN has loaded; recomputed on change so
  // changing the PIN re-locks the device automatically.
  const [deviceRemembered, setDeviceRemembered] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = localStorage.getItem(DEVICE_TOKEN_KEY);
      if (!ADMIN_PIN || !token) { if (!cancelled) setDeviceRemembered(false); return; }
      const expected = await pinDeviceToken(ADMIN_PIN);
      if (!cancelled) setDeviceRemembered(token === expected);
    })();
    return () => { cancelled = true; };
  }, [ADMIN_PIN]);

  // True when the app should show the lock screen instead of the main UI
  // (computed early so it can be referenced by useKeyboardShortcuts below)
  const needsLock = pinEnabled && ADMIN_PIN && !appUnlocked && !deviceRemembered;

  // ── Route → view, with the PIN gate ────────────────────────────────────
  // A protected view reached through the hash (deep link, back/forward, typed
  // URL) while the lock is active must pass the same PIN check as a nav tap.
  // `pinGrant` remembers the view the PIN was entered for; it is dropped once the
  // route has reached that view and then moves elsewhere (so coming back asks
  // again, exactly like the old per-tap prompt).
  const [pinGrant, setPinGrant] = useState(null); // { view, reached }
  if (pinGrant) {
    if (!pinGrant.reached && routeView === pinGrant.view) setPinGrant({ view: pinGrant.view, reached: true });
    else if (pinGrant.reached && routeView !== pinGrant.view) setPinGrant(null);
  }
  const { blocked: routeBlocked, held: routeHeld } = gateRoute({
    view: routeView, needsLock, settingsReady: settingsLoaded, grantedView: pinGrant?.view,
  });
  // Last view the user was allowed to see · rendered behind the PIN prompt and
  // restored if the prompt is cancelled.
  const [safeView, setSafeView] = useState(() => (isProtectedView(routeView) || routeView === '__ui' ? 'pos' : routeView));
  if (!routeBlocked && !routeHeld && routeView !== safeView && routeView !== '__ui') setSafeView(routeView);
  const view = routeBlocked || routeHeld ? safeView : routeView;
  const pinModalOpen = showPinModal || routeBlocked;

  // Get today's date for alerts
  const today = getISODate();
  const currentMonth = today.substring(0, 7);

  // `stock` keeps merged/archived docs (mergedInto) so old bills and deductions
  // can follow them · lists, pickers and low-stock counts use the active ones.
  const liveStock = useMemo(() => activeStock(stock), [stock]);

  // Smart Alerts Data
  const alertsData = useMemo(() => ({
    orders,
    expenses,
    stock,
    members,
    menu,
    beanModifiers,
    today,
    currentMonth,
    milkSwap,
  }), [orders, expenses, stock, members, menu, beanModifiers, today, currentMonth, milkSwap]);

  // Database action wrapper (memoized to prevent context changes every render)
  //
  // With the persistent offline cache, a Firestore write promise resolves only once
  // the SERVER acks it. When the device can't reach the server the promise neither
  // resolves nor rejects — it hangs indefinitely. This wrapper only reported errors
  // on `throw`, so a write that never landed produced no feedback whatsoever while
  // the UI had already moved on (latency compensation). Warn instead of failing
  // silently: the write stays queued and still lands on reconnect, so this must NOT
  // cancel anything — it only tells staff not to trust the screen yet.
  const runDbAction = useCallback(async (action, errorMsg = 'เกิดข้อผิดพลาด') => {
    const slowWarning = setTimeout(() => {
      setErrorMessage('ยังบันทึกไม่สำเร็จ กำลังลองใหม่ — อย่าเพิ่งปิดหน้านี้');
    }, DB_WRITE_SLOW_MS);
    try {
      await action();
      setErrorMessage('');
      return true;
    } catch (err) {
      console.error(err);
      setErrorMessage(errorMsg);
      return false;
    } finally {
      clearTimeout(slowWarning);
    }
  }, []);

  // Order status update (memoized)
  // setView keeps its old contract (plain switch, no PIN) but now writes the hash.
  const setView = useCallback((key, params) => navigate(key, params), [navigate]);

  const updateStatus = useCallback(async (id, newStatus) => {
    await runDbAction(async () => {
      const orderRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', id);

      // Deduct stock the first time an order is completed. Idempotent via the
      // stockDeducted flag (mirrors how loyalty points use pointsProcessed) so
      // reverting and re-completing an order never double-counts. Each line
      // item already carries its merged recipe (base menu + chosen bean
      // modifier) in stockLinks, captured at order time.
      const order = orders.find(o => o.id === id);
      if (newStatus === 'completed' && order && !order.stockDeducted) {
        // วางแผนตัดครั้งเดียวแล้วเก็บผลลงบิล (stockDeduction) · หน้า "สรุปการขาย & สต็อก"
        // ใช้เทียบย้อนหลังว่าตัดอะไรไปจริง ข้ามอะไรไป (สต็อกถูกลบ / เมนูไม่ผูก)
        const stockById = new Map(stock.map(s => [s.id, s]));
        const plan = planOrderDeduction(order, stockById, { milkSwap });

        const batch = writeBatch(db);
        Object.entries(plan.applied).forEach(([stockId, used]) => {
          // Atomic decrement so concurrent completions on two devices don't lose
          // each other's deduction (symmetric with the restore path on delete).
          batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'stock', stockId), { quantity: increment(-used) });
        });
        batch.update(orderRef, {
          status: newStatus,
          stockDeducted: true,
          stockDeduction: {
            at: new Date().toISOString(),
            by: auth.currentUser?.email || '',
            applied: plan.applied,
            skipped: plan.skipped,
            unlinked: plan.unlinked,
            milkSwapApplied: Boolean(milkSwap),
          },
        });
        await batch.commit();
        return;
      }

      await updateDoc(orderRef, { status: newStatus });
    }, 'อัปเดตสถานะไม่สำเร็จ');
  }, [runDbAction, orders, stock, milkSwap]);

  // Delete order
  const executeDeleteOrder = async () => {
    if (!orderToCancel) return;
    const order = orders.find(o => o.id === orderToCancel);
    let clawbackPoints = 0;

    await runDbAction(async () => {
      // Members registered before phone-as-id keep an older doc id — find it by phone.
      const memberDocId = order?.memberPhone
        ? (members.find(m => m.phone === order.memberPhone)?.id || order.memberPhone)
        : null;
      clawbackPoints = await runDeleteOrderTransaction(db, appId, order, stock, memberDocId, auth.currentUser?.email);
      setOrderToCancel(null);
    }, 'ลบออเดอร์ไม่สำเร็จ');

    if (clawbackPoints > 0) {
      toast.success(`ลบบิลแล้ว และหักแต้มคืน ${clawbackPoints} แต้ม`);
    }
  };

  // View change handler with PIN protection (memoized to prevent context changes every render)
  // Optional `params` (hash query) are new and backwards compatible.
  const handleViewChange = useCallback((newView, params) => {
    // If the whole app is already unlocked for this session, skip the per-view PIN prompt
    if (needsLock && isProtectedView(newView)) {
      setTargetView(newView);
      setTargetParams(params || null);
      setShowPinModal(true);
    } else {
      navigate(newView, params);
    }
  }, [needsLock, navigate]);

  // PIN-aware navigate for views: navigate(key, params?, { replace })
  const guardedNavigate = useCallback((key, params, opts) => {
    if (needsLock && isProtectedView(key) && key !== routeView) {
      handleViewChange(key, params);
      return;
    }
    navigate(key, params, opts);
  }, [needsLock, routeView, handleViewChange, navigate]);

  // Keyboard Shortcuts (include handleViewChange in deps to avoid stale closure)
  const keyboardHandlers = useMemo(() => ({
    navigate: (target) => {
      handleViewChange(target);
    },
    pos_action: (target) => {
      // Will be handled by PosView
      window.dispatchEvent(new CustomEvent('pos-shortcut', { detail: { action: target } }));
    },
    quick_add: (index) => {
      window.dispatchEvent(new CustomEvent('pos-shortcut', { detail: { action: 'quick_add', index } }));
    },
    focus: (target) => {
      if (target === 'search') {
        const searchInput = document.querySelector('[data-search-input]');
        if (searchInput) searchInput.focus();
      }
    },
    show_help: () => {
      setShowKeyboardHelp(prev => !prev);
    }
  }), [handleViewChange]);

  useKeyboardShortcuts(keyboardHandlers, {
    enabled: !pinModalOpen && !orderToCancel && !needsLock && !showNavMenu,
    currentView: view
  });

  // Get the active API key (prioritize stored key, fallback to env)
  const activeApiKey = useMemo(() => {
    // มี Worker proxy (key เก็บเป็น secret ฝั่ง server) = ใช้ AI ได้โดยไม่ต้องมี key ในเครื่อง
    return geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY || (import.meta.env.VITE_GEMINI_PROXY_URL ? 'server-proxy' : '');
  }, [geminiApiKey]);
  const aiReady = Boolean(activeApiKey);

  // 🔧 Enhanced Gemini API Caller with Rate Limiting, Caching, and History
  const callGeminiAPI = useCallback(async (prompt, parseAsJson = false, options = {}) => {
    const {
      useCache = true,
      skipRateLimit = false,
      saveToChatHistory = false,
      includeHistoricalContext = false,
      selectedMonth = null
    } = options;

    // Build historical context if requested
    let historyContext = null;
    if (includeHistoricalContext && selectedMonth) {
      historyContext = buildHistoricalContext(orders, expenses, selectedMonth);
    }

    const result = await callGeminiAPISecure(activeApiKey, prompt, {
      parseAsJson,
      useCache,
      skipRateLimit,
      saveToChatHistory,
      historyContext
    });

    // Show rate limit message to user
    if (result.rateLimited) {
      const rateLimitMsg = `กรุณารอ ${Math.ceil(result.waitTime / 1000)} วินาที`;
      setErrorMessage(rateLimitMsg);
      // Only auto-clear if the message is still this rate-limit message —
      // don't wipe a newer, unrelated error that appeared in the meantime.
      setTimeout(() => setErrorMessage(prev => (prev === rateLimitMsg ? '' : prev)), 2000);
    }

    return result;
  }, [activeApiKey, orders, expenses]);

  // AI Service utilities exposed to context
  const aiUtils = useMemo(() => ({
    getChatHistory,
    addToChatHistory,
    clearChatHistory,
    exportChatHistory,
    getApiStats,
    clearAICache,
    buildHistoricalContext: (month) => buildHistoricalContext(orders, expenses, month)
  }), [orders, expenses]);

  const checkPin = () => {
    if (pinInput === ADMIN_PIN) {
      // Hash-entered protected view (routeBlocked) or a nav tap (targetView).
      const target = routeBlocked ? routeView : targetView;
      if (target) {
        setPinGrant({ view: target, reached: routeView === target });
        if (routeView !== target) navigate(target, targetParams || undefined);
      }
      setShowPinModal(false);
      setPinInput('');
      setTargetView(null);
      setTargetParams(null);
    } else {
      setErrorMessage('รหัส PIN ไม่ถูกต้อง');
      setPinInput('');
    }
  };

  const cancelPin = () => {
    setShowPinModal(false);
    setPinInput('');
    setTargetView(null);
    setTargetParams(null);
    // Cancelled a deep link → back to where the user was, without a new history entry.
    if (routeBlocked) navigate(safeView, undefined, { replace: true });
  };

  // Handler for the full-app lock screen
  const handleLockSubmit = async () => {
    if (lockPinInput !== ADMIN_PIN) {
      setLockPinError('รหัสไม่ถูกต้อง');
      setLockPinInput('');
      return;
    }
    // "Remember this device": persist a PIN-derived token so future visits
    // skip the lock. Cleared automatically when the PIN changes.
    if (rememberDevice) {
      localStorage.setItem(DEVICE_TOKEN_KEY, await pinDeviceToken(ADMIN_PIN));
    } else {
      localStorage.removeItem(DEVICE_TOKEN_KEY);
    }
    setAppUnlocked(true);
    sessionStorage.setItem('pos_unlocked', '1');
    setLockPinInput('');
    setLockPinError('');
  };

  // Re-lock the app and forget this device (clears remembered + session unlock).
  const lockApp = useCallback(() => {
    localStorage.removeItem(DEVICE_TOKEN_KEY);
    localStorage.removeItem(DEVICE_SALT_KEY);
    sessionStorage.removeItem('pos_unlocked');
    setRememberDevice(false);
    setDeviceRemembered(false);
    setAppUnlocked(false);
    navigate('pos');
  }, [navigate]);

  // Split context into 3 parts for performance — consumers only re-render when their part changes
  const dataValue = useMemo(() => ({
    user, orders, menu, stock, activeStock: liveStock, expenses, members,
    dynamicCategories, beanModifiers, quickExpenses, queueCounter, queueInfo, recipes,
    isSyncing, alertsData,
  }), [user, orders, menu, stock, liveStock, expenses, members, dynamicCategories, beanModifiers,
    quickExpenses, queueCounter, queueInfo, recipes, isSyncing, alertsData]);

  const configValue = useMemo(() => ({
    pinEnabled, vatEnabled, adminPin,
    redeemPointsThreshold, pointsExpiryMonths, redeemDiscountValue, pointsRewardsEnabled, pointsRewards, ownGlassDiscount,
    geminiApiKey,
    aiReady,
    startingCash,
    reviewUrl,
    shopName, shopAddress, shopPhone, taxId, receiptFooter, receiptPaperWidth,
    cakeSaleEnabled, cakeSaleCategories, cakeSalePercent, cakeSaleStart, cakeSaleEnd,
    comboEnabled, comboPercent, spendThreshold, spendDiscount,
    milkSwap, milkSwapSetting,
  }), [pinEnabled, vatEnabled, adminPin, redeemPointsThreshold, pointsExpiryMonths,
    redeemDiscountValue, pointsRewardsEnabled, pointsRewards, ownGlassDiscount, geminiApiKey, aiReady, startingCash,
    reviewUrl, shopName, shopAddress, shopPhone, taxId, receiptFooter, receiptPaperWidth, cakeSaleEnabled, cakeSaleCategories, cakeSalePercent, cakeSaleStart, cakeSaleEnd,
    comboEnabled, comboPercent, spendThreshold, spendDiscount, milkSwap, milkSwapSetting]);

  // ── Shell state ─────────────────────────────────────────────────────────
  const isWide = useMediaQuery('(min-width: 1024px)');
  const isMdUp = useMediaQuery('(min-width: 768px)');
  const autoCollapse = AUTO_COLLAPSE_VIEWS.includes(view);
  const sidebarMode = isWide && !sidebarCollapsed && !autoCollapse ? 'expanded' : 'rail';
  const setSidebarCollapsed = useCallback((next) => {
    setSidebarCollapsedState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, value ? '1' : '0'); } catch { /* private mode */ }
      return value;
    });
  }, []);
  // Legacy UI-context pair. PosView reads `isNavExpanded` to lift its floating
  // cart above a bottom nav bar, so it now means "a bottom tab bar is on screen"
  // (phones). The setter maps onto the sidebar collapse preference.
  const isNavExpanded = !isMdUp;
  const setIsNavExpanded = useCallback((next) => {
    setSidebarCollapsed((prev) => !(typeof next === 'function' ? next(!prev) : next));
  }, [setSidebarCollapsed]);

  // QR order alert: one hook instance, banner + sound toggle live in different places.
  const qrAlert = useNewQrOrderAlert(orders);

  // ── Nav badges (read-only counts) ─────────────────────────────────────────
  const orderBadges = useMemo(() => {
    let merchant = 0;
    let bills = 0;
    for (const o of orders) {
      if (o.status === 'pending' || o.status === 'preparing') merchant += 1;
      if (!o.isPaid && o.status !== 'cancelled' && getOrderDate(o) === today) bills += 1;
    }
    return { merchant, bills };
  }, [orders, today]);
  const lowStockCount = useMemo(
    () => liveStock.filter((s) => (Number(s.quantity) || 0) <= (Number(s.minQuantity) || 5)).length,
    [liveStock],
  );
  const stockAuditIssues = useMemo(() => {
    const audit = auditMenuLinks({ menu, stock, beanModifiers });
    return audit.needsAttention + audit.modifiers.length;
  }, [menu, stock, beanModifiers]);
  const pendingPointsCount = useMemo(
    () => members.filter((m) => Number(m.pendingPoints) > 0).length,
    [members],
  );
  const badges = useMemo(() => ({
    merchant: orderBadges.merchant,
    bills: orderBadges.bills,
    stock: lowStockCount,
    stock_audit: stockAuditIssues,
    members_manage: pendingPointsCount,
  }), [orderBadges, lowStockCount, stockAuditIssues, pendingPointsCount]);
  const hiddenPhoneBadges = useMemo(
    () => NAV_ITEMS.some((i) => !i.phoneTab && i.badgeKey && badges[i.badgeKey] > 0),
    [badges],
  );

  // Browser tab title follows the view (useful with several iPad tabs open).
  useEffect(() => {
    const item = NAV_ITEMS.find((i) => i.key === view);
    document.title = item ? `${item.label} · Siwara POS` : 'Siwara POS';
  }, [view]);

  const handleLogout = useCallback(() => signOut(auth), []);
  const footerProps = useMemo(() => ({
    isDark,
    onToggleTheme: toggleDarkMode,
    soundOn: qrAlert.soundOn,
    onToggleSound: qrAlert.soundOn ? qrAlert.disableSound : qrAlert.enableSound,
    onLock: pinEnabled && ADMIN_PIN ? lockApp : undefined,
    onLogout: handleLogout,
    onShowShortcuts: () => setShowKeyboardHelp((prev) => !prev),
  }), [isDark, toggleDarkMode, qrAlert.soundOn, qrAlert.disableSound, qrAlert.enableSound, pinEnabled, ADMIN_PIN, lockApp, handleLogout]);

  const routeValue = useMemo(() => ({
    view,
    params: routeView === view ? routeParams : {},
    navigate: guardedNavigate,
  }), [view, routeView, routeParams, guardedNavigate]);

  const uiValue = useMemo(() => ({
    errorMessage, setErrorMessage,
    activePromotion, setActivePromotion,
    orderToCancel, setOrderToCancel,
    editingOrderId, setEditingOrderId,
    adminTab, setAdminTab,
    runDbAction, callGeminiAPI, handleViewChange,
    setView, updateStatus,
    aiUtils, showKeyboardHelp, setShowKeyboardHelp,
    isNavExpanded, setIsNavExpanded,
    isDark, toggleDarkMode,
    lockApp,
    // new in UX v2 (additive)
    currentView: view,
    navigate: guardedNavigate,
    routeParams: routeValue.params,
    sidebarCollapsed, setSidebarCollapsed,
  }), [errorMessage, activePromotion, orderToCancel, editingOrderId, adminTab,
    runDbAction, callGeminiAPI, handleViewChange, setView, updateStatus,
    aiUtils, showKeyboardHelp, isNavExpanded, setIsNavExpanded, isDark, toggleDarkMode, lockApp,
    view, guardedNavigate, routeValue.params, sidebarCollapsed, setSidebarCollapsed]);

  const lockBackdrop = 'fixed inset-0 z-[var(--z-overlay)] flex items-center justify-center overflow-y-auto bg-[var(--bg-canvas)] px-4 py-8';
  const lockCard = 'w-full max-w-sm flex flex-col items-center gap-6 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] px-6 sm:px-8 py-8 shadow-[var(--elev-2)]';

  return (
    <AppProvider dataValue={dataValue} configValue={configValue} uiValue={uiValue}>
      <RouteProvider value={routeValue}>
        <div
          data-app="root"
          className="w-full flex overflow-hidden bg-[var(--bg-canvas)]"
          style={{ height: 'calc(100dvh - env(safe-area-inset-top))' }}
        >
          {!isAuthLoading && !user && <StaffLogin />}

          {/* ── Loading / Auth State ── */}
          {(isAuthLoading || (user && isSyncing)) && (
            <div className={lockBackdrop} role="status" aria-live="polite">
              <div className="flex flex-col items-center gap-5 text-center">
                <div className="w-14 h-14 rounded-[var(--radius)] flex items-center justify-center bg-[var(--accent)] text-[var(--text-on-accent)]">
                  <Coffee size={28} strokeWidth={2} />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold leading-snug text-[var(--text-primary)]">Siwara POS</h1>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {isAuthLoading ? 'กำลังตรวจสอบสิทธิ์…' : 'กำลังเชื่อมต่อ…'}
                  </p>
                </div>
                <Spinner size="md" />
              </div>
            </div>
          )}

          {/* ── Full-App Lock Screen ── */}
          {/* Shown only after data has loaded (user && !isSyncing) AND the PIN gate is active */}
          {user && !isSyncing && needsLock && (
            <div className={lockBackdrop}>
              <div className={lockCard}>
                <div className="w-14 h-14 rounded-[var(--radius)] flex items-center justify-center bg-[var(--accent-soft)] text-[var(--accent-soft-fg)]">
                  <Lock size={26} strokeWidth={2.2} />
                </div>
                <div className="text-center -mt-1">
                  <h1 className="text-xl font-semibold leading-snug text-[var(--text-primary)]">
                    ใส่ PIN เจ้าของร้าน
                  </h1>
                  <p className="text-sm text-[var(--text-muted)] mt-1">เพื่อเข้าใช้งาน Siwara POS</p>
                </div>

                {/* PIN input */}
                <div className="w-full">
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    autoFocus
                    aria-label="PIN เจ้าของร้าน"
                    value={lockPinInput}
                    onChange={(e) => { setLockPinInput(e.target.value); setLockPinError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleLockSubmit()}
                    size="lg"
                    inputClassName="num text-3xl font-semibold tracking-[0.5em] text-center text-[var(--text-primary)]"
                    placeholder="••••"
                  />
                  {lockPinError && (
                    <p role="alert" className="mt-2 text-center text-sm font-semibold text-[var(--state-danger)]">
                      {lockPinError}
                    </p>
                  )}
                </div>

                {/* Remember this device */}
                <label className="flex items-center gap-3 w-full min-h-11 px-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberDevice}
                    onChange={(e) => setRememberDevice(e.target.checked)}
                    className="w-5 h-5 rounded-md accent-[var(--accent)] cursor-pointer"
                  />
                  <span className="text-sm font-medium text-[var(--text-secondary)]">
                    จำอุปกรณ์นี้ (ไม่ต้องใส่ PIN อีก)
                  </span>
                </label>

                <Button variant="primary" size="lg" className="w-full" onClick={handleLockSubmit}>
                  ปลดล็อก
                </Button>
              </div>
            </div>
          )}

          {/* ── Sidebar / rail (≥768px) ── */}
          <AppSidebar
            view={view}
            mode={sidebarMode}
            badges={badges}
            onNavigate={handleViewChange}
            canToggle={isWide && !autoCollapse}
            onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
            shopName={shopName || 'Siwara POS'}
            footerProps={footerProps}
          />

          <div className="flex-1 min-w-0 h-full flex flex-col">
            {/* Top slot: sync / write errors as Banners (never over the page header) */}
            {(syncError || errorMessage) && (
              <div className="shrink-0 flex flex-col gap-2 px-[var(--page-pad)] pt-3 pb-1">
                {syncError && <Banner tone="warn" title={syncError} />}
                {errorMessage && (
                  <Banner tone="danger" title={errorMessage} onDismiss={() => setErrorMessage('')} />
                )}
              </div>
            )}

            {/* View Router - Lazy Loaded with Suspense + Error Boundary */}
            <main id="main" className="relative flex-1 min-h-0 overflow-y-auto pb-tabbar">
              <ErrorBoundary resetKey={view}>
                {routeHeld ? (
                  <div className="h-full flex flex-col items-center justify-center gap-3" role="status" aria-live="polite">
                    <Spinner size="lg" />
                    <p className="text-[var(--text-muted)] font-medium text-sm">กำลังตรวจสอบสิทธิ์…</p>
                  </div>
                ) : (
                <Suspense fallback={
                  <div className="h-full flex flex-col items-center justify-center gap-3">
                    <Spinner size="lg" />
                    <p className="text-[var(--text-muted)] font-medium text-sm">กำลังโหลด…</p>
                  </div>
                }>
                  {view === 'pos' && <PosView />}
                  {view === 'merchant' && <MerchantView />}
                  {view === 'bills' && <BillsView />}
                  {view === 'dashboard' && <DashboardView onNavigate={handleViewChange} />}
                  {view === 'category_summary' && <CategorySummaryView />}
                  {view === 'stock' && <StockView />}
                  {view === 'profitability' && <ProfitabilityView />}
                  {view === 'expenses' && <ExpensesView />}
                  {view === 'menu_manage' && <MenuManageView />}
                  {view === 'recipes' && <RecipesView />}
                  {view === 'members_manage' && <MembersView />}
                  {view === 'admin' && <AdminView />}
                  {view === 'financial' && <FinancialView />}
                  {view === 'sales_history' && <SalesHistoryView />}
                  {view === 'cake_queue' && <CakeQueueView />}
                  {view === 'stock_audit' && <StockAuditView />}
                  {view === 'production' && <ProductionView />}
                  {view === '__ui' && UiGallery && <UiGallery />}
                </Suspense>
                )}
              </ErrorBoundary>
            </main>
          </div>

          {/* ── Phone tab bar + "เมนู" sheet (<768px) ── */}
          <MobileTabBar
            view={view}
            badges={badges}
            onNavigate={handleViewChange}
            onOpenMenu={() => setShowNavMenu(true)}
            menuOpen={showNavMenu}
            menuDot={hiddenPhoneBadges || !qrAlert.soundOn}
          />
          <NavMenuSheet
            open={showNavMenu && !isMdUp}
            onClose={() => setShowNavMenu(false)}
            view={view}
            badges={badges}
            onNavigate={handleViewChange}
            footerProps={footerProps}
          />

          {/* แจ้งเตือนออเดอร์ QR ในเครื่อง · ไม่กินโควตาข้อความของ LINE (ดู line/README.md) */}
          <NewOrderAlert alerts={qrAlert.alerts} dismiss={qrAlert.dismiss} dismissAll={qrAlert.dismissAll} />

          {/* PIN Modal */}
          <Modal
            isOpen={pinModalOpen}
            onClose={cancelPin}
            size="sm"
            showClose={false}
            closeOnBackdrop={false}
          >
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-[var(--radius)] mx-auto flex items-center justify-center bg-[var(--accent-soft)] text-[var(--accent-soft-fg)] mb-5">
                <Lock size={30} />
              </div>
              <h3 className="font-semibold text-2xl leading-snug mb-1 text-[var(--text-primary)]">ใส่ PIN เจ้าของร้าน</h3>
              <p className="text-sm text-[var(--text-muted)] mb-6">หน้านี้สำหรับเจ้าของร้าน</p>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                aria-label="PIN เจ้าของร้าน"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && checkPin()}
                size="lg"
                inputClassName="num text-3xl font-semibold tracking-[0.5em] text-center text-[var(--text-primary)] mb-6"
                placeholder="••••"
              />
              <div className="grid grid-cols-2 gap-3 mt-6">
                <Button variant="secondary" size="lg" onClick={cancelPin}>
                  ยกเลิก
                </Button>
                <Button variant="primary" size="lg" onClick={checkPin}>
                  ปลดล็อก
                </Button>
              </div>
            </div>
          </Modal>

          {/* Order Cancel Modal */}
          <Modal
            isOpen={!!orderToCancel}
            onClose={() => setOrderToCancel(null)}
            size="sm"
            showClose={false}
          >
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-[var(--radius)] mx-auto flex items-center justify-center bg-[var(--state-danger-soft)] text-[var(--state-danger)] mb-5">
                <Trash2 size={30} />
              </div>
              <h3 className="font-semibold text-2xl leading-snug mb-2 text-[var(--text-primary)]">ต้องการลบบิลนี้?</h3>
              <p className="text-[var(--text-secondary)] mb-8 text-sm px-4 leading-relaxed">
                ข้อมูลบิลนี้จะถูกลบออกจากระบบอย่างถาวรและไม่สามารถเรียกคืนได้
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="secondary" size="lg" onClick={() => setOrderToCancel(null)}>
                  ยกเลิก
                </Button>
                <Button variant="danger" size="lg" onClick={executeDeleteOrder}>
                  ยืนยันการลบ
                </Button>
              </div>
            </div>
          </Modal>

          {/* Keyboard Shortcuts Help Modal */}
          <KeyboardShortcutsHelp isOpen={showKeyboardHelp} onClose={() => setShowKeyboardHelp(false)} />
        </div>
      </RouteProvider>
    </AppProvider>
  );
}
