// Tab bodies of StockAuditView (moved out of the view, restyled with v2
// tokens/components). Data shapes come straight from utils/stockAudit.js.
import { useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronDown, Info, Link2, Link2Off, Package } from 'lucide-react';
import { Badge, Banner, Button, DataTable, EmptyState, FilterChips, Money, StatCard } from '../../ui';
import { formatNumber } from '../../../utils/format';
import { STATUS_LABEL } from '../../../utils/stockAudit';
import { qtyText } from './auditFormat';

const PANEL = 'rounded-[var(--radius)] bg-[var(--bg-surface)] shadow-[var(--elev-1)]';
const STATUS_TONE = { ok: 'ok', modifier_only: 'info', partial: 'warn', unlinked: 'warn', dead: 'danger' };

export function LinkStatusPill({ status }) {
  return (
    <Badge tone={STATUS_TONE[status] || 'neutral'} className="shrink-0" icon={status === 'ok' ? <Link2 size={12} /> : <Link2Off size={12} />}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function AuditEmpty({ text, icon = Package, tone = 'neutral' }) {
  return <EmptyState size="sm" icon={icon} tone={tone} title={text} className={PANEL} />;
}

// ── ขายได้ ──────────────────────────────────────────────────────────────────
export function SoldList({ sold }) {
  const [open, setOpen] = useState(null);
  if (!sold.length) return <AuditEmpty icon="search" text="ไม่มีรายการที่ตรงกับคำค้น" />;
  return (
    <ul className={`${PANEL} divide-y divide-[var(--border-light)]`}>
      {sold.map((row) => {
        const expanded = open === row.key;
        return (
          <li key={row.key}>
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : row.key)}
              aria-expanded={expanded}
              className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)] first:rounded-t-[var(--radius)] last:rounded-b-[var(--radius)]"
            >
              <span className="num w-10 shrink-0 text-right text-lg font-semibold text-[var(--text-primary)]">×{formatNumber(row.quantity)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-[var(--text-primary)]">{row.name}</span>
                <span className="block truncate text-xs text-[var(--text-muted)]">
                  {row.modifier ? `${row.modifier} · ` : ''}{row.category || 'ไม่มีหมวด'} · {formatNumber(row.bills)} บิล
                </span>
              </span>
              <LinkStatusPill status={row.status} />
              <Money value={row.revenue} className="hidden w-24 shrink-0 text-right text-sm text-[var(--text-secondary)] sm:block" />
              <ChevronDown size={16} className={`shrink-0 text-[var(--text-muted)] transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {expanded && (
              <div className="px-4 pb-4 sm:pl-[4.25rem]">
                <p className="mb-2 text-sm text-[var(--text-secondary)] sm:hidden">ยอดขาย <Money value={row.revenue} /></p>
                {row.stock.length ? (
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {row.stock.map((s) => (
                      <li key={s.stockId} className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] px-3 py-2 text-sm">
                        <span className="min-w-0 truncate text-[var(--text-secondary)]">{s.name}</span>
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
                  <p className="mt-2 text-sm text-[var(--state-danger)]">มี {row.deadLinks} ลิงก์ในสูตรที่ชี้ไปสต็อกที่ถูกลบแล้ว (ไม่ถูกตัด)</p>
                )}
                {row.menuLinkedNow === false && (
                  <p className="mt-2 text-sm text-[var(--text-muted)]">ตอนนี้เมนูนี้ก็ยังไม่ได้ผูกสต็อก · ผูกได้ที่ "จัดการเมนู"</p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ── สต็อกที่ตัด ─────────────────────────────────────────────────────────────
function OnHand({ r }) {
  const tone = r.negative ? 'text-[var(--state-danger)] font-semibold' : r.low ? 'text-[var(--state-warn)]' : 'text-[var(--text-secondary)]';
  return (
    <span className={`num whitespace-nowrap ${tone}`}>
      {qtyText(r.onHand)} {r.unit}
      {r.negative && ' · ติดลบ'}
      {r.low && ' · ใกล้หมด'}
    </span>
  );
}

export function StockUsedList({ rows }) {
  const columns = [
    {
      key: 'name',
      header: 'วัตถุดิบ · ใช้กับเมนู',
      render: (_, r) => (
        <div className="min-w-0 py-1.5">
          <p className="truncate font-medium text-[var(--text-primary)]">{r.name}</p>
          <p className="truncate text-xs text-[var(--text-muted)]">{r.items.map((i) => `${i.name} ×${i.quantity}`).join(' · ')}</p>
        </div>
      ),
    },
    { key: 'used', header: 'ตัดไป', numeric: true, width: 130, render: (_, r) => <span className="whitespace-nowrap">−{qtyText(r.used)} {r.unit}</span> },
    { key: 'cost', header: 'ต้นทุน', numeric: true, width: 100, render: (v) => <Money value={v} muted /> },
    { key: 'onHand', header: 'คงเหลือตอนนี้', numeric: true, width: 160, render: (_, r) => <OnHand r={r} /> },
  ];
  return (
    <DataTable
      caption="สต็อกที่ถูกตัดในวันนี้"
      columns={columns}
      rows={rows}
      rowKey="stockId"
      density="compact"
      emptyState={<AuditEmpty text="ยังไม่มีสต็อกที่ถูกตัดในวันนี้" />}
      renderCard={(r) => (
        <div className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 font-medium text-[var(--text-primary)]">{r.name}</p>
            <span className="num shrink-0 font-semibold text-[var(--text-primary)]">−{qtyText(r.used)} {r.unit}</span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">{r.items.map((i) => `${i.name} ×${i.quantity}`).join(' · ')}</p>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-[var(--text-muted)]">คงเหลือ <OnHand r={r} /></span>
            <Money value={r.cost} muted />
          </div>
        </div>
      )}
    />
  );
}

// ── ต้องแก้ ────────────────────────────────────────────────────────────────
const SEVERITY_TONE = { error: 'danger', warn: 'warn', info: 'info' };
const ISSUE_ICON = { error: AlertOctagon, warn: AlertTriangle, info: Info };

export function IssueList({ issues, onFix }) {
  if (!issues.length) return <AuditEmpty icon={CheckCircle2} tone="ok" text="ไม่มีจุดที่ต้องแก้ในวันนี้" />;
  return (
    <ul className="grid grid-cols-1 gap-2">
      {issues.map((issue, idx) => {
        const canFix = (issue.type?.startsWith('item_') && !issue.fixedNow) || issue.type === 'stock_negative';
        const meta = [
          issue.queueNumber != null ? `คิว ${issue.queueNumber}` : null,
          issue.time ? `${issue.time} น.` : null,
          issue.bills?.length > 1 ? `และอีก ${issue.bills.length - 1} บิล` : null,
        ].filter(Boolean).join(' · ');
        return (
          <li key={`${issue.type}-${issue.orderId || issue.stockId || ''}-${idx}`}>
            <Banner
              compact
              tone={SEVERITY_TONE[issue.severity] || 'info'}
              icon={ISSUE_ICON[issue.severity] || Info}
              title={issue.message}
              action={canFix ? {
                label: issue.type === 'stock_negative' ? 'ไปสต็อก' : 'ไปผูกสต็อก',
                onClick: () => (issue.type === 'stock_negative' ? onFix('stock') : onFix('menu_manage', issue.menuId)),
              } : undefined}
            >
              {(meta || issue.diffs?.length > 0) && (
                <>
                  {meta && <span className="block">{meta}</span>}
                  {issue.diffs?.length > 0 && (
                    <ul className="mt-1 grid gap-0.5">
                      {issue.diffs.map((d) => (
                        <li key={d.stockId} className="num">{d.name}: ควรตัด {qtyText(d.expected)} · ตัดจริง {qtyText(d.applied)}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </Banner>
          </li>
        );
      })}
    </ul>
  );
}

// ── ผูกสต็อก ───────────────────────────────────────────────────────────────
export function MenuHealth({ links, negatives, onFix }) {
  const [filter, setFilter] = useState('attention');
  const rows = links.items.filter((i) => {
    if (filter === 'attention') return ['unlinked', 'dead', 'partial'].includes(i.status);
    if (filter === 'modifier_only') return i.status === 'modifier_only';
    return i.status === 'ok';
  });
  const { counts } = links;
  const broken = counts.dead + counts.partial;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="ผูกครบ" value={formatNumber(counts.ok)} unit="เมนู" tone={counts.ok ? 'ok' : 'neutral'} icon={Link2} />
        <StatCard label="ยังไม่ผูก" value={formatNumber(counts.unlinked)} unit="เมนู" tone={counts.unlinked ? 'warn' : 'neutral'} icon={Link2Off} />
        <StatCard label="ลิงก์เสีย" value={formatNumber(broken)} unit="เมนู" tone={broken ? 'danger' : 'neutral'} icon={AlertOctagon} />
        <StatCard label="ผูกแค่ตัวเลือก" value={formatNumber(counts.modifier_only)} unit="เมนู" tone="info" icon={Info} />
      </div>

      {links.modifiers.length > 0 && (
        <Banner tone="danger" title="ตัวเลือก (#) ที่สูตรชี้ไปสต็อกที่ถูกลบ · ขายแล้วของส่วนนี้ไม่ถูกตัด">
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {links.modifiers.map((m) => <Badge key={m.id} tone="neutral">{m.name}</Badge>)}
          </span>
          <span className="mt-1.5 block">แก้ที่ "ตั้งค่าร้าน" → ตัวเลือกเมนู แล้วผูกสต็อกเมล็ด/ผงตัวใหม่</span>
        </Banner>
      )}

      {negatives.length > 0 && (
        <Banner
          tone="warn"
          title={`สต็อกคงเหลือติดลบ ${negatives.length} รายการ · ของเข้ายังไม่ได้ลง หรือสูตรใช้เกินจริง`}
          action={{ label: 'ไปรับของเข้า', onClick: () => onFix('stock') }}
        >
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {negatives.map((s) => <Badge key={s.id} tone="neutral" className="num">{s.name} {qtyText(s.quantity)} {s.unit}</Badge>)}
          </span>
        </Banner>
      )}

      <FilterChips
        className="[&>button]:min-h-11"
        ariaLabel="สถานะการผูกสต็อก"
        value={filter}
        onChange={setFilter}
        chips={[
          { value: 'attention', label: 'ต้องแก้', count: links.needsAttention, tone: links.needsAttention ? 'warn' : undefined },
          { value: 'modifier_only', label: 'ผูกแค่ตัวเลือก', count: counts.modifier_only },
          { value: 'ok', label: 'ผูกครบ', count: counts.ok },
        ]}
      />

      {rows.length ? (
        <ul className={`${PANEL} divide-y divide-[var(--border-light)]`}>
          {rows.map((m) => (
            <li key={m.id} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-[var(--text-primary)]">{m.name}</span>
                <span className="block truncate text-xs text-[var(--text-muted)]">
                  {m.category || 'ไม่มีหมวด'}
                  {m.soldCount > 0 && ` · ขายแล้ว ${formatNumber(m.soldCount)}`}
                  {m.alive.length > 0 && ` · ${m.alive.map((a) => a.name).join(', ')}`}
                  {m.dead.length > 0 && ` · ลิงก์เสีย ${m.dead.length}`}
                </span>
              </span>
              <LinkStatusPill status={m.status} />
              {m.status !== 'ok' && (
                <Button variant="secondary" className="shrink-0" onClick={() => onFix('menu_manage', m.id)}>
                  ผูกสต็อก
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <AuditEmpty icon={CheckCircle2} tone="ok" text="ไม่มีเมนูในกลุ่มนี้" />
      )}
    </div>
  );
}
