// Expense save path shared by ExpensesView and the Stock "รับของเข้า" sheet.
//
// This is the exact write logic that used to live inline in ExpensesView's
// handleAddExpense (moved, not rewritten): same Firestore batch, same
// stockIntake helpers, same average-cost rule (planStockIntake →
// weightedAverageUnitCost). Receiving stock from the Stock screen therefore
// writes precisely what the Expenses form writes.
import { collection, doc, serverTimestamp, updateDoc, increment, writeBatch } from 'firebase/firestore';
import { db, appId } from '../../../services/firebase';
import { formatNumber } from '../../../utils/format';
import { STOCK_CATEGORIES, inferStockCategory, DEFAULT_MIN_QUANTITY } from '../../../config/constants';
import { roundMoney, buildExpenseRecord } from '../../../utils/stockIntake';
import { expenseTotal, toExpenseLine, resolveStockIntake } from './expenseModel';

/**
 * Save the form. Edit path updates the expense doc; create path writes the
 * expense and (for inventory categories) the stock change in one batch.
 * Returns { ok, edited?, syncAction?, unitMismatch?, targetStock?, line? }.
 */
export async function saveExpense({ form, editingExpense = null, date, stock, runDbAction }) {
  const finalAmount = expenseTotal(form);
  if (!form.title || !finalAmount) return { ok: false };

  if (editingExpense) {
    const expenseData = {
      title: String(form.title),
      quantity: Number(form.quantity) || 0,
      unit: String(form.unit || ''),
      pricePerUnit: Number(form.quantity) > 0
        ? Number(finalAmount) / Number(form.quantity)
        : Number(form.pricePerUnit) || 0,
      amount: roundMoney(finalAmount),
      category: String(form.category),
      date,
    };

    const ok = await runDbAction(async () => {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'expenses', editingExpense.id), expenseData);
    }, 'แก้ไขค่าใช้จ่ายไม่สำเร็จ');
    return { ok, edited: true };
  }

  // CREATE PATH
  const line = toExpenseLine(form);
  const { plan, targetStock, newStock, unitMismatch } = resolveStockIntake(line, stock);

  const expenseRecord = buildExpenseRecord(line, {
    date,
    plan,
    extra: { createdAt: serverTimestamp() },
  });

  let syncAction = null;

  const ok = await runDbAction(async () => {
    const batch = writeBatch(db);
    const expenseRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'expenses'));
    // ซื้อของใหม่ครั้งแรก: สร้างสต็อกในชุดเดียวกัน · ผูก stockId ให้รายจ่าย (ประวัติสต็อก/หมวดตรงกัน)
    const newStockRef = !plan?.ok && newStock ? doc(collection(db, 'artifacts', appId, 'public', 'data', 'stock')) : null;
    if (newStockRef) Object.assign(expenseRecord, { stockId: newStockRef.id, stockQuantity: line.quantity, stockUnit: line.unit || 'ชิ้น' });
    batch.set(expenseRef, expenseRecord);

    if (plan && plan.ok && targetStock) {
      const stockRef = doc(db, 'artifacts', appId, 'public', 'data', 'stock', targetStock.id);
      batch.update(stockRef, {
        quantity: increment(plan.inQty),
        unitCost: plan.newUnitCost,
        lastPurchaseAt: serverTimestamp(),
        lastPurchaseUnitCost: plan.inUnitCost,
      });
      syncAction = { action: 'updated', name: targetStock.name, qty: plan.newQuantity, unit: targetStock.unit };
    } else if (newStockRef) {
      const stockRef = newStockRef;
      const cat = STOCK_CATEGORIES.includes(line.category) ? line.category : inferStockCategory(line.title);
      batch.set(stockRef, {
        name: line.title,
        category: cat,
        quantity: line.quantity,
        unit: line.unit || 'ชิ้น',
        minQuantity: DEFAULT_MIN_QUANTITY,
        unitCost: line.quantity > 0 ? expenseRecord.pricePerUnit : 0,
      });
      syncAction = { action: 'created', name: line.title, qty: line.quantity, unit: line.unit || 'ชิ้น' };
    }

    await batch.commit();
  }, 'บันทึกค่าใช้จ่ายไม่สำเร็จ');

  return { ok, syncAction, unitMismatch, targetStock, line };
}

/** The "stock updated/created" line for a successful create ('' if nothing synced). */
export function syncMessage(result) {
  const s = result?.syncAction;
  if (!result?.ok || !s) return '';
  return s.action === 'created'
    ? `สร้างสต็อก "${s.name}" ${formatNumber(s.qty, { maxDecimals: 3 })} ${s.unit} สำเร็จ`
    : `อัพเดตสต็อก "${s.name}" เป็น ${formatNumber(s.qty, { maxDecimals: 3 })} ${s.unit} สำเร็จ`;
}

/** Same toasts the Expenses form always showed. Returns the sync message ('' if none). */
export function reportSave(result, toast) {
  if (!result.ok) return '';
  if (result.edited) {
    toast.success('แก้ไขรายจ่ายสำเร็จ');
    return '';
  }
  toast.success('บันทึกรายจ่ายสำเร็จ');
  if (result.unitMismatch) {
    toast.warning(`หน่วยไม่ตรงกับสต็อก (${result.line.unit} / ${result.targetStock.unit}) ยังไม่ลงสต๊อก`);
    return '';
  }
  return syncMessage(result);
}
