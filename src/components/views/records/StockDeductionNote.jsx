import { useState } from 'react';
import { ChevronDown, PackageCheck, PackageX } from 'lucide-react';
import { formatNumber } from '../../../utils/format';
import { MISSED_REASON_LABEL } from './billSearch';

/**
 * Read-only line under a completed bill: what stock this bill cut.
 * "ตัดสต็อก 5 รายการ · ไม่ได้ตัด: กาแฟดริป (ยังไม่ผูก)" + an expandable list.
 */
export default function StockDeductionNote({ summary }) {
  const [open, setOpen] = useState(false);
  if (!summary) return null;
  const { applied, missed } = summary;
  const hasMissed = missed.length > 0;
  const Icon = hasMissed ? PackageX : PackageCheck;
  const missedText = missed.map((m) => `${m.name} (${MISSED_REASON_LABEL[m.reason] || m.reason})`).join(', ');

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-surface)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full min-h-11 flex items-start gap-3 px-3 py-2.5 text-left rounded-[var(--radius)] outline-none focus-visible:shadow-[var(--focus-ring)] hover:bg-[var(--bg-hover)]"
      >
        <Icon size={18} className={`shrink-0 mt-0.5 ${hasMissed ? 'text-[var(--state-warn)]' : 'text-[var(--state-ok)]'}`} aria-hidden="true" />
        <span className="min-w-0 flex-1 text-sm leading-[var(--lh-sm)] text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">
            {applied.length > 0 ? `ตัดสต็อก ${applied.length} รายการ` : 'ไม่ได้ตัดสต็อก'}
          </span>
          {hasMissed && (
            <span className="text-[var(--state-warn)]"> · ไม่ได้ตัด: {missedText}</span>
          )}
        </span>
        {applied.length > 0 && (
          <ChevronDown size={18} className={`shrink-0 mt-0.5 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        )}
      </button>
      {open && applied.length > 0 && (
        <ul className="px-3 pb-3 pt-1 flex flex-col gap-1 text-sm" aria-label="วัตถุดิบที่ถูกตัด">
          {applied.map((a) => (
            <li key={a.stockId} className="flex items-center justify-between gap-3 pl-8">
              <span className="min-w-0 truncate text-[var(--text-secondary)]">{a.name}</span>
              <span className="num shrink-0 text-[var(--text-primary)]">
                −{formatNumber(a.used, { maxDecimals: 3 })}{a.unit ? ` ${a.unit}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
