// Pure half of the expense/intake form (no Firestore), moved unchanged from
// ExpensesView so the Stock intake sheet and the Expenses form share it.
import { getStockCategory, NON_CASH_EXPENSE_CATEGORIES } from '../../../config/constants';
import {
  isInventoryCategory, findAliasMatch, findStockCandidates, planStockIntake, normalizeName, normalizePacks, roundUnitCost,
} from '../../../utils/stockIntake';
import { inferOperatingCategory } from '../../../utils/expenseCategory';

export const EMPTY_EXPENSE = Object.freeze({ title: '', quantity: '', unit: 'ชิ้น', pricePerUnit: '', amount: '', category: 'วัตถุดิบ' });

export const emptyExpense = () => ({ ...EMPTY_EXPENSE });

/** Field errors for the form (unchanged rules from ExpensesView). */
export function validateExpense(expense) {
  const errors = {};

  if (!expense.title || !expense.title.trim()) {
    errors.title = 'กรุณากรอกชื่อรายจ่าย';
  }

  const qty = Number(expense.quantity);
  if (isInventoryCategory(expense.category) && qty <= 0) {
    errors.quantity = 'จำนวนต้องมากกว่า 0';
  }

  const price = Number(expense.pricePerUnit);
  const amount = Number(expense.amount) || (qty * price);
  const calculatedUnitCost = qty > 0 ? amount / qty : price;
  if (isInventoryCategory(expense.category) && calculatedUnitCost <= 0) {
    errors.pricePerUnit = 'ราคาต้องมากกว่า 0';
  }

  if (!amount || amount <= 0) {
    errors.amount = 'ราคารวมต้องมากกว่า 0';
  }

  return errors;
}

/** Total the form resolves to (typed total wins, else qty × unit price). */
export const expenseTotal = (form) => form.amount || (Number(form.quantity) * Number(form.pricePerUnit));

/** The purchase line the create path writes. */
export function toExpenseLine(form) {
  return {
    title: String(form.title),
    quantity: Number(form.quantity) || 0,
    unit: String(form.unit || ''),
    amount: Number(expenseTotal(form)),
    category: String(form.category),
  };
}

/**
 * Which stock row a purchase line lands on (alias match first, then exact
 * name). Pure · also used by the intake sheet to preview the result.
 */
export function resolveStockIntake(line, stock) {
  let plan = null;
  let targetStock = null;
  let newStock = false;
  let unitMismatch = false;

  if (isInventoryCategory(line.category)) {
    const aliasMatch = findAliasMatch(stock, { title: line.title });
    if (aliasMatch) {
      targetStock = aliasMatch.stock;
      plan = planStockIntake(line, targetStock, aliasMatch.alias);
    } else {
      const candidates = findStockCandidates(stock, line.title, 1);
      if (candidates.length > 0 && normalizeName(candidates[0].name) === normalizeName(line.title)) {
        targetStock = candidates[0];
        plan = planStockIntake(line, targetStock);
      } else {
        newStock = true;
      }
    }

    if (plan && !plan.ok && plan.reason === 'unit-mismatch') {
      unitMismatch = true;
      plan = null;
    }
  }

  return { plan, targetStock, newStock, unitMismatch };
}

/** Form values for receiving `item` (same prefill as picking its name in Expenses). */
export function intakeFormFor(item) {
  // มีหน่วยซื้อ (ขวด/ถุง) = ตั้งต้นที่หน่วยซื้อตัวแรก เพราะร้านซื้อเป็นหน่วยนั้น · ราคาต่อหน่วยคูณขนาดให้
  const pack = normalizePacks(item?.packs)[0];
  return {
    ...EMPTY_EXPENSE,
    title: item?.name || '',
    category: getStockCategory(item),
    unit: pack ? pack.label : (item?.unit || EMPTY_EXPENSE.unit),
    pricePerUnit: item?.unitCost ? roundUnitCost(Number(item.unitCost) * (pack ? pack.size : 1)) : '',
  };
}

/**
 * คีย์ลัดซื้อวัตถุดิบที่ชื่อไม่ตรงของในสต็อก (ลบ/เลิกใช้ไปแล้ว) · กดแล้วบันทึกจะสร้างวัตถุดิบใหม่ซ้ำ
 * หน้ารายจ่ายซ่อนตัวนี้ หน้าตั้งค่าติดป้ายให้แก้ชื่อ
 */
export function isStaleQuickExpense(item, stock = []) {
  if (!isInventoryCategory(item?.category)) return false;
  return resolveStockIntake({ title: String(item?.title || ''), quantity: 1, unit: String(item?.unit || ''), amount: 0, category: item.category }, stock).newStock;
}

// ── Title suggestions (moved from ExpensesView) ─────────────────────────────
/** Names from the stock master and past expenses, de-duplicated, Thai-sorted. */
export function buildTitleSuggestions(stock = [], expenses = []) {
  const seen = new Set();
  const suggestions = [];
  const addSuggestion = (value) => {
    const title = String(value || '').trim();
    const key = title.toLocaleLowerCase();
    if (!title || seen.has(key)) return;
    seen.add(key);
    suggestions.push(title);
  };
  stock.forEach((item) => addSuggestion(item.name));
  // ชื่อซื้อวัตถุดิบเก่าที่ไม่มีในสต็อกแล้ว (ลบ/เลิกใช้) ไม่แนะนำ · เลือกแล้วบันทึกจะสร้างวัตถุดิบตัวใหม่ซ้ำ
  // (นมสด Meiji · 2026-10-11) · ของเสีย/พนักงานกิน เป็นชื่อที่ระบบตั้งเอง ไม่ใช่ชื่อที่คนพิมพ์
  const live = new Set(stock.map((item) => normalizeName(item.name)));
  expenses.forEach((expense) => {
    if (NON_CASH_EXPENSE_CATEGORIES.includes(expense.category)) return;
    if (isInventoryCategory(expense.category) && !live.has(normalizeName(expense.title))) return;
    addSuggestion(expense.title);
  });
  return suggestions.sort((a, b) => a.localeCompare(b, 'th'));
}

/** Suggestions ranked for what is typed (exact → prefix → word prefix → contains). */
export function rankTitleSuggestions(suggestions, typed) {
  const query = String(typed || '').trim().toLocaleLowerCase();
  return suggestions
    .filter((title) => !query || title.toLocaleLowerCase().includes(query))
    .sort((a, b) => {
      if (!query) return a.localeCompare(b, 'th');
      const score = (value) => {
        if (value === query) return 0;
        if (value.startsWith(query)) return 1;
        if (value.split(/\s+/).some((word) => word.startsWith(query))) return 2;
        return 3;
      };
      return score(a.toLocaleLowerCase()) - score(b.toLocaleLowerCase()) || a.localeCompare(b, 'th');
    });
}

/**
 * Next form after typing/picking a title: snaps to a known spelling and, when
 * it is exactly a stock item, pulls that item's category, unit and unit cost.
 */
export function applyExpenseTitle(form, typedTitle, suggestions, stock) {
  // ชื่อที่เป็นค่าใช้จ่ายร้านชัดๆ (น้ำแข็ง ค่าไฟ) ย้ายออกจากหมวดวัตถุดิบ ไม่ให้ไปสร้างสต็อก
  const matchedExpenseTitle = suggestions.find(
    (suggestion) => suggestion.toLocaleLowerCase() === typedTitle.trim().toLocaleLowerCase(),
  );
  const title = matchedExpenseTitle || typedTitle;
  const exactMatches = findStockCandidates(stock, title, 1);
  const matchedStock = (exactMatches.length > 0 && normalizeName(exactMatches[0].name) === normalizeName(title)) ? exactMatches[0] : null;
  return {
    ...form,
    title,
    ...(matchedStock
      ? {
          category: getStockCategory(matchedStock),
          unit: matchedStock.unit || form.unit,
          pricePerUnit: matchedStock.unitCost || form.pricePerUnit,
        }
      : (isInventoryCategory(form.category) && inferOperatingCategory(title) ? { category: inferOperatingCategory(title) } : {})),
  };
}

/** Unit cost shown in the (auto) field: total ÷ qty when both are set. */
export function displayUnitCost(form) {
  const qty = Number(form.quantity);
  const amount = Number(form.amount);
  if (qty > 0 && amount > 0) return String(Number((amount / qty).toFixed(4)));
  return form.pricePerUnit;
}

/** Total shown in the total field (typed total, else qty × unit price). */
export const displayTotal = (form) => form.amount || (Number(form.quantity) * Number(form.pricePerUnit)) || '';
