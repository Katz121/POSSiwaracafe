import { useEffect, useState } from 'react';
import { Coffee, PanelLeftClose, PanelLeftOpen, Menu, X } from 'lucide-react';
import { NAV_ITEMS, NAV_BY_KEY, navSections } from './navConfig';
import { NavBadge, NavFooterActions } from './NavParts';

const SECTIONS = navSections();

function SidebarItem({ item, active, badge, onNavigate }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      data-nav-key={item.key}
      aria-current={active ? 'page' : undefined}
      onClick={() => onNavigate(item.key)}
      className={`w-full flex items-center gap-3 min-h-11 px-3 rounded-[var(--radius-sm)] text-sm leading-snug text-left outline-none focus-visible:shadow-[var(--focus-ring)] transition-colors duration-150 ${
        active
          ? 'bg-[var(--accent-soft)] text-[var(--accent-soft-fg)] font-semibold'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
      }`}
    >
      <Icon size={19} strokeWidth={active ? 2.3 : 1.9} className="shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.protected && <span className="sr-only">(ต้องใช้ PIN)</span>}
      <NavBadge navKey={item.key} count={badge} />
    </button>
  );
}

function RailItem({ item, active, badge, onNavigate }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      data-nav-key={item.key}
      aria-current={active ? 'page' : undefined}
      aria-label={item.label}
      title={item.label}
      onClick={() => onNavigate(item.key)}
      className={`relative w-14 flex flex-col items-center justify-center gap-0.5 min-h-14 py-1.5 rounded-[var(--radius-sm)] outline-none focus-visible:shadow-[var(--focus-ring)] transition-colors duration-150 ${
        active
          ? 'bg-[var(--accent-soft)] text-[var(--accent-soft-fg)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
      }`}
    >
      <Icon size={20} strokeWidth={active ? 2.3 : 1.9} />
      <span className={`text-[11px] leading-[14px] max-w-full truncate ${active ? 'font-semibold' : ''}`}>{item.short}</span>
      {badge > 0 && <NavBadge navKey={item.key} count={badge} className="absolute top-0.5 right-0.5" />}
    </button>
  );
}

function FullNav({ view, badges, onNavigate, footerProps, header }) {
  return (
    <>
      {header}
      <nav aria-label="เมนูหลัก" className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
        {SECTIONS.map((section) => (
          <div key={section.id} className="mt-3 first:mt-1">
            <p className="px-3 pb-1 text-xs leading-[var(--lh-xs)] text-[var(--text-muted)]">{section.label}</p>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <SidebarItem
                  key={item.key}
                  item={item}
                  active={view === item.key}
                  badge={badges?.[item.badgeKey]}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-[var(--border-color)] px-2 py-2">
        <NavFooterActions layout="row" {...footerProps} />
      </div>
    </>
  );
}

/**
 * Left navigation for ≥768px.
 *  mode 'expanded' → 232px sectioned list
 *  mode 'rail'     → 72px icon rail (primary items + the current view) with
 *                    "ทั้งหมด" opening the full list as an overlay.
 */
export default function AppSidebar({
  view,
  mode = 'expanded',
  badges = {},
  onNavigate,
  onToggleCollapse,
  canToggle = true,
  shopName = 'Siwara POS',
  footerProps = {},
}) {
  const [overlayOpen, setOverlayOpen] = useState(false);

  // Close the overlay on Esc.
  useEffect(() => {
    if (!overlayOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOverlayOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlayOpen]);

  const brand = (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="shrink-0 w-9 h-9 rounded-[var(--radius-sm)] bg-[var(--accent)] text-[var(--text-on-accent)] flex items-center justify-center">
        <Coffee size={18} strokeWidth={2.2} />
      </span>
      <span className="font-semibold text-[var(--text-primary)] truncate">{shopName}</span>
    </div>
  );

  if (mode === 'expanded') {
    return (
      <aside
        data-app="nav"
        className="hidden md:flex shrink-0 flex-col h-full w-[var(--sidebar-w)] bg-[var(--bg-surface)] border-r border-[var(--border-color)]"
      >
        <FullNav
          view={view}
          badges={badges}
          onNavigate={onNavigate}
          footerProps={footerProps}
          header={(
            <div className="shrink-0 flex items-center justify-between gap-2 h-[var(--header-h)] px-4">
              {brand}
              {canToggle && (
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  aria-label="ย่อแถบเมนู"
                  title="ย่อแถบเมนู"
                  className="shrink-0 w-10 h-10 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)]"
                >
                  <PanelLeftClose size={18} />
                </button>
              )}
            </div>
          )}
        />
      </aside>
    );
  }

  // ── Rail ────────────────────────────────────────────────────────────
  const railItems = NAV_ITEMS.filter((item) => item.rail);
  const extra = !railItems.some((i) => i.key === view) && NAV_BY_KEY[view] ? NAV_BY_KEY[view] : null;
  const hiddenBadgeTotal = NAV_ITEMS
    .filter((i) => !i.rail && i.badgeKey && i.key !== extra?.key)
    .reduce((sum, i) => sum + (Number(badges[i.badgeKey]) || 0), 0);

  const go = (key) => { setOverlayOpen(false); onNavigate(key); };

  return (
    <>
      <aside
        data-app="nav"
        className="hidden md:flex shrink-0 flex-col items-center h-full w-[var(--sidebar-rail-w)] bg-[var(--bg-surface)] border-r border-[var(--border-color)] py-2"
      >
        <button
          type="button"
          onClick={() => (canToggle ? onToggleCollapse?.() : setOverlayOpen(true))}
          aria-label="ขยายแถบเมนู"
          title="ขยายแถบเมนู"
          className="shrink-0 w-11 h-11 mb-1 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <PanelLeftOpen size={19} />
        </button>
        <nav aria-label="เมนูหลัก" className="flex-1 min-h-0 overflow-y-auto scrollbar-hide flex flex-col items-center gap-1 w-full">
          {railItems.map((item) => (
            <RailItem key={item.key} item={item} active={view === item.key} badge={badges[item.badgeKey]} onNavigate={go} />
          ))}
          {extra && (
            <>
              <span className="w-8 h-px bg-[var(--border-color)] my-1" aria-hidden="true" />
              <RailItem item={extra} active badge={badges[extra.badgeKey]} onNavigate={go} />
            </>
          )}
          <button
            type="button"
            onClick={() => setOverlayOpen(true)}
            aria-label="เมนูทั้งหมด"
            aria-expanded={overlayOpen}
            className="relative w-14 flex flex-col items-center justify-center gap-0.5 min-h-14 py-1.5 rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <Menu size={20} strokeWidth={1.9} />
            <span className="text-[11px] leading-[14px]">ทั้งหมด</span>
            {hiddenBadgeTotal > 0 && <span className="absolute top-1.5 right-2.5 w-2.5 h-2.5 rounded-full bg-[var(--state-danger)] ring-2 ring-[var(--bg-surface)]" aria-hidden="true" />}
          </button>
        </nav>
        <div className="shrink-0 pt-2 mt-1 border-t border-[var(--border-color)] w-full flex justify-center">
          <NavFooterActions layout="column" {...footerProps} omit={['keys', 'lock', 'logout']} />
        </div>
      </aside>

      {overlayOpen && (
        <div className="hidden md:block fixed inset-0 z-[var(--z-modal)]" role="dialog" aria-modal="true" aria-label="เมนูทั้งหมด">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOverlayOpen(false)} />
          <aside data-app="nav" className="absolute left-0 top-0 bottom-0 w-[var(--sidebar-w)] flex flex-col bg-[var(--bg-surface)] shadow-[var(--elev-3)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
            <FullNav
              view={view}
              badges={badges}
              onNavigate={go}
              footerProps={footerProps}
              header={(
                <div className="shrink-0 flex items-center justify-between gap-2 h-[var(--header-h)] px-4">
                  {brand}
                  <button
                    type="button"
                    onClick={() => setOverlayOpen(false)}
                    aria-label="ปิดเมนู"
                    className="shrink-0 w-10 h-10 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)]"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}
            />
          </aside>
        </div>
      )}
    </>
  );
}
