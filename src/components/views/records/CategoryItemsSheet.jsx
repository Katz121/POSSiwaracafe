import { Coffee } from 'lucide-react';
import { formatNumber } from '../../../utils/format';
import { Money, Sheet } from '../../ui';

const n = (v) => formatNumber(v, { maxDecimals: 0 });

/** Drill-down for one category: bean modifiers (if any) + items sold. */
export default function CategoryItemsSheet({ category, breakdown, share, onClose }) {
  const detail = category ? breakdown[category.category] : null;
  return (
    <Sheet
      open={!!category}
      onClose={onClose}
      title={category ? String(category.category) : ''}
      description={category ? (
        <>
          <span className="num">{n(category.quantity)}</span> ชิ้น · <Money value={category.revenue} /> · {share}
        </>
      ) : null}
    >
      {detail && (
        <div className="flex flex-col gap-5">
          {detail.beans.length > 0 && (
            <section aria-label="เมล็ดกาแฟที่ใช้">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)] mb-2">
                <Coffee size={16} aria-hidden="true" className="text-[var(--text-secondary)]" /> เมล็ดกาแฟที่เลือก
              </h3>
              <ul className="grid grid-cols-2 gap-2">
                {detail.beans.map((bean) => (
                  <li key={bean.tag} className="rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] px-3 py-2 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] break-words">{bean.tag.replace(/^#/, '')}</p>
                    <p className="text-xs text-[var(--text-muted)]"><span className="num">×{n(bean.quantity)}</span> · <Money value={bean.revenue} /></p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section aria-label="รายการที่ขาย">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">รายการที่ขาย ({detail.items.length})</h3>
            <ul className="flex flex-col divide-y divide-[var(--border-light)]">
              {detail.items.map((item) => (
                <li key={item.name} className="flex items-center gap-3 py-2.5">
                  <span className="num shrink-0 w-12 text-right font-semibold text-[var(--text-primary)]">×{n(item.quantity)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-[var(--text-primary)] break-words">{item.name}</span>
                    <span className="block text-xs text-[var(--text-muted)]"><Money value={item.price} /> / ชิ้น</span>
                  </span>
                  <Money value={item.revenue} className="shrink-0 font-semibold" />
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Sheet>
  );
}
