// Confirm sheets for the "ต้องแก้" tab: backfill missing deductions after a
// recipe fix, and deduct a completed bill that was never deducted. Both show
// exactly what will be taken off stock before anything is written.
import { History, PackageMinus } from 'lucide-react';
import { Banner, Button, Money, Sheet } from '../../ui';
import { qtyText } from './auditFormat';

const ROW = 'flex items-center justify-between gap-3 px-4 py-2.5 text-sm';

function StockRows({ rows }) {
  return (
    <ul className="divide-y divide-[var(--border-light)] rounded-[var(--radius)] bg-[var(--bg-sunken)]">
      {rows.map((r) => (
        <li key={r.stockId} className={ROW}>
          <span className="min-w-0 flex-1 break-words text-[var(--text-primary)]">{r.name}</span>
          <span className="num shrink-0 font-semibold text-[var(--text-primary)]">−{qtyText(r.qty)} {r.unit}</span>
          {r.cost !== undefined && <Money value={r.cost} muted className="w-16 shrink-0 text-right" />}
        </li>
      ))}
    </ul>
  );
}

const billLabel = (o) => [o.queueNumber != null ? `คิว ${o.queueNumber}` : 'บิล', o.time ? `${o.time} น.` : ''].filter(Boolean).join(' · ');

/**
 * @param {{ open, onClose, plan: ReturnType<planBackfill>, stockById: Map, busy, onConfirm }} props
 */
export function BackfillSheet({ open, onClose, plan, stockById, busy, onConfirm }) {
  const empty = !plan?.orders?.length;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      width={560}
      title="ตัดสต็อกที่ขาดย้อนหลัง"
      description="บิลที่ขายไปตอนสูตรยังไม่ครบ · ตัดส่วนที่ขาดตามสูตรที่แก้แล้ว ทำได้ครั้งเดียวต่อบิล"
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>ยกเลิก</Button>
          <Button leftIcon={<History size={18} />} loading={busy} disabled={empty} onClick={onConfirm}>
            ตัดสต็อก {plan?.totals?.length || 0} รายการ
          </Button>
        </div>
      )}
    >
      {empty ? (
        <Banner tone="ok" title="ไม่มีอะไรต้องตัดย้อนหลังแล้ว" />
      ) : (
        <div className="flex flex-col gap-4">
          <section aria-label="สต็อกที่จะถูกตัด" className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">จะตัดจากสต็อก</h3>
            <StockRows rows={plan.totals} />
            <p className="text-right text-sm text-[var(--text-secondary)]">รวมต้นทุน <Money value={plan.cost} /></p>
          </section>
          <section aria-label="บิลที่เกี่ยวข้อง" className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">จาก {plan.orders.length} บิล</h3>
            <ul className="flex flex-col gap-2">
              {plan.orders.map((o) => (
                <li key={o.orderId} className="rounded-[var(--radius-sm)] border border-[var(--border-light)] px-3 py-2 text-sm">
                  <p className="font-medium text-[var(--text-primary)]">{billLabel(o)}</p>
                  {o.lines.map((l) => (
                    <p key={l.itemKey} className="break-words text-[var(--text-secondary)]">
                      {l.name} ×{qtyText(l.quantity)} → {Object.entries(l.applied).map(([id, q]) => {
                        const s = stockById.get(id);
                        return `${s?.name || id} ${qtyText(q)} ${s?.unit || ''}`.trim();
                      }).join(' · ')}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Sheet>
  );
}

/**
 * @param {{ open, onClose, order, plan: ReturnType<planOrderDeduction>, stockById: Map, busy, onConfirm }} props
 */
export function DeductBillSheet({ open, onClose, order, plan, stockById, busy, onConfirm }) {
  const rows = Object.entries(plan?.applied || {}).map(([stockId, qty]) => {
    const s = stockById.get(stockId);
    return { stockId, name: s?.name || stockId, unit: s?.unit || '', qty };
  });
  const title = order ? `ตัดสต็อกบิล${order.queueNumber != null ? ` คิว ${order.queueNumber}` : ''}` : 'ตัดสต็อกบิลนี้';
  return (
    <Sheet
      open={open}
      onClose={onClose}
      width={520}
      title={title}
      description="บิลนี้เสร็จแล้วแต่ยังไม่ถูกตัดสต็อก · ตัดตามสูตรในบิล เหมือนตอนกด 'เสร็จ'"
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>ยกเลิก</Button>
          <Button leftIcon={<PackageMinus size={18} />} loading={busy} disabled={!order || !rows.length} onClick={onConfirm}>
            ตัดสต็อกบิลนี้
          </Button>
        </div>
      )}
    >
      {!order ? (
        <Banner tone="info" title="ไม่พบบิลนี้แล้ว" />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.length ? <StockRows rows={rows} /> : <Banner tone="warn" title="บิลนี้ไม่มีสูตรให้ตัด · ผูกสต็อกเมนูก่อน" />}
          {(plan?.skipped?.length > 0 || plan?.unlinked?.length > 0) && (
            <p className="text-sm text-[var(--text-muted)]">
              บางรายการสูตรยังไม่ครบ ({[...(plan.skipped || []).map((s) => s.item), ...(plan.unlinked || []).map((u) => u.name)]
                .filter((v, i, a) => a.indexOf(v) === i).join(', ')}) · ตัดแล้วแก้สูตร จะขึ้นให้ตัดส่วนที่ขาดย้อนหลังได้
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
