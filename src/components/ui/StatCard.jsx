import { isValidElement } from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import Skeleton from './Skeleton';
import { formatPercent } from '../../utils/format';

const TONE_ICON = {
  neutral: 'bg-[var(--bg-sunken)] text-[var(--text-secondary)]',
  ok: 'bg-[var(--state-ok-soft)] text-[var(--state-ok)]',
  warn: 'bg-[var(--state-warn-soft)] text-[var(--state-warn)]',
  danger: 'bg-[var(--state-danger-soft)] text-[var(--state-danger)]',
  info: 'bg-[var(--state-info-soft)] text-[var(--state-info)]',
};

/**
 * StatCard · KPI tile on a neutral surface. Colour lives only in the delta chip
 * and the icon, never in the card fill (spec §6).
 *
 * Props:
 *  label     string
 *  value     node · pass <Money value={n} /> for currency, or a number/string
 *  unit?     string shown after the value ("แก้ว", "บิล")
 *  delta?    { value:number (percent units), direction:'up'|'down', good:'up'|'down', label?:string }
 *            chip is green when direction === good, red otherwise
 *  hint?     node · small muted line under the value
 *  tone?     'neutral'|'ok'|'warn'|'danger'|'info' · icon tint (and value ink for warn/danger)
 *  icon?     lucide component or element
 *  onClick?  makes the card a button (e.g. deep-link into the detail)
 *  loading?  skeleton value
 */
export default function StatCard({
  label,
  value,
  unit,
  delta,
  hint,
  tone = 'neutral',
  icon: Icon,
  onClick,
  loading = false,
  className = '',
}) {
  const iconNode = !Icon ? null : isValidElement(Icon) ? Icon : <Icon size={18} strokeWidth={2} />;
  const Tag = onClick ? 'button' : 'div';
  const valueInk = tone === 'danger' ? 'text-[var(--state-danger)]' : tone === 'warn' ? 'text-[var(--state-warn)]' : 'text-[var(--text-primary)]';

  let deltaNode = null;
  if (delta && Number.isFinite(Number(delta.value))) {
    const good = delta.direction === (delta.good || 'up');
    const Arrow = delta.direction === 'down' ? ArrowDownRight : ArrowUpRight;
    deltaNode = (
      <span
        className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold num ${good ? 'bg-[var(--state-ok-soft)] text-[var(--state-ok)]' : 'bg-[var(--state-danger-soft)] text-[var(--state-danger)]'}`}
      >
        <Arrow size={14} />
        {formatPercent(Math.abs(Number(delta.value)), { digits: 1 })}
        {delta.label && <span className="font-normal ml-1 text-[var(--text-secondary)]">{delta.label}</span>}
      </span>
    );
  }

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`text-left w-full rounded-[var(--radius)] bg-[var(--bg-surface)] shadow-[var(--elev-1)] p-4 flex flex-col gap-2 min-w-0 ${onClick ? 'cursor-pointer hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)]' : ''} ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm leading-[var(--lh-sm)] text-[var(--text-secondary)] truncate">{label}</span>
        {iconNode && (
          <span className={`shrink-0 w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center ${TONE_ICON[tone] || TONE_ICON.neutral}`}>
            {iconNode}
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton height="2rem" width="60%" rounded="md" />
      ) : (
        <div className={`flex items-baseline gap-1.5 min-w-0 ${valueInk}`}>
          <span className="num text-[length:var(--fs-2xl)] leading-[var(--lh-2xl)] font-semibold truncate">{value}</span>
          {unit && <span className="text-sm text-[var(--text-muted)]">{unit}</span>}
        </div>
      )}
      {(deltaNode || hint) && (
        <div className="flex flex-wrap items-center gap-2 text-xs leading-[var(--lh-xs)] text-[var(--text-muted)]">
          {deltaNode}
          {hint && <span>{hint}</span>}
        </div>
      )}
    </Tag>
  );
}
