// Pure half of the expense/intake form (no Firestore), moved unchanged from
// ExpensesView so the Stock intake sheet and the Expenses form share it.
import { getStockCategory } from '../../../config/constants';
import {
  isInventoryCategory, findAliasMatch, findStockCandidates, planStockIntake, normalizeName,
} from '../../../utils/stockIntake';

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
  return {
    ...EMPTY_EXPENSE,
    title: item?.name || '',
    category: getStockCategory(item),
    unit: item?.unit || EMPTY_EXPENSE.unit,
    pricePerUnit: item?.unitCost || '',
  };
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
  expenses.forEach((expense) => addSuggestion(expense.title));
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
      : {}),
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
