import { isValidElement, useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronRight } from 'lucide-react';
import Skeleton from './Skeleton';
import EmptyState from './EmptyState';
import useMediaQuery from './useMediaQuery';

const BREAKPOINTS = { sm: '(min-width: 640px)', md: '(min-width: 768px)', lg: '(min-width: 1024px)' };

const cellValue = (col, row) => (col.render ? col.render(row[col.key], row) : row[col.key]);

/**
 * DataTable · spec §6. Sticky header on --bg-sunken, right-aligned tabular
 * numeric columns, no zebra, hover/selected tokens. Below `cardBreakpoint`
 * rows render as cards (renderCard, or a default card from the first 3 columns).
 *
 * Props:
 *  columns       [{ key, header, align?, width?, render?(value,row), numeric?, sortable?, sortValue?(row), hideOnCard? }]
 *  rows          array
 *  rowKey        string field name or (row) => key   (default 'id')
 *  onRowClick?   (row) => void
 *  selectedKey?  key of the selected row
 *  stickyHeader  default true (the scroll container is the nearest scrolling ancestor)
 *  density       'comfortable' (52px rows, default) | 'compact' (44px)
 *  emptyState?   node · or { title, description, icon }
 *  loading?      skeleton rows
 *  cardBreakpoint 'sm'|'md'|'lg'|false (default 'md'; false = always a table)
 *  renderCard?   (row) => node
 *  caption?      visually-hidden table caption for screen readers
 *  className
 */
export default function DataTable({
  columns = [],
  rows = [],
  rowKey = 'id',
  onRowClick,
  selectedKey,
  stickyHeader = true,
  density = 'comfortable',
  emptyState,
  loading = false,
  cardBreakpoint = 'md',
  renderCard,
  caption,
  className = '',
}) {
  const [sort, setSort] = useState({ key: null, dir: 'asc' });
  const wide = useMediaQuery(cardBreakpoint ? BREAKPOINTS[cardBreakpoint] || BREAKPOINTS.md : '(min-width: 0px)');
  const getKey = (row, i) => (typeof rowKey === 'function' ? rowKey(row) : row?.[rowKey]) ?? i;

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const pick = col?.sortValue || ((r) => r[sort.key]);
    return [...rows].sort((a, b) => {
      const av = pick(a);
      const bv = pick(b);
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'th');
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  const toggleSort = (col) => {
    if (!col.sortable) return;
    setSort((prev) => ({ key: col.key, dir: prev.key === col.key && prev.dir === 'asc' ? 'desc' : 'asc' }));
  };

  const rowH = density === 'compact' ? 'h-11' : 'h-[52px]';
  const pad = density === 'compact' ? 'px-3' : 'px-4';

  const empty = !loading && sorted.length === 0;
  let emptyNode = null;
  if (empty) {
    if (isValidElement(emptyState)) emptyNode = emptyState;
    else if (emptyState && typeof emptyState === 'object') emptyNode = <EmptyState size="sm" {...emptyState} />;
    else emptyNode = <EmptyState size="sm" title={typeof emptyState === 'string' ? emptyState : 'ยังไม่มีข้อมูล'} />;
  }

  // ── Card mode (phones) ──────────────────────────────────────────────
  if (!wide) {
    const cardCols = columns.filter((c) => !c.hideOnCard).slice(0, 3);
    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        {loading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height="4.5rem" rounded="lg" />)}
        {emptyNode}
        {!loading && sorted.map((row, i) => {
          const k = getKey(row, i);
          const selected = selectedKey != null && k === selectedKey;
          const Tag = onRowClick ? 'button' : 'div';
          return (
            <Tag
              key={k}
              type={onRowClick ? 'button' : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              aria-current={selected || undefined}
              className={`w-full text-left rounded-[var(--radius)] p-4 min-h-14 shadow-[var(--elev-1)] ${selected ? 'bg-[var(--bg-selected)]' : 'bg-[var(--bg-surface)]'} ${onRowClick ? 'hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)]' : ''}`}
            >
              {renderCard ? renderCard(row) : (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    {cardCols[0] && <div className="font-semibold text-[var(--text-primary)] truncate">{cellValue(cardCols[0], row)}</div>}
                    {cardCols[1] && (
                      <div className="text-sm text-[var(--text-muted)] truncate">
                        <span className="mr-1">{cardCols[1].header}:</span>
                        <span className={cardCols[1].numeric ? 'num' : ''}>{cellValue(cardCols[1], row)}</span>
                      </div>
                    )}
                  </div>
                  {cardCols[2] && <div className={`shrink-0 font-semibold ${cardCols[2].numeric ? 'num' : ''}`}>{cellValue(cardCols[2], row)}</div>}
                  {onRowClick && <ChevronRight size={18} className="shrink-0 text-[var(--text-muted)]" />}
                </div>
              )}
            </Tag>
          );
        })}
      </div>
    );
  }

  // ── Table mode ──────────────────────────────────────────────────────
  return (
    <div className={`rounded-[var(--radius)] bg-[var(--bg-surface)] shadow-[var(--elev-1)] ${className}`}>
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((col) => {
              const align = col.align || (col.numeric ? 'right' : 'left');
              const active = sort.key === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  style={col.width ? { width: col.width } : undefined}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={`${stickyHeader ? 'sticky top-0 z-[1]' : ''} bg-[var(--bg-sunken)] ${pad} h-11 text-xs font-semibold leading-normal text-[var(--text-secondary)] border-b border-[var(--border-color)] first:rounded-tl-[var(--radius)] last:rounded-tr-[var(--radius)] ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col)}
                      className={`inline-flex items-center gap-1 min-h-11 -my-3 px-1 -mx-1 outline-none focus-visible:shadow-[var(--focus-ring)] rounded ${align === 'right' ? 'flex-row-reverse' : ''}`}
                    >
                      {col.header}
                      {active ? (sort.dir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : null}
                    </button>
                  ) : col.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading && Array.from({ length: 5 }).map((_, i) => (
            <tr key={`sk-${i}`} className={rowH}>
              {columns.map((col) => (
                <td key={col.key} className={`${pad} border-b border-[var(--border-light)]`}><Skeleton height="1rem" rounded="md" /></td>
              ))}
            </tr>
          ))}
          {empty && (
            <tr><td colSpan={columns.length}>{emptyNode}</td></tr>
          )}
          {!loading && sorted.map((row, i) => {
            const k = getKey(row, i);
            const selected = selectedKey != null && k === selectedKey;
            return (
              <tr
                key={k}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row); } } : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                aria-selected={onRowClick ? selected : undefined}
                className={`${rowH} ${selected ? 'bg-[var(--bg-selected)]' : ''} ${onRowClick ? 'cursor-pointer hover:bg-[var(--bg-hover)] outline-none focus-visible:bg-[var(--bg-hover)]' : ''}`}
              >
                {columns.map((col) => {
                  const align = col.align || (col.numeric ? 'right' : 'left');
                  return (
                    <td
                      key={col.key}
                      className={`${pad} border-b border-[var(--border-light)] text-[var(--text-primary)] ${col.numeric ? 'num' : ''} ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}
                    >
                      {cellValue(col, row)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
