import { Bell, BellOff, Moon, Sun, Lock, LogOut, Keyboard } from 'lucide-react';
import { CountBadge } from '../components/ui/Badge';

// Badge colour per nav key: money/attention = warn, broken = danger.
const BADGE_VARIANT = {
  merchant: 'warning',
  bills: 'warning',
  cake_queue: 'warning',
  stock: 'danger',
  stock_audit: 'danger',
  members_manage: 'primary',
};

export function NavBadge({ navKey, count, className = '' }) {
  return <CountBadge count={count} variant={BADGE_VARIANT[navKey] || 'danger'} className={className} />;
}

/**
 * Footer actions shared by the sidebar, rail and the phone menu sheet.
 * `layout`: 'row' (sidebar), 'column' (rail, icons only), 'list' (menu sheet, labelled).
 */
export function NavFooterActions({
  layout = 'row',
  isDark,
  onToggleTheme,
  soundOn,
  onToggleSound,
  onLock,
  onLogout,
  onShowShortcuts,
  omit = [],
}) {
  const actions = [
    onToggleSound && {
      id: 'sound',
      label: soundOn ? 'ปิดเสียงออเดอร์ QR' : 'เปิดเสียงออเดอร์ QR',
      short: soundOn ? 'เสียงเปิด' : 'เสียงปิด',
      icon: soundOn ? Bell : BellOff,
      onClick: onToggleSound,
      attention: !soundOn,
    },
    onToggleTheme && {
      id: 'theme',
      label: isDark ? 'โหมดสว่าง' : 'โหมดมืด',
      short: isDark ? 'สว่าง' : 'มืด',
      icon: isDark ? Sun : Moon,
      onClick: onToggleTheme,
    },
    onShowShortcuts && { id: 'keys', label: 'ปุ่มลัดคีย์บอร์ด (?)', short: 'ปุ่มลัด', icon: Keyboard, onClick: onShowShortcuts },
    onLock && { id: 'lock', label: 'ล็อกหน้าจอ', short: 'ล็อก', icon: Lock, onClick: onLock },
    onLogout && { id: 'logout', label: 'ออกจากระบบ', short: 'ออก', icon: LogOut, onClick: onLogout, danger: true },
  ].filter((a) => a && !omit.includes(a.id));

  if (layout === 'list') {
    return (
      <div className="grid grid-cols-2 gap-2">
        {actions.map(({ id, label, icon: Icon, onClick, danger, attention }) => (
          <button
            key={id}
            type="button"
            onClick={onClick}
            className={`flex items-center gap-3 min-h-12 px-4 rounded-[var(--radius-sm)] text-sm font-medium text-left outline-none focus-visible:shadow-[var(--focus-ring)] ${
              danger
                ? 'bg-[var(--state-danger-soft)] text-[var(--state-danger)]'
                : attention
                  ? 'bg-[var(--state-warn-soft)] text-[var(--state-warn)]'
                  : 'bg-[var(--bg-sunken)] text-[var(--text-primary)]'
            }`}
          >
            <Icon size={18} className="shrink-0" />
            <span className="leading-snug">{label}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={layout === 'column' ? 'flex flex-col items-center gap-1' : 'flex items-center justify-between gap-1'}>
      {actions.map(({ id, label, icon: Icon, onClick, danger, attention }) => (
        <button
          key={id}
          type="button"
          onClick={onClick}
          aria-label={label}
          title={label}
          className={`relative w-11 h-11 flex items-center justify-center rounded-[var(--radius-sm)] outline-none focus-visible:shadow-[var(--focus-ring)] ${
            danger
              ? 'text-[var(--state-danger)] hover:bg-[var(--state-danger-soft)]'
              : attention
                ? 'text-[var(--state-warn)] bg-[var(--state-warn-soft)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Icon size={19} strokeWidth={1.9} />
        </button>
      ))}
    </div>
  );
}
