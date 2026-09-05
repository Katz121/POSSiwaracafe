/**
 * Keyboard Shortcuts Hook
 * Provides keyboard navigation for POS system
 */
/* eslint-disable react-refresh/only-export-components -- exports useKeyboardShortcuts hook + KeyboardShortcutsHelp component together by design */
import { useEffect, useCallback } from 'react';

// Default shortcuts configuration
export const DEFAULT_SHORTCUTS = {
  // Navigation (F1-F10)
  F1: { action: 'navigate', target: 'pos', label: 'POS' },
  F2: { action: 'navigate', target: 'merchant', label: 'ครัว' },
  F3: { action: 'navigate', target: 'bills', label: 'บิล' },
  F4: { action: 'navigate', target: 'stock', label: 'สต็อก' },
  F5: { action: 'navigate', target: 'expenses', label: 'รายจ่าย' },
  F6: { action: 'navigate', target: 'menu_manage', label: 'เมนู' },
  F7: { action: 'navigate', target: 'members_manage', label: 'สมาชิก' },
  F8: { action: 'navigate', target: 'dashboard', label: 'สรุป' },
  F9: { action: 'navigate', target: 'financial', label: 'Plan' },
  F10: { action: 'navigate', target: 'admin', label: 'แอดมิน' },

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
 */
export function KeyboardShortcutsHelp({ isOpen, onClose }) {
  if (!isOpen) return null;

  const navigationShortcuts = Object.entries(DEFAULT_SHORTCUTS)
    .filter(([, v]) => v.action === 'navigate')
    .map(([k, v]) => ({ key: k, ...v }));

  const posShortcuts = Object.entries(DEFAULT_SHORTCUTS)
    .filter(([, v]) => v.context === 'pos')
    .map(([k, v]) => ({ key: k, ...v }));

  return (
    <div className="fixed inset-0 z-[var(--z-modal-bg)] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[var(--bg-secondary)] rounded-[var(--radius)] shadow-[var(--elev-3)] max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <div className="p-6 bg-[var(--surface-inverse)] text-white">
          <h2 className="text-xl font-bold tracking-wider">Keyboard Shortcuts</h2>
          <p className="text-[var(--text-muted)] text-sm mt-1">กด ? เพื่อเปิด/ปิดหน้านี้</p>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
          {/* Navigation */}
          <div>
            <h3 className="font-semibold text-sm text-[var(--text-primary)] tracking-wider mb-3">นำทาง</h3>
            <div className="grid grid-cols-2 gap-2">
              {navigationShortcuts.map(s => (
                <div key={s.key} className="flex items-center gap-3 bg-[var(--bg-tertiary)] rounded-[var(--radius-sm)] p-3">
                  <kbd className="px-3 py-1.5 bg-[var(--surface-inverse)] text-white rounded-[var(--radius-sm)] text-xs font-mono font-medium shadow-[var(--elev-2)]">{s.key}</kbd>
                  <span className="text-sm font-semibold text-[var(--text-secondary)]">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* POS Actions */}
          <div>
            <h3 className="font-semibold text-sm text-[var(--text-primary)] tracking-wider mb-3">หน้า POS</h3>
            <div className="grid grid-cols-2 gap-2">
              {posShortcuts.map(s => (
                <div key={s.key} className="flex items-center gap-3 bg-emerald-50 rounded-[var(--radius-sm)] p-3">
                  <kbd className="px-3 py-1.5 bg-emerald-600 text-white rounded-[var(--radius-sm)] text-xs font-mono font-medium shadow-[var(--elev-2)]">{s.key}</kbd>
                  <span className="text-sm font-semibold text-[var(--accent-emerald)]">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Other */}
          <div>
            <h3 className="font-semibold text-sm text-[var(--text-primary)] tracking-wider mb-3">อื่นๆ</h3>
            <div className="flex gap-2">
                <div className="flex items-center gap-3 bg-violet-50 rounded-[var(--radius-sm)] p-3">
                <kbd className="px-3 py-1.5 bg-violet-600 text-white rounded-[var(--radius-sm)] text-xs font-mono font-medium shadow-[var(--elev-2)]">/</kbd>
                <span className="text-sm font-semibold text-[var(--accent-ai)]">ค้นหา</span>
              </div>
                <div className="flex items-center gap-3 bg-violet-50 rounded-[var(--radius-sm)] p-3">
                <kbd className="px-3 py-1.5 bg-violet-600 text-white rounded-[var(--radius-sm)] text-xs font-mono font-medium shadow-[var(--elev-2)]">?</kbd>
                <span className="text-sm font-semibold text-[var(--accent-ai)]">ช่วยเหลือ</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-[var(--bg-tertiary)] border-t border-[var(--border-color)]">
          <button
            onClick={onClose}
            className="w-full py-3 bg-[var(--surface-inverse)] text-white rounded-[var(--radius-sm)] font-medium text-sm tracking-wider hover:bg-[var(--surface-inverse-hover)] transition-colors"
          >
            ปิด (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
