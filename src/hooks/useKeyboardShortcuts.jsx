/**
 * Keyboard Shortcuts Hook
 * Provides keyboard navigation for POS system
 */
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-[2rem] shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <div className="p-6 bg-gray-900 text-white">
          <h2 className="text-xl font-black uppercase tracking-wider">Keyboard Shortcuts</h2>
          <p className="text-gray-400 text-sm mt-1">กด ? เพื่อเปิด/ปิดหน้านี้</p>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
          {/* Navigation */}
          <div>
            <h3 className="font-black text-sm text-gray-800 uppercase tracking-wider mb-3">นำทาง</h3>
            <div className="grid grid-cols-2 gap-2">
              {navigationShortcuts.map(s => (
                <div key={s.key} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                  <kbd className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-mono font-bold shadow-lg">{s.key}</kbd>
                  <span className="text-sm font-bold text-gray-600">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* POS Actions */}
          <div>
            <h3 className="font-black text-sm text-gray-800 uppercase tracking-wider mb-3">หน้า POS</h3>
            <div className="grid grid-cols-2 gap-2">
              {posShortcuts.map(s => (
                <div key={s.key} className="flex items-center gap-3 bg-emerald-50 rounded-xl p-3">
                  <kbd className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-mono font-bold shadow-lg">{s.key}</kbd>
                  <span className="text-sm font-bold text-emerald-700">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Other */}
          <div>
            <h3 className="font-black text-sm text-gray-800 uppercase tracking-wider mb-3">อื่นๆ</h3>
            <div className="flex gap-2">
              <div className="flex items-center gap-3 bg-violet-50 rounded-xl p-3">
                <kbd className="px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-mono font-bold shadow-lg">/</kbd>
                <span className="text-sm font-bold text-violet-700">ค้นหา</span>
              </div>
              <div className="flex items-center gap-3 bg-violet-50 rounded-xl p-3">
                <kbd className="px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-mono font-bold shadow-lg">?</kbd>
                <span className="text-sm font-bold text-violet-700">ช่วยเหลือ</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-900 text-white rounded-xl font-black text-sm uppercase tracking-wider hover:bg-gray-800 transition-colors"
          >
            ปิด (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
