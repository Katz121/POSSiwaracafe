import React, { useState, useMemo, useEffect } from 'react';
import {
    BarChart3, Calendar, FileText, Zap, TrendingUp, Target,
    Trash2, Flame, Crown, Activity, ShoppingBag, X, Send, Bot, Banknote, Users,
    History, Download, RotateCcw, Clock, Database, Bell, Package, Settings, PlusCircle, Tag,
    TrendingDown, ArrowUpRight, ArrowDownRight, AlertCircle, Award, ThumbsDown
} from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import SmartAlerts from '../SmartAlerts';
import { Button, Modal, Card, Badge, Spinner, Tabs, ConfirmModal } from '../ui';

/**
 * DashboardView - ภาพรวมธุรกิจ Dashboard
 */
const DashboardView = () => {
    // 1. Get Data from Context
    const {
        orders,
        expenses,
        stock,
        members,
        callGeminiAPI,
        startingCash,
        aiUtils,
        handleViewChange
    } = useAppContext();

    const [showConsultantModal, setShowConsultantModal] = useState(false);
    const [consultantQuery, setConsultantQuery] = useState('');
    const [consultantResponse, setConsultantResponse] = useState('');
    const [isConsulting, setIsConsulting] = useState(false);
    const [showChatHistory, setShowChatHistory] = useState(false);
    const [chatHistory, setChatHistory] = useState([]);
    const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState(false);

    // Load chat history on mount
    useEffect(() => {
        if (aiUtils?.getChatHistory) {
            setChatHistory(aiUtils.getChatHistory());
        }
    }, [aiUtils, consultantResponse]); // Refresh when new response comes

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

    // 1.1 Last Month Stats for Comparison
    const lastMonthStats = useMemo(() => {
        const currentDate = new Date(currentMonth + '-01');
        currentDate.setMonth(currentDate.getMonth() - 1);
        const lastMonth = currentDate.toISOString().slice(0, 7);

        const monthOrders = orders.filter(o => o.status === 'completed' && String(getOrderDate(o)).startsWith(lastMonth));
        const monthExpenses = expenses.filter(e => String(e.date || '').startsWith(lastMonth));

        const revenue = monthOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
        const expenseTotal = monthExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const count = monthOrders.length;

        return {
            month: lastMonth,
            revenue,
            cost: expenseTotal,
            profit: revenue - expenseTotal,
            count
        };
    }, [orders, expenses, currentMonth]);

    // 1.2 Growth Rate Calculation
    const growthStats = useMemo(() => {
        const calcGrowth = (current, previous) => {
            if (previous === 0) return current > 0 ? 100 : 0;
            return Math.round(((current - previous) / previous) * 100);
        };

        return {
            revenueGrowth: calcGrowth(monthlyStats.revenue, lastMonthStats.revenue),
            profitGrowth: calcGrowth(monthlyStats.profit, lastMonthStats.profit),
            orderGrowth: calcGrowth(monthlyStats.count, lastMonthStats.count),
            costGrowth: calcGrowth(monthlyStats.cost, lastMonthStats.cost)
        };
    }, [monthlyStats, lastMonthStats]);

    // 1.5 Member Growth Stats
    const memberStats = useMemo(() => {
        // สมาชิกใหม่ this Month
        const newMembersMonth = members.filter(m => {
            if (!m.createdAt) return false;
            const date = m.createdAt.seconds ? new Date(m.createdAt.seconds * 1000) : new Date(m.createdAt);
            const isoMonth = getISODate(date).substring(0, 7);
            return isoMonth === currentMonth;
        }).length;

        // สมาชิกใหม่ Today
        const newMembersToday = members.filter(m => {
            if (!m.createdAt) return false;
            const date = m.createdAt.seconds ? new Date(m.createdAt.seconds * 1000) : new Date(m.createdAt);
            return getISODate(date) === today;
        }).length;

        return { newMembersMonth, newMembersToday };
    }, [members, currentMonth, today]);

    // 2. Dashboard Specific Stats
    const dashboardStats = useMemo(() => {
        // a. ของเสีย
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

    // Menu Performance Analysis
    const { menu } = useAppContext();
    const menuPerformance = useMemo(() => {
        const monthOrders = orders.filter(o => o.status === 'completed' && String(getOrderDate(o)).startsWith(currentMonth));

        // Calculate performance per menu item
        const menuStats = {};
        monthOrders.forEach(order => {
            (order.items || []).forEach(item => {
                const key = item.name;
                if (!menuStats[key]) {
                    // Find menu item to get cost info
                    const menuItem = menu.find(m => m.name === item.name);
                    const stockLinks = menuItem?.stockLinks || [];
                    let costPerItem = Number(menuItem?.additionalCost || 0);

                    // Calculate cost from stock links
                    stockLinks.forEach(link => {
                        const stockItem = stock.find(s => s.id === link.stockId);
                        if (stockItem) {
                            costPerItem += Number(stockItem.unitCost || 0) * Number(link.usage || 0);
                        }
                    });

                    menuStats[key] = {
                        name: item.name,
                        image: item.image || menuItem?.image || '',
                        category: item.category || menuItem?.category || '',
                        price: Number(item.price || 0),
                        costPerItem,
                        totalSold: 0,
                        totalRevenue: 0,
                        totalCost: 0,
                        totalProfit: 0
                    };
                }

                const qty = Number(item.quantity || 1);
                const price = Number(item.price || 0);
                menuStats[key].totalSold += qty;
                menuStats[key].totalRevenue += price * qty;
                menuStats[key].totalCost += menuStats[key].costPerItem * qty;
                menuStats[key].totalProfit += (price - menuStats[key].costPerItem) * qty;
            });
        });

        // Convert to array and calculate margins
        const performanceList = Object.values(menuStats).map(item => ({
            ...item,
            profitMargin: item.totalRevenue > 0 ? Math.round((item.totalProfit / item.totalRevenue) * 100) : 0,
            avgProfitPerSale: item.totalSold > 0 ? Math.round(item.totalProfit / item.totalSold) : 0
        }));

        // Find menu items with zero sales this month
        const zeroSalesItems = menu
            .filter(m => m.available !== false && !menuStats[m.name])
            .map(m => ({
                name: m.name,
                image: m.image || '',
                category: m.category || '',
                price: Number(m.price || 0),
                costPerItem: 0,
                totalSold: 0,
                totalRevenue: 0,
                totalCost: 0,
                totalProfit: 0,
                profitMargin: 0,
                avgProfitPerSale: 0
            }));

        // Best performers (highest profit)
        const bestPerformers = [...performanceList]
            .filter(m => m.totalSold >= 3) // At least 3 sales
            .sort((a, b) => b.totalProfit - a.totalProfit)
            .slice(0, 5);

        // Worst performers (lowest margin or negative profit)
        const worstPerformers = [...performanceList]
            .filter(m => m.totalSold >= 3) // At least 3 sales
            .sort((a, b) => a.profitMargin - b.profitMargin)
            .slice(0, 5);

        // Items that should be reviewed (low margin < 30% OR low sales OR zero sales)
        const needsReview = [
            ...performanceList.filter(m => (m.profitMargin < 30 && m.totalSold >= 3) || (m.totalSold < 3 && m.totalSold > 0)),
            ...zeroSalesItems
        ].sort((a, b) => a.totalSold - b.totalSold || a.profitMargin - b.profitMargin);

        return {
            all: performanceList.sort((a, b) => b.totalProfit - a.totalProfit),
            bestPerformers,
            worstPerformers,
            needsReview
        };
    }, [orders, menu, stock, currentMonth]);


    // --- AI Consultant Logic --- วิเคราะห์ตามเดือนที่เลือก + เปรียบเทียบวันนี้ + Historical Context
    const handleConsultantQuery = async () => {
        if (!consultantQuery.trim()) return;
        setIsConsulting(true);
        setConsultantResponse('');

        try {
            // Prepare Data for Prompt - ข้อมูลเดือนที่เลือก
            const { revenue, profit, count, cost } = monthlyStats;
            const { totalWasteCost, lowStockCount, topProducts, peakHour } = dashboardStats;

            // คำนวณข้อมูลวันนี้สำหรับเปรียบเทียบ
            const todayOrders = orders.filter(o => o.status === 'completed' && getOrderDate(o) === today);
            const todayRevenue = todayOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
            const todayOrderCount = todayOrders.length;
            const todayExpenses = expenses.filter(e => e.date === today);
            const todayExpenseTotal = todayExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

            // คำนวณค่าเฉลี่ยรายวัน (จากเดือนที่เลือก)
            const profitMargin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;

            // ชื่อเดือนภาษาไทย
            const monthNameThai = new Date(selectedMonth + '-01').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

            // Get Historical Context from AI Service
            const historicalContext = aiUtils?.buildHistoricalContext?.(selectedMonth) || '';

            // Build Prompt with Historical Context
            const systemPrompt = `
                คุณคือที่ปรึกษาธุรกิจร้านคาเฟ่มืออาชีพ "AI Manager"

                📅 **ข้อมูลเดือน ${monthNameThai} (${selectedMonth}):**
                - รายได้รวม: ${revenue.toLocaleString()} บาท (${count} ออเดอร์)
                - รายจ่ายรวม: ${cost.toLocaleString()} บาท
                - กำไรสุทธิ: ${profit.toLocaleString()} บาท (Margin ${profitMargin}%)
                - ต้นทุนของเสีย: ${totalWasteCost.toLocaleString()} บาท
                - สินค้าขายดี: ${topProducts.slice(0, 3).map(p => `${p.name}(${p.count})`).join(', ') || 'ไม่มีข้อมูล'}
                - ช่วงเวลาขายดีสุด: ${peakHour !== null ? `${peakHour}:00-${peakHour + 1}:00 น.` : 'ยังไม่มีข้อมูล'}
                - วัตถุดิบใกล้หมด: ${lowStockCount} รายการ

                📊 **ข้อมูลวันนี้ (${today}) เปรียบเทียบ:**
                - รายได้วันนี้: ${todayRevenue.toLocaleString()} บาท (${todayOrderCount} ออเดอร์)
                - รายจ่ายวันนี้: ${todayExpenseTotal.toLocaleString()} บาท
                - กำไรวันนี้: ${(todayRevenue - todayExpenseTotal).toLocaleString()} บาท

                ${historicalContext}

                หน้าที่: ตอบคำถามเจ้าของร้านด้วยข้อมูลจริงของเดือน ${monthNameThai}
                ให้คำแนะนำเชิงกลยุทธ์ เน้นเพิ่มกำไรและลดต้นทุน
                สไตล์ตอบ: เป็นกันเอง มืออาชีพ กระชับ สั้นได้ใจความ ใช้ Emoji ประกอบ
            `;

            const userPrompt = `คำถาม: "${consultantQuery}"`;

            // Use enhanced API with cache and history
            const result = await callGeminiAPI(systemPrompt + '\n' + userPrompt, false, {
                saveToChatHistory: true,
                useCache: true
            });

            if (result.success) {
                setConsultantResponse(result.data);
                // Update local chat history
                if (aiUtils?.getChatHistory) {
                    setChatHistory(aiUtils.getChatHistory());
                }
            } else {
                const errorMsg = result.rateLimited
                    ? `กรุณารอสักครู่ (${Math.ceil((result.waitTime || 3000) / 1000)} วินาที)`
                    : 'ขออภัย AI ไม่พร้อมใช้งานชั่วคราว';
                setConsultantResponse(errorMsg);
            }
        } catch (error) {
            setConsultantResponse('เกิดข้อผิดพลาดในการเชื่อมต่อ');
        } finally {
            setIsConsulting(false);
        }
    };

    // Clear chat history handler
    const handleClearHistory = () => {
        setShowClearHistoryConfirm(true);
    };

    const confirmClearHistory = () => {
        aiUtils?.clearChatHistory?.();
        setChatHistory([]);
        setShowClearHistoryConfirm(false);
    };

    // Export chat history handler
    const handleExportHistory = () => {
        aiUtils?.exportChatHistory?.();
    };

    // Quick Suggestion Chips - ปรับตามเดือนที่เลือก
    // Smart Alerts Data
    const alertsData = useMemo(() => ({
        orders,
        expenses,
        stock,
        members,
        today,
        currentMonth
    }), [orders, expenses, stock, members, today, currentMonth]);

    const handleAlertAction = (view) => {
        if (handleViewChange) {
            handleViewChange(view);
        }
    };

    const monthNameShort = new Date(selectedMonth + '-01').toLocaleDateString('th-TH', { month: 'short' });
    const suggestions = [
        `วิเคราะห์กำไร${selectedMonth === today.substring(0, 7) ? 'เดือนนี้' : monthNameShort}หน่อย`,
        "เปรียบเทียบวันนี้กับค่าเฉลี่ย",
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
                                        <h3 className="text-2xl font-black uppercase tracking-tight">AI ที่ปรึกษาธุรกิจ</h3>
                                        <p className="text-white/80 text-sm font-medium">ผู้ช่วยวิเคราะห์ธุรกิจส่วนตัว 24/7</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setShowChatHistory(!showChatHistory)}
                                        className={`p-2 rounded-xl transition-all ${showChatHistory ? 'bg-white/30' : 'bg-white/10 hover:bg-white/20'}`}
                                        title="ประวัติการสนทนา"
                                        aria-label="ประวัติการสนทนา"
                                    >
                                        <History size={20} />
                                    </button>
                                    <button onClick={() => setShowConsultantModal(false)} aria-label="ปิดหน้าต่างที่ปรึกษา" className="bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-all"><X size={24} /></button>
                                </div>
                            </div>
                            <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 opacity-20"><Zap size={200} /></div>
                        </div>

                        {/* Chat History Panel */}
                        {showChatHistory && (
                            <div className="bg-violet-50 border-b border-violet-100 p-4 max-h-48 overflow-y-auto">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-xs font-black text-violet-600 uppercase tracking-widest flex items-center gap-2">
                                        <Clock size={14} /> ประวัติการสนทนา ({chatHistory.length} รายการ)
                                    </span>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleExportHistory}
                                            disabled={chatHistory.length === 0}
                                            className="text-[10px] font-bold bg-violet-100 text-violet-600 px-3 py-1.5 rounded-lg hover:bg-violet-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                        >
                                            <Download size={12} /> ส่งออก
                                        </button>
                                        <button
                                            onClick={handleClearHistory}
                                            disabled={chatHistory.length === 0}
                                            className="text-[10px] font-bold bg-red-50 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                        >
                                            <RotateCcw size={12} /> ล้าง
                                        </button>
                                    </div>
                                </div>
                                {chatHistory.length === 0 ? (
                                    <p className="text-xs text-gray-400 text-center py-4">ยังไม่มีประวัติการสนทนา</p>
                                ) : (
                                    <div className="space-y-2">
                                        {chatHistory.slice(-10).reverse().map((msg, idx) => (
                                            <div
                                                key={msg.id || idx}
                                                className={`text-xs p-2 rounded-lg ${msg.role === 'user'
                                                        ? 'bg-white border border-violet-100 text-gray-700'
                                                        : 'bg-violet-100/50 text-violet-700'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-bold">{msg.role === 'user' ? '👤 คุณ' : '🤖 AI'}</span>
                                                    <span className="text-[10px] text-gray-400">
                                                        {new Date(msg.timestamp).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                                                    </span>
                                                </div>
                                                <p className="line-clamp-2">{msg.content}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-gray-50/50">
                            {consultantResponse ? (
                                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 animate-in slide-in-from-bottom-2">
                                    <div className="flex items-center gap-3 mb-4 text-violet-600 font-black uppercase text-xs tracking-widest">
                                        <Bot size={16} /> AI วิเคราะห์
                                    </div>
                                    <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-line">
                                        {consultantResponse}
                                    </div>

                                    {/* ดำเนินการ based on context */}
                                    <div className="mt-6 pt-4 border-t border-gray-100">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">ดำเนินการ</p>
                                        <div className="flex flex-wrap gap-2">
                                            {dashboardStats.lowStockCount > 0 && (
                                                <button
                                                    onClick={() => { setShowConsultantModal(false); handleViewChange('stock'); }}
                                                    className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-[11px] font-black hover:bg-red-100 transition-all border border-red-100"
                                                >
                                                    <Package size={14} /> ดูสต็อกใกล้หมด ({dashboardStats.lowStockCount})
                                                </button>
                                            )}
                                            <button
                                                onClick={() => { setShowConsultantModal(false); handleViewChange('menu_manage'); }}
                                                className="flex items-center gap-2 px-4 py-2 bg-violet-50 text-violet-600 rounded-xl text-[11px] font-black hover:bg-violet-100 transition-all border border-violet-100"
                                            >
                                                <Tag size={14} /> จัดการโปรโมชั่น
                                            </button>
                                            <button
                                                onClick={() => { setShowConsultantModal(false); handleViewChange('expenses'); }}
                                                className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-600 rounded-xl text-[11px] font-black hover:bg-amber-100 transition-all border border-amber-100"
                                            >
                                                <Banknote size={14} /> บันทึกรายจ่าย
                                            </button>
                                            <button
                                                onClick={() => { setShowConsultantModal(false); handleViewChange('members_manage'); }}
                                                className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[11px] font-black hover:bg-emerald-100 transition-all border border-emerald-100"
                                            >
                                                <Users size={14} /> ดูสมาชิก ({members.length})
                                            </button>
                                            <button
                                                onClick={() => { setShowConsultantModal(false); handleViewChange('admin'); }}
                                                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-[11px] font-black hover:bg-gray-200 transition-all border border-gray-200"
                                            >
                                                <Settings size={14} /> ตั้งค่าร้าน
                                            </button>
                                        </div>
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

            <header className="h-16 md:h-20 lg:h-24 bg-white border-b border-gray-100 px-4 md:px-8 lg:px-12 flex items-center justify-between shadow-sm z-10 shrink-0">
                <div className="flex items-center gap-2 md:gap-4">
                    <div className="p-2 md:p-3 bg-emerald-500 text-white rounded-xl md:rounded-2xl shadow-lg ring-4 ring-emerald-500/10">
                        <BarChart3 size={20} className="md:w-6 md:h-6 lg:w-7 lg:h-7" />
                    </div>
                    <div>
                        <h1 className="text-lg md:text-xl lg:text-2xl font-black uppercase tracking-tight text-gray-800">ภาพรวมธุรกิจ</h1>
                        <p className="text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mt-0.5 md:mt-1 hidden md:block">สรุปข้อมูลเชิงลึกของร้านคุณ</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 md:gap-4">
                    <SmartAlerts data={alertsData} onAction={handleAlertAction} compact={true} />
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

            <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-10 space-y-6 md:space-y-8 lg:space-y-10 scrollbar-hide pb-24 md:pb-32">
                {/* Starting Cash Reminder - Always Visible */}
                {Number(startingCash) > 0 && (
                    <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-[2rem] p-6 border-2 border-amber-200 flex items-center justify-between shadow-lg animate-in slide-in-from-top duration-500">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-amber-500 text-white rounded-2xl flex items-center justify-center shadow-lg">
                                <Banknote size={28} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-amber-600 uppercase tracking-[0.2em] mb-1">เงินตั้งต้นร้าน (เงินทอน)</p>
                                <p className="text-xs text-amber-500 font-bold">เงินสำรองไว้ทอนลูกค้า - ไม่นับรวมกับยอดขาย</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-3xl font-black text-amber-600 tracking-tighter">฿{Number(startingCash).toLocaleString()}</p>
                            <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mt-1">แยกจากกำไร/ขาดทุน</p>
                        </div>
                    </div>
                )}

                {/* Top Summaries */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
                    <div className="bg-white rounded-[3rem] p-8 shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
                        <div className="flex justify-between items-start mb-6">
                            <div className="w-14 h-14 bg-violet-50 text-violet-500 rounded-2xl flex items-center justify-center shadow-inner"><Users size={28} /></div>
                            <span className="text-[10px] font-black text-violet-500 bg-violet-50 px-3 py-1.5 rounded-xl border border-violet-100 uppercase tracking-widest">สมาชิกใหม่</span>
                        </div>
                        <div>
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">สมาชิกใหม่ (เดือนนี้)</p>
                            <p className="text-4xl font-black text-gray-800 tracking-tighter">+{memberStats.newMembersMonth}</p>
                            {memberStats.newMembersToday > 0 && (
                                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-wider mt-2 bg-emerald-50 inline-block px-2 py-1 rounded-lg border border-emerald-100 animate-pulse">
                                    วันนี้ +{memberStats.newMembersToday} คน
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="bg-white rounded-[3rem] p-8 shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
                        <div className="flex justify-between items-start mb-6">
                            <div className="w-14 h-14 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center shadow-inner"><TrendingUp size={28} /></div>
                            <span className="text-[10px] font-black text-emerald-500 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100 uppercase tracking-widest">รายรับ</span>
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
                            <span className={`text-[10px] font-black px-3 py-1.5 rounded-xl border uppercase tracking-widest ${dashboardStats.totalWasteCost > 500 ? 'bg-red-100 text-red-600 border-red-200' : 'bg-gray-50 text-gray-400'}`}>ของเสีย</span>
                        </div>
                        <div>
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">มูลค่าของเสีย (เดือนนี้)</p>
                            <p className="text-4xl font-black text-red-600 tracking-tighter">฿{dashboardStats.totalWasteCost.toLocaleString()}</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-[3rem] p-8 shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
                        <div className="flex justify-between items-start mb-6">
                            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center shadow-inner"><Flame size={28} /></div>
                            <span className={`text-[10px] font-black px-3 py-1.5 rounded-xl border uppercase tracking-widest ${dashboardStats.lowStockCount > 0 ? 'bg-red-100 text-red-600 border-red-200 animate-pulse' : 'bg-green-50 text-green-600 border-green-100'}`}>{dashboardStats.lowStockCount} รายการใกล้หมด</span>
                        </div>
                        <div>
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">วัตถุดิบใกล้หมด</p>
                            <p className="text-4xl font-black text-gray-800 tracking-tighter">{dashboardStats.lowStockCount}</p>
                        </div>
                    </div>
                </div>

                {/* Month Comparison Section */}
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-[3rem] p-8 shadow-2xl border border-slate-700">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-3">
                            <TrendingUp className="text-emerald-400" /> เปรียบเทียบเดือนนี้ vs เดือนก่อน
                        </h2>
                        <span className="text-xs font-bold text-slate-400">
                            {new Date(lastMonthStats.month + '-01').toLocaleDateString('th-TH', { month: 'short' })} → {new Date(currentMonth + '-01').toLocaleDateString('th-TH', { month: 'short' })}
                        </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        {/* Revenue Comparison */}
                        <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">รายได้</span>
                                <div className={`flex items-center gap-1 text-xs font-black ${growthStats.revenueGrowth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {growthStats.revenueGrowth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                    {Math.abs(growthStats.revenueGrowth)}%
                                </div>
                            </div>
                            <p className="text-2xl font-black text-white">฿{monthlyStats.revenue.toLocaleString()}</p>
                            <p className="text-[10px] text-slate-500 mt-1">เดือนก่อน: ฿{lastMonthStats.revenue.toLocaleString()}</p>
                        </div>

                        {/* Profit Comparison */}
                        <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">กำไร</span>
                                <div className={`flex items-center gap-1 text-xs font-black ${growthStats.profitGrowth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {growthStats.profitGrowth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                    {Math.abs(growthStats.profitGrowth)}%
                                </div>
                            </div>
                            <p className="text-2xl font-black text-emerald-400">฿{monthlyStats.profit.toLocaleString()}</p>
                            <p className="text-[10px] text-slate-500 mt-1">เดือนก่อน: ฿{lastMonthStats.profit.toLocaleString()}</p>
                        </div>

                        {/* Orders Comparison */}
                        <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">ออเดอร์</span>
                                <div className={`flex items-center gap-1 text-xs font-black ${growthStats.orderGrowth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {growthStats.orderGrowth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                    {Math.abs(growthStats.orderGrowth)}%
                                </div>
                            </div>
                            <p className="text-2xl font-black text-white">{monthlyStats.count}</p>
                            <p className="text-[10px] text-slate-500 mt-1">เดือนก่อน: {lastMonthStats.count}</p>
                        </div>

                        {/* Cost Comparison */}
                        <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">ค่าใช้จ่าย</span>
                                <div className={`flex items-center gap-1 text-xs font-black ${growthStats.costGrowth <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {growthStats.costGrowth <= 0 ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                                    {Math.abs(growthStats.costGrowth)}%
                                </div>
                            </div>
                            <p className="text-2xl font-black text-orange-400">฿{monthlyStats.cost.toLocaleString()}</p>
                            <p className="text-[10px] text-slate-500 mt-1">เดือนก่อน: ฿{lastMonthStats.cost.toLocaleString()}</p>
                        </div>
                    </div>

                    {/* Summary Message */}
                    <div className={`mt-6 p-4 rounded-xl flex items-center gap-3 ${growthStats.profitGrowth >= 0 ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                        {growthStats.profitGrowth >= 0 ? (
                            <>
                                <TrendingUp className="text-emerald-400" size={24} />
                                <div>
                                    <p className="text-sm font-black text-emerald-400">ยอดเยี่ยม! กำไรเพิ่มขึ้น {growthStats.profitGrowth}%</p>
                                    <p className="text-[10px] text-slate-400">เพิ่มขึ้น ฿{(monthlyStats.profit - lastMonthStats.profit).toLocaleString()} จากเดือนก่อน</p>
                                </div>
                            </>
                        ) : (
                            <>
                                <TrendingDown className="text-red-400" size={24} />
                                <div>
                                    <p className="text-sm font-black text-red-400">ต้องปรับปรุง กำไรลดลง {Math.abs(growthStats.profitGrowth)}%</p>
                                    <p className="text-[10px] text-slate-400">ลดลง ฿{Math.abs(monthlyStats.profit - lastMonthStats.profit).toLocaleString()} จากเดือนก่อน</p>
                                </div>
                            </>
                        )}
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
                            <h2 className="text-lg font-black uppercase tracking-widest mb-8 flex items-center gap-3 text-emerald-400"><Activity /> ช่วงเวลาขายดี</h2>
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
                            <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight mb-2">อัตรากำไร</h3>
                            <p className="text-3xl font-black text-emerald-600 mb-2">฿{monthlyStats.profit.toLocaleString()}</p>
                            <p className="text-xs text-gray-400 font-bold leading-relaxed">คำนวณจากยอดขายหักลบรายจ่ายทั้งหมดในระบบ เรียลไทม์</p>
                            {Number(startingCash) > 0 && (
                                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
                                    <Banknote size={14} className="text-amber-500" />
                                    <span className="text-[10px] font-black text-amber-600 uppercase">เงินทอน: ฿{Number(startingCash).toLocaleString()}</span>
                                    <span className="text-[10px] font-bold text-gray-400">| รวม: <span className="text-emerald-600 font-black">฿{(monthlyStats.profit + Number(startingCash)).toLocaleString()}</span></span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-white rounded-[3rem] p-10 shadow-sm border border-gray-100 flex items-center gap-10">
                        <div className="w-32 h-32 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 shrink-0">
                            <TrendingUp size={64} />
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight mb-4">สินค้าทำกำไรสูงสุด 5 อันดับ</h3>
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

                {/* Menu Performance Analysis */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Best Performers */}
                    <div className="bg-white rounded-[3rem] p-8 shadow-sm border border-gray-100">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center">
                                <Award size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight">เมนูทำกำไรดีที่สุด</h3>
                                <p className="text-[10px] text-gray-400 font-bold">สินค้าทำกำไรสูงสุด 5 อันดับ</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            {menuPerformance.bestPerformers.map((item, idx) => (
                                <div key={item.name} className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:border-emerald-200 transition-all">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${idx === 0 ? 'bg-yellow-500 text-white' : idx === 1 ? 'bg-gray-400 text-white' : idx === 2 ? 'bg-amber-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                        {idx + 1}
                                    </div>
                                    <div className="w-10 h-10 bg-white rounded-xl overflow-hidden border border-gray-100 shrink-0">
                                        {item.image ? (
                                            <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                <ShoppingBag size={16} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-black text-gray-800 text-sm truncate">{item.name}</p>
                                        <p className="text-[10px] text-gray-400">ขาย {item.totalSold} ชิ้น | กำไร {item.profitMargin}%</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="font-black text-emerald-600 text-lg">฿{item.totalProfit.toLocaleString()}</p>
                                        <p className="text-[9px] text-gray-400 uppercase">กำไรรวม</p>
                                    </div>
                                </div>
                            ))}
                            {menuPerformance.bestPerformers.length === 0 && (
                                <div className="text-center py-8 text-gray-400 text-sm">
                                    ยังไม่มีข้อมูลเพียงพอ (ต้องขายอย่างน้อย 3 ชิ้น)
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Needs Review */}
                    <div className="bg-white rounded-[3rem] p-8 shadow-sm border border-gray-100">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center">
                                <AlertCircle size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight">เมนูที่ควรทบทวน</h3>
                                <p className="text-[10px] text-gray-400 font-bold">กำไรน้อย / ขายได้น้อย / ขายไม่ได้</p>
                            </div>
                        </div>
                        <div className="space-y-3 max-h-[400px] overflow-y-auto scrollbar-hide">
                            {menuPerformance.needsReview.slice(0, 8).map((item, idx) => (
                                <div key={item.name} className={`flex items-center gap-4 p-4 rounded-2xl border ${item.totalSold === 0 ? 'bg-gray-50 border-gray-200' : 'bg-red-50/50 border-red-100'}`}>
                                    <div className="w-10 h-10 bg-white rounded-xl overflow-hidden border border-gray-100 shrink-0">
                                        {item.image ? (
                                            <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                <ShoppingBag size={16} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-black text-gray-800 text-sm truncate">{item.name}</p>
                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            {item.totalSold === 0 && (
                                                <span className="text-[9px] font-bold bg-gray-200 text-gray-600 px-2 py-0.5 rounded-lg">
                                                    ขายไม่ได้เลย
                                                </span>
                                            )}
                                            {item.profitMargin < 30 && item.totalSold > 0 && (
                                                <span className="text-[9px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-lg">
                                                    กำไรต่ำ {item.profitMargin}%
                                                </span>
                                            )}
                                            {item.totalSold > 0 && item.totalSold < 3 && (
                                                <span className="text-[9px] font-bold bg-amber-100 text-amber-600 px-2 py-0.5 rounded-lg">
                                                    ขายน้อย {item.totalSold} ชิ้น
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        {item.totalSold === 0 ? (
                                            <>
                                                <p className="font-black text-lg text-gray-400">฿{item.price.toLocaleString()}</p>
                                                <p className="text-[9px] text-gray-400 uppercase">ราคาขาย</p>
                                            </>
                                        ) : (
                                            <>
                                                <p className={`font-black text-lg ${item.totalProfit >= 0 ? 'text-gray-600' : 'text-red-600'}`}>
                                                    ฿{item.totalProfit.toLocaleString()}
                                                </p>
                                                <p className="text-[9px] text-gray-400 uppercase">กำไรรวม</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {menuPerformance.needsReview.length === 0 && (
                                <div className="text-center py-8 text-emerald-500">
                                    <Award size={48} className="mx-auto mb-3 opacity-50" />
                                    <p className="text-sm font-bold">ยอดเยี่ยม! ทุกเมนูทำกำไรได้ดี</p>
                                </div>
                            )}
                        </div>

                        {/* Recommendations */}
                        {menuPerformance.needsReview.length > 0 && (
                            <div className="mt-6 pt-4 border-t border-gray-100">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">คำแนะนำ</p>
                                <div className="space-y-2 text-xs text-gray-600">
                                    {menuPerformance.needsReview.some(m => m.profitMargin < 30) && (
                                        <p className="flex items-start gap-2">
                                            <ThumbsDown size={14} className="text-red-400 shrink-0 mt-0.5" />
                                            <span>พิจารณาปรับราคาหรือลดต้นทุนเมนูที่กำไรต่ำกว่า 30%</span>
                                        </p>
                                    )}
                                    {menuPerformance.needsReview.some(m => m.totalSold > 0 && m.totalSold < 3) && (
                                        <p className="flex items-start gap-2">
                                            <AlertCircle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                                            <span>เมนูที่ขายน้อยอาจต้องการโปรโมทหรือพิจารณาตัดออก</span>
                                        </p>
                                    )}
                                    {menuPerformance.needsReview.some(m => m.totalSold === 0) && (
                                        <p className="flex items-start gap-2">
                                            <AlertCircle size={14} className="text-gray-400 shrink-0 mt-0.5" />
                                            <span>มีเมนูที่ขายไม่ได้เลยในเดือนนี้ ควรพิจารณาโปรโมทหรือปิดเมนู</span>
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Clear Chat History Confirm Modal */}
            <ConfirmModal
                isOpen={showClearHistoryConfirm}
                onClose={() => setShowClearHistoryConfirm(false)}
                onConfirm={confirmClearHistory}
                title="ล้างประวัติการสนทนา"
                message="ต้องการล้างประวัติการสนทนา AI ทั้งหมดใช่หรือไม่?"
                confirmText="ล้าง"
                cancelText="ยกเลิก"
                variant="danger"
            />
        </div>
    );
};

export default DashboardView;
