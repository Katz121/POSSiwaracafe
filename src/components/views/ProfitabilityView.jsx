import { useMemo, useState } from 'react';
import { ComposedChart, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar, Line } from 'recharts';
import { computeDailySeries, computeModifierCoverage, orderDay, computeMonthlySeries, computeItemPerformance, classifyMenuEngineering, computeHeadlineKpis, SEGMENT_LABELS, orderMonth } from '../../utils/menuInsights';
import { AlertCircle, ChevronLeft, Target } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { getISODate, getOrderDate } from '../../utils/calculations';
import { computeProfitability } from '../../utils/profitability';
import { STOCK_CATEGORIES } from '../../config/constants';
import { Badge, Button, Card, Table } from '../ui';

// การซื้อเข้าคลังต้องไม่ถูกหักซ้ำกับต้นทุนที่ใช้ตอนขาย
const INVENTORY_CATEGORIES = ['วัตถุดิบ', ...STOCK_CATEGORIES];
// ปัดเป็นบาทเต็มให้ตรงกับหน้าอื่นทั้งแอป · เศษสตางค์บนยอดเฉลี่ยต่อบิลไม่ได้ช่วย
// ตัดสินใจอะไร มีแต่ทำให้แถวตัวเลขอ่านยาก
const money = value => '฿' + Number(value).toLocaleString('th-TH', { maximumFractionDigits: 0 });
const baseColumns = [
    { key: 'name', label: 'ชื่อเมนู' },
    { key: 'quantity', label: 'จำนวนที่ขาย', render: value => value.toLocaleString() },
    { key: 'revenue', label: 'ยอดขาย', render: money },
    { key: 'ratio', label: '% ของราคา', render: (_, row) => row.revenue > 0 ? ((row.cost || 0) / row.revenue * 100).toFixed(2) + '%' : 'ไม่มีราคาขาย', sortable: false },
];
const suspiciousColumns = [
    ...baseColumns.slice(0, 3),
    { key: 'unitCost', label: 'ต้นทุนต่อหน่วย', render: (_, row) => money(row.cost / (row.quantity || 1)), sortable: false },
    baseColumns[3],
];

const number = value => Number(value).toLocaleString('th-TH', { maximumFractionDigits: 1 });
const percent = value => number(value) + '%';
const growthText = value => value === null ? 'เทียบไม่ได้' : (value > 0 ? '+' : '') + percent(value);
// ใช้รูปแบบเดียวกันทั้งตารางและกลุ่มเมนู เพื่อให้อ่านชื่อหลักและแยกตัวเลือกได้ทันที
const renderItemName = row => <span className="min-w-0 whitespace-normal break-words">
    <span>{row.baseName}</span>
    {row.modifier && <span className="block text-xs text-[var(--text-muted)]">{row.modifier}</span>}
</span>;
const itemName = { key: 'name', label: 'ชื่อเมนู', render: (_, row) => <span className="flex flex-wrap items-center gap-2">{renderItemName(row)}{row.costedShare === 0 && !(row.staleLinkShare > 0) && <Badge variant="warning" size="xs">ยังไม่ผูกต้นทุน</Badge>}</span> };
const unitsColumn = { key: 'units', label: 'จำนวนขาย', render: number };
// ใช้สัดส่วนที่ส่งมาเพราะการคิดต้นทุนได้บางแก้วไม่ได้ทำให้ทั้งแถวน่าเชื่อถือ
const renderMargin = (value, row) => <span className="inline-flex flex-col items-start gap-1">
    <span className="whitespace-nowrap num">{row.costedShare > 0 ? percent(value) : 'ยังไม่ทราบ'}</span>
    {row.costedShare > 0 && row.costedShare < 0.9 && <Badge variant="warning" size="xs" className="whitespace-nowrap">ต้นทุนครบ {percent(Math.round(row.costedShare * 100))}</Badge>}
    {row.staleLinkShare > 0 && <span className="w-44 whitespace-normal text-xs text-[var(--state-warn)]">
        สูตรอ้างสต็อกที่ถูกลบไปแล้ว {percent(Math.round(row.staleLinkShare * 100))} · ไปผูกสต็อกใหม่ให้เมนูนี้ในหน้าจัดการเมนู
    </span>}
</span>;
const marginColumn = { key: 'marginPct', label: 'มาร์จิ้น %', render: renderMargin };
const salesColumns = [itemName, unitsColumn, { key: 'revenue', label: 'ยอดขาย', render: money }, { key: 'revenueShare', label: '% ของยอดขายรวม', render: percent }, marginColumn];
const profitColumns = [itemName, { key: 'grossProfit', label: 'กำไรขั้นต้น', render: money }, { key: 'profitShare', label: '% ของกำไรรวม', render: percent }, unitsColumn, marginColumn];
const thinColumns = [itemName, marginColumn, { key: 'unitCost', label: 'ต้นทุน/ชิ้น', render: money }, { key: 'avgPrice', label: 'ราคาเฉลี่ย', render: money }, unitsColumn];
const tooltipStyle = { backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', borderRadius: 12 };
const axisStyle = { fill: 'var(--text-muted)', fontSize: 11 };
const chartMoney = value => '฿' + Number(value).toLocaleString('th-TH', { notation: 'compact' });
const SEGMENTS = ['star', 'workhorse', 'puzzle', 'dog'];
const shortDay = day => new Date(day + 'T00:00:00Z').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const modifierColumns = [
    { key: 'name', label: 'ชื่อตัวเลือก', render: (value, row) => <span className="flex flex-col items-start gap-1">
        <span>{value}</span>
        <Badge variant={row.linked ? 'success' : 'warning'} size="xs" className="whitespace-nowrap">{row.linked ? 'ผูกต้นทุนแล้ว' : 'ยังไม่ผูกต้นทุน'}</Badge>
    </span> },
    unitsColumn,
    { key: 'revenue', label: 'ยอดขาย', render: money },
    { key: 'costPerUnit', label: 'ต้นทุน/แก้ว', render: money },
    marginColumn,
];

export default function ProfitabilityView() {
    const { orders, expenses, menu, stock, beanModifiers, setView } = useAppContext();
    const [currentMonth, setCurrentMonth] = useState(() => getISODate().slice(0, 7));
    const profitability = useMemo(() => computeProfitability({
        orders: orders.filter(o => o.status === 'completed' && String(getOrderDate(o)).startsWith(currentMonth)),
        expenses: expenses.filter(e => String(e.date || '').startsWith(currentMonth)),
        menu,
        stock,
        inventoryCategories: INVENTORY_CATEGORIES,
    }), [orders, expenses, menu, stock, currentMonth]);



    const [mode, setMode] = useState('monthly');
    const [daysBack, setDaysBack] = useState(30);
    const isDaily = mode === 'daily';
    const [monthsBack, setMonthsBack] = useState(6);
    const [expanded, setExpanded] = useState({});
    // เริ่มแบบแยกเพื่อให้เห็นตัวเลือกที่มีราคาและต้นทุนต่างกันก่อนดูภาพรวมเมนู
    const [splitByModifier, setSplitByModifier] = useState(true);
    const monthlySeries = useMemo(() => computeMonthlySeries({ orders, expenses, menu, stock, monthsBack, inventoryCategories: INVENTORY_CATEGORIES }), [orders, expenses, menu, stock, monthsBack]);
    const dailySeries = useMemo(() => computeDailySeries({ orders, menu, stock, days: daysBack }), [orders, menu, stock, daysBack]);
    const series = isDaily ? dailySeries : monthlySeries;
    const periodKey = isDaily ? 'day' : 'month';
    const dailySummary = useMemo(() => {
        // วันหยุดไม่ควรดึงยอดเฉลี่ยลง จึงนับเฉพาะวันที่มีบิลสำเร็จ
        const openDays = dailySeries.filter(row => row.bills > 0);
        return {
            openDays: openDays.length,
            averageRevenue: openDays.length ? openDays.reduce((sum, row) => sum + row.revenue, 0) / openDays.length : 0,
            best: openDays.reduce((best, row) => !best || row.revenue > best.revenue ? row : best, null),
        };
    }, [dailySeries]);
    // ใช้ประวัติทั้งหมดเพื่อไม่เรียกตัวเลือกที่เคยขายนอกช่วงว่าไม่เคยขาย
    const modifierCoverage = useMemo(() => computeModifierCoverage({
        orders: orders.filter(order => order.status === 'completed'), beanModifiers, stock,
    }), [orders, beanModifiers, stock]);
    // รวมตัวเลือกที่ยังอยู่เพื่อเทียบกำไรได้ครบ ส่วนตัวเลือกที่ถูกลบยังแจ้งแยกตามเดิม
    const soldModifiers = useMemo(() => modifierCoverage.rows.filter(row => row.exists).sort((a, b) => b.revenue - a.revenue), [modifierCoverage]);
    const unsoldUnlinked = modifierCoverage.neverSold.filter(row => !row.linked);
    // ใช้ช่วงเดียวกัน · เพื่อไม่ให้จำนวนบิลกับกำไรอ้างถึงคนละช่วงเวลา
    const rangeOrders = useMemo(() => {
        const periods = new Set(series.map(row => row[periodKey]));
        return orders.filter(order => order.status === 'completed' && periods.has(isDaily ? orderDay(order) : orderMonth(order)));
    }, [orders, series, periodKey, isDaily]);
    const rangeProfitability = useMemo(() => computeProfitability({ orders: rangeOrders, menu, stock, inventoryCategories: INVENTORY_CATEGORIES }), [rangeOrders, menu, stock]);
    const items = useMemo(() => computeItemPerformance({ orders: rangeOrders, menu, stock, splitByModifier }), [rangeOrders, menu, stock, splitByModifier]);
    const kpis = useMemo(() => computeHeadlineKpis({ orders: rangeOrders, items, profitability: rangeProfitability, series }), [rangeOrders, items, rangeProfitability, series]);
    const engineering = useMemo(() => classifyMenuEngineering(items), [items]);
    const groups = useMemo(() => Object.fromEntries([...SEGMENTS, 'unknown'].map(segment => [segment, engineering.items.filter(item => item.segment === segment)])), [engineering]);
    // API ส่งเพียงสิบอันดับ จึงจัดรายการเต็มจากผลเดิมเพื่อขยายได้โดยไม่คำนวณกำไรซ้ำ
    const rankings = useMemo(() => [
        { key: 'sales', title: 'ขายดีที่สุด', columns: salesColumns, top: kpis.topBySales, all: [...items].sort((a, b) => b.revenue - a.revenue) },
        { key: 'profit', title: 'ทำกำไรให้ร้านมากที่สุด', columns: profitColumns, top: kpis.topByProfit, all: items },
        { key: 'thin', title: 'ขายดีแต่มาร์จิ้นบาง', hint: 'ขึ้นราคาหรือลดต้นทุนตรงนี้ได้ผลไวที่สุด · เรียงมาร์จิ้นจากน้อยไปมากในเมนูที่ขายและผูกต้นทุนแล้ว', columns: thinColumns,
            top: kpis.thinMargin.map(item => ({ ...item, unitCost: item.units > 0 ? item.cogs / item.units : 0 })),
            all: items.filter(item => item.costed && item.units > 0).sort((a, b) => a.marginPct - b.marginPct).map(item => ({ ...item, unitCost: item.cogs / item.units })) },
    ], [items, kpis]);
    const visibleRankings = useMemo(() => rankings.map(row => ({ ...row, visible: expanded[row.key] ? row.all : row.top })), [rankings, expanded]);
    const visibleGroups = useMemo(() => SEGMENTS.map(segment => ({ segment, all: groups[segment], visible: expanded[segment] ? groups[segment] : groups[segment].slice(0, 5) })), [groups, expanded]);
    const toggle = key => setExpanded(previous => ({ ...previous, [key]: !previous[key] }));

    return (
        <div className="h-full flex flex-col overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
            <header className="h-16 md:h-20 lg:h-24 shrink-0 flex items-center gap-3 px-4 md:px-8 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
                <Button variant="ghost" onClick={() => setView('admin')} aria-label="กลับหน้าจัดการ"><ChevronLeft size={24} /></Button>
                <h1 className="text-lg md:text-2xl font-bold">ความสามารถทำกำไร</h1>
            </header>
            <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 space-y-6">
                <label className="flex flex-wrap items-center gap-3 font-medium">เดือนที่เลือก · สรุปกำไรและจุดคุ้มทุน
                    <input type="month" value={currentMonth} onChange={e => setCurrentMonth(e.target.value)} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3" />
                </label>
                {/* กำไรขั้นต้น · กำไรสุทธิ · จุดคุ้มทุน
                    แยกจากตัวเลขเงินสดข้างบนโดยตั้งใจ ตัวนี้ตัดต้นทุนตอนขาย ไม่ใช่ตอนซื้อ */}
                <Card padding="lg" className="space-y-6">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-3">
                                <Target className="text-[var(--accent-emerald)]" /> ความสามารถทำกำไร
                            </h2>
                            <p className="text-xs text-[var(--text-muted)] mt-1">
                                ตัดต้นทุนวัตถุดิบตอนขาย ไม่ใช่ตอนซื้อ · ห้ามเอาไปบวกลบกับตัวเลขเงินสด
                            </p>
                        </div>
                        {profitability.cogsCoverage < 100 && (
                            <Badge variant={profitability.cogsCoverage < 60 ? 'danger' : 'warning'}>
                                ต้นทุนครอบคลุมยอดขาย {profitability.cogsCoverage}%
                            </Badge>
                        )}
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-[var(--bg-tertiary)] rounded-2xl p-4 border border-[var(--border-color)]">
                            <p className="text-xs font-medium text-[var(--text-muted)] tracking-wider mb-2">กำไรขั้นต้น</p>
                            <p className="text-3xl lg:text-4xl font-bold text-[var(--accent-emerald)] num">฿{Math.round(profitability.grossProfit).toLocaleString()}</p>
                            <p className="text-xs text-[var(--text-muted)] mt-1 num">มาร์จิ้น {profitability.grossMargin}%</p>
                        </div>

                        <div className="bg-[var(--bg-tertiary)] rounded-2xl p-4 border border-[var(--border-color)]">
                            <p className="text-xs font-medium text-[var(--text-muted)] tracking-wider mb-2">ต้นทุนวัตถุดิบที่ใช้ไป</p>
                            <p className="text-3xl lg:text-4xl font-bold text-[var(--text-primary)] num">฿{Math.round(profitability.cogs).toLocaleString()}</p>
                            <p className="text-xs text-[var(--text-muted)] mt-1 num">{profitability.cogsRatio}% ของยอดขาย</p>
                        </div>

                        <div className="bg-[var(--bg-tertiary)] rounded-2xl p-4 border border-[var(--border-color)]">
                            <p className="text-xs font-medium text-[var(--text-muted)] tracking-wider mb-2">กำไรสุทธิ</p>
                            <p className={`text-3xl lg:text-4xl font-bold num ${profitability.netProfit >= 0 ? 'text-[var(--accent-emerald)]' : 'text-[var(--state-danger)]'}`}>
                                ฿{Math.round(profitability.netProfit).toLocaleString()}
                            </p>
                            <p className="text-xs text-[var(--text-muted)] mt-1 num">หลังหักค่าใช้จ่าย ฿{Math.round(profitability.fixedCosts).toLocaleString()}</p>
                        </div>

                        <div className="bg-[var(--bg-tertiary)] rounded-2xl p-4 border border-[var(--border-color)]">
                            <p className="text-xs font-medium text-[var(--text-muted)] tracking-wider mb-2">กำไรขั้นต้นต่อแก้ว</p>
                            <p className="text-3xl lg:text-4xl font-bold text-[var(--text-primary)] num">฿{Math.round(profitability.contributionPerUnit).toLocaleString()}</p>
                            <p className="text-xs text-[var(--text-muted)] mt-1 num">ขายไป {profitability.unitsSold.toLocaleString()} หน่วย</p>
                        </div>
                    </div>

                    {/* จุดคุ้มทุน · ตัวเลขที่ใช้ตัดสินใจได้จริงที่สุดจากทั้งหน้านี้ */}
                    <div className="rounded-2xl p-5 border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                        {profitability.breakEvenUnits === null ? (
                            <p className="text-sm text-[var(--state-danger)] font-medium">
                                ยังคำนวณจุดคุ้มทุนไม่ได้ · กำไรขั้นต้นต่อหน่วยไม่เป็นบวก แปลว่ายิ่งขายยิ่งขาดทุน ให้ตรวจราคาขายกับต้นทุนก่อน
                            </p>
                        ) : !profitability.hasFixedCosts ? (
                            <p className="text-sm text-[var(--state-warn)] font-medium">
                                ยังไม่ได้บันทึกค่าใช้จ่ายคงที่ของเดือนนี้ (ค่าเช่า เงินเดือน ค่าไฟ) จุดคุ้มทุนเลยยังไม่มีความหมาย · บันทึกรายจ่ายพวกนี้เข้าระบบก่อน แล้วตัวเลขจะขึ้นเอง
                            </p>
                        ) : (
                            <>
                                <div className="flex items-baseline justify-between gap-4 flex-wrap mb-3">
                                    <p className="text-sm font-bold text-[var(--text-primary)]">
                                        จุดคุ้มทุนเดือนนี้ · <span className="num">{profitability.breakEvenUnits.toLocaleString()}</span> หน่วย
                                        <span className="text-[var(--text-muted)] font-normal num"> (฿{profitability.breakEvenRevenue.toLocaleString()})</span>
                                    </p>
                                    <p className={`text-sm font-bold ${profitability.pastBreakEven ? 'text-[var(--accent-emerald)]' : 'text-[var(--state-warn)]'}`}>
                                        {profitability.pastBreakEven
                                            ? `เลยจุดคุ้มทุนแล้ว ทุกหน่วยจากนี้กำไรเต็ม ฿${Math.round(profitability.contributionPerUnit).toLocaleString()}`
                                            : `เหลืออีก ${profitability.unitsToBreakEven.toLocaleString()} หน่วยถึงเท่าทุน`}
                                    </p>
                                </div>
                                <div className="h-3 w-full bg-[var(--bg-tertiary)] rounded-full overflow-hidden border border-[var(--border-color)]">
                                    <div
                                        className={`h-full rounded-full transition-all ${profitability.pastBreakEven ? 'bg-[var(--accent-emerald)]' : 'bg-[var(--state-warn)]'}`}
                                        style={{ width: `${Math.min(100, Math.round((profitability.unitsSold / profitability.breakEvenUnits) * 100))}%` }}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    <p className="text-xs text-[var(--text-muted)]">มาร์จิ้นในตารางด้านล่างคิดจากต้นทุนที่ผูกไว้ · เดือนสรุป {currentMonth} ครอบคลุมยอดขาย {percent(profitability.cogsCoverage)} · รายการที่มีป้ายเตือนคือตัวที่ต้นทุนยังไม่ครบ ตัวเลขจะสูงเกินจริง</p>

                    {/* ผูกสต็อกไม่ครบ = กำไรขั้นต้นสวยเกินจริงเสมอ ต้องเตือนให้เห็น */}
                    {profitability.uncostedItems.length > 0 && (
                        <div className="rounded-2xl p-5 border border-[var(--border-color)] bg-[var(--bg-tertiary)]">
                            <p className="text-sm font-bold text-[var(--state-warn)] mb-1 flex items-center gap-2">
                                <AlertCircle size={16} /> ยังไม่ได้ผูกต้นทุน {profitability.uncostedItems.length} เมนู
                            </p>
                            <p className="text-xs text-[var(--text-muted)] mb-3">
                                เมนูพวกนี้ถูกคิดต้นทุนเป็น 0 ทำให้กำไรขั้นต้นข้างบนสูงกว่าความจริง · ผูกสต็อกในหน้าจัดการเมนูเพื่อให้ตัวเลขตรง
                            </p>
                            <Table data={profitability.uncostedItems} columns={baseColumns} />
                        </div>
                    )}

                    <div className="rounded-2xl p-5 border border-[var(--border-color)] bg-[var(--bg-tertiary)] space-y-3">
                        <h3 className="font-bold">ต้นทุนของตัวเลือก (#)</h3>
                        <p className="text-xs text-[var(--text-muted)]">บิลสำเร็จทั้งหมดที่โหลดมา · แยกจากเดือนสรุปกำไรและช่วงกราฟ</p>
                        <p>ยอดขาย {money(modifierCoverage.totalRevenue)} วิ่งผ่านตัวเลือก · ผูกต้นทุนแล้ว {percent(modifierCoverage.coveragePct)}</p>
                        <p className="text-sm text-[var(--text-muted)]">ตัวเลือกที่เคยขายและยังอยู่ในทะเบียนทั้งหมด เรียงตามยอดขาย · ป้ายใต้ชื่อบอกสถานะการผูกปัจจุบัน ป้ายใต้มาร์จิ้นบอกต้นทุนที่คิดได้จากบิล · ผูกได้ที่หน้าแอดมินในรายการตัวเลือก (#)</p>
                        <Table className="min-w-0 [&_table]:min-w-[640px]" data={soldModifiers} columns={modifierColumns} sortable={false} emptyMessage="ยังไม่มีตัวเลือกที่เคยขายและยังอยู่ในทะเบียน" />
                        {modifierCoverage.missing.length > 0 && <p className="text-sm text-[var(--state-warn)]">มีอีก {modifierCoverage.missing.length} ตัวเลือกที่ถูกลบไปแล้ว บิลเก่าจะไม่มีต้นทุนตลอดไป แก้ไม่ได้</p>}
                        {unsoldUnlinked.length > 0 && <p className="text-sm text-[var(--state-warn)]">ยังไม่ผูกและยังไม่เคยขาย {unsoldUnlinked.length} ตัวเลือก: {unsoldUnlinked.map(row => row.name).join(' · ')} · ควรผูกก่อนเริ่มขาย</p>}
                    </div>

                    {/* ผูกบางส่วนอันตรายกว่าไม่ผูกเลย เพราะมันผ่านด่าน "คิดต้นทุนแล้ว" ไปได้เงียบๆ */}
                    {profitability.suspiciousItems.length > 0 && (
                        <div className="rounded-2xl p-5 border border-[var(--border-color)] bg-[var(--bg-tertiary)]">
                            <p className="text-sm font-bold text-[var(--state-warn)] mb-1 flex items-center gap-2">
                                <AlertCircle size={16} /> ต้นทุนต่ำผิดปกติ {profitability.suspiciousItems.length} เมนู
                            </p>
                            <p className="text-xs text-[var(--text-muted)] mb-3">
                                ผูกสต็อกไว้แล้วแต่ต้นทุนต่ำกว่า 8% ของราคาขาย มักเกิดตอนที่วัตถุดิบหลักอยู่ที่ตัวเลือก (#) ซึ่งยังไม่ได้ผูกสต็อก หรือยังไม่ได้ใส่แก้ว ฝา หลอด
                            </p>
                            <Table data={profitability.suspiciousItems} columns={suspiciousColumns} />
                        </div>
                    )}

                    {/* อธิบายว่าทำไมกำไรกับเงินสดไม่เท่ากัน แทนที่จะให้วางงงเอง */}
                    {Math.abs(profitability.inventoryMovement) > 100 && (
                        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                            {profitability.inventoryMovement > 0
                                ? `เดือนนี้ซื้อของเข้าคลังมากกว่าที่ใช้ไป ฿${Math.round(profitability.inventoryMovement).toLocaleString()} เงินสดเลยดูหายมากกว่ากำไรที่หายจริง ของก้อนนี้จะกลายเป็นยอดขายเดือนหน้า`
                                : `เดือนนี้ใช้ของเก่าในคลังมากกว่าที่ซื้อเข้า ฿${Math.abs(Math.round(profitability.inventoryMovement)).toLocaleString()} เงินสดเลยดูดีกว่ากำไรจริง เดือนหน้าถ้าต้องตุนของ เงินสดจะตกลง`}
                        </p>
                    )}
                </Card>

                <section className="space-y-6" aria-label="วิเคราะห์ตามช่วงกราฟ">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div><h2 className="text-xl font-bold">แนวโน้มและวิเคราะห์เมนู</h2>
                            <p className="text-sm text-[var(--text-muted)]">ช่วงนี้ใช้กับกราฟ ตัวเลขสรุป และตารางด้านล่าง · สิ้นสุด{isDaily ? 'วัน' : 'เดือน'}ล่าสุดที่มีขาย</p>
                            <p className="text-sm">{series.length ? series[0][periodKey] + ' ถึง ' + series[series.length - 1][periodKey] : 'ยังไม่มีข้อมูลการขาย'}</p>
                        </div>
                        <div className="flex flex-wrap gap-2" role="group" aria-label="โหมดกราฟ">
                            {[['daily', 'รายวัน'], ['monthly', 'รายเดือน']].map(([value, label]) => <Button key={value} className="min-h-11" variant={mode === value ? 'primary' : 'secondary'} aria-pressed={mode === value} onClick={() => setMode(value)}>{label}</Button>)}
                        </div>
                        <div className="flex flex-wrap gap-2" role="group" aria-label="ช่วงเวลาสำหรับกราฟและวิเคราะห์เมนู">
                            {(isDaily ? [[7, '7 วัน'], [30, '30 วัน'], [90, '90 วัน']] : [[6, '6 เดือน'], [12, '1 ปี'], [null, 'ทั้งหมด']]).map(([value, label]) => <Button key={label} className="min-h-11" variant={(isDaily ? daysBack : monthsBack) === value ? 'primary' : 'secondary'} aria-pressed={(isDaily ? daysBack : monthsBack) === value} onClick={() => isDaily ? setDaysBack(value) : setMonthsBack(value)}>{label}</Button>)}
                        </div>
                    </div>
                    <Card padding="lg" className="space-y-4">
                        <h3 className="font-bold">ยอดขาย ต้นทุน และกำไร{isDaily ? 'รายวัน' : 'รายเดือน'}</h3>
                        <p className="text-xs text-[var(--text-muted)]">แกนซ้าย: บาท · แกนขวา: มาร์จิ้น % · ต้นทุนที่ยังไม่ผูกอาจทำให้กำไรสูงเกินจริง</p>
                        <div className="h-[360px] min-w-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={series} margin={{ top: 12, right: 0, bottom: 8, left: 0 }}>
                                    <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" />
                                    <XAxis dataKey={periodKey} tickFormatter={isDaily ? shortDay : undefined} interval="preserveStartEnd" tick={axisStyle} minTickGap={24} stroke="var(--border-color)" />
                                    <YAxis yAxisId="money" tick={axisStyle} tickFormatter={chartMoney} width={65} stroke="var(--border-color)" />
                                    <YAxis yAxisId="margin" orientation="right" tick={axisStyle} tickFormatter={percent} width={48} stroke="var(--border-color)" />
                                    <Tooltip contentStyle={tooltipStyle} labelFormatter={label => isDaily ? shortDay(label) + ' (' + label + ')' : 'เดือน ' + label} formatter={(value, name) => [name === 'มาร์จิ้น' ? percent(value) : money(value), name]} />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    <Bar yAxisId="money" dataKey="revenue" name="ยอดขาย" fill="var(--accent-emerald)" />
                                    <Bar yAxisId="money" dataKey="cogs" name="ต้นทุนวัตถุดิบ" fill="var(--accent-orange)" />
                                    <Line yAxisId="money" dataKey="grossProfit" name="กำไรขั้นต้น" stroke="var(--accent-ai)" strokeWidth={3} dot={false} />
                                    <Line yAxisId="margin" dataKey="grossMargin" name="มาร์จิ้น" stroke="var(--text-secondary)" strokeDasharray="5 4" strokeWidth={2} dot={false} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                    {isDaily && <div className="space-y-4">
                        <p className="text-sm text-[var(--text-muted)]">รายวันดูกำไรขั้นต้นเท่านั้น ค่าเช่ากับเงินเดือนจ่ายเป็นก้อนรายเดือน หารรายวันแล้วอ่านผิด</p>
                        <div className="grid sm:grid-cols-3 gap-4">
                            <Card padding="md"><p className="text-sm text-[var(--text-muted)]">วันที่ขายดีที่สุดในช่วง</p><p className="text-xl font-bold mt-2 num">{dailySummary.best ? shortDay(dailySummary.best.day) + ' · ' + money(dailySummary.best.revenue) : 'ยังไม่มีวันที่เปิดร้าน'}</p></Card>
                            <Card padding="md"><p className="text-sm text-[var(--text-muted)]">ยอดขายเฉลี่ยต่อวันที่เปิดร้าน</p><p className="text-2xl font-bold mt-2 num">{money(dailySummary.averageRevenue)}</p></Card>
                            <Card padding="md"><p className="text-sm text-[var(--text-muted)]">จำนวนวันที่เปิดร้านในช่วง</p><p className="text-2xl font-bold mt-2 num">{number(dailySummary.openDays)} วัน</p></Card>
                        </div>
                    </div>}
                    <Card padding="lg" className="space-y-3">
                        <h3 className="font-bold">จำนวนบิล{isDaily ? 'รายวัน' : 'รายเดือน'}</h3>
                        <p className="text-xs text-[var(--text-muted)]">ดูว่ายอดขายเปลี่ยนตามจำนวนการซื้อหรือไม่ · จำนวนบิลไม่ใช่จำนวนลูกค้าที่ไม่ซ้ำกัน</p>
                        <div className="h-56 min-w-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={series}>
                                    <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" />
                                    <XAxis dataKey={periodKey} tickFormatter={isDaily ? shortDay : undefined} interval="preserveStartEnd" tick={axisStyle} minTickGap={24} stroke="var(--border-color)" />
                                    <YAxis tick={axisStyle} allowDecimals={false} stroke="var(--border-color)" />
                                    <Tooltip contentStyle={tooltipStyle} labelFormatter={label => isDaily ? shortDay(label) + ' (' + label + ')' : 'เดือน ' + label} formatter={value => [number(value) + ' บิล', 'จำนวนบิล']} />
                                    <Bar dataKey="bills" name="จำนวนบิล" fill="var(--accent-emerald)" />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            ['ยอดขายเฉลี่ยต่อบิล', money(kpis.averageTicket)], ['กำไรขั้นต้นต่อบิล', money(kpis.grossProfitPerBill)],
                            ['จำนวนชิ้นต่อบิล', number(kpis.unitsPerBill)], ['จำนวนบิล', number(kpis.bills)],
                        ].map(([label, value]) => <Card key={label} padding="md"><p className="text-sm text-[var(--text-muted)]">{label}</p><p className="text-2xl font-bold mt-2 num">{value}</p></Card>)}
                    </div>
                    <Card padding="lg" className="space-y-2">
                        <p className="font-bold">{isDaily ? 'วันล่าสุดในกราฟเทียบวันก่อน' : 'เดือนล่าสุดในกราฟเทียบเดือนก่อน'} {series.length > 1 && '(' + series[series.length - 1][periodKey] + ' เทียบ ' + series[series.length - 2][periodKey] + ')'}</p>
                        <p>ยอดขาย {growthText(kpis.revenueGrowth)} · กำไรขั้นต้น {growthText(kpis.profitGrowth)}</p>
                        <p>{kpis.concentration.count > 0 ? 'กำไร ' + kpis.concentration.sharePct + '% มาจาก ' + kpis.concentration.count + ' เมนู จากทั้งหมด ' + kpis.concentration.of + ' เมนู' : 'ยังไม่มีกำไรบวกสำหรับวิเคราะห์การกระจุกตัว'}</p>
                        <p className="text-xs text-[var(--state-warn)]">กำไรและส่วนแบ่งกำไรรวมเมนูที่ยังไม่ผูกต้นทุน จึงอาจสูงเกินจริง</p>
                    </Card>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="การแสดงตัวเลือกในตารางและกลุ่มเมนู">
                        {[[false, 'รวมทุกตัวเลือก'], [true, 'แยกตามตัวเลือก']].map(([value, label]) => <Button
                            key={label}
                            className="min-h-11"
                            variant={splitByModifier === value ? 'primary' : 'secondary'}
                            aria-pressed={splitByModifier === value}
                            onClick={() => setSplitByModifier(value)}
                        >{label}</Button>)}
                    </div>
                    {/* ใช้ช่วงกราฟเพื่อไม่ให้ความครอบคลุมของเดือนอื่นทำให้เข้าใจผิด */}
                    <p className="text-xs text-[var(--text-muted)]">มาร์จิ้นตามช่วงกราฟครอบคลุมยอดขาย {percent(rangeProfitability.cogsCoverage)} · ป้ายเตือนบอกสัดส่วนหน่วยที่คิดต้นทุนได้ ตัวเลขมาร์จิ้นจะสูงเกินจริงเมื่อคิดต้นทุนไม่ครบ · ยังไม่ทราบ หมายถึงยังคิดต้นทุนไม่ได้</p>
                    {visibleRankings.map(ranking => <Card key={ranking.key} padding="lg" className="space-y-4">
                        <div className="flex flex-wrap justify-between items-center gap-3">
                            <h3 className="font-bold">{ranking.title}</h3>
                            {ranking.all.length > 10 && <Button variant="secondary" className="min-h-11" aria-expanded={!!expanded[ranking.key]} onClick={() => toggle(ranking.key)}>{expanded[ranking.key] ? 'ย่อเหลือ 10 อันดับ' : 'ดูทั้งหมด (' + ranking.all.length + ')'}</Button>}
                        </div>
                        {ranking.hint && <p className="text-sm text-[var(--text-muted)]">{ranking.hint}</p>}
                        <Table className="min-w-0 [&_table]:min-w-[640px]" data={ranking.visible} columns={ranking.columns} sortable={false} emptyMessage="ยังไม่มีเมนูในช่วงนี้" />
                    </Card>)}
                    <div className="space-y-3">
                        <h3 className="text-lg font-bold">การจัดกลุ่มเมนู</h3>
                        <p className="text-sm text-[var(--text-muted)]">ค่ากลางร้าน: ขาย {number(engineering.unitsMedian)} ชิ้น · มาร์จิ้น {percent(engineering.marginMedian)} · ใช้เฉพาะเมนูที่ผูกต้นทุนในช่วงนี้ · รายชื่อเรียงตามกำไรขั้นต้น</p>
                        {groups.unknown.length > 0 && <div role="status" className="rounded-xl border border-[var(--state-warn)] p-4 text-[var(--state-warn)]">{SEGMENT_LABELS.unknown.label} {groups.unknown.length} เมนู · {SEGMENT_LABELS.unknown.hint}</div>}
                        <div className="grid md:grid-cols-2 gap-4">
                            {visibleGroups.map(({ segment, all, visible }) => <Card key={segment} padding="lg" className="space-y-3">
                                <h4 className="font-bold">{SEGMENT_LABELS[segment].label} · {all.length} เมนู</h4>
                                <p className="text-sm text-[var(--text-muted)]">{SEGMENT_LABELS[segment].hint}</p>
                                <ol className="space-y-2">{visible.map(item => <li key={item.name} className="flex justify-between gap-3 text-sm">{renderItemName(item)}<span className="shrink-0 num">{money(item.grossProfit)}</span></li>)}</ol>
                                {!all.length && <p className="text-sm text-[var(--text-muted)]">ไม่มีเมนูในกลุ่มนี้</p>}
                                {all.length > 5 && <Button variant="secondary" className="min-h-11" aria-expanded={!!expanded[segment]} onClick={() => toggle(segment)}>{expanded[segment] ? 'ย่อเหลือ 5 เมนู' : 'ดูทั้งหมด (' + all.length + ')'}</Button>}
                            </Card>)}
                        </div>
                    </div>
                </section>

            </div>
        </div>
    );
}
