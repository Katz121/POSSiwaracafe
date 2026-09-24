import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CookingPot, Plus } from 'lucide-react';
import { Banner, Button, NumberStepper, SearchSelect, SegmentedControl, Sheet } from '../../ui';
import { checkAvailability, expectedYieldFor, isPieceUnit, isPrep, lastBatchFor, scaleRecipe } from '../../../utils/production';
import { IngredientEditor, QtyInput } from './parts';
import { FIELD, LABEL, qty } from './productionModel';

const FORM_ID = 'production-add-form';

const toLines = (list) => list.map((l) => ({ stockId: l.stockId, qty: String(l.qty ?? '') }));
const parsed = (lines, stockById) => lines
  .filter((l) => l.stockId && Number(l.qty) > 0)
  .map((l) => ({ stockId: l.stockId, qty: Number(l.qty), name: stockById.get(l.stockId)?.name || '', unit: stockById.get(l.stockId)?.unit || '' }));

function initialFor(output, batches, stockById, rounds = 1) {
  const last = output ? lastBatchFor(output.id, batches, stockById) : null;
  if (output?.recipe?.ingredients?.length) {
    return { source: 'standard', lines: toLines(scaleRecipe(output.recipe, rounds, stockById)), yieldTotal: String(expectedYieldFor(output.recipe, rounds) || ''), saveAsStandard: false };
  }
  if (last) {
    return { source: 'last', lines: toLines(last.actualIngredients || []), yieldTotal: String(last.yieldQty || ''), saveAsStandard: false };
  }
  return { source: 'manual', lines: [], yieldTotal: '', saveAsStandard: true };
}

/**
 * "+ เพิ่มรายการผลิต" · pick a prep item, rounds, where the ingredients come
 * from (standard recipe / same as last time / typed), check stock, save as planned.
 * Mount with a fresh `key` per open so the initial state is recomputed.
 */
export default function AddBatchSheet({
  open, onClose, initialOutputId, stock, stockById, batches, busy,
  onSubmit, onMakeFirst, onNewPrep,
}) {
  const preps = useMemo(() => stock.filter(isPrep), [stock]);
  const [outputId, setOutputId] = useState(initialOutputId || '');
  const output = stockById.get(outputId);
  const [rounds, setRounds] = useState(1);
  const [form, setForm] = useState(() => initialFor(output, batches, stockById, 1));
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);

  const last = output ? lastBatchFor(output.id, batches, stockById) : null;
  const hasRecipe = Boolean(output?.recipe?.ingredients?.length);

  const pickOutput = (id) => {
    setOutputId(id);
    setRounds(1);
    setForm(initialFor(stockById.get(id), batches, stockById, 1));
    setTouched(false);
  };
  const applySource = (source, r = rounds) => {
    if (source === 'standard' && hasRecipe) {
      setForm((f) => ({ ...f, source, lines: toLines(scaleRecipe(output.recipe, r, stockById)), yieldTotal: String(expectedYieldFor(output.recipe, r) || ''), saveAsStandard: false }));
    } else if (source === 'last' && last) {
      setForm((f) => ({ ...f, source, lines: toLines(last.actualIngredients || []), yieldTotal: String(last.yieldQty || ''), saveAsStandard: false }));
      setRounds(Number(last.rounds) || 1);
    } else {
      setForm((f) => ({ ...f, source: 'manual', saveAsStandard: f.saveAsStandard || !hasRecipe }));
    }
  };
  const changeRounds = (r) => {
    const next = Math.max(0.5, Math.round(r * 2) / 2);
    setRounds(next);
    if (form.source === 'standard' && hasRecipe) applySource('standard', next);
  };

  const lines = parsed(form.lines, stockById);
  const availability = checkAvailability(lines, stockById);
  const errors = {
    output: !output ? 'เลือกของที่จะทำ' : '',
    lines: lines.length === 0 ? 'ใส่วัตถุดิบอย่างน้อย 1 รายการ' : '',
    yieldTotal: form.saveAsStandard && !(Number(form.yieldTotal) > 0) ? 'ใส่ผลที่คาดว่าจะได้ เพื่อบันทึกเป็นสูตร' : '',
  };
  const valid = !errors.output && !errors.lines && !errors.yieldTotal;

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || busy) return;
    onSubmit({ output, rounds, ingredients: lines, note, saveAsStandard: form.saveAsStandard, expectedYieldTotal: Number(form.yieldTotal) || 0 });
  };

  const unit = output?.unit || '';
  const sourceOptions = [
    { value: 'standard', label: 'สูตรมาตรฐาน', disabled: !hasRecipe },
    { value: 'last', label: 'เหมือนครั้งที่แล้ว', disabled: !last },
    { value: 'manual', label: 'กรอกเอง' },
  ];

  const footer = (
    <div className="flex w-full items-center justify-end gap-2">
      <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
      <Button type="submit" form={FORM_ID} loading={busy} leftIcon={<Plus size={18} />}>เพิ่มรายการ</Button>
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} width={560} title="เพิ่มรายการผลิต" description="วันนี้จะทำอะไร กี่รอบ ใช้อะไรบ้าง" footer={footer}>
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-6 pb-2" noValidate>
        <section className="flex flex-col gap-2">
          <label className={LABEL} htmlFor="prod-output">ของที่จะทำ</label>
          <div id="prod-output">
            <SearchSelect
              className={FIELD}
              value={outputId}
              onChange={pickOutput}
              groups={[['ของเตรียม', preps]]}
              getOptionValue={(s) => s.id}
              getOptionLabel={(s) => `${s.name} (${s.unit})`}
              placeholder={preps.length ? 'พิมพ์ชื่อ เช่น ซอสสตรอเบอรี่' : 'ยังไม่มีของเตรียม · สร้างใหม่ก่อน'}
            />
          </div>
          {touched && errors.output && <p role="alert" className="text-sm text-[var(--state-danger)]">{errors.output}</p>}
          <Button variant="ghost" leftIcon={<Plus size={18} />} onClick={onNewPrep} className="self-start">ของเตรียมใหม่</Button>
        </section>

        {output && (
          <>
            <section className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">จำนวนรอบ</p>
                <p className="text-xs text-[var(--text-muted)]">{hasRecipe ? `1 รอบได้ประมาณ ${qty(output.recipe.expectedYield)} ${unit}` : 'ยังไม่มีสูตรมาตรฐาน'}</p>
              </div>
              <NumberStepper value={rounds} onChange={changeRounds} min={0.5} step={0.5} unit="รอบ" ariaLabel="จำนวนรอบ" />
            </section>

            <section className="flex flex-col gap-3">
              <p className={LABEL}>วัตถุดิบที่ใช้</p>
              <SegmentedControl options={sourceOptions} value={form.source} onChange={(v) => applySource(v)} fullWidth ariaLabel="ที่มาของวัตถุดิบ" className="[&>button]:px-2" />
              {form.source === 'last' && last && (
                <p className="text-xs text-[var(--text-muted)]">ครั้งที่แล้ว {last.date} · {qty(last.rounds)} รอบ · ได้ {qty(last.yieldQty)} {unit}</p>
              )}
              <IngredientEditor
                lines={form.lines}
                onChange={(next) => setForm((f) => ({ ...f, lines: next, source: f.source === 'standard' ? 'manual' : f.source }))}
                stock={stock.filter((s) => s.id !== outputId)}
                stockById={stockById}
                idPrefix="add-ing"
              />
              {touched && errors.lines && <p role="alert" className="text-sm text-[var(--state-danger)]">{errors.lines}</p>}
            </section>

            <section className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border-color)] p-3">
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.saveAsStandard}
                  onChange={(e) => setForm((f) => ({ ...f, saveAsStandard: e.target.checked }))}
                  className="h-5 w-5 cursor-pointer accent-[var(--accent)]"
                />
                <span className="text-sm font-medium text-[var(--text-primary)]">บันทึกเป็นสูตรมาตรฐานของ {output.name}</span>
              </label>
              {form.saveAsStandard && (
                <div>
                  <label className={LABEL} htmlFor="add-yield">{isPieceUnit(unit) ? 'ตัดได้ประมาณกี่ชิ้น (ทั้งหมด)' : `คาดว่าจะได้ (${unit})`}</label>
                  <QtyInput id="add-yield" value={form.yieldTotal} onChange={(v) => setForm((f) => ({ ...f, yieldTotal: v }))} label="ผลที่คาดว่าจะได้" unit={unit} invalid={touched && Boolean(errors.yieldTotal)} />
                  <p className="mt-1 text-xs text-[var(--text-muted)]">ระบบเก็บเป็นสูตรต่อ 1 รอบ (หารด้วย {qty(rounds)} รอบ)</p>
                  {touched && errors.yieldTotal && <p role="alert" className="mt-1 text-sm text-[var(--state-danger)]">{errors.yieldTotal}</p>}
                </div>
              )}
            </section>

            {lines.length > 0 && (
              <section aria-label="เช็คของพอไหม" className="flex flex-col gap-2">
                {availability.ok ? (
                  <Banner tone="ok" icon={CheckCircle2} title="ของพอทำ" compact />
                ) : (
                  <Banner tone="warn" icon={AlertTriangle} title={`ของไม่พอ ${availability.shortCount} รายการ`} compact>
                    ยังเพิ่มรายการได้ · ของเตรียมที่ขาดกด "ทำก่อน" ให้ระบบเพิ่มรายการทำให้
                  </Banner>
                )}
                <ul className="flex flex-col divide-y divide-[var(--border-light)] rounded-[var(--radius-sm)] border border-[var(--border-color)]">
                  {availability.rows.map((row) => (
                    <li key={row.stockId} className="flex min-h-12 items-center gap-3 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{row.name || 'ไม่พบสต็อก'}</span>
                        <span className="num block text-xs text-[var(--text-muted)]">ใช้ {qty(row.need)} · มี {qty(row.onHand)} {row.unit}</span>
                      </span>
                      {row.short > 0 ? (
                        row.isPrep ? (
                          <Button size="sm" variant="secondary" leftIcon={<CookingPot size={16} />} onClick={() => onMakeFirst(row)} aria-label={`ทำก่อน ${row.name} ${row.suggestRounds} รอบ`}>ทำก่อน</Button>
                        ) : (
                          <span className="num shrink-0 text-sm font-semibold text-[var(--state-danger)]">ขาด {qty(row.short)}</span>
                        )
                      ) : (
                        <span className="shrink-0 text-sm font-semibold text-[var(--state-ok)]">พอ</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div>
              <label className={LABEL} htmlFor="add-note">โน้ต (ไม่บังคับ)</label>
              <input id="add-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={FIELD} placeholder="เช่น ทำให้ออเดอร์วันเกิด" />
            </div>
          </>
        )}
      </form>
    </Sheet>
  );
}
