import { ArrowDownRight, ArrowUpRight, Crown, Activity, Target, TrendingUp, Users, Trash2, Wallet, ShoppingBag, Banknote } from 'lucide-react';
import { StatCard, Money, SectionCard, Banner, Button, EmptyState } from '../../ui';
import { formatBaht, formatNumber, formatPercent, formatThaiDate } from '../../../utils/format';
import SectionTitle from './SectionTitle';

const monthShort = (iso) => formatThaiDate(iso, { style: 'short' }).split(' ')[1] || '';
const dayOf = (iso) => Number(String(iso).slice(8, 10));
const rangeLabel = ({ start, end }) => `${dayOf(start)}–${dayOf(end)} ${monthShort(end)}`;

function DeltaChip({ value, good = 'up' }) {
  const up = value >= 0;
  const isGood = good === 'up' ? up : !up;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold num ${isGood ? 'bg-[var(--state-ok-soft)] text-[var(--state-ok)]' : 'bg-[var(--state-danger-soft)] text-[var(--state-danger)]'}`}
      aria-label={`${up ? 'เพิ่มขึ้น' : 'ลดลง'} ${formatPercent(Math.abs(value), { digits: 0 })}`}
    >
      <Arrow size={14} aria-hidden="true" />
      {formatPercent(Math.abs(value), { digits: 0 })}
    </span>
  );
}

function CompareTile({ label, value, previous, previousLabel, growth, good }) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] p-3 md:p-4 flex flex-col gap-1 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className="text-sm text-[var(--text-secondary)] whitespace-nowrap">{label}</span>
        <DeltaChip value={growth} good={good} />
      </div>
      <span className="num text-xl md:text-2xl font-semibold text-[var(--text-primary)] truncate">{value}</span>
      <span className="text-sm text-[var(--text-muted)] truncate">{previousLabel} <span className="num">{previous}</span></span>
    </div>
  );
}

/**
 * "เดือนนี้" block: KPI row, like-for-like comparison, charts and top items.
 * Content is the old dashboard's; only the comparison window changed
 * (matching day ranges, owner decision 2026-09-24).
 */
export default function MonthSection({
  monthLabel,
  isCurrentMonth,
  monthPicker,
  monthlyStats,
  profitability,
  memberStats,
  dashboardStats,
  comparison,
  startingCash = 0,
  onNavigate,
}) {
  const { ranges, current, previous, growth } = comparison;
  const cashDiff = current.profit - previous.profit;
  const prevLabel = monthShort(ranges.previous.end);
  const cashMargin = Math.round((monthlyStats.profit / (monthlyStats.revenue || 1)) * 100);
  const topMax = Math.max(...dashboardStats.topProducts.map((x) => x.count), 1);
  const hourMax = Math.max(...dashboardStats.hourlySales, 1);
  const storeHours = dashboardStats.hourlySales
    .map((revenue, hour) => ({ hour, revenue }))
    .filter(({ hour }) => hour >= 10 && hour <= 17); // store hours 10:00–17:00

  return (
    <section aria-labelledby="ov-month" className="flex flex-col gap-4">
      <SectionTitle
        id="ov-month"
        title={isCurrentMonth ? 'เดือนนี้' : monthLabel}
        description={isCurrentMonth ? monthLabel : 'ข้อมูลทั้งเดือน'}
        actions={monthPicker}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <StatCard
          label="รายได้"
          icon={TrendingUp}
          tone="ok"
          value={<Money value={monthlyStats.revenue} />}
          hint={`${formatNumber(monthlyStats.count)} บิล · ${formatNumber(monthlyStats.cups)} แก้ว · ขนม ${formatNumber(monthlyStats.pieces)} ชิ้น`}
          onClick={() => onNavigate?.('sales_history')}
        />
        <StatCard
          label="กำไรขั้นต้น"
          icon={Target}
          tone="ok"
          value={<Money value={profitability.grossProfit} decimals={0} />}
          hint={`มาร์จิ้น ${formatPercent(profitability.grossMargin)} · ดูต่อเมนู`}
          onClick={() => onNavigate?.('profitability')}
        />
        <StatCard
          label="รายจ่าย"
          icon={Wallet}
          value={<Money value={monthlyStats.cost} />}
          hint="เงินที่จ่ายออก ไม่รวมของเสียและเจ้าของ/พนักงานกิน"
          onClick={() => onNavigate?.('expenses')}
        />
        <StatCard
          label="สมาชิกใหม่"
          icon={Users}
          tone="info"
          value={`+${formatNumber(memberStats.newMembersMonth)}`}
          unit="คน"
          hint={isCurrentMonth && memberStats.newMembersToday > 0 ? `วันนี้ +${formatNumber(memberStats.newMembersToday)} คน` : undefined}
          onClick={() => onNavigate?.('members_manage')}
        />
        <StatCard
          label="ของเสีย"
          icon={Trash2}
          tone={dashboardStats.totalWasteCost > 500 ? 'danger' : 'neutral'}
          value={<Money value={dashboardStats.totalWasteCost} />}
          hint="มูลค่าที่ทิ้งไปในเดือน"
        />
      </div>

      <SectionCard
        title="เทียบกับเดือนก่อน"
        description={`${rangeLabel(ranges.current)} เทียบ ${rangeLabel(ranges.previous)}${ranges.partial ? ' · นับจำนวนวันเท่ากัน' : ''}`}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <CompareTile label="รายได้" value={formatBaht(current.revenue)} previous={formatBaht(previous.revenue)} previousLabel={prevLabel} growth={growth.revenue} />
          <CompareTile label="เงินสดสุทธิ" value={formatBaht(current.profit)} previous={formatBaht(previous.profit)} previousLabel={prevLabel} growth={growth.profit} />
          <CompareTile label="บิล" value={formatNumber(current.count)} previous={formatNumber(previous.count)} previousLabel={prevLabel} growth={growth.count} />
          <CompareTile label="ค่าใช้จ่าย" value={formatBaht(current.cost)} previous={formatBaht(previous.cost)} previousLabel={prevLabel} growth={growth.cost} good="down" />
        </div>
        <Banner
          className="mt-4"
          tone={cashDiff >= 0 ? 'ok' : 'warn'}
          title={cashDiff >= 0
            ? `เงินสดสุทธิเพิ่มขึ้น ${formatPercent(Math.abs(growth.profit), { digits: 0 })}`
            : `เงินสดสุทธิลดลง ${formatPercent(Math.abs(growth.profit), { digits: 0 })}`}
        >
          {cashDiff >= 0 ? 'มากกว่า' : 'น้อยกว่า'}{ranges.partial ? 'ช่วงเดียวกันเดือนก่อน' : 'เดือนก่อน'} {formatBaht(Math.abs(cashDiff))}
        </Banner>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard className="lg:col-span-2" title={<span className="inline-flex items-center gap-2"><Crown size={20} className="text-[var(--state-warn)]" />เมนูขายดี (จำนวนชิ้น)</span>}>
          {dashboardStats.topProducts.length === 0 ? (
            <EmptyState size="sm" icon={ShoppingBag} title="ยังไม่มีข้อมูลการขาย" />
          ) : (
            <ol className="flex flex-col gap-4">
              {dashboardStats.topProducts.map((p) => (
                <li key={p.name} className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-baseline gap-3">
                    <span className="font-medium text-[var(--text-primary)] truncate">{p.name}</span>
                    <span className="text-sm font-semibold text-[var(--text-secondary)] num shrink-0">{formatNumber(p.count)} ชิ้น</span>
                  </div>
                  <div className="h-2.5 bg-[var(--bg-sunken)] rounded-full overflow-hidden" aria-hidden="true">
                    <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(p.count / topMax) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>

        <SectionCard title={<span className="inline-flex items-center gap-2"><Activity size={20} className="text-[var(--accent)]" />ช่วงเวลาขายดี</span>} description="ยอดขายรวมรายชั่วโมงในเดือน">
          <div className="grid grid-cols-4 gap-2">
            {storeHours.map(({ hour, revenue }) => {
              const intensity = revenue / hourMax;
              return (
                <div key={hour} className="flex flex-col items-center gap-1" title={`${hour}:00 · ${formatBaht(revenue)}`}>
                  <div
                    className="w-full h-12 rounded-[var(--radius-sm)] border border-[var(--border-color)]"
                    style={{ background: intensity > 0 ? `color-mix(in srgb, var(--accent) ${Math.round((0.12 + intensity * 0.88) * 100)}%, var(--bg-surface))` : 'var(--bg-sunken)' }}
                  />
                  <span className="text-xs text-[var(--text-secondary)] num">{hour}:00</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
            <p className="text-sm text-[var(--text-secondary)]">ช่วงที่ลูกค้าแน่นที่สุด</p>
            <p className="text-2xl font-semibold text-[var(--text-primary)] num">
              {dashboardStats.peakHour !== null ? `${dashboardStats.peakHour}:00–${dashboardStats.peakHour + 1}:00 น.` : 'ยังไม่มีข้อมูล'}
            </p>
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard title="อัตราเงินสดสุทธิ" description="ยอดขายหักรายจ่ายที่บันทึกในระบบ (ไม่ใช่กำไรขั้นต้น)">
          <div className="flex items-center gap-5">
            <div
              className="shrink-0 w-24 h-24 rounded-full flex items-center justify-center"
              style={{ background: `conic-gradient(var(--accent) ${Math.max(0, Math.min(100, cashMargin))}%, var(--bg-sunken) 0)` }}
              aria-hidden="true"
            >
              <div className="w-[4.5rem] h-[4.5rem] rounded-full bg-[var(--bg-surface)] flex items-center justify-center">
                <span className="text-lg font-semibold num text-[var(--text-primary)]">{formatPercent(cashMargin, { digits: 0 })}</span>
              </div>
            </div>
            <div className="min-w-0">
              <Money value={monthlyStats.profit} size="2xl" className="font-semibold text-[var(--text-primary)]" />
              <p className="text-sm text-[var(--text-muted)]">อัตรา {formatPercent(cashMargin, { digits: 0 })} ของยอดขาย</p>
              {Number(startingCash) > 0 && (
                <p className="mt-2 text-sm text-[var(--text-secondary)] flex flex-wrap items-center gap-x-1">
                  <Banknote size={14} className="text-[var(--state-warn)]" />
                  รวมเงินทอน <Money value={monthlyStats.profit + Number(startingCash)} className="font-semibold" />
                </p>
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="ยอดขายสูงสุด 5 อันดับ (บาท)" description="ราคาขาย × จำนวน ก่อนหักต้นทุน">
          {dashboardStats.topProfitable.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">ยังไม่มีข้อมูลการขาย</p>
          ) : (
            <ol className="flex flex-col divide-y divide-[var(--border-light)]">
              {dashboardStats.topProfitable.map((p, idx) => (
                <li key={p.name} className="flex justify-between items-center gap-3 py-2 text-sm">
                  <span className="text-[var(--text-primary)] truncate"><span className="text-[var(--text-muted)] num mr-2">{idx + 1}</span>{p.name}</span>
                  <Money value={p.totalProfit} decimals={0} className="font-semibold text-[var(--text-primary)] shrink-0" />
                </li>
              ))}
            </ol>
          )}
          <div className="mt-3">
            <Button variant="secondary" onClick={() => onNavigate?.('profitability')}>ดูกำไรต่อเมนู</Button>
          </div>
        </SectionCard>
      </div>
    </section>
  );
}
