import { Sheet } from '../../ui';
import { formatNumber, formatThaiDate, formatTime } from '../../../utils/format';
import { varianceWords } from '../../../utils/stockCount';
import UnitCost from '../inventory/UnitCost';
import CountEntry from './CountEntry';
import CountStatusPill from './CountStatusPill';
import useCountSaver from './useCountSaver';

const qty = (n) => formatNumber(n, { maxDecimals: 3 });

/**
 * "ตรวจนับ" one stock item. `itemId` = open; the item is looked up live from
 * `stock` so the system quantity follows sales while the sheet is open.
 */
export default function CountSheet({ itemId, stock, today, onClose }) {
  const item = itemId ? stock.find((s) => s.id === itemId) || null : null;
  const { save, busyId } = useCountSaver();
  const open = !!item;

  const done = async (input) => {
    const record = await save(item, input);
    if (record) onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="ตรวจนับ" description={item?.name} width={460}>
      {item && (
        <div className="flex flex-col gap-5">
          <div className="flex items-end justify-between gap-3 rounded-[var(--radius)] bg-[var(--bg-sunken)] px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm text-[var(--text-muted)]">ในระบบตอนนี้</p>
              <p className="num text-3xl font-semibold leading-tight text-[var(--text-primary)]">
                {qty(item.quantity)} <span className="text-base font-medium text-[var(--text-secondary)]">{item.unit}</span>
              </p>
              <p className="num text-xs text-[var(--text-muted)]">ต้นทุน <UnitCost value={item.unitCost || 0} />/{item.unit}</p>
            </div>
            <CountStatusPill item={item} today={today} size="md" />
          </div>
          <p className="-mt-2 text-sm text-[var(--text-secondary)]">นับของจริงที่ร้าน แล้วเทียบกับตัวเลขนี้</p>

          {/* key: a new item starts with an empty form */}
          <CountEntry
            key={item.id}
            item={item}
            busy={busyId === item.id}
            onMatch={(note) => done({ mode: 'match', note })}
            onSave={({ countedQty, note }) => done({ mode: 'set', countedQty, note })}
          />

          {item.lastCountedAt && (
            <p className="text-sm text-[var(--text-muted)]">
              ตรวจล่าสุด {formatThaiDate(item.lastCountedAt)} {formatTime(item.lastCountedAt)} น.
              {item.lastCountedBy ? ` โดย ${item.lastCountedBy}` : ''}
              {' · '}{varianceWords(item.lastCountVariance, item.unit)}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
