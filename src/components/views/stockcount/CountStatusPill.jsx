import { CheckCircle2, CircleDashed, History } from 'lucide-react';
import { Badge } from '../../ui';
import { formatThaiDate, formatTime } from '../../../utils/format';
import { countStatus } from '../../../utils/stockCount';

const ICON = { today: CheckCircle2, recent: History, stale: History, never: CircleDashed };

/** "ตรวจแล้ววันนี้" (ok) · "ตรวจเมื่อ 3 วันก่อน" · "ยังไม่เคยตรวจ" for a stock row. */
export default function CountStatusPill({ item, today, size = 'sm', className = '' }) {
  const s = countStatus(item, today);
  const Icon = ICON[s.key];
  const when = item?.lastCountedAt
    ? `ตรวจนับล่าสุด ${formatThaiDate(item.lastCountedAt)} ${formatTime(item.lastCountedAt)} น.${item.lastCountedBy ? ` โดย ${item.lastCountedBy}` : ''}`
    : 'ยังไม่เคยตรวจนับ';
  return (
    <Badge tone={s.tone} size={size} title={when} icon={<Icon size={12} aria-hidden="true" />} className={`shrink-0 whitespace-nowrap ${className}`}>
      {s.label}
    </Badge>
  );
}
