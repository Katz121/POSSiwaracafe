import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, MoreHorizontal } from 'lucide-react';

const MENU_W = 248;
const ITEM_H = 48;

/**
 * Overflow ("⋯" or "เครื่องมือ") menu. Portalled + fixed so a scrolling list
 * never clips it; flips upward near the bottom of the screen.
 *
 * items:  [{ key, label, icon?, onSelect, danger?, checked?: boolean, hint?, disabled? }]
 *         `checked` renders a menuitemcheckbox with a tick (toggles such as แนะนำ).
 * label:  aria-label of the trigger
 * text?:  visible trigger text (renders a secondary button instead of the ⋯ icon)
 */
export default function RowMenu({ items, label = 'ตัวเลือกเพิ่มเติม', text, icon: TriggerIcon = MoreHorizontal, className = '' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const itemRefs = useRef([]);
  const menuId = useId();
  const visible = items.filter(Boolean);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const height = visible.length * ITEM_H + 8;
    const vh = window.innerHeight;
    const up = r.bottom + height + 8 > vh && r.top > height + 8;
    const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8));
    const top = up ? r.top - height - 4 : Math.min(r.bottom + 4, Math.max(8, vh - height - 8));
    setPos({ left, top });
  }, [open, visible.length]);

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => itemRefs.current.find(Boolean)?.focus(), 0);
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); setOpen(false); btnRef.current?.focus(); }
    };
    const close = (e) => { if (!menuRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    document.addEventListener('scroll', close, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('scroll', close, true);
    };
  }, [open]);

  const onMenuKey = (e) => {
    const els = itemRefs.current.filter((el) => el && !el.disabled);
    const idx = els.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); els[(idx + 1) % els.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); els[(idx - 1 + els.length) % els.length]?.focus(); }
    if (e.key === 'Home') { e.preventDefault(); els[0]?.focus(); }
    if (e.key === 'End') { e.preventDefault(); els[els.length - 1]?.focus(); }
    if (e.key === 'Tab') setOpen(false);
  };

  const triggerClass = text
    ? 'min-h-11 px-4 gap-2 border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold text-sm'
    : 'w-11 h-11 text-[var(--text-secondary)]';

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={text ? undefined : label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        onKeyDown={(e) => e.stopPropagation()}
        className={`shrink-0 inline-flex items-center justify-center rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)] ${triggerClass} ${className}`}
      >
        <TriggerIcon size={20} aria-hidden="true" />
        {text}
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', left: pos.left, top: pos.top, width: MENU_W }}
          className="z-[var(--z-toast)] rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-raised)] py-1 shadow-[var(--elev-3)]"
        >
          {visible.map((item, i) => {
            const Icon = item.icon;
            const isCheck = typeof item.checked === 'boolean';
            return (
              <button
                key={item.key}
                ref={(el) => { itemRefs.current[i] = el; }}
                type="button"
                role={isCheck ? 'menuitemcheckbox' : 'menuitem'}
                aria-checked={isCheck ? item.checked : undefined}
                disabled={item.disabled}
                onClick={() => { setOpen(false); item.onSelect(); }}
                className={`flex min-h-12 w-full items-center gap-3 px-4 text-left text-[15px] leading-snug outline-none hover:bg-[var(--bg-hover)] focus-visible:bg-[var(--bg-hover)] disabled:opacity-50 ${item.danger ? 'text-[var(--state-danger)]' : 'text-[var(--text-primary)]'}`}
              >
                {Icon && <Icon size={18} className="shrink-0" aria-hidden="true" />}
                <span className="min-w-0 flex-1">
                  {item.label}
                  {item.hint && <span className="block text-xs text-[var(--text-muted)]">{item.hint}</span>}
                </span>
                {isCheck && (
                  <span
                    aria-hidden="true"
                    className={`shrink-0 w-5 h-5 rounded-[var(--radius-xs)] border flex items-center justify-center ${item.checked ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--text-on-accent)]' : 'border-[var(--border-strong)]'}`}
                  >
                    {item.checked && <Check size={14} strokeWidth={3} />}
                  </span>
                )}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
