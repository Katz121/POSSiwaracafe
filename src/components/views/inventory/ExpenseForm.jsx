import { useId, useState } from 'react';
import { PackageCheck } from 'lucide-react';
import { EXPENSE_CATEGORIES } from '../../../config/constants';
import { isInventoryCategory } from '../../../utils/stockIntake';
import { applyExpenseTitle, displayTotal, displayUnitCost, rankTitleSuggestions } from './expenseModel';

const FIELD = 'w-full min-h-12 rounded-[var(--radius-sm)] border bg-[var(--bg-surface)] px-4 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus-visible:shadow-[var(--focus-ring)] read-only:bg-[var(--bg-sunken)] read-only:text-[var(--text-secondary)]';
const LABEL = 'mb-1.5 block text-sm font-medium text-[var(--text-secondary)]';

function Field({ id, label, error, hint, children }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={LABEL}>{label}</label>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="mt-1 text-sm text-[var(--state-danger)]">{error}</p>
      ) : hint ? (
        <p id={`${id}-msg`} className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

const border = (err) => (err ? 'border-[var(--state-danger)]' : 'border-[var(--border-strong)]');

/**
 * The expense / purchase form (fields moved from ExpensesView).
 *
 * Props:
 *  value, onChange(nextForm)      controlled form values
 *  errors, onClearError(field)    field errors from validateExpense
 *  onSubmit(event)
 *  mode        'expense' (default) | 'intake' (title + category fixed to one stock item)
 *  suggestions title suggestions (expense mode)
 *  stock       stock list (title → stock prefill)
 *  formId      lets a Sheet footer own the submit button
 *  children    rendered at the end of the form (submit button in page mode)
 */
export default function ExpenseForm({
  value,
  onChange,
  errors = {},
  onClearError,
  onSubmit,
  mode = 'expense',
  suggestions = [],
  stock = [],
  formId,
  autoFocusQuantity = false,
  children,
}) {
  const uid = useId();
  const ids = {
    title: `${uid}-title`, qty: `${uid}-qty`, unit: `${uid}-unit`, amount: `${uid}-amount`, cost: `${uid}-cost`, cat: `${uid}-cat`, list: `${uid}-list`,
  };
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [editingTotal, setEditingTotal] = useState(false);
  const intake = mode === 'intake';
  const inventory = isInventoryCategory(value.category);
  const visible = showSuggestions ? rankTitleSuggestions(suggestions, value.title) : [];
  const set = (patch, field) => {
    onChange({ ...value, ...patch });
    if (field && errors[field]) onClearError?.(field);
  };
  const computedTotal = Number(value.quantity) * Number(value.pricePerUnit) || 0;
  const described = (field, id) => (errors[field] ? `${id}-msg` : undefined);

  return (
    <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {!intake && (
        <Field id={ids.title} label="ชื่อรายจ่าย" error={errors.title} hint={inventory && suggestions.length > 0 ? 'เลือกชื่อจากรายการแนะนำ ชื่อวัตถุดิบจะตรงกับคลัง' : undefined}>
          <div className="relative">
            <input
              id={ids.title}
              type="text"
              placeholder="ซื้อนมสด, กาแฟ..."
              required
              autoComplete="off"
              role="combobox"
              aria-expanded={visible.length > 0}
              aria-controls={ids.list}
              aria-autocomplete="list"
              aria-invalid={!!errors.title}
              aria-describedby={described('title', ids.title)}
              value={value.title}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onChange={(e) => {
                onChange(applyExpenseTitle(value, e.target.value, suggestions, stock));
                setShowSuggestions(true);
                if (errors.title) onClearError?.('title');
              }}
              className={`${FIELD} ${border(errors.title)}`}
            />
            {visible.length > 0 && (
              <ul
                id={ids.list}
                role="listbox"
                className="absolute left-0 right-0 top-full z-[var(--z-dropdown)] mt-1 max-h-72 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-surface)] py-1 shadow-[var(--elev-2)]"
              >
                {visible.map((title) => (
                  <li key={title} role="option" aria-selected={title === value.title}>
                    <button
                      type="button"
                      tabIndex={-1}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        onChange(applyExpenseTitle(value, title, suggestions, stock));
                        setShowSuggestions(false);
                      }}
                      className="block min-h-11 w-full px-4 py-2.5 text-left text-base text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                    >
                      {title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field id={ids.qty} label={intake ? 'จำนวนที่รับเข้า' : 'จำนวน'} error={errors.quantity}>
          <input
            id={ids.qty}
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            placeholder="0"
            data-autofocus={autoFocusQuantity ? '' : undefined}
            aria-invalid={!!errors.quantity}
            aria-describedby={described('quantity', ids.qty)}
            value={value.quantity}
            onChange={(e) => set({ quantity: e.target.value }, 'quantity')}
            className={`num ${FIELD} ${border(errors.quantity)}`}
          />
        </Field>
        <Field id={ids.unit} label="หน่วย">
          <input
            id={ids.unit}
            type="text"
            placeholder="กล่อง, ถุง..."
            value={value.unit}
            onChange={(e) => set({ unit: e.target.value })}
            className={`${FIELD} ${border()}`}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field id={ids.amount} label="ราคารวม (บาท)" error={errors.amount}>
          <input
            id={ids.amount}
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            placeholder={computedTotal ? String(Number(computedTotal.toFixed(2))) : 'ยอดที่จ่ายจริง'}
            aria-invalid={!!errors.amount}
            aria-describedby={described('amount', ids.amount)}
            // While typing, an empty total stays empty (the qty × unit-cost
            // fallback shows as the placeholder) so it can be cleared and retyped.
            value={editingTotal && value.amount === '' ? '' : displayTotal(value)}
            onFocus={() => setEditingTotal(true)}
            onBlur={() => setEditingTotal(false)}
            onChange={(e) => set({ amount: e.target.value }, 'amount')}
            className={`num ${FIELD} ${border(errors.amount)}`}
          />
        </Field>
        <Field
          id={ids.cost}
          label="ต้นทุน/หน่วย"
          error={errors.pricePerUnit}
          hint={inventory && Number(value.quantity) > 0 ? 'คำนวณจากราคารวม' : undefined}
        >
          <input
            id={ids.cost}
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            placeholder="0.00"
            aria-invalid={!!errors.pricePerUnit}
            aria-describedby={described('pricePerUnit', ids.cost)}
            value={displayUnitCost(value)}
            onChange={(e) => set({ pricePerUnit: e.target.value }, 'pricePerUnit')}
            readOnly={inventory && Number(value.quantity) > 0}
            className={`num ${FIELD} ${border(errors.pricePerUnit)}`}
          />
        </Field>
      </div>

      {!intake && (
        <Field id={ids.cat} label="หมวดหมู่">
          <select
            id={ids.cat}
            value={value.category}
            onChange={(e) => set({ category: e.target.value })}
            className={`${FIELD} ${border()} cursor-pointer`}
          >
            {EXPENSE_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </Field>
      )}

      {!intake && inventory && (
        <p className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--state-ok-soft)] px-3 py-2 text-sm text-[var(--state-ok)]">
          <PackageCheck size={18} className="shrink-0" aria-hidden="true" />
          หมวดนี้จะลงสต็อกให้อัตโนมัติ
        </p>
      )}

      {children}
    </form>
  );
}
