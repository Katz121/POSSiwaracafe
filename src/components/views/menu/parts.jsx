import { createPortal } from 'react-dom';
import { AlertOctagon, Link2, Link2Off, Layers } from 'lucide-react';
import { Badge } from '../../ui';

/**
 * Switch · role="switch", 44px touch target around a 44×26 track.
 * `label` is the accessible name; pass `showLabel` to print it next to the track.
 */
export function Toggle({ checked, onChange, label, showLabel = false, disabled = false, className = '' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={showLabel ? undefined : label}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onChange?.(!checked); }}
      className={`shrink-0 inline-flex items-center gap-2 min-h-11 min-w-11 justify-center rounded-[var(--radius-sm)] outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-50 ${className}`}
    >
      <span
        aria-hidden="true"
        className={`relative w-11 h-[26px] rounded-full transition-colors duration-150 ${checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'}`}
      >
        <span
          className={`absolute top-[3px] w-5 h-5 rounded-full bg-white shadow-[var(--elev-1)] transition-[left] duration-150 ${checked ? 'left-[21px]' : 'left-[3px]'}`}
        />
      </span>
      {showLabel && <span className="text-sm text-[var(--text-primary)]">{label}</span>}
    </button>
  );
}

/** A labelled switch row for forms: title + hint on the left, switch on the right. */
export function ToggleRow({ icon: Icon, title, hint, checked, onChange }) {
  return (
    <div className="flex items-center gap-3 min-h-14 py-1.5">
      {Icon && <Icon size={20} className="shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />}
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium leading-snug text-[var(--text-primary)]">{title}</p>
        {hint && <p className="text-xs leading-[var(--lh-xs)] text-[var(--text-muted)]">{hint}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

/** Stock-link status pill · the owner wants unlinked / broken menus to be impossible to miss. */
export function StockLinkBadge({ status, size = 'sm' }) {
  if (!status) return null;
  if (status.deadCount > 0) {
    return (
      <Badge tone="danger" size={size} icon={<AlertOctagon size={14} aria-hidden="true" />} title="สูตรชี้ไปสต็อกที่ถูกลบแล้ว ขายแล้วส่วนนี้ไม่ถูกตัด" className="font-semibold">
        ลิงก์เสีย {status.deadCount}
      </Badge>
    );
  }
  if (status.status === 'unlinked') {
    return (
      <Badge tone="warn" size={size} icon={<Link2Off size={14} aria-hidden="true" />} className="font-semibold">
        ยังไม่ผูกสต็อก
      </Badge>
    );
  }
  if (status.status === 'modifier_only') {
    return (
      <Badge tone="info" size={size} icon={<Layers size={14} aria-hidden="true" />} title="ตัดสต็อกแค่จากตัวเลือก (เช่นเมล็ด) · แก้ว/นม/น้ำแข็งของเมนูไม่ถูกตัด">
        ผูกแค่ตัวเลือก
      </Badge>
    );
  }
  return (
    <Badge tone="ok" size={size} icon={<Link2 size={14} aria-hidden="true" />}>
      ผูกสต็อกแล้ว · {status.aliveCount} รายการ
    </Badge>
  );
}

/**
 * Renders a (non-portalled) ui Modal at <body> level so it stacks above an open
 * Sheet (Sheets are portalled; the later node wins at equal z-index).
 */
export function OnTop({ children }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

/** Section heading inside sheets. */
export function SheetSection({ id, title, icon: Icon, actions, children, className = '' }) {
  return (
    <section id={id} className={`scroll-mt-4 flex flex-col gap-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-2 min-h-11">
        {Icon && <Icon size={18} className="text-[var(--text-secondary)]" aria-hidden="true" />}
        <h3 className="text-base font-semibold text-[var(--text-primary)] flex-1 min-w-0">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}
