import React, { useState, useMemo, useEffect } from 'react';
import { BarChart3, Bot, FileText, MoreHorizontal } from 'lucide-react';
import { doc, deleteDoc } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { useAppContext } from '../../context/AppContext';
import { isArchivedStock } from '../../utils/stockMerge';
import { getISODate, getOrderDate } from '../../utils/calculations';
import { countUnits } from '../../utils/salesHistory';
import { computeProfitability } from '../../utils/profitability';
import { formatThaiDate } from '../../utils/format';
import { INVENTORY_CATEGORIES, NON_CASH_EXPENSE_CATEGORIES } from '../../config/constants';
import AiButton from '../AiButton';
import { AI_OFFLINE_HINT } from '../../utils/museJobs';
import { Button, ConfirmModal, DateStepper, IconButton, ListRow, PageHeader, Sheet, useMediaQuery, useToast } from '../ui';
import { compareMonths } from './overview/monthCompare';
import { computeTodayStats } from './overview/todayStats';
import { buildMenuImageLookup } from './overview/menuImage';
import TodayRow from './overview/TodayRow';
import ActionList from './overview/ActionList';
import MonthSection from './overview/MonthSection';
import MenuPerformance from './overview/MenuPerformance';
import AiConsultantSheet from './overview/AiConsultantSheet';

// หมวดที่ถือว่า "ซื้อของเข้าคลัง" ไม่ใช่ค่าใช้จ่ายของงวด (ถูกนับผ่าน COGS แทน)

/**
 * DashboardView · ภาพรวมร้าน (UX v2 · WP3)
 * Order: วันนี้ → ต้องจัดการ → เดือนนี้ (spec principle 3). All number rules are
 * the pre-v2 ones; only the month comparison window changed (matching days).
 */
const DashboardView = ({ onNavigate }) => {
    // 1. Get Data from Context
    const {
        orders,
        expenses,
        stock,
        members,
        menu,
        beanModifiers,
        callGeminiAPI,
        startingCash,
        aiUtils,
        aiReady,
        handleViewChange,
        runDbAction
    } = useAppContext();

    const toast = useToast();
    const isPhone = useMediaQuery('(max-width: 767px)');
    const [menuToDelete, setMenuToDelete] = useState(null);
    const [showMoreMenu, setShowMoreMenu] = useState(false);

    const [showConsultantModal, setShowConsultantModal] = useState(false);
    const [consultantQuery, setConsultantQuery] = useState('');
    const [consultantResponse, setConsultantResponse] = useState('');
    const [isConsulting, setIsConsulting] = useState(false);
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
        // ของเสียกับเจ้าของ/พนักงานกินถูกบันทึกเป็นรายจ่ายซ้ำอีกรอบตอนตัดสต็อก (ดู StockView) ทั้งที่เงิน
        // ไหลออกไปแล้วตอนซื้อวัตถุดิบ · ตัวเลขฝั่งเงินสดจึงต้องไม่นับมันอีก ไม่งั้น
        // ซื้อ 1,000 แล้วทิ้ง 200 จะกลายเป็นรายจ่าย 1,200 ทั้งที่จ่ายจริง 1,000
        const expenseTotal = monthExpenses
            .filter(e => !NON_CASH_EXPENSE_CATEGORIES.includes(e.category))
            .reduce((s, e) => s + (Number(e.amount) || 0), 0);
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

    // 1.0.1 ความสามารถทำกำไร · ตัดต้นทุนวัตถุดิบ "ตอนขาย" แทน "ตอนซื้อ"
    // คนละมุมกับ monthlyStats ข้างบน (ซึ่งเป็นกระแสเงินสด) และห้ามเอามาบวกลบกัน
    // ดูคำอธิบายเต็มใน utils/profitability.js
    const profitability = useMemo(() => computeProfitability({
        orders: orders.filter(o => o.status === 'completed' && String(getOrderDate(o)).startsWith(currentMonth)),
        expenses: expenses.filter(e => String(e.date || '').startsWith(currentMonth)),
        menu,
        stock,
        inventoryCategories: INVENTORY_CATEGORIES,
    }), [orders, expenses, menu, stock, currentMonth]);

    // 1.1 Month-over-month · matching day ranges (owner decision 2026-09-24):
    // Sep 1–24 vs Aug 1–24, never month-to-date vs a whole month.
    const comparison = useMemo(
        () => compareMonths({ orders, expenses, selectedMonth: currentMonth, todayISO: today }),
        [orders, expenses, currentMonth, today]
    );

    // 1.2 วันนี้ (always today, independent of the month picker)
    const todayStats = useMemo(() => computeTodayStats({ orders, expenses, today }), [orders, expenses, today]);
    const pendingPointsCount = useMemo(() => members.filter(m => Number(m.pendingPoints) > 0).length, [members]);

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
        const lowStockCount = stock.filter(s => !isArchivedStock(s) && Number(s.quantity) <= Number(s.minQuantity || 5)).length;

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
        // Order lines no longer carry `image` · resolve it from the live menu (id → name → stored).
        const imageFor = buildMenuImageLookup(menu);
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
                        image: imageFor(item),
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
                ให้คำแนะนำเชิงกลยุทธ์ เน้นเพิ่มกำไรและลดต้นทุน อ้างตัวเลขจากข้อมูลด้านบนทุกครั้งที่สรุป
                ถ้าข้อมูลด้านบนไม่พอจะตอบคำถาม ให้บอกตรงๆ ว่าขาดข้อมูลอะไร ห้ามเดาตัวเลข
                สไตล์ตอบ: เป็นกันเอง มืออาชีพ กระชับ ไม่เกิน 8 บรรทัด
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
                    : (result.error || 'ขออภัย AI ไม่พร้อมใช้งานชั่วคราว');
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
    // menu + beanModifiers enable the stock-link alerts (→ stock_audit).
    const alertsData = useMemo(() => ({
        orders,
        expenses,
        stock,
        members,
        menu,
        beanModifiers,
        today,
        currentMonth
    }), [orders, expenses, stock, members, menu, beanModifiers, today, currentMonth]);

    // PIN-aware navigation with optional hash params (filter/tab).
    const navigateTo = (view, params) => {
        const go = handleViewChange || onNavigate;
        go?.(view, params);
    };

    const monthNameShort = formatThaiDate(selectedMonth, { style: 'short' }).split(' ')[1];
    const suggestions = [
        `วิเคราะห์กำไร${selectedMonth === today.substring(0, 7) ? 'เดือนนี้' : monthNameShort}หน่อย`,
        "เปรียบเทียบวันนี้กับค่าเฉลี่ย",
        "แนะนำโปรโมชั่นกระตุ้นยอดขาย",
        "วิธีลดของเสียในร้าน"
    ];

    const isCurrentMonth = selectedMonth === today.substring(0, 7);
    const monthLabel = formatThaiDate(selectedMonth, { style: 'month' });
    const monthPicker = (
        <DateStepper mode="month" value={selectedMonth} onChange={(v) => v && setSelectedMonth(v)} />
    );
    const printReport = () => window.print();

    return (
        <div className="h-full bg-[var(--bg-canvas)] flex flex-col overflow-hidden text-[var(--text-primary)] relative">
            <PageHeader
                title="ภาพรวมร้าน"
                icon={BarChart3}
                sticky={false}
                actions={isPhone ? (
                    <IconButton icon={<MoreHorizontal size={22} />} size="lg" aria-label="ตัวเลือกเพิ่มเติม" onClick={() => setShowMoreMenu(true)} />
                ) : (
                    <>
                        {monthPicker}
                        <AiButton leftIcon={<Bot size={18} />} onClick={() => setShowConsultantModal(true)}>ถาม AI</AiButton>
                        <Button variant="secondary" leftIcon={<FileText size={18} />} onClick={printReport}>พิมพ์รายงาน</Button>
                    </>
                )}
                className={isPhone ? '[&>div]:flex-nowrap [&>div>div:last-child]:w-auto' : ''}
            />

            <div className="flex-1 overflow-y-auto px-[var(--page-pad)] py-5 md:py-6 pb-24 md:pb-10">
                <div className="max-w-[1400px] mx-auto flex flex-col gap-8">
                    <TodayRow
                        stats={todayStats}
                        today={today}
                        newMembersToday={memberStats.newMembersToday}
                        startingCash={startingCash}
                        onNavigate={navigateTo}
                    />

                    <ActionList
                        alertsData={alertsData}
                        todayStats={todayStats}
                        pendingPointsCount={pendingPointsCount}
                        onNavigate={navigateTo}
                    />

                    <MonthSection
                        monthLabel={monthLabel}
                        isCurrentMonth={isCurrentMonth}
                        monthPicker={isPhone ? monthPicker : null}
                        monthlyStats={monthlyStats}
                        profitability={profitability}
                        memberStats={memberStats}
                        dashboardStats={dashboardStats}
                        comparison={comparison}
                        startingCash={startingCash}
                        onNavigate={navigateTo}
                    />

                    <MenuPerformance menuPerformance={menuPerformance} onDelete={setMenuToDelete} />
                </div>
            </div>

            {/* Phone overflow menu (the header keeps the title only) */}
            <Sheet open={showMoreMenu} onClose={() => setShowMoreMenu(false)} title="ภาพรวมร้าน">
                <div className="-mx-5 flex flex-col">
                    <ListRow
                        leading={<Bot size={20} className="text-[var(--accent-ai)]" />}
                        title="ถาม AI ที่ปรึกษา"
                        subtitle={aiReady ? `วิเคราะห์ข้อมูล${isCurrentMonth ? 'เดือนนี้' : monthLabel}` : AI_OFFLINE_HINT}
                        onClick={() => { if (!aiReady) return; setShowMoreMenu(false); setShowConsultantModal(true); }}
                    />
                    <ListRow
                        leading={<FileText size={20} className="text-[var(--text-secondary)]" />}
                        title="พิมพ์รายงาน"
                        onClick={() => { setShowMoreMenu(false); setTimeout(printReport, 350); }}
                    />
                </div>
            </Sheet>

            <AiConsultantSheet
                open={showConsultantModal}
                onClose={() => setShowConsultantModal(false)}
                query={consultantQuery}
                onQueryChange={setConsultantQuery}
                response={consultantResponse}
                onNewQuestion={() => setConsultantResponse('')}
                isConsulting={isConsulting}
                aiReady={aiReady}
                onSubmit={handleConsultantQuery}
                suggestions={suggestions}
                chatHistory={chatHistory}
                onExportHistory={handleExportHistory}
                onClearHistory={handleClearHistory}
                lowStockCount={dashboardStats.lowStockCount}
                membersCount={members.length}
                onNavigate={navigateTo}
            />

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
