/**
 * SmartAlerts · the dashboard "ต้องจัดการ" list (UX v2 · WP3).
 *
 * Alerts come from services/alertService (low stock, stock-link / stock_audit
 * issues, sales drop, high expense, waste, new members…). Each one renders as a
 * Banner row: a sentence + one button that deep-links to where it is fixed
 * (spec principle 6). Dismissing hides an alert for this visit only.
 *
 * Props:
 *  data         input for generateSmartAlerts ({ orders, expenses, stock, members, menu, beanModifiers, today, currentMonth })
 *  onAction     (view, alert) => void
 *  extraAlerts  alerts computed by the caller, same shape as alertService's
 *  limit        rows shown before "ดูอีก N รายการ" (default 5)
 *  emptyState   node shown when nothing needs attention (default: nothing)
 */
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { generateSmartAlerts, ALERT_SEVERITY } from '../services/alertService';
import { Banner } from './ui';

const SEVERITY_TONE = {
  [ALERT_SEVERITY.CRITICAL]: 'danger',
  [ALERT_SEVERITY.WARNING]: 'warn',
  [ALERT_SEVERITY.SUCCESS]: 'ok',
  [ALERT_SEVERITY.INFO]: 'info',
};
// Banner's own action/dismiss buttons are 40px; the dashboard list needs 44px
// targets, so the row renders its own pair inside Banner's `action` slot.
const TONE_INK = {
  danger: 'text-[var(--state-danger)]',
  warn: 'text-[var(--state-warn)]',
  ok: 'text-[var(--state-ok)]',
  info: 'text-[var(--state-info)]',
};
const ROW_BTN = 'min-h-11 rounded-[var(--radius-sm)] hover:bg-[var(--bg-surface)] outline-none focus-visible:shadow-[var(--focus-ring)]';

const SEVERITY_ORDER = {
  [ALERT_SEVERITY.CRITICAL]: 0,
  [ALERT_SEVERITY.WARNING]: 1,
  [ALERT_SEVERITY.INFO]: 2,
  [ALERT_SEVERITY.SUCCESS]: 3,
};

// The dashboard itself is where these point; a button that reloads the page
// you are on is noise.
const SELF_VIEWS = new Set(['dashboard']);

export default function SmartAlerts({ data, onAction, extraAlerts = [], limit = 5, emptyState = null }) {
  const [dismissed, setDismissed] = useState([]);
  const [showAll, setShowAll] = useState(false);

  const alerts = useMemo(() => {
    const all = [...extraAlerts, ...generateSmartAlerts(data)];
    return all
      .filter((a) => !dismissed.includes(a.id))
      .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
  }, [data, extraAlerts, dismissed]);

  if (alerts.length === 0) return emptyState;

  const visible = showAll ? alerts : alerts.slice(0, limit);
  const hidden = alerts.length - visible.length;

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2" aria-label="รายการที่ต้องจัดการ">
        {visible.map((alert) => {
          const view = alert.action?.view;
          const actionable = view && onAction && !SELF_VIEWS.has(view);
          const tone = SEVERITY_TONE[alert.severity] || 'info';
          const dismiss = () => setDismissed((prev) => [...prev, alert.id]);
          return (
            <li key={alert.id}>
              <Banner
                tone={tone}
                title={alert.title}
                action={(
                  <div className="flex items-center gap-1">
                    {actionable && (
                      <button
                        type="button"
                        onClick={() => onAction(view, alert)}
                        className={`${ROW_BTN} px-3 text-sm font-semibold whitespace-nowrap ${TONE_INK[tone]}`}
                      >
                        {alert.action.label}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={dismiss}
                      aria-label={`ซ่อน: ${alert.title}`}
                      className={`${ROW_BTN} w-11 -mr-2 flex items-center justify-center text-[var(--text-secondary)]`}
                    >
                      <X size={18} />
                    </button>
                  </div>
                )}
              >
                {alert.message}
              </Banner>
            </li>
          );
        })}
      </ul>
      {(hidden > 0 || showAll) && alerts.length > limit && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="self-start inline-flex items-center gap-1 min-h-11 px-3 rounded-[var(--radius-sm)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          {showAll ? <><ChevronUp size={16} /> ย่อรายการ</> : <><ChevronDown size={16} /> ดูอีก {hidden} รายการ</>}
        </button>
      )}
    </div>
  );
}
