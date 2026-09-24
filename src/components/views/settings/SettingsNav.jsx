import { ChevronRight } from 'lucide-react';
import { CountBadge } from '../../ui';
import { SETTINGS_TABS } from './tabs';

/**
 * Settings sub-nav. `variant="rail"`: the left column on iPad/desktop.
 * `variant="list"`: the full-width list a phone shows at `#/settings`.
 * `badges` = { [tabKey]: count } (e.g. broken modifier links).
 */
export default function SettingsNav({ active, onSelect, badges = {}, variant = 'rail' }) {
  if (variant === 'list') {
    return (
      <nav aria-label="หมวดการตั้งค่า">
        <ul className="rounded-[var(--radius)] bg-[var(--bg-surface)] shadow-[var(--elev-1)] overflow-hidden">
          {SETTINGS_TABS.map(({ key, label, hint, icon: Icon }) => (
            <li key={key} className="border-b border-[var(--border-light)] last:border-b-0">
              <button
                type="button"
                onClick={() => onSelect(key)}
                className="w-full min-h-16 flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                <span className="w-10 h-10 shrink-0 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] text-[var(--accent-soft-fg)] flex items-center justify-center"><Icon size={20} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-[var(--text-primary)]">{label}</span>
                  <span className="block text-sm text-[var(--text-muted)] truncate">{hint}</span>
                </span>
                <CountBadge count={badges[key]} />
                <ChevronRight size={18} className="shrink-0 text-[var(--text-muted)]" />
              </button>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label="หมวดการตั้งค่า" className="sticky top-0">
      <ul className="flex flex-col gap-1">
        {SETTINGS_TABS.map(({ key, label, icon: Icon }) => {
          const on = key === active;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onSelect(key)}
                aria-current={on ? 'page' : undefined}
                className={`w-full min-h-11 flex items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)] text-left text-sm outline-none focus-visible:shadow-[var(--focus-ring)] ${on
                  ? 'bg-[var(--accent-soft)] text-[var(--accent-soft-fg)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] font-medium'}`}
              >
                <Icon size={18} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <CountBadge count={badges[key]} />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
