import React, { useState, useMemo } from 'react';
import { DollarSign, Calendar, Trash2, BarChart3, RefreshCcw, Zap, X } from 'lucide-react';
import { collection, doc, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { useAppContext } from '../../context/AppContext';
import { getISODate, getOrderDate } from '../../utils/calculations';

export default function ExpensesView() {
  const { expenses, orders, runDbAction, callGeminiAPI } = useAppContext();

  // Local states
  const [expenseViewMode, setExpenseViewMode] = useState('daily');
  const [expenseFilterDate, setExpenseFilterDate] = useState(getISODate());
  const [newExpense, setNewExpense] = useState({ title: '', quantity: '', unit: 'ชิ้น', pricePerUnit: '', amount: '', category: 'วัตถุดิบ' });
  const [financialInsight, setFinancialInsight] = useState('');
  const [isAnalyzingFinances, setIsAnalyzingFinances] = useState(false);

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

  // AI Financial Analysis
  const handleAnalyzeFinances = async () => {
    setIsAnalyzingFinances(true);
    setFinancialInsight('');

    try {
      const expensesByCategory = {};
      let totalExpenses = 0;
      expenses.forEach(e => {
        if (!expensesByCategory[e.category]) expensesByCategory[e.category] = 0;
        expensesByCategory[e.category] += Number(e.amount);
        totalExpenses += Number(e.amount);
      });

      const today = getISODate();
      const dr = orders.filter(o => o.status === 'completed' && getOrderDate(o) === today).reduce((s, o) => s + (Number(o.total || 0)), 0);
      const tm = (expenseFilterDate || today).substring(0, 7);
      const mr = orders.filter(o => o.status === 'completed' && (getOrderDate(o) || '').startsWith(tm)).reduce((s, o) => s + (Number(o.total || 0)), 0);

      const prompt = `
        Role: Financial Analyst for a Cafe.
        Shop Operating Hours: 10:00 - 17:00.
        Today's Revenue: ${dr.toLocaleString()} THB
        Monthly Revenue (${tm}): ${mr.toLocaleString()} THB
        Total Expenses: ${totalExpenses.toLocaleString()} THB
        Net Monthly Profit: ${(mr - totalExpenses).toLocaleString()} THB
        Expense Breakdown: ${JSON.stringify(expensesByCategory)}

        Task: Analyze the financial health.
        1. Compare Today vs Month.
        2. Point out high-cost areas.
        3. Suggest a quick win.
        Language: Thai. Concise.
      `;

      const result = await callGeminiAPI(prompt, false);
      if (result.success) {
        setFinancialInsight(result.data);
      }

    } catch (e) {
      console.error(e);
      alert('วิเคราะห์ไม่สำเร็จ: ' + e.message);
    } finally {
      setIsAnalyzingFinances(false);
    }
  };

  // Add expense handler
  const handleAddExpense = async (e) => {
    e.preventDefault();
    const finalAmount = newExpense.amount || (Number(newExpense.quantity) * Number(newExpense.pricePerUnit));
    if (!newExpense.title || !finalAmount) return;
    await runDbAction(async () => {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'expenses'), {
        title: String(newExpense.title),
        quantity: Number(newExpense.quantity) || 0,
        unit: String(newExpense.unit || ''),
        pricePerUnit: Number(newExpense.pricePerUnit) || 0,
        amount: Number(finalAmount),
        category: String(newExpense.category),
        date: expenseFilterDate,
        createdAt: serverTimestamp()
      });
      setNewExpense({ title: '', quantity: '', unit: 'ชิ้น', pricePerUnit: '', amount: '', category: 'วัตถุดิบ' });
    }, 'บันทึกค่าใช้จ่ายไม่สำเร็จ');
  };

  return (
    <div className="h-full bg-[#f8faf9] flex flex-col animate-in fade-in duration-500 overflow-hidden text-gray-800">
      <header className="h-24 bg-white border-b border-gray-100 px-12 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4 text-red-600 uppercase font-black">
          <DollarSign size={32} />
          <h1 className="text-2xl font-black uppercase tracking-tight text-gray-800">ระบบรายจ่าย</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-2xl border border-gray-100">
            <button onClick={() => setExpenseViewMode('daily')} className={`px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${expenseViewMode === 'daily' ? 'bg-red-500 text-white shadow-lg' : 'text-gray-400 hover:text-red-500'}`}>รายวัน</button>
            <button onClick={() => setExpenseViewMode('monthly')} className={`px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${expenseViewMode === 'monthly' ? 'bg-red-500 text-white shadow-lg' : 'text-gray-400 hover:text-red-500'}`}>รายเดือน</button>
            <button onClick={() => setExpenseViewMode('all')} className={`px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${expenseViewMode === 'all' ? 'bg-red-500 text-white shadow-lg' : 'text-gray-400 hover:text-red-500'}`}>ทั้งหมด</button>
          </div>
          {expenseViewMode !== 'all' && (
            <div className="relative flex items-center bg-red-50 border border-red-100 rounded-3xl p-1.5 shadow-sm">
              <Calendar className="text-red-500 ml-4" size={22} />
              <input type="date" value={expenseFilterDate} onChange={(e) => setExpenseFilterDate(e.target.value)} className="bg-transparent border-none py-3 pl-3 pr-6 text-base font-black text-red-700 outline-none cursor-pointer" />
            </div>
          )}
        </div>
      </header>
      <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-8 p-4 lg:p-8 overflow-auto">
        {/* Left Column: Summary Cards */}
        <div className="w-full lg:w-[350px] xl:w-[400px] space-y-4 lg:space-y-6 shrink-0">
          {/* Total Expense Card */}
          <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-[3rem] p-10 text-white shadow-xl border-b-8 border-red-700/30">
            <p className="text-xs font-black uppercase tracking-[0.3em] opacity-70 mb-4">รายจ่ายรวม{expenseViewMode === 'daily' ? 'วันนี้' : expenseViewMode === 'monthly' ? 'เดือนนี้' : 'ทั้งหมด'}</p>
            <p className="text-5xl font-black tracking-tighter">฿{filteredExpenseStats.total.toLocaleString()}</p>
            <p className="text-sm font-bold opacity-60 mt-4">{filteredExpenseStats.count} รายการ</p>
          </div>

          {/* Category Breakdown */}
          <div className="bg-white rounded-[3rem] p-8 shadow-sm border border-gray-100">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.3em] mb-6">แยกตามหมวดหมู่</h3>
            <div className="space-y-4">
              {filteredExpenseStats.byCategory.length > 0 ? (
                filteredExpenseStats.byCategory.map(([cat, amount]) => (
                  <div key={cat} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-sm font-black text-gray-700">{cat}</span>
                    <span className="text-base font-black text-red-500">฿{amount.toLocaleString()}</span>
                  </div>
                ))
              ) : (
                <p className="text-center text-[11px] text-gray-400 font-black uppercase tracking-widest py-4">ไม่มีข้อมูล</p>
              )}
            </div>
          </div>

          {/* Add Expense Form */}
          <div className="bg-white rounded-[3rem] p-8 shadow-sm border border-gray-100 space-y-5">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.3em]">เพิ่มรายจ่ายใหม่</h3>
            <form onSubmit={handleAddExpense} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4 mb-2 block">ชื่อรายจ่าย</label>
                <input type="text" placeholder="ซื้อนมสด, กาแฟ..." required value={newExpense.title} onChange={e => setNewExpense({ ...newExpense, title: e.target.value })} className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-black outline-none shadow-inner focus:bg-white transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4 mb-2 block">ราคา/หน่วย</label>
                  <input type="number" placeholder="0.00" value={newExpense.pricePerUnit} onChange={e => setNewExpense({ ...newExpense, pricePerUnit: e.target.value })} className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-black outline-none shadow-inner" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4 mb-2 block">จำนวน</label>
                  <input type="number" placeholder="0" value={newExpense.quantity} onChange={e => setNewExpense({ ...newExpense, quantity: e.target.value })} className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-black outline-none shadow-inner" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4 mb-2 block">หน่วยเรียก</label>
                  <input type="text" placeholder="กล่อง, ถุง..." value={newExpense.unit} onChange={e => setNewExpense({ ...newExpense, unit: e.target.value })} className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-black outline-none shadow-inner" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4 mb-2 block">ราคารวม</label>
                  <input type="number" placeholder="คำนวณอัตโนมัติ..." value={newExpense.amount || (Number(newExpense.quantity) * Number(newExpense.pricePerUnit)) || ''} onChange={e => setNewExpense({ ...newExpense, amount: e.target.value })} className="w-full bg-gray-100 border border-gray-100 rounded-2xl p-4 text-sm font-black outline-none shadow-inner focus:bg-white transition-all text-red-500" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4 mb-2 block">หมวดหมู่</label>
                <select value={newExpense.category} onChange={e => setNewExpense({ ...newExpense, category: e.target.value })} className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-xs font-black outline-none shadow-inner cursor-pointer text-gray-800">
                  <option>วัตถุดิบ</option>
                  <option>ค่าจ้าง</option>
                  <option>ค่าไฟ/น้ำ</option>
                  <option>อื่น ๆ</option>
                </select>
              </div>
              <button type="submit" className="w-full bg-red-500 text-white py-5 rounded-2xl font-black text-xs uppercase shadow-xl active:scale-95 tracking-[0.2em] border-b-4 border-red-700 mt-2">บันทึกรายจ่าย</button>
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
                    <h3 className="font-black text-sm uppercase tracking-widest opacity-90">AI Financial Analysis</h3>
                    <button onClick={() => setFinancialInsight('')} className="p-1 hover:bg-white/20 rounded-lg transition-colors"><X size={16} /></button>
                  </div>
                  <p className="text-sm font-medium leading-relaxed opacity-95 whitespace-pre-wrap">{financialInsight}</p>
                </div>
              </div>
              <Zap size={100} className="absolute -bottom-4 -right-4 text-white/5 rotate-[-15deg]" />
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-6 space-y-3 scrollbar-hide">
            {filteredExpenseStats.expenses.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center opacity-30 uppercase">
                <DollarSign size={80} className="text-red-500 mb-6" />
                <p className="text-lg font-black text-gray-800 tracking-[0.2em]">ไม่มีรายจ่ายในช่วงนี้</p>
              </div>
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
                      <span className="text-[10px] font-black text-gray-400 uppercase">{e.date}</span>
                      <span className="text-[10px] font-black text-red-500 bg-red-50 px-2 py-0.5 rounded-lg border border-red-100">{e.category}</span>
                      {e.quantity > 0 && (
                        <span className="text-[10px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
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
