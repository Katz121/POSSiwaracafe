import { useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, CookingPot, Plus, RotateCcw, XCircle, BookOpen,
} from 'lucide-react';
import UnitCost from './inventory/UnitCost';
import { auth } from '../../services/firebase';
import { useDataContext } from '../../context/AppContext';
import { useNavigate, useRouteParams } from '../../navigation';
import { getISODate } from '../../utils/calculations';
import { addDaysISO, formatThaiDate, formatTime } from '../../utils/format';
import {
  Badge, Banner, Button, DateStepper, EmptyState, Money, PageHeader, Skeleton, useToast,
} from '../ui';
import {
  BATCH_STATUS, checkAvailability, isPieceUnit, lastBatchFor, scaleRecipe,
} from '../../utils/production';
import { activeStock } from '../../utils/stockMerge';
import RowMenu from './inventory/RowMenu';
import TopConfirm from './inventory/TopConfirm';
import AddBatchSheet from './production/AddBatchSheet';
import CompleteBatchSheet from './production/CompleteBatchSheet';
import PrepSheet from './production/PrepSheet';
import useProductionBatches from './production/useProductionBatches';
import {
  cancelPlannedBatch, completeBatch, createBatch, reverseBatch, savePrepItem,
} from './production/productionActions';
import { PANEL, qty } from './production/productionModel';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const HISTORY_DAYS = 120;

const byTime = (a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''));

/**
 * ผลิตวันนี้ · `#/production?date=YYYY-MM-DD&make=<stockId>`
 * planned → ทำเสร็จ (ตัดวัตถุดิบจริง + เพิ่มผลผลิตจริง) → ย้อนได้ (คืนสต็อก)
 */
export default function ProductionView() {
  const { stock = [], menu = [] } = useDataContext();
  const params = useRouteParams();
  const navigate = useNavigate();
  const toast = useToast();
  const today = getISODate();
  const maxDate = addDaysISO(today, 7);

  // ── date · the URL follows (replace) ─────────────────────────────────────
  const paramDate = ISO_DAY.test(params.date || '') && params.date <= maxDate ? params.date : today;
  const [date, setDateState] = useState(paramDate);
  const [seenDate, setSeenDate] = useState(paramDate);
  if (paramDate !== seenDate) { setSeenDate(paramDate); setDateState(paramDate); }
  const setDate = (d) => {
    setDateState(d);
    setSeenDate(d);
    navigate('production', d === today ? {} : { date: d }, { replace: true });
  };

  const stockById = useMemo(() => new Map(stock.map((s) => [s.id, s])), [stock]);
  const pickable = useMemo(() => activeStock(stock), [stock]);
  const oldest = addDaysISO(today, -HISTORY_DAYS);
  const since = date < oldest ? date : oldest;
  const { batches, loading, error } = useProductionBatches(since);

  const day = useMemo(() => {
    const list = batches.filter((b) => b.date === date);
    const planned = list.filter((b) => b.status === BATCH_STATUS.PLANNED);
    // a batch whose output another planned batch needs goes first ("ทำก่อน")
    const needed = new Set(planned.flatMap((b) => (b.plannedIngredients || []).map((l) => l.stockId)));
    planned.sort((a, b) => (needed.has(b.outputStockId) - needed.has(a.outputStockId)) || byTime(a, b));
    return {
      planned,
      done: list.filter((b) => b.status === BATCH_STATUS.DONE).sort((a, b) => String(a.doneAt || '').localeCompare(String(b.doneAt || ''))),
      cancelled: list.filter((b) => b.status === BATCH_STATUS.CANCELLED).sort(byTime),
    };
  }, [batches, date]);
  const doneCost = day.done.reduce((s, b) => s + (Number(b.costTotal) || 0), 0);

  // ── sheets ────────────────────────────────────────────────────────────────
  const [add, setAdd] = useState(null); // { key, outputId }
  const [complete, setComplete] = useState(null); // batch id
  const [prep, setPrep] = useState(null); // { key, mode, id }
  const [confirm, setConfirm] = useState(null); // { kind: 'reverse'|'cancel', batch }
  const [busy, setBusy] = useState(false);
  const openAdd = (outputId = '') => setAdd({ key: Date.now(), outputId });

  // `#/production?make=<stockId>` (from the stock page ⋯ "ทำของเตรียม")
  const [seenMake, setSeenMake] = useState(null);
  if (params.make && params.make !== seenMake && stock.length) {
    setSeenMake(params.make);
    setAdd({ key: Date.now(), outputId: stockById.has(params.make) ? params.make : '' });
  }
  const closeAdd = () => {
    setAdd(null);
    if (params.make) navigate('production', date === today ? {} : { date }, { replace: true });
  };

  const by = auth.currentUser?.email || '';
  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      const out = await fn();
      if (okMsg) toast.success(typeof okMsg === 'function' ? okMsg(out) : okMsg);
      return true;
    } catch (e) {
      console.error(e);
      toast.error(e?.message || 'บันทึกไม่สำเร็จ');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitAdd = async (payload) => {
    const ok = await run(() => createBatch({ ...payload, date, by }), `เพิ่ม ${payload.output.name} ${qty(payload.rounds)} รอบแล้ว`);
    if (ok) closeAdd();
  };
  const makeFirst = async (row) => {
    const item = stockById.get(row.stockId);
    if (!item?.recipe?.ingredients?.length) {
      toast.warning(`${row.name} ยังไม่มีสูตรมาตรฐาน · ใส่สูตรก่อน`);
      setPrep({ key: Date.now(), mode: 'form', id: row.stockId });
      return;
    }
    const rounds = row.suggestRounds || 1;
    await run(
      () => createBatch({ output: item, rounds, ingredients: scaleRecipe(item.recipe, rounds, stockById), date, by }),
      `เพิ่ม "${item.name}" ${qty(rounds)} รอบ ไว้ทำก่อนแล้ว`,
    );
  };
  const completeTarget = batches.find((b) => b.id === complete) || null;
  const submitComplete = async ({ actualIngredients, yieldQty, wholePrice }) => {
    const ok = await run(
      () => completeBatch({ batchId: complete, actualIngredients, yieldQty, stockById, by, wholePrice }),
      (plan) => `บันทึกแล้ว · ได้ ${qty(plan.outputIncrement)} ${completeTarget?.outputUnit || ''} ต้นทุน ฿${plan.costTotal.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`,
    );
    if (ok) setComplete(null);
  };
  const doConfirm = async () => {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    if (c.kind === 'reverse') await run(() => reverseBatch({ batchId: c.batch.id, stockById, by }), 'ย้อนรายการแล้ว · คืนวัตถุดิบเข้าสต็อก');
    else await run(() => cancelPlannedBatch({ batchId: c.batch.id, by }), 'ยกเลิกรายการแล้ว');
  };
  const savePrep = async ({ id, form }) => {
    let savedId = null;
    const ok = await run(async () => { savedId = await savePrepItem({ id, form, stockById }); }, id ? 'บันทึกของเตรียมแล้ว' : `สร้าง "${form.name}" แล้ว`);
    if (!ok) return;
    const reopenAdd = prep?.fromAdd;
    setPrep(null);
    if (!id && reopenAdd) openAdd(savedId);
  };

  const empty = !loading && !day.planned.length && !day.done.length && !day.cancelled.length;

  return (
    <div className="h-full bg-[var(--bg-canvas)] flex flex-col overflow-hidden text-[var(--text-primary)]">
      <PageHeader
        title="ผลิตวันนี้"
        subtitle={formatThaiDate(date, { style: 'long', weekday: true })}
        icon={CookingPot}
        sticky={false}
        actions={(
          <>
            <DateStepper value={date} onChange={setDate} max={maxDate} />
            <Button variant="secondary" leftIcon={<BookOpen size={18} />} onClick={() => setPrep({ key: Date.now(), mode: 'list' })}>ของเตรียม</Button>
            <Button leftIcon={<Plus size={18} />} onClick={() => openAdd()}>เพิ่มรายการผลิต</Button>
          </>
        )}
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-[var(--page-pad)] pb-24 md:pb-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pt-4">
          {error && <Banner tone="danger" title={error} />}

          {!loading && !empty && (
            <p role="status" className="text-sm text-[var(--text-secondary)]">
              รอทำ <b className="num text-[var(--text-primary)]">{day.planned.length}</b> ·
              ทำเสร็จ <b className="num text-[var(--text-primary)]">{day.done.length}</b>
              {day.done.length > 0 && <> · ต้นทุนวัตถุดิบ <Money value={doneCost} className="font-semibold text-[var(--text-primary)]" /></>}
            </p>
          )}

          {loading ? (
            <div className="flex flex-col gap-3">{[0, 1].map((i) => <Skeleton key={i} height="7rem" rounded="lg" />)}</div>
          ) : empty ? (
            <EmptyState
              icon={CookingPot}
              title={date === today ? 'วันนี้ยังไม่มีรายการผลิต' : 'วันนี้ไม่มีรายการผลิต'}
              description="เพิ่มของที่จะทำ ระบบดึงสูตรมาให้ เช็คของพอไหม แล้วตัดสต็อกตามที่ใช้จริงตอนทำเสร็จ"
              actionLabel="เพิ่มรายการผลิต"
              onAction={() => openAdd()}
              className={PANEL}
            />
          ) : (
            <>
              {day.planned.length > 0 && (
                <section aria-labelledby="prod-planned" className="flex flex-col gap-3">
                  <h2 id="prod-planned" className="text-base font-semibold text-[var(--text-primary)]">รอทำ ({day.planned.length})</h2>
                  <ul className="flex flex-col gap-3">
                    {day.planned.map((b) => (
                      <PlannedCard
                        key={b.id}
                        batch={b}
                        stockById={stockById}
                        onComplete={() => setComplete(b.id)}
                        onCancel={() => setConfirm({ kind: 'cancel', batch: b })}
                        onMakeFirst={makeFirst}
                        busy={busy}
                      />
                    ))}
                  </ul>
                </section>
              )}
              {day.done.length > 0 && (
                <section aria-labelledby="prod-done" className="flex flex-col gap-3">
                  <h2 id="prod-done" className="text-base font-semibold text-[var(--text-primary)]">ทำเสร็จแล้ว ({day.done.length})</h2>
                  <ul className="flex flex-col gap-3">
                    {day.done.map((b) => <DoneCard key={b.id} batch={b} onReverse={() => setConfirm({ kind: 'reverse', batch: b })} />)}
                  </ul>
                </section>
              )}
              {day.cancelled.length > 0 && (
                <details className={`${PANEL} group`}>
                  <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium text-[var(--text-secondary)] outline-none focus-visible:shadow-[var(--focus-ring)]">
                    <XCircle size={16} aria-hidden="true" /> ยกเลิก/ย้อนแล้ว ({day.cancelled.length})
                    <ChevronDown size={16} className="ml-auto transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <ul className="divide-y divide-[var(--border-light)] border-t border-[var(--border-light)]">
                    {day.cancelled.map((b) => (
                      <li key={b.id} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 text-sm">
                        <span className="min-w-0 truncate text-[var(--text-secondary)]">{b.outputName} · {qty(b.rounds)} รอบ</span>
                        <span className="shrink-0 text-xs text-[var(--text-muted)]">{b.reversedAt ? 'ย้อนแล้ว คืนสต็อก' : 'ยกเลิกก่อนทำ'}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      </div>

      {add && (
        <AddBatchSheet
          key={add.key}
          open
          onClose={closeAdd}
          initialOutputId={add.outputId}
          stock={pickable}
          stockById={stockById}
          batches={batches}
          busy={busy}
          onSubmit={submitAdd}
          onMakeFirst={makeFirst}
          onNewPrep={() => { setAdd(null); setPrep({ key: Date.now(), mode: 'form', id: null, fromAdd: true }); }}
        />
      )}
      {completeTarget && (
        <CompleteBatchSheet
          key={completeTarget.id}
          open
          onClose={() => setComplete(null)}
          batch={completeTarget}
          stock={pickable}
          stockById={stockById}
          lastBatch={lastBatchFor(completeTarget.outputStockId, batches, stockById)}
          linkedMenus={menu.filter((m) => m.available !== false && (m.stockLinks || []).some((l) => l.stockId === completeTarget.outputStockId))}
          busy={busy}
          onConfirm={submitComplete}
        />
      )}
      {prep && (
        <PrepSheet
          key={prep.key}
          open
          onClose={() => setPrep(null)}
          initialMode={prep.mode}
          initialId={prep.id}
          stock={pickable}
          stockById={stockById}
          busy={busy}
          onSave={savePrep}
          onMake={(id) => { setPrep(null); openAdd(id); }}
        />
      )}
      <TopConfirm
        isOpen={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={doConfirm}
        title={confirm?.kind === 'reverse' ? 'ย้อนรายการที่ทำเสร็จ' : 'ยกเลิกรายการผลิต'}
        message={confirm?.kind === 'reverse'
          ? `คืนวัตถุดิบเข้าสต็อก และเอา ${confirm?.batch?.outputName} ${qty(confirm?.batch?.yieldQty)} ${confirm?.batch?.outputUnit || ''} ออกจากสต็อก?`
          : `ยกเลิก "${confirm?.batch?.outputName || ''}" ที่ยังไม่ได้ทำ? สต็อกไม่เปลี่ยน`}
        confirmText={confirm?.kind === 'reverse' ? 'ย้อนรายการ' : 'ยกเลิกรายการ'}
        cancelText="ไม่ใช่"
        variant="danger"
      />
    </div>
  );
}

function PlannedCard({ batch, stockById, onComplete, onCancel, onMakeFirst, busy }) {
  const check = checkAvailability(batch.plannedIngredients || [], stockById);
  const shortRows = check.rows.filter((r) => r.short > 0);
  const unit = batch.outputUnit || '';
  return (
    <li className={`${PANEL} p-4`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold text-[var(--text-primary)]">{batch.outputName}</p>
          <p className="num text-sm text-[var(--text-muted)]">
            {qty(batch.rounds)} รอบ
            {batch.expectedYield ? ` · คาดว่าได้ ${qty(batch.expectedYield)} ${unit}` : ''}
            {` · วัตถุดิบ ${(batch.plannedIngredients || []).length} อย่าง`}
          </p>
          {batch.note && <p className="mt-1 text-sm text-[var(--text-secondary)]">{batch.note}</p>}
        </div>
        {check.ok
          ? <Badge tone="ok" icon={<CheckCircle2 size={12} />}>ของพอ</Badge>
          : <Badge tone="warn" icon={<AlertTriangle size={12} />}>ขาด {check.shortCount}</Badge>}
        <RowMenu items={[{ key: 'cancel', label: 'ยกเลิกรายการ', icon: XCircle, danger: true, onSelect: onCancel }]} label={`ตัวเลือกของ ${batch.outputName}`} />
      </div>
      {shortRows.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {shortRows.map((r) => (
            <li key={r.stockId} className="flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--state-warn-soft)] px-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1 text-[var(--text-primary)]">
                <span className="font-medium">{r.name}</span>
                <span className="num text-[var(--text-secondary)]"> ขาด {qty(r.short)} {r.unit}</span>
              </span>
              {r.isPrep && (
                <Button size="sm" variant="secondary" leftIcon={<CookingPot size={16} />} disabled={busy} onClick={() => onMakeFirst(r)} aria-label={`ทำก่อน ${r.name} ${r.suggestRounds} รอบ`}>ทำก่อน</Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex justify-end">
        <Button leftIcon={<CheckCircle2 size={18} />} onClick={onComplete}>ทำเสร็จแล้ว</Button>
      </div>
    </li>
  );
}

function DoneCard({ batch, onReverse }) {
  const unit = batch.outputUnit || '';
  const pieces = isPieceUnit(unit);
  const [open, setOpen] = useState(false);
  return (
    <li className={`${PANEL} p-4`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold text-[var(--text-primary)]">{batch.outputName}</p>
          <p className="num text-sm text-[var(--text-muted)]">
            {qty(batch.rounds)} รอบ{batch.doneAt ? ` · เสร็จ ${formatTime(batch.doneAt)} น.` : ''}
          </p>
        </div>
        <Badge tone="ok" icon={<CheckCircle2 size={12} />}>เสร็จ</Badge>
        <RowMenu items={[{ key: 'reverse', label: 'ย้อนรายการ (คืนสต็อก)', icon: RotateCcw, danger: true, onSelect: onReverse }]} label={`ตัวเลือกของ ${batch.outputName}`} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] px-3 py-2">
          <dt className="text-xs text-[var(--text-muted)]">{pieces ? 'ตัดได้' : 'ได้จริง'}</dt>
          <dd className="num font-semibold text-[var(--text-primary)]">{qty(batch.yieldQty)} {unit}</dd>
        </div>
        <div className="rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] px-3 py-2">
          <dt className="text-xs text-[var(--text-muted)]">ต้นทุนรวม</dt>
          <dd className="font-semibold text-[var(--text-primary)]"><Money value={batch.costTotal} /></dd>
        </div>
        <div className="rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] px-3 py-2">
          <dt className="truncate text-xs text-[var(--text-muted)]">{pieces ? 'ต่อชิ้น' : `ต่อ ${unit}`}</dt>
          <dd className="font-semibold text-[var(--text-primary)]"><UnitCost value={batch.unitCost} /></dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-sm)] px-1 text-sm font-medium text-[var(--accent)] outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        ใช้อะไรไป {(batch.actualIngredients || []).length} อย่าง
        <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <ul className="mt-1 grid gap-1.5 sm:grid-cols-2">
          {(batch.actualIngredients || []).map((l) => (
            <li key={l.stockId} className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-[var(--text-secondary)]">{l.name}</span>
              <span className="num shrink-0 text-[var(--text-primary)]">{qty(l.qty)} {l.unit} · <Money value={l.cost} /></span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
