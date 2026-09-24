import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { Wallet, Pencil, Trash2, Bot, PackagePlus, ReceiptText, Settings2 } from 'lucide-react';
import { doc, deleteDoc } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { useDataContext, useUIContext } from '../../context/AppContext';
import { useNavigate, useRouteParams } from '../../navigation';
import { getISODate, getOrderDate } from '../../utils/calculations';
import { formatNumber, formatThaiDate, toISODateLocal } from '../../utils/format';
import {
  Badge, Banner, Button, DataTable, DateStepper, FilterChips, IconButton, Money, PageHeader, SectionCard, SegmentedControl, Sheet,
  StatCard, useToast,
} from '../ui';
import ExpenseForm from './inventory/ExpenseForm';
import TopConfirm from './inventory/TopConfirm';
import { buildTitleSuggestions, emptyExpense, intakeFormFor, validateExpense } from './inventory/expenseModel';
import { saveExpense, reportSave } from './inventory/expenseSave';

const MODES = [
  { value: 'daily', label: 'รายวัน' },
  { value: 'monthly', label: 'รายเดือน' },
  { value: 'all', label: 'ทั้งหมด' },
];

// Moving the month keeps the day-of-month (clamped), never past today.
function shiftToMonth(isoDate, isoMonth) {
  const [y, m] = isoMonth.split('-').map(Number);
  const day = Number(isoDate.slice(8, 10)) || 1;
  const last = new Date(y, m, 0).getDate();
  const next = toISODateLocal(new Date(y, m - 1, Math.min(day, last)));
  const today = getISODate();
  return next > today ? today : next;
}

export default function ExpensesView() {
  // ของที่ถูกรวมไปแล้วไม่ให้เลือก/จับคู่ใบเสร็จ · ชื่อเดิมอยู่ใน purchaseAliases ของตัวที่เก็บไว้
  const { expenses, orders, quickExpenses, stock: allStock = [], activeStock } = useDataContext();
  const stock = activeStock || allStock;
  const { runDbAction, callGeminiAPI, handleViewChange, setAdminTab } = useUIContext();
  const params = useRouteParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [expenseViewMode, setExpenseViewMode] = useState('daily');
  const [expenseFilterDate, setExpenseFilterDate] = useState(getISODate());
  const [newExpense, setNewExpense] = useState(emptyExpense);
  const [validationErrors, setValidationErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const syncMessageTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(syncMessageTimerRef.current), []);

  const [editing, setEditing] = useState(null); // { expense, form, errors }
  const [toDelete, setToDelete] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [financialInsight, setFinancialInsight] = useState('');
  const [isAnalyzingFinances, setIsAnalyzingFinances] = useState(false);

  // `#/expenses?intake=<stockId>` · open the form prefilled for that stock item
  // (stock may arrive after the view mounts, so adopt it once it is there).
  const [intakeItem, setIntakeItem] = useState(null);
  const [adoptedIntake, setAdoptedIntake] = useState(null);
  if (params.intake && params.intake !== adoptedIntake) {
    const item = stock.find((s) => s.id === params.intake);
    if (item) {
      setAdoptedIntake(params.intake);
      setIntakeItem(item);
      setNewExpense(intakeFormFor(item));
      setValidationErrors({});
    }
  }
  const clearIntake = () => {
    setIntakeItem(null);
    if (params.intake) navigate('expenses', {}, { replace: true });
  };

  const suggestions = useMemo(() => buildTitleSuggestions(stock, expenses), [stock, expenses]);

  const filteredExpenseStats = useMemo(() => {
    const targetMonth = expenseFilterDate.substring(0, 7);
    let filtered = [];
    if (expenseViewMode === 'daily') filtered = expenses.filter((e) => e.date === expenseFilterDate);
    else if (expenseViewMode === 'monthly') filtered = expenses.filter((e) => e.date?.startsWith(targetMonth));
    else filtered = [...expenses];

    const total = filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const byCategory = {};
    filtered.forEach((e) => {
      const cat = e.category || 'อื่น ๆ';
      if (!byCategory[cat]) byCategory[cat] = 0;
      byCategory[cat] += Number(e.amount) || 0;
    });
    return {
      expenses: filtered.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
      total,
      byCategory: Object.entries(byCategory).sort((a, b) => b[1] - a[1]),
      count: filtered.length,
    };
  }, [expenses, expenseViewMode, expenseFilterDate]);

  const activeCategory = filteredExpenseStats.byCategory.some(([c]) => c === categoryFilter) ? categoryFilter : 'all';
  const listRows = activeCategory === 'all'
    ? filteredExpenseStats.expenses
    : filteredExpenseStats.expenses.filter((e) => (e.category || 'อื่น ๆ') === activeCategory);

  const periodLabel = expenseViewMode === 'daily'
    ? (expenseFilterDate === getISODate() ? 'วันนี้' : formatThaiDate(expenseFilterDate))
    : expenseViewMode === 'monthly' ? formatThaiDate(expenseFilterDate, { style: 'month' }) : 'ทั้งหมด';

  // AI วิเคราะห์การเงิน - วิเคราะห์ตามช่วงเวลาที่เลือก (prompt unchanged)
  const handleAnalyzeFinances = useCallback(async () => {
    setIsAnalyzingFinances(true);
    setFinancialInsight('');
    try {
      const { expenses: filteredExpenses, total: totalExpenses, byCategory } = filteredExpenseStats;
      const targetMonth = expenseFilterDate.substring(0, 7);
      let filteredOrders = [];
      let periodLabelEn = '';
      let periodLabelThai = '';
      if (expenseViewMode === 'daily') {
        filteredOrders = orders.filter((o) => o.status === 'completed' && getOrderDate(o) === expenseFilterDate);
        periodLabelEn = `Daily (${expenseFilterDate})`;
        periodLabelThai = `รายวัน (${new Date(expenseFilterDate).toLocaleDateString('th-TH')})`;
      } else if (expenseViewMode === 'monthly') {
        filteredOrders = orders.filter((o) => o.status === 'completed' && (getOrderDate(o) || '').startsWith(targetMonth));
        periodLabelEn = `Monthly (${targetMonth})`;
        periodLabelThai = `รายเดือน (${new Date(targetMonth + '-01').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })})`;
      } else {
        filteredOrders = orders.filter((o) => o.status === 'completed');
        periodLabelEn = 'All Time';
        periodLabelThai = 'ทั้งหมด';
      }
      const totalRevenue = filteredOrders.reduce((s, o) => s + (Number(o.total || 0)), 0);
      const netProfit = totalRevenue - totalExpenses;
      const orderCount = filteredOrders.length;
      const avgOrderValue = orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0;
      const expenseBreakdown = {};
      byCategory.forEach(([cat, amount]) => { expenseBreakdown[cat] = amount; });

      const prompt = `
        Role: Financial Analyst for a Cafe.
        Shop Operating Hours: 10:00 - 17:00.

        **Analysis Period: ${periodLabelEn} (${periodLabelThai})**

        Financial Summary:
        - Total Revenue: ${totalRevenue.toLocaleString()} THB (${orderCount} orders)
        - Average Order Value: ${avgOrderValue.toLocaleString()} THB
        - Total Expenses: ${totalExpenses.toLocaleString()} THB (${filteredExpenses.length} รายการ)
        - Net Profit: ${netProfit.toLocaleString()} THB
        - Profit Margin: ${totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0}%

        Expense Breakdown: ${JSON.stringify(expenseBreakdown)}

        Task: Analyze the financial health for this specific period (${periodLabelThai}).
        1. Evaluate the profit margin - is it healthy?
        2. Point out the highest cost categories and suggest optimizations.
        3. Provide 1-2 actionable recommendations to improve profitability.
        ${expenseViewMode === 'daily' ? '4. Compare if this day seems normal or unusual.' : ''}
        ${expenseViewMode === 'monthly' ? '4. Suggest monthly budget targets.' : ''}
        Language: Thai. Be concise but insightful.
      `;
      const result = await callGeminiAPI(prompt, false);
      if (result.success) setFinancialInsight(result.data);
    } catch (e) {
      toast.error('วิเคราะห์ไม่สำเร็จ: ' + e.message);
    } finally {
      setIsAnalyzingFinances(false);
    }
  }, [filteredExpenseStats, orders, expenseFilterDate, expenseViewMode, callGeminiAPI, toast]);

  const applyQuickExpense = useCallback((item) => {
    setNewExpense({
      title: item.title,
      quantity: item.amount ? 1 : '',
      unit: item.unit,
      pricePerUnit: item.amount || '',
      amount: item.amount || '',
      category: item.category,
    });
    setValidationErrors({});
  }, []);

  const handleAddExpense = async (e) => {
    e.preventDefault();
    setSyncMessage('');
    setValidationErrors({});
    const errors = validateExpense(newExpense);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      toast.warning('กรุณาตรวจสอบข้อมูลให้ครบถ้วน');
      return;
    }
    setIsSaving(true);
    try {
      const result = await saveExpense({ form: newExpense, date: expenseFilterDate, stock, runDbAction });
      if (!result.ok) return;
      const msg = reportSave(result, toast);
      if (msg) {
        setSyncMessage(msg);
        clearTimeout(syncMessageTimerRef.current);
        syncMessageTimerRef.current = setTimeout(() => setSyncMessage(''), 5000);
      }
      setNewExpense(emptyExpense());
      if (intakeItem) clearIntake();
    } catch (err) {
      toast.error('บันทึกรายจ่ายไม่สำเร็จ: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (expense) => setEditing({
    expense,
    errors: {},
    form: {
      title: expense.title || '',
      quantity: expense.quantity || '',
      unit: expense.unit || 'ชิ้น',
      pricePerUnit: expense.pricePerUnit || '',
      amount: expense.amount || '',
      category: expense.category || 'วัตถุดิบ',
    },
  });

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    const errors = validateExpense(editing.form);
    if (Object.keys(errors).length > 0) {
      setEditing({ ...editing, errors });
      toast.warning('กรุณาตรวจสอบข้อมูลให้ครบถ้วน');
      return;
    }
    setIsSaving(true);
    try {
      const result = await saveExpense({ form: editing.form, editingExpense: editing.expense, date: editing.expense?.date || expenseFilterDate, stock, runDbAction });
      if (result.ok) {
        reportSave(result, toast);
        setEditing(null);
      }
    } catch (err) {
      toast.error('บันทึกรายจ่ายไม่สำเร็จ: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    const expense = toDelete;
    setToDelete(null);
    if (!expense) return;
    await runDbAction(async () => {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'expenses', expense.id));
    }, 'ลบค่าใช้จ่ายไม่สำเร็จ');
  };

  const detailLine = (e) => (e.quantity > 0
    ? `${formatNumber(e.quantity, { maxDecimals: 3 })} ${e.unit || ''} × ฿${formatNumber(e.pricePerUnit)}`
    : null);
  const rowActions = (e) => (
    <div className="flex items-center justify-end gap-1">
      <IconButton icon={<Pencil size={18} />} size="lg" aria-label={`แก้ไข ${e.title}`} onClick={() => startEdit(e)} />
      <IconButton icon={<Trash2 size={18} />} size="lg" aria-label={`ลบ ${e.title}`} className="hover:!text-[var(--state-danger)]" onClick={() => setToDelete(e)} />
    </div>
  );

  const metaLine = (e) => (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
      <Badge tone="neutral" size="xs">{e.category || 'อื่น ๆ'}</Badge>
      {expenseViewMode !== 'daily' && <span className="num whitespace-nowrap">{formatThaiDate(e.date, { style: 'short' })}</span>}
      {detailLine(e) && <span className="num whitespace-nowrap">{detailLine(e)}</span>}
      {e.stockId && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-[var(--state-ok)]">
          <PackagePlus size={12} aria-hidden="true" />ลงสต็อกแล้ว
        </span>
      )}
    </p>
  );

  // Title + one meta line (category · date · qty · stock) keeps the table
  // readable in the ~480px right column on iPad without horizontal scroll.
  const columns = [
    {
      key: 'title',
      header: 'รายการ',
      render: (_, e) => (
        <div className="min-w-0 py-2">
          <p className="font-medium text-[var(--text-primary)] break-words">{String(e.title)}</p>
          {metaLine(e)}
        </div>
      ),
    },
    { key: 'amount', header: 'จำนวนเงิน', numeric: true, width: 116, render: (v) => <Money value={v} className="font-semibold" /> },
    { key: 'actions', header: <span className="sr-only">จัดการ</span>, align: 'right', width: 108, render: (_, e) => rowActions(e) },
  ];

  const renderCard = (e) => (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-[var(--text-primary)] break-words">{String(e.title)}</p>
        {metaLine(e)}
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <Money value={e.amount} className="text-base font-semibold" />
        <div className="-mr-2">{rowActions(e)}</div>
      </div>
    </div>
  );

  const dateControl = expenseViewMode === 'all' ? null : (
    <DateStepper
      mode={expenseViewMode === 'monthly' ? 'month' : 'day'}
      value={expenseViewMode === 'monthly' ? expenseFilterDate.slice(0, 7) : expenseFilterDate}
      onChange={(v) => setExpenseFilterDate(expenseViewMode === 'monthly' ? shiftToMonth(expenseFilterDate, v) : v)}
    />
  );

  return (
    <div className="h-full bg-[var(--bg-canvas)] flex flex-col overflow-hidden text-[var(--text-primary)]">
      <PageHeader
        title="รายจ่าย"
        icon={Wallet}
        sticky={false}
        actions={(
          <>
            <SegmentedControl ariaLabel="ช่วงเวลา" options={MODES} value={expenseViewMode} onChange={setExpenseViewMode} />
            {dateControl}
          </>
        )}
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-[var(--page-pad)] py-5 md:py-6 pb-24 md:pb-10">
        <div className="max-w-[1400px] mx-auto grid gap-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start">
          {/* ── add expense (top-left on iPad) */}
          <SectionCard title="เพิ่มรายจ่าย" description={`บันทึกเป็นวันที่ ${formatThaiDate(expenseFilterDate)}`} padding="md" className="md:p-5">
            <div className="flex flex-col gap-4">
              {intakeItem && (
                <Banner tone="info" icon={PackagePlus} title={`รับของเข้า: ${intakeItem.name}`} action={{ label: 'ยกเลิก', onClick: () => { clearIntake(); setNewExpense(emptyExpense()); } }}>
                  กรอกจำนวนและราคารวม ระบบจะเพิ่มสต็อกและคิดต้นทุนเฉลี่ยให้
                </Banner>
              )}
              {syncMessage && (
                <Banner tone="ok" title={syncMessage} onDismiss={() => setSyncMessage('')} />
              )}

              <div>
                <p className="mb-2 text-sm font-medium text-[var(--text-secondary)]">คีย์ลัด</p>
                <div className="flex flex-wrap gap-2">
                  {quickExpenses.map((item, idx) => (
                    <button
                      key={item.id || idx}
                      type="button"
                      onClick={() => applyQuickExpense(item)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)]"
                    >
                      {item.icon && <span aria-hidden="true">{item.icon}</span>}
                      <span>{item.label}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setAdminTab('quickExpenses'); handleViewChange('admin'); }}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)]"
                  >
                    <Settings2 size={16} aria-hidden="true" /> จัดการคีย์ลัด
                  </button>
                </div>
              </div>

              <ExpenseForm
                value={newExpense}
                onChange={setNewExpense}
                errors={validationErrors}
                onClearError={(f) => setValidationErrors((v) => ({ ...v, [f]: '' }))}
                onSubmit={handleAddExpense}
                suggestions={suggestions}
                stock={stock}
              >
                <Button type="submit" size="xl" fullWidth loading={isSaving && !editing}>บันทึกรายจ่าย</Button>
              </ExpenseForm>
            </div>
          </SectionCard>

          {/* ── totals + list */}
          <div className="flex min-w-0 flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <StatCard label={`รายจ่าย${periodLabel === 'ทั้งหมด' ? 'ทั้งหมด' : ` · ${periodLabel}`}`} value={<Money value={filteredExpenseStats.total} />} icon={Wallet} />
              <StatCard label="จำนวนรายการ" value={formatNumber(filteredExpenseStats.count)} unit="รายการ" icon={ReceiptText} />
            </div>

            <section aria-labelledby="expense-list-title" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="expense-list-title" className="text-[length:var(--fs-lg)] leading-[var(--lh-lg)] font-semibold">รายการค่าใช้จ่าย</h2>
                <Button variant="ai" leftIcon={<Bot size={18} />} loading={isAnalyzingFinances} onClick={handleAnalyzeFinances}>วิเคราะห์ด้วย AI</Button>
              </div>

              {filteredExpenseStats.byCategory.length > 1 && (
                <FilterChips
                  className="[&>button]:min-h-11"
                  ariaLabel="กรองตามหมวด"
                  value={activeCategory}
                  onChange={setCategoryFilter}
                  chips={[
                    { value: 'all', label: 'ทุกหมวด', count: filteredExpenseStats.count },
                    ...filteredExpenseStats.byCategory.map(([cat, amount]) => ({ value: cat, label: <>{cat} <Money value={amount} className="text-[var(--text-muted)] font-normal" /></> })),
                  ]}
                />
              )}

              {financialInsight && (
                <SectionCard padding="md" title={<span className="inline-flex items-center gap-2"><Bot size={18} className="text-[var(--accent-ai)]" /> AI วิเคราะห์การเงิน</span>}
                  actions={<Button variant="ghost" size="md" onClick={() => setFinancialInsight('')}>ปิด</Button>}
                >
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">{financialInsight}</p>
                </SectionCard>
              )}

              <DataTable
                caption="รายการค่าใช้จ่าย"
                columns={columns}
                rows={listRows}
                renderCard={renderCard}
                emptyState={{ icon: Wallet, title: `ยังไม่มีรายจ่าย${periodLabel === 'ทั้งหมด' ? '' : ` ${periodLabel}`}`, description: 'เพิ่มจากฟอร์ม "เพิ่มรายจ่าย"' }}
              />
            </section>
          </div>
        </div>
      </div>

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title="แก้ไขรายจ่าย"
        description={editing ? `วันที่ของรายการ ${formatThaiDate(editing.expense?.date || expenseFilterDate)}` : undefined}
        footer={(
          <>
            <Button variant="secondary" size="lg" onClick={() => setEditing(null)}>ยกเลิก</Button>
            <Button type="submit" form="expense-edit-form" size="lg" loading={isSaving && !!editing}>บันทึกการแก้ไข</Button>
          </>
        )}
      >
        {editing && (
          <ExpenseForm
            formId="expense-edit-form"
            value={editing.form}
            onChange={(form) => setEditing((cur) => ({ ...cur, form }))}
            errors={editing.errors}
            onClearError={(f) => setEditing((cur) => ({ ...cur, errors: { ...cur.errors, [f]: '' } }))}
            onSubmit={handleSaveEdit}
            suggestions={suggestions}
            stock={stock}
          />
        )}
      </Sheet>

      <TopConfirm
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="ลบรายจ่าย"
        message={`ลบ "${toDelete?.title || 'รายการนี้'}"${toDelete ? ` (${formatNumber(toDelete.amount)} บาท)` : ''}?${toDelete?.stockId ? ' สต็อกที่รับเข้าจากรายการนี้จะไม่ถูกหักคืนให้ ต้องปรับยอดในหน้าสต็อกเอง' : ''}`}
        confirmText="ลบ"
        cancelText="ยกเลิก"
        variant="danger"
      />
    </div>
  );
}
