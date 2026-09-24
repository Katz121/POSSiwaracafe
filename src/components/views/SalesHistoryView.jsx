import { useMemo, useState } from 'react';
import { CupSoda, FileText, Receipt, TrendingDown, TrendingUp, History } from 'lucide-react';
import { useDataContext } from '../../context/AppContext';
import { useNavigate, useRouteParams } from '../../navigation';
import { buildSalesHistory } from '../../utils/salesHistory';
import { formatBaht, formatNumber } from '../../utils/format';
import { Money, PageHeader, SegmentedControl, StatCard, Tabs, useMediaQuery } from '../ui';
import { downloadCsv } from './records/csv';
import { weekdayName } from './records/salesFormat';
import SalesTimeline from './records/SalesTimeline';
import ExpenseAnalysis from './records/ExpenseAnalysis';
import DayAnalysis from './records/DayAnalysis';
import DaySheet from './records/DaySheet';

const RANGES = [
  { value: 'month', label: 'เดือนนี้' },
  { value: 'three', label: '3 เดือน' },
  { value: 'six', label: '6 เดือน' },
  { value: 'year', label: 'ปีนี้' },
  { value: 'all', label: 'ทั้งหมด' },
];
const TABS = ['timeline', 'expenses', 'days'];
const n = (v) => formatNumber(v, { maxDecimals: 0 });
// Phone: money cards full width (฿143,035.56 does not fit half of 390px).
// iPad: 3 money cards, then 2 count cards. xl: one row of 5.
const MONEY_CARD = 'col-span-2 md:col-span-2 xl:col-span-1';
const COUNT_CARD = 'col-span-1 md:col-span-3 xl:col-span-1';

/**
 * SalesHistoryView · ประวัติการขาย (UX v2 · WP2)
 * Every number comes from utils/salesHistory.buildSalesHistory, unchanged.
 * `#/reports/sales?range=six&tab=timeline`
 */
export default function SalesHistoryView() {
  const { orders = [], expenses = [] } = useDataContext();
  const params = useRouteParams();
  const navigate = useNavigate();
  const phone = useMediaQuery('(max-width: 767px)');

  const range = RANGES.some((r) => r.value === params.range) ? params.range : 'six';
  const tab = TABS.includes(params.tab) ? params.tab : 'timeline';
  const setRoute = (patch) => {
    const next = { range, tab, ...patch };
    navigate('sales_history', {
      range: next.range === 'six' ? undefined : next.range,
      tab: next.tab === 'timeline' ? undefined : next.tab,
    }, { replace: true });
  };

  const data = useMemo(() => buildSalesHistory(orders, expenses, range), [orders, expenses, range]);
  const profit = data.totals.revenue - data.totals.expense;
  const [dayKey, setDayKey] = useState(null);
  const openDay = data.days.find((d) => d.key === dayKey) || null;

  const exportTimeline = () => downloadCsv([
    ['วันที่', 'จำนวนบิล', 'แก้ว', 'ขนม (ชิ้น)', 'ยอดขาย', 'รายจ่าย', 'กำไร'],
    ...data.months.flatMap((m) => [...m.days.values()].map((d) => [d.key, d.bills.length, d.cups, d.pieces, d.revenue, d.expense, d.revenue - d.expense])),
  ], 'sales-history.csv');
  const exportExpenses = () => downloadCsv([
    ['หมวด', 'หัวข้อ', 'จำนวนครั้ง', 'ยอดรวม', 'เฉลี่ยต่อครั้ง', 'ครั้งล่าสุด'],
    ...data.titleRows.map((t) => [data.catRows.find((c) => c.titles.has(t.name))?.name || '', t.name, t.count, t.amount, t.average, t.latest]),
  ], 'sales-expenses.csv');
  const exportDays = () => downloadCsv([
    ['วันที่', 'วันในสัปดาห์', 'ยอดขาย', 'รายจ่าย', 'กำไร', 'จำนวนบิล', 'แก้ว'],
    ...data.days.map((d) => [d.key, weekdayName(d.key), d.revenue, d.expense, d.revenue - d.expense, d.bills.length, d.cups]),
  ], 'sales-days.csv');

  const perBill = data.totals.bills ? data.totals.revenue / data.totals.bills : 0;
  const cupsPerBill = data.totals.bills ? (data.totals.cups / data.totals.bills).toFixed(1) : 0;

  return (
    <div className="h-full bg-[var(--bg-canvas)] flex flex-col overflow-hidden text-[var(--text-primary)]">
      <PageHeader
        title="ประวัติการขาย"
        subtitle="ยอดขาย รายจ่าย และกำไรตามช่วงเวลา"
        icon={History}
        sticky={false}
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-[var(--page-pad)] pt-4 pb-24 md:pb-10">
        <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
          <div className="max-w-full overflow-x-auto scrollbar-hide">
            <SegmentedControl ariaLabel="ช่วงเวลา" options={RANGES} value={range} onChange={(v) => setRoute({ range: v })} fullWidth={phone} className={phone ? '[&>button]:px-1.5' : ''} />
          </div>

          <section aria-label="สรุปช่วงที่เลือก" className="grid grid-cols-2 md:grid-cols-6 xl:grid-cols-5 gap-3">
            <StatCard label="ยอดขาย" icon={TrendingUp} value={<Money value={data.totals.revenue} />} className={MONEY_CARD} />
            <StatCard label="รายจ่าย" icon={Receipt} value={<Money value={data.totals.expense} />} className={MONEY_CARD} />
            <StatCard
              className={MONEY_CARD}
              label="กำไร"
              icon={profit >= 0 ? TrendingUp : TrendingDown}
              tone={profit < 0 ? 'danger' : 'ok'}
              value={<Money value={profit} />}
            />
            <StatCard label="บิลที่ปิดแล้ว" icon={FileText} value={n(data.totals.bills)} unit="บิล" hint={`เฉลี่ย ${formatBaht(perBill)}/บิล`} className={COUNT_CARD} />
            <StatCard
              label="แก้วที่ขาย"
              icon={CupSoda}
              value={n(data.totals.cups)}
              unit="แก้ว"
              hint={`ขนม ${n(data.totals.pieces)} ชิ้น · ${cupsPerBill} แก้ว/บิล`}
              className={COUNT_CARD}
            />
          </section>
          <p className="-mt-2 text-xs leading-[var(--lh-xs)] text-[var(--text-muted)]">กำไรคำนวณจากยอดขายลบรายจ่ายที่บันทึกในระบบ ไม่ได้หักต้นทุนวัตถุดิบต่อแก้ว</p>

          <Tabs value={tab} onChange={(v) => setRoute({ tab: v })} variant="underline">
            <Tabs.List className="w-full overflow-x-auto scrollbar-hide">
              <Tabs.Tab value="timeline">ไทม์ไลน์</Tabs.Tab>
              <Tabs.Tab value="expenses">รายจ่าย</Tabs.Tab>
              <Tabs.Tab value="days">วันที่ควรดู</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="timeline" className="mt-5">
              <SalesTimeline data={data} exportCsv={exportTimeline} onOpenDay={(d) => setDayKey(d.key)} />
            </Tabs.Panel>
            <Tabs.Panel value="expenses" className="mt-5">
              <ExpenseAnalysis data={data} exportCsv={exportExpenses} />
            </Tabs.Panel>
            <Tabs.Panel value="days" className="mt-5">
              <DayAnalysis data={data} exportCsv={exportDays} onOpenDay={(d) => setDayKey(d.key)} />
            </Tabs.Panel>
          </Tabs>
        </div>
      </div>

      <DaySheet
        day={openDay}
        onClose={() => setDayKey(null)}
        onOpenBills={(date) => { setDayKey(null); navigate('bills', { date }); }}
      />
    </div>
  );
}
