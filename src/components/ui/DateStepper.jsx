import { useRef } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { formatThaiDate, addDaysISO, addMonthsISO, toISODateLocal } from '../../utils/format';

/**
 * DateStepper · ‹ [24 ก.ย. 2569] › + "วันนี้". Tapping the label opens the
 * native date/month picker. Buddhist-era display, ISO values.
 *
 * Props:
 *  value     'YYYY-MM-DD' (mode 'day') | 'YYYY-MM' (mode 'month')
 *  onChange  (iso) => void
 *  max?      ISO upper bound (default: today / this month) · pass null for no limit
 *  min?      ISO lower bound
 *  mode      'day' (default) | 'month'
 *  weekday?  show the weekday in day mode (default true)
 */
export default function DateStepper({
  value,
  onChange,
  max,
  min,
  mode = 'day',
  weekday = true,
  className = '',
}) {
  const inputRef = useRef(null);
  const todayISO = toISODateLocal(new Date());
  const current = mode === 'month' ? todayISO.slice(0, 7) : todayISO;
  const upper = max === undefined ? current : max;
  const val = value || current;

  const shift = (dir) => {
    const next = mode === 'month' ? addMonthsISO(val, dir) : addDaysISO(val, dir);
    if (upper && next > upper) return;
    if (min && next < min) return;
    onChange?.(next);
  };

  const canNext = !upper || (mode === 'month' ? addMonthsISO(val, 1) : addDaysISO(val, 1)) <= upper;
  const canPrev = !min || (mode === 'month' ? addMonthsISO(val, -1) : addDaysISO(val, -1)) >= min;
  const isCurrent = val === current;
  const label = mode === 'month'
    ? formatThaiDate(val, { style: 'month' })
    : formatThaiDate(val, { weekday });

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    try { el.showPicker?.(); } catch { el.focus(); el.click(); }
  };

  const btn = 'w-11 h-11 min-h-0 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed outline-none focus-visible:shadow-[var(--focus-ring)]';

  return (
    <div className={`inline-flex items-center gap-1 rounded-[var(--radius)] bg-[var(--bg-surface)] border border-[var(--border-strong)] p-0.5 ${className}`}>
      <button type="button" className={btn} onClick={() => shift(-1)} disabled={!canPrev} aria-label={mode === 'month' ? 'เดือนก่อน' : 'วันก่อน'}>
        <ChevronLeft size={20} />
      </button>
      <span className="relative">
        <button
          type="button"
          onClick={openPicker}
          className="inline-flex items-center gap-2 min-h-11 px-2 rounded-[var(--radius-sm)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)] whitespace-nowrap"
        >
          <CalendarDays size={16} className="text-[var(--text-muted)]" />
          <span className="num">{label}</span>
        </button>
        <input
          ref={inputRef}
          type={mode === 'month' ? 'month' : 'date'}
          value={val}
          max={upper || undefined}
          min={min || undefined}
          onChange={(e) => e.target.value && onChange?.(e.target.value)}
          tabIndex={-1}
          aria-hidden="true"
          className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
        />
      </span>
      <button type="button" className={btn} onClick={() => shift(1)} disabled={!canNext} aria-label={mode === 'month' ? 'เดือนถัดไป' : 'วันถัดไป'}>
        <ChevronRight size={20} />
      </button>
      {!isCurrent && (
        <button
          type="button"
          onClick={() => onChange?.(current)}
          className="min-h-11 px-3 rounded-[var(--radius-sm)] text-sm font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)] outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          {mode === 'month' ? 'เดือนนี้' : 'วันนี้'}
        </button>
      )}
    </div>
  );
}
