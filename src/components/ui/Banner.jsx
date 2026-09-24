import { Info, CheckCircle2, AlertTriangle, AlertOctagon, X } from 'lucide-react';

const TONES = {
  info: { box: 'bg-[var(--state-info-soft)] border-[var(--state-info)]', ink: 'text-[var(--state-info)]', icon: Info },
  ok: { box: 'bg-[var(--state-ok-soft)] border-[var(--state-ok)]', ink: 'text-[var(--state-ok)]', icon: CheckCircle2 },
  warn: { box: 'bg-[var(--state-warn-soft)] border-[var(--state-warn)]', ink: 'text-[var(--state-warn)]', icon: AlertTriangle },
  danger: { box: 'bg-[var(--state-danger-soft)] border-[var(--state-danger)]', ink: 'text-[var(--state-danger)]', icon: AlertOctagon },
};

/**
 * Banner · an actionable message: a sentence + one button (spec principle 6).
 *
 * Props:
 *  tone       'info' | 'ok' | 'warn' | 'danger'  (danger → role="alert", else role="status")
 *  title      string | node (the sentence)
 *  children?  extra detail line
 *  action?    { label, onClick } · or a node
 *  onDismiss? shows a close button
 *  icon?      override icon (lucide component) · false hides it
 *  compact?   tighter padding for list rows
 */
export default function Banner({
  tone = 'info',
  title,
  children,
  action,
  onDismiss,
  icon,
  compact = false,
  className = '',
}) {
  const t = TONES[tone] || TONES.info;
  const Icon = icon === false ? null : icon || t.icon;
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-[var(--radius)] border-l-4 ${t.box} ${compact ? 'px-3 py-2' : 'px-4 py-3'} ${className}`}
    >
      {Icon && <Icon size={20} className={`shrink-0 mt-0.5 ${t.ink}`} />}
      <div className="min-w-0 flex-1">
        {title && <p className="text-sm font-semibold leading-[var(--lh-sm)] text-[var(--text-primary)]">{title}</p>}
        {children && <div className="text-sm leading-[var(--lh-sm)] text-[var(--text-secondary)] mt-0.5">{children}</div>}
      </div>
      {action && (
        action.label !== undefined ? (
          <button
            type="button"
            onClick={action.onClick}
            className={`shrink-0 self-center min-h-10 px-3 rounded-[var(--radius-sm)] text-sm font-semibold ${t.ink} hover:bg-[var(--bg-surface)] outline-none focus-visible:shadow-[var(--focus-ring)]`}
          >
            {action.label}
          </button>
        ) : <div className="shrink-0 self-center">{action}</div>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="ปิดข้อความ"
          className="shrink-0 w-10 h-10 min-h-0 -my-1 -mr-1 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
}
