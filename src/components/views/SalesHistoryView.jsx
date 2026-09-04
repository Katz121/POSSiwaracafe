import React,
  { useEffect,
  useMemo,
  useState } from 'react';
import { Banknote,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Receipt,
  Search,
  TrendingDown,
  TrendingUp } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { Button,
  Card,
  EmptyState,
  Tabs } from '../ui';
import { buildSalesHistory,
  ratio } from '../../utils/salesHistory';

const RANGES = [{ key: 'all',
  label: 'ทั้งหมด' },
  { key: 'year',
  label: 'ปีนี้' },
  { key: 'six',
  label: '6 เดือน' },
  { key: 'three',
  label: '3 เดือน' },
  { key: 'month',
  label: 'เดือนนี้' }];
const MONTHS = ['มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม'];
const SHORT_MONTHS = ['ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.'];
const WEEKDAYS = ['อาทิตย์',
  'จันทร์',
  'อังคาร',
  'พุธ',
  'พฤหัสบดี',
  'ศุกร์',
  'เสาร์'];
const money = n => `฿${Number(n || 0).toLocaleString('th-TH',
  { maximumFractionDigits: 2 })}`;
const monthName = k => { const [y,
  m] = k.split('-').map(Number);
return `${MONTHS[m - 1]} ${y}`;
};
const dayName = k => WEEKDAYS[new Date(`${k}T00:00:00`).getDay()];
const signed = n => n === null ? '—' : `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n))}%`;
const rangeButtonClass = active => active
  ? 'border-[var(--accent-emerald)] bg-[var(--accent-emerald)] text-white'
  : 'border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]';
const healthBarClass = warning => warning ? 'bg-[var(--state-warn)]' : 'bg-[var(--accent-emerald)]';
const sortButtonClass = active => active
  ? 'border-[var(--accent-emerald)] text-[var(--accent-emerald)]'
  : 'border-[var(--border-color)]';
const weekdayBarClass = warning => warning ? 'bg-[var(--state-warn)]' : 'bg-[var(--accent-emerald)]';
const fixedCostText = data => [
  `${money(data.days.length ? data.fixed / data.days.length : 0)} ต่อวัน · ถ้าลด 10% จะประหยัดเดือนละ `,
  money(data.fixed * 0.1 / (data.length || 1)),
].join('');
const summaryValueClass = danger => danger ? 'text-[var(--state-danger)]' : 'text-[var(--text-primary)]';
const csv = (rows,
  name) => { const body = `\uFEFF${rows.map(r => r.map(x => `"${String(x ?? '').replaceAll('"',
  '""')}"`).join(',')).join('\n')}`;
const url = URL.createObjectURL(new Blob([body],
  { type: 'text/csv;charset=utf-8' }));
const a = document.createElement('a');
a.href = url;
a.download = name;
a.click();
URL.revokeObjectURL(url);
};
function Summary({ icon: Icon,
  label,
  value,
  sub,
  danger }) { return <Card
  padding="lg">
<div
  className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
<Icon
  size={17}
  className="text-[var(--accent-emerald)]" />{label}</div>
<p
  className={`num mt-3 text-right text-2xl font-bold ${summaryValueClass(danger)}`}>{value}</p>{sub && <p
  className="mt-1 text-right text-xs text-[var(--text-muted)]">{sub}</p>}</Card>;
}
function Expand({ open }) { return open ? <ChevronDown
  size={17} /> : <ChevronRight
  size={17} />;
}
function Export({ onClick }) { return <Button
  variant="outline"
  size="xs"
  leftIcon={<Download
  size={14} />}
  onClick={onClick}>CSV</Button>;
}

export default function SalesHistoryView() {
  const { orders = [], expenses = [] } = useAppContext();
const [range, setRange] = useState('six');
const [tab, setTab] = useState('timeline');
  const [open, setOpen] = useState(new Set());
const [openCat, setOpenCat] = useState(new Set());
const [openTitle, setOpenTitle] = useState(new Set());
const [openLoss, setOpenLoss] = useState(new Set());
const [query, setQuery] = useState('');
const [sort, setSort] = useState('amount');
  const data = useMemo(
    () => buildSalesHistory(orders, expenses, range),
    [orders, expenses, range],
  );
  // Reset expanded sections when the selected range changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setOpen(new Set(data.months[0]?.key ? [data.months[0].key] : []));
setOpenCat(new Set());
setOpenTitle(new Set());
setOpenLoss(new Set());
}, [range, data.months]);
  const flip = (setter, key) => setter(s => { const n = new Set(s);
n.has(key) ? n.delete(key) : n.add(key);
return n;
});
const profit = data.totals.revenue - data.totals.expense;
  const shownTitles = data.titleRows
    .filter(t => t.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => sort === 
  'count' ? b.count - a.count : sort === 'average' ? b.average - a.average : b.amount - a.amount).slice(0, 20);
    const exportTimeline = () =>
    csv([['วันที่', 'จำนวนบิล', 'ยอดขาย', 'รายจ่าย', 'กำไร'], ...data.months.flatMap(m => 
  [...m.days.values()].map(d => [d.key, d.bills.length, d.revenue, d.expense, d.revenue - d.expense]))], 
  'sales-history.csv');
  const exportExpenses = () =>
    csv([['หมวด', 'หัวข้อ', 'จำนวนครั้ง', 'ยอดรวม', 'เฉลี่ยต่อครั้ง', 'ครั้งล่าสุด'], ...data.titleRows
      .map(t => [data.catRows.find(c => c.titles.has(t.name))?.name || '', t.name, t.count, t.amount, t.average, 
  t.latest])], 'sales-expenses.csv');
  const exportDays = () =>
    csv([['วันที่', 'วันในสัปดาห์', 'ยอดขาย', 'รายจ่าย', 'กำไร', 'จำนวนบิล'], ...data.days.map(d => [d.key, 
  dayName(d.key), d.revenue, d.expense, d.revenue - d.expense, d.bills.length])], 'sales-days.csv');
  return <main
  className="h-full overflow-y-auto bg-[var(--bg-tertiary)] p-4 pb-28 md:p-6 lg:p-8">
<div
  className="mx-auto flex max-w-7xl flex-col gap-6">
<header>
<h1
  className="text-2xl font-bold text-[var(--text-primary)]">ประวัติการขาย</h1>
<div
  className="mt-3 flex flex-wrap gap-2">{RANGES.map(r => <button
  key={r.key}
  type="button"
  onClick={() => setRange(r.key)}
  aria-pressed={range === r.key}
  className={`rounded-[var(--radius-sm)] border px-3 py-2 text-sm font-medium ${rangeButtonClass(range === r.key)}`}>
        {r.label}
      </button>)}</div>
</header>
<section
  className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
<Summary icon={TrendingUp} label="ยอดขาย"
  value={money(data.totals.revenue)} />
<Summary icon={Receipt} label="รายจ่าย"
  value={money(data.totals.expense)} />
<Summary icon={profit >= 0 ? TrendingUp : TrendingDown} label="กำไร"
  value={money(profit)}
  danger={profit < 0} />
<Summary icon={FileText} label="จำนวนบิล"
  value={data.totals.bills}
  sub={`เฉลี่ย ${money(data.totals.bills ? data.totals.revenue / data.totals.bills : 0)}/บิล`} />
</section>
<p
  className="-mt-3 text-xs text-[var(--text-muted)]">กำไรคำนวณจากยอดขายลบรายจ่ายที่บันทึกในระบบ 
  ไม่ได้หักต้นทุนวัตถุดิบต่อแก้ว</p>
<Tabs
  value={tab}
  onChange={setTab}
  variant="underline">
<Tabs.List
  className="w-full">
<Tabs.Tab
  value="timeline">ไทม์ไลน์</Tabs.Tab>
<Tabs.Tab
  value="expenses">รายจ่าย</Tabs.Tab>
<Tabs.Tab
  value="days">วันที่ควรดู</Tabs.Tab>
</Tabs.List>
<Tabs.Panel
  value="timeline"
  className="mt-6">
<Timeline data={data} open={open} flip={k => flip(setOpen, k)} exportCsv={exportTimeline} />
</Tabs.Panel>
<Tabs.Panel
  value="expenses"
  className="mt-6">
<ExpenseAnalysis data={data} openCat={openCat} flipCat={k => flip(setOpenCat, k)} openTitle={openTitle} 
  flipTitle={k => flip(setOpenTitle, k)} query={query} setQuery={setQuery} sort={sort} setSort={setSort} 
  titles={shownTitles} exportCsv={exportExpenses} />
</Tabs.Panel>
<Tabs.Panel
  value="days"
  className="mt-6">
<DayAnalysis data={data} open={openLoss} flip={k => flip(setOpenLoss, k)} exportCsv={exportDays} />
</Tabs.Panel>
</Tabs>
</div>
</main>;
}

function Timeline({ data, open, flip, exportCsv }) { return <div
  className="flex flex-col gap-6">
<Card
  padding="lg">
<div
  className="mb-6 flex justify-between">
<h2
  className="flex items-center gap-2 text-lg font-semibold">
<Banknote
  size={19}
  className="text-[var(--accent-emerald)]" />ยอดขายรายเดือน</h2>
<Export
  onClick={exportCsv} />
</div>
<div
  className="flex h-48 items-end gap-2 overflow-x-auto pb-7">{data.ordered.map(m => <div
  key={m.key}
  className="flex h-full min-w-12 flex-1 flex-col items-center justify-end gap-2">
<div
  className="w-full max-w-14 rounded-t-[var(--radius-sm)] bg-[var(--accent-emerald)]"
  style={{ height: `${Math.max(m.revenue / data.chartMax * 100, 3)}%` }} />
<span
  className="text-xs text-[var(--text-muted)]">{SHORT_MONTHS[Number(m.key.slice(5)) - 1]}</span>
</div>)}</div>
</Card>
<Card
  padding="none"
  className="overflow-hidden">
<div
  className="flex justify-between border-b border-[var(--border-color)] p-4">
<h2
  className="text-lg font-semibold">สรุปตามวัน</h2>
<div
  className="flex gap-2">
<Button
  variant="ghost"
  size="xs"
  onClick={() => data.months.forEach(m => !open.has(m.key) && flip(m.key))}>กางทั้งหมด</Button>
<Button
  variant="ghost"
  size="xs"
  onClick={() => data.months.forEach(m => open.has(m.key) && flip(m.key))}>หุบทั้งหมด</Button>
</div>
</div>{data.months.length ? data.months.map(m => <React.Fragment
  key={m.key}>
<button
  type="button"
  disabled={m.key === 'unknown'}
  onClick={() => flip(m.key)}
  className={"grid w-full grid-cols-[minmax(180px,1fr)_100px_120px_120px_1" + 
  "20px] gap-3 border-b border-[var(--border-color)] p-4 text-l" + "eft text-sm"}>
<span
  className="flex items-center gap-2">{m.key !== 'unknown' && <Expand open={open.has(m.key)} />}{m.key === 
  'unknown' ? 'ไม่ระบุวันที่' : monthName(m.key)}</span>
<span
  className="num text-right">{m.bills.length}</span>
<span
  className="num text-right">{money(m.revenue)}</span>
<span
  className="num text-right text-[var(--state-danger)]">−{money(m.expense)}</span>
<span
  className="num text-right">{money(m.revenue - m.expense)}</span>
</button>{open.has(m.key) && m.key !== 'unknown' && [...m.days.values()].sort((a, b) => 
  b.key.localeCompare(a.key)).map(d => <DayRow
  key={d.key} d={d} open={open} flip={flip} />)}</React.Fragment>) : <EmptyState icon="receipt" title="ยังไม่มีข้อมูล"
  size="sm" />}</Card>
</div>;
}
function DayRow({ d, open, flip }) { const isOpen = open.has(d.key);
return <React.Fragment>
<button
  type="button"
  onClick={() => flip(d.key)}
  className={"grid w-full grid-cols-[minmax(180px,1fr)_100px_120px_120px_1" + 
  "20px] gap-3 border-b border-[var(--border-color)] bg-[var(--" + "bg-secondary)] p-3 text-left text-sm"}>
<span
  className="flex items-center gap-2 pl-6">
<Expand open={isOpen} />{d.key}</span>
<span
  className="num text-right">{d.bills.length}</span>
<span
  className="num text-right">{money(d.revenue)}</span>
<span
  className="num text-right">{money(d.expense)}</span>
<span
  className="num text-right">{money(d.revenue - d.expense)}</span>
</button>{isOpen && <div
  className="space-y-1 border-b border-[var(--border-color)] p-4 pl-12">{d.expenses.map((e, i) => <div
  key={e.id || i}
  className="flex justify-between text-sm">
<span>{e.title || 'ไม่ระบุหัวข้อ'} · {e.category || 'ไม่ระบุหมวด'}</span>
<span
  className="num">{money(e.amount)}</span>
</div>)}</div>}</React.Fragment>;
}

function ExpenseAnalysis({ data, openCat, flipCat, openTitle, flipTitle, query, setQuery, sort, setSort, 
  titles, exportCsv }) { return <div
  className="flex flex-col gap-6">
<p
  className="text-sm text-[var(--text-muted)]">ตัวเลขทั้งหมดมาจากรายจ่ายที่บันทึกในระบบ 
  ถ้าบางรายการยังไม่ได้บันทึก ภาพจะไม่ครบ</p>
<Card
  padding="lg">
<h2
  className="mb-4 text-lg font-semibold">สุขภาพรายเดือน</h2>{data.health.map(m => <div
  key={m.key}
  className={"grid grid-cols-[minmax(100px,1fr)_100px_100px_minmax(130px,1" + 
  "fr)_100px] items-center gap-3 border-b border-[var(--border-" + "color)] py-2 text-sm"}>
<span>{monthName(m.key)}</span>
<span
  className="num text-right">{money(m.revenue)}</span>
<span
  className="num text-right">{money(m.expense)}</span>
<div
  className="flex items-center gap-2">
<div
  className="h-2 flex-1 rounded-full bg-[var(--bg-tertiary)]">
<div
  className={`h-2 rounded-full ${healthBarClass(m.percent > data.avgPercent + 5)}`}
  style={{ width: `${Math.min(m.percent, 100)}%` }} />
</div>
<span
  className="num w-12 text-right">{Math.round(m.percent)}%</span>
</div>
<span
  className="num text-right">{money(m.profit)}</span>
</div>)}<p
  className="mt-3 text-xs text-[var(--text-muted)]">เดือน · ยอดขาย · รายจ่าย · จ่าย/ขาย % · กำไร</p>
</Card>
<Card
  padding="lg">
<div
  className="mb-4 flex justify-between">
<h2
  className="text-lg font-semibold">รายจ่ายแยกหมวด · เทียบช่วงก่อนหน้า</h2>
<Export
  onClick={exportCsv} />
</div>{data.catRows.map(c => { const old = data.prevCats.get(c.name);
const change = old?.amount ? (c.amount - old.amount) / old.amount * 100 : null;
const isOpen = openCat.has(c.name);
return <React.Fragment
  key={c.name}>
<button
  type="button"
  onClick={() => flipCat(c.name)}
  className={"grid w-full grid-cols-[minmax(160px,1fr)_80px_110px_100px_10" + 
  "0px] gap-3 border-b border-[var(--border-color)] py-3 text-l" + "eft text-sm"}>
<span
  className="flex items-center gap-2">
<Expand open={isOpen} />{c.name}</span>
<span
  className="num text-right">{c.count}</span>
<span
  className="num text-right">{money(c.amount)}</span>
<span
  className="num text-right">{ratio(c.amount, data.totals.expense)}</span>
<span
  className={`num text-right ${change > 0 ? 'text-[var(--state-warn)]' : 'text-[var(--state-ok)]'}`}>
  {signed(change)}</span>
</button>{isOpen && <div
  className="border-b border-[var(--border-color)] py-2 pl-8 text-sm">{[...c.records].map(([t, es]) => <div
  key={t}
  className="flex justify-between py-1">
<span>{t}</span>
<span
  className="num">{money(es.reduce((s, e) => s + Number(e.amount || 0), 0))}</span>
</div>)}</div>}</React.Fragment>;
})}</Card>
<Card
  padding="lg">
<div
  className="mb-4 flex justify-between">
<h2
  className="text-lg font-semibold">หัวข้อที่จ่ายเยอะสุด</h2>
<Export
  onClick={exportCsv} />
</div>
<div
  className="mb-4 flex gap-2">
<label
  className="relative flex-1">
<Search
  size={16}
  className="absolute left-3 top-3 text-[var(--text-muted)]" />
<input
  value={query}
  onChange={e => setQuery(e.target.value)}
  placeholder="ค้นหาหัวข้อ"
  className={"w-full rounded-[var(--radius-sm)] border border-[var(--borde" + 
  "r-color)] bg-[var(--bg-secondary)] py-2 pl-9"} />
</label>{[['amount', 'ยอดรวม'], ['count', 'จำนวนครั้ง'], ['average', 'เฉลี่ยต่อครั้ง']].map(([v, l]) => <button
  key={v}
  type="button"
  onClick={() => setSort(v)}
  className={`rounded-[var(--radius-sm)] border px-3 text-sm ${sortButtonClass(sort === v)}`}>{l}</button>)}</div>
      {titles.map(t => { const isOpen = openTitle.has(t.name);
return <React.Fragment
  key={t.name}>
<button
  type="button"
  onClick={() => flipTitle(t.name)}
  className={"grid w-full grid-cols-[minmax(160px,1fr)_80px_110px_110px_11" + 
  "0px_90px] gap-3 border-b border-[var(--border-color)] py-3 t" + "ext-left text-sm"}>
<span
  className="flex items-center gap-2">
<Expand open={isOpen} />{t.name}</span>
<span
  className="num text-right">{t.count}</span>
<span
  className="num text-right">{money(t.amount)}</span>
<span
  className="num text-right">{money(t.average)}</span>
<span
  className="num text-right">{t.latest || '—'}</span>
<span
  className="num text-right">{signed(t.trend)}</span>
</button>{isOpen && <div
  className="border-b border-[var(--border-color)] py-2 pl-8 text-sm">{t.records.map((e, i) => <div
  key={e.id || i}
  className="flex justify-between py-1">
<span>{e.date || 'ไม่ระบุวันที่'}</span>
<span
  className="num">{money(e.amount)}</span>
</div>)}</div>}</React.Fragment>;
})}</Card>
<Card
  padding="lg">
<h2
  className="mb-4 text-lg font-semibold">ต้นทุนคงที่รายวัน vs ผันแปร</h2>
<div
  className="grid gap-3 sm:grid-cols-2">
<Cost label="จ่ายเกือบทุกวัน"
  amount={data.fixed}
  total={data.totals.expense}
  text={fixedCostText(data)} />
<Cost label="ผันแปร"
  amount={data.totals.expense - data.fixed}
  total={data.totals.expense}
  text="รายการที่ไม่ได้จ่ายเกิน 50% ของวันที่มีข้อมูล" />
</div>
</Card>
<Card
  padding="lg">
<h2
  className="mb-4 text-lg font-semibold">ข้อสังเกต ({data.observations.length})</h2>
<div
  className="space-y-2">{data.observations.map((o, i) => <p
  key={i}
  className={"rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)] p-3 text-" + 
  "sm text-[var(--text-secondary)]"}>{o.text}</p>)}</div>
</Card>
</div>;
}
function Cost({ label, amount, total, text }) { return <div
  className="rounded-[var(--radius-sm)] border border-[var(--border-color)] p-4">
<p
  className="font-medium">{label}</p>
<p
  className="num mt-2 text-xl font-bold">{money(amount)}</p>
<p
  className="text-sm text-[var(--text-muted)]">{ratio(amount, total)} ของรายจ่าย · {text}</p>
</div>;
}

 function DayAnalysis({ data, open, flip, exportCsv }) { const best = Math.max(...data.weekdays.map(w => w.average), 0);
return <div
  className="flex flex-col gap-6">
<Card
  padding="lg">
<div
  className="mb-4 flex justify-between">
<h2
  className="text-lg font-semibold">วันที่ขาดทุน</h2>
<Export
  onClick={exportCsv} />
</div>{data.losses.map(d => <React.Fragment
  key={d.key}>
<button
  type="button"
  onClick={() => flip(d.key)}
  className={"grid w-full grid-cols-[minmax(130px,1fr)_110px_110px_110px_8" + 
  "0px] gap-3 border-b border-[var(--border-color)] py-3 text-l" + "eft text-sm"}>
<span
  className="flex items-center gap-2">
<Expand open={open.has(d.key)} />{d.key}</span>
<span
  className="num text-right">{money(d.revenue)}</span>
<span
  className="num text-right">{money(d.expense)}</span>
<span
  className="num text-right text-[var(--state-danger)]">−{money(d.expense - d.revenue)}</span>
<span
  className="num text-right">{d.bills.length}</span>
</button>{open.has(d.key) && <div
  className="border-b border-[var(--border-color)] py-2 pl-8 text-sm">{d.expenses.map((e, i) => <div
  key={e.id || i}
  className="flex justify-between py-1">
<span>{e.title || 'ไม่ระบุหัวข้อ'}</span>
<span
  className="num">{money(e.amount)}</span>
</div>)}</div>}</React.Fragment>)}</Card>
<Card
  padding="lg">
<h2
  className="mb-4 text-lg font-semibold">ยอดขายแยกตามวันในสัปดาห์</h2>
<div
  className="flex h-48 items-end gap-2">{data.weekdays.map(w => <div
  key={w.name}
  className="flex h-full flex-1 flex-col items-center justify-end gap-2">
<div
  className={`w-full rounded-t-[var(--radius-sm)] ${weekdayBarClass(w.average < best * 0.6)}`}
  style={{ height: `${best ? Math.max(w.average / best * 100, 3) : 3}%` }} />
<span
  className="text-xs">{w.name.slice(0, 1)}</span>
<span
  className="num text-xs">{money(w.average)}</span>
</div>)}</div>
<div
  className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-[var(--text-muted)]">{data.weekdays.map(w => <span
  key={w.name}>{w.days} วัน · {money(w.revenue)}</span>)}</div>
</Card>
<Card
  padding="lg">
<h2
  className="mb-2 text-lg font-semibold">วันที่ยอดขายต่ำผิดปกติ</h2>
<p
  className="mb-3 text-sm text-[var(--text-muted)]">ต่ำกว่าค่ามัธยฐานของช่วงมากกว่า 40% · ค่ามัธยฐาน 
  {money(data.median)}</p>{data.lowDays.map(d => <div
  key={d.key}
  className="flex justify-between border-b border-[var(--border-color)] py-3 text-sm">
<span>{d.key} · {dayName(d.key)}</span>
<span
  className="num">{money(d.revenue)}</span>
</div>)}</Card>
</div>;
}
