import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ClipboardCheck, Download, Link2, Package, ShoppingBag } from 'lucide-react';
import { useDataContext, useUIContext } from '../../context/AppContext';
import { useNavigate, useRouteParams } from '../../navigation';
import { getISODate } from '../../utils/calculations';
import { addDaysISO, formatNumber, formatThaiDate } from '../../utils/format';
import { Banner, Button, DateStepper, Money, PageHeader, StatCard, Tabs } from '../ui';
import { auditDay, auditDays, auditMenuLinks, negativeStock, STATUS_LABEL } from '../../utils/stockAudit';
import { AuditEmpty, IssueList, MenuHealth, SoldList, StockUsedList } from './inventory/AuditSections';
import { pct, qtyText } from './inventory/auditFormat';
import { auditDateFromParam, auditParams, auditTabFromParam } from './inventory/stockStatus';
// ── ตรวจนับสต็อกหน้างาน (stock count) ──
import { ClipboardList } from 'lucide-react';
import CountAuditSection from './stockcount/CountAuditSection';
import useStockCounts from './stockcount/useStockCounts';
import { summarizeCounts } from '../../utils/stockCount';

const WEEKDAY_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const dayLabel = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  return { weekday: WEEKDAY_SHORT[d.getDay()], day: d.getDate() };
};

const BOM = String.fromCharCode(0xfeff); // Excel reads Thai CSV as UTF-8 only with a BOM
const downloadCsv = (rows, name) => {
  const body = `${BOM}${rows.map((r) => r.map((x) => `"${String(x ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

// Verdict → Banner tone. Strip colours use the same state tokens.
const VERDICT = {
  ok: { title: 'ตัดสต็อกถูกต้องครบ', tone: 'ok' },
  warn: { title: 'ตัดได้ แต่มีเมนูที่ไม่ถูกตัด', tone: 'warn' },
  bad: { title: 'ตัดสต็อกไม่ครบ ต้องแก้', tone: 'danger' },
  empty: { title: 'ไม่มีบิลในวันนี้', tone: 'info' },
};
const STRIP = {
  ok: { bar: 'bg-[var(--state-ok)]', ink: 'text-[var(--state-ok)]' },
  warn: { bar: 'bg-[var(--state-warn)]', ink: 'text-[var(--state-warn)]' },
  bad: { bar: 'bg-[var(--state-danger)]', ink: 'text-[var(--state-danger)]' },
  empty: { bar: 'bg-[var(--border-strong)]', ink: 'text-[var(--text-muted)]' },
};

export default function StockAuditView() {
  const { orders = [], stock = [], menu = [], beanModifiers = [] } = useDataContext();
  const { handleViewChange } = useUIContext();
  const params = useRouteParams();
  const navigate = useNavigate();
  const today = getISODate();

  // `#/stock-audit?date=YYYY-MM-DD&tab=links` pre-selects; the URL follows
  // the date/tab (replace, so stepping days does not spam history).
  const paramDate = auditDateFromParam(params.date, today);
  const paramTab = params.tab === 'count' ? 'count' : auditTabFromParam(params.tab);
  const [date, setDateState] = useState(paramDate);
  const [tab, setTabState] = useState(paramTab);
  const [seen, setSeen] = useState(`${paramDate}|${paramTab}`);
  if (`${paramDate}|${paramTab}` !== seen) { // a deep link arrived while open
    setSeen(`${paramDate}|${paramTab}`);
    setDateState(paramDate);
    setTabState(paramTab);
  }
  const sync = (nextDate, nextTab) => {
    setDateState(nextDate);
    setTabState(nextTab);
    setSeen(`${nextDate}|${nextTab}`);
    navigate('stock_audit', auditParams({ date: nextDate, tab: nextTab, today }), { replace: true });
  };
  const setDate = (d) => sync(auditDateFromParam(d, today), tab);
  const setTab = (t) => sync(date, t);
  const [query, setQuery] = useState('');
  // On phones the tab row scrolls sideways; keep the selected tab (e.g. a
  // `?tab=links` deep link) in view.
  const tabScrollRef = useRef(null);
  useEffect(() => {
    const box = tabScrollRef.current;
    const active = box?.querySelector('[role=tab][aria-selected=true]');
    if (!box || !active) return;
    const left = active.offsetLeft - box.clientWidth / 2 + active.offsetWidth / 2;
    box.scrollTo({ left: Math.max(0, left) });
  }, [tab]);

  const audit = useMemo(() => auditDay({ orders, stock, menu, date }), [orders, stock, menu, date]);
  const week = useMemo(() => {
    const end = date > today ? today : date;
    const dates = Array.from({ length: 7 }, (_, i) => addDaysISO(end, i - 6));
    return auditDays({ orders, stock, menu, dates });
  }, [orders, stock, menu, date, today]);
  const links = useMemo(() => auditMenuLinks({ menu, stock, beanModifiers }), [menu, stock, beanModifiers]);
  const negatives = useMemo(() => negativeStock(stock), [stock]);
  const stockCounts = useStockCounts(date);
  const countedItems = useMemo(() => summarizeCounts(stockCounts.counts).items, [stockCounts.counts]);

  const { summary, sold, stockUsed, issues } = audit;
  const verdict = VERDICT[summary.verdict] || VERDICT.empty;

  const q = query.trim().toLowerCase();
  const soldFiltered = q ? sold.filter((s) => `${s.name} ${s.modifier} ${s.category}`.toLowerCase().includes(q)) : sold;
  const stockFiltered = q
    ? stockUsed.filter((s) => `${s.name} ${s.items.map((i) => i.name).join(' ')}`.toLowerCase().includes(q))
    : stockUsed;

  const actionable = issues.filter((i) => i.severity !== 'info').length;
  const goFix = (view, menuId) => {
    if (menuId) {
      try { sessionStorage.setItem('menuManage:focus', menuId); } catch { /* storage ปิด ก็แค่ไม่เปิดฟอร์มให้ */ }
    }
    if (view === 'stock') handleViewChange?.('stock', { filter: 'out' });
    else handleViewChange?.(view);
  };

  const exportCsv = () => {
    const rows = [['วันที่', 'เมนู', 'ตัวเลือก', 'หมวด', 'จำนวน', 'ยอดขาย', 'สถานะสต็อก', 'วัตถุดิบที่ตัด']];
    sold.forEach((s) => rows.push([
      date, s.name, s.modifier, s.category, s.quantity, Math.round(s.revenue), STATUS_LABEL[s.status],
      s.stock.map((x) => `${x.name} ${qtyText(x.total)} ${x.unit}`).join(' | '),
    ]));
    rows.push([]);
    rows.push(['วัตถุดิบ', 'ตัดไป', 'หน่วย', 'ต้นทุน', 'คงเหลือ']);
    stockUsed.forEach((s) => rows.push([s.name, qtyText(s.used), s.unit, Math.round(s.cost), qtyText(s.onHand)]));
    downloadCsv(rows, `สรุปขาย-สต็อก_${date}.csv`);
  };

  const detail = [
    summary.unitsUnlinked > 0 && `ไม่ได้ตัด ${summary.unitsUnlinked} หน่วยเพราะเมนูยังไม่ผูก`,
    (summary.unitsDead + summary.unitsPartial) > 0 && `${summary.unitsDead + summary.unitsPartial} หน่วยสูตรชี้ไปสต็อกที่ถูกลบ`,
    summary.billsMissed > 0 && `${summary.billsMissed} บิลเสร็จแต่ไม่ถูกตัด`,
    summary.billsMismatch > 0 && `${summary.billsMismatch} บิลตัดไม่ตรงสูตร`,
    summary.waiting > 0 && `${summary.waiting} บิลยังไม่เสร็จ (ยังไม่ตัด)`,
  ].filter(Boolean);

  const tabs = [
    { value: 'sold', label: 'ขายได้', icon: <ShoppingBag size={16} />, count: sold.length },
    { value: 'stock', label: 'สต็อกที่ตัด', icon: <Package size={16} />, count: stockUsed.length },
    { value: 'issues', label: 'ต้องแก้', icon: <AlertTriangle size={16} />, count: actionable },
    { value: 'menu', label: 'ผูกสต็อก', icon: <Link2 size={16} />, count: links.needsAttention + links.modifiers.length },
    { value: 'count', label: 'ตรวจนับ', icon: <ClipboardList size={16} />, count: countedItems },
  ];
  const searchable = tab === 'sold' || tab === 'stock';

  return (
    <div className="h-full bg-[var(--bg-canvas)] flex flex-col overflow-hidden text-[var(--text-primary)]">
      <PageHeader
        title="สรุปขาย & สต็อก"
        subtitle={formatThaiDate(date, { style: 'long', weekday: true })}
        icon={ClipboardCheck}
        sticky={false}
        actions={<DateStepper value={date} onChange={setDate} max={today} />}
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-[var(--page-pad)] pb-24 md:pb-10">
        <div className="mx-auto w-full max-w-5xl pt-4">
          {/* 7-day strip */}
          <nav aria-label="7 วันล่าสุด" className="grid grid-cols-7 gap-1.5">
            {week.map((d) => {
              const s = STRIP[d.verdict] || STRIP.empty;
              const { weekday, day } = dayLabel(d.date);
              const active = d.date === date;
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => setDate(d.date)}
                  aria-current={active ? 'date' : undefined}
                  aria-label={`${formatThaiDate(d.date, { weekday: true })} · ${d.verdict === 'empty' ? 'ไม่มีบิล' : `ตัดครบ ${pct(d.accuracy)} · ${d.bills} บิล`}`}
                  className={`flex min-h-11 flex-col items-center gap-1 rounded-[var(--radius-sm)] border-2 px-1 py-2 outline-none transition-colors focus-visible:shadow-[var(--focus-ring)] ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--bg-selected)]'
                      : 'border-transparent bg-[var(--bg-surface)] shadow-[var(--elev-1)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <span className="text-xs text-[var(--text-muted)]">{weekday}</span>
                  <span className="num text-base font-semibold text-[var(--text-primary)]">{day}</span>
                  <span className={`h-1.5 w-6 rounded-full ${s.bar}`} aria-hidden="true" />
                  <span className={`num text-xs ${s.ink}`}>{d.verdict === 'empty' ? '–' : pct(d.accuracy)}</span>
                </button>
              );
            })}
          </nav>

          {/* verdict */}
          <section aria-label="ผลตรวจวันนี้" className="mt-4 flex flex-col gap-3">
            <Banner tone={verdict.tone} title={verdict.title}>
              {summary.verdict !== 'empty' && (
                <>
                  <span className="block">
                    ตัดสต็อกตามสูตรได้ <b className="num text-[var(--text-primary)]">{pct(summary.accuracy)}</b> ของที่ขาย
                    {detail.length > 0 && ` · ${detail.join(' · ')}`}
                  </span>
                  <span className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-[var(--bg-surface)]" aria-hidden="true">
                    <span className="bg-[var(--state-ok)]" style={{ width: pct((summary.unitsOk + summary.unitsModifierOnly) / summary.units) }} />
                    <span className="bg-[var(--state-warn)]" style={{ width: pct((summary.unitsUnlinked + summary.unitsPartial) / summary.units) }} />
                    <span className="bg-[var(--state-danger)]" style={{ width: pct(summary.unitsDead / summary.units) }} />
                  </span>
                </>
              )}
            </Banner>
            {summary.verdict !== 'empty' && (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="บิล" value={formatNumber(summary.bills)} hint={summary.billsRecorded ? `มีบันทึกการตัด ${summary.billsRecorded} บิล` : 'บิลเก่ายังไม่มีบันทึกการตัด'} />
                <StatCard label="ขายได้" value={formatNumber(summary.units)} unit="หน่วย" hint={`${sold.length} เมนู`} />
                <StatCard label="ยอดขาย" value={<Money value={summary.revenue} />} hint="หลังหักส่วนลด" />
                <StatCard label="ต้นทุนวัตถุดิบที่ตัด" value={<Money value={summary.cost} />} hint={`${stockUsed.length} วัตถุดิบ`} />
              </div>
            )}
          </section>

          {/* tabs + search */}
          <div className="sticky top-0 z-[2] -mx-[var(--page-pad)] mt-4 bg-[var(--bg-canvas)] px-[var(--page-pad)] pt-1">
            <Tabs value={tab} onChange={setTab} variant="underline">
              <div ref={tabScrollRef} className="relative overflow-x-auto scrollbar-hide">
                <Tabs.List className="w-max min-w-full">
                  {tabs.map((t) => (
                    <Tabs.Tab key={t.value} value={t.value} icon={t.icon} count={t.count} className="shrink-0 whitespace-nowrap">
                      {t.label}
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </div>
            </Tabs>
            {searchable && (
              <div className="flex items-center gap-2 py-2">
                <label className="relative min-w-0 flex-1 sm:max-w-xs">
                  <span className="sr-only">ค้นหาเมนูหรือวัตถุดิบ</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="ค้นหาเมนู/วัตถุดิบ"
                    className="min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus-visible:shadow-[var(--focus-ring)]"
                  />
                </label>
                <Button variant="secondary" leftIcon={<Download size={16} />} onClick={exportCsv} disabled={!sold.length}>CSV</Button>
              </div>
            )}
          </div>

          <div className="mt-2">
            {tab === 'sold' && (summary.verdict === 'empty' ? <AuditEmpty text="วันนี้ยังไม่มีบิล" /> : <SoldList sold={soldFiltered} />)}
            {tab === 'stock' && <StockUsedList rows={stockFiltered} />}
            {tab === 'issues' && <IssueList issues={issues} onFix={goFix} />}
            {tab === 'menu' && <MenuHealth links={links} negatives={negatives} onFix={goFix} />}
            {tab === 'count' && (
              <CountAuditSection
                {...stockCounts}
                isToday={date === today}
                onStartCount={() => handleViewChange?.('stock', { filter: 'uncounted' })}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
