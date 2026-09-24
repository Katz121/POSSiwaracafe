// Shared bits of the production screens: stock picker groups, the editable
// ingredient list and small layout helpers.
import { Plus, Trash2 } from 'lucide-react';
import { Button, SearchSelect } from '../../ui';
import { FIELD, stockGroups } from './productionModel';

/** Numeric text input that keeps what the user types (e.g. "0." while typing). */
export function QtyInput({ value, onChange, label, unit, id, invalid, className = '' }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step="any"
        min="0"
        aria-label={label}
        aria-invalid={invalid || undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${FIELD} num text-right ${invalid ? 'border-[var(--state-danger)]' : ''}`}
      />
      {unit !== undefined && <span className="min-w-10 shrink-0 text-sm text-[var(--text-secondary)]">{unit || 'หน่วย'}</span>}
    </span>
  );
}

/**
 * Editable ingredient rows [{ stockId, qty }] · qty kept as typed text.
 * `stock` is the pick list (active stock), `stockById` resolves names/units.
 */
export function IngredientEditor({ lines, onChange, stock, stockById, excludeIds = [], idPrefix = 'ing' }) {
  const groups = stockGroups(stock, excludeIds);
  const update = (i, patch) => onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const remove = (i) => onChange(lines.filter((_, idx) => idx !== i));
  const add = () => onChange([...lines, { stockId: '', qty: '' }]);
  return (
    <div className="flex flex-col gap-2">
      {lines.length === 0 && (
        <p className="rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] px-3 py-3 text-sm text-[var(--text-muted)]">ยังไม่มีวัตถุดิบ · กด "เพิ่มวัตถุดิบ"</p>
      )}
      <ol className="flex flex-col gap-2">
        {lines.map((line, i) => {
          const s = stockById.get(line.stockId);
          return (
            <li key={i} className="rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-canvas)] p-2.5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <SearchSelect
                    className={FIELD}
                    value={line.stockId}
                    onChange={(id) => update(i, { stockId: id })}
                    groups={groups}
                    getOptionValue={(item) => item.id}
                    getOptionLabel={(item) => String(item.name)}
                    placeholder={`วัตถุดิบ ${i + 1} · พิมพ์ค้นหา`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={`ลบวัตถุดิบ ${i + 1}${s ? ` ${s.name}` : ''}`}
                  className="shrink-0 w-11 h-11 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--state-danger)] hover:bg-[var(--state-danger-soft)] outline-none focus-visible:shadow-[var(--focus-ring)]"
                >
                  <Trash2 size={18} />
                </button>
              </div>
              <QtyInput
                id={`${idPrefix}-${i}`}
                className="mt-2"
                value={line.qty}
                onChange={(v) => update(i, { qty: v })}
                label={`ปริมาณ ${s?.name || `วัตถุดิบ ${i + 1}`}`}
                unit={s?.unit || ''}
              />
            </li>
          );
        })}
      </ol>
      <Button variant="secondary" leftIcon={<Plus size={18} />} onClick={add} className="self-start">เพิ่มวัตถุดิบ</Button>
    </div>
  );
}

/** Label + value pair used in cost previews. */
export function Fact({ label, children, strong = false }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] px-3 py-2.5">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className={`num mt-0.5 truncate ${strong ? 'text-lg' : 'text-base'} font-semibold text-[var(--text-primary)]`}>{children}</p>
    </div>
  );
}
