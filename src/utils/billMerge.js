export const MAX_MERGED_BILLS = 100;

export function summarizeMergedBills(bills, selectedIds) {
  const ids = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const selected = bills.filter((bill) => ids.has(bill.id));
  return {
    bills: selected,
    count: selected.length,
    total: selected.reduce((sum, bill) => sum + (Number(bill.total) || 0), 0),
  };
}

export function validateMergedBills(bills) {
  if (bills.length < 2) throw new Error('select-at-least-two-bills');
  if (bills.length > MAX_MERGED_BILLS) throw new Error('too-many-bills');
  if (bills.some((bill) => bill.status !== 'completed')) throw new Error('bill-not-completed');
  if (bills.some((bill) => bill.isPaid)) throw new Error('bill-already-paid');
  const dates = new Set(bills.map((bill) => bill.date).filter(Boolean));
  if (dates.size > 1) throw new Error('bills-must-share-date');
  return true;
}
