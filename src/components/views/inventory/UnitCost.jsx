import { formatBaht, formatNumber } from '../../../utils/format';

/**
 * Per-unit cost. Stock is often costed per gram/ml (฿0.0521), where the
 * 2-decimal Money format would read "฿0.05" and hide every change, so
 * sub-baht costs keep up to 4 decimals. Whole-baht and larger use formatBaht.
 */
function formatUnitCost(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1 || n === 0) return formatBaht(n);
  return `${n < 0 ? '-' : ''}฿${formatNumber(Math.abs(n), { maxDecimals: 4 })}`;
}

export default function UnitCost({ value, muted = false, className = '' }) {
  return (
    <span className={`num whitespace-nowrap ${muted ? 'text-[var(--text-muted)]' : ''} ${className}`}>{formatUnitCost(value)}</span>
  );
}
