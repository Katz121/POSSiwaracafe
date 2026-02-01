import React, { useState, useMemo, useEffect } from 'react';
import {
  PieChart, Calendar, ChevronUp, ChevronDown, TrendingUp, Zap,
  History, Coffee, Link2, Plus, Trash2, Edit, BarChart3, DollarSign,
  ChefHat, FileText, Package, RefreshCcw
} from 'lucide-react';
import { doc, collection, addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { useAppContext } from '../../context/AppContext';
import { getISODate, getOrderDate } from '../../utils/calculations';

export default function AdminView() {
  const {
    orders,
    expenses,
    stock,
    beanModifiers,
    vatEnabled,
    pinEnabled,
    adminPin,
    redeemPointsThreshold,
    redeemDiscountValue,
    ownGlassDiscount,
    geminiApiKey,
    runDbAction,
    setView
  } = useAppContext();

  // Constants
  const ADMIN_PIN = adminPin || '1234';
  const REDEEM_POINTS_THRESHOLD = Number(redeemPointsThreshold) || 100;
  const REDEEM_DISCOUNT_VALUE = Number(redeemDiscountValue) || 50;
  const OWN_GLASS_DISCOUNT = Number(ownGlassDiscount) || 5;

  // Local states
  const [selectedHistoryDate, setSelectedHistoryDate] = useState(getISODate());
  const [settingsDraft, setSettingsDraft] = useState({
    adminPin: '',
    redeemPointsThreshold: 100,
    redeemDiscountValue: 50,
    ownGlassDiscount: 5,
    geminiApiKey: ''
  });
  const [adminPanels, setAdminPanels] = useState({
    daily: true,
    monthly: false,
    expenses: false,
    backdatedSales: false,
    beanModifiers: false,
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
  const [newExpense, setNewExpense] = useState({ title: '', amount: '', category: 'วัตถุดิบ' });
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Initialize settingsDraft from context values
  useEffect(() => {
    setSettingsDraft({
      adminPin: ADMIN_PIN,
      redeemPointsThreshold: REDEEM_POINTS_THRESHOLD,
      redeemDiscountValue: REDEEM_DISCOUNT_VALUE,
      ownGlassDiscount: OWN_GLASS_DISCOUNT,
      geminiApiKey: geminiApiKey || ''
    });
  }, [ADMIN_PIN, REDEEM_POINTS_THRESHOLD, REDEEM_DISCOUNT_VALUE, OWN_GLASS_DISCOUNT, geminiApiKey]);

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
      setNewExpense({ title: '', amount: '', category: 'วัตถุดิบ' });
    }, 'บันทึกค่าใช้จ่ายไม่สำเร็จ');
  };

  const executeResetSession = async () => {
    if (!window.confirm('ยืนยันล้างออเดอร์ทั้งหมดวันนี้?')) return;
    await runDbAction(async () => {
      const pendingOrders = orders.filter(o => o.status !== 'completed' && getOrderDate(o) === getISODate());
      for (const order of pendingOrders) { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', order.id)); }
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'queue'), { current: 1 });
      setShowResetConfirm(false);
    }, 'ล้างออเดอร์ไม่สำเร็จ');
  };

  // Bean modifier stock link handlers
  const addBeanStockLink = () => setNewBeanModifier(p => ({ ...p, stockLinks: [...(p.stockLinks || []), { stockId: '', usage: 1 }] }));
  const removeBeanStockLink = (i) => setNewBeanModifier(p => ({ ...p, stockLinks: p.stockLinks.filter((_, idx) => idx !== i) }));
  const updateBeanStockLink = (i, f, v) => setNewBeanModifier(p => {
    const next = [...(p.stockLinks || [])];
    next[i] = { ...next[i], [f]: v };
    return { ...p, stockLinks: next };
  });

  return (
    <div className="h-full bg-[#f8faf9] flex flex-col animate-in fade-in duration-500 text-gray-800 overflow-hidden leading-none">
      <header className="h-16 md:h-20 lg:h-24 bg-white border-b border-gray-100 px-4 md:px-8 lg:px-12 flex items-center justify-between shadow-sm z-10 text-gray-800">
        <div className="flex items-center gap-2 md:gap-4 text-emerald-600 uppercase font-black"><PieChart size={24} className="md:w-8 md:h-8 lg:w-9 lg:h-9" /><h1 className="text-base md:text-xl lg:text-2xl font-black uppercase tracking-tight text-gray-800 leading-none">สรุปยอด</h1></div>
        <div className="flex items-center gap-2 md:gap-3 lg:gap-5 text-gray-800 leading-none">
          <div className="relative flex items-center bg-emerald-50 border border-emerald-100 rounded-xl md:rounded-2xl lg:rounded-[2rem] p-1 md:p-1.5 shadow-sm leading-none"><Calendar className="text-emerald-500 ml-2 md:ml-4" size={18} /><input type="date" value={selectedHistoryDate} onChange={(e) => setSelectedHistoryDate(e.target.value)} className="bg-transparent border-none py-2 md:py-3 lg:py-3.5 pl-2 pr-3 md:pl-3 md:pr-6 text-sm md:text-base font-black text-emerald-700 outline-none cursor-pointer shadow-none leading-none w-[110px] md:w-auto" /></div>
          <button onClick={toggleVatSystem} className={`hidden md:flex px-4 lg:px-8 py-2.5 lg:py-4 rounded-xl lg:rounded-2xl text-[10px] lg:text-[11px] font-black items-center gap-2 border transition-all leading-none ${vatEnabled ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>{vatEnabled ? 'VAT ON' : 'VAT OFF'}</button>
          <button onClick={togglePinSecurity} className={`hidden md:flex px-4 lg:px-8 py-2.5 lg:py-4 rounded-xl lg:rounded-2xl text-[10px] lg:text-[11px] font-black items-center gap-2 border transition-all leading-none ${pinEnabled ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>{pinEnabled ? 'PIN ON' : 'PIN OFF'}</button>
        </div>
      </header>
      <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-8 p-4 lg:p-8 overflow-auto text-gray-800">
        <div className="w-full lg:w-[400px] xl:w-[480px] space-y-4 lg:space-y-8 shrink-0 animate-in slide-in-from-left">
          {/* Daily Stats Card */}
          <div className="bg-gray-900 rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden border-b-8 border-emerald-500/20">
            <TrendingUp size={160} className="absolute -right-12 -bottom-12 opacity-10" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.3em] opacity-50 mb-3 px-1">สรุปยอดรายวัน ({new Date(selectedHistoryDate).toLocaleDateString('th-TH')})</p>
                <p className={`text-7xl font-black tracking-tighter mb-6 ${dailyNetStats.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  ฿{Number(dailyNetStats.profit).toLocaleString()}
                </p>
              </div>
              <button onClick={() => toggleAdminPanel('daily')} className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 transition-all">
                {adminPanels.daily ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>
            </div>
            {adminPanels.daily && (
              <div className="grid grid-cols-2 gap-6 mt-8 border-t border-white/10 pt-8 font-black uppercase tracking-[0.2em] text-[10px] opacity-60">
                <div className="flex flex-col gap-2"><span>รายรับ:</span><span className="text-2xl text-white tracking-tighter">฿{Number(dailyNetStats.revenue).toLocaleString()}</span></div>
                <div className="flex flex-col gap-2"><span className="text-red-400">รายจ่าย:</span><span className="text-2xl text-red-400 tracking-tighter">฿{Number(dailyNetStats.cost).toLocaleString()}</span></div>
              </div>
            )}
          </div>

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
                  <div>
                    <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">PIN แอดมิน</label>
                    <input type="password" maxLength={6} value={settingsDraft.adminPin} onChange={(e) => setSettingsDraft({ ...settingsDraft, adminPin: e.target.value })} className="w-full mt-2 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-black outline-none" placeholder="เช่น 1234" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">แต้มขั้นต่ำแลก</label>
                      <input type="number" value={settingsDraft.redeemPointsThreshold} onChange={(e) => setSettingsDraft({ ...settingsDraft, redeemPointsThreshold: e.target.value })} className="w-full mt-2 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-black outline-none" />
                    </div>
                    <div>
                      <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">ส่วนลดแลกแต้ม</label>
                      <input type="number" value={settingsDraft.redeemDiscountValue} onChange={(e) => setSettingsDraft({ ...settingsDraft, redeemDiscountValue: e.target.value })} className="w-full mt-2 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-black outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">ส่วนลดแก้วส่วนตัว</label>
                    <input type="number" value={settingsDraft.ownGlassDiscount} onChange={(e) => setSettingsDraft({ ...settingsDraft, ownGlassDiscount: e.target.value })} className="w-full mt-2 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-black outline-none" />
                  </div>
                  <div className="col-span-2 border-t border-gray-50 pt-4 mt-2">
                    <label className="text-[11px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2"><Zap size={14} /> Gemini API Key (สำหรับ AI Features)</label>
                    <input type="password" value={settingsDraft.geminiApiKey} onChange={(e) => setSettingsDraft({ ...settingsDraft, geminiApiKey: e.target.value })} className="w-full mt-2 bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 text-sm font-bold text-emerald-700 outline-none placeholder:text-emerald-300" placeholder="AIzaSy..." />
                    <p className="text-[10px] text-gray-400 mt-2 font-bold">รับฟรีที่ <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline hover:text-emerald-500">aistudio.google.com</a></p>
                  </div>
                </div>
                <button onClick={saveSettingsDraft} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.3em] shadow-lg hover:bg-emerald-700 transition-all">
                  บันทึกการตั้งค่า
                </button>
              </>
            )}
          </div>

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
                  <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">รายการขาย / ชื่อสินค้า</label>
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
                    <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">ยอดเงิน (บาท)</label>
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
                    <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">วันที่ขาย</label>
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
                  <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">หมายเหตุ (ไม่บังคับ)</label>
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
                      <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">ชื่อแท็ก (เช่น คั่วอ่อน)</label>
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
                      <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">ราคาแทนที่ (บาท)</label>
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
                      <div className="flex items-center gap-2 text-[10px] font-black text-amber-600 uppercase tracking-wider"><Link2 size={16} /> ผูกสต็อกของเมล็ดนี้</div>
                      <button type="button" onClick={addBeanStockLink} className="text-amber-600 font-black text-[10px] bg-white border border-amber-100 px-4 py-2 rounded-xl shadow-sm hover:bg-amber-50 active:scale-95 leading-none flex items-center gap-1"><Plus size={14} /> เพิ่มพัสดุ</button>
                    </div>
                    <div className="space-y-3">
                      {(newBeanModifier.stockLinks || []).map((link, idx) => (
                        <div key={idx} className="bg-white/80 p-5 rounded-[2rem] border border-amber-50 shadow-sm space-y-4 text-gray-800">
                          <div className="flex flex-col gap-2">
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">เลือกเมล็ด/วัตถุดิบ</label>
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
                              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">ปริมาณที่หัก</label>
                              <div className="relative flex items-center bg-amber-50/20 rounded-xl px-4 h-14 border border-amber-100">
                                <input
                                  type="number"
                                  step="any"
                                  value={link.usage}
                                  onChange={(e) => updateBeanStockLink(idx, 'usage', e.target.value)}
                                  className="w-full bg-transparent border-none text-left text-lg font-black outline-none text-gray-800"
                                  placeholder="0.00"
                                />
                                <div className="bg-white px-3 py-1.5 rounded-lg border border-amber-100 text-[9px] font-black text-amber-600 uppercase shadow-sm shrink-0">
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
                        <p className="text-center text-[9px] text-gray-400 font-bold italic py-2">ยังไม่ได้ผูกสต็อก</p>
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
                    <p className="text-center text-[11px] text-gray-400 font-black uppercase tracking-widest py-4">ยังไม่มีแท็ก</p>
                  ) : (
                    beanModifiers.map(mod => (
                      <div key={mod.id} className="flex items-center justify-between p-4 bg-amber-50 rounded-2xl border border-amber-100">
                        <div className="flex items-center gap-3">
                          <span className="font-black text-amber-700">#{mod.name}</span>
                          <span className="text-sm font-bold text-gray-400">฿{Number(mod.price).toLocaleString()}</span>
                          {(mod.stockLinks || []).length > 0 && (
                            <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100 flex items-center gap-1">
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
                            onClick={async () => {
                              if (!window.confirm(`ลบแท็ก #${mod.name}?`)) return;
                              await runDbAction(async () => {
                                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'beanModifiers', mod.id));
                              }, 'ลบแท็กไม่สำเร็จ');
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

          {/* Monthly Stats Panel */}
          <div className="bg-white rounded-[3rem] p-10 border border-gray-100 shadow-xl relative overflow-hidden border-t-[10px] border-t-emerald-500 shadow-emerald-500/5">
            <div className="flex justify-between items-start mb-8">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-gray-400 mb-2">ภาพรวมผลกำไรรายเดือน</p>
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
                  <span className="text-[11px] font-black text-emerald-600 uppercase tracking-widest">จำนวนบิลที่ปิดสำเร็จ:</span>
                  <span className="text-lg font-black text-emerald-700">{monthlyStats.count} <small className="text-[10px] opacity-60">บิล</small></span>
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
                  <div className="grid grid-cols-2 gap-5"><input type="number" placeholder="จำนวนเงิน..." required value={newExpense.amount} onChange={e => setNewExpense({ ...newExpense, amount: e.target.value })} className="w-full bg-gray-50 border border-gray-100 rounded-[1.5rem] p-5 text-sm font-black outline-none shadow-inner" /><select value={newExpense.category} onChange={e => setNewExpense({ ...newExpense, category: e.target.value })} className="w-full bg-gray-50 border border-gray-100 rounded-[1.5rem] p-5 text-xs font-black outline-none shadow-inner cursor-pointer text-gray-800"><option>วัตถุดิบ</option><option>ค่าจ้าง</option><option>ค่าไฟ/น้ำ</option><option>อื่น ๆ</option></select></div>
                  <button type="submit" className="w-full bg-gray-800 text-white py-6 rounded-[2rem] font-black text-xs uppercase shadow-xl active:scale-95 tracking-[0.2em] border-b-4 border-gray-950">บันทึกรายจ่าย</button>
                </form>
                <div className="space-y-3 max-h-56 overflow-y-auto scrollbar-hide border-t border-gray-50 pt-6 text-gray-800">
                  {expenses.filter(e => e.date === selectedHistoryDate).length === 0 && (
                    <p className="text-center text-[11px] text-gray-400 font-black uppercase tracking-widest py-4">ไม่มีข้อมูลรายจ่ายวันนี้</p>
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
        </div>

        {/* Right Panel - Store Management */}
        <div className="flex-1 bg-white rounded-[3.5rem] shadow-xl border border-gray-100 flex flex-col p-10 space-y-8 text-gray-800 shadow-emerald-500/5">
          <h2 className="font-black text-2xl text-gray-800 uppercase tracking-tighter font-black px-2 leading-none">Store Management</h2>
          <div className="grid grid-cols-2 gap-6 flex-1 overflow-y-auto pr-2 scrollbar-hide text-gray-800">
            <button onClick={() => setView('merchant')} className="p-10 bg-orange-50 rounded-[3rem] border-2 border-orange-100 text-orange-600 flex flex-col items-center justify-center gap-6 hover:shadow-2xl transition-all shadow-md active:scale-95"><ChefHat size={60} /><span className="font-black text-xs uppercase tracking-[0.3em] leading-none">จอภาพครัว</span></button>
            <button onClick={() => setView('bills')} className="p-10 bg-blue-50 rounded-[3rem] border-2 border-blue-100 text-blue-600 flex flex-col items-center justify-center gap-6 hover:shadow-2xl transition-all shadow-md active:scale-95"><FileText size={60} /><span className="font-black text-xs uppercase tracking-[0.3em] leading-none">ประวัติบิล</span></button>
            <button onClick={() => setView('stock')} className="p-10 bg-emerald-50 rounded-[3rem] border-2 border-emerald-100 text-emerald-600 flex flex-col items-center justify-center gap-6 hover:shadow-2xl transition-all shadow-md active:scale-95"><Package size={60} /><span className="font-black text-xs uppercase tracking-[0.3em] leading-none">คลังสต็อก</span></button>
            <button onClick={() => setShowResetConfirm(true)} className="p-10 bg-red-50 rounded-[3rem] border-2 border-red-100 text-red-600 flex flex-col items-center justify-center gap-6 hover:shadow-2xl transition-all active:scale-95 leading-none"><RefreshCcw size={60} /><span className="font-black text-xs uppercase tracking-[0.3em] leading-none">ล้างคิวใหม่</span></button>
          </div>
        </div>
      </div>

      {/* Reset Session Confirm Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/80 backdrop-blur-3xl p-6 animate-in fade-in text-center text-gray-900 leading-none">
          <div className="bg-white rounded-[4rem] p-16 max-w-xl w-full shadow-2xl border border-white/10 leading-none">
            <div className="w-28 h-28 bg-red-50 rounded-full mx-auto flex items-center justify-center text-red-500 mb-10 shadow-inner animate-pulse leading-none"><RefreshCcw size={64} strokeWidth={2.5} /></div>
            <h3 className="font-black text-4xl mb-5 tracking-tighter uppercase leading-none">เริ่มรอบวันใหม่?</h3>
            <p className="text-gray-400 font-bold mb-16 leading-relaxed px-6 text-base leading-none">ออเดอร์ค้างจะถูกลบและคิวจะกลับไปที่ #1 <br /><span className="text-emerald-500 font-black uppercase text-xs mt-3 block leading-none">(ข้อมูลประวัติขายและสต็อกจะไม่หายไป)</span></p>
            <div className="grid grid-cols-2 gap-6 leading-none">
              <button onClick={() => setShowResetConfirm(false)} className="py-8 bg-gray-100 rounded-[2rem] font-black uppercase text-sm tracking-widest text-gray-400 active:scale-95 transition-all leading-none">ย้อนกลับ</button>
              <button onClick={executeResetSession} className="py-8 bg-red-600 text-white rounded-[2rem] font-black uppercase text-sm tracking-widest shadow-2xl transition-all border-b-8 border-red-800 active:scale-95 transition-all leading-none">ตกลง เริ่มใหม่</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
