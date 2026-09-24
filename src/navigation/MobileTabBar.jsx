import { LayoutGrid } from 'lucide-react';
import { NAV_ITEMS } from './navConfig';
import { NavBadge } from './NavParts';

const TABS = NAV_ITEMS.filter((item) => item.phoneTab);

/**
 * Phone bottom tab bar (<768px): ขาย · ออเดอร์ · บิล · สต็อก · เมนู.
 * Full width, not floating, 64px + safe-area. "เมนู" opens NavMenuSheet and is
 * highlighted whenever the current view is not one of the four tabs.
 * `menuDot` shows a small dot on "เมนู" (hidden badges / QR sound off).
 */
export default function MobileTabBar({ view, badges = {}, onNavigate, onOpenMenu, menuOpen = false, menuDot = false }) {
  const inTabs = TABS.some((t) => t.key === view);
  return (
    <nav
      data-app="nav"
      aria-label="เมนูหลัก"
      className="md:hidden fixed inset-x-0 bottom-0 z-[var(--z-nav)] glass-nav pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
    >
      <div className="grid grid-cols-5 h-[var(--tabbar-h)]">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = view === item.key;
          return (
            <button
              key={item.key}
              type="button"
              data-nav-key={item.key}
              aria-current={active ? 'page' : undefined}
              onClick={() => onNavigate(item.key)}
              className={`relative flex flex-col items-center justify-center gap-0.5 min-w-0 outline-none focus-visible:shadow-[var(--focus-ring)] ${
                active ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
              }`}
            >
              <span className={`relative flex items-center justify-center w-14 h-8 rounded-full ${active ? 'bg-[var(--accent-soft)]' : ''}`}>
                <Icon size={21} strokeWidth={active ? 2.3 : 1.9} />
                {badges[item.badgeKey] > 0 && (
                  <NavBadge navKey={item.key} count={badges[item.badgeKey]} className="absolute -top-1 right-0.5" />
                )}
              </span>
              <span className={`text-xs leading-4 truncate max-w-full ${active ? 'font-semibold' : ''}`}>{item.short}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onOpenMenu}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          aria-current={!inTabs ? 'page' : undefined}
          className={`relative flex flex-col items-center justify-center gap-0.5 min-w-0 outline-none focus-visible:shadow-[var(--focus-ring)] ${
            !inTabs || menuOpen ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
          }`}
        >
          <span className={`relative flex items-center justify-center w-14 h-8 rounded-full ${!inTabs || menuOpen ? 'bg-[var(--accent-soft)]' : ''}`}>
            <LayoutGrid size={21} strokeWidth={!inTabs ? 2.3 : 1.9} />
            {menuDot && <span className="absolute top-0.5 right-3 w-2.5 h-2.5 rounded-full bg-[var(--state-danger)] ring-2 ring-[var(--bg-surface)]" aria-hidden="true" />}
          </span>
          <span className={`text-xs leading-4 ${!inTabs ? 'font-semibold' : ''}`}>เมนู</span>
        </button>
      </div>
    </nav>
  );
}
