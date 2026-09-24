import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ClipboardCheck, ClipboardList } from 'lucide-react';
import { Badge, Banner, Button, EmptyState, Money, Skeleton, StatCard } from '../../ui';
import { formatNumber, formatTime } from '../../../utils/format';
import { summarizeCounts, varianceWords } from '../../../utils/stockCount';

const PANEL = 'rounded-[var(--radius)] bg-[var(--bg-surface)] shadow-[var(--elev-1)]';
const qty = (n) => formatNumber(n, { maxDecimals: 3 });

function VarianceRow({ c }) {
  const loss = Number(c.variance) < 0;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
      <div className="min-w-0 flex-1 basis-44">
        <p className="truncate font-semibold text-[var(--text-primary)]">{c.stockName}</p>
        <p className="num text-sm text-[var(--text-secondary)]">
          ในระบบ {qty(c.systemQty)} → นับได้ {qty(c.countedQty)} {c.unit}
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          {formatTime(c.countedAt)} น.{c.countedBy ? ` · ${c.countedBy}` : ''}{c.note ? ` · ${c.note}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <Badge tone={loss ? 'danger' : 'ok'} size="md" className="num">{varianceWords(c.variance, c.unit)}</Badge>
        <Money value={c.varianceCost} sign tone={loss ? 'danger' : 'ok'} className="text-sm font-semibold" />
      </div>
    </li>
  );
}

/**
 * "ตรวจนับ" tab of the stock audit page: what was physically counted on
 * `date`, how many matched, and the ฿ value of every difference.
 */
export default function CountAuditSection({ counts, loading, error, isToday, onStartCount }) {
  const s = useMemo(() => summarizeCounts(counts), [counts]);
  const [showMatched, setShowMatched] = useState(false);

  if (loading) {
    return <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height="4.5rem" rounded="lg" />)}</div>;
  }
  if (error) {
    return <Banner tone="danger" title="โหลดประวัติตรวจนับไม่ได้">ลองรีเฟรชหน้า ถ้ายังไม่ได้ให้แจ้งเจ้าของร้าน</Banner>;
  }
  if (!s.items) {
    return (
      <EmptyState
        size="sm"
        icon={ClipboardList}
        title={isToday ? 'วันนี้ยังไม่ได้ตรวจนับ' : 'วันนี้ไม่มีการตรวจนับ'}
        description={isToday ? 'นับของจริงที่ร้าน แล้วกดตรง/กรอกจำนวนในหน้าสต็อก' : undefined}
        actionLabel={isToday && onStartCount ? 'เริ่มตรวจนับ' : undefined}
        onAction={isToday ? onStartCount : undefined}
        className={PANEL}
      />
    );
  }

  const verdict = s.mismatched === 0
    ? { tone: 'ok', title: `ตรงทุกรายการ (${formatNumber(s.items)} รายการ)` }
    : { tone: s.totalCost < 0 ? 'warn' : 'info', title: `ไม่ตรง ${formatNumber(s.mismatched)} จาก ${formatNumber(s.items)} รายการ · ปรับยอดให้ตรงของจริงแล้ว` };

  return (
    <section aria-label="ผลตรวจนับ" className="flex flex-col gap-3">
      <Banner tone={verdict.tone} title={verdict.title}>
        {s.counters.length > 0 && <>ตรวจโดย {s.counters.map((c) => `${c.name} (${formatNumber(c.count)})`).join(', ')}</>}
        {s.recounts > 0 && <> · นับซ้ำ {formatNumber(s.recounts)} ครั้ง (ใช้ครั้งล่าสุด)</>}
      </Banner>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="ตรวจแล้ว" value={formatNumber(s.items)} unit="รายการ" icon={ClipboardCheck} />
        <StatCard label="ตรงกับของจริง" value={formatNumber(s.matched)} unit="รายการ" tone="ok" icon={CheckCircle2} />
        <StatCard label="ของขาด (มูลค่า)" value={<Money value={s.lossCost} />} tone={s.lossCost < 0 ? 'danger' : 'neutral'} hint="นับได้น้อยกว่าในระบบ" />
        <StatCard label="ส่วนต่างสุทธิ" value={<Money value={s.totalCost} sign />} hint={s.gainCost > 0 ? <>ของเกิน <Money value={s.gainCost} /></> : 'ขาด + เกิน รวมกัน'} />
      </div>

      {s.mismatchedRows.length > 0 && (
        <div className={PANEL}>
          <h3 className="px-4 pt-3 text-sm font-semibold text-[var(--text-secondary)]">รายการที่ไม่ตรง (เรียงตามมูลค่า)</h3>
          <ul className="divide-y divide-[var(--border-light)]">
            {s.mismatchedRows.map((c) => <VarianceRow key={c.id || `${c.stockId}-${c.countedAt}`} c={c} />)}
          </ul>
        </div>
      )}

      {s.matchedRows.length > 0 && (
        <div className={PANEL}>
          <Button
            variant="ghost"
            fullWidth
            onClick={() => setShowMatched((v) => !v)}
            aria-expanded={showMatched}
            rightIcon={<ChevronDown size={16} className={`transition-transform ${showMatched ? 'rotate-180' : ''}`} aria-hidden="true" />}
            className="justify-between"
          >
            ตรงกับของจริง {formatNumber(s.matchedRows.length)} รายการ
          </Button>
          {showMatched && (
            <ul className="divide-y divide-[var(--border-light)] pb-1">
              {s.matchedRows.map((c) => (
                <li key={c.id || c.stockId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 truncate text-[var(--text-primary)]">{c.stockName}</span>
                  <span className="num shrink-0 text-[var(--text-muted)]">
                    {qty(c.countedQty)} {c.unit} · {formatTime(c.countedAt)} น.{c.countedBy ? ` · ${c.countedBy}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
