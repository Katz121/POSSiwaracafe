import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

const MENU_W = 216;

/**
 * Overflow ("⋯") menu for a list row. Portalled + fixed-positioned so a
 * scrolling table never clips it; flips upward near the bottom of the screen.
 *
 * items: [{ key, label, icon?, onSelect, danger? }]
 */
export default function RowMenu({ items, label = 'ตัวเลือกเพิ่มเติม', size = 44 }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const itemRefs = useRef([]);
  const menuId = useId();

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const height = items.length * 48 + 8;
    const vh = window.innerHeight;
    const up = r.bottom + height + 8 > vh && r.top > height + 8;
    const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8));
    setPos({ left, top: up ? r.top - height - 4 : r.bottom + 4 });
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => itemRefs.current[0]?.focus(), 0);
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btnRef.current?.focus(); }
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onScroll);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const onMenuKey = (e) => {
    const els = itemRefs.current.filter(Boolean);
    const idx = els.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); els[(idx + 1) % els.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); els[(idx - 1 + els.length) % els.length]?.focus(); }
    if (e.key === 'Tab') setOpen(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        onKeyDown={(e) => e.stopPropagation()}
        style={{ width: size, height: size }}
        className="min-h-0 shrink-0 inline-flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <MoreHorizontal size={20} />
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
          className="z-[var(--z-modal)] rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-surface)] py-1 shadow-[var(--elev-3)]"
        >
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                ref={(el) => { itemRefs.current[i] = el; }}
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); item.onSelect(); }}
                className={`flex min-h-12 w-full items-center gap-3 px-4 text-left text-base outline-none hover:bg-[var(--bg-hover)] focus-visible:bg-[var(--bg-hover)] ${item.danger ? 'text-[var(--state-danger)]' : 'text-[var(--text-primary)]'}`}
              >
                {Icon && <Icon size={18} className="shrink-0" aria-hidden="true" />}
                {item.label}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
