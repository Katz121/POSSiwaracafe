import { memo } from 'react';
import { Coffee, Minus, Plus, Tag, X } from 'lucide-react';
import { formatBaht } from '../../../utils/format';

const MINUS = <Minus size={16} />;
const PLUS = <Plus size={16} />;
const REMOVE = <X size={18} />;
const TAG = <Tag size={14} />;
const NO_PHOTO = <Coffee size={18} />;

/**
 * One cart row. Memoised: callbacks are stable (keyed by line id), so adding a
 * different item never re-renders this row. `image` comes from a menu lookup by
 * id, not from the line (order lines no longer carry photos).
 */
function CartLine({ line, image, promo, onQty, onRemove, onNote, onTogglePromo }) {
  const id = line.cartId || line.id;
  const qty = Number(line.quantity) || 0;
  const unit = Number(line.price) || 0;
  const optionTags = [line.beanModifier ? String(line.beanModifier).replace(/#/g, '').trim() : '', line.milkLabel, line.sweetness != null ? `หวาน ${line.sweetness}%` : '']
    .filter(Boolean);
  return (
    <div className="py-3 border-b border-[var(--border-color)] last:border-b-0" data-cart-line>
      <div className="flex gap-3">
        <div className="w-11 h-11 shrink-0 rounded-[var(--radius-sm)] overflow-hidden bg-[var(--bg-sunken)] flex items-center justify-center text-[var(--text-muted)]">
          {image
            ? <img src={image} alt="" width={44} height={44} loading="lazy" decoding="async" className="w-full h-full object-cover" />
            : NO_PHOTO}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <p className="flex-1 min-w-0 font-semibold leading-normal text-[var(--text-primary)] line-clamp-2">{String(line.name)}</p>
            <span className="num shrink-0 font-semibold text-[var(--text-primary)]">{formatBaht(unit * qty)}</span>
          </div>
          {optionTags.length > 0 && (
            <p className="text-xs leading-[18px] text-[var(--text-secondary)] truncate">{optionTags.join(' · ')}</p>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={() => onQty(id, -1)} aria-label={`ลดจำนวน ${line.name}`}
          className="w-11 h-11 shrink-0 rounded-[var(--radius-sm)] flex items-center justify-center bg-[var(--bg-sunken)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)]">
          {MINUS}
        </button>
        <span className="num w-7 text-center font-semibold text-[var(--text-primary)]">{qty}</span>
        <button type="button" onClick={() => onQty(id, 1)} aria-label={`เพิ่มจำนวน ${line.name}`}
          className="w-11 h-11 shrink-0 rounded-[var(--radius-sm)] flex items-center justify-center bg-[var(--bg-sunken)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)]">
          {PLUS}
        </button>
        <input
          type="text"
          placeholder="หมายเหตุ"
          aria-label={`หมายเหตุ ${line.name}`}
          value={line.note || ''}
          onChange={(e) => onNote(id, e.target.value)}
          className="flex-1 min-w-0 h-11 px-3 rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] border border-transparent focus:border-[var(--accent)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
        />
        {promo && (
          <button type="button" onClick={() => onTogglePromo(id)} aria-pressed={!!line.promoApplied} title="ใช้โปรโมชั่นกับเมนูนี้"
            className={`h-11 px-2 shrink-0 rounded-[var(--radius-sm)] text-xs font-semibold flex items-center gap-1 outline-none focus-visible:shadow-[var(--focus-ring)] ${line.promoApplied ? 'bg-[var(--accent)] text-[var(--text-on-accent)]' : 'bg-[var(--accent-soft)] text-[var(--accent-soft-fg)]'}`}>
            {TAG}<span className="num">{line.promoApplied ? `${promo.discountPercent}%` : 'โปร'}</span>
          </button>
        )}
        <button type="button" onClick={() => onRemove(id)} aria-label={`ลบ ${line.name}`}
          className="w-11 h-11 shrink-0 rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--state-danger)] hover:bg-[var(--state-danger-soft)] outline-none focus-visible:shadow-[var(--focus-ring)]">
          {REMOVE}
        </button>
      </div>
    </div>
  );
}

export default memo(CartLine);
