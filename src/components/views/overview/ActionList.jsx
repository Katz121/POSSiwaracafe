import { useMemo } from 'react';
import SmartAlerts from '../../SmartAlerts';
import { ALERT_SEVERITY } from '../../../services/alertService';
import { Banner } from '../../ui';
import { formatBaht, formatNumber } from '../../../utils/format';
import SectionTitle from './SectionTitle';

// Deep-link params per alert (spec §7 WP3.3). View keys stay the same; the
// params only pre-select a filter/tab on the target screen.
const ALERT_PARAMS = {
  stock_critical: { filter: 'low' },
  stock_low: { filter: 'low' },
  menu_unlinked: { tab: 'links' },
  menu_dead_link: { tab: 'links' },
  stock_audit_today: { tab: 'issues' },
  bills_unpaid: { filter: 'unpaid' },
};

/**
 * "ต้องจัดการ" · SmartAlerts plus two counts the alert service does not know
 * about (today's unpaid bills and members waiting for points approval).
 */
export default function ActionList({ alertsData, todayStats, pendingPointsCount = 0, onNavigate }) {
  const extraAlerts = useMemo(() => {
    const extra = [];
    if (todayStats.unpaidCount > 0) {
      extra.push({
        id: 'bills_unpaid',
        severity: ALERT_SEVERITY.WARNING,
        title: `ค้างชำระ ${formatNumber(todayStats.unpaidCount)} บิล`,
        message: `ยอดรวม ${formatBaht(todayStats.unpaidTotal)} · เก็บเงินก่อนปิดร้าน`,
        action: { label: 'ดูบิล', view: 'bills' },
      });
    }
    if (pendingPointsCount > 0) {
      extra.push({
        id: 'points_pending',
        severity: ALERT_SEVERITY.WARNING,
        title: `แต้มรออนุมัติ ${formatNumber(pendingPointsCount)} คน`,
        message: 'สมาชิกยังไม่ได้แต้มจนกว่าจะอนุมัติ',
        action: { label: 'ดูสมาชิก', view: 'members_manage' },
      });
    }
    return extra;
  }, [todayStats.unpaidCount, todayStats.unpaidTotal, pendingPointsCount]);

  const handleAction = (view, alert) => onNavigate?.(view, ALERT_PARAMS[alert?.id]);

  return (
    <section aria-labelledby="ov-actions" className="flex flex-col gap-3">
      <SectionTitle id="ov-actions" title="ต้องจัดการ" />
      <SmartAlerts
        data={alertsData}
        onAction={handleAction}
        extraAlerts={extraAlerts}
        emptyState={<Banner tone="ok" title="ไม่มีอะไรต้องจัดการตอนนี้" />}
      />
    </section>
  );
}
