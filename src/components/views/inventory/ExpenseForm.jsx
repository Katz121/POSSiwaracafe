import { useId, useState } from 'react';
import { PackageCheck } from 'lucide-react';
import { EXPENSE_CATEGORIES } from '../../../config/constants';
import { isInventoryCategory, normalizeName } from '../../../utils/stockIntake';
import { applyExpenseTitle, displayTotal, displayUnitCost, rankTitleSuggestions, resolveStockIntake, toExpenseLine } from './expenseModel';

const FIELD = 'w-full min-h-12 rounded-[var(--radius-sm)] border bg-[var(--bg-surface)] px-4 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus-visible:shadow-[var(--focus-ring)] [&:read-only:not(select)]:bg-[var(--bg-sunken)] [&:read-only:not(select)]:text-[var(--text-secondary)]';
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
  retiredStock = [],
  onRestoreStock,
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
  // ซื้อวัตถุดิบที่ชื่อไม่ตรงของในสต็อก = บันทึกแล้วสร้างวัตถุดิบใหม่ · บอกก่อน กันพิมพ์ชื่อของที่ลบไปแล้ว
  const willCreate = inventory && !intake && String(value.title || '').trim() !== '' && resolveStockIntake(toExpenseLine(value), stock).newStock;
  // อื่น ๆ ที่ชื่อไม่ตรงของในสต็อก = ค่าใช้จ่ายร้าน (ไม่สร้างวัตถุดิบ ไม่นับเป็นต้นทุนวัตถุดิบ)
  // ชื่อตรงกับวัตถุดิบที่เลิกใช้ไว้ · เสนอกลับมาใช้ตัวเดิม แทนการสร้างตัวใหม่ซ้ำ
  const retiredMatch = willCreate && onRestoreStock
    ? retiredStock.find((s) => normalizeName(s.name) === normalizeName(String(value.title || ''))) || null
    : null;
  const [restoring, setRestoring] = useState(false);
  const restore = async () => {
    if (!retiredMatch || restoring) return;
    setRestoring(true);
    try {
      const ok = await onRestoreStock(retiredMatch);
      if (ok) onChange(applyExpenseTitle(value, value.title, suggestions, [...stock, { ...retiredMatch, archived: false }]));
    } finally { setRestoring(false); }
  };
  const otherNoStock = value.category === 'อื่น ๆ' && !intake && String(value.title || '').trim() !== '' && !resolveStockIntake(toExpenseLine(value), stock).targetStock;

  return (
    <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {!intake && (
        <Field id={ids.title} label="ชื่อรายจ่าย" error={errors.title} hint={otherNoStock ? 'หมวด อื่น ๆ ที่ไม่ตรงของในสต็อก นับเป็นค่าใช้จ่ายร้าน ไม่เข้าสต็อก' : retiredMatch ? undefined : willCreate ? <span className="text-[var(--state-warn)]">ไม่มี "{String(value.title).trim()}" ในสต็อก · บันทึกแล้วจะสร้างวัตถุดิบใหม่ ถ้าเป็นของเดิมให้เลือกชื่อจากรายการแนะนำ</span> : (inventory && suggestions.length > 0 ? 'เลือกชื่อจากรายการแนะนำ ชื่อวัตถุดิบจะตรงกับคลัง' : undefined)}>
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
          {retiredMatch && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--state-warn)] bg-[var(--state-warn-soft)] px-3 py-2">
              <p className="min-w-0 flex-1 text-sm text-[var(--text-primary)]">"{retiredMatch.name}" เลิกใช้อยู่ · กลับมาใช้ตัวเดิม ของจะเข้าตัวเดิม ไม่สร้างใหม่ซ้ำ</p>
              <button type="button" onClick={restore} disabled={restoring}
                className="min-h-11 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 text-sm font-semibold text-[var(--text-on-accent)] outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-60">
                {restoring ? 'กำลังเปิดใช้…' : 'กลับมาใช้ตัวเดิม'}
              </button>
            </div>
          )}
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
