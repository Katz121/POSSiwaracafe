import { useEffect, useMemo, useState } from 'react';
import { PackagePlus, PackageMinus, Pencil, Trash2, ArrowRight, ClipboardCheck, Plus, X, Archive } from 'lucide-react';
import { Banner, Button, Money, NumberStepper, SearchSelect, SegmentedControl, Sheet } from '../../ui';
import { STOCK_CATEGORIES, getStockCategory } from '../../../config/constants';
import { formatNumber, formatThaiDate, formatTime } from '../../../utils/format';
import ExpenseForm from './ExpenseForm';
import StockStatusPill from './StockStatusPill';
import UnitCost from './UnitCost';
import { intakeFormFor, resolveStockIntake, toExpenseLine, validateExpense } from './expenseModel';
import { stockStatus, reorderPoint, emptyStockItem, stockItemForm } from './stockStatus';
import { findPack, inPacks, normalizePacks } from '../../../utils/stockIntake';

const qty = (n) => formatNumber(n, { maxDecimals: 3 });
const FIELD = 'w-full min-h-12 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-surface)] px-4 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus-visible:shadow-[var(--focus-ring)]';
const LABEL = 'mb-1.5 block text-sm font-medium text-[var(--text-secondary)]';

function Fact({ label, children }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] px-3 py-2.5">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="num mt-0.5 truncate text-base font-semibold text-[var(--text-primary)]">{children}</p>
    </div>
  );
}

// ── detail ──────────────────────────────────────────────────────────────────
function Detail({ item, onStep, onMode, onDelete, onRetire, onCount }) {
  const status = stockStatus(item);
  const unitCost = Number(item.unitCost) || 0;
  const onHand = Number(item.quantity) || 0;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-[var(--text-muted)]">คงเหลือ</p>
          <p className={`num text-4xl font-semibold leading-tight ${status.rank >= 2 ? 'text-[var(--state-danger)]' : 'text-[var(--text-primary)]'}`}>
            {qty(onHand)} <span className="text-lg font-medium text-[var(--text-secondary)]">{item.unit}</span>
          </p>
          {inPacks(item, onHand) && (
            <p className="num text-sm text-[var(--text-muted)]">≈ {formatNumber(inPacks(item, onHand).count, { maxDecimals: 1 })} {inPacks(item, onHand).label} (1 {inPacks(item, onHand).label} = {qty(inPacks(item, onHand).size)} {item.unit})</p>
          )}
        </div>
        <StockStatusPill item={item} size="md" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border-color)] px-3 py-2">
        <span className="text-sm text-[var(--text-secondary)]">ปรับทีละ 1 {item.unit}</span>
        <NumberStepper
          value={onHand}
          min={0}
          unit={item.unit}
          ariaLabel={`จำนวน ${item.name}`}
          onChange={(next) => onStep(item, next - onHand)}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Fact label="จุดสั่งซื้อขั้นต่ำ">{qty(reorderPoint(item))} {item.unit}</Fact>
        <Fact label="ต้นทุน/หน่วย"><UnitCost value={unitCost} /></Fact>
        <Fact label="มูลค่าคงเหลือ"><Money value={Math.max(0, onHand) * unitCost} /></Fact>
        <Fact label="หมวด">{getStockCategory(item)}</Fact>
      </div>
      {item.lastPurchaseAt && (
        <p className="text-sm text-[var(--text-muted)]">
          รับเข้าล่าสุด {formatThaiDate(item.lastPurchaseAt)} {formatTime(item.lastPurchaseAt)} น.
          {Number(item.lastPurchaseUnitCost) > 0 && <> · <UnitCost value={item.lastPurchaseUnitCost} />/{item.unit}</>}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button size="xl" fullWidth leftIcon={<PackagePlus size={20} />} onClick={() => onMode('intake')}>รับของเข้า</Button>
        {onCount && <Button variant="secondary" size="lg" fullWidth leftIcon={<ClipboardCheck size={18} />} onClick={() => onCount(item)}>ตรวจนับ (เทียบของจริง)</Button>}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" leftIcon={<PackageMinus size={18} />} onClick={() => onMode('adjust')}>ตัดของเสีย</Button>
          <Button variant="secondary" size="lg" leftIcon={<Pencil size={18} />} onClick={() => onMode('edit')}>แก้ไข</Button>
        </div>
      </div>

      <div className="border-t border-[var(--border-color)] pt-4">
        {onRetire && (
          <>
            <Button variant="secondary" fullWidth leftIcon={<Archive size={18} />} onClick={() => onRetire(item)}>เลิกใช้วัตถุดิบนี้</Button>
            <p className="mt-2 mb-4 text-xs text-[var(--text-muted)]">ไม่ใช้แล้ว · ไม่แจ้งเตือนสต็อกหมดอีก บิลเก่ายังคิดต้นทุนได้ กลับมาใช้ได้ภายหลัง (แนะนำแทนการลบ)</p>
          </>
        )}
        <Button variant="outline-danger" fullWidth leftIcon={<Trash2 size={18} />} onClick={() => onDelete(item)}>ลบวัตถุดิบนี้</Button>
        <p className="mt-2 text-xs text-[var(--text-muted)]">ลบออกจากคลังถาวร สูตรที่ผูกไว้จะกลายเป็นลิงก์เสีย</p>
      </div>
    </div>
  );
}

// ── receive stock (shared expense form) ─────────────────────────────────────
function Intake({ item, stock, form, setForm, errors, setErrors, onPick, formId, onSubmit, date }) {
  const preview = useMemo(() => {
    if (!item || !Number(form.quantity)) return null;
    return resolveStockIntake(toExpenseLine(form), stock);
  }, [item, form, stock]);
  const groups = useMemo(() => {
    const byCat = new Map();
    [...stock].sort((a, b) => String(a.name).localeCompare(String(b.name), 'th')).forEach((s) => {
      const c = getStockCategory(s);
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c).push(s);
    });
    return [...byCat.entries()];
  }, [stock]);

  const plan = preview?.plan;
  const lands = preview?.targetStock;
  return (
    <div className="flex flex-col gap-4">
      {onPick && (
        <div data-autofocus={item ? undefined : ''}>
          <p className={LABEL}>วัตถุดิบที่รับเข้า</p>
          <SearchSelect
            value={item?.id || ''}
            onChange={onPick}
            groups={groups}
            getOptionValue={(s) => s.id}
            getOptionLabel={(s) => s.name}
            placeholder="พิมพ์ค้นหาวัตถุดิบ..."
            className={FIELD}
          />
        </div>
      )}
      {item && (
        <>
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate font-semibold text-[var(--text-primary)]">{item.name}</p>
              <p className="num text-sm text-[var(--text-muted)]">
                ตอนนี้ {qty(item.quantity)} {item.unit} · ต้นทุน <UnitCost value={item.unitCost || 0} />/{item.unit}
              </p>
            </div>
            <StockStatusPill item={item} />
          </div>

          <ExpenseForm
            mode="intake"
            formId={formId}
            value={form}
            onChange={setForm}
            errors={errors}
            onClearError={(f) => setErrors((e) => ({ ...e, [f]: '' }))}
            onSubmit={onSubmit}
            stock={stock}
            autoFocusQuantity
          />

          {normalizePacks(item.packs).length > 0 && (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="หน่วยที่รับเข้า">
              <span className="text-sm text-[var(--text-muted)]">รับเป็น:</span>
              {[...normalizePacks(item.packs), { label: item.unit, size: 1 }].map((p) => {
                const on = (findPack(item, form.unit)?.label || form.unit) === p.label;
                return (
                  <button
                    key={p.label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setForm({ ...form, unit: p.label, pricePerUnit: Number(item.unitCost) ? Math.round(Number(item.unitCost) * p.size * 100) / 100 : form.pricePerUnit, amount: '' })}
                    className={`min-h-11 rounded-full border px-3.5 text-sm outline-none focus-visible:shadow-[var(--focus-ring)] ${on ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-semibold text-[var(--accent-soft-fg)]' : 'border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'}`}
                  >
                    {p.label}{p.size !== 1 ? <span className="num"> · {qty(p.size)} {item.unit}</span> : null}
                  </button>
                );
              })}
            </div>
          )}
          {plan?.ok && plan.factor !== 1 && (
            <p className="num rounded-[var(--radius-sm)] bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent-soft-fg)]">
              {qty(form.quantity)} {form.unit} × {qty(plan.factor)} = <b>{qty(plan.inQty)} {plan.stockUnit}</b> เข้าสต็อก · ต้นทุน <UnitCost value={plan.inUnitCost} />/{plan.stockUnit}
            </p>
          )}
          {preview?.unitMismatch && (
            <Banner tone="warn" title="หน่วยไม่ตรงกับสต็อก">
              {form.unit} แปลงเป็น {preview.targetStock?.unit} ไม่ได้ จะบันทึกเป็นรายจ่ายอย่างเดียว ยังไม่ลงสต็อก · ตั้ง "หน่วยซื้อ" ได้ที่ แก้ไขวัตถุดิบ (เช่น 1 {form.unit} = กี่ {preview.targetStock?.unit})
            </Banner>
          )}
          {lands && lands.id !== item.id && !preview.unitMismatch && (
            <Banner tone="warn" title={`ชื่อนี้ผูกกับ "${lands.name}" ในคลัง`}>
              ของที่รับจะไปลงที่ "{lands.name}" ตามชื่อซื้อที่เคยตั้งไว้
            </Banner>
          )}
          {plan?.ok && (
            <div className="rounded-[var(--radius)] border border-[var(--border-color)] p-3">
              <p className="mb-2 text-sm font-medium text-[var(--text-secondary)]">หลังบันทึก</p>
              <dl className="grid gap-1.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[var(--text-muted)]">คงเหลือ</dt>
                  <dd className="num flex items-center gap-1.5 text-[var(--text-primary)]">
                    {qty(lands.quantity)} <ArrowRight size={14} aria-label="เป็น" /> <b>{qty(plan.newQuantity)}</b> {plan.stockUnit}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[var(--text-muted)]">ต้นทุนเฉลี่ย/หน่วย</dt>
                  <dd className="num flex items-center gap-1.5 text-[var(--text-primary)]">
                    <UnitCost value={lands.unitCost || 0} /> <ArrowRight size={14} aria-label="เป็น" /> <b><UnitCost value={plan.newUnitCost} /></b>
                  </dd>
                </div>
              </dl>
            </div>
          )}
          <p className="text-xs text-[var(--text-muted)]">
            บันทึกเป็นรายจ่ายหมวด "{form.category}" วันที่ {formatThaiDate(date)} ด้วย (เหมือนกรอกในหน้ารายจ่าย)
          </p>
        </>
      )}
    </div>
  );
}

// ── waste / correction ──────────────────────────────────────────────────────
function Adjust({ item, input, setInput, formId, onSubmit }) {
  const amount = Number(input.amount);
  const valid = Number.isFinite(amount) && amount > 0;
  const unitCost = Number(item.unitCost) || 0;
  return (
    <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4">
      <p className="num text-sm text-[var(--text-secondary)]">
        {item.name} · คงเหลือ {qty(item.quantity)} {item.unit}
      </p>
      <SegmentedControl
        fullWidth
        ariaLabel="เหตุผล"
        value={input.reason}
        onChange={(reason) => setInput({ ...input, reason })}
        options={[
          { value: 'waste', label: 'ของเสีย (ทิ้ง)' },
          { value: 'correction', label: 'ปรับยอดให้ตรง' },
        ]}
      />
      <div>
        <label htmlFor={`${formId}-amt`} className={LABEL}>จำนวนที่ตัดออก ({item.unit})</label>
        <input
          id={`${formId}-amt`}
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          placeholder="0"
          data-autofocus
          value={input.amount}
          onChange={(e) => setInput({ ...input, amount: e.target.value })}
          className={`num ${FIELD}`}
        />
      </div>
      {valid && (
        <p className="num text-sm text-[var(--text-secondary)]">
          คงเหลือจะเป็น <b className="text-[var(--text-primary)]">{qty(Math.max(0, (Number(item.quantity) || 0) - amount))} {item.unit}</b>
          {input.reason === 'waste' && <> · บันทึกรายจ่ายของเสีย <b className="text-[var(--text-primary)]"><Money value={unitCost * amount} /></b></>}
        </p>
      )}
      {input.reason === 'waste' && !unitCost && (
        <Banner tone="warn" title="รายการนี้ยังไม่มีต้นทุน">มูลค่าของเสียจะเป็น ฿0 ตั้งต้นทุนได้ที่ "แก้ไข"</Banner>
      )}
      {input.reason === 'correction' && (
        <p className="text-sm text-[var(--text-muted)]">ปรับยอดให้ตรงของจริง ไม่บันทึกเป็นรายจ่าย</p>
      )}
    </form>
  );
}

// ── หน่วยซื้อ (ตัวเทียบ) ─────────────────────────────────────────────────────
// ซื้อเป็นขวด/ถุง/ลัง แต่สูตรตัดเป็นหน่วยของสต็อก (กรัม) · ตั้งไว้ครั้งเดียว รับของเข้าเลือก "ขวด" ได้เลย
function PacksEditor({ packs, unit, onChange, idBase }) {
  const update = (i, patch) => onChange(packs.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <fieldset className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border-color)] p-3">
      <legend className="px-1 text-sm font-medium text-[var(--text-secondary)]">หน่วยซื้อ (ตัวเทียบ)</legend>
      <p className="text-xs text-[var(--text-muted)]">
        เช่น น้ำช่อดอกมะพร้าว 1 ขวด = 1000 {unit || 'กรัม'} · ลัง (12 ขวด) = 12000 · ของเหลวที่ตัดเป็นกรัม ใส่น้ำหนักจริงของ 1 ขวด
      </p>
      {packs.map((p, i) => (
        <div key={i} className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor={`${idBase}-l${i}`} className="mb-1 block text-xs text-[var(--text-muted)]">1 หน่วยซื้อ</label>
            <input id={`${idBase}-l${i}`} type="text" placeholder="ขวด, ถุง, ลัง" value={p.label} onChange={(e) => update(i, { label: e.target.value })} className={FIELD} />
          </div>
          <span className="pb-3 text-[var(--text-muted)]" aria-hidden="true">=</span>
          <div className="min-w-0 flex-1">
            <label htmlFor={`${idBase}-s${i}`} className="mb-1 block text-xs text-[var(--text-muted)]">เท่ากับกี่ {unit || 'หน่วย'}</label>
            <input id={`${idBase}-s${i}`} type="number" inputMode="decimal" step="any" min="0" placeholder="1000" value={p.size} onChange={(e) => update(i, { size: e.target.value })} className={`num ${FIELD}`} />
          </div>
          <button type="button" aria-label={`ลบหน่วยซื้อ ${p.label || i + 1}`} onClick={() => onChange(packs.filter((_, j) => j !== i))}
            className="mb-0.5 flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--state-danger)] hover:bg-[var(--state-danger-soft)] outline-none focus-visible:shadow-[var(--focus-ring)]">
            <X size={20} />
          </button>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" leftIcon={<Plus size={16} />} onClick={() => onChange([...packs, { label: '', size: '' }])} className="self-start">
        เพิ่มหน่วยซื้อ
      </Button>
    </fieldset>
  );
}

// ── add / edit item ─────────────────────────────────────────────────────────
function ItemForm({ form, setForm, formId, onSubmit, creating }) {
  const set = (patch) => setForm({ ...form, ...patch });
  const f = (key) => `${formId}-${key}`;
  return (
    <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor={f('name')} className={LABEL}>ชื่อวัตถุดิบ</label>
        <input id={f('name')} type="text" required data-autofocus={creating ? '' : undefined} value={form.name} onChange={(e) => set({ name: e.target.value })} className={FIELD} />
      </div>
      <div>
        <label htmlFor={f('cat')} className={LABEL}>หมวดหมู่</label>
        <select id={f('cat')} value={form.category || 'อื่น ๆ'} onChange={(e) => set({ category: e.target.value })} className={`${FIELD} cursor-pointer`}>
          {STOCK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <label htmlFor={f('unit')} className={LABEL}>หน่วย</label>
          <input id={f('unit')} type="text" required placeholder="กรัม, ชิ้น" value={form.unit} onChange={(e) => set({ unit: e.target.value })} className={FIELD} />
        </div>
        <div className="min-w-0">
          <label htmlFor={f('cost')} className={LABEL}>ต้นทุน/หน่วย (บาท)</label>
          <input id={f('cost')} type="number" inputMode="decimal" step="any" required placeholder="0.00" value={form.unitCost} onChange={(e) => set({ unitCost: e.target.value })} className={`num ${FIELD}`} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <label htmlFor={f('qty')} className={LABEL}>คงเหลือ</label>
          <input id={f('qty')} type="number" inputMode="decimal" step="any" required value={form.quantity} onChange={(e) => set({ quantity: e.target.value })} className={`num ${FIELD}`} />
        </div>
        <div className="min-w-0">
          <label htmlFor={f('min')} className={LABEL}>จุดสั่งซื้อขั้นต่ำ</label>
          <input id={f('min')} type="number" inputMode="decimal" step="any" required value={form.minQuantity} onChange={(e) => set({ minQuantity: e.target.value })} className={`num ${FIELD}`} />
        </div>
      </div>
      <PacksEditor packs={form.packs || []} unit={form.unit} onChange={(packs) => set({ packs })} idBase={f('pack')} />
      {!creating && (
        <p className="text-xs text-[var(--text-muted)]">รับของที่ซื้อมาให้ใช้ "รับของเข้า" แทนการแก้ตัวเลขคงเหลือ ต้นทุนเฉลี่ยจะถูกคำนวณให้</p>
      )}
    </form>
  );
}

// Sheet's default first-focus lands on its close button, so point it at the
// field marked data-autofocus (quantity, amount, name, or the item picker).
const AUTOFOCUS = {
  get current() {
    const el = document.querySelector('[role=dialog] [data-autofocus]');
    return el && el.tagName !== 'INPUT' ? el.querySelector('input') : el;
  },
};

const TITLES = { detail: null, intake: 'รับของเข้า', adjust: 'ตัดของเสีย / ปรับยอด', edit: 'แก้ไขวัตถุดิบ', create: 'เพิ่มวัตถุดิบ' };

/**
 * One sheet for everything you do to a stock row. `state` = { mode, id, back }
 * (`back` = return to the detail view on cancel). The item is looked up live
 * from `stock`, so quantities update while the sheet is open.
 */
export default function StockSheet({ state, stock, onClose, onMode, onStep, onDelete, onRetire, onSaveItem, onAdjust, onIntake, onCount, busy, intakeDate }) {
  const open = !!state;
  const item = state?.id ? stock.find((s) => s.id === state.id) || null : null;
  const mode = state?.mode || 'detail';
  const formId = 'stock-sheet-form';

  // Form state resets whenever the sheet switches form or item (React's
  // "adjust state on prop change" pattern · no remount, so no re-animation).
  const [intakeForm, setIntakeForm] = useState(() => intakeFormFor(item));
  const [intakeErrors, setIntakeErrors] = useState({});
  const [adjustInput, setAdjustInput] = useState({ amount: '', reason: 'waste' });
  const [itemForm, setItemForm] = useState(() => (mode === 'edit' && item ? stockItemForm(item) : emptyStockItem()));
  const formKey = `${open}:${mode}:${item?.id || ''}`;
  const [prevKey, setPrevKey] = useState(formKey);
  if (formKey !== prevKey) {
    setPrevKey(formKey);
    setIntakeForm(intakeFormFor(item));
    setIntakeErrors({});
    setAdjustInput({ amount: '', reason: 'waste' });
    setItemForm(mode === 'edit' && item ? stockItemForm(item) : emptyStockItem());
  }

  // Switching form inside an open sheet (detail → รับของเข้า) moves focus to its first field.
  useEffect(() => {
    if (!open || mode === 'detail') return undefined;
    const t = setTimeout(() => AUTOFOCUS.current?.focus({ preventScroll: true }), 60);
    return () => clearTimeout(t);
  }, [open, mode, item?.id]);

  const cancel = () => (state?.back ? onMode('detail') : onClose());

  const submitIntake = (e) => {
    e.preventDefault();
    const errors = validateExpense(intakeForm);
    if (Object.keys(errors).length) { setIntakeErrors(errors); return; }
    onIntake(intakeForm);
  };
  const submitAdjust = (e) => {
    e.preventDefault();
    onAdjust(item, adjustInput);
  };
  const submitItem = (e) => {
    e.preventDefault();
    onSaveItem(itemForm, mode === 'edit' ? item : null);
  };

  let body = null;
  let footer = null;
  if (mode === 'detail' && item) {
    body = <Detail item={item} onStep={onStep} onMode={onMode} onDelete={onDelete} onRetire={onRetire} onCount={onCount} />;
  } else if (mode === 'intake') {
    body = (
      <Intake
        item={item}
        stock={stock}
        form={intakeForm}
        setForm={setIntakeForm}
        errors={intakeErrors}
        setErrors={setIntakeErrors}
        onPick={state?.pick ? (id) => onMode('intake', id) : null}
        formId={formId}
        onSubmit={submitIntake}
        date={intakeDate}
      />
    );
    footer = (
      <>
        <Button variant="secondary" size="lg" onClick={cancel}>{state?.back ? 'ย้อนกลับ' : 'ยกเลิก'}</Button>
        <Button type="submit" form={formId} size="lg" loading={busy} disabled={!item}>บันทึกรับของ</Button>
      </>
    );
  } else if (mode === 'adjust' && item) {
    body = <Adjust item={item} input={adjustInput} setInput={setAdjustInput} formId={formId} onSubmit={submitAdjust} />;
    footer = (
      <>
        <Button variant="secondary" size="lg" onClick={cancel}>{state?.back ? 'ย้อนกลับ' : 'ยกเลิก'}</Button>
        <Button type="submit" form={formId} size="lg" variant={adjustInput.reason === 'waste' ? 'danger' : 'primary'} loading={busy} disabled={!adjustInput.amount}>
          ยืนยันการตัด
        </Button>
      </>
    );
  } else if (mode === 'edit' || mode === 'create') {
    body = <ItemForm form={itemForm} setForm={setItemForm} formId={formId} onSubmit={submitItem} creating={mode === 'create'} />;
    footer = (
      <>
        <Button variant="secondary" size="lg" onClick={cancel}>{state?.back ? 'ย้อนกลับ' : 'ยกเลิก'}</Button>
        <Button type="submit" form={formId} size="lg" loading={busy}>{mode === 'create' ? 'เพิ่มเข้าคลัง' : 'บันทึก'}</Button>
      </>
    );
  }

  const title = mode === 'detail' ? (item?.name || 'วัตถุดิบ') : TITLES[mode];
  const description = mode === 'detail' && item ? getStockCategory(item) : (mode !== 'create' && item && mode !== 'intake' ? item.name : undefined);

  return (
    <Sheet open={open} onClose={onClose} title={title} description={description} footer={footer} width={460} initialFocus={AUTOFOCUS}>
      {body}
    </Sheet>
  );
}
