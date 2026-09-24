import { CheckSquare, QrCode, Square } from 'lucide-react';
import { ListRow, Money } from '../../ui';
import { billCode, billItemCount } from './billSearch';
import { PaidBadge } from './BillDetail';

/**
 * Bill rows (newest first). In merge mode a tap toggles the checkbox and paid
 * bills are disabled, exactly like the pre-v2 list.
 */
export default function BillList({
  bills,
  nameFor,
  selectedId,
  mergeMode = false,
  mergeIds,
  onSelect,
  showChevron = false,
}) {
  return (
    <ul className="flex flex-col divide-y divide-[var(--border-light)]" aria-label="รายการบิล">
      {bills.map((bill) => {
        const code = billCode(bill);
        const name = nameFor(bill);
        const checked = mergeMode && mergeIds.has(bill.id);
        const selected = mergeMode ? checked : bill.id === selectedId;
        const count = billItemCount(bill);
        return (
          <li key={bill.id}>
            <ListRow
              onClick={() => onSelect(bill)}
              disabled={mergeMode && bill.isPaid}
              selected={selected}
              className="min-h-16 px-3"
              leading={(
                <span className="flex items-center gap-2">
                  {mergeMode && (
                    <span className="text-[var(--accent)]" aria-hidden="true">
                      {checked ? <CheckSquare size={22} /> : <Square size={22} />}
                    </span>
                  )}
                  <span
                    className={`num w-11 h-11 rounded-[var(--radius-sm)] flex items-center justify-center text-lg font-semibold ${
                      selected ? 'bg-[var(--accent)] text-[var(--text-on-accent)]' : 'bg-[var(--bg-sunken)] text-[var(--text-primary)]'
                    }`}
                  >
                    <span className="sr-only">คิว </span>{Number(bill.queueNumber) || '–'}
                  </span>
                </span>
              )}
              title={(
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate">{name || <span className="num">บิล #{code}</span>}</span>
                  {bill.source === 'qr' && (
                    <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-[var(--state-info-soft)] px-1.5 text-xs font-medium text-[var(--state-info)]">
                      <QrCode size={12} aria-hidden="true" />QR
                    </span>
                  )}
                </span>
              )}
              subtitle={(
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <span className="num">{bill.time ? `${bill.time} น.` : ''}</span>
                  {name && <span className="num hidden sm:inline">· #{code}</span>}
                  <span>· <span className="num">{count}</span> ชิ้น</span>
                </span>
              )}
              meta={(
                <span className="flex flex-col items-end gap-1">
                  <Money value={bill.total || 0} className="font-semibold text-[var(--text-primary)]" />
                  <PaidBadge paid={bill.isPaid} size="xs" />
                </span>
              )}
              trailing={showChevron && !mergeMode ? undefined : null}
            />
          </li>
        );
      })}
    </ul>
  );
}
