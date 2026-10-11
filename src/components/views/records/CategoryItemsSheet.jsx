import { formatNumber, formatPercent } from '../../../utils/format';
import { Badge, Money, Sheet } from '../../ui';

const n = (v) => formatNumber(v, { maxDecimals: 0 });
const pctText = (v) => formatPercent(v, { digits: 0 });

/** Drill-down for one category: money summary, every option group, items with profit. */
export default function CategoryItemsSheet({ category, breakdown, share, growthLabel, onClose }) {
  const detail = category ? breakdown[category.category] : null;
  return (
    <Sheet
      open={!!category}
      onClose={onClose}
      title={category ? String(category.category) : ''}
      description={category ? (
        <>
          <span className="num">{n(category.quantity)}</span> ชิ้น · <Money decimals={0} value={category.net} /> · {share}
        </>
      ) : null}
    >
      {detail && (
        <div className="flex flex-col gap-5">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              ['ยอดสุทธิ', <Money key="v" decimals={0} value={category.net} />],
              ['เทียบช่วงก่อน', growthLabel],
              ['จำนวนบิล', `${n(category.bills)} บิล`],
              ['เฉลี่ยต่อบิล', <Money key="v" decimals={0} value={category.avgPerBill} />],
              ['กำไรขั้นต้น', category.marginPct === null ? 'ยังไม่ผูกต้นทุน' : <Money key="v" decimals={0} value={category.grossProfit} />],
              ['มาร์จิ้น', category.marginPct === null ? '–' : `${pctText(category.marginPct)}${category.costCoverage < 90 ? ` (ต้นทุนครบ ${pctText(category.costCoverage)})` : ''}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] px-3 py-2 min-w-0">
                <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
                <dd className="num text-sm font-semibold text-[var(--text-primary)] break-words">{value}</dd>
              </div>
            ))}
          </dl>
          {category.discount > 0.5 && (
            <p className="-mt-3 text-xs text-[var(--text-muted)]">ก่อนส่วนลดท้ายบิล <Money decimals={0} value={category.gross} /> · ส่วนลดที่ปันมาหมวดนี้ <Money decimals={0} value={category.discount} /></p>
          )}

          {detail.options.map(({ group, options }) => (
            <section key={group} aria-label={group}>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">{group}</h3>
              <ul className="grid grid-cols-2 gap-2">
                {options.map((o) => (
                  <li key={o.label} className="rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] px-3 py-2 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] break-words">{o.label}</p>
                    <p className="text-xs text-[var(--text-muted)]"><span className="num">×{n(o.quantity)}</span> · {pctText((o.quantity / (category.quantity || 1)) * 100)} · <Money decimals={0} value={o.net} /></p>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <section aria-label="รายการที่ขาย">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">รายการที่ขาย ({detail.items.length})</h3>
            <ul className="flex flex-col divide-y divide-[var(--border-light)]">
              {detail.items.map((item) => (
                <li key={item.name} className="flex items-center gap-3 py-2.5">
                  <span className="num shrink-0 w-12 text-right font-semibold text-[var(--text-primary)]">×{n(item.quantity)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-[var(--text-primary)] break-words">{item.name}</span>
                    <span className="block text-xs text-[var(--text-muted)]">
                      เฉลี่ย <Money decimals={0} value={item.price} /> / ชิ้น
                      {item.marginPct === null ? null : <> · มาร์จิ้น <span className="num">{pctText(item.marginPct)}</span></>}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <Money decimals={0} value={item.net} className="block font-semibold" />
                    {item.marginPct === null
                      ? <Badge tone="neutral" size="xs">ยังไม่ผูกต้นทุน</Badge>
                      : <span className="block text-xs text-[var(--text-muted)]">กำไร <Money decimals={0} value={item.grossProfit} /></span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Sheet>
  );
}
