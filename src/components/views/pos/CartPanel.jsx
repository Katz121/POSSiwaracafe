import { memo } from 'react';
import { PlusCircle, RotateCcw, ShoppingBag, Sparkles, Trash2, X } from 'lucide-react';
import { Button, EmptyState } from '../../ui';
import { formatBaht } from '../../../utils/format';
import CartLine from './CartLine';

// Static elements hoisted so a re-render of the panel does not re-render them.
const BAG_ICON = <ShoppingBag size={20} className="shrink-0 text-[var(--text-secondary)]" />;
const TRASH_ICON = <Trash2 size={18} />;
const TRASH_SM = <Trash2 size={16} />;
const REPEAT_ICON = <RotateCcw size={16} />;
const AI_ICON = <Sparkles size={16} />;
const EMPTY = <EmptyState icon="cart" title="ยังไม่มีรายการ" description="แตะเมนูเพื่อเริ่มขาย" size="sm" />;

/** AI upsell block. Memoised with stable callbacks (items change only on request). */
const Upsell = memo(function Upsell({ items, loading, onAsk, onDismiss, onPick }) {
  if (items.length === 0) {
    return (
      <Button variant="ai" size="md" fullWidth loading={loading} onClick={onAsk} leftIcon={AI_ICON}>
        เชียร์ขายอะไรดี (AI)
      </Button>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--text-secondary)] flex items-center gap-1.5"><Sparkles size={14} className="text-[var(--accent-ai)]" /> แนะนำทานคู่กัน</span>
        <button type="button" onClick={onDismiss} aria-label="ปิดคำแนะนำ" className="w-10 h-10 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X size={16} /></button>
      </div>
      {items.map((rec) => (
        <button key={rec.id} type="button" onClick={() => onPick(rec)}
          className="w-full min-h-14 flex items-center gap-3 p-2 rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-left">
          <span className="w-10 h-10 shrink-0 rounded-[var(--radius-xs)] overflow-hidden bg-[var(--bg-sunken)]">
            {rec.image && <img src={rec.image} alt="" width={40} height={40} loading="lazy" decoding="async" className="w-full h-full object-cover" />}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-[var(--text-primary)] truncate">{rec.name}</span>
            <span className="block num text-sm text-[var(--text-secondary)]">{formatBaht(rec.price)}</span>
          </span>
          <PlusCircle size={20} className="shrink-0 text-[var(--accent-soft-fg)]" />
        </button>
      ))}
    </div>
  );
});

/**
 * Cart column (iPad/desktop) and the body of the phone cart sheet.
 * Layout: header (count · queue chip · ล้าง) → scrolling lines → discount &
 * member row → pinned totals/CTA (`checkoutBar`). In the phone sheet the header
 * lives in the Sheet title and discount/checkout go to the Sheet footer.
 */
export default function CartPanel({
  cart, menuById, activePromotion, currentQueue, cartCount, editing,
  onQty, onRemove, onNote, onTogglePromo, onClear,
  repeat, upsell, discountPanel, checkoutBar, showHeader = true,
}) {
  return (
    <div className={`flex flex-col h-full min-h-0 ${showHeader ? 'bg-[var(--bg-surface)]' : ''}`}>
      {showHeader && (
        <div className="shrink-0 flex items-center gap-2 px-4 min-h-16 border-b border-[var(--border-color)]">
          {BAG_ICON}
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold leading-normal text-[var(--text-primary)]">{editing ? 'แก้ไขบิล' : 'ตะกร้า'}</h2>
            <p className="text-xs leading-[18px] text-[var(--text-muted)]"><span className="num">{cartCount}</span> ชิ้น</p>
          </div>
          <span className="shrink-0 px-3 py-1 rounded-full bg-[var(--accent-soft)] text-[var(--accent-soft-fg)] text-sm font-semibold" data-queue-chip>
            คิว <span className="num">#{currentQueue}</span>
          </span>
          <button type="button" onClick={onClear} disabled={cart.length === 0 && !editing} aria-label={editing ? 'ยกเลิกการแก้ไขและล้างตะกร้า' : 'ล้างตะกร้า'}
            className="shrink-0 w-11 h-11 rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--state-danger)] hover:bg-[var(--state-danger-soft)] disabled:opacity-40 outline-none focus-visible:shadow-[var(--focus-ring)]">
            {TRASH_ICON}
          </button>
        </div>
      )}
      {!showHeader && (cart.length > 0 || editing) && (
        <div className="flex justify-end -mt-2">
          <Button variant="ghost" size="sm" onClick={onClear} leftIcon={TRASH_SM}>
            {editing ? 'ยกเลิกแก้ไข' : 'ล้างตะกร้า'}
          </Button>
        </div>
      )}

      <div className={`flex-1 min-h-0 overflow-y-auto ${showHeader ? 'px-4' : ''}`}>
        {cart.length === 0 ? (
          <div className="py-6 space-y-4">
            {EMPTY}
            {repeat && (
              <div className="flex justify-center">
                <Button variant="secondary" onClick={repeat.onRepeat} leftIcon={REPEAT_ICON} data-repeat-last>
                  {`ซ้ำล่าสุด · คิว #${repeat.queue ?? '-'} · ${repeat.count} รายการ`}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            {cart.map((line) => (
              <CartLine
                key={line.cartId || line.id}
                line={line}
                image={menuById.get(line.id)?.image || line.image || ''}
                promo={activePromotion}
                onQty={onQty}
                onRemove={onRemove}
                onNote={onNote}
                onTogglePromo={onTogglePromo}
              />
            ))}
            {upsell && <div className="py-3"><Upsell {...upsell} /></div>}
          </>
        )}
      </div>

      {discountPanel}
      {checkoutBar}
    </div>
  );
}

