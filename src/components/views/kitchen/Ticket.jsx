import { memo } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, CloudOff, Edit3, User } from 'lucide-react';
import { formatBaht } from '../../../utils/format';
import { ageMinutes, ageTone, ageLabel, AGE_COLOR } from './ticketAge';

const NEXT = {
  pending: { status: 'preparing', label: 'เริ่มปรุง', bg: 'var(--kds-age-10)' },
  preparing: { status: 'ready', label: 'เสร็จแล้ว', bg: 'var(--kds-info, #7CA7FF)' },
  ready: { status: 'completed', label: 'ส่งงาน/เช็คบิล', bg: 'var(--kds-age-ok)' },
};

/**
 * One KDS ticket. The header border and age badge take the age colour
 * (5 / 10 / 15 min). The next-status button is 64px tall.
 */
function Ticket({ order, status, now, hasRecipe, onUpdate, onCancel, onEdit, onRecipe }) {
  const mins = ageMinutes(order, now);
  const tone = ageTone(mins);
  const color = AGE_COLOR[tone];
  const next = NEXT[status];
  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      data-ticket={order.id}
      className="rounded-[var(--radius)] bg-[var(--kds-surface)] border border-[var(--kds-border)] overflow-hidden"
      style={{ borderTop: `4px solid ${color}` }}
    >
      <header className="flex items-center gap-3 px-4 pt-3 pb-2">
        <span className="num text-[length:var(--fs-3xl)] leading-[var(--lh-3xl)] font-semibold text-[var(--kds-text)]">#{Number(order.queueNumber)}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-[var(--kds-muted)] truncate">{String(order.table || 'Walk-in')}</span>
          {order.memberNickname && (
            <span className="flex items-center gap-1 text-sm text-[var(--kds-text)] truncate"><User size={14} className="shrink-0" />{order.memberNickname}</span>
          )}
        </span>
        <span className="shrink-0 flex flex-col items-end gap-1">
          <span className="px-2 py-0.5 rounded-full text-sm font-semibold" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }} data-ticket-age={tone}>
            {ageLabel(mins)}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${order.isPaid ? 'text-[var(--kds-age-ok)] bg-[color-mix(in_srgb,var(--kds-age-ok)_14%,transparent)]' : 'text-[var(--kds-age-5)] bg-[color-mix(in_srgb,var(--kds-age-5)_14%,transparent)]'}`}>
            {order.isPaid ? 'จ่ายแล้ว' : 'ยังไม่จ่าย'}
          </span>
        </span>
      </header>

      <ul className="px-4 py-1">
        {(order.items || []).map((item, idx) => (
          <li key={idx} className="py-2 border-t border-[var(--kds-border)] first:border-t-0">
            <div className="flex items-start gap-3">
              <button type="button" onClick={() => onRecipe(item)} aria-label={`ดูสูตร ${String(item.name)}`}
                className="flex-1 min-w-0 min-h-11 flex items-center gap-2 text-left text-lg font-semibold leading-normal text-[var(--kds-text)] hover:text-[var(--kds-age-ok)]">
                <span className="min-w-0">{String(item.name)}</span>
                <BookOpen size={16} className="shrink-0" style={{ color: hasRecipe(item.id) ? 'var(--kds-age-ok)' : 'var(--kds-border)' }} aria-hidden="true" />
              </button>
              <span className="num shrink-0 min-h-11 flex items-center text-xl font-semibold text-[var(--kds-text)]">×{Number(item.quantity)}</span>
            </div>
            {item.note && (
              <p className="mt-1 px-2 py-1 rounded-[var(--radius-xs)] text-sm font-medium leading-normal text-[var(--kds-age-5)] bg-[color-mix(in_srgb,var(--kds-age-5)_10%,transparent)]">{String(item.note)}</p>
            )}
          </li>
        ))}
      </ul>

      {order.hasPendingWrites && (
        // A write that reached the local cache but not the server yet. If this sticks
        // around, the change is NOT saved and can still be rolled back.
        <p className="mx-4 mb-2 flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] text-sm text-[var(--kds-age-10)] border border-[color-mix(in_srgb,var(--kds-age-10)_40%,transparent)]">
          <CloudOff size={16} className="shrink-0" /> ยังบันทึกไม่สำเร็จ
        </p>
      )}

      <footer className="px-4 pb-4 pt-2 space-y-3">
        <div className="flex items-center justify-between text-sm text-[var(--kds-muted)]">
          <span>สั่ง <span className="num">{String(order.time || '-')}</span> · <span className="num">{String(order.id).slice(-4).toUpperCase()}</span></span>
          <span className="num text-[var(--kds-text)]">{formatBaht(order.total)}</span>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => onEdit(order)} aria-label="แก้ไขออเดอร์"
            className="w-14 h-16 shrink-0 rounded-[var(--radius-sm)] flex items-center justify-center border border-[var(--kds-border)] text-[var(--kds-muted)] hover:text-[var(--kds-text)] hover:bg-[var(--kds-bg)]">
            <Edit3 size={20} />
          </button>
          <button type="button" onClick={() => onCancel(order.id)}
            className="w-16 h-16 shrink-0 rounded-[var(--radius-sm)] text-sm font-semibold border border-[color-mix(in_srgb,var(--kds-age-15)_45%,transparent)] text-[var(--kds-age-15)] hover:bg-[color-mix(in_srgb,var(--kds-age-15)_14%,transparent)]">
            ลบ
          </button>
          <button type="button" onClick={() => onUpdate(order.id, next.status)} data-next-status={next.status}
            className="flex-1 h-16 rounded-[var(--radius-sm)] text-lg font-semibold text-[var(--kds-bg)] active:scale-[0.98] transition-transform"
            style={{ background: next.bg }}>
            {next.label}
          </button>
        </div>
      </footer>
    </motion.article>
  );
}

export default memo(Ticket);
