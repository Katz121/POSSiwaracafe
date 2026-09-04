import React, { useState, useMemo, useEffect } from 'react';
import {
    BarChart3, Calendar, FileText, Zap, TrendingUp, Target,
    Trash2, Flame, Crown, Activity, ShoppingBag, X, Send, Bot, Banknote, Users,
    History, Download, RotateCcw, Clock, Database, Bell, Package, Settings, PlusCircle, Tag,
    TrendingDown, ArrowUpRight, ArrowDownRight, AlertCircle, Award, ThumbsDown
} from 'lucide-react';
import { doc, deleteDoc } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { useAppContext } from '../../context/AppContext';
import { getISODate, getOrderDate } from '../../utils/calculations';
import { countUnits } from '../../utils/salesHistory';
import SmartAlerts from '../SmartAlerts';
import { Button, Modal, Card, Badge, Spinner, Tabs, ConfirmModal, useToast } from '../ui';

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
        menu,
        callGeminiAPI,
        startingCash,
        aiUtils,
        handleViewChange,
        runDbAction
    } = useAppContext();

    const toast = useToast();
    const [menuToDelete, setMenuToDelete] = useState(null);

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
    }, [aiUtils]); // Load once on mount

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

        // แก้ว = เครื่องดื่ม · ชิ้น = ขนม · แยกกันเพราะ "ออเดอร์" อ่านแล้วแยกไม่ออกว่าหมายถึงบิลหรือแก้ว
        const units = monthOrders.reduce((acc, o) => {
            const { cups, pieces } = countUnits(o);
            return { cups: acc.cups + cups, pieces: acc.pieces + pieces };
        }, { cups: 0, pieces: 0 });

        return {
            revenue,
            cost: expenseTotal,
            profit: revenue - expenseTotal,
            count,
            cups: units.cups,
            pieces: units.pieces
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

        const units = monthOrders.reduce((acc, o) => {
            const { cups, pieces } = countUnits(o);
            return { cups: acc.cups + cups, pieces: acc.pieces + pieces };
        }, { cups: 0, pieces: 0 });

        return {
            month: lastMonth,
            revenue,
            cost: expenseTotal,
            profit: revenue - expenseTotal,
            count,
            cups: units.cups,
            pieces: units.pieces
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
            (String(e.category).toLowerCase().includes('waste') || String(e.title).toLowerCase().includes('waste') || String(e.title).includes('ทิ้ง'))
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
    const menuPerformance = useMemo(() => {
        const monthOrders = orders.filter(o => o.status === 'completed' && String(getOrderDate(o)).startsWith(currentMonth));

        // Index menu/stock once — avoids O(orders × items × links) nested .find() scans.
        const menuByName = new Map(menu.map(m => [m.name, m]));
        const stockById = new Map(stock.map(s => [s.id, s]));

        // Calculate performance per menu item
        const menuStats = {};
        monthOrders.forEach(order => {
            (order.items || []).forEach(item => {
                const key = item.name;
                const menuItem = menuByName.get(item.name);

                // Cost from the ACTUAL order item's recipe so the chosen bean is
                // reflected (its stockLinks were merged in at order time). Fall back
                // to the base menu recipe for older orders that have no stockLinks.
                const links = (Array.isArray(item.stockLinks) && item.stockLinks.length)
                    ? item.stockLinks
                    : (menuItem?.stockLinks || []);
                let itemCost = Number(menuItem?.additionalCost || 0);
                links.forEach(link => {
                    const stockItem = stockById.get(link.stockId);
                    if (stockItem) {
                        itemCost += Number(stockItem.unitCost || 0) * Number(link.usage || 0);
                    }
                });

                if (!menuStats[key]) {
                    menuStats[key] = {
                        id: menuItem?.id || null,
                        name: item.name,
                        image: item.image || menuItem?.image || '',
                        category: item.category || menuItem?.category || '',
                        price: Number(item.price || 0),
                        costPerItem: itemCost,
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
                menuStats[key].totalCost += itemCost * qty;
                menuStats[key].totalProfit += (price - itemCost) * qty;
            });
        });

        // Display cost = weighted average across the month's sales (bean variants
        // can differ), so margins shown reflect the real blended cost.
        Object.values(menuStats).forEach(m => {
            if (m.totalSold > 0) m.costPerItem = Math.round(m.totalCost / m.totalSold);
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
                id: m.id,
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


    // --- Delete Menu from Review ---
    const handleDeleteMenu = async () => {
        if (!menuToDelete) return;
        await runDbAction(async () => {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', menuToDelete.id));
            toast.success(`ลบเมนู "${menuToDelete.name}" แล้ว`);
            setMenuToDelete(null);
        }, 'ลบเมนูไม่สำเร็จ');
    };

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
                - รายได้รวม: ${revenue.toLocaleString()} บาท (${count} บิล)
                - รายจ่ายรวม: ${cost.toLocaleString()} บาท
                - กำไรสุทธิ: ${profit.toLocaleString()} บาท (Margin ${profitMargin}%)
                - ต้นทุนของเสีย: ${totalWasteCost.toLocaleString()} บาท
                - สินค้าขายดี: ${topProducts.slice(0, 3).map(p => `${p.name}(${p.count})`).join(', ') || 'ไม่มีข้อมูล'}
                - ช่วงเวลาขายดีสุด: ${peakHour !== null ? `${peakHour}:00-${peakHour + 1}:00 น.` : 'ยังไม่มีข้อมูล'}
                - วัตถุดิบใกล้หมด: ${lowStockCount} รายการ

                📊 **ข้อมูลวันนี้ (${today}) เปรียบเทียบ:**
                - รายได้วันนี้: ${todayRevenue.toLocaleString()} บาท (${todayOrderCount} บิล)
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
        } catch {
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
        <div className="h-full bg-[var(--bg-primary)] flex flex-col overflow-hidden text-[var(--text-primary)] relative">

            {/* AI Consultant Modal */}
            {showConsultantModal && (
                <div className="fixed inset-0 z-[var(--z-modal-bg)] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-[var(--bg-secondary)] w-full max-w-2xl rounded-[var(--radius)] shadow-[var(--elev-3)] flex flex-col max-h-[85vh] overflow-hidden border border-white/20 ring-4 ring-black/5">
                        <div className="p-6 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shrink-0 relative overflow-hidden">
                            <div className="relative z-[var(--z-nav)] flex justify-between items-start">
                                <div className="flex items-center gap-4">
                                    <div className="bg-[var(--bg-secondary)]/20 p-3 rounded-2xl backdrop-blur-md">
                                        <Bot size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold  tracking-tight">AI ที่ปรึกษาธุรกิจ</h3>
                                        <p className="text-white/80 text-sm font-medium">ผู้ช่วยวิเคราะห์ธุรกิจส่วนตัว 24/7</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setShowChatHistory(!showChatHistory)}
                                        className={`p-2 rounded-xl transition-all ${showChatHistory ? 'bg-[var(--bg-secondary)]/30' : 'bg-[var(--bg-secondary)]/10 hover:bg-[var(--bg-secondary)]/20'}`}
                                        title="ประวัติการสนทนา"
                                        aria-label="ประวัติการสนทนา"
                                    >
                                        <History size={20} />
                                    </button>
                                    <button onClick={() => setShowConsultantModal(false)} aria-label="ปิดหน้าต่างที่ปรึกษา" className="bg-[var(--bg-secondary)]/10 hover:bg-[var(--bg-secondary)]/20 p-2 rounded-xl transition-all"><X size={24} /></button>
                                </div>
                            </div>
                            <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 opacity-20"><Zap size={200} /></div>
                        </div>

                        {/* Chat History Panel */}
                        {showChatHistory && (
                            <div className="bg-[var(--accent-ai-light)] border-b border-[var(--border-color)] p-4 max-h-48 overflow-y-auto">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-xs font-medium text-[var(--accent-ai)]  tracking-widest flex items-center gap-2">
                                        <Clock size={14} /> ประวัติการสนทนา ({chatHistory.length} รายการ)
                                    </span>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleExportHistory}
                                            disabled={chatHistory.length === 0}
                                            className="text-xs font-medium bg-[var(--accent-ai-light)] text-[var(--accent-ai)] px-3 py-1.5 rounded-lg hover:bg-violet-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                        >
                                            <Download size={12} /> ส่งออก
                                        </button>
                                        <button
                                            onClick={handleClearHistory}
                                            disabled={chatHistory.length === 0}
                                            className="text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--state-danger)] px-3 py-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                        >
                                            <RotateCcw size={12} /> ล้าง
                                        </button>
                                    </div>
                                </div>
                                {chatHistory.length === 0 ? (
                                    <p className="text-xs text-[var(--text-muted)] text-center py-4">ยังไม่มีประวัติการสนทนา</p>
                                ) : (
                                    <div className="space-y-2">
                                        {chatHistory.slice(-10).reverse().map((msg, idx) => (
                                            <div
                                                key={msg.id || idx}
                                                className={`text-xs p-2 rounded-lg ${msg.role === 'user'
                                                        ? 'bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)]'
                                                        : 'bg-[var(--accent-ai-light)]/50 text-[var(--accent-ai-dark)]'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-bold">{msg.role === 'user' ? '👤 คุณ' : '🤖 AI'}</span>
                                                    <span className="text-xs text-[var(--text-muted)]">
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

                        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[var(--bg-tertiary)]/50">
                            {consultantResponse ? (
                                <div className="bg-[var(--bg-secondary)] p-6 rounded-[var(--radius)] shadow-sm border border-[var(--border-light)]">
                                    <div className="flex items-center gap-3 mb-4 text-[var(--accent-ai)] font-bold  text-xs tracking-widest">
                                        <Bot size={16} /> AI วิเคราะห์
                                    </div>
                                    <div className="prose prose-sm max-w-none text-[var(--text-primary)] leading-relaxed whitespace-pre-line">
                                        {consultantResponse}
                                    </div>

                                    {/* ดำเนินการ based on context */}
                                    <div className="mt-6 pt-4 border-t border-[var(--border-light)]">
                                        <p className="text-xs font-medium text-[var(--text-muted)]  tracking-widest mb-3">ดำเนินการ</p>
                                        <div className="flex flex-wrap gap-2">
                                            {dashboardStats.lowStockCount > 0 && (
                                                <button
                                                    onClick={() => { setShowConsultantModal(false); handleViewChange('stock'); }}
                                                    className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-tertiary)] text-[var(--state-danger)] rounded-xl text-xs font-medium hover:bg-[var(--bg-tertiary)] transition-all border border-[var(--border-color)]"
                                                >
                                                    <Package size={14} /> ดูสต็อกใกล้หมด ({dashboardStats.lowStockCount})
                                                </button>
                                            )}
                                            <button
                                                onClick={() => { setShowConsultantModal(false); handleViewChange('menu_manage'); }}
                                                className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-ai-light)] text-[var(--accent-ai)] rounded-xl text-xs font-medium hover:bg-[var(--accent-ai-light)] transition-all border border-[var(--border-color)]"
                                            >
                                                <Tag size={14} /> จัดการโปรโมชั่น
                                            </button>
                                            <button
                                                onClick={() => { setShowConsultantModal(false); handleViewChange('expenses'); }}
                                                className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-[var(--state-warn)] rounded-xl text-xs font-medium hover:bg-amber-100 transition-all border border-amber-100"
                                            >
                                                <Banknote size={14} /> บันทึกรายจ่าย
                                            </button>
                                            <button
                                                onClick={() => { setShowConsultantModal(false); handleViewChange('members_manage'); }}
                                                className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-emerald-light)] text-[var(--accent-emerald)] rounded-xl text-xs font-medium hover:bg-emerald-100 transition-all border border-[var(--border-color)]"
                                            >
                                                <Users size={14} /> ดูสมาชิก ({members.length})
                                            </button>
                                            <button
                                                onClick={() => { setShowConsultantModal(false); handleViewChange('admin'); }}
                                                className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded-xl text-xs font-medium hover:bg-[var(--bg-tertiary)] transition-all border border-[var(--border-color)]"
                                            >
                                                <Settings size={14} /> ตั้งค่าร้าน
                                            </button>
                                        </div>
                                    </div>

                                    <button onClick={() => setConsultantResponse('')} className="mt-6 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--accent-ai)] transition-colors">
                                        ถามคำถามใหม่
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-center py-10 opacity-60">
                                    <Bot size={64} className="mb-4 text-[var(--text-muted)]" />
                                    <p className="font-bold text-[var(--text-secondary)]">พร้อมวิเคราะห์ข้อมูลร้านของคุณ</p>
                                    <p className="text-sm">พิมพ์คำถามด้านล่างได้เลยครับ</p>
                                </div>
                            )}
                        </div>

                        <div className="p-6 bg-[var(--bg-secondary)] border-t border-[var(--border-light)] shrink-0 space-y-4">
                            {!consultantResponse && (
                                <div className="flex flex-wrap gap-2">
                                    {suggestions.map((s, i) => (
                                        <button key={i} onClick={() => setConsultantQuery(s)} className="text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] px-3 py-1.5 rounded-lg hover:bg-[var(--accent-ai-light)] hover:text-[var(--accent-ai)] transition-all border border-transparent hover:border-[var(--border-color)]">
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
                                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-2xl py-4 pl-6 pr-14 font-medium text-[var(--text-primary)] focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 transition-all"
                                    disabled={isConsulting}
                                />
                                <button
                                    onClick={handleConsultantQuery}
                                    disabled={!consultantQuery.trim() || isConsulting}
                                    className="absolute right-2 top-2 bottom-2 aspect-square bg-violet-600 text-white rounded-xl flex items-center justify-center hover:bg-violet-700 disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-muted)] transition-all shadow-[var(--elev-1)] shadow-violet-500/20"
                                >
                                    {isConsulting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={20} />}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <header className="h-16 md:h-20 lg:h-24 bg-[var(--bg-secondary)] border-b border-[var(--border-light)] px-4 md:px-8 lg:px-12 flex items-center justify-between shadow-sm z-[var(--z-nav)] shrink-0">
                <div className="flex items-center gap-2 md:gap-4">
                    <div className="p-2 md:p-3 bg-[var(--accent-emerald-light)]0 text-white rounded-xl md:rounded-2xl shadow-[var(--elev-1)] ring-4 ring-emerald-500/10">
                        <BarChart3 size={20} className="md:w-6 md:h-6 lg:w-7 lg:h-7" />
                    </div>
                    <div>
                        <h1 className="text-lg md:text-xl lg:text-2xl font-bold  tracking-tight text-[var(--text-primary)]">ภาพรวมธุรกิจ</h1>
                        <p className="text-xs md:text-xs font-medium text-[var(--text-muted)]  tracking-[0.2em] mt-0.5 md:mt-1 hidden md:block">สรุปข้อมูลเชิงลึกของร้านคุณ</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 md:gap-4">
                    <SmartAlerts data={alertsData} onAction={handleAlertAction} compact={true} />
                    <button onClick={() => setShowConsultantModal(true)} className="bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white px-6 py-3 rounded-2xl font-bold text-xs  tracking-widest flex items-center gap-2 shadow-[var(--elev-1)] hover:scale-105 transition-all active:scale-95 border-b-4 border-violet-700">
                        <Zap size={18} fill="currentColor" /> ถาม AI ที่ปรึกษา
                    </button>
                    <div className="relative bg-[var(--bg-secondary)] border-2 border-[var(--border-color)] flex items-center gap-3 px-6 py-3 rounded-2xl shadow-sm text-[var(--accent-emerald)] font-bold  text-xs tracking-widest leading-none shrink-0 cursor-pointer hover:bg-[var(--accent-emerald-light)] transition-colors">
                        <Calendar size={18} />
                        {new Date(selectedMonth + '-01').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            onClick={(e) => {
                                try {
                                    e.currentTarget.showPicker();
                                } catch {
                                    // ignore
                                }
                            }}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-[var(--z-nav)]"
                        />
                    </div>
                    <button onClick={() => window.print()} className="bg-[var(--text-primary)] text-white p-3.5 rounded-2xl hover:bg-[var(--text-secondary)] transition-all shadow-[var(--elev-1)] active:scale-95"><FileText size={20} /></button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-6 space-y-6 md:space-y-8 lg:space-y-10 scrollbar-hide pb-24 md:pb-32">
                {/* Starting Cash Reminder - Always Visible */}
                {Number(startingCash) > 0 && (
                    <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-[var(--radius)] p-6 border-2 border-amber-200 flex items-center justify-between shadow-[var(--elev-1)]">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-amber-500 text-white rounded-2xl flex items-center justify-center shadow-[var(--elev-1)]">
                                <Banknote size={24} />
                            </div>
                            <div>
                                <p className="text-xs font-medium text-[var(--state-warn)]  tracking-[0.2em] mb-1">เงินตั้งต้นร้าน (เงินทอน)</p>
                                <p className="text-xs text-[var(--state-warn)] font-bold">เงินสำรองไว้ทอนลูกค้า - ไม่นับรวมกับยอดขาย</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-3xl font-bold text-[var(--state-warn)] tracking-tighter num">฿{Number(startingCash).toLocaleString()}</p>
                            <p className="text-xs font-medium text-[var(--state-warn)]  tracking-widest mt-1">แยกจากกำไร/ขาดทุน</p>
                        </div>
                    </div>
                )}

                {/* Top Summaries */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                    <Card padding="lg" hoverable className="flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-6">
                            <div className="w-14 h-14 bg-[var(--accent-ai-light)] text-[var(--accent-ai)] rounded-2xl flex items-center justify-center shadow-inner"><Users size={24} /></div>
                            <span className="text-xs font-medium text-[var(--accent-ai)] bg-[var(--accent-ai-light)] px-3 py-1.5 rounded-xl border border-[var(--border-color)]  tracking-widest">สมาชิกใหม่</span>
                        </div>
                        <div>
                            <p className="text-xs font-medium text-[var(--text-muted)]  tracking-widest mb-2">สมาชิกใหม่ (เดือนนี้)</p>
                            <p className="text-4xl font-bold text-[var(--text-primary)] tracking-tighter num">+{memberStats.newMembersMonth}</p>
                            {memberStats.newMembersToday > 0 && (
                                <p className="text-xs font-medium text-[var(--accent-emerald)]  tracking-wider mt-2 bg-[var(--accent-emerald-light)] inline-block px-2 py-1 rounded-lg border border-[var(--border-color)] animate-pulse">
                                    วันนี้ +{memberStats.newMembersToday} คน
                                </p>
                            )}
                        </div>
                    </Card>

                    <Card padding="lg" hoverable className="flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-6">
                            <div className="w-14 h-14 bg-[var(--accent-emerald-light)] text-[var(--accent-emerald)] rounded-2xl flex items-center justify-center shadow-inner"><TrendingUp size={24} /></div>
                            <span className="text-xs font-medium text-[var(--accent-emerald)] bg-[var(--accent-emerald-light)] px-3 py-1.5 rounded-xl border border-[var(--border-color)]  tracking-widest">รายรับ</span>
                        </div>
                        <div>
                            <p className="text-xs font-medium text-[var(--text-muted)]  tracking-widest mb-2">รายรับเดือนนี้</p>
                            <p className="text-4xl font-bold text-[var(--text-primary)] tracking-tighter num">฿{monthlyStats.revenue.toLocaleString()}</p>
                        </div>
                    </Card>

                    <Card padding="lg" hoverable className="flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-6">
                            <div className="w-14 h-14 bg-blue-50 text-[var(--accent-ai)] rounded-2xl flex items-center justify-center shadow-inner"><Target size={24} /></div>
                            <span className="text-xs font-medium text-[var(--accent-ai)] bg-blue-50 px-3 py-1.5 rounded-xl border border-[var(--border-color)]  tracking-widest num">{monthlyStats.cups} แก้ว</span>
                        </div>
                        <div>
                            <p className="text-xs font-medium text-[var(--text-muted)]  tracking-widest mb-2">บิลที่ปิดแล้ว</p>
                            <p className="text-4xl font-bold text-[var(--text-primary)] tracking-tighter num">{(monthlyStats.count).toLocaleString()}</p>
                            <p className="text-xs text-[var(--text-muted)] mt-2 num">{monthlyStats.cups.toLocaleString()} แก้ว · ขนม {monthlyStats.pieces.toLocaleString()} ชิ้น</p>
                        </div>
                    </Card>

                    <Card padding="lg" hoverable className="flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-6">
                            <div className="w-14 h-14 bg-[var(--bg-tertiary)] text-[var(--state-danger)] rounded-2xl flex items-center justify-center shadow-inner"><Trash2 size={24} /></div>
                            <span className={`text-xs font-medium px-3 py-1.5 rounded-xl border  tracking-widest ${dashboardStats.totalWasteCost > 500 ? 'bg-[var(--bg-tertiary)] text-[var(--state-danger)] border-[var(--border-color)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}`}>ของเสีย</span>
                        </div>
                        <div>
                            <p className="text-xs font-medium text-[var(--text-muted)]  tracking-widest mb-2">มูลค่าของเสีย (เดือนนี้)</p>
                            <p className="text-4xl font-bold text-[var(--state-danger)] tracking-tighter num">฿{dashboardStats.totalWasteCost.toLocaleString()}</p>
                        </div>
                    </Card>

                    <Card padding="lg" hoverable className="flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-6">
                            <div className="w-14 h-14 bg-[var(--bg-tertiary)] text-[var(--state-danger)] rounded-2xl flex items-center justify-center shadow-inner"><Flame size={24} /></div>
                            <span className={`text-xs font-medium px-3 py-1.5 rounded-xl border  tracking-widest ${dashboardStats.lowStockCount > 0 ? 'bg-[var(--bg-tertiary)] text-[var(--state-danger)] border-[var(--border-color)] animate-pulse' : 'bg-green-50 text-green-600 border-green-100'}`}>{dashboardStats.lowStockCount} รายการใกล้หมด</span>
                        </div>
                        <div>
                            <p className="text-xs font-medium text-[var(--text-muted)]  tracking-widest mb-2">วัตถุดิบใกล้หมด</p>
                            <p className="text-4xl font-bold text-[var(--text-primary)] tracking-tighter num">{dashboardStats.lowStockCount}</p>
                        </div>
                    </Card>
                </div>

                {/* Month Comparison Section */}
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-[var(--radius)] p-6 shadow-[var(--elev-3)] border border-slate-700">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-lg font-bold text-white  tracking-tight flex items-center gap-3">
                            <TrendingUp className="text-[var(--accent-emerald)]" /> เปรียบเทียบเดือนนี้ vs เดือนก่อน
                        </h2>
                        <span className="text-xs font-medium text-slate-400">
                            {new Date(lastMonthStats.month + '-01').toLocaleDateString('th-TH', { month: 'short' })} → {new Date(currentMonth + '-01').toLocaleDateString('th-TH', { month: 'short' })}
                        </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        {/* Revenue Comparison */}
                        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-medium text-slate-400  tracking-wider">รายได้</span>
                                <div className={`flex items-center gap-1 text-xs font-medium ${growthStats.revenueGrowth >= 0 ? 'text-[var(--accent-emerald)]' : 'text-[var(--state-danger)]'}`}>
                                    {growthStats.revenueGrowth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                    {Math.abs(growthStats.revenueGrowth)}%
                                </div>
                            </div>
                            <p className="text-2xl font-bold text-white num">฿{monthlyStats.revenue.toLocaleString()}</p>
                            <p className="text-xs text-slate-500 mt-1 num">เดือนก่อน: ฿{lastMonthStats.revenue.toLocaleString()}</p>
                        </div>

                        {/* Profit Comparison */}
                        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-medium text-slate-400  tracking-wider">กำไร</span>
                                <div className={`flex items-center gap-1 text-xs font-medium ${growthStats.profitGrowth >= 0 ? 'text-[var(--accent-emerald)]' : 'text-[var(--state-danger)]'}`}>
                                    {growthStats.profitGrowth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                    {Math.abs(growthStats.profitGrowth)}%
                                </div>
                            </div>
                            <p className="text-2xl font-bold text-[var(--accent-emerald)] num">฿{monthlyStats.profit.toLocaleString()}</p>
                            <p className="text-xs text-slate-500 mt-1 num">เดือนก่อน: ฿{lastMonthStats.profit.toLocaleString()}</p>
                        </div>

                        {/* Orders Comparison */}
                        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-medium text-slate-400  tracking-wider">บิล</span>
                                <div className={`flex items-center gap-1 text-xs font-medium ${growthStats.orderGrowth >= 0 ? 'text-[var(--accent-emerald)]' : 'text-[var(--state-danger)]'}`}>
                                    {growthStats.orderGrowth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                    {Math.abs(growthStats.orderGrowth)}%
                                </div>
                            </div>
                            <p className="text-2xl font-bold text-white num">{monthlyStats.count}</p>
                            <p className="text-xs text-slate-500 mt-1 num">เดือนก่อน: {lastMonthStats.count} · เดือนนี้ {monthlyStats.cups} แก้ว</p>
                        </div>

                        {/* Cost Comparison */}
                        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-medium text-slate-400  tracking-wider">ค่าใช้จ่าย</span>
                                <div className={`flex items-center gap-1 text-xs font-medium ${growthStats.costGrowth <= 0 ? 'text-[var(--accent-emerald)]' : 'text-[var(--state-danger)]'}`}>
                                    {growthStats.costGrowth <= 0 ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                                    {Math.abs(growthStats.costGrowth)}%
                                </div>
                            </div>
                            <p className="text-2xl font-bold text-orange-400 num">฿{monthlyStats.cost.toLocaleString()}</p>
                            <p className="text-xs text-slate-500 mt-1 num">เดือนก่อน: ฿{lastMonthStats.cost.toLocaleString()}</p>
                        </div>
                    </div>

                    {/* Summary Message */}
                    <div className={`mt-6 p-4 rounded-xl flex items-center gap-3 ${growthStats.profitGrowth >= 0 ? 'bg-[var(--accent-emerald-light)] border border-[var(--accent-emerald)]/30' : 'bg-[var(--bg-tertiary)] border border-[var(--state-danger)]/30'}`}>
                        {growthStats.profitGrowth >= 0 ? (
                            <>
                                <TrendingUp className="text-[var(--accent-emerald)]" size={24} />
                                <div>
                                    <p className="text-sm font-bold text-[var(--accent-emerald)] num">ยอดเยี่ยม! กำไรเพิ่มขึ้น {growthStats.profitGrowth}%</p>
                                    <p className="text-xs text-slate-400 num">เพิ่มขึ้น ฿{(monthlyStats.profit - lastMonthStats.profit).toLocaleString()} จากเดือนก่อน</p>
                                </div>
                            </>
                        ) : (
                            <>
                                <TrendingDown className="text-[var(--state-danger)]" size={24} />
                                <div>
                                    <p className="text-sm font-bold text-[var(--state-danger)] num">ต้องปรับปรุง กำไรลดลง {Math.abs(growthStats.profitGrowth)}%</p>
                                    <p className="text-xs text-slate-400 num">ลดลง ฿{Math.abs(monthlyStats.profit - lastMonthStats.profit).toLocaleString()} จากเดือนก่อน</p>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Middle Charts Content */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Product Popularity */}
                    <div className="lg:col-span-2 bg-[var(--bg-secondary)] rounded-[var(--radius)] p-6 shadow-sm border border-[var(--border-light)] flex flex-col">
                        <div className="flex justify-between items-center mb-10">
                            <h2 className="text-lg font-bold text-[var(--text-primary)]  tracking-tight flex items-center gap-3"><Crown className="text-[var(--state-warn)]" /> สินค้าขายดีที่สุด (เดือนปัจจุบัน)</h2>
                        </div>
                        <div className="space-y-8 flex-1">
                            {dashboardStats.topProducts.map((p) => {
                                const max = Math.max(...dashboardStats.topProducts.map(x => x.count), 1);
                                const percent = (p.count / max) * 100;
                                return (
                                    <div key={p.name} className="space-y-3">
                                        <div className="flex justify-between items-end">
                                            <span className="text-base font-bold text-[var(--text-primary)]">{p.name}</span>
                                            <span className="text-sm font-bold text-[var(--accent-emerald)]">{p.count} ชิ้น</span>
                                        </div>
                                        <div className="h-4 bg-[var(--bg-tertiary)] rounded-full overflow-hidden border border-[var(--border-light)] p-0.5">
                                            <div
                                                className="h-full rounded-full transition-all duration-1000 ease-out"
                                                style={{
                                                    width: `${percent}%`,
                                                    background: `linear-gradient(90deg, var(--accent-emerald) ${percent}%, var(--accent-emerald-dark) 100%)`
                                                }}
                                            ></div>
                                        </div>
                                    </div>
                                );
                            })}
                            {dashboardStats.topProducts.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center opacity-20 grayscale">
                                    <ShoppingBag size={80} />
                                    <p className="font-bold  tracking-widest mt-4">ยังไม่มีข้อมูลการขาย</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Peak Hours (Visual Matrix) */}
                    <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-[var(--radius)] p-6 text-white shadow-[var(--elev-3)] relative overflow-hidden border-b-8 border-[var(--accent-emerald)]">
                        <div className="relative z-[var(--z-nav)] flex flex-col h-full">
                            <h2 className="text-lg font-bold  tracking-widest mb-8 flex items-center gap-3 text-[var(--accent-emerald)]"><Activity /> ช่วงเวลาขายดี</h2>
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
                                                    background: intensity > 0 ? `color-mix(in srgb, var(--accent-emerald) ${(0.1 + intensity * 0.9) * 100}%, transparent)` : 'color-mix(in srgb, var(--text-primary) 3%, transparent)',
                                                    boxShadow: intensity > 0.8 ? '0 0 20px color-mix(in srgb, var(--accent-emerald) 40%, transparent)' : 'none'
                                                }}
                                            >
                                                {intensity > 0.5 && <Flame size={16} className="text-white animate-pulse" />}
                                            </div>
                                            <span className="text-xs font-medium text-[var(--text-secondary)]">{hour}:00</span>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-8 pt-8 border-t border-white/10">
                                <p className="text-xs font-medium text-[var(--accent-emerald)]  tracking-widest mb-1">ช่วงเวลาที่ลูกค้าแน่นที่สุด:</p>
                                {dashboardStats.peakHour !== null ? (
                                    <>
                                        <p className="text-3xl font-bold text-white tracking-tighter num">{dashboardStats.peakHour}:00 - {dashboardStats.peakHour + 1}:00 น.</p>
                                        <p className="text-xs text-[var(--text-secondary)] font-bold mt-2">วิเคราะห์จากยอดขายรวมรายชั่วโมงในเดือนนี้</p>
                                    </>
                                ) : (
                                    <p className="text-xl font-bold text-[var(--text-muted)] tracking-tight animate-pulse">รอข้อมูลการขาย...</p>
                                )}
                            </div>
                        </div>
                        <div className="absolute -bottom-10 -right-10 opacity-10 text-[var(--accent-emerald)]">
                            <Activity size={240} />
                        </div>
                    </div>
                </div>

                {/* Bottom Row - Profit Margin & Profitable Items */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-[var(--bg-secondary)] rounded-[var(--radius)] p-6 shadow-sm border border-[var(--border-light)] flex items-center gap-6">
                        <div className="relative flex-shrink-0">
                            <div className="w-32 h-32 rounded-full border-[16px] border-[var(--accent-emerald)] flex items-center justify-center shadow-[var(--elev-1)]">
                                <span className="text-2xl font-bold text-[var(--text-primary)]">{Math.round((monthlyStats.profit / (monthlyStats.revenue || 1)) * 100)}%</span>
                            </div>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-[var(--text-primary)]  tracking-tight mb-2">อัตรากำไร</h3>
                            <p className="text-3xl font-bold text-[var(--accent-emerald)] mb-2 num">฿{monthlyStats.profit.toLocaleString()}</p>
                            <p className="text-xs text-[var(--text-muted)] font-bold leading-relaxed">คำนวณจากยอดขายหักลบรายจ่ายทั้งหมดในระบบ เรียลไทม์</p>
                            {Number(startingCash) > 0 && (
                                <div className="mt-3 pt-3 border-t border-[var(--border-light)] flex items-center gap-2">
                                    <Banknote size={14} className="text-[var(--state-warn)]" />
                                    <span className="text-xs font-medium text-[var(--state-warn)]  num">เงินทอน: ฿{Number(startingCash).toLocaleString()}</span>
                                    <span className="text-xs font-medium text-[var(--text-muted)] num">| รวม: <span className="text-[var(--accent-emerald)] font-bold num">฿{(monthlyStats.profit + Number(startingCash)).toLocaleString()}</span></span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-[var(--bg-secondary)] rounded-[var(--radius)] p-6 shadow-sm border border-[var(--border-light)] flex items-center gap-6">
                        <div className="w-32 h-32 bg-[var(--accent-emerald-light)] rounded-full flex items-center justify-center text-[var(--accent-emerald)] shrink-0">
                            <TrendingUp size={64} />
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <h3 className="text-lg font-bold text-[var(--text-primary)]  tracking-tight mb-4">สินค้าทำกำไรสูงสุด 5 อันดับ</h3>
                            <div className="space-y-3">
                                {dashboardStats.topProfitable.map((p, idx) => (
                                    <div key={p.name} className="flex justify-between items-center text-xs">
                                        <span className="font-bold text-[var(--text-secondary)] truncate">{idx + 1}. {p.name}</span>
                                        <span className="font-bold text-[var(--accent-emerald)] shrink-0 ml-4 num">฿{Math.round(p.totalProfit).toLocaleString()}</span>
                                    </div>
                                ))}
                                {dashboardStats.topProfitable.length === 0 && <p className="text-xs text-[var(--text-muted)] italic">ต้องการข้อมูลยอดขายเพิ่มเติม...</p>}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Menu Performance Analysis */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Best Performers */}
                    <div className="bg-[var(--bg-secondary)] rounded-[var(--radius)] p-6 shadow-sm border border-[var(--border-light)]">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 bg-[var(--accent-emerald-light)] text-[var(--accent-emerald)] rounded-2xl flex items-center justify-center">
                                <Award size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-[var(--text-primary)]  tracking-tight">เมนูทำกำไรดีที่สุด</h3>
                                <p className="text-xs text-[var(--text-muted)] font-bold">สินค้าทำกำไรสูงสุด 5 อันดับ</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            {menuPerformance.bestPerformers.map((item, idx) => (
                                <div key={item.name} className="flex items-center gap-4 p-4 bg-[var(--bg-tertiary)] rounded-2xl border border-[var(--border-light)] hover:border-[var(--border-color)] transition-all">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${idx === 0 ? 'bg-yellow-500 text-white' : idx === 1 ? 'bg-[var(--bg-tertiary)] text-white' : idx === 2 ? 'bg-amber-600 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}>
                                        {idx + 1}
                                    </div>
                                    <div className="w-10 h-10 bg-[var(--bg-secondary)] rounded-xl overflow-hidden border border-[var(--border-light)] shrink-0">
                                        {item.image ? (
                                            <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
                                                <ShoppingBag size={16} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-[var(--text-primary)] text-sm truncate">{item.name}</p>
                                        <p className="text-xs text-[var(--text-muted)] num">ขาย {item.totalSold} ชิ้น | กำไร {item.profitMargin}%</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="font-bold text-[var(--accent-emerald)] text-lg num">฿{item.totalProfit.toLocaleString()}</p>
                                        <p className="text-xs text-[var(--text-muted)] ">กำไรรวม</p>
                                    </div>
                                </div>
                            ))}
                            {menuPerformance.bestPerformers.length === 0 && (
                                <div className="text-center py-8 text-[var(--text-muted)] text-sm">
                                    ยังไม่มีข้อมูลเพียงพอ (ต้องขายอย่างน้อย 3 ชิ้น)
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Needs Review */}
                    <div className="bg-[var(--bg-secondary)] rounded-[var(--radius)] p-6 shadow-sm border border-[var(--border-light)]">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 bg-[var(--bg-tertiary)] text-[var(--state-danger)] rounded-2xl flex items-center justify-center">
                                <AlertCircle size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-[var(--text-primary)]  tracking-tight">เมนูที่ควรทบทวน</h3>
                                <p className="text-xs text-[var(--text-muted)] font-bold">กำไรน้อย / ขายได้น้อย / ขายไม่ได้</p>
                            </div>
                        </div>
                        <div className="space-y-3 max-h-[400px] overflow-y-auto scrollbar-hide">
                            {menuPerformance.needsReview.slice(0, 8).map((item) => (
                                <div key={item.name} className={`flex items-center gap-4 p-4 rounded-2xl border ${item.totalSold === 0 ? 'bg-[var(--bg-tertiary)] border-[var(--border-color)]' : 'bg-[var(--bg-tertiary)]/50 border-[var(--border-color)]'}`}>
                                    <div className="w-10 h-10 bg-[var(--bg-secondary)] rounded-xl overflow-hidden border border-[var(--border-light)] shrink-0">
                                        {item.image ? (
                                            <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
                                                <ShoppingBag size={16} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-[var(--text-primary)] text-sm truncate">{item.name}</p>
                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            {item.totalSold === 0 && (
                                                <span className="text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] px-2 py-0.5 rounded-lg">
                                                    ขายไม่ได้เลย
                                                </span>
                                            )}
                                            {item.profitMargin < 30 && item.totalSold > 0 && (
                                                <span className="text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--state-danger)] px-2 py-0.5 rounded-lg">
                                                    กำไรต่ำ {item.profitMargin}%
                                                </span>
                                            )}
                                            {item.totalSold > 0 && item.totalSold < 3 && (
                                                <span className="text-xs font-medium bg-amber-100 text-[var(--state-warn)] px-2 py-0.5 rounded-lg">
                                                    ขายน้อย {item.totalSold} ชิ้น
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        {item.totalSold === 0 ? (
                                            <>
                                                <p className="font-bold text-lg text-[var(--text-muted)] num">฿{item.price.toLocaleString()}</p>
                                                <p className="text-xs text-[var(--text-muted)] ">ราคาขาย</p>
                                            </>
                                        ) : (
                                            <>
                                                <p className={`font-bold text-lg ${item.totalProfit >= 0 ? 'text-[var(--text-secondary)]' : 'text-[var(--state-danger)]'}`}>
                                                    ฿{item.totalProfit.toLocaleString()}
                                                </p>
                                                <p className="text-xs text-[var(--text-muted)] ">กำไรรวม</p>
                                            </>
                                        )}
                                    </div>
                                    {item.id && (
                                        <button
                                            onClick={() => setMenuToDelete(item)}
                                            aria-label={`ลบเมนู ${item.name}`}
                                            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--state-danger)] hover:bg-[var(--bg-tertiary)] transition-all shrink-0"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            ))}
                            {menuPerformance.needsReview.length === 0 && (
                                <div className="text-center py-8 text-[var(--accent-emerald)]">
                                    <Award size={48} className="mx-auto mb-3 opacity-50" />
                                    <p className="text-sm font-bold">ยอดเยี่ยม! ทุกเมนูทำกำไรได้ดี</p>
                                </div>
                            )}
                        </div>

                        {/* Recommendations */}
                        {menuPerformance.needsReview.length > 0 && (
                            <div className="mt-6 pt-4 border-t border-[var(--border-light)]">
                                <p className="text-xs font-medium text-[var(--text-muted)]  tracking-widest mb-3">คำแนะนำ</p>
                                <div className="space-y-2 text-xs text-[var(--text-secondary)]">
                                    {menuPerformance.needsReview.some(m => m.profitMargin < 30) && (
                                        <p className="flex items-start gap-2">
                                            <ThumbsDown size={14} className="text-[var(--state-danger)] shrink-0 mt-0.5" />
                                            <span>พิจารณาปรับราคาหรือลดต้นทุนเมนูที่กำไรต่ำกว่า 30%</span>
                                        </p>
                                    )}
                                    {menuPerformance.needsReview.some(m => m.totalSold > 0 && m.totalSold < 3) && (
                                        <p className="flex items-start gap-2">
                                            <AlertCircle size={14} className="text-[var(--state-warn)] shrink-0 mt-0.5" />
                                            <span>เมนูที่ขายน้อยอาจต้องการโปรโมทหรือพิจารณาตัดออก</span>
                                        </p>
                                    )}
                                    {menuPerformance.needsReview.some(m => m.totalSold === 0) && (
                                        <p className="flex items-start gap-2">
                                            <AlertCircle size={14} className="text-[var(--text-muted)] shrink-0 mt-0.5" />
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
            {/* Delete Menu Confirm Modal */}
            <ConfirmModal
                isOpen={!!menuToDelete}
                onClose={() => setMenuToDelete(null)}
                onConfirm={handleDeleteMenu}
                title={`ลบเมนู "${menuToDelete?.name || ''}"?`}
                message="เมนูนี้จะถูกลบออกจากระบบอย่างถาวร ข้อมูลการขายเก่าจะยังอยู่ในรายงาน"
                confirmText="ยืนยันลบ"
                cancelText="ยกเลิก"
                variant="danger"
            />
        </div>
    );
};

export default DashboardView;
