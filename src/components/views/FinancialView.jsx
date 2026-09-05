import React, { useState, useMemo, useEffect } from 'react';
import {
    PieChart, DollarSign, TrendingUp, Save, Trash2,
    Calculator, Wallet, Building, AlertCircle, Calendar
} from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { collection, addDoc, getDocs, query, orderBy, limit, deleteDoc, doc } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { getOrderDate, getISODate } from '../../utils/calculations';
import { ConfirmModal, useToast } from '../ui';

const FinancialView = () => {
    const { orders, expenses, callGeminiAPI } = useAppContext();
    const toast = useToast();

    // States
    const [selectedMonth, setSelectedMonth] = useState(getISODate().substring(0, 7));
    const [fixedCosts, setFixedCosts] = useState({
        rent: 0,
        untrackedSalaries: 0,
        otherFixed: 0
    });
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiPlan, setAiPlan] = useState(null);
    const [saveStatus, setSaveStatus] = useState(''); // 'saving', 'success', 'error'
    const [history, setHistory] = useState([]);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Calculate Current Month Data (Realtime)
    const currentFinancials = useMemo(() => {
        const currentMonth = selectedMonth;

        const monthOrders = orders.filter(o => o.status === 'completed' && getOrderDate(o).substring(0, 7) === currentMonth);
        const monthExpenses = expenses.filter(e => String(e.date).substring(0, 7) === currentMonth);

        const revenue = monthOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
        const recordedExpenses = monthExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

        return {
            month: currentMonth,
            revenue,
            recordedExpenses,
            netProfitBeforeFixed: revenue - recordedExpenses
        };
    }, [orders, expenses, selectedMonth]);

    // Fetch History
    const fetchHistory = async () => {
        try {
            const q = query(
                collection(db, 'artifacts', appId, 'public', 'data', 'financial_plans'),
                orderBy('createdAt', 'desc'),
                limit(5)
            );
            const snapshot = await getDocs(q);
            setHistory(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch {
            // Silent fail for history loading
        }
    };

    useEffect(() => {
        fetchHistory();
    }, []);

    // Auto-select plan for the chosen month from history
    useEffect(() => {
        if (!history.length) return;

        const matchedPlan = history.find(plan =>
            plan.financials?.month === selectedMonth ||
            // Fallback for older plans without month field, checking createdAt YYYY-MM
            plan.createdAt?.substring(0, 7) === selectedMonth
        );

        if (matchedPlan) {
            setAiPlan(matchedPlan);
        } else {
            setAiPlan(null);
        }
    }, [selectedMonth, history]);

    // Generate AI Plan
    const generatePlan = async () => {
        setIsAnalyzing(true);
        setAiPlan(null);

        try {
            const totalFixed = Number(fixedCosts.rent) + Number(fixedCosts.untrackedSalaries) + Number(fixedCosts.otherFixed);
            const totalExpenses = currentFinancials.recordedExpenses + totalFixed;
            const netProfit = currentFinancials.revenue - totalExpenses;

            const prompt = `
                Role: Professional F&B Financial Consultant.
                
                Data:
                1. Net Profit: ${netProfit.toLocaleString()} THB
                2. Variable Costs (COGS/Misc): ${currentFinancials.recordedExpenses.toLocaleString()} THB
                3. Fixed Costs (Rent/Salaries): ${totalFixed.toLocaleString()} THB
                4. Total Revenue: ${currentFinancials.revenue.toLocaleString()} THB

                Task: Create a financial strategy and profit allocation plan.
                
                Analysis Required:
                1. Cost Structure: Calculate estimated sales based on profit/variable costs. Check if COGS ratio is healthy (<35%).
                2. Risk Management: Estimate Break-even point.
                3. Immediate Action Plan: 3 steps to improve stability.

                Profit Allocation Strategy (Split Net Profit of ${netProfit.toLocaleString()} THB):
                1. Cash Reserve (35%) -> 'emergency_reserve'
                2. Marketing & Customer Acquisition (10%) -> 'marketing'
                3. Sinking Fund / Renovation (15%) -> 'sinking_fund'
                4. Owner's Dividend (30%) -> 'owner_dividend'
                5. Staff Incentive (10%) -> 'staff_incentive'

                IMPORTANT: REPLY IN THAI LANGUAGE ONLY.
                Output JSON format only:
                {
                    "health_status": "Excellent/Good/Warning/Critical",
                    "health_reason": "Analysis of Cost Structure, COGS ratio, and Break-even point (In Thai)",
                    "allocations": {
                        "emergency_reserve": { "amount": number, "percentage": 35, "reason": "Objective & Usage (Thai)" },
                        "marketing": { "amount": number, "percentage": 10, "reason": "Campaign/Ad ideas (Thai)" },
                        "sinking_fund": { "amount": number, "percentage": 15, "reason": "Maintenance/Upgrades (Thai)" },
                        "owner_dividend": { "amount": number, "percentage": 30, "reason": "Personal/Re-invest (Thai)" },
                        "staff_incentive": { "amount": number, "percentage": 10, "reason": "Bonus/Team Building (Thai)" }
                    },
                    "action_plan": ["Action 1 (Thai)", "Action 2 (Thai)", "Action 3 (Thai)"]
                }
            `;

            const result = await callGeminiAPI(prompt, true); // true for JSON parsing
            if (result.success) {
                setAiPlan(result.data);
            } else {
                toast.error("AI Error: " + result.error);
            }
        } catch {
            toast.error("ไม่สามารถสร้างแผนได้");
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Save Plan
    const savePlan = async () => {
        if (!aiPlan) return;
        setSaveStatus('saving');
        try {
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'financial_plans'), {
                ...aiPlan,
                financials: { ...currentFinancials, fixedCosts },
                createdAt: new Date().toISOString()
            });
            setSaveStatus('success');
            setTimeout(() => setSaveStatus(''), 3000);
            fetchHistory(); // Refresh history immediately
        } catch {
            toast.error('บันทึกแผนไม่สำเร็จ');
            setSaveStatus('error');
        }
    };

    // Delete Plan
    const deletePlan = () => {
        if (!aiPlan?.id) return;
        setShowDeleteConfirm(true);
    };

    const confirmDeletePlan = async () => {
        setShowDeleteConfirm(false);
        if (!aiPlan?.id) return;

        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'financial_plans', aiPlan.id));
            setAiPlan(null); // Clear current view
            fetchHistory(); // Refresh history
        } catch {
            toast.error('ลบแผนไม่สำเร็จ');
        }
    };

    return (
        <div className="h-full bg-[var(--bg-tertiary)] flex flex-col p-4 md:p-6 lg:p-6 overflow-y-auto">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl lg:text-3xl font-semibold text-[var(--text-primary)] tracking-tight flex items-center gap-2 md:gap-3">
                        <Wallet className="text-violet-600" size={24} />
                        วางแผนการเงิน
                    </h1>
                    <p className="text-[var(--text-secondary)] font-bold mt-1 ml-8 md:ml-11 text-sm md:text-base hidden md:block">วางแผนการเงินอัจฉริยะเพื่อความยั่งยืน</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="bg-[var(--bg-secondary)] px-6 py-3 rounded-2xl shadow-sm border border-[var(--border-color)] hidden md:block">
                        <p className="text-xs font-semibold text-[var(--text-muted)] tracking-widest">รายรับ (เดือนนี้)</p>
                        <p className="num text-right text-2xl font-semibold text-emerald-600">฿{currentFinancials.revenue.toLocaleString()}</p>
                    </div>
                    <div className="relative bg-[var(--bg-secondary)] border-2 border-emerald-100 flex items-center gap-3 px-6 py-3 rounded-2xl shadow-sm text-emerald-600 font-semibold text-xs tracking-widest leading-none shrink-0 cursor-pointer hover:bg-emerald-50 transition-colors">
                        <Calendar size={18} />
                        {new Date(selectedMonth + '-01').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            onClick={(e) => {
                                try { e.currentTarget.showPicker(); } catch { /* showPicker not supported */ }
                            }}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-[var(--z-nav)]"
                        />
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto w-full">

                {/* Input Column */}
                <div className="space-y-6">
                    <div className="bg-[var(--bg-secondary)] p-6 rounded-[var(--radius)] shadow-sm border border-[var(--border-color)]">
                        <h2 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                            <Building size={20} /> ต้นทุนคงที่ (Fixed Costs)
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-[var(--text-muted)] block mb-1">ค่าเช่าที่ / ค่าน้ำไฟ</label>
                                <input
                                    type="number"
                                    value={fixedCosts.rent}
                                    onChange={e => setFixedCosts({ ...fixedCosts, rent: Number(e.target.value) })}
                                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl px-4 py-2 font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-violet-500"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-[var(--text-muted)] block mb-1">เงินเดือนพนักงาน (ที่ยังไม่ลงระบบ)</label>
                                <input
                                    type="number"
                                    value={fixedCosts.untrackedSalaries}
                                    onChange={e => setFixedCosts({ ...fixedCosts, untrackedSalaries: Number(e.target.value) })}
                                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl px-4 py-2 font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-violet-500"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-[var(--text-muted)] block mb-1">สำรองอื่นๆ</label>
                                <input
                                    type="number"
                                    value={fixedCosts.otherFixed}
                                    onChange={e => setFixedCosts({ ...fixedCosts, otherFixed: Number(e.target.value) })}
                                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl px-4 py-2 font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-violet-500"
                                />
                            </div>
                            <div className="pt-4 border-t border-[var(--border-color)]">
                                <div className="flex justify-between text-sm font-semibold text-[var(--text-secondary)]">
                                    <span>รายจ่ายผันแปร (เข้าระบบ)</span>
                                    <span className="num text-right">฿{currentFinancials.recordedExpenses.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-lg font-semibold text-violet-600 mt-2">
                                    <span>กำไรสุทธิ (โดยประมาณ)</span>
                                    <span className="num text-right">
                                        ฿{(
                                            currentFinancials.revenue -
                                            currentFinancials.recordedExpenses -
                                            Number(fixedCosts.rent) -
                                            Number(fixedCosts.untrackedSalaries) -
                                            Number(fixedCosts.otherFixed)
                                        ).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={generatePlan}
                            disabled={isAnalyzing}
                            className="w-full mt-6 bg-gradient-to-r from-violet-600 to-indigo-600 text-white py-4 rounded-xl font-semibold shadow-[var(--elev-2)] hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isAnalyzing ? (
                                <>กำลังวิเคราะห์...</>
                            ) : (
                                <><Calculator size={20} /> วิเคราะห์แผนการเงินด้วย AI</>
                            )}
                        </button>
                    </div>

                    {/* History List */}
                    <div className="bg-[var(--bg-secondary)] p-6 rounded-[var(--radius)] shadow-sm border border-[var(--border-color)]">
                        <h2 className="font-semibold text-[var(--text-primary)] mb-4 text-sm tracking-wider">ประวัติการวางแผน</h2>
                        <div className="space-y-3">
                            {history.length > 0 ? (
                                history.map(plan => (
                                    <div key={plan.id} className="p-3 bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-color)] text-xs text-[var(--text-secondary)]">
                                        <div className="flex justify-between font-bold mb-1">
                                            <span>{new Date(plan.createdAt).toLocaleDateString()}</span>
                                            <span className={plan.health_status === 'Excellent' ? 'text-[var(--state-ok)]' : 'text-[var(--state-warn)]'}>{plan.health_status}</span>
                                        </div>
                                        <div className="num text-right truncate opacity-70">Rev: ฿{plan.financials?.revenue?.toLocaleString()}</div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-center text-[var(--text-muted)] text-xs py-4">ยังไม่มีประวัติ</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Result Column */}
                <div className="lg:col-span-2 space-y-6">
                    {aiPlan ? (
                        <div className="bg-[var(--bg-secondary)] p-6 rounded-[var(--radius)] shadow-[var(--elev-3)] border border-violet-100 space-y-8 animate-in slide-in-from-bottom-4">

                            {/* Health Header */}
                            <div className="flex items-start justify-between">
                                <div>
                                    <h2 className="text-2xl font-semibold text-[var(--text-primary)]">แผนการเงินแนะนำ</h2>
                                    <p className={`text-sm font-bold mt-1 ${aiPlan.health_status === 'Critical' ? 'text-[var(--state-danger)]' :
                                        aiPlan.health_status === 'Warning' ? 'text-[var(--state-warn)]' : 'text-[var(--state-ok)]'
                                        }`}>
                                        Health Status: {aiPlan.health_status}
                                    </p>
                                    <p className="text-[var(--text-secondary)] text-sm mt-2 max-w-md">{aiPlan.health_reason}</p>
                                </div>
                                <div className="flex gap-2">
                                    {aiPlan.id && (
                                        <button
                                            onClick={deletePlan}
                                            className="px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all bg-red-50 text-red-500 hover:bg-red-100"
                                        >
                                            <Trash2 size={18} /> ลบแผน
                                        </button>
                                    )}
                                    <button
                                        onClick={savePlan}
                                        disabled={saveStatus === 'success' || aiPlan.id}
                                        className={`px-6 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all ${saveStatus === 'success' || aiPlan.id ? 'bg-[var(--state-ok)]/10 text-[var(--state-ok)] cursor-default' : 'bg-[var(--surface-inverse)] text-white hover:bg-[var(--surface-inverse-hover)]'
                                            }`}
                                    >
                                        <Save size={18} /> {saveStatus === 'success' || aiPlan.id ? 'บันทึกแล้ว' : 'บันทึกแผน'}
                                    </button>
                                </div>
                            </div>

                            {/* Allocation Cards */}
                            <div className="grid grid-cols-2 gap-4">
                                {Object.entries(aiPlan.allocations || {}).map(([key, data]) => {
                                    const labels = {
                                        emergency_reserve: '💰 เงินสำรองฉุกเฉิน (Cash Reserve)',
                                        marketing: '📣 งบการตลาด (Marketing)',
                                        sinking_fund: '🛠️ งบซ่อมบำรุง (Sinking Fund)',
                                        owner_dividend: '💼 ปันผลเจ้าของ (Owner\'s Dividend)',
                                        staff_incentive: '🎁 โบนัสพนักงาน (Staff Incentive)'
                                    };
                                    return (
                                        <div key={key} className="p-4 rounded-2xl bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-xs font-semibold text-[var(--text-muted)] tracking-widest">{labels[key] || key}</span>
                                            <span className="num text-right bg-[var(--bg-secondary)] px-2 py-1 rounded-lg text-xs font-semibold shadow-sm">{data?.percentage ?? 0}%</span>
                                            </div>
                                            <p className="num text-right text-2xl font-semibold text-[var(--text-primary)] mb-2">฿{Number(data?.amount || 0).toLocaleString()}</p>
                                            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{data?.reason}</p>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Action Plan */}
                            <div className="bg-violet-50 rounded-2xl p-6 border border-violet-100">
                                <h3 className="font-semibold text-violet-700 mb-4 flex items-center gap-2">
                                    <TrendingUp size={20} /> แผนปฏิบัติการเชิงกลยุทธ์ (Action Plan)
                                </h3>
                                <div className="space-y-3">
                                    {(aiPlan.action_plan || []).map((step, idx) => (
                                        <div key={idx} className="flex gap-3 items-start">
                                            <div className="w-6 h-6 rounded-full bg-violet-200 text-violet-700 flex items-center justify-center font-semibold text-xs shrink-0 mt-0.5">
                                                {idx + 1}
                                            </div>
                                            <p className="text-[var(--text-primary)] text-sm font-medium">{step}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center p-12 text-center text-[var(--text-muted)] border-2 border-dashed border-[var(--border-color)] rounded-[var(--radius)]">
                            <Wallet size={64} className="mb-4 opacity-20" />
                            <p className="font-bold text-lg">เริ่มต้นวางแผนการเงิน</p>
                            <p className="text-sm">กรอกข้อมูลต้นทุนคงที่ด้านซ้าย แล้วกดปุ่ม "วิเคราะห์แผนการเงินด้วย AI"</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Delete Plan Confirm Modal */}
            <ConfirmModal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={confirmDeletePlan}
                title="ลบแผนการเงิน"
                message="คุณต้องการลบแผนการเงินนี้ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้"
                confirmText="ลบ"
                cancelText="ยกเลิก"
                variant="danger"
            />
        </div >
    );
};

export default FinancialView;
