import { Download } from 'lucide-react';
import { Button } from '../../ui';

/** Section heading used between blocks on the records screens. */
export function SectionHead({ title, description, actions, id }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 id={id} className="text-[length:var(--fs-lg)] leading-[var(--lh-lg)] font-semibold text-[var(--text-primary)]">{title}</h2>
        {description && <p className="text-sm leading-[var(--lh-sm)] text-[var(--text-muted)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CsvButton({ onClick, label = 'CSV' }) {
  return (
    <Button variant="secondary" leftIcon={<Download size={16} />} onClick={onClick}>
      {label}
    </Button>
  );
}

/** Horizontal share bar + label (0..100). */
export function ShareBar({ percent, tone = 'accent', label }) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const fill = tone === 'warn' ? 'bg-[var(--state-warn)]' : 'bg-[var(--accent)]';
  return (
    <span className="flex items-center gap-2 min-w-0">
      <span className="h-2 flex-1 min-w-12 rounded-full bg-[var(--bg-sunken)] overflow-hidden" aria-hidden="true">
        <span className={`block h-2 rounded-full ${fill}`} style={{ width: `${p}%` }} />
      </span>
      <span className="num w-12 shrink-0 text-right text-sm text-[var(--text-secondary)]">{label ?? `${Math.round(p)}%`}</span>
    </span>
  );
}

/**
 * One bar of a small column chart. The value label sits just above the bar and
 * the top 20px are reserved so the tallest bar never pushes its label out.
 */
export function ChartBar({ percent, valueLabel, label, tone = 'accent', title }) {
  const p = Math.max(3, Math.min(100, Number(percent) || 0));
  const fill = tone === 'warn' ? 'bg-[var(--state-warn)]' : 'bg-[var(--accent)]';
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col items-center gap-1" title={title}>
      <div className="relative w-full flex-1 mt-5">
        <span className="num absolute inset-x-0 text-center text-xs leading-4 text-[var(--text-muted)] whitespace-nowrap" style={{ bottom: `calc(${p}% + 4px)` }}>
          {valueLabel}
        </span>
        <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-14 rounded-t-[var(--radius-xs)] ${fill}`} style={{ height: `${p}%` }} />
      </div>
      <span className="text-xs leading-4 font-medium text-[var(--text-secondary)] whitespace-nowrap">{label}</span>
    </div>
  );
}
