import { useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, Combine } from 'lucide-react';
import UnitCost from './UnitCost';
import { Banner, Button, EmptyState, Money, SearchSelect, Sheet } from '../../ui';
import { formatNumber } from '../../../utils/format';
import { activeStock, planMerge, suggestDuplicates } from '../../../utils/stockMerge';
import TopConfirm from './TopConfirm';

const qty = (n) => formatNumber(n, { maxDecimals: 3 });
const FIELD = 'w-full min-h-11 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus-visible:shadow-[var(--focus-ring)]';

function Preview({ plan }) {
  if (!plan) return null;
  if (!plan.ok) return <Banner tone="warn" compact title={plan.error} />;
  const { summary, keep } = plan;
  const moves = [
    summary.menuCount > 0 && `เมนู ${summary.menuCount}`,
    summary.modifierCount > 0 && `ตัวเลือก ${summary.modifierCount}`,
    summary.recipeCount > 0 && `สูตรของเตรียม ${summary.recipeCount}`,
  ].filter(Boolean);
  return (
    <dl className="grid grid-cols-3 gap-2 text-sm">
      <div className="rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] px-3 py-2">
        <dt className="text-xs text-[var(--text-muted)]">ยอดรวม</dt>
        <dd className="num font-semibold text-[var(--text-primary)]">{qty(summary.quantity)} {keep.update.unit || keep.unit}</dd>
      </div>
      <div className="rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] px-3 py-2">
        <dt className="text-xs text-[var(--text-muted)]">ต้นทุนใหม่</dt>
        <dd className="font-semibold text-[var(--text-primary)]"><UnitCost value={summary.unitCost} /></dd>
      </div>
      <div className="rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] px-3 py-2">
        <dt className="text-xs text-[var(--text-muted)]">ย้ายไปชี้ตัวนี้</dt>
        <dd className="font-semibold text-[var(--text-primary)]">{moves.length ? moves.join(' · ') : 'ไม่มี'}</dd>
      </div>
    </dl>
  );
}

function PairCard({ pair, stockById, menu, beanModifiers, onMerge, busy }) {
  const [keepId, setKeepId] = useState(pair.ids[0]);
  const mergeId = pair.ids.find((id) => id !== keepId);
  const plan = planMerge({ keepId, mergeIds: [mergeId], stock: [...stockById.values()], menu, beanModifiers });
  const name = (id) => String(stockById.get(id)?.name || '');
  return (
    <li className="rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-surface)] p-3">
      <fieldset>
        <legend className="mb-2 text-sm text-[var(--text-secondary)]">{pair.reason} · เลือกตัวที่เก็บไว้</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {pair.ids.map((id) => {
            const s = stockById.get(id);
            const on = id === keepId;
            return (
              <label
                key={id}
                className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border-2 px-3 py-2 ${on ? 'border-[var(--accent)] bg-[var(--bg-selected)]' : 'border-[var(--border-color)]'}`}
              >
                <input type="radio" name={`keep-${pair.key}`} checked={on} onChange={() => setKeepId(id)} className="h-5 w-5 shrink-0 accent-[var(--accent)]" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-[var(--text-primary)]">{s?.name}</span>
                  <span className="num block text-xs text-[var(--text-muted)]">{qty(s?.quantity)} {s?.unit} · <UnitCost value={s?.unitCost || 0} />/{s?.unit}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="mt-3"><Preview plan={plan} /></div>
      <div className="mt-3 flex justify-end">
        <Button
          variant="secondary"
          leftIcon={<Combine size={18} />}
          disabled={!plan.ok || busy}
          onClick={() => onMerge({ keepId, mergeIds: [mergeId], plan })}
        >
          รวม {name(mergeId)} <ArrowRight size={14} aria-hidden="true" className="mx-0.5 inline" /> {name(keepId)}
        </Button>
      </div>
    </li>
  );
}

/**
 * รวมรายการซ้ำ · suggested pairs (strong first, weak behind a toggle) and a
 * manual picker. Every merge shows the preview and asks once more.
 */
export default function MergeSheet({ open, onClose, stock, menu, beanModifiers, busy, onMerge }) {
  const stockById = useMemo(() => new Map(stock.map((s) => [s.id, s])), [stock]);
  const pairs = useMemo(() => suggestDuplicates(stock), [stock]);
  const strong = pairs.filter((p) => p.strength === 'strong');
  const weak = pairs.filter((p) => p.strength === 'weak');
  const [showWeak, setShowWeak] = useState(false);
  const [manual, setManual] = useState({ keepId: '', mergeId: '' });
  const [pending, setPending] = useState(null);
  const live = useMemo(() => activeStock(stock).sort((a, b) => String(a.name).localeCompare(String(b.name), 'th')), [stock]);
  const manualPlan = manual.keepId && manual.mergeId
    ? planMerge({ keepId: manual.keepId, mergeIds: [manual.mergeId], stock, menu, beanModifiers })
    : null;

  const ask = (req) => setPending(req);
  const confirm = async () => {
    const req = pending;
    setPending(null);
    if (!req) return;
    const ok = await onMerge(req);
    if (ok && req.manual) setManual({ keepId: '', mergeId: '' });
  };
  const keepName = pending ? stockById.get(pending.keepId)?.name : '';
  const mergeName = pending ? pending.mergeIds.map((id) => stockById.get(id)?.name).join(', ') : '';

  const cardProps = { stockById, menu, beanModifiers, onMerge: ask, busy };

  return (
    <Sheet open={open} onClose={onClose} width={600} title="รวมรายการซ้ำ" description="ของชิ้นเดียวกันที่ถูกสร้างไว้หลายชื่อ · รวมแล้วยอดคงเหลือบวกกัน เมนูย้ายมาชี้ตัวที่เก็บไว้">
      <div className="flex flex-col gap-5 pb-2">
        <Banner tone="info" compact title="รายการที่ถูกรวมไม่ถูกลบ">
          เก็บไว้เป็น "รวมแล้ว" เพื่อให้บิลเก่ายังตรวจย้อนหลังได้ · ใบเสร็จที่ใช้ชื่อเดิมจะเข้าตัวที่เก็บไว้
        </Banner>

        <section aria-labelledby="merge-strong" className="flex flex-col gap-2">
          <h3 id="merge-strong" className="text-base font-semibold text-[var(--text-primary)]">น่าจะซ้ำ ({strong.length})</h3>
          {strong.length === 0 ? (
            <EmptyState size="sm" icon={Combine} title="ไม่พบรายการที่น่าจะซ้ำ" />
          ) : (
            <ul className="flex flex-col gap-3">{strong.map((p) => <PairCard key={p.key} pair={p} {...cardProps} />)}</ul>
          )}
        </section>

        {weak.length > 0 && (
          <section className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowWeak((v) => !v)}
              aria-expanded={showWeak}
              className="inline-flex min-h-11 items-center gap-2 self-start rounded-[var(--radius-sm)] px-1 text-sm font-semibold text-[var(--accent)] outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              ชื่อคล้ายกัน อาจเป็นคนละอย่าง ({weak.length})
              <ChevronDown size={16} className={`transition-transform ${showWeak ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {showWeak && <ul className="flex flex-col gap-3">{weak.map((p) => <PairCard key={p.key} pair={p} {...cardProps} />)}</ul>}
          </section>
        )}

        <section aria-labelledby="merge-manual" className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border-color)] p-3">
          <h3 id="merge-manual" className="text-base font-semibold text-[var(--text-primary)]">เลือกเอง</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-sm font-medium text-[var(--text-secondary)]">รายการที่จะรวมออก</p>
              <SearchSelect className={FIELD} value={manual.mergeId} onChange={(id) => setManual((m) => ({ ...m, mergeId: id }))} groups={[['สต็อก', live.filter((s) => s.id !== manual.keepId)]]} getOptionValue={(s) => s.id} getOptionLabel={(s) => `${s.name} (${s.unit})`} placeholder="พิมพ์ชื่อ" />
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium text-[var(--text-secondary)]">เก็บไว้ที่</p>
              <SearchSelect className={FIELD} value={manual.keepId} onChange={(id) => setManual((m) => ({ ...m, keepId: id }))} groups={[['สต็อก', live.filter((s) => s.id !== manual.mergeId)]]} getOptionValue={(s) => s.id} getOptionLabel={(s) => `${s.name} (${s.unit})`} placeholder="พิมพ์ชื่อ" />
            </div>
          </div>
          <Preview plan={manualPlan} />
          <div className="flex justify-end">
            <Button leftIcon={<Combine size={18} />} disabled={!manualPlan?.ok || busy} onClick={() => ask({ keepId: manual.keepId, mergeIds: [manual.mergeId], plan: manualPlan, manual: true })}>รวม</Button>
          </div>
        </section>
      </div>

      <TopConfirm
        isOpen={!!pending}
        onClose={() => setPending(null)}
        onConfirm={confirm}
        title="ยืนยันรวมรายการ"
        message={pending?.plan?.ok
          ? `รวม "${mergeName}" เข้า "${keepName}" · ยอดรวม ${qty(pending.plan.summary.quantity)} ${pending.plan.keep.update.unit || pending.plan.keep.unit} · ย้ายเมนู ${pending.plan.summary.menuCount} รายการ`
          : ''}
        confirmText="รวม"
        cancelText="ยกเลิก"
        variant="primary"
      />
    </Sheet>
  );
}
