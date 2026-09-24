import { useMemo } from 'react';
import { Coffee, QrCode, UserRound, Users } from 'lucide-react';
import { getOrderDate, groupItemsByCategory } from '../../../utils/calculations';
import { formatThaiDate } from '../../../utils/format';
import { VAT_PERCENTAGE } from '../../../config/constants';
import { Badge, Money } from '../../ui';
import { billCode } from './billSearch';
import StockDeductionNote from './StockDeductionNote';

export function PaidBadge({ paid, size = 'sm' }) {
  return (
    <Badge tone={paid ? 'ok' : 'warn'} size={size} dot>
      {paid ? 'จ่ายแล้ว' : 'ค้างชำระ'}
    </Badge>
  );
}

function Row({ label, children, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-4 text-sm leading-[var(--lh-sm)] ${className}`}>
      <span className="min-w-0 text-[var(--text-secondary)]">{label}</span>
      <span className="shrink-0 text-right">{children}</span>
    </div>
  );
}

/**
 * Read-only body of one bill (shared by the iPad detail pane and the phone sheet).
 * `showHeader` is false inside the Sheet, whose title already names the bill.
 */
export default function BillDetail({
  bill,
  menu,
  customerName,
  ownGlassDiscount,
  imageFor,
  deduction,
  showHeader = true,
  children,
}) {
  const groups = useMemo(() => Object.entries(groupItemsByCategory(bill.items, menu)), [bill.items, menu]);
  const date = getOrderDate(bill);
  const discount = Number(bill.discount || 0);

  return (
    <div className="flex flex-col gap-5">
      {showHeader && (
        <div className="flex items-start gap-3">
          <span className="num shrink-0 w-12 h-12 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] text-[var(--accent-soft-fg)] flex items-center justify-center text-xl font-semibold" aria-label={`คิว ${bill.queueNumber}`}>
            {Number(bill.queueNumber) || '–'}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[length:var(--fs-xl)] leading-[var(--lh-xl)] font-semibold text-[var(--text-primary)] truncate">
              บิล <span className="num">#{billCode(bill)}</span>
            </h2>
            <p className="text-sm leading-[var(--lh-sm)] text-[var(--text-muted)]">
              {formatThaiDate(date, { weekday: true })}{bill.time ? ` · ${bill.time} น.` : ''}
            </p>
          </div>
          <div className="shrink-0 flex flex-wrap justify-end gap-1.5">
            <PaidBadge paid={bill.isPaid} />
            {bill.source === 'qr' && <Badge tone="info" size="sm" icon={<QrCode size={12} />}>สั่งผ่าน QR</Badge>}
          </div>
        </div>
      )}

      {(customerName || bill.memberPhone || bill.bringOwnGlass || bill.paymentGroupSize > 1) && (
        <div className="flex flex-col gap-2">
          {(customerName || bill.memberPhone) && (
            <div className="flex items-center gap-3 rounded-[var(--radius)] bg-[var(--bg-sunken)] px-3 py-2.5">
              <span className="shrink-0 w-10 h-10 rounded-full bg-[var(--bg-surface)] text-[var(--text-secondary)] flex items-center justify-center">
                <UserRound size={20} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs leading-[var(--lh-xs)] text-[var(--text-muted)]">{bill.memberPhone ? 'สมาชิก' : 'ลูกค้า'}</p>
                <p className="font-semibold text-[var(--text-primary)] break-words">{customerName || 'ลูกค้าทั่วไป'}</p>
                {bill.memberPhone && <p className="num text-sm text-[var(--text-secondary)]">{bill.memberPhone}</p>}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {bill.bringOwnGlass && (
              <Badge tone="info" size="md" icon={<Coffee size={14} />}>
                นำแก้วมาเอง (−<Money value={ownGlassDiscount} />)
              </Badge>
            )}
            {bill.paymentGroupSize > 1 && (
              <Badge tone="neutral" size="md" icon={<Users size={14} />}>
                ชำระรวม {bill.paymentGroupSize} บิล · <Money value={bill.paymentGroupTotal} />
              </Badge>
            )}
          </div>
        </div>
      )}

      <section aria-label="รายการสินค้า" className="flex flex-col gap-4">
        {groups.map(([category, data]) => (
          <div key={category}>
            <div className="flex items-center justify-between gap-3 pb-1.5 mb-1 border-b border-[var(--border-color)]">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">{category}</h3>
              <span className="shrink-0 text-xs text-[var(--text-muted)]">
                <span className="num">{data.quantity}</span> ชิ้น · <Money value={data.total} />
              </span>
            </div>
            <ul className="flex flex-col">
              {data.items.map((item, idx) => {
                const img = imageFor?.(item);
                const qty = Number(item.quantity) || 0;
                return (
                  <li key={`${item.id}-${idx}`} className="flex items-center gap-3 py-2">
                    {img ? (
                      <img src={img} alt="" width={40} height={40} loading="lazy" decoding="async" className="shrink-0 w-10 h-10 rounded-[var(--radius-sm)] object-cover bg-[var(--bg-sunken)]" />
                    ) : (
                      <span className="shrink-0 w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] flex items-center justify-center text-[var(--text-muted)]" aria-hidden="true">
                        <Coffee size={18} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[var(--text-primary)] leading-snug break-words">{String(item.name)}</p>
                      {item.note && <p className="text-sm text-[var(--text-secondary)] break-words">หมายเหตุ: {item.note}</p>}
                      <p className="text-xs text-[var(--text-muted)]">
                        <span className="num">{qty}</span> × <Money value={item.price} />
                      </p>
                    </div>
                    <Money value={(Number(item.price) || 0) * qty} className="shrink-0 font-semibold text-[var(--text-primary)]" />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {groups.length === 0 && <p className="text-sm text-[var(--text-muted)]">บิลนี้ไม่มีรายการสินค้า</p>}
      </section>

      <section aria-label="สรุปยอด" className="rounded-[var(--radius)] bg-[var(--bg-sunken)] p-4 flex flex-col gap-2">
        <Row label="ยอดรวมก่อนส่วนลด"><Money value={bill.subtotal || 0} /></Row>
        {discount > 0 && (
          <Row
            label={(
              <>
                ส่วนลด
                {bill.promotionTitle && (
                  <span className="block text-xs text-[var(--text-muted)]">
                    {bill.promotionTitle}{bill.promotionDiscountPercent > 0 ? ` (${bill.promotionDiscountPercent}%)` : ''}
                  </span>
                )}
              </>
            )}
          >
            <Money value={-discount} tone="danger" />
          </Row>
        )}
        {bill.vatIncluded && <Row label={`VAT ${VAT_PERCENTAGE}%`}><Money value={bill.vat || 0} /></Row>}
        <div className="flex items-end justify-between gap-4 pt-2 mt-1 border-t border-[var(--border-color)]">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-[var(--text-secondary)]">ยอดสุทธิ</span>
            <PaidBadge paid={bill.isPaid} />
          </div>
          <Money value={bill.total || 0} className="text-[length:var(--fs-3xl)] leading-[var(--lh-3xl)] font-semibold text-[var(--text-primary)]" />
        </div>
      </section>

      {deduction && <StockDeductionNote summary={deduction} />}

      {children}
    </div>
  );
}
