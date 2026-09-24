import { Banknote, Receipt, Trash2, TrendingUp, Wallet } from 'lucide-react';
import { Button, DateStepper, EmptyState, Input, Money, StatCard } from '../../ui';
import { formatNumber, formatThaiDate } from '../../../utils/format';
import { Section, NativeSelect, SaveBar } from './controls';
import { EXPENSE_CATEGORIES } from '../../../config/constants';

function Line({ label, children, strong = false }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-2.5 border-b border-[var(--border-light)] last:border-b-0 ${strong ? 'pt-3' : ''}`}>
      <span className={strong ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}>{label}</span>
      {children}
    </div>
  );
}

/** "ปิดยอดวันนี้" · the old สรุปยอด tab: day + month numbers, daily expenses, float. */
export default function CloseDayTab({
  date, onDate, daily, dayCount, monthly, unpaid, startingCash,
  dayExpenses, newExpense, onNewExpense, onAddExpense, onDeleteExpense,
  draft, patch, dirty, onSave,
}) {
  const profitTone = daily.profit >= 0 ? 'ok' : 'danger';
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateStepper value={date} onChange={onDate} />
        {startingCash > 0 && (
          <p className="text-sm text-[var(--text-secondary)] flex items-center gap-2">
            <Banknote size={18} className="text-[var(--state-warn)]" />
            เงินทอนตั้งต้น <Money value={startingCash} className="font-semibold text-[var(--text-primary)]" />
            <span className="text-[var(--text-muted)]">(ไม่นับรวมยอดขาย)</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label="กำไรวันนี้" value={<Money value={daily.profit} />} tone={profitTone} icon={TrendingUp} hint="รายรับ − รายจ่าย ของวันที่เลือก" />
        <StatCard label="รายรับ" value={<Money value={daily.revenue} />} icon={Wallet} hint={`${formatNumber(dayCount)} บิลที่ปิดแล้ว`} />
        <StatCard label="รายจ่าย" value={<Money value={daily.cost} />} icon={Receipt} hint={`${formatNumber(dayExpenses.length)} รายการ`} />
        <StatCard
          label="ค้างชำระ"
          value={formatNumber(unpaid.count)}
          unit="บิล"
          tone={unpaid.count > 0 ? 'warn' : 'neutral'}
          icon={Banknote}
          hint={unpaid.count > 0 ? <>ยอด <Money value={unpaid.total} /></> : 'ไม่มีบิลค้าง'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <Section title="บันทึกรายจ่ายรายวัน" description={`รายจ่ายของ ${formatThaiDate(date, { weekday: true })}`}>
          <form onSubmit={onAddExpense} className="flex flex-col gap-3">
            <Input
              label="รายการ"
              required
              value={newExpense.title}
              onChange={(e) => onNewExpense({ ...newExpense, title: e.target.value })}
              placeholder="เช่น ค่าน้ำแข็ง"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="จำนวนเงิน"
                type="number"
                inputMode="decimal"
                required
                value={newExpense.amount}
                onChange={(e) => onNewExpense({ ...newExpense, amount: e.target.value })}
                suffix="บาท"
                inputClassName="num"
              />
              <NativeSelect label="หมวดหมู่" value={newExpense.category} onChange={(e) => onNewExpense({ ...newExpense, category: e.target.value })}>
                {EXPENSE_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </NativeSelect>
            </div>
            <Button type="submit" className="self-end">บันทึกรายจ่าย</Button>
          </form>
          <div className="mt-4 border-t border-[var(--border-color)] pt-3">
            {dayExpenses.length === 0 ? (
              <EmptyState size="sm" icon={Receipt} title="ไม่มีรายจ่ายวันนี้" />
            ) : (
              <ul className="flex flex-col">
                {dayExpenses.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 min-h-12 border-b border-[var(--border-light)] last:border-b-0">
                    <span className="min-w-0">
                      <span className="block text-[var(--text-primary)] truncate">{String(e.title)}</span>
                      {e.category && <span className="block text-sm text-[var(--text-muted)]">{e.category}</span>}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      <Money value={Number(e.amount)} className="font-semibold" />
                      <button
                        type="button"
                        onClick={() => onDeleteExpense(e)}
                        aria-label={`ลบรายจ่าย ${e.title}`}
                        className="w-11 h-11 inline-flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--state-danger)] hover:bg-[var(--state-danger-soft)] outline-none focus-visible:shadow-[var(--focus-ring)]"
                      >
                        <Trash2 size={18} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

        <div className="flex flex-col gap-5">
          <Section title="ภาพรวมเดือน" description={formatThaiDate(date, { style: 'month' })}>
            <Line label="รายรับรวม"><Money value={monthly.revenue} size="lg" className="font-semibold" /></Line>
            <Line label="รายจ่ายรวม"><Money value={monthly.cost} size="lg" className="font-semibold" /></Line>
            <Line label="กำไรสุทธิ" strong>
              <Money value={monthly.profit} size="2xl" tone={monthly.profit >= 0 ? 'ok' : 'danger'} className="font-semibold" />
            </Line>
            <Line label="บิลที่ปิดสำเร็จ"><span className="font-semibold num">{formatNumber(monthly.count)} บิล</span></Line>
          </Section>

          <Section title="เงินทอนตั้งต้น" description="เงินสำรองไว้ทอน ไม่นับรวมกับยอดขาย แสดงแยกในรายงาน">
            <Input
              label="จำนวนเงิน"
              type="number"
              inputMode="decimal"
              value={draft.startingCash}
              onChange={(e) => patch({ startingCash: e.target.value })}
              suffix="บาท"
              inputClassName="num"
              placeholder="0"
            />
            <SaveBar inline dirty={dirty} onSave={onSave} />
          </Section>
        </div>
      </div>
    </div>
  );
}
