import { Search, X } from 'lucide-react';

/**
 * Toolbar · search + filter chips + actions row. Sticky under a PageHeader
 * (top = --header-h) when `sticky` is set.
 *
 * Props:
 *  search?   { value, onChange(string), placeholder?, autoFocus? }  · onChange gets the STRING
 *  filters?  node (usually <FilterChips>)
 *  actions?  node (right side)
 *  sticky?   default false
 *  children? extra row content below
 */
export default function Toolbar({ search, filters, actions, sticky = false, className = '', children }) {
  return (
    <div
      className={`${sticky ? 'sticky top-[var(--header-h)] z-[99]' : ''} bg-[var(--bg-canvas)] px-[var(--page-pad)] py-3 flex flex-col gap-2 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {search && (
          <label className="relative flex-1 min-w-[12rem] max-w-md">
            <span className="sr-only">{search.placeholder || 'ค้นหา'}</span>
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            <input
              type="search"
              data-search-input
              value={search.value}
              onChange={(e) => search.onChange?.(e.target.value)}
              placeholder={search.placeholder || 'ค้นหา'}
              autoFocus={search.autoFocus}
              className="w-full min-h-11 pl-10 pr-10 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus-visible:shadow-[var(--focus-ring)] focus:border-[var(--accent)] [&::-webkit-search-cancel-button]:hidden"
            />
            {search.value && (
              <button
                type="button"
                aria-label="ล้างคำค้น"
                onClick={() => search.onChange?.('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 min-h-0 flex items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
              >
                <X size={16} />
              </button>
            )}
          </label>
        )}
        {actions && <div className="flex items-center gap-2 ml-auto">{actions}</div>}
      </div>
      {filters && <div className="min-w-0">{filters}</div>}
      {children}
    </div>
  );
}
