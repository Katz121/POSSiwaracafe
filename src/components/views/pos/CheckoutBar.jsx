import { memo } from 'react';
import { CheckCircle2, Clock3, UtensilsCrossed } from 'lucide-react';
import { Button, SegmentedControl } from '../../ui';
import { formatBaht } from '../../../utils/format';

const PAID_OPTIONS = [
  { value: false, label: 'ค้างจ่าย' },
  { value: true, label: 'รับเงินแล้ว' },
];
const UNPAID_LABEL = <><Clock3 size={18} className="shrink-0" /> ค้างจ่าย</>;
const PAID_LABEL = <><CheckCircle2 size={20} className="shrink-0" /> รับเงินแล้ว</>;
const SAVE_LABEL = <><CheckCircle2 size={20} className="shrink-0" /> บันทึกการแก้ไข</>;

/**
 * The CTA row. New sale: split action, one tap each · "ค้างจ่าย" (secondary) /
 * "รับเงินแล้ว" (primary) → onCheckout(false|true). Edit mode: paid toggle + one
 * "บันทึกการแก้ไข" → onCheckout(isPaid). Optional `onStaffMeal` adds a quiet
 * "เจ้าของ/พนักงานกิน" row under the CTAs (new sale only, never edit mode).
 * Memoised: `onCheckout`/`onStaffMeal` are stable, so a cart tap does not
 * re-render these buttons.
 */
const CheckoutActions = memo(function CheckoutActions({ disabled, editing, isPaid, onPaidChange, onCheckout, onStaffMeal }) {
  if (editing) {
    return (
      <div className="space-y-2">
        <SegmentedControl options={PAID_OPTIONS} value={!!isPaid} onChange={onPaidChange} fullWidth ariaLabel="สถานะการจ่าย" />
        <Button variant="primary" size="xl" fullWidth disabled={disabled} onClick={() => onCheckout(!!isPaid)} data-checkout="save">
          {SAVE_LABEL}
        </Button>
      </div>
    );
  }
  return (
    <>
      {/* minmax(0,…) ให้ปุ่มหดตามคอลัมน์ตะกร้า · iPad แนวตั้ง 834 ตะกร้าแคบ ปุ่ม nowrap เคยดันล้นขวา */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-2">
        <Button variant="secondary" size="xl" className="min-w-0 whitespace-nowrap px-2" disabled={disabled} onClick={() => onCheckout(false)} data-checkout="unpaid">
          {UNPAID_LABEL}
        </Button>
        <Button variant="primary" size="xl" className="min-w-0 whitespace-nowrap px-2" disabled={disabled} onClick={() => onCheckout(true)} data-checkout="paid">
          {PAID_LABEL}
        </Button>
      </div>
      {onStaffMeal && (
        <Button variant="ghost" size="sm" fullWidth disabled={disabled} onClick={onStaffMeal}>
          <><UtensilsCrossed size={16} className="shrink-0" /> เจ้าของ/พนักงานกิน</>
        </Button>
      )}
    </>
  );
});

/**
 * Totals + checkout, pinned to the bottom of the cart.
 * `rows`: [{ label, amount (negative = discount) }] · `hints`: strings
 * `onStaffMeal`: optional → shows the quiet "เจ้าของ/พนักงานกิน" row (new sale only)
 */
export default function CheckoutBar({
  subtotal, rows = [], hints = [], netTotal, disabled, busy, editing, isPaid, onPaidChange, onCheckout, onStaffMeal,
}) {
  return (
    <div className="shrink-0 border-t border-[var(--border-color)] bg-[var(--bg-surface)] px-4 pt-3 pb-4 space-y-3">
      <div className="space-y-1 text-sm">
        <div className="flex justify-between text-[var(--text-secondary)]">
          <span>รวม</span><span className="num">{formatBaht(subtotal)}</span>
        </div>
        {rows.map((r) => (
          <div key={r.label} className={`flex justify-between gap-2 ${r.amount < 0 ? 'text-[var(--state-ok)]' : 'text-[var(--text-secondary)]'}`}>
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="num shrink-0">{r.amount < 0 ? `−${formatBaht(-r.amount)}` : `+${formatBaht(r.amount)}`}</span>
          </div>
        ))}
        {hints.map((h) => <p key={h} className="text-xs text-right text-[var(--accent-soft-fg)]">{h}</p>)}
        <div className="flex items-end justify-between pt-1">
          <span className="font-semibold text-[var(--text-primary)]">ยอดสุทธิ</span>
          <span className="num text-[length:var(--fs-3xl)] leading-[var(--lh-3xl)] md:text-[length:var(--fs-display)] md:leading-[var(--lh-display)] font-semibold text-[var(--text-primary)]" data-net-total>
            {formatBaht(netTotal)}
          </span>
        </div>
      </div>
      <CheckoutActions disabled={disabled || busy} editing={editing} isPaid={isPaid} onPaidChange={onPaidChange} onCheckout={onCheckout} onStaffMeal={onStaffMeal} />
    </div>
  );
}
