import { useMemo, useState } from 'react';
import { BarChart3, Download, PieChart } from 'lucide-react';
import { useDataContext } from '../../context/AppContext';
import { getISODate } from '../../utils/calculations';
import { formatNumber, formatThaiDate } from '../../utils/format';
import { Button, DataTable, Money, PageHeader, SegmentedControl, StatCard, Toolbar, useMediaQuery } from '../ui';
import {
  buildCategorySales, CATEGORY_PRESETS, categorySalesCsv, presetRange, rangeLabel,
} from './records/categorySales';
import { downloadText } from './records/csv';
import { ShareBar } from './records/RecordsSection';
import CategoryItemsSheet from './records/CategoryItemsSheet';

const n = (v) => formatNumber(v, { maxDecimals: 0 });
const pct = (part, total) => (total ? (part / total) * 100 : 0);

function rangeText(preset, start, end) {
  if (preset === 'all' || (!start && !end)) return 'ทุกช่วงเวลา';
  if (start && end && start === end) return formatThaiDate(start, { weekday: true });
  return `${start ? formatThaiDate(start) : 'เริ่มต้น'} – ${end ? formatThaiDate(end) : 'ล่าสุด'}`;
}

const dateInput = 'min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] outline-none focus-visible:shadow-[var(--focus-ring)] focus:border-[var(--accent)]';

/**
 * CategorySummaryView · ยอดขายตามหมวด (UX v2 · WP2)
 * Same numbers as before (records/categorySales.js is the moved memo): completed
 * bills only, line price × quantity, grouped by the line's category.
 */
export default function CategorySummaryView() {
  const { orders, menu } = useDataContext();
  const phone = useMediaQuery('(max-width: 767px)');

  const [preset, setPreset] = useState('today');
  const [range, setRange] = useState(() => presetRange('today'));
  const [open, setOpen] = useState(null);

  const choosePreset = (next) => {
    setPreset(next);
    setRange((cur) => presetRange(next, new Date(), cur));
  };

  const { categories, breakdown, totalRevenue, totalQuantity } = useMemo(
    () => buildCategorySales(orders, menu, range.start, range.end),
    [orders, menu, range.start, range.end],
  );
  const best = categories[0];

  const exportCsv = () => {
    const label = rangeLabel(preset, range.start, range.end);
    downloadText(categorySalesCsv(categories, label), `category-sales-${label}.csv`, 'text/csv;charset=utf-8;');
  };

  const columns = [
    {
      key: 'category', header: 'หมวด',
      render: (v, r) => (
        <span className="min-w-0">
          <span className="block font-semibold text-[var(--text-primary)] truncate">{String(v)}</span>
          <span className="block text-xs text-[var(--text-muted)]">{breakdown[r.category]?.items.length || 0} รายการ</span>
        </span>
      ),
    },
    { key: 'quantity', header: 'ชิ้น', numeric: true, width: 88, render: (v) => n(v) },
    { key: 'revenue', header: 'ยอดขาย', numeric: true, width: 132, render: (v) => <Money value={v} className="font-semibold" /> },
    { key: 'share', header: 'สัดส่วน', width: 200, render: (_, r) => <ShareBar percent={pct(r.revenue, totalRevenue)} /> },
  ];

  return (
    <div className="h-full bg-[var(--bg-canvas)] flex flex-col overflow-hidden text-[var(--text-primary)]">
      <PageHeader
        title="ยอดขายตามหมวด"
        subtitle={rangeText(preset, range.start, range.end)}
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
            <SegmentedControl ariaLabel="ช่วงเวลา" options={CATEGORY_PRESETS} value={preset} onChange={choosePreset} fullWidth={phone} className={phone ? '[&>button]:px-1.5' : ''} />
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
        <div className="max-w-5xl mx-auto flex flex-col gap-4">
          <section aria-label="สรุปช่วงที่เลือก" className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard label="ยอดขายรวม" value={<Money value={totalRevenue} />} hint="ราคาเมนู × จำนวน ก่อนหักส่วนลดท้ายบิล" />
            <StatCard label="ชิ้นที่ขาย" value={n(totalQuantity)} unit="ชิ้น" hint={`${categories.length} หมวด`} />
            <StatCard
              label="หมวดขายดีที่สุด"
              value={best ? String(best.category) : '–'}
              hint={best ? `${formatNumber(pct(best.revenue, totalRevenue), { maxDecimals: 0 })}% ของยอดขาย` : 'ยังไม่มีข้อมูล'}
              className="col-span-2 md:col-span-1"
            />
          </section>

          <DataTable
            caption="ยอดขายแยกตามหมวด"
            columns={columns}
            rows={categories}
            rowKey="category"
            onRowClick={(r) => setOpen(r.category)}
            selectedKey={open}
            renderCard={(r) => (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-semibold truncate">{String(r.category)}</span>
                    <span className="block text-sm text-[var(--text-muted)]"><span className="num">{n(r.quantity)}</span> ชิ้น · {breakdown[r.category]?.items.length || 0} รายการ</span>
                  </span>
                  <Money value={r.revenue} className="shrink-0 font-semibold" />
                </div>
                <ShareBar percent={pct(r.revenue, totalRevenue)} />
              </div>
            )}
            emptyState={{ icon: BarChart3, title: 'ไม่มีข้อมูลในช่วงวันที่นี้', description: 'ลองเลือกช่วงวันที่อื่น' }}
          />
          {categories.length > 0 && <p className="text-xs text-[var(--text-muted)]">แตะหมวดเพื่อดูรายการที่ขายและเมล็ดกาแฟที่เลือก</p>}
        </div>
      </div>

      <CategoryItemsSheet
        category={open ? categories.find((c) => c.category === open) || null : null}
        breakdown={breakdown}
        share={open ? `${formatNumber(pct(categories.find((c) => c.category === open)?.revenue || 0, totalRevenue), { maxDecimals: 0 })}% ของยอดขาย` : ''}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
