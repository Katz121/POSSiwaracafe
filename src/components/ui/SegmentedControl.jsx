import { isValidElement, useRef } from 'react';

/**
 * SegmentedControl · one-of-N choice (วัน/เดือน/ทั้งหมด, paid state, PIN tabs…).
 *
 * Props:
 *  options    [{ value, label, icon?, count?, disabled? }]
 *  value      selected value
 *  onChange   (value) => void
 *  size       'md' (44px, default) | 'lg' (48px, POS option sheet)
 *  fullWidth  segments share the full width
 *  ariaLabel  label for the radiogroup
 *
 * Keyboard: arrow keys move + select (radiogroup pattern).
 */
export default function SegmentedControl({
  options = [],
  value,
  onChange,
  size = 'md',
  fullWidth = false,
  ariaLabel,
  className = '',
}) {
  const refs = useRef([]);
  const h = size === 'lg' ? 'min-h-12 text-base' : 'min-h-11 text-sm';

  const move = (from, dir) => {
    const n = options.length;
    for (let step = 1; step <= n; step += 1) {
      const idx = (from + dir * step + n) % n;
      if (!options[idx].disabled) {
        onChange?.(options[idx].value);
        refs.current[idx]?.focus();
        return;
      }
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`${fullWidth ? 'flex w-full' : 'inline-flex'} items-stretch gap-1 p-1 rounded-[var(--radius)] bg-[var(--bg-sunken)] ${className}`}
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={String(opt.value)}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active || (value === undefined && i === 0) ? 0 : -1}
            disabled={opt.disabled}
            onClick={() => onChange?.(opt.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i, 1); }
              if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i, -1); }
            }}
            className={`${fullWidth ? 'flex-1' : ''} ${h} inline-flex items-center justify-center gap-1.5 px-3 rounded-[var(--radius-sm)] font-medium leading-snug whitespace-nowrap transition-colors duration-150 outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-50 disabled:cursor-not-allowed ${
              active
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-[var(--elev-1)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {Icon && (isValidElement(Icon) ? Icon : <Icon size={16} />)}
            <span>{opt.label}</span>
            {opt.count > 0 && (
              <span className={`num text-xs rounded-full px-1.5 min-w-5 ${active ? 'bg-[var(--accent-soft)] text-[var(--accent-soft-fg)]' : 'bg-[var(--bg-surface)] text-[var(--text-secondary)]'}`}>
                {opt.count > 99 ? '99+' : opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
