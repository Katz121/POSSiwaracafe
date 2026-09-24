import { X } from 'lucide-react';

const TONE_DOT = {
  ok: 'bg-[var(--state-ok)]',
  warn: 'bg-[var(--state-warn)]',
  danger: 'bg-[var(--state-danger)]',
  info: 'bg-[var(--state-info)]',
};

/**
 * FilterChips · quick filters (ทั้งหมด · ค้างชำระ 3 · จ่ายแล้ว · QR).
 *
 * Props:
 *  chips     [{ value, label, count?, tone?: 'ok'|'warn'|'danger'|'info' }]
 *  value     single value, or an array for multi-select
 *  onChange  (nextValue) => void · array in multi mode (toggle), value in single mode
 *  onClear?  shows a "ล้างตัวกรอง" chip while something is selected
 *  ariaLabel
 *
 * Scrolls horizontally on phones (no wrapping, no page overflow).
 */
export default function FilterChips({
  chips = [],
  value,
  onChange,
  onClear,
  ariaLabel = 'ตัวกรอง',
  className = '',
}) {
  const multi = Array.isArray(value);
  const isOn = (v) => (multi ? value.includes(v) : value === v);
  const hasSelection = multi ? value.length > 0 : value != null && value !== '' && value !== 'all';

  const toggle = (v) => {
    if (!onChange) return;
    if (multi) onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
    else onChange(v);
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 py-0.5 max-w-full ${className}`}
    >
      {chips.map((chip) => {
        const on = isOn(chip.value);
        return (
          <button
            key={String(chip.value)}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(chip.value)}
            className={`shrink-0 inline-flex items-center gap-1.5 min-h-10 px-3.5 rounded-full border text-sm leading-snug whitespace-nowrap transition-colors duration-150 outline-none focus-visible:shadow-[var(--focus-ring)] ${
              on
                ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent-soft-fg)] font-semibold'
                : 'bg-[var(--bg-surface)] border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            {chip.tone && <span className={`w-2 h-2 rounded-full ${TONE_DOT[chip.tone] || ''}`} />}
            {chip.label}
            {chip.count != null && (
              <span className="num text-xs text-[var(--text-muted)]">{chip.count}</span>
            )}
          </button>
        );
      })}
      {onClear && hasSelection && (
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 inline-flex items-center gap-1 min-h-10 px-3 rounded-full text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <X size={14} /> ล้างตัวกรอง
        </button>
      )}
    </div>
  );
}
