import { useId, useState } from 'react';
import { Check, Save } from 'lucide-react';
import { Button, Money } from '../../ui';
import { formatNumber } from '../../../utils/format';
import { countVariance, parseCountInput, varianceCost, varianceWords } from '../../../utils/stockCount';

const qty = (n) => formatNumber(n, { maxDecimals: 3 });
const NOTE_CHIPS = ['ของเสีย', 'ลืมลงของเข้า', 'ใช้เกินสูตร', 'นับผิดรอบก่อน'];
const FIELD = 'w-full min-h-12 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-surface)] px-4 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus-visible:shadow-[var(--focus-ring)]';

/** Live difference line: "ขาด 2 ขวด · -฿90" in danger, "เกิน …" in ok. */
export function VarianceLine({ item, counted }) {
  const system = Number(item.quantity) || 0;
  const v = countVariance(system, counted);
  const cost = varianceCost(v, item.unitCost);
  if (v === 0) {
    return <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--state-ok)]"><Check size={16} aria-hidden="true" /> ตรงกับในระบบ</p>;
  }
  const tone = v < 0 ? 'danger' : 'ok';
  return (
    <p className={`num flex flex-wrap items-center gap-x-2 text-base font-semibold ${v < 0 ? 'text-[var(--state-danger)]' : 'text-[var(--state-ok)]'}`}>
      <span>{varianceWords(v, item.unit)}</span>
      {Number(item.unitCost) > 0 && <Money value={cost} sign tone={tone} />}
      <span className="text-sm font-normal text-[var(--text-secondary)]">คงเหลือจะเป็น {qty(counted)} {item.unit}</span>
    </p>
  );
}

/**
 * Count one item. `showMatch` = the big "ตรงกับของจริง" button (sheet); the
 * count-mode list has its own ✓ button per row and hides it.
 * onMatch() / onSave({ countedQty, note }) return promises.
 */
export default function CountEntry({ item, busy = false, onMatch, onSave, showMatch = true, autoFocus = false, onCancel }) {
  const id = useId();
  const [raw, setRaw] = useState('');
  const [note, setNote] = useState('');
  const counted = parseCountInput(raw);
  const system = Number(item.quantity) || 0;
  const invalid = raw.trim() !== '' && counted == null;
  const same = counted != null && countVariance(system, counted) === 0;

  const submit = (e) => {
    e.preventDefault();
    if (counted == null || busy) return;
    if (same) onMatch?.(note);
    else onSave?.({ countedQty: counted, note });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {showMatch && (
        <>
          <Button type="button" size="xl" fullWidth leftIcon={<Check size={22} />} loading={busy} onClick={() => onMatch?.(note)}>
            ตรงกับของจริง
          </Button>
          <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]" aria-hidden="true">
            <span className="h-px flex-1 bg-[var(--border-color)]" />ไม่ตรง? กรอกจำนวนที่นับได้<span className="h-px flex-1 bg-[var(--border-color)]" />
          </div>
        </>
      )}

      <div>
        <label htmlFor={`${id}-qty`} className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
          นับได้จริง ({item.unit || 'หน่วย'})
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`${id}-qty`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            autoFocus={autoFocus}
            data-autofocus={showMatch ? undefined : ''}
            placeholder={`ในระบบ ${qty(system)}`}
            value={raw}
            aria-invalid={invalid || undefined}
            aria-describedby={`${id}-diff`}
            onChange={(e) => setRaw(e.target.value)}
            className={`num text-xl font-semibold ${FIELD}`}
          />
          <span className="shrink-0 text-base text-[var(--text-secondary)]">{item.unit}</span>
        </div>
        <div id={`${id}-diff`} aria-live="polite" className="mt-2 min-h-6">
          {invalid && <p className="text-sm text-[var(--state-danger)]">ใส่เป็นตัวเลข 0 ขึ้นไป</p>}
          {counted != null && <VarianceLine item={item} counted={counted} />}
        </div>
      </div>

      {counted != null && !same && (
        <div>
          <label htmlFor={`${id}-note`} className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
            สาเหตุ (ถ้ารู้)
          </label>
          <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="สาเหตุที่พบบ่อย">
            {NOTE_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                aria-pressed={note === chip}
                onClick={() => setNote(note === chip ? '' : chip)}
                className={`min-h-11 rounded-full border px-3.5 text-sm outline-none focus-visible:shadow-[var(--focus-ring)] ${
                  note === chip
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-semibold text-[var(--accent-soft-fg)]'
                    : 'border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                {chip}
              </button>
            ))}
          </div>
          <input
            id={`${id}-note`}
            type="text"
            maxLength={200}
            placeholder="หรือพิมพ์เอง"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={FIELD}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {onCancel && <Button variant="secondary" size="lg" onClick={onCancel} className="flex-1">ยกเลิก</Button>}
        <Button
          type="submit"
          size="lg"
          variant={showMatch && counted == null ? 'secondary' : 'primary'}
          leftIcon={<Save size={18} />}
          loading={busy}
          disabled={counted == null}
          className="flex-[2]"
          fullWidth={!onCancel}
        >
          {same ? 'บันทึกว่าตรง' : 'บันทึกและปรับยอด'}
        </Button>
      </div>
    </form>
  );
}
