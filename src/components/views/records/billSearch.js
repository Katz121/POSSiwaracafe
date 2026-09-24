// Bills screen helpers (UX v2 · WP2). Presentation only: they pick which bills
// to show and how to label them, never what a bill is worth.

export const BILL_FILTERS = ['all', 'unpaid', 'paid', 'qr'];

export const normalizeBillFilter = (value) => (BILL_FILTERS.includes(value) ? value : 'all');

/** Short printable code "ZLJE6B" (last 6 chars of the doc id, as on the old screen). */
export const billCode = (bill) => String(bill?.id || '').slice(-6).toUpperCase();

/** Display name of the customer on a bill, or '' for walk-ins. */
export function billCustomerName(bill, memberByPhone) {
  if (!bill) return '';
  const member = bill.memberPhone && memberByPhone ? memberByPhone.get(bill.memberPhone) : null;
  return String(bill.memberNickname || bill.customerName || member?.name || '').trim();
}

export function matchesBillFilter(bill, filter) {
  switch (filter) {
    case 'unpaid': return !bill.isPaid;
    case 'paid': return !!bill.isPaid;
    case 'qr': return bill.source === 'qr';
    default: return true;
  }
}

export function countBillFilters(bills = []) {
  const counts = { all: bills.length, unpaid: 0, paid: 0, qr: 0 };
  bills.forEach((b) => {
    if (b.isPaid) counts.paid += 1; else counts.unpaid += 1;
    if (b.source === 'qr') counts.qr += 1;
  });
  return counts;
}

const norm = (s) => String(s ?? '').trim().toLocaleLowerCase('th');

/**
 * Search by queue number, bill code, customer name/phone or item name.
 *  "7" / "#7"        → queue number 7 exactly (not 17, 27…)
 *  "0812" (3+ digits) → also matches member phone numbers
 *  "zlje" / "#ZLJE6B" → bill code
 *  "นุช" / "ลาเต้"     → customer name or any item name
 */
export function matchesBillQuery(bill, query, customerName = '') {
  const raw = norm(query);
  if (!raw) return true;
  const q = raw.replace(/^#/, '');
  if (!q) return true;
  if (/^\d+$/.test(q)) {
    if (Number(bill.queueNumber) === Number(q)) return true;
    if (q.length >= 3 && String(bill.memberPhone || '').includes(q)) return true;
    return norm(billCode(bill)).includes(q) && q.length >= 3;
  }
  if (norm(billCode(bill)).includes(q)) return true;
  if (norm(customerName).includes(q)) return true;
  return (bill.items || []).some((item) => norm(item?.name).includes(q));
}

/** Exact queue-number hits float to the top; otherwise keep the given order. */
export function rankBills(bills, query) {
  const q = norm(query).replace(/^#/, '');
  if (!/^\d+$/.test(q)) return bills;
  const n = Number(q);
  return [...bills].sort((a, b) => (Number(b.queueNumber) === n) - (Number(a.queueNumber) === n));
}

const itemCount = (bill) => (bill.items || []).reduce((s, i) => s + (Number(i?.quantity) || 0), 0);
export { itemCount as billItemCount };

/**
 * Read-only view of `order.stockDeduction` (written by App.updateStatus when a
 * bill is completed). Returns null when the bill has no record.
 *   applied   [{ stockId, name, unit, used }]  stock that was actually cut
 *   missed    [{ name, reason: 'unlinked'|'missing', quantity?, used? }]
 */
export function summarizeStockDeduction(order, stockById = new Map()) {
  const record = order?.stockDeduction;
  if (!record || typeof record !== 'object') return null;
  const applied = Object.entries(record.applied || {}).map(([stockId, used]) => {
    const s = stockById.get(stockId);
    return { stockId, name: s?.name || 'วัตถุดิบที่ถูกลบแล้ว', unit: s?.unit || '', used: Number(used) || 0 };
  });
  const missed = [];
  (record.unlinked || []).forEach((u) => {
    missed.push({ name: String(u?.name || 'ไม่ทราบชื่อ'), reason: 'unlinked', quantity: Number(u?.quantity) || 0 });
  });
  // One entry per menu item even if several of its ingredients were missing.
  const seen = new Set();
  (record.skipped || []).forEach((s) => {
    const name = String(s?.item || 'ไม่ทราบชื่อ');
    if (seen.has(name)) return;
    seen.add(name);
    missed.push({ name, reason: 'missing' });
  });
  return { applied, missed, at: record.at || '' };
}

export const MISSED_REASON_LABEL = {
  unlinked: 'ยังไม่ผูก',
  missing: 'วัตถุดิบถูกลบ',
};
