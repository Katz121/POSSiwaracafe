import { ChevronRight } from 'lucide-react';

/**
 * ListRow · 56px+ row for phone lists (bills, stock, members) and settings lists.
 *
 * Props:
 *  leading?   node (avatar / icon tile)
 *  title      string | node
 *  subtitle?  string | node (muted)
 *  meta?      node (right column, e.g. <Money>)
 *  trailing?  node (after meta · defaults to a chevron when clickable)
 *  onClick?   makes the row a button
 *  selected?  --bg-selected
 *  disabled?
 */
export default function ListRow({
  leading,
  title,
  subtitle,
  meta,
  trailing,
  onClick,
  selected = false,
  disabled = false,
  className = '',
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      disabled={onClick ? disabled : undefined}
      aria-current={selected || undefined}
      className={`w-full text-left flex items-center gap-3 min-h-14 px-4 py-2 ${selected ? 'bg-[var(--bg-selected)]' : 'bg-[var(--bg-surface)]'} ${onClick ? 'hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-50' : ''} ${className}`}
    >
      {leading && <span className="shrink-0">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className="block font-medium leading-snug text-[var(--text-primary)] truncate">{title}</span>
        {subtitle && <span className="block text-sm leading-[var(--lh-sm)] text-[var(--text-muted)] truncate">{subtitle}</span>}
      </span>
      {meta && <span className="shrink-0 text-right">{meta}</span>}
      {trailing !== undefined ? trailing : onClick ? <ChevronRight size={18} className="shrink-0 text-[var(--text-muted)]" /> : null}
    </Tag>
  );
}
