/** Quiet destructive action (red ink, soft red hover) · 44px minimum target. */
export default function DangerButton({ icon, children, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 min-h-11 min-w-11 ${children ? 'px-3' : ''} rounded-[var(--radius-sm)] text-sm font-semibold text-[var(--state-danger)] hover:bg-[var(--state-danger-soft)] disabled:opacity-50 outline-none focus-visible:shadow-[var(--focus-ring)] ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
