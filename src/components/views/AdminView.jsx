import { useEffect, useMemo, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import { doc, collection, addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { useConfigContext, useDataContext, useUIContext } from '../../context/AppContext';
import { useNavigate, useRouteParams } from '../../navigation';
import { getISODate, getOrderDate } from '../../utils/calculations';
import { seedDatabase } from '../../utils/seedData';
import { recomputeAllSoldCounts } from '../../utils/menuSales';
import { queueDayKey } from '../../utils/queueDay';
import { clearUpsellStats, exportUpsellStats } from '../../services/upsellTracker';
import { ConfirmModal, PageHeader, useMediaQuery, useToast } from '../ui';
import { DEFAULT_EXPENSE_CATEGORY, STOCK_CATEGORIES, getStockCategory } from '../../config/constants';
import { DEFAULT_SETTINGS_TAB, normalizeSettingsTab, tabByKey } from './settings/tabs';
import { buildSettingsPayload, draftFromConfig, modifierLinkHealth } from './settings/settingsModel';
import { exportToExcel, downloadBackupJson } from './settings/exportData';
import SettingsNav from './settings/SettingsNav';
import CloseDayTab from './settings/CloseDayTab';
import ShopTab from './settings/ShopTab';
import PromotionsTab from './settings/PromotionsTab';
import ModifiersTab from './settings/ModifiersTab';
import ModifierSheet from './settings/ModifierSheet';
import MilkSwapCard from './settings/MilkSwapCard';
import QuickExpensesTab, { QuickExpenseSheet } from './settings/QuickExpensesTab';
import PointsTab from './settings/PointsTab';
import SecurityTab from './settings/SecurityTab';
import QrTab from './settings/QrTab';
import DataTab from './settings/DataTab';

const EMPTY_BEAN = { name: '', price: '', stockLinks: [], isDefault: false, group: 'เมล็ดกาแฟ' };
const EMPTY_QUICK = { label: '', title: '', amount: '', unit: '', category: DEFAULT_EXPENSE_CATEGORY, icon: '💰' };

// Draft fields each tab edits · drives the "ยังไม่บันทึก" hint only
// (saving still writes the whole config/settings payload, as before).
const TAB_FIELDS = {
  close: ['startingCash'],
  shop: ['shopName', 'shopAddress', 'shopPhone', 'taxId', 'receiptFooter', 'receiptPaperWidth', 'geminiApiKey'],
  promotions: ['cakeSaleEnabled', 'cakeSaleCategories', 'cakeSalePercent', 'cakeSaleStart', 'cakeSaleEnd', 'comboEnabled', 'comboPercent', 'spendThreshold', 'spendDiscount', 'ownGlassDiscount', 'reviewUrl'],
  points: ['redeemPointsThreshold', 'redeemDiscountValue', 'pointsExpiryMonths', 'pointsRewardsEnabled', 'pointsRewards'],
  security: ['adminPin'],
};
const same = (a, b) => (typeof a === 'object' || typeof b === 'object' ? JSON.stringify(a) === JSON.stringify(b) : String(a ?? '') === String(b ?? ''));

function StatusPill({ label, on, onClick, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="inline-flex items-center gap-2 min-h-11 px-3 rounded-full bg-[var(--bg-sunken)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)]"
    >
      <span aria-hidden="true" className={`w-2 h-2 rounded-full ${on ? 'bg-[var(--state-ok)]' : 'bg-[var(--text-muted)]'}`} />
      {label} {on ? 'เปิด' : 'ปิด'}
    </button>
  );
}

export default function AdminView() {
  const { orders, expenses, stock, members, menu, dynamicCategories, beanModifiers, quickExpenses } = useDataContext();
  const {
    vatEnabled, pinEnabled, adminPin, redeemPointsThreshold, pointsExpiryMonths, redeemDiscountValue, ownGlassDiscount,
    geminiApiKey, startingCash, reviewUrl, shopName, shopAddress, shopPhone, taxId, receiptFooter, receiptPaperWidth,
    cakeSaleEnabled, cakeSaleCategories, cakeSalePercent, cakeSaleStart, cakeSaleEnd, comboEnabled, comboPercent,
    spendThreshold, spendDiscount, pointsRewardsEnabled, pointsRewards, milkSwapSetting,
  } = useConfigContext();
  const { adminTab, setAdminTab, runDbAction, aiUtils, lockApp } = useUIContext();
  const params = useRouteParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isPhone = useMediaQuery('(max-width: 767px)');
  const scrollRef = useRef(null);

  // ── Tab = URL (`#/settings/<tab>`) ───────────────────────────────────────
  const routeTab = normalizeSettingsTab(params.tab);
  const activeTab = routeTab || (isPhone ? null : DEFAULT_SETTINGS_TAB);
  const selectTab = (key) => navigate('admin', { tab: key });

  useEffect(() => {
    // Old names / aliases (`#/settings/settings`, `beanModifiers`…) → canonical URL.
    if (params.tab && routeTab && params.tab !== routeTab) navigate('admin', { tab: routeTab }, { replace: true });
  }, [params.tab, routeTab, navigate]);

  useEffect(() => {
    // Legacy deep link through the UI context (ExpensesView → "จัดการปุ่มลัด").
    if (!adminTab) return;
    const key = normalizeSettingsTab(adminTab);
    if (key) navigate('admin', { tab: key }, { replace: true });
    setAdminTab(null);
  }, [adminTab, setAdminTab, navigate]);

  useEffect(() => { scrollRef.current?.scrollTo?.({ top: 0 }); }, [activeTab]);

  // ── Settings draft ───────────────────────────────────────────────────────
  const baseline = useMemo(() => draftFromConfig({
    adminPin, redeemPointsThreshold, pointsExpiryMonths, redeemDiscountValue, ownGlassDiscount, geminiApiKey, startingCash,
    reviewUrl, shopName, shopAddress, shopPhone, taxId, receiptFooter, receiptPaperWidth, cakeSaleEnabled, cakeSaleCategories,
    cakeSalePercent, cakeSaleStart, cakeSaleEnd, comboEnabled, comboPercent, spendThreshold, spendDiscount,
    pointsRewardsEnabled, pointsRewards,
  }), [adminPin, redeemPointsThreshold, pointsExpiryMonths, redeemDiscountValue, ownGlassDiscount, geminiApiKey, startingCash,
    reviewUrl, shopName, shopAddress, shopPhone, taxId, receiptFooter, receiptPaperWidth, cakeSaleEnabled, cakeSaleCategories,
    cakeSalePercent, cakeSaleStart, cakeSaleEnd, comboEnabled, comboPercent, spendThreshold, spendDiscount,
    pointsRewardsEnabled, pointsRewards]);
  const [settingsDraft, setSettingsDraft] = useState(baseline);
  const [draftBase, setDraftBase] = useState(baseline);
  if (draftBase !== baseline) { // saved / changed elsewhere → re-sync (as the old effect did)
    setDraftBase(baseline);
    setSettingsDraft(baseline);
  }
  const patch = (change) => setSettingsDraft((prev) => ({ ...prev, ...change }));
  const dirtyFor = (tab) => (TAB_FIELDS[tab] || []).some((f) => !same(settingsDraft[f], baseline[f]));

  // ── Local states ─────────────────────────────────────────────────────────
  const [selectedHistoryDate, setSelectedHistoryDate] = useState(getISODate());
  const [backdatedSale, setBackdatedSale] = useState({ title: '', amount: '', date: getISODate(), note: '' });
  const [newBeanModifier, setNewBeanModifier] = useState(EMPTY_BEAN);
  const [editingBeanModifierId, setEditingBeanModifierId] = useState(null);
  const [modifierSheetOpen, setModifierSheetOpen] = useState(false);
  const [newQuickExpense, setNewQuickExpense] = useState(EMPTY_QUICK);
  const [editingQuickExpenseId, setEditingQuickExpenseId] = useState(null);
  const [quickSheetOpen, setQuickSheetOpen] = useState(false);
  const [newExpense, setNewExpense] = useState({ title: '', amount: '', category: DEFAULT_EXPENSE_CATEGORY });
  const [isBackfilling, setIsBackfilling] = useState(false);

  // Confirmation modal states
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showClearUpsellConfirm, setShowClearUpsellConfirm] = useState(false);
  const [showDeleteBeanConfirm, setShowDeleteBeanConfirm] = useState(false);
  const [beanToDelete, setBeanToDelete] = useState(null);
  const [showDeleteQuickExpenseConfirm, setShowDeleteQuickExpenseConfirm] = useState(false);
  const [quickExpenseToDelete, setQuickExpenseToDelete] = useState(null);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [showSeedConfirm, setShowSeedConfirm] = useState(false);

  // ── Memos ────────────────────────────────────────────────────────────────
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
    return { revenue, cost, profit: revenue - cost, count: monthOrders.length };
  }, [orders, expenses, selectedHistoryDate]);

  const dayExpenses = useMemo(() => expenses.filter(e => e.date === selectedHistoryDate), [expenses, selectedHistoryDate]);
  const dailyNetStats = useMemo(() => {
    const revenue = statsForSelectedDate.revenue;
    const cost = dayExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    return { revenue, cost, profit: revenue - cost };
  }, [statsForSelectedDate.revenue, dayExpenses]);

  // Unpaid bills on the selected day (same rule as the nav badge) · display only.
  const unpaid = useMemo(() => {
    let count = 0;
    let total = 0;
    for (const o of orders) {
      if (!o.isPaid && o.status !== 'cancelled' && getOrderDate(o) === selectedHistoryDate) {
        count += 1;
        total += Number(o.total) || 0;
      }
    }
    return { count, total };
  }, [orders, selectedHistoryDate]);

  const modifierHealth = useMemo(() => modifierLinkHealth(beanModifiers, stock), [beanModifiers, stock]);
  const brokenModifierCount = useMemo(() => [...modifierHealth.values()].filter(h => h.broken).length, [modifierHealth]);
  const stockById = useMemo(() => new Map(stock.map(s => [s.id, s])), [stock]);
  const stockLinkGroups = useMemo(() => {
    const categoryOrder = new Map(STOCK_CATEGORIES.map((category, index) => [category, index]));
    const groups = new Map();
    stock.forEach(item => {
      const category = getStockCategory(item);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(item);
    });
    return [...groups.entries()]
      .sort(([a], [b]) => (categoryOrder.get(a) ?? STOCK_CATEGORIES.length) - (categoryOrder.get(b) ?? STOCK_CATEGORIES.length))
      .map(([category, items]) => [category, items.sort((a, b) => String(a.name).localeCompare(String(b.name), 'th'))]);
  }, [stock]);
  const modifierGroups = useMemo(() => [...new Set((beanModifiers || []).map(b => b.group || 'เมล็ดกาแฟ'))], [beanModifiers]);

  // ── Handlers (Firestore writes unchanged) ────────────────────────────────
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
      toast.success('บันทึกยอดขายย้อนหลังแล้ว');
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

  const deleteExpense = async (expense) => {
    await runDbAction(async () => {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'expenses', expense.id));
    }, 'ลบค่าใช้จ่ายไม่สำเร็จ');
  };

  const executeResetSession = async () => {
    setShowResetConfirm(false);
    await runDbAction(async () => {
      const pendingOrders = orders.filter(o => o.status !== 'completed' && getOrderDate(o) === getISODate());
      for (const order of pendingOrders) { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', order.id)); }
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'queue'), { current: 1, day: queueDayKey() }, { merge: true });
    }, 'ล้างออเดอร์ไม่สำเร็จ');
  };

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
    exportToExcel({ orders, expenses, members, stock, menu, toast });
  };

  const handleBackupJson = () => downloadBackupJson({
    appId,
    data: { menu, stock, orders, expenses, members, beanModifiers, quickExpenses, dynamicCategories },
  });

  const handleSeedDatabase = async () => {
    setShowSeedConfirm(false);
    const ok = await runDbAction(async () => {
      await seedDatabase(db, appId);
    }, 'กู้คืนข้อมูลไม่สำเร็จ');
    if (ok) toast.success('กู้คืนข้อมูลเริ่มต้นสำเร็จ');
  };

  // Backfill best-seller counter from full order history
  const handleBackfillSoldCount = async () => {
    setIsBackfilling(true);
    try {
      const { updated, total } = await recomputeAllSoldCounts(menu, orders);
      toast.success(`คำนวณยอดขายย้อนหลังสำเร็จ (${updated}/${total} เมนู)`);
    } catch (e) {
      toast.error('คำนวณไม่สำเร็จ: ' + e.message);
    } finally {
      setIsBackfilling(false);
    }
  };

  // Bean modifier stock link handlers
  const addBeanStockLink = () => setNewBeanModifier(p => ({ ...p, stockLinks: [...(p.stockLinks || []), { stockId: '', usage: 1 }] }));
  const removeBeanStockLink = (i) => setNewBeanModifier(p => ({ ...p, stockLinks: p.stockLinks.filter((_, idx) => idx !== i) }));
  const updateBeanStockLink = (i, f, v) => setNewBeanModifier(p => {
    const next = [...(p.stockLinks || [])];
    next[i] = { ...next[i], [f]: v };
    return { ...p, stockLinks: next };
  });

  const openNewModifier = () => {
    setNewBeanModifier(EMPTY_BEAN);
    setEditingBeanModifierId(null);
    setModifierSheetOpen(true);
  };
  const openEditModifier = (mod) => {
    setNewBeanModifier({
      name: mod.name,
      price: mod.price,
      stockLinks: mod.stockLinks || [],
      isDefault: mod.isDefault === true,
      group: mod.group || 'เมล็ดกาแฟ'
    });
    setEditingBeanModifierId(mod.id);
    setModifierSheetOpen(true);
  };
  const saveBeanModifier = async (e) => {
    e.preventDefault();
    if (!newBeanModifier.name || !newBeanModifier.price) return;
    await runDbAction(async () => {
      const col = collection(db, 'artifacts', appId, 'public', 'data', 'beanModifiers');
      const data = {
        name: String(newBeanModifier.name).trim(),
        price: Number(newBeanModifier.price),
        stockLinks: newBeanModifier.stockLinks || [],
        isDefault: newBeanModifier.isDefault === true,
        group: String(newBeanModifier.group || 'เมล็ดกาแฟ').trim() || 'เมล็ดกาแฟ',
        updatedAt: serverTimestamp()
      };
      if (editingBeanModifierId) {
        await updateDoc(doc(col, editingBeanModifierId), data);
      } else {
        await addDoc(col, { ...data, createdAt: serverTimestamp() });
      }
      setNewBeanModifier(EMPTY_BEAN);
      setEditingBeanModifierId(null);
      setModifierSheetOpen(false);
    }, editingBeanModifierId ? 'อัปเดตแท็กไม่สำเร็จ' : 'สร้างแท็กไม่สำเร็จ');
  };
  const toggleModifierAvailable = (mod) => runDbAction(async () => {
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'beanModifiers', mod.id), { available: mod.available === false });
  }, 'อัปเดตการแสดงผลไม่สำเร็จ');

  const openNewQuick = () => {
    setNewQuickExpense(EMPTY_QUICK);
    setEditingQuickExpenseId(null);
    setQuickSheetOpen(true);
  };
  const openEditQuick = (item) => {
    setNewQuickExpense(item);
    setEditingQuickExpenseId(item.id);
    setQuickSheetOpen(true);
  };
  const saveQuickExpense = async (e) => {
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
      setNewQuickExpense(EMPTY_QUICK);
      setEditingQuickExpenseId(null);
      setQuickSheetOpen(false);
    }, editingQuickExpenseId ? 'อัปเดตคีย์ลัดไม่สำเร็จ' : 'สร้างคีย์ลัดไม่สำเร็จ');
  };
  const useDefaultQuickExpenses = async () => {
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
  };

  const saveSettings = async (e) => {
    if (e) e.preventDefault();
    await runDbAction(async () => {
      await setDoc(
        doc(db, 'artifacts', appId, 'public', 'data', 'config', 'settings'),
        buildSettingsPayload(settingsDraft, { serverTimestamp }),
        { merge: true }
      );
      toast.success('บันทึกการตั้งค่าเรียบร้อยแล้ว');
    }, 'บันทึกการตั้งค่าไม่สำเร็จ');
  };

  // นมโอ๊ตตัดแทนนมวัว · เขียนเฉพาะฟิลด์ milkSwap (ไม่ผ่าน draft ของแท็บอื่น)
  const saveMilkSwap = (milkSwap) => runDbAction(async () => {
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'settings'), { milkSwap }, { merge: true });
    toast.success('บันทึกการตัดนมโอ๊ตแล้ว');
  }, 'บันทึกการตัดนมโอ๊ตไม่สำเร็จ');

  const handleTestAI = async () => {
    const key = settingsDraft.geminiApiKey;
    if (!key) {
      toast.warning('กรุณากรอก API Key ก่อนทดสอบ');
      return;
    }
    // Test the key typed in the input (not the saved one)
    try {
      const model = 'gemini-2.5-flash-lite';
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Hello' }] }] })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      toast.success('การเชื่อมต่อ AI สำเร็จ!');
    } catch (err) {
      toast.error('การเชื่อมต่อล้มเหลว: ' + err.message);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const draftProps = (tab) => ({ draft: settingsDraft, patch, dirty: dirtyFor(tab), onSave: saveSettings });

  const renderTab = () => {
    switch (activeTab) {
      case 'close':
        return (
          <CloseDayTab
            date={selectedHistoryDate}
            onDate={setSelectedHistoryDate}
            daily={dailyNetStats}
            dayCount={statsForSelectedDate.count}
            monthly={monthlyStats}
            unpaid={unpaid}
            startingCash={Number(startingCash) || 0}
            dayExpenses={dayExpenses}
            newExpense={newExpense}
            onNewExpense={setNewExpense}
            onAddExpense={addExpense}
            onDeleteExpense={deleteExpense}
            {...draftProps('close')}
          />
        );
      case 'shop':
        return (
          <ShopTab
            {...draftProps('shop')}
            vatEnabled={!!vatEnabled}
            onToggleVat={toggleVatSystem}
            aiUtils={aiUtils}
            onTestAI={handleTestAI}
            onClearAICache={() => { aiUtils?.clearAICache?.(); toast.success('ล้าง Cache สำเร็จ'); }}
            onExportUpsell={exportUpsellStats}
            onResetUpsell={() => setShowClearUpsellConfirm(true)}
          />
        );
      case 'promotions':
        return <PromotionsTab {...draftProps('promotions')} dynamicCategories={dynamicCategories} />;
      case 'modifiers':
        return (
          <div className="flex flex-col gap-4">
            <MilkSwapCard stock={stock} setting={milkSwapSetting} onSave={saveMilkSwap} />
            <ModifiersTab
              beanModifiers={beanModifiers}
              health={modifierHealth}
              onAdd={openNewModifier}
              onEdit={openEditModifier}
              onDelete={(mod) => { setBeanToDelete(mod); setShowDeleteBeanConfirm(true); }}
              onToggleAvailable={toggleModifierAvailable}
            />
          </div>
        );
      case 'quick':
        return (
          <QuickExpensesTab
            quickExpenses={quickExpenses}
            onAdd={openNewQuick}
            onEdit={openEditQuick}
            onDelete={(item) => { setQuickExpenseToDelete(item); setShowDeleteQuickExpenseConfirm(true); }}
            onUseDefaults={useDefaultQuickExpenses}
          />
        );
      case 'points':
        return <PointsTab {...draftProps('points')} />;
      case 'security':
        return (
          <SecurityTab
            {...draftProps('security')}
            pinEnabled={!!pinEnabled}
            onTogglePin={togglePinSecurity}
            onLockDevice={lockApp ? () => { lockApp(); toast.success('ล็อกและลืมอุปกรณ์นี้แล้ว'); } : undefined}
          />
        );
      case 'qr':
        return <QrTab />;
      case 'data':
        return (
          <DataTab
            onExportExcel={() => setShowExportConfirm(true)}
            onBackupJson={handleBackupJson}
            onBackfill={handleBackfillSoldCount}
            isBackfilling={isBackfilling}
            backdatedSale={backdatedSale}
            onBackdatedSale={setBackdatedSale}
            onSubmitBackdated={addBackdatedSale}
            onResetQueue={() => setShowResetConfirm(true)}
            onSeed={() => setShowSeedConfirm(true)}
          />
        );
      default:
        return null;
    }
  };

  const tabInfo = tabByKey(activeTab);
  const navBadges = { modifiers: brokenModifierCount };
  const statusPills = (
    <>
      <StatusPill label="VAT" on={!!vatEnabled} onClick={() => selectTab('shop')} ariaLabel={`VAT ${vatEnabled ? 'เปิด' : 'ปิด'}อยู่ · ไปที่ร้านและใบเสร็จ`} />
      <StatusPill label="PIN" on={!!pinEnabled} onClick={() => selectTab('security')} ariaLabel={`PIN ${pinEnabled ? 'เปิด' : 'ปิด'}อยู่ · ไปที่ความปลอดภัย`} />
    </>
  );

  return (
    <div className="h-full bg-[var(--bg-canvas)] flex flex-col overflow-hidden text-[var(--text-primary)]">
      <PageHeader
        title={isPhone && tabInfo ? tabInfo.label : 'ตั้งค่าร้าน'}
        subtitle={isPhone && tabInfo ? tabInfo.hint : undefined}
        icon={isPhone && tabInfo ? tabInfo.icon : Settings}
        back={isPhone && tabInfo ? { label: 'ตั้งค่าร้าน', onClick: () => navigate('admin', {}) } : undefined}
        sticky={false}
        actions={isPhone && tabInfo ? undefined : statusPills}
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-[var(--page-pad)] py-5 md:py-6 pb-10">
        <div className="max-w-[1400px] mx-auto">
          {isPhone ? (
            activeTab ? renderTab() : <SettingsNav variant="list" onSelect={selectTab} badges={navBadges} />
          ) : (
            <div className="grid grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)] gap-6 items-start">
              <SettingsNav active={activeTab} onSelect={selectTab} badges={navBadges} />
              <div className="min-w-0 flex flex-col gap-4">
                <div>
                  <h2 className="text-[length:var(--fs-xl)] leading-[var(--lh-xl)] font-semibold text-[var(--text-primary)]">{tabInfo?.label}</h2>
                  <p className="text-sm text-[var(--text-muted)]">{tabInfo?.hint}</p>
                </div>
                {renderTab()}
              </div>
            </div>
          )}
        </div>
      </div>

      <ModifierSheet
        open={modifierSheetOpen}
        onClose={() => setModifierSheetOpen(false)}
        editing={!!editingBeanModifierId}
        value={newBeanModifier}
        onChange={setNewBeanModifier}
        onSubmit={saveBeanModifier}
        stock={stock}
        stockById={stockById}
        stockLinkGroups={stockLinkGroups}
        groups={modifierGroups}
        onAddLink={addBeanStockLink}
        onRemoveLink={removeBeanStockLink}
        onUpdateLink={updateBeanStockLink}
      />
      <QuickExpenseSheet
        open={quickSheetOpen}
        onClose={() => setQuickSheetOpen(false)}
        editing={!!editingQuickExpenseId}
        value={newQuickExpense}
        onChange={setNewQuickExpense}
        onSubmit={saveQuickExpense}
      />

      <ConfirmModal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={executeResetSession}
        title="เริ่มรอบวันใหม่?"
        message="ออเดอร์ค้างของวันนี้จะถูกลบ และคิวจะกลับไปที่ #1 (ข้อมูลประวัติขายและสต็อกจะไม่หายไป)"
        confirmText="ตกลง เริ่มใหม่"
        cancelText="ย้อนกลับ"
        variant="danger"
      />
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
      <ConfirmModal
        isOpen={showDeleteBeanConfirm}
        onClose={() => { setShowDeleteBeanConfirm(false); setBeanToDelete(null); }}
        onConfirm={handleDeleteBeanModifier}
        title="ลบตัวเลือก"
        message={`ต้องการลบ "${beanToDelete?.name || ''}" ใช่หรือไม่?`}
        confirmText="ลบ"
        cancelText="ยกเลิก"
        variant="danger"
      />
      <ConfirmModal
        isOpen={showDeleteQuickExpenseConfirm}
        onClose={() => { setShowDeleteQuickExpenseConfirm(false); setQuickExpenseToDelete(null); }}
        onConfirm={handleDeleteQuickExpense}
        title="ลบปุ่มรายจ่ายด่วน"
        message={`ต้องการลบปุ่ม ${quickExpenseToDelete?.label || ''} ใช่หรือไม่?`}
        confirmText="ลบ"
        cancelText="ยกเลิก"
        variant="danger"
      />
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
