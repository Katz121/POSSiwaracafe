import { useState } from 'react';
import { Edit, ShoppingBag, Trash2, UserMinus } from 'lucide-react';
import { Button, EmptyState, Money, SegmentedControl, Sheet } from '../../ui';
import { formatNumber, formatThaiDate, formatTime, toDate } from '../../../utils/format';
import { MemberAvatar, PointsBadge } from './MemberTable';
import DangerButton from './DangerButton';

const REASON_LABELS = {
  order: 'ออเดอร์', review: 'รีวิว', redeem: 'แลกแต้ม', manual: 'ปรับด้วยมือ', recalc: 'ปรับปรุง',
  rejected: 'ปฏิเสธแต้ม', expire: 'แต้มหมดอายุ', 'bill-edit': 'ปรับตามการแก้บิล', 'redeem-refund': 'คืนแต้ม',
};

const orderWhen = (order) => {
  const d = toDate(order.timestamp || order.createdAt || order.date);
  return d ? `${formatThaiDate(d, { style: 'short' })} · ${formatTime(d)}` : 'ไม่ทราบวันที่';
};

function MiniStat({ label, children }) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] px-3 py-2.5 min-w-0">
      <p className="text-xs leading-[var(--lh-xs)] text-[var(--text-muted)]">{label}</p>
      <p className="text-lg font-semibold text-[var(--text-primary)] num truncate">{children}</p>
    </div>
  );
}

function Favorites({ favorites }) {
  if (favorites.length === 0) return <EmptyState size="sm" icon={ShoppingBag} title="ยังไม่มีประวัติการสั่งซื้อ" />;
  return (
    <ol className="flex flex-col gap-2">
      {favorites.slice(0, 10).map((item, idx) => (
        <li key={item.name} className="flex items-center gap-3 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-color)] p-2.5">
          <span className={`w-7 shrink-0 text-center text-sm font-semibold num ${idx < 3 ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>{idx + 1}</span>
          <span className="w-12 h-12 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] flex items-center justify-center">
            {item.image ? (
              <img src={item.image} alt="" width={48} height={48} loading="lazy" decoding="async" className="w-full h-full object-cover" />
            ) : <ShoppingBag size={20} className="text-[var(--text-muted)]" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-[var(--text-primary)] truncate">{item.name}</span>
            <span className="block text-sm text-[var(--text-muted)] truncate">{item.category || 'ไม่ระบุหมวดหมู่'}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block font-semibold text-[var(--text-primary)] num">{formatNumber(item.count)} ครั้ง</span>
            <Money value={item.totalSpent} muted size="sm" />
          </span>
        </li>
      ))}
    </ol>
  );
}

function RecentOrders({ orders, busy, onUnlink, onDeleteOrder }) {
  if (orders.length === 0) return <EmptyState size="sm" icon={ShoppingBag} title="ยังไม่มีออเดอร์" />;
  return (
    <ul className="flex flex-col gap-2">
      {orders.map((order, idx) => (
        <li key={order.id || idx} className="rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-color)] p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-[var(--text-muted)] num">{orderWhen(order)}</span>
            <Money value={order.total || 0} className="font-semibold" />
          </div>
          <p className="mt-1 text-sm text-[var(--text-secondary)] leading-[var(--lh-sm)]">
            {(order.items || []).map((item) => `${item.name} ×${item.quantity}`).join(' · ') || '-'}
          </p>
          {/* Fix mis-entered bills: detach from this member, or delete the bill */}
          <div className="mt-2 pt-2 flex flex-wrap justify-end gap-2 border-t border-[var(--border-light)]">
            <Button
              variant="ghost"
              size="md"
              disabled={busy}
              leftIcon={<UserMinus size={16} />}
              onClick={() => onUnlink(order)}
              title="กรอกสมาชิกผิด · ถอดออเดอร์นี้ออกจากสมาชิก (ยอดขายไม่หาย)"
            >
              ถอดออกจากสมาชิก
            </Button>
            <DangerButton icon={<Trash2 size={16} />} onClick={() => onDeleteOrder(order)} title="ลบบิลนี้ทิ้ง">
              ลบบิล
            </DangerButton>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PointsHistory({ history }) {
  const entries = [...(history || [])].sort((a, b) => new Date(b.at) - new Date(a.at));
  if (entries.length === 0) return <EmptyState size="sm" title="ยังไม่มีประวัติแต้ม" />;
  return (
    <ul className="flex flex-col gap-2">
      {entries.map((e, idx) => {
        const delta = Number(e.delta || 0);
        const d = e.at ? toDate(e.at) : null;
        const meta = [d ? `${formatThaiDate(d, { style: 'short' })} ${formatTime(d)}` : 'ไม่ทราบวันที่'];
        if (e.by) meta.push(`พนักงาน: ${e.by.split('@')[0]}`);
        if (e.orderId) meta.push(`บิล: ${e.orderId.slice(-4)}`);
        if (e.orderIds?.length) meta.push(`บิล: ${e.orderIds.map((id) => id.slice(-4)).join(', ')}`);
        return (
          <li key={idx} className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-color)] p-3">
            <span className="min-w-0">
              <span className="block font-semibold text-[var(--text-primary)]">{REASON_LABELS[e.reason] || e.reason || 'ไม่ระบุ'}</span>
              <span className="block text-sm text-[var(--text-muted)]">{meta.join(' · ')}</span>
            </span>
            {e.reason === 'rejected' ? (
              <span className="shrink-0 font-semibold text-[var(--text-muted)] num">ปฏิเสธ {Number(e.amount || 0)}</span>
            ) : (
              <span className={`shrink-0 font-semibold num ${delta >= 0 ? 'text-[var(--state-ok)]' : 'text-[var(--state-danger)]'}`}>
                {delta >= 0 ? `+${delta}` : `${delta}`}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Member detail sheet · replaces the favourites + points-history modals and the
 * row's edit/delete icon buttons (same handlers).
 */
export default function MemberSheet({
  open, member, detail, threshold, busy, initialTab = 'favorites',
  onClose, onEdit, onDelete, onUnlinkOrder, onDeleteOrder,
}) {
  const [tab, setTab] = useState(initialTab);

  return (
    <Sheet
      open={open && !!member}
      onClose={onClose}
      width={560}
      title={member ? (
        <span className="flex items-center gap-3 min-w-0">
          <MemberAvatar name={member.name} size={44} />
          <span className="min-w-0">
            <span className="block truncate">{member.name || 'ลูกค้า'}</span>
            <span className="flex flex-wrap items-center gap-2 text-sm font-normal text-[var(--text-muted)] num">
              {member.phone || 'ไม่ระบุเบอร์'}
              <PointsBadge member={member} threshold={threshold} />
            </span>
          </span>
        </span>
      ) : ''}
      footer={member?.id ? (
        <>
          <Button variant="outline-danger" leftIcon={<Trash2 size={16} />} onClick={() => onDelete(member)}>ลบสมาชิก</Button>
          <Button variant="secondary" leftIcon={<Edit size={16} />} disabled={busy} onClick={() => onEdit(member)}>แก้ไข</Button>
        </>
      ) : null}
    >
      {member && detail && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="ออเดอร์ทั้งหมด">{formatNumber(detail.totalOrders)}</MiniStat>
            <MiniStat label="เมนูที่เคยสั่ง">{formatNumber(detail.uniqueItems)}</MiniStat>
            <MiniStat label="ยอดใช้จ่ายรวม"><Money value={member.totalSpent || 0} /></MiniStat>
          </div>
          <SegmentedControl
            fullWidth
            ariaLabel="รายละเอียดสมาชิก"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'favorites', label: 'เมนูโปรด' },
              { value: 'orders', label: 'ออเดอร์ล่าสุด', count: detail.recentOrders.length || undefined },
              { value: 'points', label: 'ประวัติแต้ม' },
            ]}
          />
          {tab === 'favorites' && <Favorites favorites={detail.favorites} />}
          {tab === 'orders' && (
            <RecentOrders orders={detail.recentOrders} busy={busy} onUnlink={onUnlinkOrder} onDeleteOrder={onDeleteOrder} />
          )}
          {tab === 'points' && <PointsHistory history={member.pointsHistory} />}
        </div>
      )}
    </Sheet>
  );
}
