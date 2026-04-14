import React, { useState, useMemo, useCallback } from 'react';
import { DollarSign, Calendar, Trash2, BarChart3, RefreshCcw, Zap, X } from 'lucide-react';
import { collection, doc, addDoc, deleteDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { useAppContext } from '../../context/AppContext';
import { getISODate, getOrderDate } from '../../utils/calculations';
import { Button, Modal, Input, Select, Card, Spinner, EmptyState, useToast } from '../ui';
import { EXPENSE_CATEGORIES } from '../../config/constants';

export default function ExpensesView() {
  const { expenses, orders, quickExpenses, runDbAction, callGeminiAPI, setView, handleViewChange, setAdminTab, stock } = useAppContext();
  const toast = useToast();

  // Local states
  const [expenseViewMode, setExpenseViewMode] = useState('daily');
  const [expenseFilterDate, setExpenseFilterDate] = useState(getISODate());
  const [newExpense, setNewExpense] = useState({ title: '', quantity: '', unit: 'ชิ้น', pricePerUnit: '', amount: '', category: 'วัตถุดิบ' });
  const [financialInsight, setFinancialInsight] = useState('');
  const [isAnalyzingFinances, setIsAnalyzingFinances] = useState(false);

  // New states for UX improvements
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [validationErrors, setValidationErrors] = useState({});

  // Validation helper
  const validateExpense = useCallback((expense) => {
    const errors = {};

    if (!expense.title || !expense.title.trim()) {
      errors.title = 'กรุณากรอกชื่อรายจ่าย';
    }

    const qty = Number(expense.quantity);
    if (expense.category === 'วัตถุดิบ' && qty <= 0) {
      errors.quantity = 'จำนวนต้องมากกว่า 0';
    }

    const price = Number(expense.pricePerUnit);
    if (expense.category === 'วัตถุดิบ' && price <= 0) {
      errors.pricePerUnit = 'ราคาต้องมากกว่า 0';
    }

    const amount = expense.amount || (qty * price);
    if (!amount || amount <= 0) {
      errors.amount = 'ราคารวมต้องมากกว่า 0';
    }

    return errors;
  }, []);

  // Helper 1: หาสต็อกที่ตรงกับชื่อ (case-insensitive, trim)
  const findStockByName = useCallback((stock, expenseTitle) => {
    const normalizedTitle = String(expenseTitle).trim().toLowerCase();
    return stock.find(item =>
      String(item.name).trim().toLowerCase() === normalizedTitle
    ) || null;
  }, []);

  // Helper 2: คำนวณราคาเฉลี่ยแบบ weighted average
  const calculateWeightedAverageUnitCost = useCallback((oldQuantity, oldUnitCost, newQuantity, newPricePerUnit) => {
    const oldQty = Number(oldQuantity) || 0;
    const oldCost = Number(oldUnitCost) || 0;
    const newQty = Number(newQuantity) || 0;
    const newPrice = Number(newPricePerUnit) || 0;

    // Edge case: ถ้าสต็อกเดิมเป็น 0 ให้ใช้ราคาใหม่
    if (oldQty === 0) return newPrice;
    if (oldQty === 0 && newQty === 0) return newPrice;

    // สูตร: ((oldQty * oldCost) + (newQty * newPrice)) / (oldQty + newQty)
    const totalCost = (oldQty * oldCost) + (newQty * newPrice);
    const totalQuantity = oldQty + newQty;

    return totalQuantity > 0 ? totalCost / totalQuantity : 0;
  }, []);

  // Helper 3: Sync expense ไปยัง stock
  const syncExpenseToStock = useCallback(async (expense, stock, runDbAction) => {
    // Guard: เฉพาะหมวด "วัตถุดิบ" เท่านั้น
    if (expense.category !== 'วัตถุดิบ') return { success: false, action: 'skip' };

    // Validation: ต้องมี title, quantity > 0, และ pricePerUnit
    if (!expense.title || !expense.quantity || expense.quantity <= 0 || !expense.pricePerUnit) {
      console.warn('Skipping stock sync - missing or invalid required fields:', expense);
      return { success: false, action: 'skip', error: 'Invalid fields' };
    }

    const existingStock = findStockByName(stock, expense.title);

    try {
      if (existingStock) {
        // อัพเดตสต็อกเดิม
        const newQuantity = (Number(existingStock.quantity) || 0) + Number(expense.quantity);
        const newUnitCost = calculateWeightedAverageUnitCost(
          existingStock.quantity,
          existingStock.unitCost,
          expense.quantity,
          expense.pricePerUnit
        );

        await runDbAction(async () => {
          await updateDoc(
            doc(db, 'artifacts', appId, 'public', 'data', 'stock', existingStock.id),
            {
              quantity: newQuantity,
              unitCost: newUnitCost,
              unit: String(expense.unit || existingStock.unit)
            }
          );
        }, 'อัพเดตสต็อกจากรายจ่ายไม่สำเร็จ');

        return {
          success: true,
          action: 'updated',
          stockName: expense.title,
          quantity: newQuantity,
          unit: expense.unit || existingStock.unit
        };
      } else {
        // สร้างสต็อกใหม่
        await runDbAction(async () => {
          await addDoc(
            collection(db, 'artifacts', appId, 'public', 'data', 'stock'),
            {
              name: String(expense.title),
              quantity: Number(expense.quantity),
              unit: String(expense.unit || 'ชิ้น'),
              minQuantity: 5, // ค่า default
              unitCost: Number(expense.pricePerUnit)
            }
          );
        }, 'สร้างสต็อกใหม่จากรายจ่ายไม่สำเร็จ');

        return {
          success: true,
          action: 'created',
          stockName: expense.title,
          quantity: expense.quantity,
          unit: expense.unit || 'ชิ้น'
        };
      }
    } catch (error) {
      return { success: false, action: 'error', error: error.message };
    }
  }, [findStockByName, calculateWeightedAverageUnitCost]);

  // Computed stats
  const filteredExpenseStats = useMemo(() => {
    const targetMonth = expenseFilterDate.substring(0, 7);
    let filtered = [];

    if (expenseViewMode === 'daily') {
      filtered = expenses.filter(e => e.date === expenseFilterDate);
    } else if (expenseViewMode === 'monthly') {
      filtered = expenses.filter(e => e.date?.startsWith(targetMonth));
    } else {
      filtered = [...expenses];
    }

    const total = filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const byCategory = {};
    filtered.forEach(e => {
      const cat = e.category || 'อื่น ๆ';
      if (!byCategory[cat]) byCategory[cat] = 0;
      byCategory[cat] += Number(e.amount) || 0;
    });

    return {
      expenses: filtered.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
      total,
      byCategory: Object.entries(byCategory).sort((a, b) => b[1] - a[1]),
      count: filtered.length
    };
  }, [expenses, expenseViewMode, expenseFilterDate]);

  // AI วิเคราะห์การเงิน - วิเคราะห์ตามช่วงเวลาที่เลือก
  const handleAnalyzeFinances = useCallback(async () => {
    setIsAnalyzingFinances(true);
    setFinancialInsight('');

    try {
      // ใช้ข้อมูลที่ filter แล้วตาม expenseViewMode
      const { expenses: filteredExpenses, total: totalExpenses, byCategory } = filteredExpenseStats;

      // คำนวณรายได้ตามช่วงเวลาเดียวกัน
      const targetMonth = expenseFilterDate.substring(0, 7);
      let filteredOrders = [];
      let periodLabel = '';
      let periodLabelThai = '';

      if (expenseViewMode === 'daily') {
        filteredOrders = orders.filter(o => o.status === 'completed' && getOrderDate(o) === expenseFilterDate);
        periodLabel = `Daily (${expenseFilterDate})`;
        periodLabelThai = `รายวัน (${new Date(expenseFilterDate).toLocaleDateString('th-TH')})`;
      } else if (expenseViewMode === 'monthly') {
        filteredOrders = orders.filter(o => o.status === 'completed' && (getOrderDate(o) || '').startsWith(targetMonth));
        periodLabel = `Monthly (${targetMonth})`;
        periodLabelThai = `รายเดือน (${new Date(targetMonth + '-01').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })})`;
      } else {
        // All time
        filteredOrders = orders.filter(o => o.status === 'completed');
        periodLabel = 'All Time';
        periodLabelThai = 'ทั้งหมด';
      }

      const totalRevenue = filteredOrders.reduce((s, o) => s + (Number(o.total || 0)), 0);
      const netProfit = totalRevenue - totalExpenses;
      const orderCount = filteredOrders.length;
      const avgOrderValue = orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0;

      // สร้าง expense breakdown จาก byCategory
      const expenseBreakdown = {};
      byCategory.forEach(([cat, amount]) => {
        expenseBreakdown[cat] = amount;
      });

      const prompt = `
        Role: Financial Analyst for a Cafe.
        Shop Operating Hours: 10:00 - 17:00.

        **Analysis Period: ${periodLabel} (${periodLabelThai})**

        Financial Summary:
        - Total Revenue: ${totalRevenue.toLocaleString()} THB (${orderCount} orders)
        - Average Order Value: ${avgOrderValue.toLocaleString()} THB
        - Total Expenses: ${totalExpenses.toLocaleString()} THB (${filteredExpenses.length} รายการ)
        - Net Profit: ${netProfit.toLocaleString()} THB
        - Profit Margin: ${totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0}%

        Expense Breakdown: ${JSON.stringify(expenseBreakdown)}

        Task: Analyze the financial health for this specific period (${periodLabelThai}).
        1. Evaluate the profit margin - is it healthy?
        2. Point out the highest cost categories and suggest optimizations.
        3. Provide 1-2 actionable recommendations to improve profitability.
        ${expenseViewMode === 'daily' ? '4. Compare if this day seems normal or unusual.' : ''}
        ${expenseViewMode === 'monthly' ? '4. Suggest monthly budget targets.' : ''}
        Language: Thai. Be concise but insightful.
      `;

      const result = await callGeminiAPI(prompt, false);
      if (result.success) {
        setFinancialInsight(result.data);
      }

    } catch (e) {
      toast.error('วิเคราะห์ไม่สำเร็จ: ' + e.message);
    } finally {
      setIsAnalyzingFinances(false);
    }
  }, [filteredExpenseStats, orders, expenseFilterDate, expenseViewMode, callGeminiAPI, toast]);

  const applyQuickExpense = useCallback((item) => {
    setNewExpense({
      title: item.title,
      quantity: item.amount ? 1 : '',
      unit: item.unit,
      pricePerUnit: item.amount || '',
      amount: item.amount || '',
      category: item.category
    });
  }, []);

  // Add expense handler
  const handleAddExpense = useCallback(async (e) => {
    e.preventDefault();

    // Clear previous messages
    setSyncMessage('');
    setValidationErrors({});

    // Validate input
    const errors = validateExpense(newExpense);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      toast.warning('กรุณาตรวจสอบข้อมูลให้ครบถ้วน');
      return;
    }

    const finalAmount = newExpense.amount || (Number(newExpense.quantity) * Number(newExpense.pricePerUnit));
    if (!newExpense.title || !finalAmount) return;

    setIsSyncing(true);

    try {
      // เตรียมข้อมูลรายจ่าย
      const expenseData = {
        title: String(newExpense.title),
        quantity: Number(newExpense.quantity) || 0,
        unit: String(newExpense.unit || ''),
        pricePerUnit: Number(newExpense.pricePerUnit) || 0,
        amount: Number(finalAmount),
        category: String(newExpense.category),
        date: expenseFilterDate,
        createdAt: serverTimestamp()
      };

      // Step 1: บันทึกรายจ่าย
      await runDbAction(async () => {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'expenses'), expenseData);
      }, 'บันทึกค่าใช้จ่ายไม่สำเร็จ');

      toast.success('บันทึกรายจ่ายสำเร็จ');

      // Step 2: Sync ไปยังสต็อก (ถ้าเป็นวัตถุดิบ)
      if (newExpense.category === 'วัตถุดิบ') {
        const syncResult = await syncExpenseToStock(expenseData, stock, runDbAction);

        if (syncResult?.success) {
          if (syncResult.action === 'created') {
            setSyncMessage(`✓ สร้างสต็อก "${syncResult.stockName}" ${syncResult.quantity} ${syncResult.unit} สำเร็จ`);
          } else if (syncResult.action === 'updated') {
            setSyncMessage(`✓ อัพเดตสต็อก "${syncResult.stockName}" เป็น ${syncResult.quantity} ${syncResult.unit} สำเร็จ`);
          }

          // Auto-hide message after 5 seconds
          setTimeout(() => setSyncMessage(''), 5000);
        }
      }

      // Reset form
      setNewExpense({ title: '', quantity: '', unit: 'ชิ้น', pricePerUnit: '', amount: '', category: 'วัตถุดิบ' });
    } catch (error) {
      toast.error('บันทึกรายจ่ายไม่สำเร็จ');
    } finally {
      setIsSyncing(false);
    }
  }, [newExpense, expenseFilterDate, stock, runDbAction, syncExpenseToStock, validateExpense, toast]);

  return (
    <div className="h-full bg-[#f8faf9] flex flex-col animate-in fade-in duration-500 overflow-hidden text-gray-800">
      <header className="h-16 md:h-20 lg:h-24 bg-white border-b border-gray-100 px-4 md:px-8 lg:px-12 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-2 md:gap-4 text-red-600 uppercase font-black">
          <DollarSign size={24} className="md:w-7 md:h-7 lg:w-8 lg:h-8" />
          <h1 className="text-lg md:text-xl lg:text-2xl font-black uppercase tracking-tight text-gray-800">ระบบรายจ่าย</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-2xl border border-gray-100">
            <button onClick={() => setExpenseViewMode('daily')} className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${expenseViewMode === 'daily' ? 'bg-red-500 text-white shadow-lg' : 'text-gray-400 hover:text-red-500'}`}>รายวัน</button>
            <button onClick={() => setExpenseViewMode('monthly')} className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${expenseViewMode === 'monthly' ? 'bg-red-500 text-white shadow-lg' : 'text-gray-400 hover:text-red-500'}`}>รายเดือน</button>
            <button onClick={() => setExpenseViewMode('all')} className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${expenseViewMode === 'all' ? 'bg-red-500 text-white shadow-lg' : 'text-gray-400 hover:text-red-500'}`}>ทั้งหมด</button>
          </div>
          {expenseViewMode !== 'all' && (
            <div className="relative flex items-center bg-red-50 border border-red-100 rounded-3xl p-1.5 shadow-sm">
              <Calendar className="text-red-500 ml-4" size={22} />
              <input type="date" value={expenseFilterDate} onChange={(e) => setExpenseFilterDate(e.target.value)} className="bg-transparent border-none py-3 pl-3 pr-6 text-base font-black text-red-700 outline-none cursor-pointer" />
            </div>
          )}
        </div>
      </header>
      <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 p-4 md:p-6 lg:p-8 overflow-auto">
        {/* Left Column: Summary Cards & Form - Optimized for iPad */}
        <div className="w-full md:w-[420px] lg:w-[480px] xl:w-[520px] space-y-4 md:space-y-5 lg:space-y-6 shrink-0">
          {/* Total Expense Card - iPad Optimized */}
          <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-[3rem] p-8 md:p-10 text-white shadow-xl border-b-8 border-red-700/30">
            <p className="text-xs md:text-sm font-black uppercase tracking-[0.3em] opacity-70 mb-3 md:mb-4">รายจ่ายรวม{expenseViewMode === 'daily' ? 'วันนี้' : expenseViewMode === 'monthly' ? 'เดือนนี้' : 'ทั้งหมด'}</p>
            <p className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter">฿{filteredExpenseStats.total.toLocaleString()}</p>
            <p className="text-sm md:text-base font-bold opacity-60 mt-3 md:mt-4">{filteredExpenseStats.count} รายการ</p>
          </div>

          {/* Category Breakdown - iPad Optimized */}
          <div className="bg-white rounded-[3rem] p-6 md:p-8 shadow-sm border border-gray-100">
            <h3 className="text-xs md:text-sm font-black text-gray-400 uppercase tracking-[0.3em] mb-4 md:mb-6">แยกตามหมวดหมู่</h3>
            <div className="space-y-3 md:space-y-4">
              {filteredExpenseStats.byCategory.length > 0 ? (
                filteredExpenseStats.byCategory.map(([cat, amount]) => (
                  <div key={cat} className="flex items-center justify-between p-4 md:p-5 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-sm md:text-base font-black text-gray-700">{cat}</span>
                    <span className="text-base md:text-lg font-black text-red-500">฿{amount.toLocaleString()}</span>
                  </div>
                ))
              ) : (
                <p className="text-center text-xs md:text-sm text-gray-400 font-black uppercase tracking-widest py-4">ไม่มีข้อมูล</p>
              )}
            </div>
          </div>

          {/* Add Expense Form - iPad Optimized */}
          <div className="bg-white rounded-[3rem] p-6 md:p-8 shadow-sm border border-gray-100 space-y-4 md:space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs md:text-sm font-black text-gray-400 uppercase tracking-[0.3em]">เพิ่มรายจ่ายใหม่</h3>
              <Zap size={18} className="text-red-400 animate-pulse md:w-5 md:h-5" />
            </div>

            {/* Success Message Toast - iPad Optimized */}
            {syncMessage && (
              <div className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-2xl p-4 md:p-5 flex items-center gap-3 md:gap-4 shadow-lg animate-in slide-in-from-top-2">
                <div className="w-8 h-8 md:w-10 md:h-10 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-lg md:text-xl">✓</span>
                </div>
                <p className="text-xs md:text-sm font-bold leading-relaxed">{syncMessage}</p>
              </div>
            )}

            {/* Quick Shortcuts - iPad Optimized */}
            <div className="flex flex-wrap gap-2 md:gap-3 mb-2">
              {quickExpenses.map((item, idx) => (
                <button
                  key={item.id || idx}
                  type="button"
                  onClick={() => applyQuickExpense(item)}
                  className="px-4 py-3 md:px-5 md:py-3.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs md:text-sm font-black transition-all border border-red-100 active:scale-95 flex items-center gap-2"
                >
                  <span className="text-base md:text-lg">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setAdminTab('quickExpenses');
                  handleViewChange('admin');
                }}
                className="px-4 py-3 md:px-5 md:py-3.5 bg-gray-50 hover:bg-gray-100 text-gray-400 rounded-xl text-xs md:text-sm font-black transition-all border border-gray-100 active:scale-95"
                title="จัดการคีย์ลัด"
              >
                + แก้ไข #
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-4 md:space-y-5">
              <div>
                <label className="text-xs md:text-sm font-black text-gray-400 uppercase tracking-widest ml-4 mb-2 block">ชื่อรายจ่าย</label>
                <input
                  type="text"
                  placeholder="ซื้อนมสด, กาแฟ..."
                  required
                  value={newExpense.title}
                  onChange={e => {
                    setNewExpense({ ...newExpense, title: e.target.value });
                    if (validationErrors.title) setValidationErrors({ ...validationErrors, title: '' });
                  }}
                  className={`w-full bg-gray-50 border rounded-2xl p-4 md:p-5 text-sm md:text-base font-black outline-none shadow-inner focus:bg-white transition-all ${validationErrors.title ? 'border-red-300 bg-red-50' : 'border-gray-100'}`}
                  aria-label="ชื่อรายจ่าย"
                  aria-invalid={!!validationErrors.title}
                />
                {validationErrors.title && (
                  <p className="text-red-500 text-xs md:text-sm font-bold ml-4 mt-1.5">{validationErrors.title}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 md:gap-5">
                <div>
                  <label className="text-xs md:text-sm font-black text-gray-400 uppercase tracking-widest ml-4 mb-2 block">ราคา/หน่วย</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={newExpense.pricePerUnit}
                    onChange={e => {
                      setNewExpense({ ...newExpense, pricePerUnit: e.target.value });
                      if (validationErrors.pricePerUnit) setValidationErrors({ ...validationErrors, pricePerUnit: '' });
                    }}
                    className={`w-full bg-gray-50 border rounded-2xl p-4 md:p-5 text-sm md:text-base font-black outline-none shadow-inner ${validationErrors.pricePerUnit ? 'border-red-300 bg-red-50' : 'border-gray-100'}`}
                    aria-label="ราคาต่อหน่วย"
                  />
                  {validationErrors.pricePerUnit && (
                    <p className="text-red-500 text-xs md:text-sm font-bold ml-4 mt-1.5">{validationErrors.pricePerUnit}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs md:text-sm font-black text-gray-400 uppercase tracking-widest ml-4 mb-2 block">จำนวน</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={newExpense.quantity}
                    onChange={e => {
                      setNewExpense({ ...newExpense, quantity: e.target.value });
                      if (validationErrors.quantity) setValidationErrors({ ...validationErrors, quantity: '' });
                    }}
                    className={`w-full bg-gray-50 border rounded-2xl p-4 md:p-5 text-sm md:text-base font-black outline-none shadow-inner ${validationErrors.quantity ? 'border-red-300 bg-red-50' : 'border-gray-100'}`}
                    aria-label="จำนวน"
                  />
                  {validationErrors.quantity && (
                    <p className="text-red-500 text-xs md:text-sm font-bold ml-4 mt-1.5">{validationErrors.quantity}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 md:gap-5">
                <div>
                  <label className="text-xs md:text-sm font-black text-gray-400 uppercase tracking-widest ml-4 mb-2 block">หน่วยเรียก</label>
                  <input
                    type="text"
                    placeholder="กล่อง, ถุง..."
                    value={newExpense.unit}
                    onChange={e => setNewExpense({ ...newExpense, unit: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 md:p-5 text-sm md:text-base font-black outline-none shadow-inner"
                    aria-label="หน่วยเรียก"
                  />
                </div>
                <div>
                  <label className="text-xs md:text-sm font-black text-gray-400 uppercase tracking-widest ml-4 mb-2 block">ราคารวม</label>
                  <input
                    type="number"
                    placeholder="คำนวณอัตโนมัติ..."
                    value={newExpense.amount || (Number(newExpense.quantity) * Number(newExpense.pricePerUnit)) || ''}
                    onChange={e => {
                      setNewExpense({ ...newExpense, amount: e.target.value });
                      if (validationErrors.amount) setValidationErrors({ ...validationErrors, amount: '' });
                    }}
                    className={`w-full bg-gray-100 border rounded-2xl p-4 md:p-5 text-sm md:text-base font-black outline-none shadow-inner focus:bg-white transition-all text-red-500 ${validationErrors.amount ? 'border-red-300 bg-red-50' : 'border-gray-100'}`}
                    aria-label="ราคารวม"
                  />
                  {validationErrors.amount && (
                    <p className="text-red-500 text-xs md:text-sm font-bold ml-4 mt-1.5">{validationErrors.amount}</p>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs md:text-sm font-black text-gray-400 uppercase tracking-widest ml-4 mb-2 block">หมวดหมู่</label>
                <select
                  value={newExpense.category}
                  onChange={e => setNewExpense({ ...newExpense, category: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 md:p-5 text-sm md:text-base font-black outline-none shadow-inner cursor-pointer text-gray-800"
                  aria-label="หมวดหมู่"
                >
                  {EXPENSE_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                {newExpense.category === 'วัตถุดิบ' && (
                  <div className="mt-3 p-3 md:p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 md:gap-3">
                    <div className="w-6 h-6 md:w-7 md:h-7 bg-emerald-500 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-white text-sm md:text-base">✓</span>
                    </div>
                    <p className="text-xs md:text-sm font-bold text-emerald-700">จะอัพเดตสต็อกอัตโนมัติ</p>
                  </div>
                )}
              </div>
              <Button
                type="submit"
                variant="danger"
                size="xl"
                fullWidth
                loading={isSyncing}
                className="!mt-4"
              >
                บันทึกรายจ่าย
              </Button>
            </form>
          </div>
        </div>

        {/* Right Column: Expense List */}
        <div className="flex-1 bg-white rounded-[3.5rem] shadow-xl border border-gray-100 overflow-hidden flex flex-col">
          <div className="p-8 border-b border-gray-50 flex justify-between items-center bg-white sticky top-0 z-10">
            <h2 className="text-lg font-black text-gray-800 uppercase tracking-tight">รายการค่าใช้จ่าย</h2>
            <button
              onClick={handleAnalyzeFinances}
              disabled={isAnalyzingFinances}
              className="bg-gray-50 hover:bg-emerald-50 text-gray-400 hover:text-emerald-500 p-3 rounded-2xl transition-all active:scale-95 border border-transparent hover:border-emerald-100"
              title="วิเคราะห์การเงินด้วย AI"
            >
              {isAnalyzingFinances ? <RefreshCcw size={20} className="animate-spin text-emerald-500" /> : <Zap size={20} fill="currentColor" />}
            </button>
          </div>

          {/* AI Financial Insight Card */}
          {financialInsight && (
            <div className="mx-6 mt-6 p-6 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-[2.5rem] text-white shadow-lg shadow-emerald-500/20 animate-in slide-in-from-top-4 relative overflow-hidden">
              <div className="flex items-start gap-4 relative z-10">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shrink-0">
                  <BarChart3 size={24} className="text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-black text-sm uppercase tracking-widest opacity-90">AI วิเคราะห์การเงิน</h3>
                    <button onClick={() => setFinancialInsight('')} aria-label="ปิดการวิเคราะห์" className="p-1 hover:bg-white/20 rounded-lg transition-colors"><X size={16} /></button>
                  </div>
                  <p className="text-sm font-medium leading-relaxed opacity-95 whitespace-pre-wrap">{financialInsight}</p>
                </div>
              </div>
              <Zap size={100} className="absolute -bottom-4 -right-4 text-white/5 rotate-[-15deg]" />
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-6 space-y-3 scrollbar-hide">
            {filteredExpenseStats.expenses.length === 0 && (
              <EmptyState
                icon={DollarSign}
                title="ไม่มีรายจ่ายในช่วงนี้"
                description="เพิ่มรายจ่ายใหม่จากฟอร์มด้านซ้าย"
              />
            )}
            {filteredExpenseStats.expenses.map(e => (
              <div key={e.id} className="flex items-center justify-between p-6 bg-gray-50 rounded-[2rem] border border-gray-100 hover:bg-white transition-all group">
                <div className="flex items-center gap-5 min-w-0">
                  <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center text-red-500 shrink-0">
                    <DollarSign size={24} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-gray-800 text-base truncate">{String(e.title)}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <span className="text-xs font-black text-gray-400 uppercase">{e.date}</span>
                      <span className="text-xs font-black text-red-500 bg-red-50 px-2 py-0.5 rounded-lg border border-red-100">{e.category}</span>
                      {e.quantity > 0 && (
                        <span className="text-xs font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
                          {Number(e.quantity).toLocaleString()} {e.unit} (@฿{Number(e.pricePerUnit).toLocaleString()})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xl font-black text-red-500">฿{Number(e.amount).toLocaleString()}</span>
                  <button
                    onClick={async () => {
                      await runDbAction(async () => {
                        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'expenses', e.id));
                      }, 'ลบค่าใช้จ่ายไม่สำเร็จ');
                    }}
                    className="text-gray-300 hover:text-red-500 transition-colors active:scale-90 opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
