import React, { useState, useCallback, useMemo, useRef, useEffect, lazy, Suspense } from 'react';
import {
  User, ChefHat, FileText, Package, DollarSign, ClipboardList, Users,
  PieChart, LayoutDashboard, Lock, Trash2, Moon, Sun, MoreHorizontal,
  Coffee, Sparkles
} from 'lucide-react';

// UI Components
import { Modal, Button, Spinner, IconButton, Input, ErrorBoundary } from './components/ui';

// Firebase Imports
import {
  doc, updateDoc, deleteDoc
} from 'firebase/firestore';
import { db, appId } from './services/firebase';
import useAuth from './hooks/useAuth';
import usePosData from './hooks/usePosData';

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
import useDarkMode from './hooks/useDarkMode';
import { getISODate } from './utils/calculations';

// View Components (Lazy Loaded for Performance)
const PosView = lazy(() => import('./components/views/PosView'));
const MerchantView = lazy(() => import('./components/views/MerchantView'));
const BillsView = lazy(() => import('./components/views/BillsView'));
const DashboardView = lazy(() => import('./components/views/DashboardView'));
const CategorySummaryView = lazy(() => import('./components/views/CategorySummaryView'));
const StockView = lazy(() => import('./components/views/StockView'));
const ExpensesView = lazy(() => import('./components/views/ExpensesView'));
const MenuManageView = lazy(() => import('./components/views/MenuManageView'));
const MembersView = lazy(() => import('./components/views/MembersView'));
const AdminView = lazy(() => import('./components/views/AdminView'));
const FinancialView = lazy(() => import('./components/views/FinancialView'));

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
  const user = useAuth();
  const [view, setView] = useState('pos');
  const { isDark, toggle: toggleDarkMode } = useDarkMode();

  // Data States from hook
  const {
    isSyncing, syncError, orders, menu, stock, expenses, members, dynamicCategories, beanModifiers, quickExpenses, queueCounter,
    pinEnabled, vatEnabled, adminPin, redeemPointsThreshold, redeemDiscountValue, ownGlassDiscount, geminiApiKey, startingCash,
    reviewUrl, cakeSaleEnabled, cakeSaleCategories, cakeSalePercent, cakeSaleStart, cakeSaleEnd,
    comboEnabled, comboPercent, spendThreshold, spendDiscount
  } = usePosData(user, appId);

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
  const [activePromotion, setActivePromotion] = useState(null);
  const [orderToCancel, setOrderToCancel] = useState(null);
  const [editingOrderId, setEditingOrderId] = useState(null); // Global editing state
  const [isNavExpanded, setIsNavExpanded] = useState(true);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
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

  // Get today's date for alerts
  const today = getISODate();
  const currentMonth = today.substring(0, 7);

  // Smart Alerts Data
  const alertsData = useMemo(() => ({
    orders,
    expenses,
    stock,
    members,
    today,
    currentMonth
  }), [orders, expenses, stock, members, today, currentMonth]);

  // Database action wrapper (memoized to prevent context changes every render)
  const runDbAction = useCallback(async (action, errorMsg = 'เกิดข้อผิดพลาด') => {
    try {
      await action();
      setErrorMessage('');
    } catch (err) {
      console.error(err);
      setErrorMessage(errorMsg);
    }
  }, []);

  // Order status update (memoized)
  const updateStatus = useCallback(async (id, newStatus) => {
    await runDbAction(async () => {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', id), { status: newStatus });
    }, 'อัปเดตสถานะไม่สำเร็จ');
  }, [runDbAction]);

  // Delete order
  const executeDeleteOrder = async () => {
    if (!orderToCancel) return;
    await runDbAction(async () => {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', orderToCancel));
      setOrderToCancel(null);
    }, 'ลบออเดอร์ไม่สำเร็จ');
  };

  // View change handler with PIN protection (memoized to prevent context changes every render)
  const protectedViews = useRef(['admin', 'menu_manage']).current;

  const handleViewChange = useCallback((newView) => {
    // If the whole app is already unlocked for this session, skip the per-view PIN prompt
    if (pinEnabled && ADMIN_PIN && !appUnlocked && !deviceRemembered && protectedViews.includes(newView)) {
      setTargetView(newView);
      setShowPinModal(true);
    } else {
      setView(newView);
    }
  }, [pinEnabled, ADMIN_PIN, appUnlocked, deviceRemembered, protectedViews]);

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
    enabled: !showPinModal && !orderToCancel && !needsLock,
    currentView: view
  });

  // Get the active API key (prioritize stored key, fallback to env)
  const activeApiKey = useMemo(() => {
    return geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY || '';
  }, [geminiApiKey]);

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
      setErrorMessage(`กรุณารอ ${Math.ceil(result.waitTime / 1000)} วินาที`);
      setTimeout(() => setErrorMessage(''), 2000);
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
      setView(targetView);
      setShowPinModal(false);
      setPinInput('');
      setTargetView(null);
    } else {
      setErrorMessage('รหัส PIN ไม่ถูกต้อง');
      setPinInput('');
    }
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
    setView('pos');
  }, []);

  // Split context into 3 parts for performance — consumers only re-render when their part changes
  const dataValue = useMemo(() => ({
    user, orders, menu, stock, expenses, members,
    dynamicCategories, beanModifiers, quickExpenses, queueCounter,
    isSyncing, alertsData,
  }), [user, orders, menu, stock, expenses, members, dynamicCategories, beanModifiers,
    quickExpenses, queueCounter, isSyncing, alertsData]);

  const configValue = useMemo(() => ({
    pinEnabled, vatEnabled, adminPin,
    redeemPointsThreshold, redeemDiscountValue, ownGlassDiscount,
    geminiApiKey, startingCash,
    reviewUrl, cakeSaleEnabled, cakeSaleCategories, cakeSalePercent, cakeSaleStart, cakeSaleEnd,
    comboEnabled, comboPercent, spendThreshold, spendDiscount,
  }), [pinEnabled, vatEnabled, adminPin, redeemPointsThreshold,
    redeemDiscountValue, ownGlassDiscount, geminiApiKey, startingCash,
    reviewUrl, cakeSaleEnabled, cakeSaleCategories, cakeSalePercent, cakeSaleStart, cakeSaleEnd,
    comboEnabled, comboPercent, spendThreshold, spendDiscount]);

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
  }), [errorMessage, activePromotion, orderToCancel, editingOrderId, adminTab,
    runDbAction, callGeminiAPI, handleViewChange, updateStatus,
    aiUtils, showKeyboardHelp, isNavExpanded, isDark, toggleDarkMode, lockApp]);

  return (
    <AppProvider dataValue={dataValue} configValue={configValue} uiValue={uiValue}>
      <div data-app="root" className="h-screen w-screen overflow-hidden pb-16 md:pb-20">
        {/* ── Loading / Auth State ── */}
        {(!user || isSyncing) && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center overflow-hidden">
            {/* Gradient backdrop */}
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-sky-50 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950" />

            {/* Animated ambient blobs */}
            <div className="absolute top-1/4 left-1/3 w-80 h-80 rounded-full blur-3xl animate-blob opacity-60
              bg-emerald-200/50 dark:bg-emerald-500/10" />
            <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full blur-3xl animate-blob-delay opacity-50
              bg-teal-200/50 dark:bg-teal-500/10" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-3xl opacity-30
              bg-sky-100/60 dark:bg-sky-900/20" />

            {/* Glass card */}
            <div className="relative z-10 flex flex-col items-center gap-6 px-12 py-10 rounded-3xl
              bg-white/70 border border-white/85 shadow-[0_20px_80px_rgba(0,0,0,0.10),0_4px_16px_rgba(0,0,0,0.06)]
              dark:bg-slate-900/70 dark:border-slate-700/50 dark:shadow-[0_20px_80px_rgba(0,0,0,0.45)]
              backdrop-blur-2xl">

              {/* Logo mark */}
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center
                bg-gradient-to-br from-emerald-400 to-emerald-600
                shadow-[0_8px_24px_rgba(16,185,129,0.40)]">
                <Coffee size={30} className="text-white" strokeWidth={2} />
              </div>

              {/* Brand name */}
              <div className="text-center -mt-1">
                <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white leading-none">
                  SIWARA
                </h1>
                <p className="text-[11px] font-semibold tracking-[0.22em] text-emerald-500 uppercase mt-1.5">
                  Point of Sale
                </p>
              </div>

              {/* Spinner + status */}
              <div className="flex flex-col items-center gap-2.5">
                <Spinner size="md" />
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
                  {!user ? 'กำลังเข้าสู่ระบบ…' : 'กำลังโหลดข้อมูล…'}
                </p>
              </div>

              {/* Bottom tag */}
              <div className="flex items-center gap-1.5 -mt-1">
                <Sparkles size={10} className="text-emerald-400" />
                <span className="text-[10px] font-semibold tracking-widest text-slate-300 dark:text-slate-600 uppercase">
                  Connecting to Cloud
                </span>
                <Sparkles size={10} className="text-emerald-400" />
              </div>
            </div>
          </div>
        )}

        {/* ── Full-App Lock Screen ── */}
        {/* Shown only after data has loaded (user && !isSyncing) AND the PIN gate is active */}
        {user && !isSyncing && needsLock && (
          <div className="fixed inset-0 z-[490] flex items-center justify-center overflow-hidden">
            {/* Gradient backdrop */}
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-sky-50 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950" />

            {/* Ambient blobs */}
            <div className="absolute top-1/4 left-1/3 w-80 h-80 rounded-full blur-3xl animate-blob opacity-60
              bg-emerald-200/50 dark:bg-emerald-500/10" />
            <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full blur-3xl animate-blob-delay opacity-50
              bg-teal-200/50 dark:bg-teal-500/10" />

            {/* Glass card */}
            <div className="relative z-10 flex flex-col items-center gap-6 px-10 py-10 w-full max-w-sm rounded-3xl
              bg-white/70 border border-white/85 shadow-[0_20px_80px_rgba(0,0,0,0.10),0_4px_16px_rgba(0,0,0,0.06)]
              dark:bg-slate-900/70 dark:border-slate-700/50 dark:shadow-[0_20px_80px_rgba(0,0,0,0.45)]
              backdrop-blur-2xl">

              {/* Logo mark */}
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center
                bg-gradient-to-br from-emerald-400 to-emerald-600
                shadow-[0_8px_24px_rgba(16,185,129,0.40)]">
                <Lock size={28} className="text-white" strokeWidth={2.5} />
              </div>

              {/* Title */}
              <div className="text-center -mt-1">
                <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white leading-snug">
                  🔒 ใส่รหัสเข้าใช้งานระบบ
                </h1>
                <p className="text-xs font-semibold tracking-wider text-emerald-500 uppercase mt-1.5">
                  SIWARA POS
                </p>
              </div>

              {/* PIN input */}
              <div className="w-full">
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  value={lockPinInput}
                  onChange={(e) => { setLockPinInput(e.target.value); setLockPinError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleLockSubmit()}
                  size="lg"
                  inputClassName="text-4xl font-black tracking-[1em] text-center text-emerald-600 dark:text-emerald-400"
                  placeholder="••••••"
                />
                {lockPinError && (
                  <p className="mt-2 text-center text-sm font-semibold text-red-500">
                    {lockPinError}
                  </p>
                )}
              </div>

              {/* Remember this device */}
              <label className="flex items-center gap-3 w-full px-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  className="w-5 h-5 rounded-md accent-emerald-500 cursor-pointer"
                />
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  จำอุปกรณ์นี้ (ไม่ต้องใส่ PIN อีก)
                </span>
              </label>

              {/* Submit button */}
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={handleLockSubmit}
              >
                เข้าสู่ระบบ
              </Button>
            </div>
          </div>
        )}

        {/* Sync Error Display */}
        {syncError && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[400] bg-orange-500 text-white px-8 py-4 rounded-2xl shadow-2xl font-black text-sm transition-all duration-300">
            {syncError}
          </div>
        )}

        {/* Error Message Display */}
        {errorMessage && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[400] bg-red-500 text-white px-8 py-4 rounded-2xl shadow-2xl font-black text-sm transition-all duration-300">
            {errorMessage}
            <button onClick={() => setErrorMessage('')} aria-label="ปิดข้อความ" className="ml-4 opacity-70 hover:opacity-100">✕</button>
          </div>
        )}

        {/* View Router - Lazy Loaded with Suspense + Error Boundary */}
        <ErrorBoundary>
          <Suspense fallback={
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <Spinner size="lg" />
              <p className="text-[var(--text-muted)] font-medium text-sm tracking-wider">กำลังโหลด…</p>
            </div>
          }>
            {view === 'pos' && <PosView />}
            {view === 'merchant' && <MerchantView />}
            {view === 'bills' && <BillsView />}
            {view === 'dashboard' && <DashboardView onNavigate={handleViewChange} />}
            {view === 'category_summary' && <CategorySummaryView />}
            {view === 'stock' && <StockView />}
            {view === 'expenses' && <ExpensesView />}
            {view === 'menu_manage' && <MenuManageView />}
            {view === 'members_manage' && <MembersView />}
            {view === 'admin' && <AdminView />}
            {view === 'financial' && <FinancialView />}
          </Suspense>
        </ErrorBoundary>

        {/* PIN Modal */}
        <Modal
          isOpen={showPinModal}
          onClose={() => { setShowPinModal(false); setPinInput(''); }}
          size="sm"
          showClose={false}
          closeOnBackdrop={false}
        >
          <div className="text-center py-4">
            <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-900/30 rounded-full mx-auto flex items-center justify-center text-emerald-500 mb-6 shadow-inner">
              <Lock size={40} />
            </div>
            <h3 className="font-black text-2xl mb-2 uppercase tracking-tight">Protected Access</h3>
            <p className="text-sm text-gray-400 font-bold mb-8 uppercase tracking-wider">ระบุรหัส PIN เพื่อดำเนินการต่อ</p>
            <Input
              type="password"
              maxLength={4}
              autoFocus
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && checkPin()}
              size="lg"
              inputClassName="text-4xl font-black tracking-[1em] text-center text-emerald-600 dark:text-emerald-400 mb-8"
              placeholder="••••"
            />
            <div className="grid grid-cols-2 gap-4">
              <Button variant="secondary" size="lg" onClick={() => { setShowPinModal(false); setPinInput(''); }}>
                ยกเลิก
              </Button>
              <Button variant="primary" size="lg" onClick={checkPin}>
                ปลดล็อค
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
            <div className="w-24 h-24 bg-red-50 dark:bg-red-900/30 rounded-full mx-auto flex items-center justify-center text-red-500 mb-6 shadow-inner">
              <Trash2 size={48} />
            </div>
            <h3 className="font-black text-2xl mb-3 tracking-tight uppercase">ต้องการลบบิลนี้?</h3>
            <p className="text-gray-400 font-medium mb-8 text-sm px-4">
              ข้อมูลบิลนี้จะถูกลบออกจากระบบอย่างถาวรและไม่สามารถเรียกคืนได้
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Button variant="secondary" size="lg" onClick={() => setOrderToCancel(null)}>
                ยกเลิก
              </Button>
              <Button variant="danger" size="lg" onClick={executeDeleteOrder}>
                ยืนยันการลบ
              </Button>
            </div>
          </div>
        </Modal>

        {/* ── Navigation Bar — Glass Morphism ── */}
        <div
          data-app="nav"
          className="fixed bottom-3 md:bottom-5 left-1/2 -translate-x-1/2 z-[150] transition-all duration-500"
        >
          <div className="glass-nav flex items-center p-1.5 rounded-[2.2rem] gap-1">

            {/* Primary Nav Items */}
            {[
              { key: 'pos',       icon: User,      label: 'POS'   },
              { key: 'merchant',  icon: ChefHat,   label: 'ครัว'  },
              { key: 'bills',     icon: FileText,  label: 'บิล'   },
              { key: 'stock',     icon: Package,   label: 'สต็อก' },
              { key: 'dashboard', icon: PieChart,  label: 'สรุป'  },
            ].map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => handleViewChange(key)}
                className={[
                  'relative flex items-center gap-1.5 px-3 md:px-4 lg:px-5 py-2.5 md:py-3',
                  'rounded-[1.6rem] text-[11px] md:text-xs font-semibold leading-none shrink-0',
                  'transition-all duration-300',
                  view === key
                    ? 'bg-emerald-500 text-white shadow-[0_4px_18px_rgba(16,185,129,0.42)]'
                    : 'text-slate-400 dark:text-slate-500 hover:text-emerald-500 hover:bg-black/5 dark:hover:bg-white/5 active:scale-95',
                ].join(' ')}
              >
                <Icon
                  size={15}
                  strokeWidth={view === key ? 2.5 : 1.8}
                  className="md:w-[17px] md:h-[17px]"
                />
                <span className="tracking-wide font-bold leading-none">{label}</span>
              </button>
            ))}

            {/* Divider */}
            <div className="w-px h-5 mx-0.5 rounded-full bg-slate-200/70 dark:bg-slate-700/60 shrink-0" />

            {/* More Menu */}
            <div className="relative">
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className={[
                  'flex items-center gap-1.5 px-3 md:px-4 lg:px-5 py-2.5 md:py-3',
                  'rounded-[1.6rem] text-[11px] md:text-xs font-bold leading-none shrink-0',
                  'transition-all duration-300',
                  ['expenses', 'menu_manage', 'members_manage', 'financial', 'admin', 'category_summary'].includes(view)
                    ? 'bg-emerald-500 text-white shadow-[0_4px_18px_rgba(16,185,129,0.42)]'
                    : 'text-slate-400 dark:text-slate-500 hover:text-emerald-500 hover:bg-black/5 dark:hover:bg-white/5 active:scale-95',
                ].join(' ')}
              >
                <MoreHorizontal size={15} strokeWidth={1.8} className="md:w-[17px] md:h-[17px]" />
                <span className="tracking-wide font-bold leading-none">เพิ่มเติม</span>
              </button>

              {/* Popup */}
              {showMoreMenu && (
                <>
                  <div className="fixed inset-0 z-[149]" onClick={() => setShowMoreMenu(false)} />
                  <div className="absolute bottom-full mb-3 right-0 z-[160]
                    glass-strong rounded-2xl p-1.5 min-w-[175px]
                    border border-white/80 dark:border-slate-700/50">

                    {[
                      { key: 'expenses',         icon: DollarSign,    label: 'รายจ่าย'      },
                      { key: 'menu_manage',       icon: ClipboardList, label: 'จัดการเมนู'   },
                      { key: 'members_manage',    icon: Users,         label: 'สมาชิก'       },
                      { key: 'category_summary',  icon: PieChart,      label: 'ยอดขายหมวด'  },
                      { key: 'financial',         icon: DollarSign,    label: 'การเงิน'      },
                      { key: 'admin',             icon: LayoutDashboard, label: 'แอดมิน'    },
                    ].map(({ key, icon: Icon, label }) => (
                      <button
                        key={key}
                        onClick={() => { handleViewChange(key); setShowMoreMenu(false); }}
                        className={[
                          'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl',
                          'text-xs font-semibold transition-all duration-200',
                          view === key
                            ? 'bg-emerald-500 text-white shadow-sm'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-white/5 hover:text-emerald-600',
                        ].join(' ')}
                      >
                        <Icon size={15} strokeWidth={1.8} />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Divider */}
            <div className="w-px h-5 mx-0.5 rounded-full bg-slate-200/70 dark:bg-slate-700/60 shrink-0" />

            {/* Dark Mode Toggle */}
            <button
              onClick={toggleDarkMode}
              aria-label={isDark ? 'โหมดสว่าง' : 'โหมดมืด'}
              className={[
                'flex items-center justify-center w-10 h-10 rounded-2xl shrink-0',
                'transition-all duration-300 active:scale-90',
                isDark
                  ? 'bg-amber-400/20 text-amber-300 hover:bg-amber-400/30'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700',
              ].join(' ')}
            >
              {isDark
                ? <Sun  size={16} strokeWidth={2} />
                : <Moon size={16} strokeWidth={1.8} />
              }
            </button>
          </div>
        </div>

        {/* Keyboard Shortcuts Help Modal */}
        <KeyboardShortcutsHelp isOpen={showKeyboardHelp} onClose={() => setShowKeyboardHelp(false)} />
      </div>
    </AppProvider>
  );
}
