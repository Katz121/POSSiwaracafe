import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Banner, Button } from '../../ui';
import { formatNumber } from '../../../utils/format';

const REASON = { order: 'จากการซื้อ', recalc: 'กระทบยอดย้อนหลัง' };

/**
 * "รออนุมัติแต้ม" · stays on top of the page (spec WP6). The Banner carries the
 * sentence; the rows below it carry the approve / reject actions.
 */
export default function PendingApprovals({ rows, isBusy, onApprove, onReject, onShowOrders }) {
  const [collapsed, setCollapsed] = useState(false);
  if (rows.length === 0) return null;
  return (
    <section aria-label="รออนุมัติแต้ม" className="flex flex-col gap-2">
      <Banner
        tone="warn"
        title={`รออนุมัติแต้ม ${formatNumber(rows.length)} คน`}
        action={{ label: collapsed ? 'ดูรายการ' : 'ซ่อนรายการ', onClick: () => setCollapsed((v) => !v) }}
      >
        สมาชิกจะได้แต้มเข้ากระเป๋าหลังกดอนุมัติ
      </Banner>
      {!collapsed && (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {rows.map((m) => {
            const billCount = m.pendingOrderIds?.length || 0;
            const busy = isBusy(m);
            return (
              <li key={`pending-${m.phone || m.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] bg-[var(--bg-surface)] shadow-[var(--elev-1)] p-3">
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--text-primary)] truncate">{String(m.name || 'ไม่ระบุชื่อ')}</p>
                  {billCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => onShowOrders(m)}
                      className="min-h-11 -my-2 text-left text-sm text-[var(--state-warn)] font-semibold underline underline-offset-2 outline-none focus-visible:shadow-[var(--focus-ring)] rounded"
                    >
                      +{Number(m.pendingPoints)} แต้ม · {REASON[m.pendingReason] || 'รีวิว'} (จาก {billCount} บิล)
                    </button>
                  ) : (
                    <p className="text-sm text-[var(--state-warn)] font-semibold">
                      +{Number(m.pendingPoints)} แต้ม · {REASON[m.pendingReason] || 'รีวิว'}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button disabled={busy} onClick={() => onReject(m)} variant="secondary" size="md" leftIcon={<X size={16} />}>ปฏิเสธ</Button>
                  <Button disabled={busy} onClick={() => onApprove(m)} size="md" leftIcon={<Check size={16} />}>อนุมัติ</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
