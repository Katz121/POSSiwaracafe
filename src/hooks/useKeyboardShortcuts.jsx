/**
 * Keyboard Shortcuts Hook
 * Provides keyboard navigation for POS system
 */
/* eslint-disable react-refresh/only-export-components -- exports useKeyboardShortcuts hook + KeyboardShortcutsHelp component together by design */
import { useEffect, useCallback } from 'react';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import { NAV_BY_KEY } from '../navigation/navConfig';

// Labels come from the sidebar config so the help sheet matches the menu wording.
const navLabel = (key) => NAV_BY_KEY[key]?.label || key;

// Default shortcuts configuration
export const DEFAULT_SHORTCUTS = {
  // Navigation (F1-F10)
  F1: { action: 'navigate', target: 'pos', label: navLabel('pos') },
  F2: { action: 'navigate', target: 'merchant', label: navLabel('merchant') },
  F3: { action: 'navigate', target: 'bills', label: navLabel('bills') },
  F4: { action: 'navigate', target: 'stock', label: navLabel('stock') },
  F5: { action: 'navigate', target: 'expenses', label: navLabel('expenses') },
  F6: { action: 'navigate', target: 'menu_manage', label: navLabel('menu_manage') },
  F7: { action: 'navigate', target: 'members_manage', label: navLabel('members_manage') },
  F8: { action: 'navigate', target: 'dashboard', label: navLabel('dashboard') },
  F9: { action: 'navigate', target: 'financial', label: navLabel('financial') },
  F10: { action: 'navigate', target: 'admin', label: navLabel('admin') },

  // POS Actions
  Escape: { action: 'pos_action', target: 'clear', label: 'ยกเลิก', context: 'pos' },
  Delete: { action: 'pos_action', target: 'remove_last', label: 'ลบรายการล่าสุด', context: 'pos' },

  // NOTE: Removed number keys 1-9 quick add because it interferes with normal typing
  // Quick add via clicking on menu items instead

  // Search
  '/': { action: 'focus', target: 'search', label: 'ค้นหา' },

  // Help
  '?': { action: 'show_help', label: 'ช่วยเหลือ' }
};

/**
 * Hook for keyboard shortcuts
 */
export default function useKeyboardShortcuts(handlers = {}, options = {}) {
  const {
    enabled = true,
    currentView = 'pos',
    shortcuts = DEFAULT_SHORTCUTS
  } = options;

  const handleKeyDown = useCallback((event) => {
    if (!enabled) return;

    // Don't trigger shortcuts when typing in inputs
    const target = event.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      // Allow Enter in specific cases
      if (event.key !== 'Escape' && event.key !== 'Enter') {
        return;
      }
    }

    // Build key identifier
    let keyId = event.key;
    if (event.key === ' ') keyId = 'Space';

    // Check if shortcut exists
    const shortcut = shortcuts[keyId];
    if (!shortcut) return;

    // Check context (some shortcuts only work in specific views)
    if (shortcut.context && shortcut.context !== currentView) {
      return;
    }

    // Prevent default for function keys and known shortcuts
    if (keyId.startsWith('F') || keyId === 'Escape' || keyId === '/') {
      event.preventDefault();
    }

    // Execute handler
    const handler = handlers[shortcut.action];
    if (handler) {
      handler(shortcut.target, shortcut, event);
    }
  }, [enabled, currentView, shortcuts, handlers]);

  useEffect(() => {
    if (enabled) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [enabled, handleKeyDown]);

  return {
    shortcuts,
    getShortcutLabel: (key) => shortcuts[key]?.label || key
  };
}

/**
 * Keyboard Shortcuts Help Modal Component
 * Uses the shared Modal (focus, Esc, backdrop) and design tokens only.
 */
const KBD = 'min-w-11 px-3 py-1.5 text-center bg-[var(--surface-inverse)] text-[var(--text-on-inverse)] rounded-[var(--radius-sm)] text-xs font-mono font-medium';
const ROW = 'flex items-center gap-3 rounded-[var(--radius-sm)] p-3';
const HEADING = 'font-semibold text-sm text-[var(--text-primary)] mb-3';

export function KeyboardShortcutsHelp({ isOpen, onClose }) {
  const navigationShortcuts = Object.entries(DEFAULT_SHORTCUTS)
    .filter(([, v]) => v.action === 'navigate')
    .map(([k, v]) => ({ key: k, ...v }));

  const posShortcuts = Object.entries(DEFAULT_SHORTCUTS)
    .filter(([, v]) => v.context === 'pos')
    .map(([k, v]) => ({ key: k, ...v }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="คีย์ลัด (กด ? เพื่อเปิด/ปิด)"
      size="2xl"
      bodyClassName="space-y-6"
      footer={<Button variant="secondary" fullWidth onClick={onClose}>ปิด (Esc)</Button>}
    >
      <section>
        <h3 className={HEADING}>นำทาง</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {navigationShortcuts.map(s => (
            <div key={s.key} className={`${ROW} bg-[var(--bg-sunken)]`}>
              <kbd className={KBD}>{s.key}</kbd>
              <span className="text-sm font-semibold text-[var(--text-secondary)]">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className={HEADING}>หน้า POS</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {posShortcuts.map(s => (
            <div key={s.key} className={`${ROW} bg-[var(--accent-soft)]`}>
              <kbd className={KBD}>{s.key}</kbd>
              <span className="text-sm font-semibold text-[var(--accent-soft-fg)]">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className={HEADING}>อื่นๆ</h3>
        <div className="flex flex-wrap gap-2">
          {[['/', 'ค้นหา'], ['?', 'ช่วยเหลือ']].map(([k, label]) => (
            <div key={k} className={`${ROW} bg-[var(--accent-ai-light)]`}>
              <kbd className={KBD}>{k}</kbd>
              <span className="text-sm font-semibold text-[var(--accent-ai)]">{label}</span>
            </div>
          ))}
        </div>
      </section>
    </Modal>
  );
}
