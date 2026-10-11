import { useMemo, useState } from 'react';
import { Receipt, SearchX, Users, X } from 'lucide-react';
import { doc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { useConfigContext, useDataContext, useUIContext } from '../../context/AppContext';
import { useNavigate, useRouteParams } from '../../navigation';
import { getISODate, getOrderDate } from '../../utils/calculations';
import { validDate } from '../../utils/salesHistory';
import { formatBaht } from '../../utils/format';
import usePrintReceipt from '../../hooks/usePrintReceipt';
import useReceiptPdf from '../../hooks/useReceiptPdf';
import useDebounce from '../../hooks/useDebounce';
import {
  Banner, Button, ConfirmModal, DateStepper, EmptyState, FilterChips, Money, PageHeader, Sheet, Skeleton, Toolbar,
  useMediaQuery, useToast,
} from '../ui';
import { DEFAULT_OWN_GLASS_DISCOUNT } from '../../config/constants';
import { summarizeMergedBills, validateMergedBills } from '../../utils/billMerge';
import { buildMenuImageLookup } from './overview/menuImage';
import {
  billCode, billCustomerName, countBillFilters, matchesBillFilter, matchesBillQuery, normalizeBillFilter, rankBills,
  summarizeStockDeduction,
} from './records/billSearch';
import BillList from './records/BillList';
import BillDetail, { PaidBadge } from './records/BillDetail';
import BillActions from './records/BillActions';

/**
 * BillsView · บิล (UX v2 · WP2)
 * `#/bills?date=YYYY-MM-DD&filter=unpaid|paid|qr&id=<orderId>` · the URL holds
 * the date, the status chip and the open bill so refresh/back/deep links work.
 * iPad/desktop (≥1024): list + detail pane, newest bill selected by default.
 * Narrower: list only, the bill opens in a Sheet.
 */
export default function BillsView() {
  const { orders, menu, members, stock, isSyncing } = useDataContext();
  const {
    reviewUrl, shopName, shopAddress, shopPhone, taxId, receiptFooter, receiptPaperWidth, ownGlassDiscount,
  } = useConfigContext();
  const { runDbAction, handleViewChange, setEditingOrderId, setOrderToCancel } = useUIContext();
  const params = useRouteParams();
  const navigate = useNavigate();
  const toast = useToast();
  const wide = useMediaQuery('(min-width: 1024px)');

  const receiptSettings = { reviewUrl, shopName, shopAddress, shopPhone, taxId, receiptFooter, receiptPaperWidth };
  const { printBill, receiptPortal: printReceiptPortal, printUnavailable } = usePrintReceipt({ menu, settings: receiptSettings });
  const { openReceiptPdf, receiptPortal: pdfReceiptPortal, generating, fallbackUrl, clearFallback } = useReceiptPdf({ menu, settings: receiptSettings });
  const OWN_GLASS_DISCOUNT = Number(ownGlassDiscount) || DEFAULT_OWN_GLASS_DISCOUNT;

  // ── route state ───────────────────────────────────────────────────────────
  const today = getISODate();
  const idParam = params.id || null;
  const idOrder = useMemo(() => (idParam ? orders.find((o) => o.id === idParam) || null : null), [orders, idParam]);
  const date = validDate(params.date) ? params.date : (idOrder && validDate(getOrderDate(idOrder)) ? getOrderDate(idOrder) : today);
  const filter = normalizeBillFilter(params.filter);
  const setRoute = (patch) => {
    const next = { date: date !== today ? date : undefined, filter: filter !== 'all' ? filter : undefined, id: idParam || undefined, ...patch };
    if (next.date === today) next.date = undefined;
    if (next.filter === 'all') next.filter = undefined;
    navigate('bills', next, { replace: true });
  };

  const [search, setSearch] = useState('');
  const query = useDebounce(search, 200);

  // ── data ──────────────────────────────────────────────────────────────────
  const memberByPhone = useMemo(() => new Map(members.map((m) => [m.phone, m])), [members]);
  const stockById = useMemo(() => new Map(stock.map((s) => [s.id, s])), [stock]);
  const imageFor = useMemo(() => buildMenuImageLookup(menu), [menu]);
  const nameFor = (bill) => billCustomerName(bill, memberByPhone);

  const dayBills = useMemo(() => orders
    .filter((o) => o.status === 'completed' && getOrderDate(o) === date)
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)), [orders, date]);
  // บิลที่ยกเลิก (เดิมลบทิ้ง) · ดูอย่างเดียว ไม่นับในยอด
  const cancelledBills = useMemo(() => orders
    .filter((o) => o.status === 'cancelled' && getOrderDate(o) === date)
    .sort((a, b) => String(b.cancelledAt || '').localeCompare(String(a.cancelledAt || ''))), [orders, date]);
  const counts = useMemo(() => countBillFilters(dayBills), [dayBills]);
  const dayTotal = useMemo(() => dayBills.reduce((s, b) => s + (Number(b.total) || 0), 0), [dayBills]);
  const unpaidTotal = useMemo(() => dayBills.filter((b) => !b.isPaid).reduce((s, b) => s + (Number(b.total) || 0), 0), [dayBills]);
  const rows = useMemo(() => rankBills(
    (filter === 'cancelled' ? cancelledBills : dayBills).filter((b) => matchesBillFilter(b, filter) && matchesBillQuery(b, query, billCustomerName(b, memberByPhone))),
    query,
  ), [dayBills, cancelledBills, filter, query, memberByPhone]);

  // A bill named in the URL wins (deep link / tap); otherwise iPad shows the
  // newest match so the detail pane is never empty.
  const selected = wide
    ? ((idOrder && (dayBills.includes(idOrder) || cancelledBills.includes(idOrder)) ? idOrder : null) || rows[0] || null)
    : idOrder;
  const onSearch = (text) => {
    setSearch(text);
    if (idParam && wide) setRoute({ id: undefined }); // let the pane follow the new matches
  };

  // ── merge (pay several unpaid bills together) · unchanged write ───────────
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeIds, setMergeIds] = useState(() => new Set());
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [isMergingBills, setIsMergingBills] = useState(false);
  const mergedSummary = useMemo(() => summarizeMergedBills(dayBills, mergeIds), [dayBills, mergeIds]);

  const stopMergeMode = () => {
    setMergeMode(false);
    setMergeIds(new Set());
    setShowMergeConfirm(false);
  };
  const startMergeMode = () => {
    setMergeMode(true);
    if (filter !== 'unpaid') setRoute({ filter: 'unpaid', id: undefined });
  };
  const toggleBillForMerge = (bill) => {
    if (bill.isPaid) return;
    setMergeIds((current) => {
      const next = new Set(current);
      if (next.has(bill.id)) next.delete(bill.id);
      else next.add(bill.id);
      return next;
    });
  };
  const confirmMergedPayment = async () => {
    try {
      validateMergedBills(mergedSummary.bills);
    } catch {
      setShowMergeConfirm(false);
      return;
    }
    setIsMergingBills(true);
    const completed = await runDbAction(async () => {
      const batch = writeBatch(db);
      const paymentGroupId = crypto.randomUUID();
      const paidAt = serverTimestamp();
      mergedSummary.bills.forEach((bill) => {
        batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'orders', bill.id), {
          isPaid: true,
          paymentGroupId,
          paymentGroupSize: mergedSummary.count,
          paymentGroupTotal: mergedSummary.total,
          paidAt,
        });
      });
      await batch.commit();
      return true;
    }, 'รวมบิลและบันทึกการชำระเงินไม่สำเร็จ');
    setIsMergingBills(false);
    if (completed !== false) stopMergeMode();
  };

  // ── bill actions · same writes / handlers as before ───────────────────────
  const [payBusy, setPayBusy] = useState(false);
  const togglePaid = async (bill) => {
    const newPaidStatus = !bill.isPaid;
    setPayBusy(true);
    const ok = await runDbAction(async () => {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', bill.id), { isPaid: newPaidStatus });
    }, 'อัปเดตสถานะการชำระเงินไม่สำเร็จ');
    setPayBusy(false);
    if (ok) toast.success(newPaidStatus ? `คิว ${bill.queueNumber} รับเงินแล้ว` : `คิว ${bill.queueNumber} กลับเป็นค้างชำระ`);
  };
  const handlePrintBill = (bill) => {
    // ร้านอาจเปิดจากหน้าจอหลัก และยังไม่ยืนยันข้อจำกัดของ iOS จึงลองพิมพ์ก่อนแนะนำทางเลือก
    printBill(bill);
    if (printUnavailable) toast.info('ถ้าหน้าต่างพิมพ์ไม่ขึ้น ให้เปิดระบบผ่าน Safari แล้วกดพิมพ์อีกครั้ง');
  };
  const handleOpenReceiptPdf = (bill) => {
    openReceiptPdf(bill).catch(() => toast.error('สร้างใบเสร็จไม่สำเร็จ ลองใหม่อีกครั้ง'));
  };
  const editBill = (bill) => { setEditingOrderId(bill.id); handleViewChange('pos'); };
  const deleteBill = (bill) => setOrderToCancel(bill.id);

  const handleSelect = (bill) => {
    if (mergeMode) { toggleBillForMerge(bill); return; }
    setRoute({ id: bill.id });
  };

  // ── rendering ─────────────────────────────────────────────────────────────
  const actionsFor = (bill) => (bill.status === 'cancelled' ? null : (
    <BillActions
      bill={bill}
      onTogglePaid={() => togglePaid(bill)}
      onPrint={() => handlePrintBill(bill)}
      onPdf={() => handleOpenReceiptPdf(bill)}
      onEdit={() => editBill(bill)}
      onDelete={() => deleteBill(bill)}
      pdfBusy={generating}
      payBusy={payBusy}
    />
  ));
  const pdfBanner = fallbackUrl ? (
    <Banner
      tone="info"
      title="ใบเสร็จ PDF พร้อมแล้ว"
      action={<a href={fallbackUrl} target="_blank" rel="noopener" className="inline-flex items-center min-h-11 px-3 rounded-[var(--radius-sm)] font-semibold text-[var(--state-info)] underline underline-offset-2">เปิดใบเสร็จ</a>}
      onDismiss={clearFallback}
    />
  ) : null;
  const detailFor = (bill, showHeader) => (
    <BillDetail
      bill={bill}
      menu={menu}
      customerName={nameFor(bill)}
      ownGlassDiscount={OWN_GLASS_DISCOUNT}
      imageFor={imageFor}
      deduction={bill.status === 'completed' ? summarizeStockDeduction(bill, stockById) : null}
      showHeader={showHeader}
    >
      {bill.status === 'cancelled' && (
        <Banner tone="warn" title={`ยกเลิกแล้ว${bill.cancelledAt ? ` · ${new Date(bill.cancelledAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}${bill.cancelledBy ? ` · ${bill.cancelledBy}` : ''}`}>
          {bill.stockRestoredAt ? 'คืนสต็อกแล้ว · ' : ''}ไม่นับในยอดขาย · แต้มที่ได้จากบิลถูกหักคืน
        </Banner>
      )}
      {pdfBanner}
    </BillDetail>
  );

  const filtering = filter !== 'all' || query.trim() !== '';
  const emptyNode = dayBills.length === 0 ? (
    <EmptyState
      icon={Receipt}
      size="sm"
      title="ยังไม่มีบิลในวันนี้"
      description={date === today ? 'บิลที่ปิดแล้วจะขึ้นที่นี่' : 'ลองเลือกวันอื่นด้วยปุ่ม ‹ ›'}
    />
  ) : (
    <EmptyState
      icon={SearchX}
      size="sm"
      title={filter === 'unpaid' && !query ? 'ไม่มีบิลค้างชำระ' : 'ไม่พบบิลที่ตรงกับการค้นหา'}
      actionLabel="ดูทั้งหมด"
      onAction={() => { setSearch(''); setRoute({ filter: 'all' }); }}
      className="break-words [overflow-wrap:anywhere]"
    />
  );

  const subtitle = dayBills.length
    ? `${dayBills.length} บิล · รวม ${formatBaht(dayTotal)}${counts.unpaid ? ` · ค้างชำระ ${counts.unpaid} บิล (${formatBaht(unpaidTotal)})` : ''}`
    : 'ยังไม่มีบิลที่ปิดแล้ว';

  const list = isSyncing ? (
    <div className="flex flex-col gap-2 p-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height="4rem" rounded="lg" />)}</div>
  ) : rows.length === 0 ? emptyNode : (
    <BillList
      bills={rows}
      nameFor={nameFor}
      selectedId={selected?.id}
      mergeMode={mergeMode}
      mergeIds={mergeIds}
      onSelect={handleSelect}
      showChevron={!wide}
    />
  );

  const mergeBar = mergeMode && (
    <div className="shrink-0 border-t border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2"><Users size={16} aria-hidden="true" /> เลือกแล้ว {mergedSummary.count} บิล</p>
          <p className="text-xs text-[var(--text-muted)]">เลือกอย่างน้อย 2 บิลที่ยังไม่ชำระ</p>
        </div>
        <Money value={mergedSummary.total} className="text-[length:var(--fs-2xl)] leading-[var(--lh-2xl)] font-semibold text-[var(--text-primary)]" />
      </div>
      <Button fullWidth disabled={mergedSummary.count < 2} onClick={() => setShowMergeConfirm(true)}>
        รวมยอดและชำระพร้อมกัน
      </Button>
    </div>
  );

  return (
    <div className="h-full bg-[var(--bg-canvas)] flex flex-col overflow-hidden text-[var(--text-primary)]">
      {printReceiptPortal}
      {pdfReceiptPortal}

      <PageHeader
        title="บิล"
        subtitle={subtitle}
        icon={Receipt}
        sticky={false}
        actions={<DateStepper value={date} onChange={(d) => setRoute({ date: d, id: undefined })} />}
      />

      <Toolbar
        search={{ value: search, onChange: onSearch, placeholder: 'ค้นหาคิว ชื่อ หรือเมนู' }}
        actions={(
          <Button
            variant={mergeMode ? 'ghost' : 'secondary'}
            leftIcon={mergeMode ? <X size={18} /> : <Users size={18} />}
            onClick={() => (mergeMode ? stopMergeMode() : startMergeMode())}
            disabled={!mergeMode && counts.unpaid < 2}
            title={!mergeMode && counts.unpaid < 2 ? 'ต้องมีบิลค้างชำระอย่างน้อย 2 บิล' : undefined}
          >
            {mergeMode ? 'ยกเลิกรวมบิล' : 'รวมบิล'}
          </Button>
        )}
        filters={(
          <FilterChips
            ariaLabel="สถานะบิล"
            value={filter}
            onChange={(v) => setRoute({ filter: v, id: undefined })}
            chips={[
              { value: 'all', label: 'ทั้งหมด', count: counts.all },
              { value: 'unpaid', label: 'ค้างชำระ', count: counts.unpaid, tone: 'warn' },
              { value: 'paid', label: 'จ่ายแล้ว', count: counts.paid, tone: 'ok' },
              { value: 'qr', label: 'QR', count: counts.qr, tone: 'info' },
              ...(cancelledBills.length || filter === 'cancelled' ? [{ value: 'cancelled', label: 'ยกเลิกแล้ว', count: cancelledBills.length }] : []),
            ]}
          />
        )}
      >
        {filtering && !isSyncing && dayBills.length > 0 && (
          <p role="status" className="text-xs text-[var(--text-muted)]">แสดง {rows.length} จาก {dayBills.length} บิล</p>
        )}
      </Toolbar>

      {wide ? (
        <div className="flex-1 min-h-0 flex gap-4 px-[var(--page-pad)] pb-4">
          <section aria-label="รายการบิล" className="w-[380px] xl:w-[420px] shrink-0 flex flex-col min-h-0 rounded-[var(--radius)] bg-[var(--bg-surface)] shadow-[var(--elev-1)] overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto">{list}</div>
            {mergeBar}
          </section>
          <section aria-label="รายละเอียดบิล" className="flex-1 min-w-0 flex flex-col min-h-0 rounded-[var(--radius)] bg-[var(--bg-surface)] shadow-[var(--elev-1)] overflow-hidden">
            {selected ? (
              <>
                <div className="flex-1 min-h-0 overflow-y-auto p-5 xl:p-6">
                  <div className="max-w-2xl mx-auto">{detailFor(selected, true)}</div>
                </div>
                <div className="shrink-0 border-t border-[var(--border-color)] px-5 py-3">
                  <div className="max-w-2xl mx-auto">{actionsFor(selected)}</div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-6">
                <EmptyState icon={Receipt} size="sm" title="ยังไม่มีบิลให้แสดง" description="เลือกวันอื่น หรือเปลี่ยนตัวกรอง" />
              </div>
            )}
          </section>
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto px-[var(--page-pad)] pb-6">
            <div className="rounded-[var(--radius)] bg-[var(--bg-surface)] shadow-[var(--elev-1)] overflow-hidden">{list}</div>
          </div>
          {mergeBar}
          <Sheet
            open={!!selected && !mergeMode}
            onClose={() => setRoute({ id: undefined })}
            title={selected ? (
              <span className="flex items-center gap-2 min-w-0">
                <span className="truncate">คิว <span className="num">{Number(selected.queueNumber) || '–'}</span> · <span className="num">#{billCode(selected)}</span></span>
              </span>
            ) : ''}
            description={selected ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className="num">{selected.time ? `${selected.time} น.` : ''}</span>
                <PaidBadge paid={selected.isPaid} size="xs" />
                {selected.source === 'qr' && <span>QR</span>}
              </span>
            ) : null}
            footer={selected ? actionsFor(selected) : null}
            width={520}
          >
            {selected && detailFor(selected, false)}
          </Sheet>
        </>
      )}

      <ConfirmModal
        isOpen={showMergeConfirm}
        onClose={() => !isMergingBills && setShowMergeConfirm(false)}
        onConfirm={confirmMergedPayment}
        title="ยืนยันรวมบิล"
        message={`ชำระ ${mergedSummary.count} บิลพร้อมกัน ยอดรวม ${formatBaht(mergedSummary.total)} · ออเดอร์เดิมยังแยกอยู่สำหรับตรวจสอบย้อนหลัง`}
        confirmText="ยืนยันชำระ"
        cancelText="กลับไปเลือก"
        variant="primary"
        loading={isMergingBills}
      />
    </div>
  );
}
