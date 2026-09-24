import { memo, startTransition, useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { Badge, DataTable, Money } from '../../ui';
import { formatNumber } from '../../../utils/format';

/** Initial tile · neutral accent-soft surface (AA in both themes). */
export function MemberAvatar({ name, size = 40 }) {
  const initial = String(name || '').trim().charAt(0) || '?';
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="shrink-0 inline-flex items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-soft-fg)] font-semibold text-base"
    >
      {initial}
    </span>
  );
}

export function PointsBadge({ member, threshold, size = 'sm' }) {
  const points = Number(member.points || 0);
  const pending = Number(member.pendingPoints || 0);
  const canRedeem = points >= threshold;
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      <Badge tone={canRedeem ? 'accent' : 'neutral'} size={size} className="num">
        {formatNumber(points)} แต้ม{canRedeem ? ' · แลกได้' : ''}
      </Badge>
      {pending > 0 && <Badge tone="warn" size={size} className="num">รอ +{formatNumber(pending)}</Badge>}
    </span>
  );
}

const nameCell = (m) => (
  <span className="flex items-center gap-3 min-w-0">
    <MemberAvatar name={m.name} />
    <span className="min-w-0">
      <span className="block font-semibold text-[var(--text-primary)] truncate">{String(m.name || 'ไม่ระบุชื่อ')}</span>
      <span className="block text-sm text-[var(--text-muted)] num">{m.phone ? String(m.phone) : 'ไม่ระบุเบอร์'}</span>
    </span>
  </span>
);

// First paint shows this many rows; the rest render in a transition right
// after, so opening Members never blocks on ~300 rows at once.
const FIRST_PAINT_ROWS = 40;

/**
 * Member list · a DataTable on iPad/desktop, cards on phones. The whole row
 * opens the member sheet (favourites, history, edit, delete).
 */
function MemberTable({ rows, loading, threshold, onOpen, emptyState }) {
  const [limit, setLimit] = useState(FIRST_PAINT_ROWS);
  useEffect(() => {
    if (limit >= rows.length) return undefined;
    const t = setTimeout(() => startTransition(() => setLimit(Infinity)), 0);
    return () => clearTimeout(t);
  }, [limit, rows.length]);
  const visible = limit >= rows.length ? rows : rows.slice(0, limit);
  const columns = [
    { key: 'name', header: 'สมาชิก', render: (_, m) => nameCell(m), sortable: true, sortValue: (m) => String(m.name || '') },
    { key: 'visitCount', header: 'มาซื้อ (ครั้ง)', numeric: true, sortable: true, width: 120, render: (v) => formatNumber(v || 0) },
    { key: 'totalPurchases', header: 'ชิ้น', numeric: true, sortable: true, width: 96, render: (v) => formatNumber(v || 0) },
    { key: 'totalSpent', header: 'ยอดใช้จ่าย', numeric: true, sortable: true, width: 140, render: (v) => <Money value={v || 0} /> },
    { key: 'points', header: 'แต้ม', align: 'right', sortable: true, width: 190, sortValue: (m) => Number(m.points || 0), render: (_, m) => <PointsBadge member={m} threshold={threshold} /> },
  ];

  return (
    <DataTable
      caption="รายชื่อสมาชิก"
      columns={columns}
      rows={visible}
      rowKey={(m) => m.phone || m.id}
      onRowClick={onOpen}
      loading={loading}
      emptyState={emptyState || { title: 'ไม่มีข้อมูลสมาชิก', icon: Users }}
      renderCard={(m) => (
        <span className="flex items-start gap-3">
          <MemberAvatar name={m.name} />
          <span className="min-w-0 flex-1">
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0 font-semibold text-[var(--text-primary)] truncate">{String(m.name || 'ไม่ระบุชื่อ')}</span>
              <PointsBadge member={m} threshold={threshold} />
            </span>
            <span className="block text-sm text-[var(--text-muted)] num">{m.phone ? String(m.phone) : 'ไม่ระบุเบอร์'}</span>
            <span className="block text-sm text-[var(--text-secondary)] num">
              มา {formatNumber(m.visitCount || 0)} ครั้ง · {formatNumber(m.totalPurchases || 0)} ชิ้น · <Money value={m.totalSpent || 0} />
            </span>
          </span>
        </span>
      )}
    />
  );
}

export default memo(MemberTable);
