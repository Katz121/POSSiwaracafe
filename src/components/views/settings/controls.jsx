import { useId } from 'react';
import { Save } from 'lucide-react';
import { Button, SectionCard } from '../../ui';

/** Titled settings block (flat SectionCard). */
export function Section({ title, description, actions, id, danger = false, children, className = '' }) {
  return (
    <SectionCard
      id={id}
      title={title}
      description={description}
      actions={actions}
      className={`${danger ? 'border-2 border-[var(--state-danger)] shadow-none' : ''} ${className}`}
    >
      {children}
    </SectionCard>
  );
}

/**
 * On/off switch row · the whole row is the 56px target.
 * role="switch" + aria-checked; the label is the accessible name.
 */
export function Toggle({ label, description, checked, onChange, disabled = false }) {
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-labelledby={`${id}-l`}
      aria-describedby={description ? `${id}-d` : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="w-full min-h-14 flex items-center justify-between gap-4 rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] px-4 py-3 text-left hover:bg-[var(--bg-hover)] disabled:opacity-50 outline-none focus-visible:shadow-[var(--focus-ring)]"
    >
      <span className="min-w-0">
        <span id={`${id}-l`} className="block font-semibold text-[var(--text-primary)]">{label}</span>
        {description && <span id={`${id}-d`} className="block text-sm leading-[var(--lh-sm)] text-[var(--text-muted)]">{description}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`relative shrink-0 w-12 h-7 rounded-full transition-colors ${checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'}`}
      >
        <span className={`absolute top-1 w-5 h-5 rounded-full bg-[var(--bg-surface)] shadow-[var(--elev-1)] transition-all ${checked ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  );
}

/** Native select with the input look (keeps the OS picker on iPad). */
export function NativeSelect({ label, value, onChange, children, hint }) {
  const id = useId();
  return (
    <div className="w-full">
      <label htmlFor={id} className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5">{label}</label>
      <select
        id={id}
        value={value}
        onChange={onChange}
        className="w-full min-h-12 rounded-[var(--radius-sm)] border-2 border-[var(--border-strong)] bg-[var(--bg-tertiary)] px-4 text-base text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus-visible:shadow-[var(--focus-ring)] cursor-pointer"
      >
        {children}
      </select>
      {hint && <p className="mt-1.5 text-sm text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

/**
 * Sticky save bar for draft-based tabs. Every tab saves the same full
 * `config/settings` payload as before; `dirty` only drives the hint.
 */
export function SaveBar({ dirty, onSave, saving = false, inline = false }) {
  if (inline) {
    return (
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        <p className={`mr-auto text-sm ${dirty ? 'text-[var(--state-warn)] font-semibold' : 'text-[var(--text-muted)]'}`} aria-live="polite">
          {dirty ? 'ยังไม่บันทึก' : ''}
        </p>
        <Button onClick={onSave} loading={saving} leftIcon={<Save size={18} />}>บันทึก</Button>
      </div>
    );
  }
  return (
    <div className="sticky bottom-0 z-[5] -mx-[var(--page-pad)] md:mx-0 mt-2 px-[var(--page-pad)] md:px-4 py-3 flex flex-wrap items-center justify-end gap-3 bg-[var(--bg-surface)] border-t border-[var(--border-color)] md:rounded-[var(--radius)] md:shadow-[var(--elev-2)] md:border-t-0">
      <p className={`mr-auto text-sm ${dirty ? 'text-[var(--state-warn)] font-semibold' : 'text-[var(--text-muted)]'}`} aria-live="polite">
        {dirty ? 'มีการแก้ไขที่ยังไม่บันทึก' : 'บันทึกล่าสุดแล้ว'}
      </p>
      <Button onClick={onSave} loading={saving} leftIcon={<Save size={18} />}>บันทึกการตั้งค่า</Button>
    </div>
  );
}
