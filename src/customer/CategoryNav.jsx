// Sticky category chip bar for the customer QR page (see scrollSpy.js).
import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from './scrollSpy';

export function CategoryChips({ items, active, onSelect, ariaLabel }) {
  const barRef = useRef(null);

  // Keep the active chip visible inside the horizontally scrolling bar. Uses
  // the bar's own scrollTo (not scrollIntoView, which would also interrupt the
  // page's smooth scroll in Chromium-based in-app browsers).
  useEffect(() => {
    const bar = barRef.current;
    const chip = bar?.querySelector(`[data-chip="${CSS.escape(String(active))}"]`);
    if (!bar || !chip) return;
    const left = chip.offsetLeft - (bar.clientWidth - chip.offsetWidth) / 2;
    bar.scrollTo({ left: Math.max(0, left), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [active]);

  return (
    <nav aria-label={ariaLabel}>
      <div ref={barRef} className="flex gap-2 overflow-x-auto scrollbar-hide px-4 py-2 scroll-px-4">
        {items.map(({ key, label, count }) => {
          const isActive = key === active;
          return (
            <button
              key={key}
              type="button"
              data-chip={key}
              aria-current={isActive ? 'true' : undefined}
              onClick={() => onSelect(key)}
              className={`shrink-0 min-h-11 px-4 rounded-full text-sm font-semibold whitespace-nowrap transition-colors border ${
                isActive
                  ? 'bg-[var(--accent)] text-[var(--text-on-accent)] border-transparent'
                  : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-strong)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {label}
              {count != null && <span className={`ml-1.5 text-xs num ${isActive ? 'opacity-90' : 'text-[var(--text-muted)]'}`}>{count}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
