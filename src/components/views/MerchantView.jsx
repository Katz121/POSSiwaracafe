import { useCallback, useMemo, useState } from 'react';
import { ChefHat } from 'lucide-react';
import { useDataContext, useUIContext } from '../../context/AppContext';
import { getISODate, getOrderDate } from '../../utils/calculations';
import { formatBaht } from '../../utils/format';
import { SegmentedControl, useMediaQuery } from '../ui';
import MerchantColumn from '../MerchantColumn';
import useNow from './kitchen/useNow';

const COLUMNS = [
  { status: 'pending', title: 'รายการใหม่', short: 'ใหม่', color: 'var(--kds-age-10)' },
  { status: 'preparing', title: 'กำลังทำ', short: 'กำลังทำ', color: 'var(--kds-info)' },
  { status: 'ready', title: 'พร้อมส่ง', short: 'พร้อมส่ง', color: 'var(--kds-age-ok)' },
];

// The kitchen board is always dark. Shared ui components read the theme tokens,
// so the board re-points them at the --kds-* palette inside its own subtree.
const KDS_SCOPE = {
  '--kds-info': '#7CA7FF',
  '--bg-canvas': 'var(--kds-bg)',
  '--bg-surface': 'var(--kds-surface)',
  '--bg-sunken': 'var(--kds-bg)',
  '--bg-hover': '#1A2436',
  '--text-primary': 'var(--kds-text)',
  '--text-secondary': 'var(--kds-muted)',
  '--text-muted': 'var(--kds-muted)',
  '--border-color': 'var(--kds-border)',
  '--border-strong': '#33415A',
  '--accent-soft': '#13302A',
  '--accent-soft-fg': '#6EE7B7',
  '--focus-ring': '0 0 0 3px rgba(62,207,154,.45)',
  colorScheme: 'dark',
};

export default function MerchantView() {
  const { orders, queueCounter } = useDataContext();
  const { updateStatus, setOrderToCancel, setEditingOrderId, handleViewChange } = useUIContext();
  const now = useNow(30000);
  const isPhone = useMediaQuery('(max-width: 767px)');
  const [phoneColumn, setPhoneColumn] = useState('pending');

  const todayISO = getISODate();
  const todayRevenue = useMemo(() => orders
    .filter(o => o.status === 'completed' && getOrderDate(o) === todayISO)
    .reduce((s, o) => s + (Number(o.total) || 0), 0), [orders, todayISO]);

  const active = useMemo(() => orders.filter(o => o.status === 'pending' || o.status === 'preparing' || o.status === 'ready'), [orders]);
  const counts = useMemo(() => {
    const c = { pending: 0, preparing: 0, ready: 0 };
    for (const o of active) c[o.status] += 1;
    return c;
  }, [active]);

  const handleEdit = useCallback((order) => {
    setEditingOrderId(order.id);
    handleViewChange('pos');
  }, [setEditingOrderId, handleViewChange]);
  const handleCancel = useCallback((id) => setOrderToCancel(id), [setOrderToCancel]);

  const shown = isPhone ? COLUMNS.filter(c => c.status === phoneColumn) : COLUMNS;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--kds-bg)] text-[var(--kds-text)]" style={KDS_SCOPE} data-kds>
      <header className="shrink-0 flex items-center gap-3 px-4 md:px-6 min-h-16 border-b border-[var(--kds-border)] bg-[var(--kds-surface)]">
        <ChefHat size={24} className="shrink-0 text-[var(--kds-age-ok)]" />
        <h1 className="flex-1 min-w-0 truncate text-[length:var(--fs-xl)] leading-[var(--lh-xl)] font-semibold">ออเดอร์ / ครัว</h1>
        <div className="shrink-0 text-right leading-normal">
          <p className="text-sm text-[var(--kds-muted)]">คิวล่าสุด <span className="num text-lg font-semibold text-[var(--kds-text)]">#{Math.max(queueCounter - 1, 0)}</span></p>
          {/* kept for the owner, de-emphasised: the kitchen works from the counts */}
          <p className="text-xs text-[var(--kds-muted)]" data-kds-revenue>ยอดขายวันนี้ <span className="num">{formatBaht(todayRevenue)}</span></p>
        </div>
      </header>

      {isPhone && (
        <div className="shrink-0 px-3 pt-3">
          <SegmentedControl
            fullWidth
            ariaLabel="เลือกคอลัมน์"
            value={phoneColumn}
            onChange={setPhoneColumn}
            options={COLUMNS.map(c => ({ value: c.status, label: c.short, count: counts[c.status] }))}
          />
        </div>
      )}

      <div className="flex-1 min-h-0 flex gap-3 md:gap-4 p-3 md:p-4 overflow-x-auto">
        {shown.map(col => (
          <MerchantColumn
            key={col.status}
            title={col.title}
            color={col.color}
            status={col.status}
            orders={active}
            now={now}
            onUpdate={updateStatus}
            onCancel={handleCancel}
            onEdit={handleEdit}
            className="flex-1 min-w-[min(100%,220px)]"
          />
        ))}
      </div>
    </div>
  );
}
