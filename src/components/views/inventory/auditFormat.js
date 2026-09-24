import { formatNumber, formatPercent } from '../../../utils/format';
import { roundQty } from '../../../utils/stockAudit';

/** Stock quantity as the audit shows it (3-dp rounding, up to 2 decimals). */
export const qtyText = (n) => formatNumber(roundQty(n), { maxDecimals: 2 });
/** 0..1 ratio → whole percent ("87%"). */
export const pct = (n) => formatPercent(Math.round((Number(n) || 0) * 100), { digits: 0 });
