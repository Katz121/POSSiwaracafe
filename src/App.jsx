import React, { useState, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import {
  User, ChefHat, FileText, Package, DollarSign, ClipboardList, Users,
  PieChart, LayoutDashboard, Lock, ChevronDown, ChevronUp, Trash2, Moon, Sun, MoreHorizontal, X
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
import { generateSmartAlerts } from './services/alertService';
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

// --- Main App Component ---
export default function App() {
  // 1. Core States
  const user = useAuth();
  const [view, setView] = useState('pos');
  const { isDark, toggle: toggleDarkMode } = useDarkMode();

  // Data States from hook
  const {
    isSyncing, syncError, orders, menu, stock, expenses, members, dynamicCategories, beanModifiers, quickExpenses, queueCounter,
    pinEnabled, vatEnabled, adminPin, redeemPointsThreshold, redeemDiscountValue, ownGlassDiscount, geminiApiKey, startingCash
  } = usePosData(user, appId);

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
    if (pinEnabled && ADMIN_PIN && protectedViews.includes(newView)) {
      setTargetView(newView);
      setShowPinModal(true);
    } else {
      setView(newView);
    }
  }, [pinEnabled, ADMIN_PIN, protectedViews]);

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
    enabled: !showPinModal && !orderToCancel,
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
  }), [pinEnabled, vatEnabled, adminPin, redeemPointsThreshold,
    redeemDiscountValue, ownGlassDiscount, geminiApiKey, startingCash]);

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
  }), [errorMessage, activePromotion, orderToCancel, editingOrderId, adminTab,
    runDbAction, callGeminiAPI, handleViewChange, updateStatus,
    aiUtils, showKeyboardHelp, isNavExpanded, isDark, toggleDarkMode]);

  return (
    <AppProvider dataValue={dataValue} configValue={configValue} uiValue={uiValue}>
      <div data-app="root" className="h-screen w-screen overflow-hidden bg-[var(--bg-primary)] pb-16 md:pb-20">
        {/* Loading / Auth State */}
        {(!user || isSyncing) && (
          <div className="fixed inset-0 z-[500] flex flex-col items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-md">
            <Spinner size="xl" />
            <h2 className="mt-8 text-xl font-black text-gray-800 dark:text-white uppercase tracking-widest animate-pulse">
              {!user ? 'กำลังเข้าสู่ระบบ...' : 'กำลังโหลดข้อมูล...'}
            </h2>
            <p className="text-gray-400 text-xs font-bold mt-2">Connecting to Cloud Database</p>
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
            <div className="h-full flex flex-col items-center justify-center bg-[var(--bg-primary)]">
              <Spinner size="lg" />
              <p className="mt-4 text-gray-400 font-bold text-sm uppercase tracking-widest">กำลังโหลด...</p>
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

        {/* Navigation Bar */}
        <div data-app="nav" className="fixed bottom-2 md:bottom-4 left-1/2 -translate-x-1/2 z-[150] flex items-center bg-white/95 dark:bg-gray-800/95 backdrop-blur-3xl border border-white/40 dark:border-gray-700 p-1 md:p-2 lg:p-3 rounded-2xl md:rounded-[3rem] lg:rounded-[3.5rem] shadow-[0_30px_100px_rgba(0,0,0,0.25)] gap-0.5 md:gap-1 lg:gap-2 transition-all duration-500">
          {/* Primary Nav Items */}
          {[
            { key: 'pos', icon: User, label: 'POS' },
            { key: 'merchant', icon: ChefHat, label: 'ครัว' },
            { key: 'bills', icon: FileText, label: 'บิล' },
            { key: 'stock', icon: Package, label: 'สต็อก' },
            { key: 'dashboard', icon: PieChart, label: 'สรุป' },
          ].map(({ key, icon: Icon, label }) => (
            <button key={key} onClick={() => handleViewChange(key)} className={`flex items-center justify-center gap-1 md:gap-2 px-2.5 md:px-4 lg:px-8 py-2.5 md:py-3 lg:py-4 rounded-xl md:rounded-2xl text-xs md:text-xs lg:text-sm font-black transition-all duration-300 leading-none shrink-0 ${view === key ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'text-gray-400 dark:text-gray-500 hover:text-emerald-500 active:bg-gray-100 dark:active:bg-gray-700'}`}>
              <Icon size={16} strokeWidth={3} className="md:w-[18px] md:h-[18px] lg:w-5 lg:h-5" />
              <span className="uppercase tracking-wider leading-none font-black">{label}</span>
            </button>
          ))}

          {/* More Menu Button */}
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className={`flex items-center justify-center gap-1 md:gap-2 px-2.5 md:px-4 lg:px-8 py-2.5 md:py-3 lg:py-4 rounded-xl md:rounded-2xl text-xs md:text-xs lg:text-sm font-black transition-all duration-300 leading-none shrink-0 ${['expenses', 'menu_manage', 'members_manage', 'financial', 'admin', 'category_summary'].includes(view) ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'text-gray-400 dark:text-gray-500 hover:text-emerald-500 active:bg-gray-100 dark:active:bg-gray-700'}`}
            >
              <MoreHorizontal size={16} strokeWidth={3} className="md:w-[18px] md:h-[18px] lg:w-5 lg:h-5" />
              <span className="uppercase tracking-wider leading-none font-black">อื่นๆ</span>
            </button>

            {/* More Menu Popup */}
            {showMoreMenu && (
              <>
                <div className="fixed inset-0 z-[149]" onClick={() => setShowMoreMenu(false)} />
                <div className="absolute bottom-full mb-3 right-0 bg-white dark:bg-gray-800 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.2)] border border-gray-100 dark:border-gray-700 p-2 min-w-[180px] z-[160]">
                  {[
                    { key: 'expenses', icon: DollarSign, label: 'รายจ่าย' },
                    { key: 'menu_manage', icon: ClipboardList, label: 'เมนู' },
                    { key: 'members_manage', icon: Users, label: 'สมาชิก' },
                    { key: 'category_summary', icon: PieChart, label: 'ยอดขายหมวด' },
                    { key: 'financial', icon: DollarSign, label: 'การเงิน' },
                    { key: 'admin', icon: LayoutDashboard, label: 'แอดมิน' },
                  ].map(({ key, icon: Icon, label }) => (
                    <button
                      key={key}
                      onClick={() => { handleViewChange(key); setShowMoreMenu(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black transition-all duration-200 ${view === key ? 'bg-emerald-500 text-white shadow-md' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                    >
                      <Icon size={18} strokeWidth={2.5} />
                      <span className="uppercase tracking-wider">{label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Dark Mode Toggle */}
          <button onClick={toggleDarkMode} aria-label={isDark ? 'โหมดสว่าง' : 'โหมดมืด'} className="flex items-center justify-center px-2.5 md:px-3 py-2.5 md:py-3 lg:py-4 rounded-xl md:rounded-2xl transition-all duration-300 shrink-0 bg-gray-800 dark:bg-amber-500 text-white shadow-lg ml-1 border-l border-gray-200 dark:border-gray-600 pl-2">
            {isDark ? <Sun size={18} strokeWidth={3} className="md:w-5 md:h-5 text-white" /> : <Moon size={18} strokeWidth={3} className="md:w-5 md:h-5" />}
          </button>
        </div>

        {/* Keyboard Shortcuts Help Modal */}
        <KeyboardShortcutsHelp isOpen={showKeyboardHelp} onClose={() => setShowKeyboardHelp(false)} />
      </div>
    </AppProvider>
  );
}
