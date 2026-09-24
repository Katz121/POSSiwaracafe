import { useMemo, useState } from 'react';
import { DataTable, Money, SectionCard } from '../../ui';
import { formatNumber, formatThaiDate } from '../../../utils/format';
import { ChartBar, CsvButton, SectionHead } from './RecordsSection';
import { compactBaht, dayLabel, monthLabel } from './salesFormat';

const n = (v) => formatNumber(v, { maxDecimals: 0 });

function MonthChart({ months, max }) {
  const chrono = [...months].reverse(); // oldest → newest, left to right
  return (
    <div className="flex h-48 gap-2 overflow-x-auto pb-1 [&>*]:min-w-11" role="img" aria-label="กราฟยอดขายรายเดือน">
      {chrono.map((m) => (
        <ChartBar
          key={m.key}
          percent={(m.revenue / max) * 100}
          valueLabel={compactBaht(m.revenue)}
          label={formatThaiDate(`${m.key}-01`, { style: 'short' }).split(' ')[1]}
          title={monthLabel(m.key)}
        />
      ))}
    </div>
  );
}

const periodColumns = (labelFor, header) => [
  { key: 'key', header, render: (_, r) => <span className="font-medium">{labelFor(r.key)}</span> },
  { key: 'bills', header: 'บิล', numeric: true, width: 72, render: (_, r) => n(r.bills.length) },
  { key: 'cups', header: 'แก้ว', numeric: true, width: 72, render: (_, r) => n(r.cups) },
  { key: 'revenue', header: 'ยอดขาย', numeric: true, width: 124, render: (_, r) => <Money value={r.revenue} /> },
  { key: 'expense', header: 'รายจ่าย', numeric: true, width: 124, render: (_, r) => <Money value={r.expense} muted /> },
  {
    key: 'profit', header: 'กำไร', numeric: true, width: 124,
    render: (_, r) => <Money value={r.revenue - r.expense} tone={r.revenue - r.expense < 0 ? 'danger' : undefined} className="font-semibold" />,
  },
];

const periodCard = (labelFor) => (r) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center justify-between gap-3">
      <span className="font-semibold text-[var(--text-primary)] truncate">{labelFor(r.key)}</span>
      <Money value={r.revenue} className="font-semibold text-[var(--text-primary)]" />
    </div>
    <div className="flex flex-wrap items-center justify-between gap-x-3 text-sm text-[var(--text-muted)]">
      <span><span className="num">{n(r.bills.length)}</span> บิล · <span className="num">{n(r.cups)}</span> แก้ว</span>
      <span>
        จ่าย <Money value={r.expense} /> · กำไร <Money value={r.revenue - r.expense} tone={r.revenue - r.expense < 0 ? 'danger' : undefined} />
      </span>
    </div>
  </div>
);

/** Tab "ไทม์ไลน์": monthly chart → months table → days of the chosen month. */
export default function SalesTimeline({ data, exportCsv, onOpenDay }) {
  const [picked, setPicked] = useState(null);
  const monthKey = data.months.some((m) => m.key === picked && m.key !== 'unknown')
    ? picked
    : (data.months.find((m) => m.key !== 'unknown')?.key || null);
  const month = data.months.find((m) => m.key === monthKey) || null;
  const days = useMemo(
    () => (month ? [...month.days.values()].sort((a, b) => b.key.localeCompare(a.key)) : []),
    [month],
  );
  const monthColumns = useMemo(() => periodColumns(monthLabel, 'เดือน'), []);
  const dayColumns = useMemo(() => periodColumns(dayLabel, 'วัน'), []);

  return (
    <div className="flex flex-col gap-6">
      <SectionCard padding="lg">
        <SectionHead title="ยอดขายรายเดือน" actions={<CsvButton onClick={exportCsv} label="CSV รายวัน" />} />
        <div className="mt-4">
          {data.ordered.length ? <MonthChart months={data.ordered} max={data.chartMax} /> : <p className="text-sm text-[var(--text-muted)]">ยังไม่มีข้อมูล</p>}
        </div>
      </SectionCard>

      <div className="flex flex-col gap-3">
        <SectionHead title="สรุปรายเดือน" description="แตะเดือนเพื่อดูรายวัน" />
        <DataTable
          caption="สรุปยอดขายรายเดือน"
          columns={monthColumns}
          rows={data.months}
          rowKey="key"
          selectedKey={monthKey}
          onRowClick={(r) => r.key !== 'unknown' && setPicked(r.key)}
          renderCard={periodCard(monthLabel)}
          emptyState={{ title: 'ยังไม่มีข้อมูล', icon: 'receipt' }}
        />
      </div>

      {month && (
        <div className="flex flex-col gap-3">
          <SectionHead title={`รายวัน · ${monthLabel(month.key)}`} description="แตะวันเพื่อดูรายจ่ายของวันนั้น" />
          <DataTable
            caption={`ยอดขายรายวัน ${monthLabel(month.key)}`}
            columns={dayColumns}
            rows={days}
            rowKey="key"
            density="compact"
            onRowClick={onOpenDay}
            renderCard={periodCard(dayLabel)}
            emptyState={{ title: 'ไม่มีข้อมูลรายวัน' }}
          />
        </div>
      )}
    </div>
  );
}
