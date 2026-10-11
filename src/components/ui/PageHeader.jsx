import { isValidElement } from 'react';
import { ChevronLeft } from 'lucide-react';

/**
 * PageHeader · one header for every screen (spec §6).
 *
 * Props:
 *  title      string | node
 *  subtitle?  string | node (muted, one line on phone)
 *  icon?      lucide component or element · shown in a soft accent tile
 *  back?      { label, onClick }
 *  actions?   node · right-aligned; wraps to a second row under 1024px (iPad แนวตั้ง ชื่อหน้าไม่ถูกบีบจนตัด)
 *  meta?      node · small row under the title (badges, "อัปเดต 10:32")
 *  sticky     default true · sticks to the top of the scrolling view
 *  className
 *
 * 64px min height, title --fs-2xl / 600 (--fs-xl on phone). The global QR bell
 * is gone, so the right edge belongs to `actions`.
 */
export default function PageHeader({
  title,
  subtitle,
  icon: Icon,
  back,
  actions,
  meta,
  sticky = true,
  className = '',
  children,
}) {
  const iconNode = !Icon ? null : isValidElement(Icon) ? Icon : <Icon size={22} strokeWidth={2} />;

  return (
    <header
      className={`${sticky ? 'sticky top-0' : ''} z-[var(--z-dropdown)] shrink-0 bg-[var(--bg-surface)] border-b border-[var(--border-color)] px-[var(--page-pad)] ${className}`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 min-h-[var(--header-h)] py-2">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {back && (
            <button
              type="button"
              onClick={back.onClick}
              aria-label={back.label || 'กลับ'}
              className="shrink-0 -ml-2 inline-flex items-center gap-1 min-h-11 px-2 rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              <ChevronLeft size={22} />
              {back.label && <span className="hidden sm:inline text-sm font-medium">{back.label}</span>}
            </button>
          )}
          {iconNode && (
            <span className="shrink-0 w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] text-[var(--accent-soft-fg)] flex items-center justify-center">
              {iconNode}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-[length:var(--fs-xl)] leading-[var(--lh-xl)] md:text-[length:var(--fs-2xl)] md:leading-[var(--lh-2xl)] font-semibold text-[var(--text-primary)] truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm leading-[var(--lh-sm)] text-[var(--text-muted)] truncate">{subtitle}</p>
            )}
            {meta && <div className="mt-1 flex flex-wrap items-center gap-2">{meta}</div>}
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto lg:justify-end">
            {actions}
          </div>
        )}
      </div>
      {children}
    </header>
  );
}
