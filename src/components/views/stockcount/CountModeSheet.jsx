import { useMemo, useState } from 'react';
import { Check, ClipboardCheck, Keyboard } from 'lucide-react';
import { Button, EmptyState, SegmentedControl, Sheet } from '../../ui';
import { STOCK_CATEGORIES, getStockCategory } from '../../../config/constants';
import { formatNumber } from '../../../utils/format';
import { countProgress, isCountedOn, varianceWords } from '../../../utils/stockCount';
import CountEntry from './CountEntry';
import CountStatusPill from './CountStatusPill';
import useCountSaver from './useCountSaver';

const qty = (n) => formatNumber(n, { maxDecimals: 3 });
const byCategoryThenName = (a, b) => {
  const ai = STOCK_CATEGORIES.indexOf(getStockCategory(a));
  const bi = STOCK_CATEGORIES.indexOf(getStockCategory(b));
  return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || String(a.name ?? '').localeCompare(String(b.name ?? ''), 'th');
};

function Row({ item, today, justDone, editing, busy, onEdit, onMatch, onSave, onCancel }) {
  const counted = isCountedOn(item, today);
  return (
    <li className={`rounded-[var(--radius)] border px-3 py-3 ${justDone ? 'border-[var(--state-ok)] bg-[var(--state-ok-soft)]' : 'border-[var(--border-color)] bg-[var(--bg-surface)]'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-40">
          <p className="truncate font-semibold text-[var(--text-primary)]">{String(item.name)}</p>
          <p className="num text-sm text-[var(--text-secondary)]">
            ในระบบ <b className="text-[var(--text-primary)]">{qty(item.quantity)}</b> {item.unit}
          </p>
          {justDone ? (
            <p className="mt-0.5 flex items-center gap-1 text-sm font-medium text-[var(--state-ok)]">
              <Check size={14} aria-hidden="true" /> บันทึกแล้ว · {varianceWords(item.lastCountVariance, item.unit)}
            </p>
          ) : (
            <CountStatusPill item={item} today={today} className="mt-1" />
          )}
        </div>
        {!editing && (
          <div className="flex shrink-0 gap-2">
            <Button
              variant={counted ? 'secondary' : 'primary'}
              size="lg"
              leftIcon={<Check size={18} />}
              loading={busy}
              onClick={() => onMatch(item)}
              aria-label={`${item.name} ตรงกับของจริง`}
            >
              ตรง
            </Button>
            <Button variant="secondary" size="lg" leftIcon={<Keyboard size={18} />} onClick={() => onEdit(item.id)} aria-label={`กรอกจำนวน ${item.name}`}>
              กรอก
            </Button>
          </div>
        )}
      </div>
      {editing && (
        <div className="mt-3 border-t border-[var(--border-color)] pt-3">
          <CountEntry
            item={item}
            busy={busy}
            showMatch={false}
            autoFocus
            onCancel={onCancel}
            onMatch={(note) => onMatch(item, note)}
            onSave={(input) => onSave(item, input)}
          />
        </div>
      )}
    </li>
  );
}

/**
 * "โหมดตรวจนับ" · walk the shelf: every row is ✓ ตรง or กรอกจำนวน.
 * Items counted during this session stay visible (green) so the list doesn't
 * jump under your finger, even with "ยังไม่ตรวจ" selected.
 */
export default function CountModeSheet({ open, stock, today, onClose }) {
  const [show, setShow] = useState('todo'); // todo | all
  const [category, setCategory] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [sessionDone, setSessionDone] = useState(() => new Set());
  const { save, busyId } = useCountSaver();

  // Fresh session each time the sheet opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setSessionDone(new Set()); setEditingId(null); setShow('todo'); }
  }

  const categories = useMemo(() => {
    const present = new Set(stock.map(getStockCategory));
    return STOCK_CATEGORIES.filter((c) => present.has(c)).concat([...present].filter((c) => !STOCK_CATEGORIES.includes(c)));
  }, [stock]);
  const scoped = useMemo(
    () => stock.filter((s) => category === 'all' || getStockCategory(s) === category).sort(byCategoryThenName),
    [stock, category],
  );
  const progress = countProgress(scoped, today);
  const rows = show === 'all' ? scoped : scoped.filter((s) => !isCountedOn(s, today) || sessionDone.has(s.id));

  const markDone = (id) => setSessionDone((prev) => new Set(prev).add(id));
  const onMatch = async (item, note = '') => {
    const r = await save(item, { mode: 'match', note });
    if (r) { markDone(item.id); setEditingId(null); }
  };
  const onSave = async (item, { countedQty, note }) => {
    const r = await save(item, { mode: 'set', countedQty, note });
    if (r) { markDone(item.id); setEditingId(null); }
  };

  const pct = Math.round(progress.ratio * 100);
  const footer = (
    <Button size="lg" fullWidth variant={progress.left === 0 ? 'primary' : 'secondary'} onClick={onClose}>
      {progress.left === 0 ? 'ตรวจครบแล้ว ปิด' : 'พักไว้ก่อน'}
    </Button>
  );

  return (
    <Sheet open={open} onClose={onClose} title="โหมดตรวจนับ" description="นับของจริงทีละรายการ ตรงกดตรง ไม่ตรงกรอกจำนวน" width={560} footer={footer}>
      <div className="flex flex-col gap-4">
        <div role="status" aria-live="polite">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <p className="text-base font-semibold text-[var(--text-primary)]">
              ตรวจแล้ว <span className="num">{formatNumber(progress.done)}/{formatNumber(progress.total)}</span>
            </p>
            <p className="num text-sm text-[var(--text-secondary)]">{progress.left > 0 ? `เหลือ ${formatNumber(progress.left)}` : 'ครบ'}</p>
          </div>
          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--bg-sunken)]"
            role="progressbar"
            aria-label="ความคืบหน้าการตรวจนับวันนี้"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
          >
            <div className="h-full rounded-full bg-[var(--state-ok)] transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            ariaLabel="แสดงรายการ"
            value={show}
            onChange={setShow}
            className="flex-1"
            fullWidth
            options={[
              { value: 'todo', label: 'ยังไม่ตรวจ', count: progress.left },
              { value: 'all', label: 'ทั้งหมด', count: progress.total },
            ]}
          />
          <label className="min-w-0 basis-full sm:basis-auto">
            <span className="sr-only">หมวดหมู่</span>
            <select
              value={category}
              onChange={(e) => { setCategory(e.target.value); setEditingId(null); }}
              className="min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] outline-none focus-visible:shadow-[var(--focus-ring)] cursor-pointer sm:w-auto sm:max-w-[12rem]"
            >
              <option value="all">ทุกหมวด</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            size="sm"
            tone="ok"
            title={scoped.length ? 'ตรวจครบทุกรายการแล้ววันนี้' : 'ไม่มีวัตถุดิบในหมวดนี้'}
            actionLabel={scoped.length ? 'ดูทั้งหมด' : undefined}
            onAction={scoped.length ? () => setShow('all') : undefined}
          />
        ) : (
          <ul className="flex flex-col gap-2" aria-label="รายการที่ต้องตรวจนับ">
            {rows.map((item) => (
              <Row
                key={item.id}
                item={item}
                today={today}
                justDone={sessionDone.has(item.id)}
                editing={editingId === item.id}
                busy={busyId === item.id}
                onEdit={setEditingId}
                onCancel={() => setEditingId(null)}
                onMatch={onMatch}
                onSave={onSave}
              />
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
