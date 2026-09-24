import { useState } from 'react';
import { CookingPot, Pencil, Plus, Save } from 'lucide-react';
import { Button, EmptyState, Input, Sheet } from '../../ui';
import { STOCK_CATEGORIES } from '../../../config/constants';
import { isPieceUnit, isPrep } from '../../../utils/production';
import { IngredientEditor, QtyInput } from './parts';
import { FIELD, LABEL, qty } from './productionModel';

const FORM_ID = 'prep-item-form';
const UNITS = ['กรัม', 'มล.', 'ชิ้น', 'ก้อน', 'ถาด', 'ขวด'];

const formFor = (item) => ({
  name: item?.name || '',
  unit: item?.unit || 'กรัม',
  category: item?.category || 'วัตถุดิบเบเกอรี่',
  shelfLifeDays: item?.shelfLifeDays ? String(item.shelfLifeDays) : '',
  minQuantity: item?.minQuantity ? String(item.minQuantity) : '',
  wholePrice: item?.wholePrice ? String(item.wholePrice) : '',
  ingredients: (item?.recipe?.ingredients || []).map((l) => ({ stockId: l.stockId, qty: String(l.qty) })),
  expectedYield: item?.recipe?.expectedYield ? String(item.recipe.expectedYield) : '',
  note: item?.recipe?.note || '',
});

/**
 * จัดการของเตรียม · list of prep items, and the create/edit form
 * (name, unit, standard recipe for ONE round, expected yield, shelf life).
 * Mount with a fresh `key` per open.
 */
export default function PrepSheet({ open, onClose, initialMode = 'list', initialId = null, stock, stockById, busy, onSave, onMake }) {
  const [mode, setMode] = useState(initialMode);
  const [editId, setEditId] = useState(initialId);
  const [form, setForm] = useState(() => formFor(initialId ? stockById.get(initialId) : null));
  const [touched, setTouched] = useState(false);
  const preps = stock.filter(isPrep).sort((a, b) => String(a.name).localeCompare(String(b.name), 'th'));

  const startEdit = (item) => {
    setEditId(item?.id || null);
    setForm(formFor(item));
    setTouched(false);
    setMode('form');
  };
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const lines = form.ingredients.filter((l) => l.stockId && Number(l.qty) > 0);
  const errors = {
    name: !form.name.trim() ? 'ใส่ชื่อ' : stock.some((s) => s.id !== editId && String(s.name).trim() === form.name.trim()) ? 'มีชื่อนี้ในสต็อกแล้ว' : '',
    unit: !form.unit.trim() ? 'ใส่หน่วย' : '',
    ingredients: lines.length === 0 ? 'ใส่วัตถุดิบในสูตรอย่างน้อย 1 รายการ' : '',
    expectedYield: !(Number(form.expectedYield) > 0) ? 'ใส่ผลที่ได้ต่อ 1 รอบ' : '',
  };
  const valid = Object.values(errors).every((x) => !x);
  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || busy) return;
    onSave({ id: editId, form: { ...form, ingredients: lines } });
  };
  const err = (k) => (touched && errors[k] ? errors[k] : undefined);
  const pieces = isPieceUnit(form.unit);

  const footer = mode === 'form' ? (
    <div className="flex w-full items-center justify-end gap-2">
      <Button variant="secondary" onClick={() => (initialMode === 'form' ? onClose() : setMode('list'))}>ยกเลิก</Button>
      <Button type="submit" form={FORM_ID} loading={busy} leftIcon={<Save size={18} />}>บันทึก</Button>
    </div>
  ) : (
    <div className="flex w-full items-center justify-end gap-2">
      <Button leftIcon={<Plus size={18} />} onClick={() => startEdit(null)}>ของเตรียมใหม่</Button>
    </div>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      width={560}
      title={mode === 'form' ? (editId ? `แก้ของเตรียม · ${stockById.get(editId)?.name || ''}` : 'ของเตรียมใหม่') : 'ของเตรียม'}
      description={mode === 'form' ? 'สูตรมาตรฐาน 1 รอบ · ตอนผลิตแก้ปริมาณจริงได้ทุกครั้ง' : 'ของที่ร้านทำเอง เช่น ซอส เนื้อเค้ก เค้กชิ้น'}
      footer={footer}
    >
      {mode === 'list' ? (
        preps.length === 0 ? (
          <EmptyState icon={CookingPot} title="ยังไม่มีของเตรียม" description="สร้างของเตรียมพร้อมสูตรมาตรฐาน แล้วสั่งผลิตได้ทุกวัน" actionLabel="ของเตรียมใหม่" onAction={() => startEdit(null)} />
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--border-light)] rounded-[var(--radius)] border border-[var(--border-color)]">
            {preps.map((p) => (
              <li key={p.id} className="flex min-h-14 items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-[var(--text-primary)]">{p.name}</span>
                  <span className="num block truncate text-xs text-[var(--text-muted)]">
                    มี {qty(p.quantity)} {p.unit}
                    {p.recipe?.ingredients?.length ? ` · สูตร ${p.recipe.ingredients.length} อย่าง ได้ ${qty(p.recipe.expectedYield)} ${p.unit}/รอบ` : ' · ยังไม่มีสูตร'}
                  </span>
                </span>
                <Button variant="ghost" size="sm" leftIcon={<Pencil size={16} />} onClick={() => startEdit(p)} aria-label={`แก้ ${p.name}`}>แก้</Button>
                <Button variant="secondary" size="sm" leftIcon={<CookingPot size={16} />} onClick={() => onMake(p.id)} aria-label={`ทำ ${p.name}`}>ทำ</Button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-5 pb-2" noValidate>
          <Input label="ชื่อ" required value={form.name} onChange={(e) => set({ name: e.target.value })} error={err('name')} placeholder="เช่น ซอสสตรอเบอรี่ · เค้กสตรอเบอรี่ (ชิ้น)" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input label="หน่วย" required value={form.unit} onChange={(e) => set({ unit: e.target.value })} error={err('unit')} list="prep-units" />
              <datalist id="prep-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
            </div>
            <div>
              <label htmlFor="prep-category" className={LABEL}>หมวด</label>
              <select id="prep-category" value={form.category} onChange={(e) => set({ category: e.target.value })} className={FIELD}>
                {STOCK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {pieces && (
            <p className="rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
              หน่วยชิ้น · ตอนทำเสร็จระบบจะถาม "ตัดได้กี่ชิ้น" แล้วหารต้นทุนให้ · เมนูเค้กชิ้นผูก 1 ชิ้นได้เลย
            </p>
          )}

          <section className="flex flex-col gap-2">
            <p className={LABEL}>สูตรมาตรฐาน 1 รอบ</p>
            <IngredientEditor
              lines={form.ingredients}
              onChange={(next) => set({ ingredients: next })}
              stock={stock.filter((s) => s.id !== editId)}
              stockById={stockById}
              idPrefix="prep-ing"
            />
            {err('ingredients') && <p role="alert" className="text-sm text-[var(--state-danger)]">{err('ingredients')}</p>}
          </section>

          <div>
            <label className={LABEL} htmlFor="prep-yield">{pieces ? '1 รอบตัดได้ประมาณกี่ชิ้น' : `1 รอบได้ประมาณ (${form.unit || 'หน่วย'})`}</label>
            <QtyInput id="prep-yield" value={form.expectedYield} onChange={(v) => set({ expectedYield: v })} label="ผลที่ได้ต่อ 1 รอบ" unit={form.unit} invalid={Boolean(err('expectedYield'))} />
            {err('expectedYield') && <p role="alert" className="mt-1 text-sm text-[var(--state-danger)]">{err('expectedYield')}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="เก็บได้กี่วัน" type="number" inputMode="numeric" min="0" value={form.shelfLifeDays} onChange={(e) => set({ shelfLifeDays: e.target.value })} hint="ไม่บังคับ" />
            <Input label="เตือนเมื่อเหลือ" type="number" inputMode="decimal" min="0" value={form.minQuantity} onChange={(e) => set({ minQuantity: e.target.value })} hint={form.unit || 'หน่วย'} />
          </div>
          {isPieceUnit(form.unit) && (
            <Input label="ราคาขายทั้งก้อน (บาท)" type="number" inputMode="decimal" min="0" value={form.wholePrice} onChange={(e) => set({ wholePrice: e.target.value })} hint="ไม่บังคับ · ตอนทำเสร็จระบบหารด้วยจำนวนชิ้นที่ตัดได้ เป็นราคาต่อชิ้น" />
          )}
          <Input label="โน้ตสูตร (ไม่บังคับ)" value={form.note} onChange={(e) => set({ note: e.target.value })} maxLength={300} placeholder="เช่น อบ 170° 25 นาที" />
        </form>
      )}
    </Sheet>
  );
}
