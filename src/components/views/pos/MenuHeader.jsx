import { memo } from 'react';
import { Search, X, Flame, Zap, LayoutGrid, List } from 'lucide-react';
import { SegmentedControl } from '../../ui';

const DENSITY_OPTIONS = [
  { value: 'grid', label: 'รูปใหญ่', icon: LayoutGrid },
  { value: 'list', label: 'รายการ', icon: List },
];
const SEARCH_ICON = <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />;
const CLEAR_ICON = <X size={16} />;
const RUSH = (
  <span className="hidden sm:inline-flex shrink-0 items-center gap-1 px-3 h-8 rounded-full border border-[var(--border-color)] text-sm text-[var(--text-secondary)]">
    <Flame size={14} /> Rush Hour
  </span>
);

/** Search + density toggle + section heading. Memoised: untouched by cart taps. */
function MenuHeader({ searchTerm, onSearch, density, onDensity, title, count, promotion, onClearPromotion }) {
  return (
    <>
      <div className="shrink-0 px-4 md:px-5 pt-2 lg:pt-4 pb-2 flex items-center gap-2">
        <label className="relative flex-1 min-w-0">
          <span className="sr-only">ค้นหาเมนู</span>
          {SEARCH_ICON}
          <input
            type="search"
            data-search-input
            placeholder="ค้นหาเมนู"
            value={searchTerm}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full h-12 pl-10 pr-10 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus-visible:shadow-[var(--focus-ring)] [&::-webkit-search-cancel-button]:hidden"
          />
          {searchTerm && (
            <button type="button" aria-label="ล้างคำค้น" onClick={() => onSearch('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
              {CLEAR_ICON}
            </button>
          )}
        </label>
        <div className="hidden sm:block shrink-0">
          <SegmentedControl options={DENSITY_OPTIONS} value={density} onChange={onDensity} ariaLabel="มุมมองเมนู" />
        </div>
      </div>
      <div className="shrink-0 px-4 md:px-5 pb-2 flex items-center gap-2 min-h-11">
        <h1 className="min-w-0 truncate text-[length:var(--fs-lg)] leading-[var(--lh-lg)] font-semibold text-[var(--text-primary)]">{title}</h1>
        <span className="shrink-0 text-sm text-[var(--text-muted)]"><span className="num">{count}</span> เมนู</span>
        <span className="flex-1" />
        {promotion ? (
          <span className="shrink-0 inline-flex items-center gap-1 pl-3 rounded-full bg-[var(--accent-soft)] text-[var(--accent-soft-fg)] text-sm font-medium">
            <Zap size={14} /> <span className="truncate max-w-[160px]">{promotion.title}</span>
            <button type="button" onClick={onClearPromotion} aria-label="ปิดโปรโมชั่น"
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[var(--bg-hover)]">{CLEAR_ICON}</button>
          </span>
        ) : RUSH}
      </div>
    </>
  );
}

export default memo(MenuHeader);
