import { useState } from 'react';
import { CheckCircle2, History } from 'lucide-react';
import UnitCost from '../inventory/UnitCost';
import { Banner, Button, Money, Sheet } from '../../ui';
import { isPieceUnit, planBatchCompletion } from '../../../utils/production';
import { roundQty6 } from '../../../utils/stockMerge';
import { Fact, IngredientEditor, QtyInput } from './parts';
import { LABEL, qty } from './productionModel';

const FORM_ID = 'production-complete-form';
const toLines = (list = []) => list.map((l) => ({ stockId: l.stockId, qty: String(l.qty ?? '') }));

/**
 * "ทำเสร็จแล้ว" · adjust what was really used, type what really came out
 * (cakes: "ตัดได้กี่ชิ้น"), see the cost before confirming.
 * Mount with a fresh `key` per batch.
 */
export default function CompleteBatchSheet({ open, onClose, batch, stock, stockById, lastBatch, busy, onConfirm }) {
  const [lines, setLines] = useState(() => toLines(batch?.plannedIngredients));
  const [yieldText, setYieldText] = useState('');
  const [touched, setTouched] = useState(false);
  if (!batch) return null;

  const unit = batch.outputUnit || stockById.get(batch.outputStockId)?.unit || '';
  const pieces = isPieceUnit(unit);
  const actual = lines.filter((l) => l.stockId && l.qty !== '').map((l) => ({
    stockId: l.stockId, qty: Number(l.qty), name: stockById.get(l.stockId)?.name || '',
  }));
  const yieldQty = Number(yieldText);
  const plan = planBatchCompletion({ batch, actualIngredients: actual, yieldQty: yieldQty || 0, stockById });
  const costPreview = yieldQty > 0 && plan.ok ? plan : null;
  const error = !(yieldQty > 0) ? (pieces ? 'กรอกจำนวนชิ้นที่ตัดได้จริง' : 'กรอกผลที่ได้จริง') : !plan.ok ? plan.error : '';

  const useLast = () => {
    if (!lastBatch) return;
    // scale to this batch's rounds when the last one was a different size
    const ratio = Number(lastBatch.rounds) > 0 ? (Number(batch.rounds) || 1) / Number(lastBatch.rounds) : 1;
    setLines(toLines((lastBatch.actualIngredients || []).map((l) => ({ ...l, qty: roundQty6(Number(l.qty) * ratio) }))));
    setYieldText(String(roundQty6(Number(lastBatch.yieldQty) * ratio)));
  };

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (error || busy) return;
    onConfirm({ actualIngredients: actual, yieldQty });
  };

  const footer = (
    <div className="flex w-full items-center justify-end gap-2">
      <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
      <Button type="submit" form={FORM_ID} loading={busy} leftIcon={<CheckCircle2 size={18} />}>บันทึก ทำเสร็จ</Button>
    </div>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      width={560}
      title={`ทำเสร็จ · ${batch.outputName}`}
      description={`${qty(batch.rounds)} รอบ${batch.expectedYield ? ` · สูตรคาดไว้ ${qty(batch.expectedYield)} ${unit}` : ''}`}
      footer={footer}
    >
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-6 pb-2" noValidate>
        <section className="flex flex-col gap-2 rounded-[var(--radius)] border-2 border-[var(--accent)] p-3">
          <label className={LABEL} htmlFor="complete-yield">{pieces ? 'ตัดได้กี่ชิ้น' : `ได้จริงกี่ ${unit}`}</label>
          <QtyInput
            id="complete-yield"
            value={yieldText}
            onChange={setYieldText}
            label={pieces ? 'ตัดได้กี่ชิ้น' : `ได้จริงกี่ ${unit}`}
            unit={unit}
            invalid={touched && !(yieldQty > 0)}
          />
          <p className="text-xs text-[var(--text-muted)]">
            {pieces ? 'นับชิ้นที่ตัดได้จริงรอบนี้ · ต้นทุนต่อชิ้นหารด้วยจำนวนนี้' : 'ชั่ง/ตวงของที่ได้จริง ไม่ต้องตรงสูตร'}
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={LABEL}>วัตถุดิบที่ใช้จริง</p>
            {lastBatch && (
              <Button variant="ghost" size="sm" leftIcon={<History size={16} />} onClick={useLast}>ใช้เหมือนครั้งที่แล้ว</Button>
            )}
          </div>
          <IngredientEditor
            lines={lines}
            onChange={setLines}
            stock={stock.filter((s) => s.id !== batch.outputStockId)}
            stockById={stockById}
            idPrefix="done-ing"
          />
        </section>

        {costPreview ? (
          <section aria-label="ต้นทุนรอบนี้" className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <Fact label="ต้นทุนวัตถุดิบรวม" strong><Money value={costPreview.costTotal} /></Fact>
              <Fact label={pieces ? 'ต้นทุนต่อชิ้น' : `ต้นทุนต่อ ${unit}`} strong>
                <UnitCost value={costPreview.unitCost} />
              </Fact>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              สต็อก {batch.outputName} จะเพิ่ม <b className="num text-[var(--text-primary)]">{qty(costPreview.outputIncrement)} {unit}</b>
              {' '}· ต้นทุนเฉลี่ยใหม่ <UnitCost value={costPreview.newOutputUnitCost} />/{unit}
            </p>
            {costPreview.uncostedCount > 0 && (
              <Banner tone="warn" compact title={`วัตถุดิบ ${costPreview.uncostedCount} รายการยังไม่มีต้นทุน · ต้นทุนรอบนี้จะต่ำกว่าจริง`} />
            )}
          </section>
        ) : (
          touched && error && <p role="alert" className="text-sm font-medium text-[var(--state-danger)]">{error}</p>
        )}
      </form>
    </Sheet>
  );
}
