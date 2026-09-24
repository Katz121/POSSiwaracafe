import React, { useState, useMemo, useEffect } from 'react';
import { TrendingUp, Save, Trash2, Calculator, Wallet, Building, Landmark, Sparkles } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { collection, addDoc, getDocs, query, orderBy, limit, deleteDoc, doc } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { getOrderDate, getISODate } from '../../utils/calculations';
import { formatPercent, formatThaiDate } from '../../utils/format';
import { Badge, Button, ConfirmModal, DateStepper, EmptyState, Input, Money, PageHeader, SectionCard, StatCard, useToast } from '../ui';

const ALLOCATION_LABELS = {
    emergency_reserve: 'เงินสำรองฉุกเฉิน',
    marketing: 'งบการตลาด',
    sinking_fund: 'งบซ่อมบำรุง',
    owner_dividend: 'ปันผลเจ้าของ',
    staff_incentive: 'โบนัสพนักงาน',
};
// AI answers the status in English (prompt contract) · show it in Thai.
const HEALTH_LABELS = { Excellent: 'ดีมาก', Good: 'ดี', Warning: 'ต้องระวัง', Critical: 'วิกฤต' };

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

    const totalFixed = Number(fixedCosts.rent) + Number(fixedCosts.untrackedSalaries) + Number(fixedCosts.otherFixed);
    const estimatedNet = currentFinancials.revenue - currentFinancials.recordedExpenses - totalFixed;
    const healthTone = aiPlan?.health_status === 'Critical' ? 'danger' : aiPlan?.health_status === 'Warning' ? 'warn' : 'ok';
    const fixedField = (key, label) => (
        <Input
            label={label}
            type="number"
            inputMode="decimal"
            min={0}
            prefix="฿"
            value={fixedCosts[key]}
            onChange={e => setFixedCosts({ ...fixedCosts, [key]: Number(e.target.value) })}
            inputClassName="num min-h-11"
        />
    );

    return (
        <div className="h-full bg-[var(--bg-canvas)] flex flex-col overflow-hidden text-[var(--text-primary)]">
            <PageHeader
                title="วางแผนการเงิน"
                subtitle="ต้นทุนคงที่ + แผนแบ่งกำไรด้วย AI"
                icon={Landmark}
                sticky={false}
                actions={<DateStepper mode="month" value={selectedMonth} onChange={value => value && setSelectedMonth(value)} />}
            />

            <div className="flex-1 overflow-y-auto px-[var(--page-pad)] py-5 md:py-6 pb-24 md:pb-10">
                <div className="max-w-[1400px] mx-auto flex flex-col gap-6">
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                        <StatCard label="รายรับ" icon={TrendingUp} tone="ok" value={<Money value={currentFinancials.revenue} />} hint={formatThaiDate(selectedMonth, { style: 'month' })} />
                        <StatCard label="รายจ่ายในระบบ" icon={Wallet} value={<Money value={currentFinancials.recordedExpenses} />} hint="ทุกหมวดรวมของเสีย" />
                        <StatCard
                            className="col-span-2 lg:col-span-1"
                            label="กำไรสุทธิ (โดยประมาณ)"
                            icon={Calculator}
                            tone={estimatedNet < 0 ? 'danger' : 'neutral'}
                            value={<Money value={estimatedNet} />}
                            hint="หักต้นทุนคงที่ที่กรอกด้านล่างแล้ว"
                        />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-6">
                        {/* Input Column */}
                        <div className="flex flex-col gap-6">
                            <SectionCard
                                title={<span className="inline-flex items-center gap-2"><Building size={20} className="text-[var(--text-secondary)]" />ต้นทุนคงที่</span>}
                                description="ค่าใช้จ่ายที่ยังไม่ได้บันทึกในระบบ"
                            >
                                <div className="flex flex-col gap-4">
                                    {fixedField('rent', 'ค่าเช่าที่ / ค่าน้ำไฟ')}
                                    {fixedField('untrackedSalaries', 'เงินเดือนพนักงาน (ที่ยังไม่ลงระบบ)')}
                                    {fixedField('otherFixed', 'สำรองอื่นๆ')}
                                    <dl className="pt-4 border-t border-[var(--border-color)] flex flex-col gap-2">
                                        <div className="flex justify-between gap-3 text-sm text-[var(--text-secondary)]">
                                            <dt>รายจ่ายผันแปร (เข้าระบบ)</dt>
                                            <dd><Money value={currentFinancials.recordedExpenses} /></dd>
                                        </div>
                                        <div className="flex justify-between gap-3 text-sm text-[var(--text-secondary)]">
                                            <dt>ต้นทุนคงที่ที่กรอก</dt>
                                            <dd><Money value={totalFixed} /></dd>
                                        </div>
                                        <div className="flex justify-between gap-3 font-semibold text-[var(--text-primary)]">
                                            <dt>กำไรสุทธิ (โดยประมาณ)</dt>
                                            <dd><Money value={estimatedNet} size="lg" tone={estimatedNet < 0 ? 'danger' : undefined} /></dd>
                                        </div>
                                    </dl>
                                    <Button variant="ai" size="lg" fullWidth loading={isAnalyzing} leftIcon={<Sparkles size={18} />} onClick={generatePlan}>
                                        วิเคราะห์แผนการเงินด้วย AI
                                    </Button>
                                </div>
                            </SectionCard>

                            {/* History List */}
                            <SectionCard title="ประวัติการวางแผน" description="5 แผนล่าสุด">
                                {history.length > 0 ? (
                                    <ul className="flex flex-col divide-y divide-[var(--border-light)]">
                                        {history.map(plan => (
                                            <li key={plan.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                                                <div className="min-w-0">
                                                    <p className="text-[var(--text-primary)]">{formatThaiDate(plan.createdAt)}</p>
                                                    <p className="text-[var(--text-muted)]">รายรับ <Money value={plan.financials?.revenue || 0} /></p>
                                                </div>
                                                <Badge tone={plan.health_status === 'Critical' ? 'danger' : plan.health_status === 'Warning' ? 'warn' : 'ok'} size="sm">{HEALTH_LABELS[plan.health_status] || plan.health_status || '-'}</Badge>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-center text-[var(--text-muted)] text-sm py-4">ยังไม่มีประวัติ</p>
                                )}
                            </SectionCard>
                        </div>

                        {/* Result Column */}
                        <div className="flex flex-col gap-6 min-w-0">
                            {aiPlan ? (
                                <SectionCard
                                    title="แผนการเงินแนะนำ"
                                    description={aiPlan.health_reason}
                                    actions={(
                                        <>
                                            {aiPlan.id && (
                                                <Button variant="outline-danger" leftIcon={<Trash2 size={18} />} onClick={deletePlan}>ลบแผน</Button>
                                            )}
                                            <Button
                                                variant={saveStatus === 'success' || aiPlan.id ? 'secondary' : 'primary'}
                                                leftIcon={<Save size={18} />}
                                                onClick={savePlan}
                                                disabled={saveStatus === 'success' || !!aiPlan.id}
                                                loading={saveStatus === 'saving'}
                                            >
                                                {saveStatus === 'success' || aiPlan.id ? 'บันทึกแล้ว' : 'บันทึกแผน'}
                                            </Button>
                                        </>
                                    )}
                                >
                                    <div className="flex flex-col gap-6">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-[var(--text-secondary)]">สุขภาพการเงิน</span>
                                            <Badge tone={healthTone}>{HEALTH_LABELS[aiPlan.health_status] || aiPlan.health_status}</Badge>
                                        </div>

                                        {/* Allocation Cards */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {Object.entries(aiPlan.allocations || {}).map(([key, data]) => (
                                                <div key={key} className="p-4 rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] flex flex-col gap-1.5">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <span className="text-sm font-medium text-[var(--text-secondary)]">{ALLOCATION_LABELS[key] || key}</span>
                                                        <span className="num shrink-0 text-sm font-semibold text-[var(--text-primary)]">{formatPercent(data?.percentage ?? 0, { digits: 0 })}</span>
                                                    </div>
                                                    <Money value={Number(data?.amount || 0)} size="2xl" className="font-semibold text-[var(--text-primary)]" />
                                                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{data?.reason}</p>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Action Plan */}
                                        <div>
                                            <h3 className="font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                                                <TrendingUp size={20} className="text-[var(--accent)]" /> แผนปฏิบัติการ
                                            </h3>
                                            <ol className="flex flex-col gap-3">
                                                {(aiPlan.action_plan || []).map((step, idx) => (
                                                    <li key={idx} className="flex gap-3 items-start">
                                                        <span className="w-7 h-7 rounded-full bg-[var(--accent-soft)] text-[var(--accent-soft-fg)] flex items-center justify-center font-semibold text-sm shrink-0 num">{idx + 1}</span>
                                                        <p className="text-[var(--text-primary)] leading-relaxed">{step}</p>
                                                    </li>
                                                ))}
                                            </ol>
                                        </div>
                                    </div>
                                </SectionCard>
                            ) : (
                                <SectionCard className="flex-1 flex items-center justify-center">
                                    <EmptyState
                                        icon={Wallet}
                                        title="เริ่มต้นวางแผนการเงิน"
                                        description={'กรอกต้นทุนคงที่ แล้วกด "วิเคราะห์แผนการเงินด้วย AI"'}
                                    />
                                </SectionCard>
                            )}
                        </div>
                    </div>
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
        </div>
    );
};

export default FinancialView;
