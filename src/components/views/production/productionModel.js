// Plain helpers for the production screens (kept out of .jsx for fast refresh).
import { getStockCategory } from '../../../config/constants';
import { formatNumber } from '../../../utils/format';
import { isPrep } from '../../../utils/production';

export const FIELD = 'w-full min-h-11 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus-visible:shadow-[var(--focus-ring)]';
export const LABEL = 'mb-1.5 block text-sm font-semibold text-[var(--text-primary)]';
export const PANEL = 'rounded-[var(--radius)] bg-[var(--bg-surface)] shadow-[var(--elev-1)]';

export const qty = (n) => formatNumber(n, { maxDecimals: 3 });

/** SearchSelect groups: ของเตรียม first, then by stock category, Thai order. */
export function stockGroups(stock, excludeIds = []) {
  const skip = new Set(excludeIds);
  const byCat = new Map();
  [...stock]
    .filter((s) => !skip.has(s.id))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'th'))
    .forEach((s) => {
      const c = isPrep(s) ? 'ของเตรียม (ทำเอง)' : getStockCategory(s);
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c).push(s);
    });
  const entries = [...byCat.entries()];
  entries.sort(([a], [b]) => (a.startsWith('ของเตรียม') ? -1 : b.startsWith('ของเตรียม') ? 1 : 0));
  return entries;
}

