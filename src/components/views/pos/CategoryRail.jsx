import { memo } from 'react';
import { Coffee, Star } from 'lucide-react';

/**
 * Category picker. `vertical` = fixed 88px rail beside the grid (≥768px) with
 * two-line labels; otherwise a horizontally scrolling chip row (phones).
 * Pure presentation: `onSelect(category)`.
 */
function CategoryRail({ categories, active, onSelect, vertical = false }) {
  if (vertical) {
    return (
      <nav aria-label="หมวดหมู่เมนู" className="w-[88px] shrink-0 h-full overflow-y-auto scrollbar-hide border-r border-[var(--border-color)] bg-[var(--bg-surface)] py-2 px-1.5 flex flex-col gap-1">
        {categories.map((cat) => {
          const on = cat === active;
          const Icon = cat === 'แนะนำ' ? Star : Coffee;
          return (
            <button
              key={cat}
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(cat)}
              className={`w-full min-h-16 px-1 py-2 rounded-[var(--radius-sm)] flex flex-col items-center justify-center gap-1 text-center outline-none focus-visible:shadow-[var(--focus-ring)] transition-colors duration-100 ${
                on
                  ? 'bg-[var(--accent-soft)] text-[var(--accent-soft-fg)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              <Icon size={20} strokeWidth={on ? 2.25 : 1.75} fill={on && cat === 'แนะนำ' ? 'currentColor' : 'none'} />
              <span className="text-[13px] leading-[18px] line-clamp-2 break-words w-full">{cat}</span>
            </button>
          );
        })}
      </nav>
    );
  }
  return (
    <nav aria-label="หมวดหมู่เมนู" className="flex gap-2 overflow-x-auto scrollbar-hide px-4 py-2 shrink-0 scroll-fade-x">
      {categories.map((cat) => {
        const on = cat === active;
        return (
          <button
            key={cat}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(cat)}
            className={`shrink-0 min-h-11 px-4 rounded-full border text-sm whitespace-nowrap outline-none focus-visible:shadow-[var(--focus-ring)] ${
              on
                ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent-soft-fg)] font-semibold'
                : 'bg-[var(--bg-surface)] border-[var(--border-strong)] text-[var(--text-secondary)]'
            }`}
          >
            {cat}
          </button>
        );
      })}
    </nav>
  );
}

export default memo(CategoryRail);
