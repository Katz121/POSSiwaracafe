import Sheet from '../components/ui/Sheet';
import { navSections } from './navConfig';
import { NavBadge, NavFooterActions } from './NavParts';

const SECTIONS = navSections();

/**
 * Phone "เมนู" sheet: every section from navConfig as a list, then the
 * footer actions (QR sound, theme, lock, logout) at the end.
 */
export default function NavMenuSheet({ open, onClose, view, badges = {}, onNavigate, footerProps = {} }) {
  const go = (key) => {
    onClose?.();
    onNavigate(key);
  };
  return (
    <Sheet open={open} onClose={onClose} title="เมนูทั้งหมด" side="bottom">
      <nav aria-label="เมนูทั้งหมด" className="flex flex-col gap-4">
        {SECTIONS.map((section) => (
          <div key={section.id}>
            <p className="px-1 pb-1.5 text-xs leading-[var(--lh-xs)] text-[var(--text-muted)]">{section.label}</p>
            <div className="grid grid-cols-2 gap-2">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = view === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    data-nav-key={item.key}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => go(item.key)}
                    className={`flex items-center gap-2.5 min-h-12 px-3 rounded-[var(--radius-sm)] text-sm leading-snug text-left outline-none focus-visible:shadow-[var(--focus-ring)] ${
                      active
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-soft-fg)] font-semibold'
                        : 'bg-[var(--bg-sunken)] text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon size={18} className="shrink-0" />
                    <span className="flex-1 min-w-0">{item.label}</span>
                    <NavBadge navKey={item.key} count={badges[item.badgeKey]} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div className="border-t border-[var(--border-color)] pt-4">
          <NavFooterActions layout="list" {...footerProps} omit={['keys']} />
        </div>
      </nav>
    </Sheet>
  );
}
