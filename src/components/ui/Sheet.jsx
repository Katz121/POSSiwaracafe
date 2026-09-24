import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import useMediaQuery from './useMediaQuery';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Sheet · side panel (iPad/desktop) or bottom sheet (phone) for create/edit
 * forms and option pickers. Replaces permanent side forms and centred option
 * modals (spec §6). Portalled to <body> so no transformed ancestor can clip it.
 *
 * Props:
 *  open         boolean
 *  onClose      () => void (Esc, backdrop, close button)
 *  title        string | node
 *  description? string | node
 *  side         'auto' (default · bottom < 768px, right otherwise) | 'right' | 'bottom'
 *  width        px for the right sheet (default 480)
 *  footer?      node · sticky action bar at the bottom
 *  closeOnBackdrop  default true
 *  initialFocus?    ref to focus on open (else the first focusable in the body)
 *  children
 */
export default function Sheet({
  open,
  onClose,
  title,
  description,
  side = 'auto',
  width = 480,
  footer,
  closeOnBackdrop = true,
  initialFocus,
  className = '',
  children,
}) {
  const isPhone = useMediaQuery('(max-width: 767px)');
  const resolved = side === 'auto' ? (isPhone ? 'bottom' : 'right') : side;
  const panelRef = useRef(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Focus management: focus inside on open, trap Tab, Esc closes, restore on close.
  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const t = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = initialFocus?.current || panel.querySelector(FOCUSABLE.split(',').map((sel) => `[data-sheet-body] ${sel}`).join(',')) || panel;
      target.focus?.({ preventScroll: true });
    }, 30);
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open, initialFocus]);

  if (typeof document === 'undefined') return null;

  const panelMotion = resolved === 'bottom'
    ? { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } }
    : { initial: { x: '100%' }, animate: { x: 0 }, exit: { x: '100%' } };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[var(--z-modal)]" role="presentation">
          <motion.div
            className="absolute inset-0 bg-black/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeOnBackdrop ? () => onClose?.() : undefined}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            {...panelMotion}
            transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
            style={resolved === 'right' ? { width: `min(${width}px, 100vw)` } : undefined}
            className={`absolute flex flex-col bg-[var(--bg-raised)] shadow-[var(--elev-3)] outline-none ${
              resolved === 'bottom'
                ? 'left-0 right-0 bottom-0 max-h-[92dvh] rounded-t-[var(--radius-lg)] pb-[env(safe-area-inset-bottom)]'
                : 'top-0 right-0 bottom-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'
            } ${className}`}
          >
            {resolved === 'bottom' && (
              <div className="flex justify-center pt-2" aria-hidden="true">
                <span className="w-10 h-1.5 rounded-full bg-[var(--border-strong)]" />
              </div>
            )}
            {(title || onClose) && (
              <div className="flex items-start gap-3 px-5 pt-3 pb-3 border-b border-[var(--border-color)]">
                <div className="min-w-0 flex-1">
                  {title && <h2 id={titleId} className="text-[length:var(--fs-xl)] leading-[var(--lh-xl)] font-semibold text-[var(--text-primary)]">{title}</h2>}
                  {description && <p className="text-sm leading-[var(--lh-sm)] text-[var(--text-muted)] mt-0.5">{description}</p>}
                </div>
                {onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="ปิด"
                    className="shrink-0 w-11 h-11 -mr-2 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)]"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
            )}
            <div data-sheet-body className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
              {children}
            </div>
            {footer && (
              <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-color)] bg-[var(--bg-raised)]">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
