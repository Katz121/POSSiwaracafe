import { memo } from 'react';
import { Coffee, Star } from 'lucide-react';
import { getItemSalePrice } from '../../../utils/promotions';
import { formatBaht } from '../../../utils/format';

/**
 * One menu tile. Memoised: props are the menu item object (stable while the menu
 * snapshot is unchanged), the memoised sale settings, the stable `onAdd` and the
 * quantity already in the cart. A tap therefore re-renders only the tapped tile.
 *
 * variant 'grid' = photo tile · 'list' = 56px row (name + price, Loyverse-style).
 */
function MenuCard({ item, saleSettings, onAdd, variant = 'grid', inCart = 0, showFeatured = true }) {
  const sale = getItemSalePrice(item, saleSettings);
  const name = String(item.name || '');
  const featured = showFeatured && (item.isFeatured || item.recommended);
  const qtyBadge = inCart > 0 && (
    <span
      className="num min-w-7 h-7 px-2 rounded-full bg-[var(--accent)] text-[var(--text-on-accent)] text-sm font-semibold flex items-center justify-center"
      aria-label={`ในตะกร้า ${inCart}`}
    >
      {inCart}
    </span>
  );
  const price = (
    <span className="flex flex-col items-end leading-normal">
      <span className={`num font-semibold ${sale.onSale ? 'text-[var(--state-danger)]' : 'text-[var(--text-primary)]'}`}>
        {formatBaht(sale.price)}
      </span>
      {sale.onSale && <span className="num text-xs text-[var(--text-muted)] line-through">{formatBaht(sale.originalPrice)}</span>}
    </span>
  );

  if (variant === 'list') {
    return (
      <button
        type="button"
        data-menu-card
        onClick={() => onAdd(item)}
        className="w-full min-h-14 flex items-center gap-3 px-4 py-2 text-left rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-color)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-selected)] outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-medium leading-normal text-[var(--text-primary)] truncate">{name}</span>
          {sale.onSale && <span className="block text-xs text-[var(--state-danger)]">Happy Hour −<span className="num">{sale.percent}%</span></span>}
        </span>
        {qtyBadge}
        {price}
      </button>
    );
  }

  return (
    <button
      type="button"
      data-menu-card
      onClick={() => onAdd(item)}
      className="group relative flex flex-col text-left rounded-[var(--radius)] overflow-hidden bg-[var(--bg-surface)] shadow-[var(--elev-1)] border border-[var(--border-color)] hover:border-[var(--border-strong)] active:scale-[0.98] transition-transform duration-100 outline-none focus-visible:shadow-[var(--focus-ring)]"
    >
      <span className="relative block aspect-[4/3] bg-[var(--bg-sunken)] overflow-hidden">
        {item.image ? (
          <img
            src={item.image}
            alt=""
            width={240}
            height={180}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
            <Coffee size={32} strokeWidth={1.5} />
          </span>
        )}
        {featured && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-[var(--elev-1)]">
            <Star size={12} fill="currentColor" className="text-[var(--state-warn)]" /> แนะนำ
          </span>
        )}
        {sale.onSale && (
          <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--state-danger)] text-[var(--text-on-danger)]">
            −<span className="num">{sale.percent}%</span>
          </span>
        )}
        {inCart > 0 && <span className="absolute bottom-2 right-2">{qtyBadge}</span>}
      </span>
      <span className="flex flex-1 flex-col justify-between gap-1 p-3">
        <span className="text-[15px] font-semibold leading-normal line-clamp-2 text-[var(--text-primary)]">{name}</span>
        <span className="flex justify-end">{price}</span>
      </span>
    </button>
  );
}

export default memo(MenuCard);
