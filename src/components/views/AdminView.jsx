import React, { useState, useMemo, useEffect } from 'react';
import {
  PieChart, Calendar, ChevronUp, ChevronDown, TrendingUp, Zap,
  History, Coffee, Link2, Plus, Trash2, Edit, BarChart3, DollarSign,
  ChefHat, FileText, Package, RefreshCcw, Banknote, Download, Save, Target, Settings, FolderCog
} from 'lucide-react';
// xlsx loaded dynamically to reduce bundle size (7MB library)
import { doc, collection, addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { useAppContext } from '../../context/AppContext';
import { getISODate, getOrderDate } from '../../utils/calculations';
import { seedDatabase } from '../../utils/seedData';
import { getUpsellStats, clearUpsellStats, exportUpsellStats } from '../../services/upsellTracker';
import { Button, Modal, Input, Tabs, Card, Badge, Spinner, ConfirmModal, useToast } from '../ui';
import {
  DEFAULT_ADMIN_PIN,
  DEFAULT_REDEEM_POINTS_THRESHOLD,
  DEFAULT_REDEEM_DISCOUNT_VALUE,
  DEFAULT_OWN_GLASS_DISCOUNT,
  DEFAULT_STARTING_CASH,
  DEFAULT_EXPENSE_CATEGORY,
  EXPENSE_CATEGORIES
} from '../../config/constants';

export default function AdminView() {
  const {
    orders,
    expenses,
    stock,
    members,
    menu,
    dynamicCategories,
    beanModifiers,
    quickExpenses,
    vatEnabled,
    pinEnabled,
    adminPin,
    redeemPointsThreshold,
    redeemDiscountValue,
    ownGlassDiscount,
    geminiApiKey,
    startingCash,
    adminTab,
    setAdminTab,
    runDbAction,
    setView,
    aiUtils
  } = useAppContext();

  // Constants
  const ADMIN_PIN = adminPin || DEFAULT_ADMIN_PIN;
  const REDEEM_POINTS_THRESHOLD = Number(redeemPointsThreshold) || DEFAULT_REDEEM_POINTS_THRESHOLD;
  const REDEEM_DISCOUNT_VALUE = Number(redeemDiscountValue) || DEFAULT_REDEEM_DISCOUNT_VALUE;
  const OWN_GLASS_DISCOUNT = Number(ownGlassDiscount) || DEFAULT_OWN_GLASS_DISCOUNT;
  const STARTING_CASH = Number(startingCash) || DEFAULT_STARTING_CASH;

  // Tab state
  const [activeAdminTab, setActiveAdminTab] = useState('stats');

  // Local states
  const [selectedHistoryDate, setSelectedHistoryDate] = useState(getISODate());
  const [settingsDraft, setSettingsDraft] = useState({
    adminPin: '',
    redeemPointsThreshold: DEFAULT_REDEEM_POINTS_THRESHOLD,
    redeemDiscountValue: DEFAULT_REDEEM_DISCOUNT_VALUE,
    ownGlassDiscount: DEFAULT_OWN_GLASS_DISCOUNT,
    geminiApiKey: '',
    startingCash: DEFAULT_STARTING_CASH
  });
  const [adminPanels, setAdminPanels] = useState({
    daily: true,
    monthly: false,
    expenses: false,
    backdatedSales: false,
    beanModifiers: false,
    quickExpenses: false,
    settings: true,
  });
  const [backdatedSale, setBackdatedSale] = useState({
    title: '',
    amount: '',
    date: getISODate(),
    note: ''
  });
  const [newBeanModifier, setNewBeanModifier] = useState({ name: '', price: '', stockLinks: [] });
  const [editingBeanModifierId, setEditingBeanModifierId] = useState(null);
  const [newQuickExpense, setNewQuickExpense] = useState({ label: '', title: '', amount: '', unit: '', category: DEFAULT_EXPENSE_CATEGORY, icon: '💰' });
  const [editingQuickExpenseId, setEditingQuickExpenseId] = useState(null);
  const [newExpense, setNewExpense] = useState({ title: '', amount: '', category: DEFAULT_EXPENSE_CATEGORY });
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Confirmation modal states
  const [showClearUpsellConfirm, setShowClearUpsellConfirm] = useState(false);
  const [showDeleteBeanConfirm, setShowDeleteBeanConfirm] = useState(false);
  const [beanToDelete, setBeanToDelete] = useState(null);
  const [showDeleteQuickExpenseConfirm, setShowDeleteQuickExpenseConfirm] = useState(false);
  const [quickExpenseToDelete, setQuickExpenseToDelete] = useState(null);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [showSeedConfirm, setShowSeedConfirm] = useState(false);

  const toast = useToast();

  // Initialize settingsDraft from context values
  useEffect(() => {
    setSettingsDraft({
      adminPin: ADMIN_PIN,
      redeemPointsThreshold: REDEEM_POINTS_THRESHOLD,
      redeemDiscountValue: REDEEM_DISCOUNT_VALUE,
      ownGlassDiscount: OWN_GLASS_DISCOUNT,
      geminiApiKey: geminiApiKey || '',
      startingCash: STARTING_CASH
    });
  }, [ADMIN_PIN, REDEEM_POINTS_THRESHOLD, REDEEM_DISCOUNT_VALUE, OWN_GLASS_DISCOUNT, geminiApiKey, STARTING_CASH]);

  // Handle deep-linking from other views
  useEffect(() => {
    if (adminTab) {
      setAdminPanels(prev => ({ ...prev, [adminTab]: true }));
      // Scroll to the panel if needed (optional but helpful)
      const element = document.getElementById(`panel-${adminTab}`);
      if (element) {
        setTimeout(() => element.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
      }
      // Reset the tab in parent to avoid re-triggering
      setAdminTab(null);
    }
  }, [adminTab, setAdminTab]);

  // Memos
  const statsForSelectedDate = useMemo(() => {
    const dayOrders = orders.filter(o => o.status === 'completed' && getOrderDate(o) === selectedHistoryDate);
    return {
      count: dayOrders.length,
      revenue: dayOrders.reduce((s, o) => s + (Number(o.total) || 0), 0),
      itemsCount: dayOrders.reduce((s, o) => s + (o.items?.reduce((ss, ii) => ss + Number(ii.quantity), 0) || 0), 0)
    };
  }, [orders, selectedHistoryDate]);

  const monthlyStats = useMemo(() => {
    const targetMonth = selectedHistoryDate.substring(0, 7);
    const monthOrders = orders.filter(o => o.status === 'completed' && getOrderDate(o).startsWith(targetMonth));
    const monthExpenses = expenses.filter(e => e.date?.startsWith(targetMonth));
    const revenue = monthOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const cost = monthExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const count = monthOrders.length;
    return { revenue, cost, profit: revenue - cost, count };
  }, [orders, expenses, selectedHistoryDate]);

  const dailyNetStats = useMemo(() => {
    const dayExpenses = expenses.filter(e => e.date === selectedHistoryDate);
    const revenue = statsForSelectedDate.revenue;
    const cost = dayExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    return { revenue, cost, profit: revenue - cost };
  }, [statsForSelectedDate.revenue, expenses, selectedHistoryDate]);

  // Handlers
  const toggleAdminPanel = (key) => {
    setAdminPanels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const saveSettingsDraft = async () => {
    await runDbAction(async () => {
      await setDoc(
        doc(db, 'artifacts', appId, 'public', 'data', 'config', 'settings'),
        {
          adminPin: String(settingsDraft.adminPin || ADMIN_PIN),
          redeemPointsThreshold: Number(settingsDraft.redeemPointsThreshold) || REDEEM_POINTS_THRESHOLD,
          redeemDiscountValue: Number(settingsDraft.redeemDiscountValue) || REDEEM_DISCOUNT_VALUE,
          ownGlassDiscount: Number(settingsDraft.ownGlassDiscount) || OWN_GLASS_DISCOUNT,
          geminiApiKey: String(settingsDraft.geminiApiKey || ''),
          startingCash: Number(settingsDraft.startingCash) || 0,
        },
        { merge: true }
      );
    }, 'บันทึกการตั้งค่าไม่สำเร็จ');
  };

  const togglePinSecurity = async () => runDbAction(
    async () => { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'settings'), { pinEnabled: !pinEnabled }, { merge: true }); },
    'อัปเดตระบบ PIN ไม่สำเร็จ'
  );

  const toggleVatSystem = async () => runDbAction(
    async () => { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'settings'), { vatEnabled: !vatEnabled }, { merge: true }); },
    'อัปเดต VAT ไม่สำเร็จ'
  );

  const addBackdatedSale = async (e) => {
    e.preventDefault();
    if (!backdatedSale.title || !backdatedSale.amount || !backdatedSale.date) return;
    await runDbAction(async () => {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), {
        queueNumber: 0,
        items: [{
          name: String(backdatedSale.title),
          price: Number(backdatedSale.amount),
          quantity: 1,
          note: backdatedSale.note || 'ยอดขายย้อนหลัง'
        }],
        subtotal: Number(backdatedSale.amount),
        discount: 0,
        vat: 0,
        total: Number(backdatedSale.amount),
        vatIncluded: false,
        isPaid: true,
        memberPhone: '',
        memberNickname: '',
        status: 'completed',
        bringOwnGlass: false,
        pointsProcessed: true,
        isBackdated: true,
        createdAt: serverTimestamp(),
        date: backdatedSale.date,
        time: '00:00',
        table: 'ย้อนหลัง'
      });
      setBackdatedSale({ title: '', amount: '', date: getISODate(), note: '' });
    }, 'บันทึกยอดขายย้อนหลังไม่สำเร็จ');
  };

  const addExpense = async (e) => {
    e.preventDefault();
    if (!newExpense.title || !newExpense.amount) return;
    await runDbAction(async () => {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'expenses'), {
        title: String(newExpense.title),
        amount: Number(newExpense.amount),
        category: String(newExpense.category),
        date: selectedHistoryDate,
        createdAt: serverTimestamp()
      });
      setNewExpense({ title: '', amount: '', category: DEFAULT_EXPENSE_CATEGORY });
    }, 'บันทึกค่าใช้จ่ายไม่สำเร็จ');
  };

  const executeResetSession = async () => {
    setShowResetConfirm(false);
    await runDbAction(async () => {
      const pendingOrders = orders.filter(o => o.status !== 'completed' && getOrderDate(o) === getISODate());
      for (const order of pendingOrders) { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', order.id)); }
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'queue'), { current: 1 });
    }, 'ล้างออเดอร์ไม่สำเร็จ');
  };

  // Handler functions for confirmation modals
  const handleClearUpsellStats = () => {
    clearUpsellStats();
    toast.success('ล้างข้อมูลสำเร็จ');
    setShowClearUpsellConfirm(false);
  };

  const handleDeleteBeanModifier = async () => {
    setShowDeleteBeanConfirm(false);
    if (!beanToDelete) return;
    await runDbAction(async () => {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'beanModifiers', beanToDelete.id));
    }, 'ลบแท็กไม่สำเร็จ');
    setBeanToDelete(null);
  };

  const handleDeleteQuickExpense = async () => {
    setShowDeleteQuickExpenseConfirm(false);
    if (!quickExpenseToDelete) return;
    await runDbAction(async () => {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'quickExpenses', quickExpenseToDelete.id));
    }, 'ลบคีย์ลัดไม่สำเร็จ');
    setQuickExpenseToDelete(null);
  };

  const handleExportExcel = () => {
    setShowExportConfirm(false);
    exportToExcel();
  };

  const handleSeedDatabase = async () => {
    setShowSeedConfirm(false);
    await runDbAction(async () => {
      await seedDatabase(db, appId);
    }, 'กู้คืนข้อมูลไม่สำเร็จ');
    toast.success('กู้คืนข้อมูลเริ่มต้นสำเร็จ');
  };

  // Bean modifier stock link handlers
  const addBeanStockLink = () => setNewBeanModifier(p => ({ ...p, stockLinks: [...(p.stockLinks || []), { stockId: '', usage: 1 }] }));
  const removeBeanStockLink = (i) => setNewBeanModifier(p => ({ ...p, stockLinks: p.stockLinks.filter((_, idx) => idx !== i) }));
  const updateBeanStockLink = (i, f, v) => setNewBeanModifier(p => {
    const next = [...(p.stockLinks || [])];
    next[i] = { ...next[i], [f]: v };
    return { ...p, stockLinks: next };
  });

  const saveSettings = async (e) => {
    if (e) e.preventDefault();
    await runDbAction(async () => {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'settings'), {
        geminiApiKey: settingsDraft.geminiApiKey,
        adminPin: settingsDraft.adminPin,
        redeemPointsThreshold: Number(settingsDraft.redeemPointsThreshold),
        redeemDiscountValue: Number(settingsDraft.redeemDiscountValue),
        ownGlassDiscount: Number(settingsDraft.ownGlassDiscount),
        startingCash: Number(settingsDraft.startingCash),
        updatedAt: serverTimestamp()
      }, { merge: true });
      toast.success('บันทึกการตั้งค่าเรียบร้อยแล้ว');
    }, 'บันทึกการตั้งค่าไม่สำเร็จ');
  };

  const handleTestAI = async () => {
    const key = settingsDraft.geminiApiKey;
    if (!key) {
      toast.warning('กรุณากรอก API Key ก่อนทดสอบ');
      return;
    }

    // Create a temporary fetch to test the SPECIFIC key in the input
    try {
      const model = 'gemini-2.5-flash-lite';
      const prompt = 'Hello';
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      toast.success('การเชื่อมต่อ AI สำเร็จ!');
    } catch (e) {
      toast.error('การเชื่อมต่อล้มเหลว: ' + e.message);
    }
  };

  // Export to Excel (xlsx loaded on demand)
  const exportToExcel = async () => {
    try {
      if (!orders.length) {
        toast.warning('ไม่พบข้อมูลการขายในระบบ กรุณาลองขายสินค้าที่หน้า POS ก่อน');
        return;
      }

      toast.info('กำลังเตรียมไฟล์ Excel...');
      const XLSX = await import('xlsx');

      // Export ALL data (No filtering by month)
      const allOrders = orders.filter(o => o.status === 'completed');
      const allExpenses = expenses;

      if (allOrders.length === 0 && allExpenses.length === 0) {
        toast.warning('ไม่พบข้อมูลการขายหรือรายจ่ายในระบบ');
        return;
      }

      const wb = XLSX.utils.book_new();

      // --- Sheet 1: Overview (All Time) ---
      const totalRevenue = allOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
      const totalCost = allExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

      const overviewData = [{
        'ช่วงเวลา': 'ALL TIME (ทั้งหมด)',
        'รายรับรวม (บาท)': totalRevenue,
        'รายจ่ายรวม (บาท)': totalCost,
        'กำไรสุทธิ (บาท)': totalRevenue - totalCost,
        'จำนวนบิลทั้งหมด': allOrders.length,
        'วันที่ออกรายงาน': new Date().toLocaleString('th-TH')
      }];
      const wsOverview = XLSX.utils.json_to_sheet(overviewData);
      XLSX.utils.book_append_sheet(wb, wsOverview, "ภาพรวม (Overview)");

      // --- Sheet 2: All Sales ---
      const salesData = allOrders.map(o => {
        const dateObj = o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(o.createdAt);
        return {
          'วันที่': dateObj.toLocaleDateString('th-TH'),
          'เวลา': dateObj.toLocaleTimeString('th-TH'),
          'เลขที่บิล': o.id.substring(0, 8),
          'รายการสินค้า': o.items?.map(i => `${i.name} x${i.quantity}`).join(', '),
          'ราคารวม': o.total,
          'วิธีชำระ': o.paymentMethod === 'transfer' ? 'โอนเงิน' : 'เงินสด',
          'สมาชิก': o.memberPhone || '-'
        };
      });
      const wsSales = XLSX.utils.json_to_sheet(salesData);
      XLSX.utils.book_append_sheet(wb, wsSales, "รายการขาย (Sales)");

      // --- Sheet 3: Product Performance ---
      const productStats = {};
      allOrders.forEach(o => {
        o.items?.forEach(i => {
          if (!productStats[i.name]) productStats[i.name] = { qty: 0, revenue: 0, category: i.category || '-' };
          productStats[i.name].qty += i.quantity;
          productStats[i.name].revenue += (i.price * i.quantity);
        });
      });
      const productData = Object.entries(productStats)
        .map(([name, stat]) => ({
          'ชื่อเมนู': name,
          'หมวดหมู่': stat.category,
          'จำนวนที่ขายได้ (แก้ว/ชิ้น)': stat.qty,
          'ยอดขายรวม (บาท)': stat.revenue,
          'สัดส่วนยอดขาย (%)': ((stat.revenue / totalRevenue) * 100).toFixed(2) + '%'
        }))
        .sort((a, b) => b['จำนวนที่ขายได้ (แก้ว/ชิ้น)'] - a['จำนวนที่ขายได้ (แก้ว/ชิ้น)']);

      const wsProducts = XLSX.utils.json_to_sheet(productData);
      XLSX.utils.book_append_sheet(wb, wsProducts, "ยอดขายรายเมนู (Products)");

      // --- Sheet 4: Expenses ---
      const expenseData = allExpenses.map(e => ({
        'วันที่': e.date,
        'รายการ': e.title,
        'หมวดหมู่': e.category,
        'จำนวนเงิน (บาท)': e.amount,
        'หน่วย': e.unit || '-'
      }));
      const wsExpenses = XLSX.utils.json_to_sheet(expenseData);
      XLSX.utils.book_append_sheet(wb, wsExpenses, "รายจ่าย (Expenses)");

      // --- Sheet 5: Members (สมาชิก) ---
      const memberData = members.map(m => ({
        'ชื่อลูกค้า': m.name || '-',
        'เบอร์โทร': m.phone || '-',
        'คะแนนสะสม': m.points || 0,
        'วันที่สมัคร': m.createdAt?.seconds ? new Date(m.createdAt.seconds * 1000).toLocaleDateString('th-TH') : '-'
      }));
      const wsMembers = XLSX.utils.json_to_sheet(memberData);
      XLSX.utils.book_append_sheet(wb, wsMembers, "สมาชิก (Members)");

      // --- Sheet 6: Stock (สต็อกสินค้า) ---
      const stockData = stock.map(s => ({
        'ชื่อวัตถุดิบ': s.name,
        'คงเหลือ': s.quantity,
        'หน่วย': s.unit,
        'สถานะ': s.quantity < s.minQuantity ? '⚠️ ใกล้หมด' : 'ปกติ'
      }));
      const wsStock = XLSX.utils.json_to_sheet(stockData);
      XLSX.utils.book_append_sheet(wb, wsStock, "สต็อก (Stock)");

      // --- Sheet 7: Menu (เมนูสินค้า) ---
      const menuData = menu.map(m => ({
        'ชื่อเมนู': m.name,
        'หมวดหมู่': m.category,
        'ราคา (บาท)': m.price,
        'ขายดี?': m.isBestSeller ? 'Yes' : 'No'
      }));
      const wsMenu = XLSX.utils.json_to_sheet(menuData);
      XLSX.utils.book_append_sheet(wb, wsMenu, "เมนู (Menu)");

      // Save File
      XLSX.writeFile(wb, `POS_Export_ALL_DATA_${new Date().toISOString().slice(0, 10)}.xlsx`);

    } catch (error) {
      toast.error('เกิดข้อผิดพลาดในการส่งออก Excel: ' + error.message);
    }
  };

  return (
    <div className="h-full bg-[#f8faf9] flex flex-col animate-in fade-in duration-500 text-gray-800 overflow-hidden leading-none">
      <header className="h-16 md:h-20 lg:h-24 bg-white border-b border-gray-100 px-4 md:px-8 lg:px-12 flex items-center justify-between shadow-sm z-10 text-gray-800">
        <div className="flex items-center gap-2 md:gap-4 text-emerald-600 uppercase font-black"><PieChart size={24} className="md:w-8 md:h-8 lg:w-9 lg:h-9" /><h1 className="text-base md:text-xl lg:text-2xl font-black uppercase tracking-tight text-gray-800 leading-none">สรุปยอด</h1></div>
        <div className="flex items-center gap-2 md:gap-3 lg:gap-5 text-gray-800 leading-none">
          <div className="relative flex items-center bg-emerald-50 border border-emerald-100 rounded-xl md:rounded-2xl lg:rounded-[2rem] p-1 md:p-1.5 shadow-sm leading-none"><Calendar className="text-emerald-500 ml-2 md:ml-4" size={18} /><input type="date" value={selectedHistoryDate} onChange={(e) => setSelectedHistoryDate(e.target.value)} className="bg-transparent border-none py-2 md:py-3 lg:py-3.5 pl-2 pr-3 md:pl-3 md:pr-6 text-sm md:text-base font-black text-emerald-700 outline-none cursor-pointer shadow-none leading-none w-[110px] md:w-auto" /></div>
          {/* Excel Button Removed from Header */}
          <button onClick={toggleVatSystem} className={`hidden md:flex px-4 lg:px-8 py-2.5 lg:py-4 rounded-xl lg:rounded-2xl text-xs lg:text-xs font-black items-center gap-2 border transition-all leading-none ${vatEnabled ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>{vatEnabled ? 'VAT ON' : 'VAT OFF'}</button>
          <button onClick={togglePinSecurity} className={`hidden md:flex px-4 lg:px-8 py-2.5 lg:py-4 rounded-xl lg:rounded-2xl text-xs lg:text-xs font-black items-center gap-2 border transition-all leading-none ${pinEnabled ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>{pinEnabled ? 'PIN ON' : 'PIN OFF'}</button>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 md:gap-2 px-4 md:px-8 lg:px-12 py-3 bg-white/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700 shrink-0">
        {[
          { key: 'stats', icon: BarChart3, label: 'สรุปยอด' },
          { key: 'settings', icon: Settings, label: 'ตั้งค่า' },
          { key: 'manage', icon: FolderCog, label: 'จัดการ' },
        ].map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setActiveAdminTab(key)}
            className={`flex items-center gap-2 px-4 md:px-6 py-2.5 md:py-3 rounded-xl md:rounded-2xl text-xs md:text-sm font-black uppercase tracking-wider transition-all ${activeAdminTab === key ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-8 p-4 md:p-6 lg:p-8 overflow-auto text-gray-800">
        <div className={`w-full ${activeAdminTab === 'stats' ? 'lg:w-[400px] xl:w-[480px]' : ''} space-y-4 md:space-y-6 lg:space-y-8 shrink-0 animate-in fade-in duration-300`}>

          {/* ==================== TAB: สรุปยอด ==================== */}
          {activeAdminTab === 'stats' && <>
          {/* Daily Stats Card */}
          <div className="bg-gray-900 rounded-2xl md:rounded-[2.5rem] lg:rounded-[3rem] p-6 md:p-8 lg:p-10 text-white shadow-2xl relative overflow-hidden border-b-8 border-emerald-500/20">
            <TrendingUp size={160} className="absolute -right-12 -bottom-12 opacity-10" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] opacity-50 mb-3 px-1">สรุปยอดรายวัน ({new Date(selectedHistoryDate).toLocaleDateString('th-TH')})</p>
                <p className={`text-7xl font-black tracking-tighter mb-6 ${dailyNetStats.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  ฿{Number(dailyNetStats.profit).toLocaleString()}
                </p>
              </div>
              <button onClick={() => toggleAdminPanel('daily')} className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 transition-all">
                {adminPanels.daily ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>
            </div>
            {adminPanels.daily && (
              <div className="grid grid-cols-2 gap-6 mt-8 border-t border-white/10 pt-8 font-black uppercase tracking-[0.2em] text-xs opacity-60">
                <div className="flex flex-col gap-2"><span>รายรับ:</span><span className="text-2xl text-white tracking-tighter">฿{Number(dailyNetStats.revenue).toLocaleString()}</span></div>
                <div className="flex flex-col gap-2"><span className="text-red-400">รายจ่าย:</span><span className="text-2xl text-red-400 tracking-tighter">฿{Number(dailyNetStats.cost).toLocaleString()}</span></div>
              </div>
            )}
            {/* Starting Cash Reminder */}
            {STARTING_CASH > 0 && (
              <div className="mt-6 bg-amber-500/20 border border-amber-400/30 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Banknote size={20} className="text-amber-400" />
                  <span className="text-xs font-black text-amber-300 uppercase tracking-widest">เงินตั้งต้น (ทอน)</span>
                </div>
                <span className="text-xl font-black text-amber-400">฿{STARTING_CASH.toLocaleString()}</span>
              </div>
            )}
          </div>

          </>}

          {/* ==================== TAB: ตั้งค่า ==================== */}
          {activeAdminTab === 'settings' && <>
          {/* Settings Panel */}
          <div className="bg-white rounded-[3rem] p-8 border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.3em]">ตั้งค่าระบบ</h2>
              <button onClick={() => toggleAdminPanel('settings')} className="p-2 rounded-2xl bg-gray-100 hover:bg-gray-200 transition-all">
                {adminPanels.settings ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>
            </div>
            {adminPanels.settings && (
              <>
                <div className="space-y-4">
                  {/* Starting Cash - Prominent */}
                  <div className="bg-amber-50 p-5 rounded-2xl border-2 border-amber-200">
                    <label className="text-xs font-black text-amber-600 uppercase tracking-widest flex items-center gap-2"><Banknote size={14} /> เงินตั้งต้นร้าน (เงินทอน)</label>
                    <input type="number" value={settingsDraft.startingCash} onChange={(e) => setSettingsDraft({ ...settingsDraft, startingCash: e.target.value })} className="w-full mt-2 bg-white border border-amber-200 rounded-2xl p-4 text-lg font-black outline-none text-amber-700 focus:ring-4 focus:ring-amber-200" placeholder="0" />
                    <p className="text-xs text-amber-500 mt-2 font-bold">เงินสำรองไว้ทอน - ไม่นับรวมกับยอดขาย แสดงแยกในรายงาน</p>
                  </div>
                  <div>
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest">PIN แอดมิน</label>
                    <input type="password" maxLength={6} value={settingsDraft.adminPin} onChange={(e) => setSettingsDraft({ ...settingsDraft, adminPin: e.target.value })} className="w-full mt-2 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-black outline-none" placeholder="เช่น 1234" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-widest">แต้มขั้นต่ำแลก</label>
                      <input type="number" value={settingsDraft.redeemPointsThreshold} onChange={(e) => setSettingsDraft({ ...settingsDraft, redeemPointsThreshold: e.target.value })} className="w-full mt-2 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-black outline-none" />
                    </div>
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-widest">ส่วนลดแลกแต้ม</label>
                      <input type="number" value={settingsDraft.redeemDiscountValue} onChange={(e) => setSettingsDraft({ ...settingsDraft, redeemDiscountValue: e.target.value })} className="w-full mt-2 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-black outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest">ส่วนลดแก้วส่วนตัว</label>
                    <input type="number" value={settingsDraft.ownGlassDiscount} onChange={(e) => setSettingsDraft({ ...settingsDraft, ownGlassDiscount: e.target.value })} className="w-full mt-2 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-black outline-none" />
                  </div>
                  <div className="col-span-2 border-t border-gray-50 pt-4 mt-2">
                    <label className="text-xs font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2"><Zap size={14} /> Gemini API Key (สำหรับ AI Features)</label>
                    <div className="flex gap-2">
                      <input type="password" value={settingsDraft.geminiApiKey} onChange={(e) => setSettingsDraft({ ...settingsDraft, geminiApiKey: e.target.value })} className="flex-1 mt-2 bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 text-sm font-bold text-emerald-700 outline-none placeholder:text-emerald-300" placeholder="AIzaSy..." />
                      <button onClick={handleTestAI} className="mt-2 px-4 bg-emerald-100 text-emerald-600 rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-emerald-200 transition-all">Test AI</button>
                    </div>
                    <p className="text-xs text-gray-400 mt-2 font-bold">รับฟรีที่ <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline hover:text-emerald-500">aistudio.google.com</a></p>

                    {/* AI Stats */}
                    {aiUtils?.getApiStats && (
                      <div className="mt-4 bg-violet-50/50 border border-violet-100 rounded-2xl p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-violet-600 uppercase tracking-widest">AI Usage Stats</span>
                          <button
                            onClick={() => {
                              aiUtils?.clearAICache?.();
                              toast.success('ล้าง Cache สำเร็จ');
                            }}
                            className="text-xs font-bold bg-violet-100 text-violet-600 px-2 py-1 rounded-lg hover:bg-violet-200 transition-all"
                          >
                            ล้าง Cache
                          </button>
                        </div>
                        {(() => {
                          const stats = aiUtils.getApiStats();
                          return (
                            <div className="grid grid-cols-4 gap-2 text-center">
                              <div className="bg-white rounded-xl p-2">
                                <p className="text-lg font-black text-violet-600">{stats.requestCount}</p>
                                <p className="text-[8px] font-bold text-gray-400 uppercase">Requests</p>
                              </div>
                              <div className="bg-white rounded-xl p-2">
                                <p className="text-lg font-black text-emerald-600">{stats.cacheSize}</p>
                                <p className="text-[8px] font-bold text-gray-400 uppercase">Cached</p>
                              </div>
                              <div className="bg-white rounded-xl p-2">
                                <p className="text-lg font-black text-blue-600">{stats.chatHistoryCount}</p>
                                <p className="text-[8px] font-bold text-gray-400 uppercase">History</p>
                              </div>
                              <div className="bg-white rounded-xl p-2">
                                <p className="text-xs font-black text-gray-600">{stats.lastRequestTime}</p>
                                <p className="text-[8px] font-bold text-gray-400 uppercase">Last Call</p>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* AI Upsell Tracking Stats */}
                    <div className="mt-4 bg-amber-50/50 border border-amber-100 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-amber-600 uppercase tracking-widest flex items-center gap-2">
                          <Target size={14} /> AI Upsell Performance
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={exportUpsellStats}
                            className="text-xs font-bold bg-amber-100 text-amber-600 px-2 py-1 rounded-lg hover:bg-amber-200 transition-all"
                          >
                            Export
                          </button>
                          <button
                            onClick={() => setShowClearUpsellConfirm(true)}
                            className="text-xs font-bold bg-red-50 text-red-500 px-2 py-1 rounded-lg hover:bg-red-100 transition-all"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                      {(() => {
                        const upsellStats = getUpsellStats();
                        return (
                          <>
                            <div className="grid grid-cols-4 gap-2 text-center">
                              <div className="bg-white rounded-xl p-2">
                                <p className="text-lg font-black text-amber-600">{upsellStats.totalShown}</p>
                                <p className="text-[8px] font-bold text-gray-400 uppercase">แสดง</p>
                              </div>
                              <div className="bg-white rounded-xl p-2">
                                <p className="text-lg font-black text-emerald-600">{upsellStats.totalAccepted}</p>
                                <p className="text-[8px] font-bold text-gray-400 uppercase">ยอมรับ</p>
                              </div>
                              <div className="bg-white rounded-xl p-2">
                                <p className="text-lg font-black text-blue-600">{upsellStats.conversionRate}%</p>
                                <p className="text-[8px] font-bold text-gray-400 uppercase">Conversion</p>
                              </div>
                              <div className="bg-white rounded-xl p-2">
                                <p className="text-lg font-black text-violet-600">฿{upsellStats.totalRevenue.toLocaleString()}</p>
                                <p className="text-[8px] font-bold text-gray-400 uppercase">รายได้</p>
                              </div>
                            </div>
                            {upsellStats.topItems.length > 0 && (
                              <div className="mt-2 bg-white rounded-xl p-3">
                                <p className="text-xs font-black text-gray-500 uppercase mb-2">Top Performing Items</p>
                                <div className="space-y-1">
                                  {upsellStats.topItems.slice(0, 3).map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-xs">
                                      <span className="font-bold text-gray-600 truncate">{item.name}</span>
                                      <span className="font-black text-emerald-600">{item.conversionRate}% ({item.accepted}/{item.shown})</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <p className="text-xs text-gray-400 text-center">
                              วันนี้: แสดง {upsellStats.todayShown} | ยอมรับ {upsellStats.todayAccepted} | รายได้ ฿{upsellStats.todayRevenue.toLocaleString()}
                            </p>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
                <button onClick={saveSettings} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.3em] shadow-lg hover:bg-emerald-700 transition-all">
                  บันทึกการตั้งค่า
                </button>
              </>
            )}
          </div>

          </>}

          {/* ==================== TAB: จัดการ ==================== */}
          {activeAdminTab === 'manage' && <>
          {/* Backdated Sales Panel */}
          <div className="bg-white rounded-[3rem] p-8 border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-lg text-gray-800 flex items-center gap-3 uppercase tracking-tighter">
                <History size={22} className="text-blue-500" /> บันทึกยอดขายย้อนหลัง
              </h2>
              <button onClick={() => toggleAdminPanel('backdatedSales')} className="p-2 rounded-2xl bg-gray-100 hover:bg-gray-200 transition-all">
                {adminPanels.backdatedSales ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>
            </div>
            {adminPanels.backdatedSales && (
              <form onSubmit={addBackdatedSale} className="space-y-5">
                <div>
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest">รายการขาย / ชื่อสินค้า</label>
                  <input
                    type="text"
                    required
                    value={backdatedSale.title}
                    onChange={(e) => setBackdatedSale({ ...backdatedSale, title: e.target.value })}
                    className="w-full mt-2 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-black outline-none focus:bg-white transition-all"
                    placeholder="เช่น ยอดขายเงินสด, ชานมไข่มุก..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest">ยอดเงิน (บาท)</label>
                    <input
                      type="number"
                      required
                      value={backdatedSale.amount}
                      onChange={(e) => setBackdatedSale({ ...backdatedSale, amount: e.target.value })}
                      className="w-full mt-2 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-black outline-none"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest">วันที่ขาย</label>
                    <input
                      type="date"
                      required
                      value={backdatedSale.date}
                      onChange={(e) => setBackdatedSale({ ...backdatedSale, date: e.target.value })}
                      className="w-full mt-2 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-black outline-none cursor-pointer"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest">หมายเหตุ (ไม่บังคับ)</label>
                  <input
                    type="text"
                    value={backdatedSale.note}
                    onChange={(e) => setBackdatedSale({ ...backdatedSale, note: e.target.value })}
                    className="w-full mt-2 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-black outline-none"
                    placeholder="รายละเอียดเพิ่มเติม..."
                  />
                </div>
                <button type="submit" className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl active:scale-95 border-b-4 border-blue-800">
                  บันทึกยอดขายย้อนหลัง
                </button>
              </form>
            )}
          </div>

          {/* Bean Modifiers Panel */}
          <div className="bg-white rounded-[3rem] p-8 border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-lg text-gray-800 flex items-center gap-3 uppercase tracking-tighter">
                <Coffee size={22} className="text-amber-500" /> จัดการ #แท็กเมล็ดกาแฟ
              </h2>
              <button onClick={() => toggleAdminPanel('beanModifiers')} className="p-2 rounded-2xl bg-gray-100 hover:bg-gray-200 transition-all">
                {adminPanels.beanModifiers ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>
            </div>
            {adminPanels.beanModifiers && (
              <div className="space-y-5">
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newBeanModifier.name || !newBeanModifier.price) return;
                  await runDbAction(async () => {
                    const col = collection(db, 'artifacts', appId, 'public', 'data', 'beanModifiers');
                    const data = {
                      name: String(newBeanModifier.name).trim(),
                      price: Number(newBeanModifier.price),
                      stockLinks: newBeanModifier.stockLinks || [],
                      updatedAt: serverTimestamp()
                    };
                    if (editingBeanModifierId) {
                      await updateDoc(doc(col, editingBeanModifierId), data);
                    } else {
                      await addDoc(col, { ...data, createdAt: serverTimestamp() });
                    }
                    setNewBeanModifier({ name: '', price: '', stockLinks: [] });
                    setEditingBeanModifierId(null);
                  }, editingBeanModifierId ? 'อัปเดตแท็กไม่สำเร็จ' : 'สร้างแท็กไม่สำเร็จ');
                }} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-widest">ชื่อแท็ก (เช่น คั่วอ่อน)</label>
                      <input
                        type="text"
                        required
                        value={newBeanModifier.name}
                        onChange={(e) => setNewBeanModifier({ ...newBeanModifier, name: e.target.value })}
                        className="w-full mt-2 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-black outline-none"
                        placeholder="คั่วอ่อน"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-widest">ราคาแทนที่ (บาท)</label>
                      <input
                        type="number"
                        required
                        value={newBeanModifier.price}
                        onChange={(e) => setNewBeanModifier({ ...newBeanModifier, price: e.target.value })}
                        className="w-full mt-2 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-black outline-none"
                        placeholder="80"
                      />
                    </div>
                  </div>

                  {/* Bean Stock Linking UI */}
                  <div className="bg-amber-50/50 p-6 rounded-[2rem] border border-amber-100 space-y-4">
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2 text-xs font-black text-amber-600 uppercase tracking-wider"><Link2 size={16} /> ผูกสต็อกของเมล็ดนี้</div>
                      <button type="button" onClick={addBeanStockLink} className="text-amber-600 font-black text-xs bg-white border border-amber-100 px-4 py-2 rounded-xl shadow-sm hover:bg-amber-50 active:scale-95 leading-none flex items-center gap-1"><Plus size={14} /> เพิ่มพัสดุ</button>
                    </div>
                    <div className="space-y-3">
                      {(newBeanModifier.stockLinks || []).map((link, idx) => (
                        <div key={idx} className="bg-white/80 p-5 rounded-[2rem] border border-amber-50 shadow-sm space-y-4 text-gray-800">
                          <div className="flex flex-col gap-2">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">เลือกเมล็ด/วัตถุดิบ</label>
                            <select
                              value={link.stockId}
                              onChange={(e) => updateBeanStockLink(idx, 'stockId', e.target.value)}
                              className="w-full bg-amber-50/20 border border-amber-100 rounded-xl px-4 h-14 text-sm font-black outline-none text-gray-800"
                            >
                              <option value="">เลือกพัสดุ...</option>
                              {stock.map(s => <option key={s.id} value={s.id}>{String(s.name)}</option>)}
                            </select>
                          </div>

                          <div className="flex items-end gap-3">
                            <div className="flex-1 space-y-2">
                              <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">ปริมาณที่หัก</label>
                              <div className="relative flex items-center bg-amber-50/20 rounded-xl px-4 h-14 border border-amber-100">
                                <input
                                  type="number"
                                  step="any"
                                  value={link.usage}
                                  onChange={(e) => updateBeanStockLink(idx, 'usage', e.target.value)}
                                  className="w-full bg-transparent border-none text-left text-lg font-black outline-none text-gray-800"
                                  placeholder="0.00"
                                />
                                <div className="bg-white px-3 py-1.5 rounded-lg border border-amber-100 text-xs font-black text-amber-600 uppercase shadow-sm shrink-0">
                                  {stock.find(s => s.id === link.stockId)?.unit || 'หน่วย'}
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeBeanStockLink(idx)}
                              className="h-14 w-14 bg-red-50 text-red-500 rounded-xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm active:scale-90"
                            >
                              <Trash2 size={20} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {(newBeanModifier.stockLinks || []).length === 0 && (
                        <p className="text-center text-xs text-gray-400 font-bold italic py-2">ยังไม่ได้ผูกสต็อก</p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {editingBeanModifierId && (
                      <button
                        type="button"
                        onClick={() => {
                          setNewBeanModifier({ name: '', price: '', stockLinks: [] });
                          setEditingBeanModifierId(null);
                        }}
                        className="flex-1 bg-gray-100 text-gray-500 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] active:scale-95"
                      >
                        ยกเลิก
                      </button>
                    )}
                    <button type="submit" className={`flex-[2] ${editingBeanModifierId ? 'bg-blue-500 border-blue-700' : 'bg-amber-500 border-amber-700'} text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl active:scale-95 border-b-4`}>
                      {editingBeanModifierId ? 'บันทึกการแก้ไข' : 'เพิ่ม #แท็ก'}
                    </button>
                  </div>
                </form>

                {/* List of existing bean modifiers */}
                <div className="space-y-2 max-h-60 overflow-y-auto pr-2 scrollbar-hide">
                  {beanModifiers.length === 0 ? (
                    <p className="text-center text-xs text-gray-400 font-black uppercase tracking-widest py-4">ยังไม่มีแท็ก</p>
                  ) : (
                    beanModifiers.map(mod => (
                      <div key={mod.id} className="flex items-center justify-between p-4 bg-amber-50 rounded-2xl border border-amber-100">
                        <div className="flex items-center gap-3">
                          <span className="font-black text-amber-700">#{mod.name}</span>
                          <span className="text-sm font-bold text-gray-400">฿{Number(mod.price).toLocaleString()}</span>
                          {(mod.stockLinks || []).length > 0 && (
                            <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100 flex items-center gap-1">
                              <Link2 size={10} /> {(mod.stockLinks || []).length} สต็อก
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              setNewBeanModifier({
                                name: mod.name,
                                price: mod.price,
                                stockLinks: mod.stockLinks || []
                              });
                              setEditingBeanModifierId(mod.id);
                            }}
                            className="text-blue-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-xl transition-all"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => {
                              setBeanToDelete(mod);
                              setShowDeleteBeanConfirm(true);
                            }}
                            className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-xl transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>


          {/* Quick Expenses Panel */}
          <div id="panel-quickExpenses" className="bg-white rounded-[3rem] p-8 border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-lg text-gray-800 flex items-center gap-3 uppercase tracking-tighter">
                <Zap size={22} className="text-red-500" /> จัดการ #คีย์ลัดรายจ่าย
              </h2>
              <button onClick={() => toggleAdminPanel('quickExpenses')} className="p-2 rounded-2xl bg-gray-100 hover:bg-gray-200 transition-all">
                {adminPanels.quickExpenses ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>
            </div>
            {adminPanels.quickExpenses && (
              <div className="space-y-5">
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newQuickExpense.label || !newQuickExpense.title) return;
                  await runDbAction(async () => {
                    const col = collection(db, 'artifacts', appId, 'public', 'data', 'quickExpenses');
                    const data = {
                      label: String(newQuickExpense.label).trim(),
                      title: String(newQuickExpense.title).trim(),
                      amount: newQuickExpense.amount ? Number(newQuickExpense.amount) : '',
                      unit: String(newQuickExpense.unit || ''),
                      category: String(newQuickExpense.category),
                      icon: String(newQuickExpense.icon || '💰'),
                      updatedAt: serverTimestamp()
                    };
                    if (editingQuickExpenseId) {
                      await updateDoc(doc(col, editingQuickExpenseId), data);
                    } else {
                      await addDoc(col, { ...data, createdAt: serverTimestamp() });
                    }
                    setNewQuickExpense({ label: '', title: '', amount: '', unit: '', category: DEFAULT_EXPENSE_CATEGORY, icon: '💰' });
                    setEditingQuickExpenseId(null);
                  }, editingQuickExpenseId ? 'อัปเดตคีย์ลัดไม่สำเร็จ' : 'สร้างคีย์ลัดไม่สำเร็จ');
                }} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-widest">ชื่อปุ่ม (เช่น #ค่าไฟ)</label>
                      <input type="text" required value={newQuickExpense.label} onChange={(e) => setNewQuickExpense({ ...newQuickExpense, label: e.target.value })} className="w-full mt-2 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-black outline-none" placeholder="#ค่าไฟ" />
                    </div>
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-widest">ชื่อที่บันทึก (เช่น ค่าไฟประจำเดือน)</label>
                      <input type="text" required value={newQuickExpense.title} onChange={(e) => setNewQuickExpense({ ...newQuickExpense, title: e.target.value })} className="w-full mt-2 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-black outline-none" placeholder="ค่าไฟ" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-widest">ยอดเงิน (ถ้ามี)</label>
                      <input type="number" value={newQuickExpense.amount} onChange={(e) => setNewQuickExpense({ ...newQuickExpense, amount: e.target.value })} className="w-full mt-2 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-black outline-none" placeholder="ไม่ต้องใส่ถ้าเปลี่ยนทุกวัน" />
                    </div>
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-widest">หน่วย (เช่น บิล, รอบ)</label>
                      <input type="text" value={newQuickExpense.unit} onChange={(e) => setNewQuickExpense({ ...newQuickExpense, unit: e.target.value })} className="w-full mt-2 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-black outline-none" placeholder="บิล" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-widest">ไอคอน</label>
                      <select value={newQuickExpense.icon} onChange={(e) => setNewQuickExpense({ ...newQuickExpense, icon: e.target.value })} className="w-full mt-2 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-black outline-none">
                        <option value="💰">💰 เงิน</option>
                        <option value="🧊">🧊 น้ำแข็ง</option>
                        <option value="💡">💡 ไฟ</option>
                        <option value="💧">💧 น้ำ</option>
                        <option value="🛒">🛒 ของเข้าร้าน</option>
                        <option value="👤">👤 ค่าจ้าง</option>
                        <option value="📦">📦 พัสดุ</option>
                        <option value="🏠">🏠 ค่าเช่า</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-widest">หมวดหมู่</label>
                      <select value={newQuickExpense.category} onChange={(e) => setNewQuickExpense({ ...newQuickExpense, category: e.target.value })} className="w-full mt-2 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-xs font-black outline-none">
                        {EXPENSE_CATEGORIES.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {editingQuickExpenseId && (
                      <button type="button" onClick={() => { setNewQuickExpense({ label: '', title: '', amount: '', unit: '', category: DEFAULT_EXPENSE_CATEGORY, icon: '💰' }); setEditingQuickExpenseId(null); }} className="flex-1 bg-gray-100 text-gray-500 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em]">ยกเลิก</button>
                    )}
                    <button type="submit" className={`flex-[2] ${editingQuickExpenseId ? 'bg-blue-500 border-blue-700' : 'bg-red-500 border-red-700'} text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl border-b-4`}>
                      {editingQuickExpenseId ? 'บันทึกการแก้ไข' : 'เพิ่มคีย์ลัด'}
                    </button>
                  </div>
                </form>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-2 scrollbar-hide">
                  {quickExpenses.length === 0 && (
                    <div className="text-center py-4 space-y-4">
                      <p className="text-xs text-gray-400 font-black uppercase tracking-widest">ยังไม่มีคีย์ลัด</p>
                      <button onClick={async () => {
                        const defaults = [
                          { label: '#ค่าน้ำแข็ง 35.-', title: 'ค่าน้ำแข็ง', amount: 35, unit: 'บิล', category: 'ค่าน้ำแข็ง', icon: '🧊' },
                          { label: '#ค่าไฟ 100.-', title: 'ค่าไฟ', amount: 100, unit: 'รอบ', category: 'ค่าไฟ', icon: '💡' },
                          { label: '#ซื้อของเข้าร้าน', title: 'ซื้อของเข้าร้าน', amount: '', unit: 'รายการ', category: 'วัตถุดิบ', icon: '🛒' }
                        ];
                        await runDbAction(async () => {
                          for (const d of defaults) {
                            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'quickExpenses'), { ...d, createdAt: serverTimestamp() });
                          }
                        }, 'ตั้งค่าเริ่มต้นไม่สำเร็จ');
                      }} className="text-xs font-black text-red-500 border border-red-200 px-4 py-2 rounded-xl hover:bg-red-50">ใช้ค่าเริ่มต้นทางร้าน</button>
                    </div>
                  )}
                  {quickExpenses.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-4 bg-red-50 rounded-2xl border border-red-100">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{item.icon}</span>
                        <div>
                          <p className="font-black text-red-700 text-sm">{item.label}</p>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-tighter">{item.title} | {item.category}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => { setNewQuickExpense(item); setEditingQuickExpenseId(item.id); }} aria-label="แก้ไขรายจ่ายด่วน" className="text-blue-400 hover:text-blue-600 p-2"><Edit size={16} /></button>
                        <button onClick={() => {
                          setQuickExpenseToDelete(item);
                          setShowDeleteQuickExpenseConfirm(true);
                        }} aria-label="ลบรายจ่ายด่วน" className="text-red-400 hover:text-red-600 p-2"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          </>}

          {/* Monthly & Expenses — shown in stats tab */}
          {activeAdminTab === 'stats' && <>
          {/* Monthly Stats Panel */}
          <div className="bg-white rounded-[3rem] p-10 border border-gray-100 shadow-xl relative overflow-hidden border-t-[10px] border-t-emerald-500 shadow-emerald-500/5">
            <div className="flex justify-between items-start mb-8">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-gray-400 mb-2">ภาพรวมผลกำไรรายเดือน</p>
                <h3 className="text-xl font-black text-gray-800 tracking-tight">
                  {new Date(selectedHistoryDate).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <div className="p-3 bg-emerald-50 text-emerald-500 rounded-2xl shadow-sm"><BarChart3 size={28} /></div>
                <button onClick={() => toggleAdminPanel('monthly')} className="p-2 rounded-2xl bg-gray-100 hover:bg-gray-200 transition-all">
                  {adminPanels.monthly ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
              </div>
            </div>
            {adminPanels.monthly && (
              <div className="space-y-6 text-gray-800">
                <div className="flex justify-between items-end border-b border-gray-50 pb-5">
                  <span className="text-gray-400 font-black text-[12px] uppercase tracking-wider">รายรับรวม</span>
                  <span className="text-3xl font-black text-emerald-600 tracking-tighter">฿{monthlyStats.revenue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-end border-b border-gray-50 pb-5">
                  <span className="text-gray-400 font-black text-[12px] uppercase tracking-wider">รายจ่ายรวม</span>
                  <span className="text-2xl font-black text-red-400 tracking-tighter">฿{monthlyStats.cost.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-end pt-6">
                  <span className="text-gray-800 font-black text-[14px] uppercase tracking-[0.2em]">กำไรสุทธิ</span>
                  <span className={`text-4xl font-black tracking-tighter drop-shadow-sm ${monthlyStats.profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    ฿{monthlyStats.profit.toLocaleString()}
                  </span>
                </div>
                <div className="bg-emerald-500/5 p-5 rounded-3xl flex justify-between items-center mt-6 border border-emerald-500/10">
                  <span className="text-xs font-black text-emerald-600 uppercase tracking-widest">จำนวนบิลที่ปิดสำเร็จ:</span>
                  <span className="text-lg font-black text-emerald-700">{monthlyStats.count} <small className="text-xs opacity-60">บิล</small></span>
                </div>
              </div>
            )}
          </div>

          {/* Daily Expenses Panel */}
          <div className="bg-white rounded-[3rem] p-10 border border-gray-100 shadow-sm space-y-8 text-gray-800">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-xl text-gray-800 flex items-center gap-3 uppercase tracking-tighter"><DollarSign size={24} className="text-red-500" /> บันทึกรายจ่ายรายวัน</h2>
              <button onClick={() => toggleAdminPanel('expenses')} className="p-2 rounded-2xl bg-gray-100 hover:bg-gray-200 transition-all">
                {adminPanels.expenses ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>
            </div>
            {adminPanels.expenses && (
              <>
                <form onSubmit={addExpense} className="space-y-5 text-gray-800">
                  <input type="text" placeholder="บันทึกรายจ่ายวันนี้..." required value={newExpense.title} onChange={e => setNewExpense({ ...newExpense, title: e.target.value })} className="w-full bg-gray-50 border border-gray-100 rounded-[1.5rem] p-5 text-sm font-black outline-none shadow-inner focus:bg-white transition-all" />
                  <div className="grid grid-cols-2 gap-5"><input type="number" placeholder="จำนวนเงิน..." required value={newExpense.amount} onChange={e => setNewExpense({ ...newExpense, amount: e.target.value })} className="w-full bg-gray-50 border border-gray-100 rounded-[1.5rem] p-5 text-sm font-black outline-none shadow-inner" /><select value={newExpense.category} onChange={e => setNewExpense({ ...newExpense, category: e.target.value })} className="w-full bg-gray-50 border border-gray-100 rounded-[1.5rem] p-5 text-xs font-black outline-none shadow-inner cursor-pointer text-gray-800">{EXPENSE_CATEGORIES.map(cat => (<option key={cat} value={cat}>{cat}</option>))}</select></div>
                  <button type="submit" className="w-full bg-gray-800 text-white py-6 rounded-[2rem] font-black text-xs uppercase shadow-xl active:scale-95 tracking-[0.2em] border-b-4 border-gray-950">บันทึกรายจ่าย</button>
                </form>
                <div className="space-y-3 max-h-56 overflow-y-auto scrollbar-hide border-t border-gray-50 pt-6 text-gray-800">
                  {expenses.filter(e => e.date === selectedHistoryDate).length === 0 && (
                    <p className="text-center text-xs text-gray-400 font-black uppercase tracking-widest py-4">ไม่มีข้อมูลรายจ่ายวันนี้</p>
                  )}
                  {expenses.filter(e => e.date === selectedHistoryDate).map(e => (
                    <div key={e.id} className="flex justify-between items-center p-4 bg-red-50/40 rounded-2xl border border-red-100/50 text-xs font-black">
                      <span className="text-gray-700">{String(e.title)}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-red-500 font-black text-sm">฿{Number(e.amount).toLocaleString()}</span>
                        <button onClick={async () => {
                          await runDbAction(async () => {
                            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'expenses', e.id));
                          }, 'ลบค่าใช้จ่ายไม่สำเร็จ');
                        }} className="text-gray-300 hover:text-red-500 transition-colors active:scale-90"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          </>}

        </div>

        {/* Right Panel - Store Management */}
        {(activeAdminTab === 'manage' || activeAdminTab === 'stats') && (
        <div className={`${activeAdminTab === 'stats' ? 'hidden lg:flex' : 'flex'} flex-1 bg-white rounded-2xl md:rounded-[3rem] lg:rounded-[3.5rem] shadow-xl border border-gray-100 flex-col p-4 md:p-6 lg:p-10 space-y-4 md:space-y-6 lg:space-y-8 text-gray-800 shadow-emerald-500/5`}>
          <h2 className="font-black text-lg md:text-xl lg:text-2xl text-gray-800 uppercase tracking-tighter font-black px-2 leading-none">Store Management</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-2 gap-3 md:gap-4 lg:gap-6 flex-1 overflow-y-auto pr-2 scrollbar-hide text-gray-800">
            <button onClick={() => setView('merchant')} className="p-4 md:p-6 lg:p-10 bg-orange-50 rounded-2xl md:rounded-[2rem] lg:rounded-[3rem] border-2 border-orange-100 text-orange-600 flex flex-col items-center justify-center gap-3 md:gap-4 lg:gap-6 hover:shadow-2xl transition-all shadow-md active:scale-95"><ChefHat size={32} className="md:w-12 md:h-12 lg:w-[60px] lg:h-[60px]" /><span className="font-black text-xs md:text-xs uppercase tracking-[0.2em] md:tracking-[0.3em] leading-none">จอภาพครัว</span></button>
            <button onClick={() => setView('bills')} className="p-4 md:p-6 lg:p-10 bg-blue-50 rounded-2xl md:rounded-[2rem] lg:rounded-[3rem] border-2 border-blue-100 text-blue-600 flex flex-col items-center justify-center gap-3 md:gap-4 lg:gap-6 hover:shadow-2xl transition-all shadow-md active:scale-95"><FileText size={32} className="md:w-12 md:h-12 lg:w-[60px] lg:h-[60px]" /><span className="font-black text-xs md:text-xs uppercase tracking-[0.2em] md:tracking-[0.3em] leading-none">ประวัติบิล</span></button>
            <button onClick={() => setView('stock')} className="p-4 md:p-6 lg:p-10 bg-emerald-50 rounded-2xl md:rounded-[2rem] lg:rounded-[3rem] border-2 border-emerald-100 text-emerald-600 flex flex-col items-center justify-center gap-3 md:gap-4 lg:gap-6 hover:shadow-2xl transition-all shadow-md active:scale-95"><Package size={32} className="md:w-12 md:h-12 lg:w-[60px] lg:h-[60px]" /><span className="font-black text-xs md:text-xs uppercase tracking-[0.2em] md:tracking-[0.3em] leading-none">คลังสต็อก</span></button>
            <button onClick={() => setShowExportConfirm(true)} className="p-4 md:p-6 lg:p-10 bg-green-50 rounded-2xl md:rounded-[2rem] lg:rounded-[3rem] border-2 border-green-100 text-green-600 flex flex-col items-center justify-center gap-3 md:gap-4 lg:gap-6 hover:shadow-2xl transition-all shadow-md active:scale-95"><Download size={32} className="md:w-12 md:h-12 lg:w-[60px] lg:h-[60px]" /><span className="font-black text-xs md:text-xs uppercase tracking-[0.2em] md:tracking-[0.3em] leading-none">Excel Report</span></button>
            <button onClick={() => {
              const backupData = {
                timestamp: new Date().toISOString(),
                appId,
                data: { menu, stock, orders, expenses, members, beanModifiers, quickExpenses, dynamicCategories }
              };
              const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `POS_Backup_${new Date().toISOString().slice(0, 10)}.json`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }} className="p-4 md:p-6 lg:p-10 bg-indigo-50 rounded-2xl md:rounded-[2rem] lg:rounded-[3rem] border-2 border-indigo-100 text-indigo-600 flex flex-col items-center justify-center gap-3 md:gap-4 lg:gap-6 hover:shadow-2xl transition-all shadow-md active:scale-95"><Save size={32} className="md:w-12 md:h-12 lg:w-[60px] lg:h-[60px]" /><span className="font-black text-xs md:text-xs uppercase tracking-[0.2em] md:tracking-[0.3em] leading-none">Backup JSON</span></button>
            <button onClick={() => setShowResetConfirm(true)} className="p-4 md:p-6 lg:p-10 bg-red-50 rounded-2xl md:rounded-[2rem] lg:rounded-[3rem] border-2 border-red-100 text-red-600 flex flex-col items-center justify-center gap-3 md:gap-4 lg:gap-6 hover:shadow-2xl transition-all active:scale-95 leading-none"><RefreshCcw size={32} className="md:w-12 md:h-12 lg:w-[60px] lg:h-[60px]" /><span className="font-black text-xs md:text-xs uppercase tracking-[0.2em] md:tracking-[0.3em] leading-none">ล้างคิวใหม่</span></button>
            <button onClick={() => setShowSeedConfirm(true)} className="p-4 md:p-6 lg:p-10 bg-gray-50 rounded-2xl md:rounded-[2rem] lg:rounded-[3rem] border-2 border-gray-100 text-gray-400 flex flex-col items-center justify-center gap-3 md:gap-4 lg:gap-6 hover:shadow-2xl transition-all active:scale-95 hover:bg-white hover:text-emerald-500 hover:border-emerald-200 col-span-2 md:col-span-1"><Banknote size={32} className="md:w-12 md:h-12 lg:w-[60px] lg:h-[60px]" /><span className="font-black text-xs md:text-xs uppercase tracking-[0.2em] md:tracking-[0.3em] leading-none">กู้คืนข้อมูลเริ่มต้น</span></button>
          </div>
        </div>
        )}
      </div>

      {/* Reset Session Confirm Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/80 backdrop-blur-3xl p-4 md:p-6 animate-in fade-in text-center text-gray-900 leading-none">
          <div className="bg-white rounded-2xl md:rounded-[3rem] lg:rounded-[4rem] p-6 md:p-10 lg:p-16 max-w-xl w-full shadow-2xl border border-white/10 leading-none">
            <div className="w-16 h-16 md:w-20 md:h-20 lg:w-28 lg:h-28 bg-red-50 rounded-full mx-auto flex items-center justify-center text-red-500 mb-6 md:mb-8 lg:mb-10 shadow-inner animate-pulse leading-none"><RefreshCcw size={32} className="md:w-12 md:h-12 lg:w-16 lg:h-16" strokeWidth={2.5} /></div>
            <h3 className="font-black text-2xl md:text-3xl lg:text-4xl mb-3 md:mb-4 lg:mb-5 tracking-tighter uppercase leading-none">เริ่มรอบวันใหม่?</h3>
            <p className="text-gray-400 font-bold mb-8 md:mb-12 lg:mb-16 leading-relaxed px-2 md:px-4 lg:px-6 text-sm md:text-base leading-none">ออเดอร์ค้างจะถูกลบและคิวจะกลับไปที่ #1 <br /><span className="text-emerald-500 font-black uppercase text-xs md:text-xs mt-2 md:mt-3 block leading-none">(ข้อมูลประวัติขายและสต็อกจะไม่หายไป)</span></p>
            <div className="grid grid-cols-2 gap-3 md:gap-4 lg:gap-6 leading-none">
              <button onClick={() => setShowResetConfirm(false)} className="py-4 md:py-6 lg:py-8 bg-gray-100 rounded-xl md:rounded-2xl lg:rounded-[2rem] font-black uppercase text-xs md:text-sm tracking-widest text-gray-400 active:scale-95 transition-all leading-none">ย้อนกลับ</button>
              <button onClick={executeResetSession} className="py-4 md:py-6 lg:py-8 bg-red-600 text-white rounded-xl md:rounded-2xl lg:rounded-[2rem] font-black uppercase text-xs md:text-sm tracking-widest shadow-2xl transition-all border-b-4 md:border-b-8 border-red-800 active:scale-95 transition-all leading-none">ตกลง เริ่มใหม่</button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Upsell Stats Confirm Modal */}
      <ConfirmModal
        isOpen={showClearUpsellConfirm}
        onClose={() => setShowClearUpsellConfirm(false)}
        onConfirm={handleClearUpsellStats}
        title="ล้างสถิติ Upsell"
        message="ต้องการล้างสถิติ AI Upsell ทั้งหมดใช่หรือไม่?"
        confirmText="ล้าง"
        cancelText="ยกเลิก"
        variant="danger"
      />

      {/* Delete Bean Modifier Confirm Modal */}
      <ConfirmModal
        isOpen={showDeleteBeanConfirm}
        onClose={() => { setShowDeleteBeanConfirm(false); setBeanToDelete(null); }}
        onConfirm={handleDeleteBeanModifier}
        title="ลบแท็กกาแฟ"
        message={`ต้องการลบแท็ก #${beanToDelete?.name || ''} ใช่หรือไม่?`}
        confirmText="ลบ"
        cancelText="ยกเลิก"
        variant="danger"
      />

      {/* Delete Quick Expense Confirm Modal */}
      <ConfirmModal
        isOpen={showDeleteQuickExpenseConfirm}
        onClose={() => { setShowDeleteQuickExpenseConfirm(false); setQuickExpenseToDelete(null); }}
        onConfirm={handleDeleteQuickExpense}
        title="ลบคีย์ลัดรายจ่าย"
        message={`ต้องการลบคีย์ลัด ${quickExpenseToDelete?.label || ''} ใช่หรือไม่?`}
        confirmText="ลบ"
        cancelText="ยกเลิก"
        variant="danger"
      />

      {/* Export Excel Confirm Modal */}
      <ConfirmModal
        isOpen={showExportConfirm}
        onClose={() => setShowExportConfirm(false)}
        onConfirm={handleExportExcel}
        title="ส่งออก Excel"
        message="ต้องการส่งออกรายงานเป็นไฟล์ Excel ใช่หรือไม่?"
        confirmText="ส่งออก"
        cancelText="ยกเลิก"
        variant="primary"
      />

      {/* Seed Database Confirm Modal */}
      <ConfirmModal
        isOpen={showSeedConfirm}
        onClose={() => setShowSeedConfirm(false)}
        onConfirm={handleSeedDatabase}
        title="กู้คืนข้อมูลเริ่มต้น"
        message="ต้องการกู้คืนข้อมูลเริ่มต้น (เมนู, สต็อก) ใช่หรือไม่? ข้อมูลเก่าจะไม่หาย แต่จะมีข้อมูลใหม่เพิ่มเข้ามา"
        confirmText="กู้คืน"
        cancelText="ยกเลิก"
        variant="warning"
      />
    </div>
  );
}
