import { Banknote, Receipt, TrendingUp, Wallet, Clock } from 'lucide-react';
import { StatCard, Money } from '../../ui';
import { formatNumber, formatThaiDate } from '../../../utils/format';
import SectionTitle from './SectionTitle';

const weekdayShort = (iso) => formatThaiDate(iso, { style: 'short', weekday: true }).split(' ')[0];

/**
 * "วันนี้" · the first thing the owner sees (spec principle 3).
 * `stats` comes from computeTodayStats().
 */
export default function TodayRow({ stats, today, newMembersToday = 0, startingCash = 0, onNavigate }) {
  const delta = stats.revenueDelta === null ? null : {
    value: Math.abs(stats.revenueDelta),
    direction: stats.revenueDelta < 0 ? 'down' : 'up',
    good: 'up',
  };

  return (
    <section aria-labelledby="ov-today" className="flex flex-col gap-3">
      <SectionTitle
        id="ov-today"
        title="วันนี้"
        description={`${formatThaiDate(today, { weekday: true, style: 'long' })}${newMembersToday > 0 ? ` · สมาชิกใหม่ ${formatNumber(newMembersToday)} คน` : ''}`}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="ยอดขายวันนี้"
          icon={TrendingUp}
          tone="ok"
          value={<Money value={stats.revenue} />}
          delta={delta || undefined}
          hint={delta ? `เทียบ ${weekdayShort(stats.lastWeek)} ที่แล้ว เวลาเดียวกัน` : `${weekdayShort(stats.lastWeek)} ที่แล้วถึงเวลานี้ยังไม่มียอด`}
          onClick={() => onNavigate?.('sales_history')}
        />
        <StatCard
          label="บิลที่ปิดแล้ว"
          icon={Receipt}
          value={formatNumber(stats.bills)}
          unit="บิล"
          hint={`${formatNumber(stats.cups)} แก้ว · ขนม ${formatNumber(stats.pieces)} ชิ้น`}
          onClick={() => onNavigate?.('bills')}
        />
        <StatCard
          label="ค้างชำระ"
          icon={Clock}
          tone={stats.unpaidCount > 0 ? 'warn' : 'neutral'}
          value={formatNumber(stats.unpaidCount)}
          unit="บิล"
          hint={stats.unpaidCount > 0 ? <>ยอดรวม <Money value={stats.unpaidTotal} /></> : 'ไม่มีบิลค้าง'}
          onClick={() => onNavigate?.('bills', { filter: 'unpaid' })}
        />
        <StatCard
          label="รายจ่ายวันนี้"
          icon={Wallet}
          value={<Money value={stats.expenseTotal} />}
          hint="ไม่รวมของเสีย"
          onClick={() => onNavigate?.('expenses')}
        />
      </div>
      {Number(startingCash) > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--text-secondary)]">
          <Banknote size={16} className="text-[var(--state-warn)] shrink-0" />
          เงินทอนตั้งต้น <Money value={Number(startingCash)} className="font-semibold text-[var(--text-primary)]" />
          <span className="text-[var(--text-muted)]">· แยกจากยอดขายและกำไร</span>
        </p>
      )}
    </section>
  );
}
