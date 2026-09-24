import { Badge } from '../../ui';
import { stockStatus } from './stockStatus';

/** Status pill for a stock row: ติดลบ / หมด (danger) · ใกล้หมด (warn) · พอ (ok). */
export default function StockStatusPill({ item, size = 'sm' }) {
  const status = stockStatus(item);
  return (
    <Badge tone={status.tone} size={size} dot className="shrink-0 whitespace-nowrap">
      {status.label}
    </Badge>
  );
}
