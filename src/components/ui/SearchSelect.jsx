import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function SearchSelect({ value, onChange, groups, getOptionValue, getOptionLabel, placeholder = 'พิมพ์ค้นหาวัตถุดิบ...', className = 'w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl px-5 h-14 text-base font-semibold outline-none focus:ring-2 focus:ring-emerald-500 text-[var(--text-primary)]' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({});
  const root = useRef(null);
  const list = useRef(null);
  const id = useId();
  const selected = groups.flatMap(([, items]) => items).find(item => getOptionValue(item) === value);
  const filtered = groups.map(([category, items]) => [category, items.filter(item => String(getOptionLabel(item)).toLowerCase().includes(query.toLowerCase()))]).filter(([, items]) => items.length);
  const options = filtered.flatMap(([, items]) => items);
  const highlight = Math.min(active, options.length - 1);

  useEffect(() => {
    if (!open) return;
    const outside = event => {
      if (!root.current?.contains(event.target) && !list.current?.contains(event.target)) setOpen(false);
    };
    const reposition = () => {
      const rect = root.current.getBoundingClientRect();
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop || 0;
      const bottom = top + (viewport?.height || window.innerHeight);
      const below = bottom - rect.bottom - 8;
      const above = rect.top - top - 8;
      const upwards = below < 160 && above > below;
      const maxHeight = Math.max(0, Math.min(280, upwards ? above : below));
      setPosition({ position: 'fixed', left: rect.left, width: rect.width, top: upwards ? undefined : rect.bottom + 4, bottom: upwards ? window.innerHeight - rect.top + 4 : undefined, maxHeight, zIndex: 10000 });
    };
    // Portal ช่วยให้ลิสต์ไม่ถูกขอบ Modal ตัด และต้องตามช่องเมื่อเลื่อนหรือคีย์บอร์ดมือถือเปิด
    reposition();
    document.addEventListener('pointerdown', outside);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('scroll', reposition);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('scroll', reposition);
    };
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector('[data-highlight="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, highlight, query]);

  const choose = item => {
    onChange(getOptionValue(item));
    setOpen(false);
  };
  const show = () => { setQuery(''); setActive(0); setOpen(true); };

  return (
    <div ref={root}>
      <input
        type="text" role="combobox" aria-label={placeholder} aria-expanded={open}
        aria-controls={open ? id : undefined} aria-autocomplete="list"
        aria-activedescendant={open && highlight >= 0 ? `${id}-${highlight}` : undefined}
        autoComplete="off" placeholder={placeholder}
        value={open ? query : selected ? getOptionLabel(selected) : ''}
        onFocus={show} onClick={() => { if (!open) show(); }}
        onBlur={event => { if (!list.current?.contains(event.relatedTarget)) setOpen(false); }}
        onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) { show(); return; }
            setActive(Math.max(0, Math.min(options.length - 1, highlight + (event.key === 'ArrowDown' ? 1 : -1))));
          } else if (event.key === 'Enter' && open) {
            event.preventDefault();
            if (options[highlight]) choose(options[highlight]);
          } else if (event.key === 'Escape' && open) {
            // หยุดเหตุการณ์เพื่อให้ Escape ปิดเฉพาะรายการก่อน ไม่ปิด Modal ที่กำลังแก้สูตร
            event.stopPropagation();
            setOpen(false);
          }
        }}
        className={className}
      />
      {open && createPortal(
        <div ref={list} id={id} role="listbox" aria-label={placeholder} style={position} className="overflow-y-auto overscroll-contain rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-xl">
          {options.length === 0 && <p className="p-4 text-sm">ไม่พบวัตถุดิบที่ค้นหา</p>}
          {filtered.map(([category, items]) => (
            <div key={category} role="group" aria-label={category}>
              <div className="sticky top-0 bg-[var(--bg-tertiary)] px-4 py-2 text-xs font-bold">{category}</div>
              {items.map(item => {
                const index = options.indexOf(item);
                return <div key={getOptionValue(item)} id={`${id}-${index}`} role="option" aria-selected={getOptionValue(item) === value} data-highlight={index === highlight}
                  onPointerDown={event => event.preventDefault()} onClick={() => choose(item)}
                  className={`px-4 py-3 cursor-pointer text-sm ${index === highlight ? 'bg-[var(--accent-emerald-light)]' : 'hover:bg-[var(--bg-tertiary)]'}`}>
                  {getOptionLabel(item)}
                </div>;
              })}
            </div>
          ))}
        </div>, document.body
      )}
    </div>
  );
}
