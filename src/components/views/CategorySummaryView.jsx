import { useMemo, useState } from 'react';
import { BarChart3, Download, PieChart } from 'lucide-react';
import { BarChart, Bar, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDataContext } from '../../context/AppContext';
import { getISODate } from '../../utils/calculations';
import { formatNumber, formatPercent, formatThaiDate } from '../../utils/format';
import { PERIOD_PRESETS, periodRange, periodText } from '../../utils/periodRange';
import { Badge, Button, DataTable, Money, PageHeader, SectionCard, SegmentedControl, StatCard, Toolbar, useMediaQuery } from '../ui';
import { buildCategoryReport, categorySalesCsv, rangeLabel } from './records/categorySales';
import { downloadText } from './records/csv';
import { ShareBar } from './records/RecordsSection';
import CategoryItemsSheet from './records/CategoryItemsSheet';

const n = (v) => formatNumber(v, { maxDecimals: 0 });
const pct = (part, total) => (total ? (part / total) * 100 : 0);
const pctText = (v) => formatPercent(v, { digits: 0 });
const growthText = (v) => (v === null || v === undefined ? 'ไม่มีช่วงก่อนให้เทียบ' : `${v > 0 ? '+' : ''}${v}%`);
const delta = (v, label) => (v === null || v === undefined ? undefined : { value: Math.abs(v), direction: v < 0 ? 'down' : 'up', good: 'up', label });

// สีตามหมวด ไม่ใช่ตามอันดับ · ลำดับเดียวกับหมวดในร้าน (dynamicCategories.order) เปลี่ยนช่วงแล้วสีไม่สลับ
// เกิน 7 หมวดรวมเป็น "อื่นๆ" ในกราฟ (ตารางยังแยกครบ)
const SLOTS = 7;
const OTHER = 'อื่นๆ (รวม)';
const seriesColor = (i) => `var(--series-${i + 1})`;

const dateInput = 'min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] outline-none focus-visible:shadow-[var(--focus-ring)] focus:border-[var(--accent)]';
const tooltipStyle = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', borderRadius: 12 };
const axisStyle = { fill: 'var(--text-muted)', fontSize: 12 };
const chartMoney = (v) => '฿' + Number(v).toLocaleString('th-TH', { notation: 'compact' });
const shortDay = (day) => new Date(day + 'T00:00:00Z').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function MarginCell({ row }) {
  if (row.marginPct === null) return <Badge tone="neutral" size="xs">ยังไม่ผูกต้นทุน</Badge>;
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <Money decimals={0} value={row.grossProfit} className="font-semibold" />
      <span className="num text-xs text-[var(--text-muted)]">มาร์จิ้น {pctText(row.marginPct)}{row.costCoverage < 90 ? ` · ต้นทุนครบ ${pctText(row.costCoverage)}` : ''}</span>
    </span>
  );
}

function GrowthCell({ value }) {
  if (value === null || value === undefined) return <span className="text-xs text-[var(--text-muted)]">ไม่มีข้อมูล</span>;
  const tone = value < 0 ? 'text-[var(--state-danger)]' : 'text-[var(--state-ok)]';
  return <span className={`num font-semibold ${tone}`}>{value > 0 ? '+' : ''}{value}%</span>;
}

/**
 * CategorySummaryView · ยอดขายตามหมวด
 * ยอดสุทธิหลังปันส่วนลดท้ายบิล (กติกาเดียวกับหน้ากำไรต่อเมนู) · ต้นทุนจากสูตรที่ผูก
 * เทียบช่วงก่อนความยาวเท่ากัน · แนวโน้ม · ช่วงเวลาที่ขาย · หมวดที่ซื้อคู่กัน
 */
export default function CategorySummaryView() {
  const { orders, menu, stock, beanModifiers = [], dynamicCategories = [] } = useDataContext();
  const phone = useMediaQuery('(max-width: 767px)');

  const [preset, setPreset] = useState('today');
  const [range, setRange] = useState(() => periodRange('today'));
  const [open, setOpen] = useState(null);

  const choosePreset = (next) => {
    setPreset(next);
    setRange((cur) => periodRange(next, new Date(), cur));
  };

  const report = useMemo(
    () => buildCategoryReport({ orders, menu, stock, beanModifiers, start: range.start, end: range.end }),
    [orders, menu, stock, beanModifiers, range.start, range.end],
  );
  const { categories, breakdown, totals, trend, hours, pairs } = report;
  const best = categories[0];

  // หมวดในกราฟ: เรียงตามลำดับหมวดของร้าน 7 ตัวแรกได้สีประจำ ที่เหลือรวม "อื่นๆ"
  const chart = useMemo(() => {
    const order = new Map(dynamicCategories.map((c, i) => [String(c.name), i]));
    const sold = categories.map((c) => c.category)
      .sort((a, b) => (order.get(a) ?? 1e6) - (order.get(b) ?? 1e6) || a.localeCompare(b, 'th'));
    const named = sold.length > SLOTS + 1 ? sold.slice(0, SLOTS) : sold.slice(0, SLOTS + 1);
    const folded = sold.filter((c) => !named.includes(c));
    const rows = trend.rows.map((r) => {
      const row = { key: r.key };
      named.forEach((c) => { row[c] = r[c] || 0; });
      if (folded.length) row[OTHER] = folded.reduce((s, c) => s + (r[c] || 0), 0);
      return row;
    });
    const series = [...named.map((c, i) => ({ key: c, color: seriesColor(i) })), ...(folded.length ? [{ key: OTHER, color: 'var(--text-muted)' }] : [])];
    return { rows, series, colorOf: new Map(series.map((s) => [s.key, s.color])) };
  }, [categories, trend.rows, dynamicCategories]);

  const exportCsv = () => {
    const label = rangeLabel(preset, range.start, range.end);
    downloadText(categorySalesCsv(categories, label), `category-sales-${label}.csv`, 'text/csv;charset=utf-8;');
  };

  const columns = [
    {
      key: 'category', header: 'หมวด',
      render: (v, r) => (
        <span className="flex items-start gap-2 min-w-0">
          <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: chart.colorOf.get(v) || chart.colorOf.get(OTHER) || 'var(--text-muted)' }} />
          <span className="min-w-0">
            <span className="block font-semibold text-[var(--text-primary)] truncate">{String(v)}</span>
            <span className="block text-xs text-[var(--text-muted)]"><span className="num">{n(r.quantity)}</span> ชิ้น · <span className="num">{n(r.bills)}</span> บิล</span>
          </span>
        </span>
      ),
    },
    { key: 'net', header: 'ยอดสุทธิ', numeric: true, width: 120, render: (v) => <Money decimals={0} value={v} className="font-semibold" /> },
    { key: 'growth', header: 'เทียบช่วงก่อน', numeric: true, width: 110, render: (v) => <GrowthCell value={v} /> },
    { key: 'grossProfit', header: 'กำไรขั้นต้น', numeric: true, width: 150, render: (_, r) => <MarginCell row={r} /> },
    { key: 'avgPerBill', header: 'เฉลี่ย/บิล', numeric: true, width: 96, render: (v) => <Money decimals={0} value={v} /> },
    { key: 'share', header: 'สัดส่วน', width: 170, render: (_, r) => <ShareBar percent={pct(r.net, totals.net)} /> },
  ];

  const hourMax = (row) => Math.max(...hours.hours.map((h) => row.values[h]), 1);

  return (
    <div className="h-full bg-[var(--bg-canvas)] flex flex-col overflow-hidden text-[var(--text-primary)]">
      <PageHeader
        title="ยอดขายตามหมวด"
        subtitle={periodText(range.start, range.end)}
        icon={PieChart}
        sticky={false}
        actions={(
          <Button variant="secondary" leftIcon={<Download size={18} />} onClick={exportCsv} disabled={categories.length === 0}>
            Export CSV
          </Button>
        )}
      />

      <Toolbar
        filters={(
          <div className="max-w-full overflow-x-auto scrollbar-hide">
            <SegmentedControl ariaLabel="ช่วงเวลา" options={PERIOD_PRESETS} value={preset} onChange={choosePreset} className={phone ? '[&>button]:px-2' : ''} />
          </div>
        )}
      >
        {preset === 'custom' && (
          <div className="grid grid-cols-2 gap-2 max-w-md">
            <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
              ตั้งแต่
              <input type="date" value={range.start} max={range.end || getISODate()} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} className={dateInput} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
              ถึง
              <input type="date" value={range.end} min={range.start || undefined} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} className={dateInput} />
            </label>
          </div>
        )}
      </Toolbar>

      <div className="flex-1 min-h-0 overflow-y-auto px-[var(--page-pad)] pb-24 md:pb-10">
        <div className="max-w-6xl mx-auto flex flex-col gap-5">
          <section aria-label="สรุปช่วงที่เลือก" className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard
              label="ยอดขายสุทธิ"
              value={<Money decimals={0} value={totals.net} />}
              delta={delta(totals.growth, 'จากช่วงก่อน')}
              hint={totals.discount > 0.5 ? <>ก่อนส่วนลด <Money decimals={0} value={totals.gross} /></> : 'หลังหักส่วนลดท้ายบิล'}
            />
            <StatCard
              label="กำไรขั้นต้น"
              value={<Money decimals={0} value={totals.grossProfit} />}
              hint={totals.marginPct === null ? 'ยังไม่มีเมนูที่ผูกต้นทุน' : `มาร์จิ้น ${pctText(totals.marginPct)}${totals.costCoverage < 90 ? ` · ต้นทุนครบ ${pctText(totals.costCoverage)}` : ''}`}
            />
            <StatCard label="จำนวนบิล" value={n(totals.bills)} unit="บิล" delta={delta(totals.billGrowth, 'จากช่วงก่อน')} hint={`${n(totals.quantity)} ชิ้น`} />
            <StatCard label="ยอดเฉลี่ยต่อบิล" value={<Money decimals={0} value={totals.avgPerBill} />} hint={`ส่วนลดรวม ฿${n(totals.discount)}`} />
            <StatCard
              label="หมวดขายดีที่สุด"
              value={best ? String(best.category) : '–'}
              hint={best ? `${pctText(pct(best.net, totals.net))} ของยอดขาย` : 'ยังไม่มีข้อมูล'}
              className="col-span-2 lg:col-span-1"
            />
          </section>
          {totals.prev && (
            <p className="-mt-2 text-xs text-[var(--text-muted)]">
              ช่วงก่อน = {periodText(totals.prev.start, totals.prev.end)} (ยาวเท่ากัน) · ยอดสุทธิ <span className="num">฿{n(totals.prev.net)}</span> · <span className="num">{n(totals.prev.bills)}</span> บิล
            </p>
          )}

          <DataTable
            caption="ยอดขายแยกตามหมวด"
            columns={columns}
            rows={categories}
            rowKey="category"
            onRowClick={(r) => setOpen(r.category)}
            selectedKey={open}
            renderCard={(r) => (
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex items-start gap-2 min-w-0">
                    <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: chart.colorOf.get(r.category) || chart.colorOf.get(OTHER) }} />
                    <span className="min-w-0">
                      <span className="block font-semibold truncate">{String(r.category)}</span>
                      <span className="block text-sm text-[var(--text-muted)]"><span className="num">{n(r.quantity)}</span> ชิ้น · <span className="num">{n(r.bills)}</span> บิล · เฉลี่ย <Money decimals={0} value={r.avgPerBill} />/บิล</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <Money decimals={0} value={r.net} className="block font-semibold" />
                    <span className="block text-xs"><GrowthCell value={r.growth} /></span>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-[var(--text-secondary)]">กำไรขั้นต้น</span>
                  <MarginCell row={r} />
                </div>
                <ShareBar percent={pct(r.net, totals.net)} />
              </div>
            )}
            emptyState={{ icon: BarChart3, title: 'ไม่มีข้อมูลในช่วงวันที่นี้', description: 'ลองเลือกช่วงวันที่อื่น' }}
          />
          {categories.length > 0 && <p className="-mt-2 text-xs text-[var(--text-muted)]">แตะหมวดเพื่อดูรายการ กำไรรายเมนู และตัวเลือกที่ลูกค้าเลือก (เมล็ด นม ความหวาน) · กำไรของหมวดที่ต้นทุนไม่ครบจะสูงกว่าความจริง</p>}

          {chart.rows.length > 1 && (
            <SectionCard title={`ยอดสุทธิ${trend.daily ? 'รายวัน' : 'รายเดือน'}แยกหมวด`} description="แท่งซ้อนกัน · ความสูงรวม = ยอดสุทธิทั้งร้าน · แตะหรือชี้ที่แท่งเพื่อดูตัวเลข">
              <div className="h-[300px] md:h-[340px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart.rows} margin={{ top: 8, right: 0, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="key" tickFormatter={trend.daily ? shortDay : (m) => formatThaiDate(m, { style: 'month' })} tick={axisStyle} minTickGap={20} stroke="var(--border-color)" />
                    <YAxis tick={axisStyle} tickFormatter={chartMoney} width={56} stroke="var(--border-color)" />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: 'var(--bg-sunken)' }}
                      labelFormatter={(k) => (trend.daily ? formatThaiDate(k, { weekday: true }) : formatThaiDate(k, { style: 'month' }))}
                      formatter={(v, name) => [`฿${n(v)}`, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span style={{ color: 'var(--text-secondary)' }}>{v}</span>} />
                    {chart.series.map((s, i) => (
                      <Bar key={s.key} dataKey={s.key} stackId="net" fill={s.color} stroke="var(--bg-surface)" strokeWidth={1}
                        radius={i === chart.series.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={36} isAnimationActive={false} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          )}

          <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
            {hours.hours.length > 0 && (
              <SectionCard title="ขายดีช่วงไหน" description={`ยอดสุทธิรายชั่วโมงของแต่ละหมวด · สีทึบที่สุด = ชั่วโมงที่ขายดีที่สุดของหมวดนั้น · นับจาก ${n(hours.billsWithTime)} บิลที่มีเวลา`}>
                <div className="overflow-x-auto">
                  <table className="w-full border-separate border-spacing-[2px] text-xs">
                    <caption className="sr-only">ยอดสุทธิรายชั่วโมงแยกหมวด</caption>
                    <thead>
                      <tr>
                        <th scope="col" className="sticky left-0 bg-[var(--bg-surface)] text-left font-medium text-[var(--text-muted)]">หมวด</th>
                        {hours.hours.map((h) => <th key={h} scope="col" className="num font-medium text-[var(--text-muted)]">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {hours.rows.map((row) => {
                        const max = hourMax(row);
                        return (
                          <tr key={row.category}>
                            <th scope="row" className="sticky left-0 max-w-28 truncate bg-[var(--bg-surface)] pr-2 text-left font-medium text-[var(--text-primary)]">{row.category}</th>
                            {hours.hours.map((h) => {
                              const v = row.values[h];
                              const a = v > 0 ? 0.12 + 0.88 * (v / max) : 0;
                              return (
                                <td key={h} title={`${row.category} · ${h}:00 · ฿${n(v)}`} className="h-8 min-w-8 rounded-[4px] bg-[var(--bg-sunken)] p-0">
                                  <span className="block h-8 rounded-[4px]" style={{ background: 'var(--series-1)', opacity: a }} />
                                  <span className="sr-only">฿{n(v)}</span>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            )}

            {pairs.length > 0 && (
              <SectionCard title="หมวดที่ซื้อคู่กัน" description="จำนวนบิลที่มีทั้งสองหมวด · ใช้คิดโปรเซ็ต/ชุดคู่">
                <ol className="flex flex-col divide-y divide-[var(--border-light)]">
                  {pairs.slice(0, 8).map((p) => (
                    <li key={`${p.a}|${p.b}`} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-[var(--text-primary)] break-words">{p.a} + {p.b}</span>
                        <span className="block text-xs text-[var(--text-muted)]">{pctText(p.ofA)} ของบิล{p.a} · {pctText(p.ofB)} ของบิล{p.b}</span>
                      </span>
                      <span className="num shrink-0 text-sm font-semibold">{n(p.bills)} บิล</span>
                    </li>
                  ))}
                </ol>
              </SectionCard>
            )}
          </div>
        </div>
      </div>

      <CategoryItemsSheet
        category={open ? categories.find((c) => c.category === open) || null : null}
        breakdown={breakdown}
        share={open ? `${pctText(pct(categories.find((c) => c.category === open)?.net || 0, totals.net))} ของยอดขาย` : ''}
        growthLabel={open ? growthText(categories.find((c) => c.category === open)?.growth) : ''}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
