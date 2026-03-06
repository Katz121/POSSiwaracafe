import React, { useState, useMemo, useEffect } from 'react';
import {
    BarChart3, Calendar, FileText, Zap, TrendingUp, Target,
    Trash2, Flame, Crown, Activity, ShoppingBag, X, Send, Bot
} from 'lucide-react';
import { useAppContext } from '../../context/AppContext';

/**
 * DashboardView - Business Insights Dashboard
 */
const DashboardView = () => {
    // 1. Get Data from Context
    const {
        orders,
        expenses,
        stock,
        members,
        callGeminiAPI
    } = useAppContext();

    const [showConsultantModal, setShowConsultantModal] = useState(false);
    const [consultantQuery, setConsultantQuery] = useState('');
    const [consultantResponse, setConsultantResponse] = useState('');
    const [isConsulting, setIsConsulting] = useState(false);

    // --- Helper Functions ---
    const getISODate = (date = new Date()) => {
        const d = new Date(date);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().split('T')[0];
    };

    const getOrderDate = (order) => {
        if (order.date) return String(order.date);
        if (order.createdAt?.seconds) {
            return getISODate(new Date(order.createdAt.seconds * 1000));
        }
        return '';
    };

    // --- Statistics Calculations ---
    const today = getISODate();
    const [selectedMonth, setSelectedMonth] = useState(today.substring(0, 7));

    // Use selectedMonth instead of currentMonth
    const currentMonth = selectedMonth;

    // 1. Monthly Stats
    const monthlyStats = useMemo(() => {
        const monthOrders = orders.filter(o => o.status === 'completed' && String(getOrderDate(o)).startsWith(currentMonth));
        const monthExpenses = expenses.filter(e => String(e.date || '').startsWith(currentMonth));

        const revenue = monthOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
        const expenseTotal = monthExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const count = monthOrders.length;

        return {
            revenue,
            cost: expenseTotal,
            profit: revenue - expenseTotal,
            count
        };
    }, [orders, expenses, currentMonth]);

    // 2. Dashboard Specific Stats
    const dashboardStats = useMemo(() => {
        // a. Waste Cost
        // Assuming 'Waste' or 'waste' or 'ของเสีย' in expense category or title
        // Or if expenses have a specific type. For now, treating 'waste' category expenses.
        // If not explicit, we might need to rely on what user enters. 
        // Let's assume there's a category map or check titles.
        const wasteExpenses = expenses.filter(e =>
            String(e.date || '').startsWith(currentMonth) &&
            (String(e.category).toLowerCase().includes('waste') || String(e.title).includes('waste') || String(e.title).includes('ทิ้ง'))
        );
        const totalWasteCost = wasteExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

        // b. Low Stock
        const lowStockCount = stock.filter(s => Number(s.quantity) <= Number(s.minQuantity || 5)).length;

        // c. Top Products
        const monthOrders = orders.filter(o => o.status === 'completed' && String(getOrderDate(o)).startsWith(currentMonth));
        const productMap = {};
        const profitMap = {}; // profit per item (revenue - cost if known, else just revenue)

        monthOrders.forEach(order => {
            (order.items || []).forEach(item => {
                const qty = Number(item.quantity || 0);
                const price = Number(item.price || 0);
                // Try to find cost from stock? Too complex for now, assume 30% cost or just track revenue top.
                // Or if 'profit' is stored in item? No.
                // Let's just track sales count for Top Products
                productMap[item.name] = (productMap[item.name] || 0) + qty;

                // For Profitable items, we really need cost. If stock link exists...
                // Lets estimate profit as price * qty for "Revenue" driven profit if actual cost unknown
                // Or if stock has unitCost.
                // Simplified: Tracking Total Revenue per item as "Profitable" proxy for now if strictly no cost data.
                profitMap[item.name] = (profitMap[item.name] || 0) + (price * qty);
            });
        });

        const topProducts = Object.entries(productMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }));

        const topProfitable = Object.entries(profitMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, totalProfit]) => ({ name, totalProfit }));

        // d. Hourly Sales & Peak Hour
        const hourlySales = new Array(24).fill(0);
        monthOrders.forEach(o => {
            let hour = 12; // default
            if (o.createdAt?.seconds) {
                hour = new Date(o.createdAt.seconds * 1000).getHours();
            } else if (o.timestamp) { // legacy
                hour = new Date(o.timestamp).getHours();
            }
            if (hour >= 0 && hour < 24) hourlySales[hour] += (Number(o.total) || 0);
        });

        const maxSales = Math.max(...hourlySales);
        const peakHour = maxSales > 0 ? hourlySales.indexOf(maxSales) : null;

        return {
            totalWasteCost,
            lowStockCount,
            topProducts,
            topProfitable,
            hourlySales,
            peakHour
        };
    }, [orders, expenses, stock, currentMonth]);


    // --- AI Consultant Logic ---
    const handleConsultantQuery = async () => {
        if (!consultantQuery.trim()) return;
        setIsConsulting(true);
        setConsultantResponse('');

        try {
            // Prepare Data for Prompt
            const { revenue, profit, count } = monthlyStats;
            const { totalWasteCost, lowStockCount, topProducts } = dashboardStats;

            // Build Prompt
            const systemPrompt = `
                คุณคือที่ปรึกษาธุรกิจร้านคาเฟ่มืออาชีพ "AI Manager"
                ข้อมูลร้านเดือนนี้ (${selectedMonth}):
                - รายได้: ${revenue.toLocaleString()} บาท (${count} ออเดอร์)
                - กำไร (Revenue - Expenses): ${profit.toLocaleString()} บาท
                - ต้นทุนของเสีย (Waste): ${totalWasteCost.toLocaleString()} บาท
                - สินค้าขายดี 5 อันดับ: ${topProducts.map(p => `${p.name} (${p.count})`).join(', ')}
                - รายการเสี่ยงของหมด (Low Stock): ${lowStockCount} รายการ
                
                หน้าที่: ตอบคำถามเจ้าของร้านด้วยข้อมูลจริง ให้คำแนะนำเชิงกลยุทธ์ เน้นเพิ่มกำไรและลดต้นทุน
                สไตล์ตอบ: เป็นกันเอง มืออาชีพ กระชับ สั้นได้ใจความ ใช้ Emoji ประกอบ
            `;

            const userPrompt = `คำถาม: "${consultantQuery}"`;

            const result = await callGeminiAPI(systemPrompt + '\n' + userPrompt);
            if (result.success) {
                setConsultantResponse(result.data);
            } else {
                setConsultantResponse('ขออภัย AI ไม่พร้อมใช้งานชั่วคราว (' + (result.error || 'Unknown') + ')');
            }
        } catch (error) {
            setConsultantResponse('เกิดข้อผิดพลาดในการเชื่อมต่อ');
        } finally {
            setIsConsulting(false);
        }
    };

    // Quick Suggestion Chips
    const suggestions = [
        "วิเคราะห์กำไรเดือนนี้หน่อย",
        "มีเมนูไหนควรตัดออกไหม?",
        "แนะนำโปรโมชั่นกระตุ้นยอดขาย",
        "วิธีลดของเสียในร้าน"
    ];

    return (
        <div className="h-full bg-[#f8faf9] flex flex-col animate-in fade-in duration-700 overflow-hidden text-gray-800 relative">

            {/* AI Consultant Modal */}
            {showConsultantModal && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-white/20 ring-4 ring-black/5">
                        <div className="p-8 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shrink-0 relative overflow-hidden">
                            <div className="relative z-10 flex justify-between items-start">
                                <div className="flex items-center gap-4">
                                    <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md">
                                        <Bot size={32} />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black uppercase tracking-tight">AI Business Partner</h3>
                                        <p className="text-white/80 text-sm font-medium">ผู้ช่วยวิเคราะห์ธุรกิจส่วนตัว 24/7</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowConsultantModal(false)} className="bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-all"><X size={24} /></button>
                            </div>
                            <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 opacity-20"><Zap size={200} /></div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-gray-50/50">
                            {consultantResponse ? (
                                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 animate-in slide-in-from-bottom-2">
                                    <div className="flex items-center gap-3 mb-4 text-violet-600 font-black uppercase text-xs tracking-widest">
                                        <Bot size={16} /> AI Analysis
                                    </div>
                                    <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-line">
                                        {consultantResponse}
                                    </div>
                                    <button onClick={() => setConsultantResponse('')} className="mt-6 text-xs font-bold text-gray-400 hover:text-violet-600 transition-colors">
                                        ถามคำถามใหม่
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-center py-10 opacity-40">
                                    <Bot size={64} className="mb-4 text-gray-400" />
                                    <p className="font-bold text-gray-500">พร้อมวิเคราะห์ข้อมูลร้านของคุณ</p>
                                    <p className="text-sm">พิมพ์คำถามด้านล่างได้เลยครับ</p>
                                </div>
                            )}
                        </div>

                        <div className="p-6 bg-white border-t border-gray-100 shrink-0 space-y-4">
                            {!consultantResponse && (
                                <div className="flex flex-wrap gap-2">
                                    {suggestions.map((s, i) => (
                                        <button key={i} onClick={() => setConsultantQuery(s)} className="text-[10px] font-bold bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-violet-50 hover:text-violet-600 transition-all border border-transparent hover:border-violet-100">
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="relative">
                                <input
                                    type="text"
                                    value={consultantQuery}
                                    onChange={(e) => setConsultantQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleConsultantQuery()}
                                    placeholder="ถามเกี่ยวกับยอดขาย, กำไร, หรือขอคำแนะนำ..."
                                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 pl-6 pr-14 font-medium text-gray-700 focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 transition-all"
                                    disabled={isConsulting}
                                />
                                <button
                                    onClick={handleConsultantQuery}
                                    disabled={!consultantQuery.trim() || isConsulting}
                                    className="absolute right-2 top-2 bottom-2 aspect-square bg-violet-600 text-white rounded-xl flex items-center justify-center hover:bg-violet-700 disabled:bg-gray-200 disabled:text-gray-400 transition-all shadow-lg shadow-violet-500/20"
                                >
                                    {isConsulting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={20} />}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <header className="h-24 bg-white border-b border-gray-100 px-12 flex items-center justify-between shadow-sm z-10 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-500 text-white rounded-2xl shadow-lg ring-4 ring-emerald-500/10">
                        <BarChart3 size={28} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-tight text-gray-800">Business Insights</h1>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mt-1">สรุปข้อมูลเชิงลึกของร้านคุณ</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={() => setShowConsultantModal(true)} className="bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-lg hover:scale-105 transition-all active:scale-95 border-b-4 border-violet-700">
                        <Zap size={18} fill="currentColor" /> ถาม AI ที่ปรึกษา
                    </button>
                    <div className="relative bg-white border-2 border-emerald-100 flex items-center gap-3 px-6 py-3 rounded-2xl shadow-sm text-emerald-600 font-black uppercase text-xs tracking-widest leading-none shrink-0 cursor-pointer hover:bg-emerald-50 transition-colors">
                        <Calendar size={18} />
                        {new Date(selectedMonth + '-01').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            onClick={(e) => {
                                try {
                                    e.currentTarget.showPicker();
                                } catch (error) {
                                    // ignore
                                }
                            }}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                    </div>
                    <button onClick={() => window.print()} className="bg-gray-800 text-white p-3.5 rounded-2xl hover:bg-gray-700 transition-all shadow-lg active:scale-95"><FileText size={20} /></button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-10 space-y-10 scrollbar-hide pb-32">
                {/* Top Summaries */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    <div className="bg-white rounded-[3rem] p-8 shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
                        <div className="flex justify-between items-start mb-6">
                            <div className="w-14 h-14 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center shadow-inner"><TrendingUp size={28} /></div>
                            <span className="text-[10px] font-black text-emerald-500 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100 uppercase tracking-widest">Revenue</span>
                        </div>
                        <div>
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">รายรับเดือนนี้</p>
                            <p className="text-4xl font-black text-gray-800 tracking-tighter">฿{monthlyStats.revenue.toLocaleString()}</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-[3rem] p-8 shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
                        <div className="flex justify-between items-start mb-6">
                            <div className="w-14 h-14 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center shadow-inner"><Target size={28} /></div>
                            <span className="text-[10px] font-black text-blue-500 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-100 uppercase tracking-widest">{monthlyStats.count} ออเดอร์</span>
                        </div>
                        <div>
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">ออเดอร์สำเร็จ</p>
                            <p className="text-4xl font-black text-gray-800 tracking-tighter">{(monthlyStats.count).toLocaleString()}</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-[3rem] p-8 shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
                        <div className="flex justify-between items-start mb-6">
                            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center shadow-inner"><Trash2 size={28} /></div>
                            <span className={`text-[10px] font-black px-3 py-1.5 rounded-xl border uppercase tracking-widest ${dashboardStats.totalWasteCost > 500 ? 'bg-red-100 text-red-600 border-red-200' : 'bg-gray-50 text-gray-400'}`}>Waste Cost</span>
                        </div>
                        <div>
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">มูลค่าของเสีย (เดือนนี้)</p>
                            <p className="text-4xl font-black text-red-600 tracking-tighter">฿{dashboardStats.totalWasteCost.toLocaleString()}</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-[3rem] p-8 shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
                        <div className="flex justify-between items-start mb-6">
                            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center shadow-inner"><Flame size={28} /></div>
                            <span className={`text-[10px] font-black px-3 py-1.5 rounded-xl border uppercase tracking-widest ${dashboardStats.lowStockCount > 0 ? 'bg-red-100 text-red-600 border-red-200 animate-pulse' : 'bg-green-50 text-green-600 border-green-100'}`}>{dashboardStats.lowStockCount} Items Low</span>
                        </div>
                        <div>
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">วัตถุดิบใกล้หมด</p>
                            <p className="text-4xl font-black text-gray-800 tracking-tighter">{dashboardStats.lowStockCount}</p>
                        </div>
                    </div>
                </div>

                {/* Middle Charts Content */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Product Popularity */}
                    <div className="lg:col-span-2 bg-white rounded-[3.5rem] p-10 shadow-sm border border-gray-100 flex flex-col">
                        <div className="flex justify-between items-center mb-10">
                            <h2 className="text-lg font-black text-gray-800 uppercase tracking-tight flex items-center gap-3"><Crown className="text-amber-500" /> สินค้าขายดีที่สุด (เดือนปัจจุบัน)</h2>
                        </div>
                        <div className="space-y-8 flex-1">
                            {dashboardStats.topProducts.map((p, idx) => {
                                const max = Math.max(...dashboardStats.topProducts.map(x => x.count), 1);
                                const percent = (p.count / max) * 100;
                                return (
                                    <div key={idx} className="space-y-3">
                                        <div className="flex justify-between items-end">
                                            <span className="text-base font-black text-gray-700">{p.name}</span>
                                            <span className="text-sm font-black text-emerald-600">{p.count} ชิ้น</span>
                                        </div>
                                        <div className="h-4 bg-gray-50 rounded-full overflow-hidden border border-gray-100 p-0.5">
                                            <div
                                                className="h-full rounded-full transition-all duration-1000 ease-out"
                                                style={{
                                                    width: `${percent}%`,
                                                    background: `linear-gradient(90deg, #10b981 ${percent}%, #34d399 100%)`
                                                }}
                                            ></div>
                                        </div>
                                    </div>
                                );
                            })}
                            {dashboardStats.topProducts.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center opacity-20 grayscale">
                                    <ShoppingBag size={80} />
                                    <p className="font-black uppercase tracking-widest mt-4">ยังไม่มีข้อมูลการขาย</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Peak Hours (Visual Matrix) */}
                    <div className="bg-gray-900 rounded-[3.5rem] p-10 text-white shadow-2xl relative overflow-hidden border-b-8 border-emerald-500">
                        <div className="relative z-10 flex flex-col h-full">
                            <h2 className="text-lg font-black uppercase tracking-widest mb-8 flex items-center gap-3 text-emerald-400"><Activity /> ช่วงเวลาขายดี (Peak Hours)</h2>
                            <div className="flex-1 grid grid-cols-4 gap-4 content-start">
                                {dashboardStats.hourlySales.map((revenue, hour) => {
                                    const max = Math.max(...dashboardStats.hourlySales, 1);
                                    const intensity = max > 0 ? revenue / max : 0;
                                    if (hour < 10 || hour > 17) return null; // Show only store hours (10.00-17.00)
                                    return (
                                        <div key={hour} className="flex flex-col items-center gap-2">
                                            <div
                                                className="w-full rounded-xl transition-all duration-700 border border-white/10 flex items-center justify-center"
                                                style={{
                                                    height: '60px',
                                                    background: intensity > 0 ? `rgba(16, 185, 129, ${0.1 + intensity * 0.9})` : 'rgba(255,255,255,0.03)',
                                                    boxShadow: intensity > 0.8 ? '0 0 20px rgba(16, 185, 129, 0.4)' : 'none'
                                                }}
                                            >
                                                {intensity > 0.5 && <Flame size={16} className="text-white animate-pulse" />}
                                            </div>
                                            <span className="text-[10px] font-black text-gray-500">{hour}:00</span>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-8 pt-8 border-t border-white/10">
                                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">ช่วงเวลาที่ลูกค้าแน่นที่สุด:</p>
                                {dashboardStats.peakHour !== null ? (
                                    <>
                                        <p className="text-3xl font-black text-white tracking-tighter">{dashboardStats.peakHour}:00 - {dashboardStats.peakHour + 1}:00 น.</p>
                                        <p className="text-xs text-gray-500 font-bold mt-2">วิเคราะห์จากยอดขายรวมรายชั่วโมงในเดือนนี้</p>
                                    </>
                                ) : (
                                    <p className="text-xl font-black text-gray-400 tracking-tight animate-pulse">รอข้อมูลการขาย...</p>
                                )}
                            </div>
                        </div>
                        <div className="absolute -bottom-10 -right-10 opacity-10 text-emerald-500">
                            <Activity size={240} />
                        </div>
                    </div>
                </div>

                {/* Bottom Row - Profit Margin & Profitable Items */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-white rounded-[3rem] p-10 shadow-sm border border-gray-100 flex items-center gap-10">
                        <div className="relative flex-shrink-0">
                            <div className="w-32 h-32 rounded-full border-[16px] border-emerald-500 flex items-center justify-center shadow-lg">
                                <span className="text-2xl font-black text-gray-800">{Math.round((monthlyStats.profit / (monthlyStats.revenue || 1)) * 100)}%</span>
                            </div>
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight mb-2">Profit Margin</h3>
                            <p className="text-3xl font-black text-emerald-600 mb-2">฿{monthlyStats.profit.toLocaleString()}</p>
                            <p className="text-xs text-gray-400 font-bold leading-relaxed">คำนวณจากยอดขายหักลบรายจ่ายทั้งหมดในระบบ เรียลไทม์</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-[3rem] p-10 shadow-sm border border-gray-100 flex items-center gap-10">
                        <div className="w-32 h-32 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 shrink-0">
                            <TrendingUp size={64} />
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight mb-4">Top 5 Profitable Items</h3>
                            <div className="space-y-3">
                                {dashboardStats.topProfitable.map((p, idx) => (
                                    <div key={idx} className="flex justify-between items-center text-xs">
                                        <span className="font-bold text-gray-600 truncate">{idx + 1}. {p.name}</span>
                                        <span className="font-black text-emerald-600 shrink-0 ml-4">฿{Math.round(p.totalProfit).toLocaleString()}</span>
                                    </div>
                                ))}
                                {dashboardStats.topProfitable.length === 0 && <p className="text-[10px] text-gray-400 italic">ต้องการข้อมูลยอดขายเพิ่มเติม...</p>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardView;
