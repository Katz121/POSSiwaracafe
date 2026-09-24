import { Sparkles, X } from 'lucide-react';
import { Badge, Button, Money, Spinner } from '../../ui';
import { formatNumber } from '../../../utils/format';
import { CONFIDENCE_LABEL, selectedSuggestionCost } from '../../../utils/stockSuggest';
import { AI_THINKING_TEXT } from '../../../utils/museJobs';

const CONF_VARIANT = { high: 'success', medium: 'warning', low: 'neutral' };

/**
 * ผลลัพธ์ "AI แนะนำ" ผูกสต็อก · เจ้าของร้านอ่านเหตุผลแต่ละบรรทัด ติ๊กเลือก แล้วค่อยกดใส่
 * ไม่มีอะไรเข้าสูตรจนกว่าจะกด "ใส่ที่เลือก"
 */
export default function StockSuggestReview({ state, onToggle, onApply, onClose }) {
  if (!state) return null;
  if (state.loading) {
    return (
      <div data-stock-suggest="loading" className="rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-canvas)] p-4 flex items-center gap-3 text-sm text-[var(--text-secondary)]">
        <Spinner size="sm" /> {AI_THINKING_TEXT} · คิดสูตรมาตรฐานแล้วจับคู่กับสต็อกของร้าน อาจใช้ 1-3 นาที
      </div>
    );
  }
  const { lines = [], missing = [], recipe = [], notes = '' } = state;
  const selectable = lines.filter((l) => !l.alreadyLinked);
  const checkedCount = selectable.filter((l) => l.checked).length;
  const cost = selectedSuggestionCost(lines);

  return (
    <section data-stock-suggest="review" aria-label="AI แนะนำวัตถุดิบ" className="rounded-[var(--radius)] border-2 border-[var(--accent-ai)] bg-[var(--bg-canvas)] p-3 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <Sparkles size={18} className="text-[var(--accent-ai)]" aria-hidden="true" /> AI แนะนำ · ตรวจแล้วติ๊กเฉพาะที่ถูก
        </div>
        <button type="button" onClick={onClose} aria-label="ปิดคำแนะนำ AI" className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)]">
          <X size={18} />
        </button>
      </div>

      {recipe.length > 0 && (
        <p className="text-sm text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">สูตรมาตรฐาน: </span>
          {recipe.map((r) => (r.amount ? `${r.ingredient} ${r.amount}` : r.ingredient)).join(' · ')}
        </p>
      )}

      {lines.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">AI ไม่พบวัตถุดิบที่ตรงกับสต็อกของร้าน</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lines.map((l) => (
            <li key={l.stockId} data-suggest-line={l.stockId} className={`rounded-[var(--radius-sm)] border p-2.5 ${l.checked ? 'border-[var(--accent)] bg-[var(--accent-soft)]/40' : 'border-[var(--border-color)] bg-[var(--bg-surface)]'}`}>
              <label className={`flex items-start gap-3 ${l.alreadyLinked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  className="mt-1 w-5 h-5 shrink-0 accent-[var(--accent)]"
                  checked={l.alreadyLinked ? false : l.checked}
                  disabled={l.alreadyLinked}
                  onChange={() => onToggle(l.stockId)}
                />
                <span className="min-w-0 flex-1 flex flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-[var(--text-primary)]">{l.name}</span>
                    <span className="num text-sm text-[var(--text-primary)]">{formatNumber(l.usage, { maxDecimals: 4 })} {l.unit}</span>
                    {l.alreadyLinked
                      ? <Badge variant="neutral" size="sm">มีแล้ว</Badge>
                      : <Badge variant={CONF_VARIANT[l.confidence]} size="sm">{CONFIDENCE_LABEL[l.confidence]}</Badge>}
                    {l.unitCost > 0 && <span className="text-xs text-[var(--text-muted)]">ต้นทุน <Money value={l.cost} decimals={2} /></span>}
                  </span>
                  {l.ingredient && l.ingredient !== l.name && <span className="text-xs text-[var(--text-muted)]">ในสูตร: {l.ingredient}</span>}
                  {l.reason && <span className="text-sm text-[var(--text-secondary)]">{l.reason}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {missing.length > 0 && (
        <p className="text-sm text-[var(--state-warn)]"><b>ร้านยังไม่มีในสต็อก:</b> {missing.join(', ')}</p>
      )}
      {notes && <p className="text-sm text-[var(--text-secondary)]"><b>หมายเหตุ:</b> {notes}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-[var(--text-secondary)]">
          เลือก {checkedCount}/{selectable.length} · ต้นทุนเพิ่มต่อที่ <b className="text-[var(--text-primary)]"><Money value={cost} decimals={2} /></b>
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>ไม่ใช้</Button>
          <Button size="sm" disabled={!checkedCount} onClick={onApply} data-suggest-apply>ใส่ที่เลือก ({checkedCount})</Button>
        </div>
      </div>
    </section>
  );
}
