/** Section heading used between dashboard blocks ("วันนี้", "ต้องจัดการ", "เดือนนี้"). */
export default function SectionTitle({ title, description, actions, id }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 id={id} className="text-[length:var(--fs-lg)] leading-[var(--lh-lg)] font-semibold text-[var(--text-primary)]">{title}</h2>
        {description && <p className="text-sm leading-[var(--lh-sm)] text-[var(--text-muted)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
