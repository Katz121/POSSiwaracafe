import { formatNumber } from '../../../utils/format';
import { DataTable, Money, SectionCard } from '../../ui';
import { ChartBar, CsvButton, SectionHead } from './RecordsSection';
import { compactBaht, dayLabel } from './salesFormat';

const SHORT_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const n = (v) => formatNumber(v, { maxDecimals: 0 });

/** Tab "วันที่ควรดู": loss days, weekday averages, unusually low days. */
export default function DayAnalysis({ data, exportCsv, onOpenDay }) {
  const best = Math.max(...data.weekdays.map((w) => w.average), 0);

  const lossColumns = [
    { key: 'key', header: 'วัน', render: (v) => <span className="font-medium">{dayLabel(v)}</span> },
    { key: 'revenue', header: 'ยอดขาย', numeric: true, width: 116, render: (v) => <Money value={v} /> },
    { key: 'expense', header: 'รายจ่าย', numeric: true, width: 116, render: (v) => <Money value={v} /> },
    { key: 'loss', header: 'ขาดทุน', numeric: true, width: 116, render: (_, r) => <Money value={r.revenue - r.expense} tone="danger" className="font-semibold" /> },
    { key: 'bills', header: 'บิล', numeric: true, width: 64, render: (_, r) => n(r.bills.length) },
  ];
  const lowColumns = [
    { key: 'key', header: 'วัน', render: (v) => <span className="font-medium">{dayLabel(v)}</span> },
    { key: 'bills', header: 'บิล', numeric: true, width: 72, render: (_, r) => n(r.bills.length) },
    { key: 'revenue', header: 'ยอดขาย', numeric: true, width: 124, render: (v) => <Money value={v} className="font-semibold" /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <SectionHead title={`วันที่ขาดทุน (${data.losses.length})`} description="รายจ่ายมากกว่ายอดขาย · แตะวันเพื่อดูรายจ่าย" actions={<CsvButton onClick={exportCsv} label="CSV รายวัน" />} />
        <DataTable
          caption="วันที่ขาดทุน"
          columns={lossColumns}
          rows={data.losses}
          rowKey="key"
          density="compact"
          onRowClick={onOpenDay}
          renderCard={(r) => (
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block font-semibold truncate">{dayLabel(r.key)}</span>
                <span className="block text-sm text-[var(--text-muted)]">ขาย <Money value={r.revenue} /> · จ่าย <Money value={r.expense} /></span>
              </span>
              <Money value={r.revenue - r.expense} tone="danger" className="shrink-0 font-semibold" />
            </div>
          )}
          emptyState={{ title: 'ไม่มีวันที่ขาดทุนในช่วงนี้' }}
        />
      </div>

      <SectionCard padding="lg">
        <SectionHead title="ยอดขายเฉลี่ยตามวันในสัปดาห์" description="นับเฉพาะวันที่มียอดขาย · แถบสีส้มต่ำกว่าวันที่ดีที่สุดเกิน 40%" />
        <div className="mt-4 flex gap-1.5 sm:gap-3 h-52" role="img" aria-label="กราฟยอดขายเฉลี่ยตามวันในสัปดาห์">
          {data.weekdays.map((w, i) => (
            <ChartBar
              key={w.name}
              percent={best ? (w.average / best) * 100 : 0}
              valueLabel={compactBaht(w.average)}
              label={SHORT_DAYS[i]}
              tone={w.average < best * 0.6 ? 'warn' : 'accent'}
              title={`${w.name} · ${w.days} วัน`}
            />
          ))}
        </div>
        <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1 text-sm">
          {data.weekdays.map((w) => (
            <li key={w.name} className="flex justify-between gap-2 border-b border-[var(--border-light)] py-1.5">
              <span className="text-[var(--text-secondary)]">{w.name} · <span className="num">{w.days}</span> วัน</span>
              <span className="text-right">เฉลี่ย <Money value={w.average} className="font-semibold" /> · รวม <Money value={w.revenue} /></span>
            </li>
          ))}
        </ul>
      </SectionCard>

      <div className="flex flex-col gap-3">
        <SectionHead title="วันที่ยอดขายต่ำผิดปกติ" description={<>ต่ำกว่าค่ามัธยฐานของช่วงมากกว่า 40% · ค่ามัธยฐาน <Money value={data.median} /></>} />
        <DataTable
          caption="วันที่ยอดขายต่ำผิดปกติ"
          columns={lowColumns}
          rows={data.lowDays}
          rowKey="key"
          density="compact"
          onRowClick={onOpenDay}
          renderCard={(r) => (
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block font-semibold truncate">{dayLabel(r.key)}</span>
                <span className="block text-sm text-[var(--text-muted)]"><span className="num">{n(r.bills.length)}</span> บิล</span>
              </span>
              <Money value={r.revenue} className="shrink-0 font-semibold" />
            </div>
          )}
          emptyState={{ title: 'ไม่มีวันที่ยอดต่ำผิดปกติ' }}
        />
      </div>
    </div>
  );
}
