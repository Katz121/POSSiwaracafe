import React, { useState, useCallback } from 'react';
import {
  User, ChefHat, FileText, Package, DollarSign, ClipboardList, Users,
  PieChart, LayoutDashboard, Lock, ChevronDown, Trash2
} from 'lucide-react';

// Firebase Imports
import {
  doc, updateDoc, deleteDoc
} from 'firebase/firestore';
import { db, appId } from './services/firebase';
import useAuth from './hooks/useAuth';
import usePosData from './hooks/usePosData';

// Context Provider
import { AppProvider } from './context/AppContext';

// View Components
import PosView from './components/views/PosView';
import MerchantView from './components/views/MerchantView';
import BillsView from './components/views/BillsView';
import DashboardView from './components/views/DashboardView';
import CategorySummaryView from './components/views/CategorySummaryView';
import StockView from './components/views/StockView';
import ExpensesView from './components/views/ExpensesView';
import MenuManageView from './components/views/MenuManageView';
import MembersView from './components/views/MembersView';
import AdminView from './components/views/AdminView';

// --- Main App Component ---
export default function App() {
  // 1. Core States
  const user = useAuth();
  const [view, setView] = useState('pos');

  // Data States from hook
  const {
    isSyncing, orders, menu, stock, expenses, members, dynamicCategories, beanModifiers, queueCounter,
    pinEnabled, vatEnabled, adminPin, redeemPointsThreshold, redeemDiscountValue, ownGlassDiscount, geminiApiKey
  } = usePosData(user, appId);

  // Shared UI States
  const [errorMessage, setErrorMessage] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [targetView, setTargetView] = useState(null);
  const [activePromotion, setActivePromotion] = useState(null);
  const [orderToCancel, setOrderToCancel] = useState(null);
  const [isNavExpanded, setIsNavExpanded] = useState(true);

  // Constants
  const ADMIN_PIN = adminPin || '1234';

  // 🔧 Reusable Gemini API Caller
  const AI_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-pro'];

  const callGeminiAPI = useCallback(async (prompt, parseAsJson = false) => {
    for (const model of AI_MODELS) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          if (parseAsJson) {
            const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return { success: true, data: JSON.parse(cleanText), raw: text };
          }
          return { success: true, data: text, raw: text };
        }
      } catch (e) {
        console.warn(`Gemini API error (${model}):`, e.message);
        if (e.message.includes('not found') || e.message.includes('not supported')) continue;
      }
    }
    return { success: false, data: null, error: 'All AI models failed' };
  }, [geminiApiKey]);

  // Database action wrapper
  const runDbAction = async (action, errorMsg = 'เกิดข้อผิดพลาด') => {
    try {
      await action();
      setErrorMessage('');
    } catch (err) {
      console.error(err);
      setErrorMessage(errorMsg);
    }
  };

  // Order status update
  const updateStatus = async (id, newStatus) => {
    await runDbAction(async () => {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', id), { status: newStatus });
    }, 'อัปเดตสถานะไม่สำเร็จ');
  };

  // Delete order
  const executeDeleteOrder = async () => {
    if (!orderToCancel) return;
    await runDbAction(async () => {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', orderToCancel));
      setOrderToCancel(null);
    }, 'ลบออเดอร์ไม่สำเร็จ');
  };

  // View change handler with PIN protection
  const protectedViews = ['admin', 'menu_manage'];

  const handleViewChange = (newView) => {
    if (pinEnabled && protectedViews.includes(newView)) {
      setTargetView(newView);
      setShowPinModal(true);
    } else {
      setView(newView);
    }
  };

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

  // Context value to pass to all views
  const contextValue = {
    // Data
    orders,
    menu,
    stock,
    expenses,
    members,
    dynamicCategories,
    beanModifiers,
    queueCounter,
    // Config
    pinEnabled,
    vatEnabled,
    adminPin,
    redeemPointsThreshold,
    redeemDiscountValue,
    ownGlassDiscount,
    geminiApiKey,
    // UI States
    isSyncing,
    errorMessage,
    // Shared States
    activePromotion,
    setActivePromotion,
    orderToCancel,
    setOrderToCancel,
    // Handlers
    runDbAction,
    callGeminiAPI,
    handleViewChange,
    setView,
    setErrorMessage,
    updateStatus,
  };

  return (
    <AppProvider value={contextValue}>
      <div className="h-screen w-screen overflow-hidden bg-[#f8faf9]">
        {/* Error Message Display */}
        {errorMessage && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[600] bg-red-500 text-white px-8 py-4 rounded-2xl shadow-2xl font-black text-sm animate-in slide-in-from-top-4 duration-300">
            {errorMessage}
            <button onClick={() => setErrorMessage('')} className="ml-4 opacity-70 hover:opacity-100">✕</button>
          </div>
        )}

        {/* View Router */}
        {view === 'pos' && <PosView />}
        {view === 'merchant' && <MerchantView />}
        {view === 'bills' && <BillsView />}
        {view === 'dashboard' && <DashboardView />}
        {view === 'category_summary' && <CategorySummaryView />}
        {view === 'stock' && <StockView />}
        {view === 'expenses' && <ExpensesView />}
        {view === 'menu_manage' && <MenuManageView />}
        {view === 'members_manage' && <MembersView />}
        {view === 'admin' && <AdminView />}

        {/* PIN Modal */}
        {showPinModal && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-3xl p-6 animate-in fade-in duration-300 leading-none">
            <div className="bg-white rounded-[4rem] p-16 max-w-lg w-full shadow-2xl text-center border border-white/20 leading-none">
              <div className="w-24 h-24 bg-emerald-50 rounded-full mx-auto flex items-center justify-center text-emerald-500 mb-10 shadow-inner leading-none"><Lock size={48} /></div>
              <h3 className="font-black text-3xl mb-3 uppercase tracking-tighter leading-none">Protected Access</h3>
              <p className="text-sm text-gray-400 font-bold mb-12 uppercase tracking-[0.3em] leading-none">ระบุรหัส PIN เพื่อดำเนินการต่อ</p>
              <input type="password" maxLength={4} autoFocus value={pinInput} onChange={(e) => setPinInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && checkPin()} className="w-full bg-gray-50 border-none rounded-3xl p-8 text-6xl font-black tracking-[1.2em] text-center text-emerald-600 outline-none focus:ring-8 focus:ring-emerald-500/10 mb-12 shadow-inner leading-none" placeholder="****" />
              <div className="grid grid-cols-2 gap-6 leading-none">
                <button onClick={() => { setShowPinModal(false); setPinInput(''); }} className="py-7 bg-gray-100 rounded-[2rem] font-black uppercase text-sm tracking-widest text-gray-400 active:scale-95 transition-all leading-none">ยกเลิก</button>
                <button onClick={checkPin} className="py-7 bg-emerald-500 text-white rounded-[2rem] font-black uppercase text-sm tracking-widest shadow-xl transition-all border-b-8 border-emerald-700 active:scale-95 transition-all leading-none">ปลดล็อค</button>
              </div>
            </div>
          </div>
        )}

        {/* Order Cancel Modal */}
        {orderToCancel && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/80 backdrop-blur-3xl p-6 animate-in fade-in text-center text-gray-900 leading-none">
            <div className="bg-white rounded-[4rem] p-16 max-w-xl w-full shadow-2xl border border-white/10 leading-none">
              <div className="w-28 h-28 bg-red-50 rounded-full mx-auto flex items-center justify-center text-red-500 mb-10 shadow-inner leading-none"><Trash2 size={64} /></div>
              <h3 className="font-black text-4xl mb-5 tracking-tighter uppercase leading-none">ต้องการลบบิลนี้?</h3>
              <p className="text-gray-400 font-bold mb-16 text-base leading-relaxed px-6 leading-none">ข้อมูลบิลนี้จะถูกลบออกจากระบบอย่างถาวรและไม่สามารถเรียกคืนได้ กรุณาตรวจสอบให้แน่ใจก่อนดำเนินการ</p>
              <div className="grid grid-cols-2 gap-6 leading-none">
                <button onClick={() => setOrderToCancel(null)} className="py-8 bg-gray-100 rounded-[2rem] font-black uppercase text-sm tracking-widest text-gray-400 active:scale-95 transition-all leading-none">ยกเลิก</button>
                <button onClick={executeDeleteOrder} className="py-8 bg-red-600 text-white rounded-[2rem] font-black uppercase text-sm tracking-widest shadow-2xl border-b-8 border-red-800 active:scale-95 transition-all leading-none">ยืนยันการลบ</button>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Toggle Button */}
        <button
          onClick={() => setIsNavExpanded(!isNavExpanded)}
          className="fixed bottom-6 right-6 z-[110] bg-gray-900 text-white p-4 rounded-full shadow-2xl border-2 border-white/20 hover:scale-110 transition-all active:scale-95"
        >
          {isNavExpanded ? <ChevronDown size={24} /> : <LayoutDashboard size={24} />}
        </button>

        {/* Main Navigation Bar */}
        <div className={`fixed bottom-2 md:bottom-4 left-1/2 -translate-x-1/2 z-[100] flex bg-white/95 backdrop-blur-3xl border border-white/40 p-1.5 md:p-2 lg:p-3 rounded-[2rem] md:rounded-[3rem] lg:rounded-[3.5rem] shadow-[0_30px_100px_rgba(0,0,0,0.25)] gap-1 md:gap-2 transition-all duration-500 border-b-4 border-gray-100 max-w-[95vw] nav-scroll ${isNavExpanded ? 'translate-y-0 opacity-100' : 'translate-y-[200%] opacity-0 pointer-events-none'}`}>
          <button onClick={() => handleViewChange('pos')} className={`flex items-center justify-center gap-2 px-3 md:px-6 lg:px-10 py-3 md:py-4 lg:py-5 rounded-xl md:rounded-2xl lg:rounded-[2rem] text-[10px] md:text-[11px] lg:text-[12px] font-black transition-all duration-300 leading-none shrink-0 ${view === 'pos' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 scale-105' : 'text-gray-400 hover:text-emerald-500'}`}><User size={18} strokeWidth={3} className="md:w-5 md:h-5 lg:w-[22px] lg:h-[22px]" /> <span className="hidden xl:inline uppercase tracking-widest leading-none font-black">สั่งอาหาร</span></button>
          <button onClick={() => handleViewChange('merchant')} className={`flex items-center justify-center gap-2 px-3 md:px-6 lg:px-10 py-3 md:py-4 lg:py-5 rounded-xl md:rounded-2xl lg:rounded-[2rem] text-[10px] md:text-[11px] lg:text-[12px] font-black transition-all duration-300 leading-none shrink-0 ${view === 'merchant' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 scale-105' : 'text-gray-400 hover:text-emerald-500'}`}><ChefHat size={18} strokeWidth={3} className="md:w-5 md:h-5 lg:w-[22px] lg:h-[22px]" /> <span className="hidden xl:inline uppercase tracking-widest leading-none font-black">ห้องครัว</span></button>
          <button onClick={() => handleViewChange('bills')} className={`flex items-center justify-center gap-2 px-3 md:px-6 lg:px-10 py-3 md:py-4 lg:py-5 rounded-xl md:rounded-2xl lg:rounded-[2rem] text-[10px] md:text-[11px] lg:text-[12px] font-black transition-all duration-300 leading-none shrink-0 ${view === 'bills' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 scale-105' : 'text-gray-400 hover:text-emerald-500'}`}><FileText size={18} strokeWidth={3} className="md:w-5 md:h-5 lg:w-[22px] lg:h-[22px]" /> <span className="hidden xl:inline uppercase tracking-widest leading-none font-black">ประวัติบิล</span></button>
          <button onClick={() => handleViewChange('stock')} className={`flex items-center justify-center gap-2 px-3 md:px-6 lg:px-10 py-3 md:py-4 lg:py-5 rounded-xl md:rounded-2xl lg:rounded-[2rem] text-[10px] md:text-[11px] lg:text-[12px] font-black transition-all duration-300 leading-none shrink-0 ${view === 'stock' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 scale-105' : 'text-gray-400 hover:text-emerald-500'}`}><Package size={18} strokeWidth={3} className="md:w-5 md:h-5 lg:w-[22px] lg:h-[22px]" /> <span className="hidden xl:inline uppercase tracking-widest leading-none font-black">สต็อก</span></button>
          <button onClick={() => handleViewChange('expenses')} className={`flex items-center justify-center gap-2 px-3 md:px-6 lg:px-10 py-3 md:py-4 lg:py-5 rounded-xl md:rounded-2xl lg:rounded-[2rem] text-[10px] md:text-[11px] lg:text-[12px] font-black transition-all duration-300 leading-none shrink-0 ${view === 'expenses' ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 scale-105' : 'text-gray-400 hover:text-red-500'}`}><DollarSign size={18} strokeWidth={3} className="md:w-5 md:h-5 lg:w-[22px] lg:h-[22px]" /> <span className="hidden xl:inline uppercase tracking-widest leading-none font-black">รายจ่าย</span></button>
          <button onClick={() => handleViewChange('menu_manage')} className={`flex items-center justify-center gap-2 px-3 md:px-6 lg:px-10 py-3 md:py-4 lg:py-5 rounded-xl md:rounded-2xl lg:rounded-[2rem] text-[10px] md:text-[11px] lg:text-[12px] font-black transition-all duration-300 leading-none shrink-0 ${view === 'menu_manage' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 scale-105' : 'text-gray-400 hover:text-emerald-500'}`}><ClipboardList size={18} strokeWidth={3} className="md:w-5 md:h-5 lg:w-[22px] lg:h-[22px]" /> <span className="hidden xl:inline uppercase tracking-widest leading-none font-black">จัดการเมนู</span></button>
          <button onClick={() => handleViewChange('members_manage')} className={`flex items-center justify-center gap-2 px-3 md:px-6 lg:px-10 py-3 md:py-4 lg:py-5 rounded-xl md:rounded-2xl lg:rounded-[2rem] text-[10px] md:text-[11px] lg:text-[12px] font-black transition-all duration-300 leading-none shrink-0 ${view === 'members_manage' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 scale-105' : 'text-gray-400 hover:text-emerald-500'}`}><Users size={18} strokeWidth={3} className="md:w-5 md:h-5 lg:w-[22px] lg:h-[22px]" /> <span className="hidden xl:inline uppercase tracking-widest leading-none font-black">สมาชิก</span></button>
          <button onClick={() => handleViewChange('dashboard')} className={`flex items-center justify-center gap-2 px-3 md:px-6 lg:px-10 py-3 md:py-4 lg:py-5 rounded-xl md:rounded-2xl lg:rounded-[2rem] text-[10px] md:text-[11px] lg:text-[12px] font-black transition-all duration-300 leading-none shrink-0 ${view === 'dashboard' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 scale-105' : 'text-gray-400 hover:text-emerald-500'}`}><PieChart size={18} strokeWidth={3} className="md:w-5 md:h-5 lg:w-[22px] lg:h-[22px]" /> <span className="hidden xl:inline uppercase tracking-widest leading-none font-black">สรุปเชิงลึก</span></button>
          <button onClick={() => handleViewChange('admin')} className={`flex items-center justify-center gap-2 px-3 md:px-6 lg:px-10 py-3 md:py-4 lg:py-5 rounded-xl md:rounded-2xl lg:rounded-[2rem] text-[10px] md:text-[11px] lg:text-[12px] font-black transition-all duration-300 leading-none shrink-0 ${view === 'admin' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 scale-105' : 'text-gray-400 hover:text-emerald-500'}`}><LayoutDashboard size={18} strokeWidth={3} className="md:w-5 md:h-5 lg:w-[22px] lg:h-[22px]" /> <span className="hidden xl:inline uppercase tracking-widest leading-none font-black">แอดมิน</span></button>
        </div>
      </div>
    </AppProvider>
  );
}
