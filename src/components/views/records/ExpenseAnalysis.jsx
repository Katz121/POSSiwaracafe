import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { ratio } from '../../../utils/salesHistory';
import { formatNumber, formatThaiDate } from '../../../utils/format';
import { DataTable, Input, Money, SectionCard, SegmentedControl, Sheet } from '../../ui';
import { CsvButton, SectionHead, ShareBar } from './RecordsSection';
import { monthLabel, signedPercent } from './salesFormat';

const n = (v) => formatNumber(v, { maxDecimals: 0 });
const SORTS = [
  { value: 'amount', label: 'ยอดรวม' },
  { value: 'count', label: 'จำนวนครั้ง' },
  { value: 'average', label: 'เฉลี่ย/ครั้ง' },
];
const changeInk = (change) => (change === null ? 'text-[var(--text-muted)]' : change > 0 ? 'text-[var(--state-warn)]' : 'text-[var(--state-ok)]');

function Cost({ label, amount, total, text }) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] p-4">
      <p className="text-sm font-medium text-[var(--text-secondary)]">{label}</p>
      <Money value={amount} className="block mt-1 text-[length:var(--fs-xl)] leading-[var(--lh-xl)] font-semibold text-[var(--text-primary)]" />
      <p className="text-sm text-[var(--text-muted)]">{ratio(amount, total)} ของรายจ่าย · {text}</p>
    </div>
  );
}

function RecordSheet({ open, title, description, rows, onClose }) {
  return (
    <Sheet open={open} onClose={onClose} title={title} description={description}>
      <ul className="flex flex-col divide-y divide-[var(--border-light)]">
        {rows.map((r) => (
          <li key={r.key} className="flex items-start justify-between gap-3 py-2.5 text-sm">
            <span className="min-w-0">
              <span className="block text-[var(--text-primary)] break-words">{r.label}</span>
              {r.sub && <span className="block text-xs text-[var(--text-muted)]">{r.sub}</span>}
            </span>
            <Money value={r.amount} className="shrink-0" />
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/** Tab "รายจ่าย": monthly health, categories vs the previous period, top titles, fixed vs variable, notes. */
export default function ExpenseAnalysis({ data, exportCsv }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('amount');
  const [openCat, setOpenCat] = useState(null);
  const [openTitle, setOpenTitle] = useState(null);

  const titles = useMemo(() => data.titleRows
    .filter((t) => t.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .sort((a, b) => (sort === 'count' ? b.count - a.count : sort === 'average' ? b.average - a.average : b.amount - a.amount))
    .slice(0, 20), [data.titleRows, query, sort]);

  const catRows = useMemo(() => data.catRows.map((c) => {
    const old = data.prevCats.get(c.name);
    return { ...c, change: old?.amount ? ((c.amount - old.amount) / old.amount) * 100 : null };
  }), [data.catRows, data.prevCats]);

  const healthColumns = [
    { key: 'key', header: 'เดือน', render: (_, r) => <span className="font-medium">{monthLabel(r.key)}</span> },
    { key: 'revenue', header: 'ยอดขาย', numeric: true, width: 120, render: (v) => <Money value={v} /> },
    { key: 'expense', header: 'รายจ่าย', numeric: true, width: 120, render: (v) => <Money value={v} /> },
    {
      key: 'percent', header: 'จ่าย/ขาย', width: 180,
      render: (v) => <ShareBar percent={v} tone={v > data.avgPercent + 5 ? 'warn' : 'accent'} label={`${Math.round(v)}%`} />,
    },
    { key: 'profit', header: 'กำไร', numeric: true, width: 120, render: (v) => <Money value={v} tone={v < 0 ? 'danger' : undefined} className="font-semibold" /> },
  ];
  const catColumns = [
    { key: 'name', header: 'หมวด', render: (v) => <span className="font-medium">{v}</span> },
    { key: 'count', header: 'ครั้ง', numeric: true, width: 72, render: (v) => n(v) },
    { key: 'amount', header: 'ยอดรวม', numeric: true, width: 120, render: (v) => <Money value={v} /> },
    { key: 'share', header: 'สัดส่วน', numeric: true, width: 84, render: (_, r) => ratio(r.amount, data.totals.expense) },
    { key: 'change', header: 'เทียบช่วงก่อน', numeric: true, width: 112, render: (v) => <span className={changeInk(v)}>{signedPercent(v)}</span> },
  ];
  const titleColumns = [
    { key: 'name', header: 'หัวข้อ', render: (v) => <span className="font-medium">{v}</span> },
    { key: 'count', header: 'ครั้ง', numeric: true, width: 64, render: (v) => n(v) },
    { key: 'amount', header: 'ยอดรวม', numeric: true, width: 112, render: (v) => <Money value={v} /> },
    { key: 'average', header: 'เฉลี่ย', numeric: true, width: 104, render: (v) => <Money value={v} /> },
    { key: 'latest', header: 'ล่าสุด', numeric: true, width: 112, render: (v) => (v ? formatThaiDate(v, { style: 'short' }) : '—') },
    { key: 'trend', header: 'แนวโน้ม', numeric: true, width: 88, render: (v) => <span className={changeInk(v)}>{signedPercent(v)}</span> },
  ];

  const cat = openCat ? catRows.find((c) => c.name === openCat) : null;
  const title = openTitle ? data.titleRows.find((t) => t.name === openTitle) : null;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[var(--text-muted)]">ตัวเลขทั้งหมดมาจากรายจ่ายที่บันทึกในระบบ ถ้าบางรายการยังไม่ได้บันทึก ภาพจะไม่ครบ</p>

      <div className="flex flex-col gap-3">
        <SectionHead title="สุขภาพรายเดือน" description="สัดส่วนรายจ่ายต่อยอดขาย · แถบสีส้มคือเดือนที่สูงกว่าค่าเฉลี่ยเกิน 5 จุด" />
        <DataTable
          caption="สุขภาพรายเดือน"
          columns={healthColumns}
          rows={data.health}
          rowKey="key"
          density="compact"
          renderCard={(r) => (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{monthLabel(r.key)}</span>
                <Money value={r.profit} tone={r.profit < 0 ? 'danger' : undefined} className="font-semibold" />
              </div>
              <ShareBar percent={r.percent} tone={r.percent > data.avgPercent + 5 ? 'warn' : 'accent'} label={`${Math.round(r.percent)}%`} />
              <p className="text-sm text-[var(--text-muted)]">ขาย <Money value={r.revenue} /> · จ่าย <Money value={r.expense} /></p>
            </div>
          )}
          emptyState={{ title: 'ยังไม่มีข้อมูล' }}
        />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHead title="รายจ่ายแยกหมวด" description="เทียบกับช่วงก่อนหน้าที่ยาวเท่ากัน · แตะหมวดเพื่อดูหัวข้อ" actions={<CsvButton onClick={exportCsv} label="CSV รายจ่าย" />} />
        <DataTable
          caption="รายจ่ายแยกหมวด"
          columns={catColumns}
          rows={catRows}
          rowKey="name"
          density="compact"
          onRowClick={(r) => setOpenCat(r.name)}
          selectedKey={openCat}
          renderCard={(r) => (
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block font-semibold truncate">{r.name}</span>
                <span className="block text-sm text-[var(--text-muted)]"><span className="num">{n(r.count)}</span> ครั้ง · {ratio(r.amount, data.totals.expense)} · <span className={changeInk(r.change)}>{signedPercent(r.change)}</span></span>
              </span>
              <Money value={r.amount} className="shrink-0 font-semibold" />
            </div>
          )}
          emptyState={{ title: 'ไม่มีรายจ่ายในช่วงนี้' }}
        />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHead title="หัวข้อที่จ่ายเยอะสุด" description="20 อันดับแรก · แตะหัวข้อเพื่อดูแต่ละครั้ง" />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[12rem] max-w-md">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาหัวข้อ" leftIcon={<Search size={18} />} aria-label="ค้นหาหัวข้อรายจ่าย" />
          </div>
          <SegmentedControl ariaLabel="เรียงตาม" options={SORTS} value={sort} onChange={setSort} />
        </div>
        <DataTable
          caption="หัวข้อรายจ่าย"
          columns={titleColumns}
          rows={titles}
          rowKey="name"
          density="compact"
          onRowClick={(r) => setOpenTitle(r.name)}
          selectedKey={openTitle}
          renderCard={(r) => (
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block font-semibold truncate">{r.name}</span>
                <span className="block text-sm text-[var(--text-muted)]">
                  <span className="num">{n(r.count)}</span> ครั้ง · เฉลี่ย <Money value={r.average} /> · <span className={changeInk(r.trend)}>{signedPercent(r.trend)}</span>
                </span>
              </span>
              <Money value={r.amount} className="shrink-0 font-semibold" />
            </div>
          )}
          emptyState={{ title: query ? 'ไม่พบหัวข้อนี้' : 'ไม่มีรายจ่ายในช่วงนี้' }}
        />
      </div>

      <SectionCard padding="lg">
        <SectionHead title="ต้นทุนคงที่รายวัน vs ผันแปร" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Cost
            label="จ่ายเกือบทุกวัน"
            amount={data.fixed}
            total={data.totals.expense}
            text={(
              <>
                <Money value={data.days.length ? data.fixed / data.days.length : 0} /> ต่อวัน · ถ้าลด 10% จะประหยัดเดือนละ{' '}
                <Money value={(data.fixed * 0.1) / (data.length || 1)} />
              </>
            )}
          />
          <Cost label="ผันแปร" amount={data.totals.expense - data.fixed} total={data.totals.expense} text="รายการที่ไม่ได้จ่ายเกิน 50% ของวันที่มีข้อมูล" />
        </div>
      </SectionCard>

      <SectionCard padding="lg">
        <SectionHead title={`ข้อสังเกต (${data.observations.length})`} />
        <ul className="mt-3 flex flex-col gap-2">
          {data.observations.map((o, i) => (
            <li key={i} className="rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] p-3 text-sm leading-[var(--lh-sm)] text-[var(--text-secondary)]">{o.text}</li>
          ))}
          {data.observations.length === 0 && <li className="text-sm text-[var(--text-muted)]">ยังไม่มีข้อสังเกตในช่วงนี้</li>}
        </ul>
      </SectionCard>

      <RecordSheet
        open={!!cat}
        onClose={() => setOpenCat(null)}
        title={cat ? `หมวด ${cat.name}` : ''}
        description={cat ? `${n(cat.count)} ครั้ง · ${ratio(cat.amount, data.totals.expense)} ของรายจ่าย` : ''}
        rows={cat ? [...cat.records].map(([t, es]) => ({
          key: t, label: t, sub: `${es.length} ครั้ง`, amount: es.reduce((s, e) => s + Number(e.amount || 0), 0),
        })) : []}
      />
      <RecordSheet
        open={!!title}
        onClose={() => setOpenTitle(null)}
        title={title ? title.name : ''}
        description={title ? `${n(title.count)} ครั้ง · เฉลี่ยครั้งละ ${Math.round(title.average).toLocaleString('th-TH')} บาท` : ''}
        rows={title ? [...title.records].reverse().map((e, i) => ({
          key: e.id || `${e.date}-${i}`, label: e.date ? formatThaiDate(e.date, { weekday: true }) : 'ไม่ระบุวันที่', sub: e.category, amount: e.amount,
        })) : []}
      />
    </div>
  );
}
