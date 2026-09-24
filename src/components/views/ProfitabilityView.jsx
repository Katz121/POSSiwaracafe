import { useMemo, useState } from 'react';
import { ComposedChart, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar, Line } from 'recharts';
import { computeDailySeries, computeModifierCoverage, orderDay, computeMonthlySeries, computeItemPerformance, classifyMenuEngineering, computeHeadlineKpis, SEGMENT_LABELS, orderMonth } from '../../utils/menuInsights';
import { AlertCircle, Target, Package, Receipt, TrendingUp } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { getISODate, getOrderDate } from '../../utils/calculations';
import { computeProfitability } from '../../utils/profitability';
import { formatBaht, formatNumber, formatPercent, formatThaiDate } from '../../utils/format';
import { STOCK_CATEGORIES } from '../../config/constants';
import { Badge, Banner, Button, DataTable, DateStepper, PageHeader, SectionCard, SegmentedControl, StatCard } from '../ui';

// การซื้อเข้าคลังต้องไม่ถูกหักซ้ำกับต้นทุนที่ใช้ตอนขาย
const INVENTORY_CATEGORIES = ['วัตถุดิบ', ...STOCK_CATEGORIES];
// ปัดเป็นบาทเต็มให้ตรงกับหน้าอื่นทั้งแอป · เศษสตางค์บนยอดเฉลี่ยต่อบิลไม่ได้ช่วย
// ตัดสินใจอะไร มีแต่ทำให้แถวตัวเลขอ่านยาก
const money = value => formatBaht(value, { decimals: 0 });
const number = value => formatNumber(value, { maxDecimals: 1 });
const percent = value => formatPercent(value, { digits: 1 });
const growthText = value => value === null ? 'เทียบไม่ได้' : formatPercent(value, { digits: 1, sign: true });

// DataTable needs a stable, unique key · names repeat (two "เค้กวันเกิด" at different prices).
const withKeys = rows => rows.map((row, i) => ({ ...row, _k: `${row.name}#${i}` }));
const byNum = key => row => Number(row[key]) || 0;

const baseColumns = [
    { key: 'name', header: 'ชื่อเมนู', sortable: true },
    { key: 'quantity', header: 'จำนวนที่ขาย', numeric: true, sortable: true, render: number },
    { key: 'revenue', header: 'ยอดขาย', numeric: true, sortable: true, render: money },
    { key: 'ratio', header: '% ของราคา', numeric: true, render: (_, row) => row.revenue > 0 ? formatPercent((row.cost || 0) / row.revenue * 100, { digits: 2 }) : 'ไม่มีราคาขาย' },
];
const suspiciousColumns = [
    ...baseColumns.slice(0, 3),
    { key: 'unitCost', header: 'ต้นทุนต่อหน่วย', numeric: true, render: (_, row) => money(row.cost / (row.quantity || 1)) },
    baseColumns[3],
];

// ใช้รูปแบบเดียวกันทั้งตารางและกลุ่มเมนู เพื่อให้อ่านชื่อหลักและแยกตัวเลือกได้ทันที
const renderItemName = row => <span className="min-w-0 whitespace-normal break-words">
    <span>{row.baseName}</span>
    {row.modifier && <span className="block text-xs text-[var(--text-muted)]">{row.modifier}</span>}
</span>;
const itemName = { key: 'name', header: 'ชื่อเมนู', render: (_, row) => <span className="flex flex-wrap items-center gap-2">{renderItemName(row)}{row.costedShare === 0 && !(row.staleLinkShare > 0) && <Badge variant="warning" size="xs">ยังไม่ผูกต้นทุน</Badge>}</span> };
const unitsColumn = { key: 'units', header: 'จำนวนขาย', numeric: true, render: number };
// ใช้สัดส่วนที่ส่งมาเพราะการคิดต้นทุนได้บางแก้วไม่ได้ทำให้ทั้งแถวน่าเชื่อถือ
const renderMargin = (value, row) => <span className="inline-flex flex-col items-end gap-1">
    <span className="whitespace-nowrap num">{row.costedShare > 0 ? percent(value) : 'ยังไม่ทราบ'}</span>
    {row.costedShare > 0 && row.costedShare < 0.9 && <Badge variant="warning" size="xs" className="whitespace-nowrap">ต้นทุนครบ {percent(Math.round(row.costedShare * 100))}</Badge>}
    {/* คนละอาการกับต้นทุนครบไม่ถึง 90% · อันนี้คือผูกครบทุกแก้วแล้วแต่สูตรเองไม่ครบ
        เช่นอเมริกาโนผูกไว้แค่แก้วกับหลอด ส่วนเมล็ดอยู่ที่ตัวเลือกที่ยังไม่ผูกสต็อก */}
    {row.suspiciousCost && row.costedShare > 0 && <Badge variant="danger" size="xs" className="whitespace-nowrap">ต้นทุนต่ำผิดปกติ</Badge>}
    {row.staleLinkShare > 0 && <span className="w-44 whitespace-normal text-right text-xs text-[var(--state-warn)]">
        สูตรอ้างสต็อกที่ถูกลบไปแล้ว {percent(Math.round(row.staleLinkShare * 100))} · ไปผูกสต็อกใหม่ให้เมนูนี้ในหน้าจัดการเมนู
    </span>}
</span>;
const marginColumn = { key: 'marginPct', header: 'มาร์จิ้น', numeric: true, render: renderMargin };
const salesColumns = [itemName, unitsColumn, { key: 'revenue', header: 'ยอดขาย', numeric: true, render: money }, { key: 'revenueShare', header: '% ของยอดขายรวม', numeric: true, render: percent }, marginColumn];
const profitColumns = [itemName, { key: 'grossProfit', header: 'กำไรขั้นต้น', numeric: true, render: money }, { key: 'profitShare', header: '% ของกำไรรวม', numeric: true, render: percent }, unitsColumn, marginColumn];
const thinColumns = [itemName, marginColumn, { key: 'unitCost', header: 'ต้นทุน/ชิ้น', numeric: true, render: money }, { key: 'avgPrice', header: 'ราคาเฉลี่ย', numeric: true, render: money }, unitsColumn];
const tooltipStyle = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', borderRadius: 12 };
const axisStyle = { fill: 'var(--text-muted)', fontSize: 12 };
const chartMoney = value => '฿' + Number(value).toLocaleString('th-TH', { notation: 'compact' });
const SEGMENTS = ['star', 'workhorse', 'puzzle', 'dog'];
const shortDay = day => new Date(day + 'T00:00:00Z').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const modifierColumns = [
    { key: 'name', header: 'ชื่อตัวเลือก', render: (value, row) => <span className="flex flex-col items-start gap-1">
        <span>{value}</span>
        <Badge variant={row.linked ? 'success' : 'warning'} size="xs" className="whitespace-nowrap">{row.linked ? 'ผูกต้นทุนแล้ว' : 'ยังไม่ผูกต้นทุน'}</Badge>
    </span> },
    unitsColumn,
    { key: 'revenue', header: 'ยอดขาย', numeric: true, render: money },
    { key: 'costPerUnit', header: 'ต้นทุน/แก้ว', numeric: true, render: money },
    marginColumn,
];

// Phone card: the name on top, every other column as a label/value pair.
const cardFor = columns => row => {
    const [first, ...rest] = columns;
    const cell = col => col.render ? col.render(row[col.key], row) : row[col.key];
    return <div className="flex flex-col gap-2">
        <div className="font-semibold text-[var(--text-primary)]">{cell(first)}</div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            {rest.map(col => <div key={col.key} className="flex flex-col min-w-0">
                <dt className="text-xs text-[var(--text-muted)]">{col.header}</dt>
                <dd className={`text-[var(--text-primary)] ${col.numeric ? 'num [&>span]:items-start [&>span]:text-left' : ''}`}>{cell(col)}</dd>
            </div>)}
        </dl>
    </div>;
};
const Table = ({ rows, columns, empty, caption }) => <DataTable
    rows={withKeys(rows)}
    rowKey="_k"
    columns={columns.map(col => col.sortable && col.numeric && !col.sortValue ? { ...col, sortValue: byNum(col.key) } : col)}
    renderCard={cardFor(columns)}
    density="compact"
    stickyHeader={false}
    caption={caption}
    emptyState={empty || 'ยังไม่มีเมนูในช่วงนี้'}
    className="overflow-x-auto"
/>;

const MODE_OPTIONS = [{ value: 'daily', label: 'รายวัน' }, { value: 'monthly', label: 'รายเดือน' }];
const DAY_RANGES = [{ value: 7, label: '7 วัน' }, { value: 30, label: '30 วัน' }, { value: 90, label: '90 วัน' }];
const MONTH_RANGES = [{ value: 6, label: '6 เดือน' }, { value: 12, label: '1 ปี' }, { value: null, label: 'ทั้งหมด' }];
const SPLIT_OPTIONS = [{ value: false, label: 'รวมทุกตัวเลือก' }, { value: true, label: 'แยกตามตัวเลือก' }];

export default function ProfitabilityView() {
    const { orders, expenses, menu, stock, beanModifiers } = useAppContext();
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
    // ต้องส่ง menu ไปด้วย ไม่งั้นต้นทุนของแก้วที่สูตรในบิลชี้สต็อกที่ถูกลบแล้ว
    // จะประมาณจากสูตรปัจจุบันไม่ได้ แล้วความครอบคลุมจะต่ำกว่าความจริง
    const modifierCoverage = useMemo(() => computeModifierCoverage({
        orders: orders.filter(order => order.status === 'completed'), beanModifiers, stock, menu,
    }), [orders, beanModifiers, stock, menu]);
    // รวมตัวเลือกที่ยังอยู่เพื่อเทียบกำไรได้ครบ ส่วนตัวเลือกที่ถูกลบยังแจ้งแยกตามเดิม
    const soldModifiers = useMemo(() => modifierCoverage.rows.filter(row => row.exists).sort((a, b) => b.revenue - a.revenue), [modifierCoverage]);
    const unsoldUnlinked = modifierCoverage.neverSold.filter(row => !row.linked);
    // ใช้ช่วงเดียวกัน · เพื่อไม่ให้จำนวนบิลกับกำไรอ้างถึงคนละช่วงเวลา
    const rangeOrders = useMemo(() => {
        const periods = new Set(series.map(row => row[periodKey]));
        return orders.filter(order => order.status === 'completed' && periods.has(isDaily ? orderDay(order) : orderMonth(order)));
    }, [orders, series, periodKey, isDaily]);
    const rangeProfitability = useMemo(() => computeProfitability({ orders: rangeOrders, menu, stock, inventoryCategories: INVENTORY_CATEGORIES }), [rangeOrders, menu, stock]);
    const items = useMemo(() => computeItemPerformance({ orders: rangeOrders, menu, stock, beanModifiers, splitByModifier }), [rangeOrders, menu, stock, beanModifiers, splitByModifier]);
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

    const monthLabel = formatThaiDate(currentMonth, { style: 'month' });
    const rangeLabel = series.length ? (isDaily
        ? `${shortDay(series[0][periodKey])} ถึง ${shortDay(series[series.length - 1][periodKey])}`
        : `${formatThaiDate(series[0][periodKey], { style: 'month' })} ถึง ${formatThaiDate(series[series.length - 1][periodKey], { style: 'month' })}`)
        : 'ยังไม่มีข้อมูลการขาย';

    return (
        <div className="h-full flex flex-col overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)]">
            <PageHeader
                title="กำไรต่อเมนู"
                subtitle="ตัดต้นทุนวัตถุดิบตอนขาย ไม่ใช่ตอนซื้อ"
                icon={Target}
                sticky={false}
                actions={<DateStepper mode="month" value={currentMonth} onChange={value => value && setCurrentMonth(value)} />}
            />
            <div className="flex-1 overflow-y-auto px-[var(--page-pad)] py-5 md:py-6 pb-24 md:pb-10">
                <div className="max-w-[1400px] mx-auto flex flex-col gap-6">
                    {/* กำไรขั้นต้น · กำไรสุทธิ · จุดคุ้มทุน
                        แยกจากตัวเลขเงินสดโดยตั้งใจ ตัวนี้ตัดต้นทุนตอนขาย ไม่ใช่ตอนซื้อ */}
                    <section aria-labelledby="pf-month" className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-end justify-between gap-2">
                            <div>
                                <h2 id="pf-month" className="text-[length:var(--fs-lg)] leading-[var(--lh-lg)] font-semibold">สรุปกำไรเดือน{monthLabel}</h2>
                                <p className="text-sm text-[var(--text-muted)]">ห้ามเอาไปบวกลบกับตัวเลขเงินสดในหน้าภาพรวม</p>
                            </div>
                            {profitability.cogsCoverage < 100 && (
                                <Badge tone={profitability.cogsCoverage < 60 ? 'danger' : 'warn'}>
                                    ต้นทุนครอบคลุมยอดขาย {percent(profitability.cogsCoverage)}
                                </Badge>
                            )}
                        </div>

                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <StatCard label="กำไรขั้นต้น" icon={TrendingUp} tone="ok" value={money(profitability.grossProfit)} hint={`มาร์จิ้น ${percent(profitability.grossMargin)}`} />
                            <StatCard label="ต้นทุนวัตถุดิบ" icon={Package} value={money(profitability.cogs)} hint={`ที่ใช้ไป · ${percent(profitability.cogsRatio)} ของยอดขาย`} />
                            <StatCard
                                label="กำไรสุทธิ"
                                icon={Target}
                                tone={profitability.netProfit >= 0 ? 'ok' : 'danger'}
                                value={money(profitability.netProfit)}
                                hint={`หลังหักค่าใช้จ่าย ${money(profitability.fixedCosts)}`}
                            />
                            <StatCard label="กำไรขั้นต้นต่อแก้ว" icon={Receipt} value={money(profitability.contributionPerUnit)} hint={`ขายไป ${number(profitability.unitsSold)} หน่วย`} />
                        </div>

                        {/* จุดคุ้มทุน · ตัวเลขที่ใช้ตัดสินใจได้จริงที่สุดจากทั้งหน้านี้ */}
                        {profitability.breakEvenUnits === null ? (
                            <Banner tone="danger" title="ยังคำนวณจุดคุ้มทุนไม่ได้">
                                กำไรขั้นต้นต่อหน่วยไม่เป็นบวก แปลว่ายิ่งขายยิ่งขาดทุน ให้ตรวจราคาขายกับต้นทุนก่อน
                            </Banner>
                        ) : !profitability.hasFixedCosts ? (
                            <Banner tone="warn" title="ยังไม่ได้บันทึกค่าใช้จ่ายคงที่ของเดือนนี้">
                                (ค่าเช่า เงินเดือน ค่าไฟ) จุดคุ้มทุนเลยยังไม่มีความหมาย · บันทึกรายจ่ายพวกนี้เข้าระบบก่อน แล้วตัวเลขจะขึ้นเอง
                            </Banner>
                        ) : (
                            <SectionCard padding="md">
                                <div className="flex items-baseline justify-between gap-x-4 gap-y-1 flex-wrap mb-3">
                                    <p className="font-semibold text-[var(--text-primary)]">
                                        จุดคุ้มทุนเดือนนี้ · <span className="num">{number(profitability.breakEvenUnits)}</span> หน่วย
                                        <span className="text-[var(--text-muted)] font-normal num"> ({money(profitability.breakEvenRevenue)})</span>
                                    </p>
                                    <p className={`text-sm font-semibold ${profitability.pastBreakEven ? 'text-[var(--state-ok)]' : 'text-[var(--state-warn)]'}`}>
                                        {profitability.pastBreakEven
                                            ? `เลยจุดคุ้มทุนแล้ว ทุกหน่วยจากนี้กำไรเต็ม ${money(profitability.contributionPerUnit)}`
                                            : `เหลืออีก ${number(profitability.unitsToBreakEven)} หน่วยถึงเท่าทุน`}
                                    </p>
                                </div>
                                <div className="h-3 w-full bg-[var(--bg-sunken)] rounded-full overflow-hidden" role="progressbar" aria-label="ความคืบหน้าสู่จุดคุ้มทุน" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round((profitability.unitsSold / profitability.breakEvenUnits) * 100))}>
                                    <div
                                        className={`h-full rounded-full ${profitability.pastBreakEven ? 'bg-[var(--state-ok)]' : 'bg-[var(--state-warn)]'}`}
                                        style={{ width: `${Math.min(100, Math.round((profitability.unitsSold / profitability.breakEvenUnits) * 100))}%` }}
                                    />
                                </div>
                            </SectionCard>
                        )}

                        {/* อธิบายว่าทำไมกำไรกับเงินสดไม่เท่ากัน แทนที่จะให้วางงงเอง */}
                        {Math.abs(profitability.inventoryMovement) > 100 && (
                            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                                {profitability.inventoryMovement > 0
                                    ? `เดือนนี้ซื้อของเข้าคลังมากกว่าที่ใช้ไป ${money(profitability.inventoryMovement)} เงินสดเลยดูหายมากกว่ากำไรที่หายจริง ของก้อนนี้จะกลายเป็นยอดขายเดือนหน้า`
                                    : `เดือนนี้ใช้ของเก่าในคลังมากกว่าที่ซื้อเข้า ${money(Math.abs(profitability.inventoryMovement))} เงินสดเลยดูดีกว่ากำไรจริง เดือนหน้าถ้าต้องตุนของ เงินสดจะตกลง`}
                            </p>
                        )}
                        <p className="text-sm text-[var(--text-muted)]">มาร์จิ้นในตารางด้านล่างคิดจากต้นทุนที่ผูกไว้ · เดือน{monthLabel} ครอบคลุมยอดขาย {percent(profitability.cogsCoverage)} · รายการที่มีป้ายเตือนคือตัวที่ต้นทุนยังไม่ครบ ตัวเลขจะสูงเกินจริง</p>
                    </section>

                    {/* ผูกสต็อกไม่ครบ = กำไรขั้นต้นสวยเกินจริงเสมอ ต้องเตือนให้เห็น */}
                    {profitability.uncostedItems.length > 0 && (
                        <SectionCard
                            title={<span className="inline-flex items-center gap-2 text-[var(--state-warn)]"><AlertCircle size={18} />ยังไม่ได้ผูกต้นทุน {number(profitability.uncostedItems.length)} เมนู</span>}
                            description="เมนูพวกนี้ถูกคิดต้นทุนเป็น 0 ทำให้กำไรขั้นต้นข้างบนสูงกว่าความจริง · ผูกสต็อกในหน้าจัดการเมนูเพื่อให้ตัวเลขตรง"
                        >
                            <Table rows={profitability.uncostedItems} columns={baseColumns} caption="เมนูที่ยังไม่ผูกต้นทุน" />
                        </SectionCard>
                    )}

                    {/* ผูกบางส่วนอันตรายกว่าไม่ผูกเลย เพราะมันผ่านด่าน "คิดต้นทุนแล้ว" ไปได้เงียบๆ */}
                    {profitability.suspiciousItems.length > 0 && (
                        <SectionCard
                            title={<span className="inline-flex items-center gap-2 text-[var(--state-warn)]"><AlertCircle size={18} />ต้นทุนต่ำผิดปกติ {number(profitability.suspiciousItems.length)} เมนู</span>}
                            description="ผูกสต็อกไว้แล้วแต่ต้นทุนต่ำกว่า 8% ของราคาขาย มักเกิดตอนที่วัตถุดิบหลักอยู่ที่ตัวเลือก (#) ซึ่งยังไม่ได้ผูกสต็อก หรือยังไม่ได้ใส่แก้ว ฝา หลอด"
                        >
                            <Table rows={profitability.suspiciousItems} columns={suspiciousColumns} caption="เมนูที่ต้นทุนต่ำผิดปกติ" />
                        </SectionCard>
                    )}

                    <SectionCard
                        title="ต้นทุนของตัวเลือก (#)"
                        description="บิลสำเร็จทั้งหมดที่โหลดมา · แยกจากเดือนสรุปกำไรและช่วงกราฟ"
                    >
                        <div className="flex flex-col gap-3">
                            <p>ยอดขาย <span className="num font-semibold">{money(modifierCoverage.totalRevenue)}</span> วิ่งผ่านตัวเลือก · ผูกต้นทุนแล้ว <span className="num font-semibold">{percent(modifierCoverage.coveragePct)}</span></p>
                            <p className="text-sm text-[var(--text-muted)]">ตัวเลือกที่เคยขายและยังอยู่ในทะเบียนทั้งหมด เรียงตามยอดขาย · ป้ายใต้ชื่อบอกสถานะการผูกปัจจุบัน ป้ายใต้มาร์จิ้นบอกต้นทุนที่คิดได้จากบิล · ผูกได้ที่หน้าแอดมินในรายการตัวเลือก (#)</p>
                            <Table rows={soldModifiers} columns={modifierColumns} empty="ยังไม่มีตัวเลือกที่เคยขายและยังอยู่ในทะเบียน" caption="ต้นทุนของตัวเลือก" />
                            {modifierCoverage.missing.length > 0 && <p className="text-sm text-[var(--state-warn)]">มีอีก {number(modifierCoverage.missing.length)} ตัวเลือกที่ถูกลบไปแล้ว บิลเก่าจะไม่มีต้นทุนตลอดไป แก้ไม่ได้</p>}
                            {unsoldUnlinked.length > 0 && <p className="text-sm text-[var(--state-warn)]">ยังไม่ผูกและยังไม่เคยขาย {number(unsoldUnlinked.length)} ตัวเลือก: {unsoldUnlinked.map(row => row.name).join(' · ')} · ควรผูกก่อนเริ่มขาย</p>}
                        </div>
                    </SectionCard>

                    <section className="flex flex-col gap-4" aria-labelledby="pf-trend">
                        <div className="flex flex-col gap-3">
                            <div>
                                <h2 id="pf-trend" className="text-[length:var(--fs-lg)] leading-[var(--lh-lg)] font-semibold">แนวโน้มและวิเคราะห์เมนู</h2>
                                <p className="text-sm text-[var(--text-muted)]">ช่วงนี้ใช้กับกราฟ ตัวเลขสรุป และตารางด้านล่าง · สิ้นสุด{isDaily ? 'วัน' : 'เดือน'}ล่าสุดที่มีขาย · <span className="text-[var(--text-secondary)]">{rangeLabel}</span></p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <SegmentedControl ariaLabel="โหมดกราฟ" options={MODE_OPTIONS} value={mode} onChange={setMode} />
                                <SegmentedControl
                                    ariaLabel="ช่วงเวลาสำหรับกราฟและวิเคราะห์เมนู"
                                    options={isDaily ? DAY_RANGES : MONTH_RANGES}
                                    value={isDaily ? daysBack : monthsBack}
                                    onChange={value => isDaily ? setDaysBack(value) : setMonthsBack(value)}
                                />
                            </div>
                        </div>
                        <SectionCard title={`ยอดขาย ต้นทุน และกำไร${isDaily ? 'รายวัน' : 'รายเดือน'}`} description="แกนซ้าย: บาท · แกนขวา: มาร์จิ้น % · ต้นทุนที่ยังไม่ผูกอาจทำให้กำไรสูงเกินจริง">
                            <div className="h-[320px] md:h-[360px] min-w-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={series} margin={{ top: 12, right: 0, bottom: 8, left: 0 }}>
                                        <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" />
                                        <XAxis dataKey={periodKey} tickFormatter={isDaily ? shortDay : undefined} interval="preserveStartEnd" tick={axisStyle} minTickGap={24} stroke="var(--border-color)" />
                                        <YAxis yAxisId="money" tick={axisStyle} tickFormatter={chartMoney} width={60} stroke="var(--border-color)" />
                                        <YAxis yAxisId="margin" orientation="right" tick={axisStyle} tickFormatter={percent} width={44} stroke="var(--border-color)" />
                                        <Tooltip contentStyle={tooltipStyle} labelFormatter={label => isDaily ? shortDay(label) + ' (' + label + ')' : 'เดือน ' + label} formatter={(value, name) => [name === 'มาร์จิ้น' ? percent(value) : money(value), name]} />
                                        <Legend wrapperStyle={{ fontSize: 12 }} />
                                        <Bar yAxisId="money" dataKey="revenue" name="ยอดขาย" fill="var(--accent)" />
                                        <Bar yAxisId="money" dataKey="cogs" name="ต้นทุนวัตถุดิบ" fill="var(--state-warn)" />
                                        <Line yAxisId="money" dataKey="grossProfit" name="กำไรขั้นต้น" stroke="var(--state-info)" strokeWidth={3} dot={false} />
                                        <Line yAxisId="margin" dataKey="grossMargin" name="มาร์จิ้น" stroke="var(--text-secondary)" strokeDasharray="5 4" strokeWidth={2} dot={false} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </SectionCard>
                        {isDaily && <div className="flex flex-col gap-3">
                            <p className="text-sm text-[var(--text-muted)]">รายวันดูกำไรขั้นต้นเท่านั้น ค่าเช่ากับเงินเดือนจ่ายเป็นก้อนรายเดือน หารรายวันแล้วอ่านผิด</p>
                            <div className="grid sm:grid-cols-3 gap-3">
                                <StatCard label="วันที่ขายดีที่สุดในช่วง" value={dailySummary.best ? money(dailySummary.best.revenue) : '-'} hint={dailySummary.best ? shortDay(dailySummary.best.day) : 'ยังไม่มีวันที่เปิดร้าน'} />
                                <StatCard label="ยอดขายเฉลี่ยต่อวันที่เปิดร้าน" value={money(dailySummary.averageRevenue)} />
                                <StatCard label="จำนวนวันที่เปิดร้านในช่วง" value={number(dailySummary.openDays)} unit="วัน" />
                            </div>
                        </div>}
                        <SectionCard title={`จำนวนบิล${isDaily ? 'รายวัน' : 'รายเดือน'}`} description="ดูว่ายอดขายเปลี่ยนตามจำนวนการซื้อหรือไม่ · จำนวนบิลไม่ใช่จำนวนลูกค้าที่ไม่ซ้ำกัน">
                            <div className="h-56 min-w-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={series}>
                                        <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" />
                                        <XAxis dataKey={periodKey} tickFormatter={isDaily ? shortDay : undefined} interval="preserveStartEnd" tick={axisStyle} minTickGap={24} stroke="var(--border-color)" />
                                        <YAxis tick={axisStyle} allowDecimals={false} stroke="var(--border-color)" />
                                        <Tooltip contentStyle={tooltipStyle} labelFormatter={label => isDaily ? shortDay(label) + ' (' + label + ')' : 'เดือน ' + label} formatter={value => [number(value) + ' บิล', 'จำนวนบิล']} />
                                        <Bar dataKey="bills" name="จำนวนบิล" fill="var(--accent)" />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </SectionCard>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <StatCard label="ยอดขายเฉลี่ยต่อบิล" value={money(kpis.averageTicket)} />
                            <StatCard label="กำไรขั้นต้นต่อบิล" value={money(kpis.grossProfitPerBill)} />
                            <StatCard label="จำนวนชิ้นต่อบิล" value={number(kpis.unitsPerBill)} />
                            <StatCard label="จำนวนบิล" value={number(kpis.bills)} />
                        </div>
                        <SectionCard
                            title={isDaily ? 'วันล่าสุดในกราฟเทียบวันก่อน' : 'เดือนล่าสุดในกราฟเทียบเดือนก่อน'}
                            description={series.length > 1 ? `${series[series.length - 1][periodKey]} เทียบ ${series[series.length - 2][periodKey]}` : undefined}
                        >
                            <div className="flex flex-col gap-2">
                                <p>ยอดขาย <span className="num font-semibold">{growthText(kpis.revenueGrowth)}</span> · กำไรขั้นต้น <span className="num font-semibold">{growthText(kpis.profitGrowth)}</span></p>
                                <p>{kpis.concentration.count > 0 ? `กำไร ${percent(kpis.concentration.sharePct)} มาจาก ${number(kpis.concentration.count)} เมนู จากทั้งหมด ${number(kpis.concentration.of)} เมนู` : 'ยังไม่มีกำไรบวกสำหรับวิเคราะห์การกระจุกตัว'}</p>
                                <p className="text-sm text-[var(--state-warn)]">กำไรและส่วนแบ่งกำไรรวมเมนูที่ยังไม่ผูกต้นทุน จึงอาจสูงเกินจริง</p>
                                {/* The latest period can still be running (this month / today). The
                                    number comes from menuInsights and is left as is; say so plainly. */}
                                {series.length > 1 && series[series.length - 1][periodKey] === (isDaily ? getISODate() : getISODate().slice(0, 7)) && (
                                    <p className="text-sm text-[var(--text-muted)]">{isDaily ? 'วันนี้' : 'เดือนนี้'}ยังไม่จบ ตัวเลขนี้เทียบกับ{isDaily ? 'วันก่อนทั้งวัน' : 'เดือนก่อนทั้งเดือน'} · ดูแบบนับวันเท่ากันได้ที่หน้าภาพรวม</p>
                                )}
                            </div>
                        </SectionCard>
                        <div className="flex flex-col gap-2">
                            <SegmentedControl ariaLabel="การแสดงตัวเลือกในตารางและกลุ่มเมนู" options={SPLIT_OPTIONS} value={splitByModifier} onChange={setSplitByModifier} className="self-start" />
                            {/* ใช้ช่วงกราฟเพื่อไม่ให้ความครอบคลุมของเดือนอื่นทำให้เข้าใจผิด */}
                            <p className="text-sm text-[var(--text-muted)]">มาร์จิ้นตามช่วงกราฟครอบคลุมยอดขาย {percent(rangeProfitability.cogsCoverage)} · ป้ายเตือนบอกสัดส่วนหน่วยที่คิดต้นทุนได้ ตัวเลขมาร์จิ้นจะสูงเกินจริงเมื่อคิดต้นทุนไม่ครบ · ยังไม่ทราบ หมายถึงยังคิดต้นทุนไม่ได้</p>
                        </div>
                        {visibleRankings.map(ranking => <SectionCard
                            key={ranking.key}
                            title={ranking.title}
                            description={ranking.hint}
                            actions={ranking.all.length > 10 && <Button variant="secondary" aria-expanded={!!expanded[ranking.key]} onClick={() => toggle(ranking.key)}>{expanded[ranking.key] ? 'ย่อเหลือ 10 อันดับ' : `ดูทั้งหมด (${number(ranking.all.length)})`}</Button>}
                        >
                            <Table rows={ranking.visible} columns={ranking.columns} caption={ranking.title} />
                        </SectionCard>)}
                        <div className="flex flex-col gap-3">
                            <div>
                                <h3 className="text-[length:var(--fs-lg)] leading-[var(--lh-lg)] font-semibold">การจัดกลุ่มเมนู</h3>
                                <p className="text-sm text-[var(--text-muted)]">ค่ากลางร้าน: ขาย {number(engineering.unitsMedian)} ชิ้น · มาร์จิ้น {percent(engineering.marginMedian)} · ใช้เฉพาะเมนูที่ผูกต้นทุนในช่วงนี้ · รายชื่อเรียงตามกำไรขั้นต้น</p>
                            </div>
                            {groups.unknown.length > 0 && <Banner tone="warn" title={`${SEGMENT_LABELS.unknown.label} ${number(groups.unknown.length)} เมนู`}>{SEGMENT_LABELS.unknown.hint}</Banner>}
                            <div className="grid md:grid-cols-2 gap-4">
                                {visibleGroups.map(({ segment, all, visible }) => <SectionCard key={segment} title={`${SEGMENT_LABELS[segment].label} · ${number(all.length)} เมนู`} description={SEGMENT_LABELS[segment].hint}>
                                    <ol className="flex flex-col divide-y divide-[var(--border-light)]">{visible.map(item => <li key={item.name} className="flex justify-between gap-3 py-2 text-sm">{renderItemName(item)}<span className="shrink-0 num font-semibold">{money(item.grossProfit)}</span></li>)}</ol>
                                    {!all.length && <p className="text-sm text-[var(--text-muted)]">ไม่มีเมนูในกลุ่มนี้</p>}
                                    {all.length > 5 && <Button variant="secondary" className="mt-3" aria-expanded={!!expanded[segment]} onClick={() => toggle(segment)}>{expanded[segment] ? 'ย่อเหลือ 5 เมนู' : `ดูทั้งหมด (${number(all.length)})`}</Button>}
                                </SectionCard>)}
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
