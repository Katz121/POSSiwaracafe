import { Award, AlertCircle, ShoppingBag, ThumbsDown, Trash2 } from 'lucide-react';
import { SectionCard, Money, Badge } from '../../ui';
import { formatNumber, formatPercent } from '../../../utils/format';

function Thumb({ src, name }) {
  return (
    <div className="w-10 h-10 shrink-0 rounded-[var(--radius-sm)] overflow-hidden bg-[var(--bg-sunken)] flex items-center justify-center text-[var(--text-muted)]">
      {src
        ? <img src={src} alt="" width={40} height={40} loading="lazy" decoding="async" className="w-full h-full object-cover" />
        : <ShoppingBag size={16} aria-label={name} />}
    </div>
  );
}

/**
 * Menu performance for the selected month (best 5 by profit, and the list worth
 * reviewing). `imageFor(item)` resolves the picture from the live menu because
 * order lines no longer store images.
 */
export default function MenuPerformance({ menuPerformance, imageFor = (item) => item.image, onDelete }) {
  const { bestPerformers, needsReview } = menuPerformance;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <SectionCard
        title={<span className="inline-flex items-center gap-2"><Award size={20} className="text-[var(--state-ok)]" />เมนูทำกำไรดีที่สุด</span>}
        description="กำไรรวมสูงสุด 5 อันดับ (ขายอย่างน้อย 3 ชิ้น)"
      >
        {bestPerformers.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] py-6 text-center">ยังไม่มีข้อมูลเพียงพอ (ต้องขายอย่างน้อย 3 ชิ้น)</p>
        ) : (
          <ol className="flex flex-col divide-y divide-[var(--border-light)]">
            {bestPerformers.map((item, idx) => (
              <li key={item.name} className="flex items-center gap-3 py-2.5 min-h-14">
                <span className="w-6 text-center text-sm font-semibold text-[var(--text-muted)] num shrink-0">{idx + 1}</span>
                <Thumb src={imageFor(item)} name={item.name} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[var(--text-primary)] truncate">{item.name}</p>
                  <p className="text-xs text-[var(--text-muted)] num">ขาย {formatNumber(item.totalSold)} ชิ้น · มาร์จิ้น {formatPercent(item.profitMargin, { digits: 0 })}</p>
                </div>
                <div className="text-right shrink-0">
                  <Money value={item.totalProfit} className="font-semibold text-[var(--state-ok)]" />
                  <p className="text-xs text-[var(--text-muted)]">กำไรรวม</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>

      <SectionCard
        title={<span className="inline-flex items-center gap-2"><AlertCircle size={20} className="text-[var(--state-danger)]" />เมนูที่ควรทบทวน</span>}
        description="กำไรน้อย / ขายได้น้อย / ขายไม่ได้"
      >
        {needsReview.length === 0 ? (
          <p className="text-sm text-[var(--state-ok)] py-6 text-center font-medium">ทุกเมนูทำกำไรได้ดี</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--border-light)]">
            {needsReview.slice(0, 8).map((item) => (
              <li key={item.name} className="flex items-center gap-3 py-2.5 min-h-14">
                <Thumb src={imageFor(item)} name={item.name} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[var(--text-primary)] truncate">{item.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {item.totalSold === 0 && <Badge tone="neutral" size="xs">ขายไม่ได้เลย</Badge>}
                    {item.profitMargin < 30 && item.totalSold > 0 && <Badge tone="danger" size="xs">กำไรต่ำ {formatPercent(item.profitMargin, { digits: 0 })}</Badge>}
                    {item.totalSold > 0 && item.totalSold < 3 && <Badge tone="warn" size="xs">ขายน้อย {formatNumber(item.totalSold)} ชิ้น</Badge>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {item.totalSold === 0 ? (
                    <>
                      <Money value={item.price} className="font-semibold text-[var(--text-secondary)]" />
                      <p className="text-xs text-[var(--text-muted)]">ราคาขาย</p>
                    </>
                  ) : (
                    <>
                      <Money value={item.totalProfit} tone={item.totalProfit < 0 ? 'danger' : undefined} className="font-semibold" />
                      <p className="text-xs text-[var(--text-muted)]">กำไรรวม</p>
                    </>
                  )}
                </div>
                {item.id && onDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(item)}
                    aria-label={`ลบเมนู ${item.name}`}
                    className="shrink-0 w-11 h-11 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--state-danger)] hover:bg-[var(--state-danger-soft)] outline-none focus-visible:shadow-[var(--focus-ring)]"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {needsReview.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[var(--border-color)] flex flex-col gap-2 text-sm text-[var(--text-secondary)]">
            <p className="font-medium text-[var(--text-primary)]">คำแนะนำ</p>
            {needsReview.some((m) => m.profitMargin < 30) && (
              <p className="flex items-start gap-2"><ThumbsDown size={16} className="text-[var(--state-danger)] shrink-0 mt-1" />พิจารณาปรับราคาหรือลดต้นทุนเมนูที่กำไรต่ำกว่า 30%</p>
            )}
            {needsReview.some((m) => m.totalSold > 0 && m.totalSold < 3) && (
              <p className="flex items-start gap-2"><AlertCircle size={16} className="text-[var(--state-warn)] shrink-0 mt-1" />เมนูที่ขายน้อยอาจต้องโปรโมทหรือพิจารณาตัดออก</p>
            )}
            {needsReview.some((m) => m.totalSold === 0) && (
              <p className="flex items-start gap-2"><AlertCircle size={16} className="text-[var(--text-muted)] shrink-0 mt-1" />มีเมนูที่ขายไม่ได้เลยในเดือนนี้ ควรโปรโมทหรือปิดเมนู</p>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
