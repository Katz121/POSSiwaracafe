import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { formatNumber } from '../../utils/format';

/**
 * NumberStepper · −/+ with a tappable value that turns into a keypad input.
 *
 * Props:
 *  value     number
 *  onChange  (nextNumber) => void · called per tap (callers keep their own handler semantics)
 *  step      default 1
 *  min?      lower bound (buttons disable at the bound)
 *  max?      upper bound
 *  unit?     shown after the value ("กก.", "แก้ว")
 *  size      'md' (44px) | 'lg' (48px, default)
 *  disabled?
 *  ariaLabel label for the value (e.g. item name)
 */
export default function NumberStepper({
  value,
  onChange,
  step = 1,
  min,
  max,
  unit,
  size = 'lg',
  disabled = false,
  ariaLabel = 'จำนวน',
  className = '',
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const n = Number(value) || 0;
  const dim = size === 'md' ? 'w-11 h-11' : 'w-12 h-12';
  const clamp = (x) => {
    let v = x;
    if (min !== undefined && v < min) v = min;
    if (max !== undefined && v > max) v = max;
    return Math.round(v * 1000) / 1000;
  };

  const commit = () => {
    setEditing(false);
    const parsed = Number(String(draft).replace(/,/g, ''));
    if (draft !== '' && Number.isFinite(parsed) && parsed !== n) onChange?.(clamp(parsed));
  };

  const btn = `${dim} min-h-0 shrink-0 flex items-center justify-center rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed outline-none focus-visible:shadow-[var(--focus-ring)]`;

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <button
        type="button"
        className={btn}
        aria-label={`ลด${ariaLabel}`}
        disabled={disabled || (min !== undefined && n <= min)}
        onClick={() => onChange?.(clamp(n - step))}
      >
        <Minus size={18} />
      </button>
      {editing ? (
        <input
          type="text"
          inputMode="decimal"
          autoFocus
          aria-label={ariaLabel}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
          }}
          className={`num ${size === 'md' ? 'h-11' : 'h-12'} w-20 text-center rounded-[var(--radius-sm)] border border-[var(--accent)] bg-[var(--bg-surface)] text-[var(--text-primary)] outline-none shadow-[var(--focus-ring)]`}
        />
      ) : (
        <button
          type="button"
          disabled={disabled}
          aria-label={`${ariaLabel} ${formatNumber(n, { maxDecimals: 3 })}${unit ? ` ${unit}` : ''} แตะเพื่อพิมพ์`}
          onClick={() => { setDraft(String(n)); setEditing(true); }}
          className={`num ${size === 'md' ? 'h-11' : 'h-12'} min-w-16 px-2 rounded-[var(--radius-sm)] text-center font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)]`}
        >
          {formatNumber(n, { maxDecimals: 3 })}
          {unit && <span className="ml-1 text-xs font-normal text-[var(--text-muted)]">{unit}</span>}
        </button>
      )}
      <button
        type="button"
        className={btn}
        aria-label={`เพิ่ม${ariaLabel}`}
        disabled={disabled || (max !== undefined && n >= max)}
        onClick={() => onChange?.(clamp(n + step))}
      >
        <Plus size={18} />
      </button>
    </div>
  );
}
