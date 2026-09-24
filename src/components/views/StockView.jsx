import { useMemo, useState } from 'react';
import { Package, PackagePlus, PackageMinus, Pencil, Plus, Trash2, SearchX, CookingPot, Combine, SpellCheck } from 'lucide-react';
import { collection, doc, updateDoc, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { useDataContext, useUIContext } from '../../context/AppContext';
import { useNavigate, useRouteParams } from '../../navigation';
import { getISODate } from '../../utils/calculations';
import { formatNumber } from '../../utils/format';
import {
  Badge, Banner, Button, DataTable, EmptyState, FilterChips, NumberStepper, PageHeader, Skeleton, Toolbar,
  useMediaQuery, useToast,
} from '../ui';
import { isArchivedStock, planUnitFixes, suggestDuplicates } from '../../utils/stockMerge';
import { isPrep } from '../../utils/production';
import MergeSheet from './inventory/MergeSheet';
import { runMerge, runUnitFixes } from './production/productionActions';
import { auth } from '../../services/firebase';
import { STOCK_CATEGORIES, getStockCategory } from '../../config/constants';
import StockSheet from './inventory/StockSheet';
import StockStatusPill from './inventory/StockStatusPill';
import RowMenu from './inventory/RowMenu';
import UnitCost from './inventory/UnitCost';
import TopConfirm from './inventory/TopConfirm';
import { saveExpense, reportSave, syncMessage } from './inventory/expenseSave';
import {
  isOut, matchesStockFilter, matchesStockSearch, needsRestock, normalizeStockFilter, reorderPoint, sortStockForReview, stockStatus,
} from './inventory/stockStatus';
// ── ตรวจนับสต็อกหน้างาน (stock count) ──
import { ClipboardCheck, ClipboardList } from 'lucide-react';
import CountSheet from './stockcount/CountSheet';
import CountModeSheet from './stockcount/CountModeSheet';
import CountStatusPill from './stockcount/CountStatusPill';
import { COUNT_FILTER, matchesCountFilter, normalizeFilterWithCount } from '../../utils/stockCount';

const qty = (n) => formatNumber(n, { maxDecimals: 3 });
// Keeps taps on the stepper / menu from also opening the row sheet.
const stop = { onClick: (e) => e.stopPropagation(), onKeyDown: (e) => e.stopPropagation() };

export default function StockView() {
  const { stock: allStock, menu = [], beanModifiers = [], isSyncing } = useDataContext();
  // merged (archived) docs stay in `allStock` for history · the page works on the live ones
  const stock = useMemo(() => allStock.filter((s) => !isArchivedStock(s)), [allStock]);
  const mergedCount = allStock.length - stock.length;
  const { runDbAction } = useUIContext();
  const params = useRouteParams();
  const navigate = useNavigate();
  const toast = useToast();
  const wide = useMediaQuery('(min-width: 768px)');

  // ── filters · `#/stock?filter=low` pre-selects, and the URL follows the chips
  const paramFilter = normalizeFilterWithCount(params.filter, normalizeStockFilter);
  const [filter, setFilterState] = useState(paramFilter);
  const [seenParam, setSeenParam] = useState(paramFilter);
  if (paramFilter !== seenParam) { // a deep link arrived while this view was open
    setSeenParam(paramFilter);
    setFilterState(paramFilter);
  }
  const setFilter = (next) => {
    const value = normalizeFilterWithCount(next, normalizeStockFilter);
    setFilterState(value);
    setSeenParam(value);
    navigate('stock', value === 'all' ? {} : { filter: value }, { replace: true });
  };
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');

  const today = getISODate(); // stock count: "ตรวจแล้ววันนี้"
  const [countId, setCountId] = useState(null);
  // `#/stock?count=<stockId>` (ปุ่ม "ไปตรวจนับ" หน้าสรุปขาย & สต็อก) เปิดหน้าตรวจนับของตัวนั้นทันที
  const [seenCountParam, setSeenCountParam] = useState(null);
  if (params.count && params.count !== seenCountParam && stock.some((s) => s.id === params.count)) {
    setSeenCountParam(params.count);
    setCountId(params.count);
  }
  const closeCount = () => {
    setCountId(null);
    if (params.count) navigate('stock', filter === 'all' ? {} : { filter }, { replace: true });
  };
  const [countMode, setCountMode] = useState(false);
  const sorted = useMemo(() => sortStockForReview(filter === 'merged' ? allStock : stock), [filter, allStock, stock]);
  const counts = useMemo(() => ({
    all: stock.length,
    low: stock.filter(needsRestock).length,
    out: stock.filter(isOut).length,
    uncounted: stock.filter((s) => matchesCountFilter(s, COUNT_FILTER, today)).length,
  }), [stock, today]);
  const categories = useMemo(() => {
    const present = new Set(stock.map(getStockCategory));
    return STOCK_CATEGORIES.filter((c) => present.has(c)).concat([...present].filter((c) => !STOCK_CATEGORIES.includes(c)));
  }, [stock]);
  const rows = useMemo(() => sorted.filter((item) => (
    matchesStockFilter(item, filter)
    && matchesCountFilter(item, filter, today)
    && (category === 'all' || getStockCategory(item) === category)
    && matchesStockSearch(item, search)
  )), [sorted, filter, category, search, today]);
  const filtering = filter !== 'all' || category !== 'all' || search.trim() !== '';

  // ── รวมรายการซ้ำ + หน่วยสะกดผิด
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeBusy, setMergeBusy] = useState(false);
  const strongDupes = useMemo(() => suggestDuplicates(allStock).filter((p) => p.strength === 'strong').length, [allStock]);
  const unitFixes = useMemo(() => planUnitFixes(stock), [stock]);
  const doMerge = async ({ keepId, mergeIds }) => {
    setMergeBusy(true);
    try {
      const plan = await runMerge({ keepId, mergeIds, stock: allStock, menu, beanModifiers, by: auth.currentUser?.email || '' });
      toast.success(`รวมเข้า "${plan.keep.name}" แล้ว · ย้ายเมนู ${plan.summary.menuCount} รายการ`);
      return true;
    } catch (e) {
      console.error(e);
      toast.error(`รวมไม่สำเร็จ: ${e.message}`);
      return false;
    } finally {
      setMergeBusy(false);
    }
  };
  const fixUnits = async () => {
    const ok = await runDbAction(() => runUnitFixes(unitFixes), 'แก้หน่วยไม่สำเร็จ');
    if (ok) toast.success(`แก้หน่วย ${unitFixes.length} รายการแล้ว`);
  };
  const clearFilters = () => { setFilter('all'); setCategory('all'); setSearch(''); };

  // ── sheet + confirm state
  const [sheet, setSheet] = useState(null); // { mode, id, back, pick }
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const openSheet = (mode, item, extra = {}) => setSheet({ mode, id: item?.id || null, back: false, ...extra });
  const closeSheet = () => setSheet(null);
  const switchMode = (mode, id) => setSheet((s) => (s ? { ...s, mode, id: id ?? s.id, back: s.back || s.mode === 'detail' } : s));
  const afterAction = () => setSheet((s) => (s?.back ? { ...s, mode: 'detail' } : null));

  // ── Firestore writes (unchanged payloads) ────────────────────────────────
  const updateStockQuantity = async (item, delta) => {
    await runDbAction(async () => {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stock', item.id), {
        quantity: Math.max(0, (Number(item.quantity) || 0) + delta)
      });
    }, 'อัปเดตสต็อกไม่สำเร็จ');
  };

  const saveStockItem = async (form, editingItem) => {
    const col = collection(db, 'artifacts', appId, 'public', 'data', 'stock');
    const data = { ...form, quantity: Number(form.quantity), minQuantity: Number(form.minQuantity), unitCost: Number(form.unitCost) || 0 };
    setBusy(true);
    const ok = await runDbAction(async () => {
      if (editingItem) await updateDoc(doc(col, editingItem.id), data);
      else await addDoc(col, data);
    }, 'บันทึกสต็อกไม่สำเร็จ');
    setBusy(false);
    if (ok) {
      toast.success(editingItem ? 'แก้ไขสต็อกสำเร็จ' : 'เพิ่มสต็อกใหม่สำเร็จ');
      afterAction();
    }
  };

  const handleAdjustStock = async (item, input) => {
    if (!item || !input.amount) return;
    const amount = Number(input.amount);
    // Guard: a negative/zero/NaN amount would INCREASE stock and book a
    // negative expense — only positive numbers are a valid cut.
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('จำนวนที่ตัดออกต้องเป็นตัวเลขมากกว่า 0');
      return;
    }
    setBusy(true);
    const ok = await runDbAction(async () => {
      // 1. Update stock quantity
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stock', item.id), {
        quantity: Math.max(0, (Number(item.quantity) || 0) - amount)
      });
      // 2. Record as expense if it's waste
      if (input.reason === 'waste') {
        const costPerUnit = Number(item.unitCost) || 0;
        const totalLoss = costPerUnit * amount;
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'expenses'), {
          title: `ของเสีย: ${item.name} (x${amount} ${item.unit})`,
          amount: totalLoss,
          category: 'ของเสีย (Waste)',
          date: getISODate(),
          createdAt: serverTimestamp()
        });
      }
    }, 'ปรับปรุงสต็อกไม่สำเร็จ');
    setBusy(false);
    if (ok) {
      toast.success('ปรับปรุงสต็อกสำเร็จ');
      afterAction();
    }
  };

  // รับของเข้า = the Expenses purchase path (same batch, same average cost).
  const handleIntake = async (form) => {
    setBusy(true);
    try {
      const result = await saveExpense({ form, date: getISODate(), stock, runDbAction });
      if (!result.ok) return;
      const msg = syncMessage(result);
      if (msg && !result.unitMismatch) toast.success(`รับของเข้าแล้ว · ${msg}`);
      else reportSave(result, toast);
      afterAction();
    } catch (e) {
      toast.error('บันทึกรายจ่ายไม่สำเร็จ: ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    const item = toDelete;
    setToDelete(null);
    if (!item) return;
    const ok = await runDbAction(async () => {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stock', item.id));
    }, 'ลบสต็อกไม่สำเร็จ');
    if (ok && sheet?.id === item.id) closeSheet();
  };

  // ── rendering helpers
  const menuItems = (item) => (isArchivedStock(item) ? [] : [
    ...(isPrep(item) ? [{ key: 'make', label: 'ทำของเตรียม', icon: CookingPot, onSelect: () => navigate('production', { make: item.id }) }] : []),
    { key: 'intake', label: 'รับของเข้า', icon: PackagePlus, onSelect: () => openSheet('intake', item) },
    { key: 'count', label: 'ตรวจนับ', icon: ClipboardCheck, onSelect: () => setCountId(item.id) },
    { key: 'adjust', label: 'ตัดของเสีย / ปรับยอด', icon: PackageMinus, onSelect: () => openSheet('adjust', item) },
    { key: 'edit', label: 'แก้ไข', icon: Pencil, onSelect: () => openSheet('edit', item) },
    { key: 'delete', label: 'ลบวัตถุดิบ', icon: Trash2, danger: true, onSelect: () => setToDelete(item) },
  ]);
  const rowTag = (item) => (isArchivedStock(item)
    ? <Badge tone="neutral" className="shrink-0">รวมแล้ว → {allStock.find((s) => s.id === item.mergedInto)?.name || '?'}</Badge>
    : isPrep(item) ? <Badge tone="accent" icon={<CookingPot size={12} />} className="shrink-0">ของเตรียม</Badge> : null);
  const stepper = (item, size = 'md') => (
    <NumberStepper
      size={size}
      value={Number(item.quantity) || 0}
      min={0}
      ariaLabel={`จำนวน ${item.name}`}
      onChange={(next) => updateStockQuantity(item, next - (Number(item.quantity) || 0))}
    />
  );
  const qtyInk = (item) => (stockStatus(item).rank >= 2 ? 'text-[var(--state-danger)]' : 'text-[var(--text-primary)]');

  const columns = [
    {
      key: 'name',
      header: 'วัตถุดิบ',
      render: (_, r) => (
        <div className="min-w-0 py-1.5">
          <p className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold text-[var(--text-primary)]">{String(r.name)}</span>
            {rowTag(r)}
          </p>
          <p className="flex min-w-0 items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="truncate">{getStockCategory(r)}</span>
            <CountStatusPill item={r} today={today} size="xs" />
          </p>
        </div>
      ),
    },
    { key: 'status', header: 'สถานะ', width: 104, render: (_, r) => <StockStatusPill item={r} /> },
    {
      key: 'quantity',
      header: 'คงเหลือ',
      numeric: true,
      width: 132,
      render: (_, r) => (
        <span className="whitespace-nowrap">
          <span className={`text-lg font-semibold ${qtyInk(r)}`}>{qty(r.quantity)}</span>
          <span className="ml-1 text-xs text-[var(--text-muted)]">{r.unit}</span>
        </span>
      ),
    },
    { key: 'min', header: 'ขั้นต่ำ', numeric: true, width: 84, render: (_, r) => <span className="text-[var(--text-secondary)]">{qty(reorderPoint(r))}</span> },
    { key: 'unitCost', header: 'ต้นทุน/หน่วย', numeric: true, width: 112, render: (v) => <UnitCost value={v || 0} muted={!Number(v)} /> },
    {
      key: 'actions',
      header: <span className="sr-only">ปรับจำนวนและตัวเลือก</span>,
      align: 'right',
      width: 212,
      render: (_, r) => (
        <div className="flex items-center justify-end gap-1" {...stop}>
          {!isArchivedStock(r) && stepper(r)}
          {!isArchivedStock(r) && <RowMenu items={menuItems(r)} label={`ตัวเลือกของ ${r.name}`} />}
        </div>
      ),
    },
  ];

  const emptyNode = stock.length === 0 ? (
    <EmptyState
      icon={Package}
      title="ยังไม่มีวัตถุดิบในคลัง"
      description="เพิ่มวัตถุดิบ หรือบันทึกซื้อของในหน้ารายจ่าย ระบบจะสร้างให้"
      actionLabel="เพิ่มวัตถุดิบ"
      onAction={() => openSheet('create', null)}
    />
  ) : (
    <EmptyState
      icon={SearchX}
      size="sm"
      title={filter === 'low' && !search && category === 'all' ? 'ไม่มีวัตถุดิบที่ต้องเติม'
        : filter === COUNT_FILTER && !search && category === 'all' ? 'ตรวจนับครบทุกรายการแล้ววันนี้' : 'ไม่พบวัตถุดิบที่ตรงกับตัวกรอง'}
      actionLabel="ดูทั้งหมด"
      onAction={clearFilters}
      className="break-words [overflow-wrap:anywhere]"
    />
  );

  return (
    <div className="h-full bg-[var(--bg-canvas)] flex flex-col overflow-hidden text-[var(--text-primary)]">
      <PageHeader
        title="สต็อก"
        subtitle={counts.low > 0 ? `ต้องเติม ${counts.low} รายการ · หมด ${counts.out}` : `${counts.all} รายการในคลัง`}
        icon={Package}
        sticky={false}
        actions={(
          <>
            <Button variant="secondary" leftIcon={<Combine size={18} />} onClick={() => setMergeOpen(true)}>
              รวมรายการซ้ำ{strongDupes > 0 ? ` (${strongDupes})` : ''}
            </Button>
            <Button variant="secondary" leftIcon={<ClipboardList size={18} />} onClick={() => setCountMode(true)} disabled={!stock.length}>
              โหมดตรวจนับ
            </Button>
            <Button variant="secondary" leftIcon={<PackagePlus size={18} />} onClick={() => openSheet('intake', null, { pick: true })}>
              รับของเข้า
            </Button>
            <Button leftIcon={<Plus size={18} />} onClick={() => openSheet('create', null)}>
              เพิ่มวัตถุดิบ
            </Button>
          </>
        )}
      />

      <Toolbar
        search={{ value: search, onChange: setSearch, placeholder: 'ค้นหาวัตถุดิบหรือหมวด' }}
        actions={(
          <label className="relative">
            <span className="sr-only">หมวดหมู่</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="min-h-11 max-w-[11rem] rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] outline-none focus-visible:shadow-[var(--focus-ring)] cursor-pointer"
            >
              <option value="all">ทุกหมวด</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
        filters={(
          <FilterChips
            className="[&>button]:min-h-11"
            ariaLabel="สถานะสต็อก"
            value={filter}
            onChange={setFilter}
            chips={[
              { value: 'all', label: 'ทั้งหมด', count: counts.all },
              { value: 'low', label: 'ต้องเติม', count: counts.low, tone: 'warn' },
              { value: 'out', label: 'หมด/ติดลบ', count: counts.out, tone: 'danger' },
              ...(mergedCount > 0 || filter === 'merged' ? [{ value: 'merged', label: 'รวมแล้ว', count: mergedCount }] : []),
              { value: COUNT_FILTER, label: 'ยังไม่ตรวจวันนี้', count: counts.uncounted, tone: 'info' },
            ]}
          />
        )}
      >
        {filtering && !isSyncing && (
          <p role="status" className="text-xs text-[var(--text-muted)]">แสดง {rows.length} จาก {stock.length} รายการ</p>
        )}
      </Toolbar>

      <div className="flex-1 min-h-0 overflow-y-auto px-[var(--page-pad)] pb-24 md:pb-10">
        <div className="max-w-[1400px] mx-auto">
          {unitFixes.length > 0 && !isSyncing && (
            <Banner
              tone="warn"
              icon={SpellCheck}
              className="mb-3"
              title={`หน่วยสะกดผิด ${unitFixes.length} รายการ`}
              action={{ label: 'แก้หน่วยสะกดผิด', onClick: fixUnits }}
            >
              {unitFixes.slice(0, 3).map((f) => `${f.name}: ${f.from} → ${f.to}`).join(' · ')}
              {unitFixes.length > 3 ? ` · อีก ${unitFixes.length - 3}` : ''} · ปริมาณเท่าเดิม
            </Banner>
          )}
          {wide ? (
            <DataTable
              caption="รายการวัตถุดิบในสต็อก"
              columns={columns}
              rows={rows}
              loading={isSyncing}
              cardBreakpoint={false}
              onRowClick={(r) => { if (!isArchivedStock(r)) openSheet('detail', r); }}
              selectedKey={sheet?.id}
              emptyState={emptyNode}
            />
          ) : isSyncing ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height="6rem" rounded="lg" />)}</div>
          ) : rows.length === 0 ? (
            emptyNode
          ) : (
            <ul className="flex flex-col gap-2" aria-label="รายการวัตถุดิบในสต็อก">
              {rows.map((item) => (
                <li key={item.id} className="rounded-[var(--radius)] bg-[var(--bg-surface)] shadow-[var(--elev-1)]">
                  <div className="flex items-start gap-1 pr-1">
                    <button
                      type="button"
                      onClick={() => { if (!isArchivedStock(item)) openSheet('detail', item); }}
                      className="min-w-0 flex-1 rounded-[var(--radius)] px-4 pt-3 pb-1 text-left outline-none focus-visible:shadow-[var(--focus-ring)]"
                    >
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 truncate font-semibold text-[var(--text-primary)]">{String(item.name)}</span>
                        {rowTag(item) || <StockStatusPill item={item} />}
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-[var(--text-muted)]">
                        <span className="truncate">{getStockCategory(item)}</span>
                        <CountStatusPill item={item} today={today} size="xs" />
                      </span>
                    </button>
                    {!isArchivedStock(item) && <span className="pt-1"><RowMenu items={menuItems(item)} label={`ตัวเลือกของ ${item.name}`} /></span>}
                  </div>
                  <div className="flex items-center justify-between gap-3 px-4 pb-3">
                    <p className="num min-w-0">
                      <span className={`text-2xl font-semibold ${qtyInk(item)}`}>{qty(item.quantity)}</span>
                      <span className="ml-1 text-sm text-[var(--text-secondary)]">{item.unit}</span>
                      <span className="block text-xs text-[var(--text-muted)]">ขั้นต่ำ {qty(reorderPoint(item))}</span>
                    </p>
                    {!isArchivedStock(item) && stepper(item)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <StockSheet
        state={sheet}
        stock={stock}
        busy={busy}
        intakeDate={getISODate()}
        onClose={closeSheet}
        onMode={switchMode}
        onStep={updateStockQuantity}
        onDelete={(item) => setToDelete(item)}
        onSaveItem={saveStockItem}
        onAdjust={handleAdjustStock}
        onIntake={handleIntake}
        onCount={(item) => { closeSheet(); setCountId(item.id); }}
      />

      <MergeSheet
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        stock={allStock}
        menu={menu}
        beanModifiers={beanModifiers}
        busy={mergeBusy}
        onMerge={doMerge}
      />
      <CountSheet itemId={countId} stock={stock} today={today} onClose={closeCount} />
      <CountModeSheet open={countMode} stock={stock} today={today} onClose={() => setCountMode(false)} />

      <TopConfirm
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="ลบวัตถุดิบ"
        message={`ลบ "${toDelete?.name || 'วัตถุดิบ'}" ออกจากคลังถาวร? สูตรเมนูที่ผูกไว้จะตัดสต็อกตัวนี้ไม่ได้อีก`}
        confirmText="ลบ"
        cancelText="ยกเลิก"
        variant="danger"
      />
    </div>
  );
}
