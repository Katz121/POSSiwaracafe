import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Link2,
  Link2Off,
  Package,
  Search,
  ShoppingBag,
} from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { getISODate } from '../../utils/calculations';
import {
  auditDay,
  auditDays,
  auditMenuLinks,
  negativeStock,
  roundQty,
  STATUS_LABEL,
} from '../../utils/stockAudit';

// ── helpers ────────────────────────────────────────────────────────────────
const money = (n) => `฿${Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
const qtyText = (n) => Number(roundQty(n)).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const pct = (n) => `${Math.round((Number(n) || 0) * 100)}%`;

const shiftDay = (iso, delta) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return getISODate(d);
};
const WEEKDAY_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const dayLabel = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  return { weekday: WEEKDAY_SHORT[d.getDay()], day: d.getDate() };
};
const longDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('th-TH', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

const downloadCsv = (rows, name) => {
  const body = `FEFF${rows.map((r) => r.map((x) => `"${String(x ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

// สีของสถานะ · ใช้ token กลางเท่านั้น ธีมมืดจะตามเอง
const TONE = {
  ok: { text: 'text-[var(--state-ok)]', bg: 'bg-[var(--state-ok)]', soft: 'bg-[color-mix(in_srgb,var(--state-ok)_12%,transparent)]' },
  warn: { text: 'text-[var(--state-warn)]', bg: 'bg-[var(--state-warn)]', soft: 'bg-[color-mix(in_srgb,var(--state-warn)_14%,transparent)]' },
  bad: { text: 'text-[var(--state-danger)]', bg: 'bg-[var(--state-danger)]', soft: 'bg-[color-mix(in_srgb,var(--state-danger)_12%,transparent)]' },
  empty: { text: 'text-[var(--text-muted)]', bg: 'bg-[var(--border-color)]', soft: 'bg-[var(--bg-tertiary)]' },
  info: { text: 'text-[var(--text-secondary)]', bg: 'bg-[var(--text-muted)]', soft: 'bg-[var(--bg-tertiary)]' },
};
const STATUS_TONE = { ok: 'ok', modifier_only: 'info', partial: 'warn', unlinked: 'warn', dead: 'bad' };
const SEVERITY_TONE = { error: 'bad', warn: 'warn', info: 'info' };

const VERDICT = {
  ok: { icon: CheckCircle2, title: 'ตัดสต็อกถูกต้องครบ', tone: 'ok' },
  warn: { icon: AlertTriangle, title: 'ตัดได้ แต่มีเมนูที่ไม่ถูกตัด', tone: 'warn' },
  bad: { icon: AlertOctagon, title: 'ตัดสต็อกไม่ครบ ต้องแก้', tone: 'bad' },
  empty: { icon: CalendarDays, title: 'ไม่มีบิลในวันนี้', tone: 'empty' },
};

function StatusPill({ status }) {
  const tone = TONE[STATUS_TONE[status] || 'info'];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone.soft} ${tone.text}`}>
      {status === 'ok' ? <Link2 size={12} /> : <Link2Off size={12} />}
      {STATUS_LABEL[status]}
    </span>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="num mt-0.5 truncate text-xl font-semibold text-[var(--text-primary)]">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{sub}</p>}
    </div>
  );
}

function Segmented({ value, onChange, options }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)] p-1">
      {options.map((o) => (
        <button
          key={o.key}
          role="tab"
          aria-selected={value === o.key}
          onClick={() => onChange(o.key)}
          className={[
            'flex min-h-10 shrink-0 items-center gap-1.5 rounded-[calc(var(--radius-sm)-2px)] px-3 text-sm font-medium transition-colors',
            value === o.key
              ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-[var(--elev-1)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
          ].join(' ')}
        >
          {o.label}
          {o.count > 0 && (
            <span className={`num rounded-full px-1.5 text-xs ${o.tone ? `${TONE[o.tone].soft} ${TONE[o.tone].text}` : 'bg-[var(--bg-primary)] text-[var(--text-muted)]'}`}>
              {o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

const panel = 'rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-secondary)]';

// ── sections ───────────────────────────────────────────────────────────────
function SoldList({ sold }) {
  const [open, setOpen] = useState(null);
  if (!sold.length) return <Empty text="ไม่มีรายการที่ตรงกับคำค้น" />;
  return (
    <ul className={`${panel} divide-y divide-[var(--border-light)]`}>
      {sold.map((row) => {
        const expanded = open === row.key;
        return (
          <li key={row.key}>
            <button
              onClick={() => setOpen(expanded ? null : row.key)}
              aria-expanded={expanded}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--bg-tertiary)]"
            >
              <span className="num w-10 shrink-0 text-right text-lg font-semibold text-[var(--text-primary)]">×{row.quantity}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-[var(--text-primary)]">{row.name}</span>
                <span className="block truncate text-xs text-[var(--text-muted)]">
                  {row.modifier ? `${row.modifier} · ` : ''}{row.category || 'ไม่มีหมวด'} · {row.bills} บิล
                </span>
              </span>
              <StatusPill status={row.status} />
              <span className="num hidden w-20 shrink-0 text-right text-sm text-[var(--text-secondary)] sm:block">{money(row.revenue)}</span>
              <ChevronDown size={16} className={`shrink-0 text-[var(--text-muted)] transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
            {expanded && (
              <div className="px-4 pb-4 pl-[4.25rem]">
                {row.stock.length ? (
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {row.stock.map((s) => (
                      <li key={s.stockId} className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm">
                        <span className="truncate text-[var(--text-secondary)]">{s.name}</span>
                        <span className="num shrink-0 text-[var(--text-primary)]">
                          {qtyText(s.total)} {s.unit}
                          <span className="ml-1 text-xs text-[var(--text-muted)]">({qtyText(s.perUnit)}/หน่วย)</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--state-warn)]">รายการนี้ไม่ได้ตัดสต็อกเลย</p>
                )}
                {row.deadLinks > 0 && (
                  <p className="mt-2 text-xs text-[var(--state-danger)]">มี {row.deadLinks} ลิงก์ในสูตรที่ชี้ไปสต็อกที่ถูกลบแล้ว (ไม่ถูกตัด)</p>
                )}
                {row.menuLinkedNow === false && (
                  <p className="mt-2 text-xs text-[var(--text-muted)]">ตอนนี้เมนูนี้ก็ยังไม่ได้ผูกสต็อก · ผูกได้ที่ "จัดการเมนู"</p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function StockUsedList({ rows }) {
  if (!rows.length) return <Empty text="ยังไม่มีสต็อกที่ถูกตัดในวันนี้" />;
  return (
    <div className={`${panel} overflow-hidden`}>
      <div className="hidden grid-cols-[minmax(0,1fr)_7rem_6rem_7rem] gap-3 border-b border-[var(--border-color)] bg-[var(--bg-tertiary)] px-4 py-2 text-xs font-medium text-[var(--text-muted)] sm:grid">
        <span>วัตถุดิบ · ใช้กับเมนู</span>
        <span className="text-right">ตัดไป</span>
        <span className="text-right">ต้นทุน</span>
        <span className="text-right">คงเหลือตอนนี้</span>
      </div>
      <ul className="divide-y divide-[var(--border-light)]">
        {rows.map((r) => (
          <li key={r.stockId} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_7rem_6rem_7rem] sm:items-center">
            <span className="min-w-0">
              <span className="block truncate font-medium text-[var(--text-primary)]">{r.name}</span>
              <span className="block truncate text-xs text-[var(--text-muted)]">
                {r.items.map((i) => `${i.name} ×${i.quantity}`).join(' · ')}
              </span>
            </span>
            <span className="num text-right text-[var(--text-primary)]">−{qtyText(r.used)} {r.unit}</span>
            <span className="num hidden text-right text-sm text-[var(--text-secondary)] sm:block">{money(r.cost)}</span>
            <span className={`num col-span-2 text-right text-sm sm:col-span-1 ${r.negative ? 'font-semibold text-[var(--state-danger)]' : r.low ? 'text-[var(--state-warn)]' : 'text-[var(--text-secondary)]'}`}>
              <span className="mr-1 text-xs text-[var(--text-muted)] sm:hidden">คงเหลือ</span>
              {qtyText(r.onHand)} {r.unit}
              {r.negative && ' · ติดลบ'}
              {r.low && ' · ใกล้หมด'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ISSUE_ICON = { error: AlertOctagon, warn: AlertTriangle, info: Info };

function IssueList({ issues, onFix }) {
  if (!issues.length) {
    return <Empty icon={CheckCircle2} tone="ok" text="ไม่มีจุดที่ต้องแก้ในวันนี้" />;
  }
  return (
    <ul className="grid gap-2">
      {issues.map((issue, idx) => {
        const tone = TONE[SEVERITY_TONE[issue.severity]];
        const Icon = ISSUE_ICON[issue.severity] || Info;
        const canFix = (issue.type?.startsWith('item_') && !issue.fixedNow) || issue.type === 'stock_negative';
        return (
          <li key={`${issue.type}-${issue.orderId || issue.stockId || ''}-${idx}`} className={`${panel} flex items-start gap-3 p-3`}>
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone.soft} ${tone.text}`}>
              <Icon size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">{issue.message}</p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {issue.queueNumber != null && `คิว ${issue.queueNumber} · `}
                {issue.time && `${issue.time} น.`}
                {issue.bills?.length > 1 && ` · และอีก ${issue.bills.length - 1} บิล`}
              </p>
              {issue.diffs?.length > 0 && (
                <ul className="mt-2 grid gap-1 text-xs">
                  {issue.diffs.map((d) => (
                    <li key={d.stockId} className="num text-[var(--text-secondary)]">
                      {d.name}: ควรตัด {qtyText(d.expected)} · ตัดจริง {qtyText(d.applied)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {canFix && (
              <button
                onClick={() => (issue.type === 'stock_negative' ? onFix('stock') : onFix('menu_manage', issue.menuId))}
                className="min-h-10 shrink-0 rounded-[var(--radius-sm)] border border-[var(--border-color)] px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
              >
                {issue.type === 'stock_negative' ? 'ไปสต็อก' : 'ไปผูกสต็อก'}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function MenuHealth({ links, negatives, onFix }) {
  const [filter, setFilter] = useState('attention');
  const rows = links.items.filter((i) => {
    if (filter === 'attention') return ['unlinked', 'dead', 'partial'].includes(i.status);
    if (filter === 'modifier_only') return i.status === 'modifier_only';
    return i.status === 'ok';
  });
  const { counts } = links;
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['ผูกครบ', counts.ok, 'ok'],
          ['ยังไม่ผูก', counts.unlinked, 'warn'],
          ['ลิงก์เสีย', counts.dead + counts.partial, 'bad'],
          ['ผูกแค่ตัวเลือก', counts.modifier_only, 'info'],
        ].map(([label, n, tone]) => (
          <div key={label} className={`${panel} p-3`}>
            <p className="text-xs text-[var(--text-muted)]">{label}</p>
            <p className={`num text-2xl font-semibold ${n ? TONE[tone].text : 'text-[var(--text-primary)]'}`}>{n}</p>
          </div>
        ))}
      </div>

      {links.modifiers.length > 0 && (
        <div className={`${panel} p-4`}>
          <p className="flex items-center gap-2 text-sm font-medium text-[var(--state-danger)]">
            <AlertOctagon size={16} /> ตัวเลือก (#) ที่สูตรชี้ไปสต็อกที่ถูกลบ · ขายแล้วของส่วนนี้ไม่ถูกตัด
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {links.modifiers.map((m) => (
              <span key={m.id} className="rounded-full bg-[var(--bg-tertiary)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">{m.name}</span>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">แก้ที่ "แอดมิน" → จัดการ #แท็กเมล็ดกาแฟ แล้วผูกสต็อกเมล็ด/ผงตัวใหม่</p>
        </div>
      )}

      {negatives.length > 0 && (
        <div className={`${panel} p-4`}>
          <p className="flex items-center gap-2 text-sm font-medium text-[var(--state-warn)]">
            <AlertTriangle size={16} /> สต็อกคงเหลือติดลบ {negatives.length} รายการ · ของเข้ายังไม่ได้ลง หรือสูตรใช้เกินจริง
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {negatives.map((s) => (
              <span key={s.id} className="num rounded-full bg-[var(--bg-tertiary)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                {s.name} {qtyText(s.quantity)} {s.unit}
              </span>
            ))}
          </div>
        </div>
      )}

      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { key: 'attention', label: 'ต้องแก้', count: links.needsAttention, tone: 'warn' },
          { key: 'modifier_only', label: 'ผูกแค่ตัวเลือก', count: counts.modifier_only },
          { key: 'ok', label: 'ผูกครบ', count: counts.ok },
        ]}
      />

      {rows.length ? (
        <ul className={`${panel} divide-y divide-[var(--border-light)]`}>
          {rows.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-[var(--text-primary)]">{m.name}</span>
                <span className="block truncate text-xs text-[var(--text-muted)]">
                  {m.category || 'ไม่มีหมวด'}
                  {m.soldCount > 0 && ` · ขายแล้ว ${m.soldCount.toLocaleString('th-TH')}`}
                  {m.alive.length > 0 && ` · ${m.alive.map((a) => a.name).join(', ')}`}
                  {m.dead.length > 0 && ` · ลิงก์เสีย ${m.dead.length}`}
                </span>
              </span>
              <StatusPill status={m.status} />
              {m.status !== 'ok' && (
                <button
                  onClick={() => onFix('menu_manage', m.id)}
                  className="hidden min-h-10 shrink-0 rounded-[var(--radius-sm)] border border-[var(--border-color)] px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] sm:block"
                >
                  ผูกสต็อก
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon={CheckCircle2} tone="ok" text="ไม่มีเมนูในกลุ่มนี้" />
      )}
    </div>
  );
}

function Empty({ text, icon: Icon = Package, tone = 'empty' }) {
  return (
    <div className={`${panel} flex flex-col items-center gap-2 px-4 py-10 text-center`}>
      <Icon size={28} className={TONE[tone].text} />
      <p className="text-sm text-[var(--text-secondary)]">{text}</p>
    </div>
  );
}

// ── view ───────────────────────────────────────────────────────────────────
export default function StockAuditView() {
  const { orders = [], stock = [], menu = [], beanModifiers = [], handleViewChange } = useAppContext();
  const today = getISODate();
  const [date, setDate] = useState(today);
  const [tab, setTab] = useState('sold');
  const [query, setQuery] = useState('');

  const audit = useMemo(() => auditDay({ orders, stock, menu, date }), [orders, stock, menu, date]);
  const week = useMemo(() => {
    const dates = Array.from({ length: 7 }, (_, i) => shiftDay(date > today ? today : date, i - 6));
    return auditDays({ orders, stock, menu, dates });
  }, [orders, stock, menu, date, today]);
  const links = useMemo(() => auditMenuLinks({ menu, stock, beanModifiers }), [menu, stock, beanModifiers]);
  const negatives = useMemo(() => negativeStock(stock), [stock]);

  const { summary, sold, stockUsed, issues } = audit;
  const verdict = VERDICT[summary.verdict];
  const vTone = TONE[verdict.tone];
  const VerdictIcon = verdict.icon;

  const q = query.trim().toLowerCase();
  const soldFiltered = q
    ? sold.filter((s) => `${s.name} ${s.modifier} ${s.category}`.toLowerCase().includes(q))
    : sold;
  const stockFiltered = q
    ? stockUsed.filter((s) => `${s.name} ${s.items.map((i) => i.name).join(' ')}`.toLowerCase().includes(q))
    : stockUsed;

  const actionable = issues.filter((i) => i.severity !== 'info').length;
  const goFix = (view, menuId) => {
    if (menuId) {
      try { sessionStorage.setItem('menuManage:focus', menuId); } catch { /* storage ปิด ก็แค่ไม่เปิดฟอร์มให้ */ }
    }
    handleViewChange?.(view);
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

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-32 pt-4 sm:px-6">
      {/* header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">สรุปการขาย & สต็อก</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">{longDate(date)}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            aria-label="วันก่อนหน้า"
            onClick={() => setDate(shiftDay(date, -1))}
            className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
          >
            <ChevronLeft size={18} />
          </button>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            aria-label="เลือกวันที่"
            className="num h-11 rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 text-sm text-[var(--text-primary)]"
          />
          <button
            aria-label="วันถัดไป"
            disabled={date >= today}
            onClick={() => setDate(shiftDay(date, 1))}
            className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-40"
          >
            <ChevronRight size={18} />
          </button>
          {date !== today && (
            <button
              onClick={() => setDate(today)}
              className="h-11 rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--accent-emerald)] hover:bg-[var(--bg-tertiary)]"
            >
              วันนี้
            </button>
          )}
        </div>
      </header>

      {/* 7-day strip */}
      <nav aria-label="7 วันล่าสุด" className="mt-4 grid grid-cols-7 gap-1.5">
        {week.map((d) => {
          const tone = TONE[d.verdict === 'empty' ? 'empty' : d.verdict];
          const { weekday, day } = dayLabel(d.date);
          const active = d.date === date;
          return (
            <button
              key={d.date}
              onClick={() => setDate(d.date)}
              aria-current={active ? 'date' : undefined}
              title={d.verdict === 'empty' ? 'ไม่มีบิล' : `ตัดครบ ${pct(d.accuracy)} · ${d.bills} บิล`}
              className={[
                'flex flex-col items-center gap-1 rounded-[var(--radius-sm)] border px-1 py-2 transition-colors',
                active
                  ? 'border-[var(--accent-emerald)] bg-[var(--bg-secondary)] shadow-[var(--elev-1)]'
                  : 'border-transparent bg-[var(--bg-tertiary)] hover:border-[var(--border-color)]',
              ].join(' ')}
            >
              <span className="text-xs text-[var(--text-muted)]">{weekday}</span>
              <span className="num text-base font-semibold text-[var(--text-primary)]">{day}</span>
              <span className={`h-1.5 w-6 rounded-full ${tone.bg}`} />
              <span className={`num text-[11px] ${tone.text}`}>{d.verdict === 'empty' ? '—' : pct(d.accuracy)}</span>
            </button>
          );
        })}
      </nav>

      {/* verdict */}
      <section className={`${panel} mt-4 overflow-hidden`}>
        <div className={`flex items-start gap-3 p-4 ${vTone.soft}`}>
          <VerdictIcon size={28} className={`shrink-0 ${vTone.text}`} />
          <div className="min-w-0 flex-1">
            <h2 className={`text-lg font-semibold ${vTone.text}`}>{verdict.title}</h2>
            {summary.verdict !== 'empty' && (
              <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                ตัดสต็อกตามสูตรได้ <b className="num">{pct(summary.accuracy)}</b> ของที่ขาย
                {summary.unitsUnlinked > 0 && ` · ไม่ได้ตัด ${summary.unitsUnlinked} หน่วยเพราะเมนูยังไม่ผูก`}
                {(summary.unitsDead + summary.unitsPartial) > 0 && ` · ${summary.unitsDead + summary.unitsPartial} หน่วยสูตรชี้ไปสต็อกที่ถูกลบ`}
                {summary.billsMissed > 0 && ` · ${summary.billsMissed} บิลเสร็จแต่ไม่ถูกตัด`}
                {summary.billsMismatch > 0 && ` · ${summary.billsMismatch} บิลตัดไม่ตรงสูตร`}
                {summary.waiting > 0 && ` · ${summary.waiting} บิลยังไม่เสร็จ (ยังไม่ตัด)`}
              </p>
            )}
          </div>
        </div>
        {summary.verdict !== 'empty' && (
          <>
            <div className="flex h-1.5 w-full bg-[var(--bg-tertiary)]" aria-hidden>
              <span className="bg-[var(--state-ok)]" style={{ width: pct((summary.unitsOk + summary.unitsModifierOnly) / summary.units) }} />
              <span className="bg-[var(--state-warn)]" style={{ width: pct((summary.unitsUnlinked + summary.unitsPartial) / summary.units) }} />
              <span className="bg-[var(--state-danger)]" style={{ width: pct(summary.unitsDead / summary.units) }} />
            </div>
            <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
              <Stat label="บิล" value={summary.bills.toLocaleString('th-TH')} sub={summary.billsRecorded ? `มีบันทึกการตัด ${summary.billsRecorded} บิล` : 'บิลเก่ายังไม่มีบันทึกการตัด'} />
              <Stat label="ขายได้" value={`${summary.units.toLocaleString('th-TH')} หน่วย`} sub={`${sold.length} เมนู`} />
              <Stat label="ยอดขาย" value={money(summary.revenue)} sub="หลังหักส่วนลด" />
              <Stat label="ต้นทุนวัตถุดิบที่ตัด" value={money(summary.cost)} sub={`${stockUsed.length} วัตถุดิบ`} />
            </div>
          </>
        )}
      </section>

      {/* tabs + search */}
      <div className="sticky top-0 z-10 -mx-4 mt-4 flex flex-wrap items-center gap-2 bg-[var(--bg-primary)]/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="min-w-0 basis-full md:basis-0 md:flex-1">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { key: 'sold', label: <><ShoppingBag size={15} /> ขายได้</>, count: sold.length },
              { key: 'stock', label: <><Package size={15} /> สต็อกที่ตัด</>, count: stockUsed.length },
              { key: 'issues', label: <><AlertTriangle size={15} /> ต้องแก้</>, count: actionable, tone: summary.errors ? 'bad' : 'warn' },
              { key: 'menu', label: <><Link2 size={15} /> ผูกสต็อก</>, count: links.needsAttention + links.modifiers.length, tone: 'warn' },
            ]}
          />
        </div>
        {(tab === 'sold' || tab === 'stock') && (
          <div className="flex w-full items-center gap-2 md:w-auto">
            <label className="relative min-w-0 flex-1 md:flex-none">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาเมนู/วัตถุดิบ"
                className="h-10 w-full rounded-[var(--radius-sm)] md:w-44 border border-[var(--border-color)] bg-[var(--bg-secondary)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
            </label>
            <button
              onClick={exportCsv}
              disabled={!sold.length}
              aria-label="ดาวน์โหลด CSV"
              className="flex h-10 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-40"
            >
              <Download size={15} /> CSV
            </button>
          </div>
        )}
      </div>

      <div className="mt-3">
        {tab === 'sold' && (summary.verdict === 'empty' ? <Empty icon={CalendarDays} text="วันนี้ยังไม่มีบิล" /> : <SoldList sold={soldFiltered} />)}
        {tab === 'stock' && <StockUsedList rows={stockFiltered} />}
        {tab === 'issues' && <IssueList issues={issues} onFix={goFix} />}
        {tab === 'menu' && <MenuHealth links={links} negatives={negatives} onFix={goFix} />}
      </div>
    </div>
  );
}
