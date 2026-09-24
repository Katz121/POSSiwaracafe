// Menu item presentations for the customer QR page:
//  - MenuCard: vertical photo card used in the featured rails (cake / best
//    sellers / featured). The first cake cards are the LCP element on /order.
//  - MenuRow: compact horizontal row used in the category sections. Rows keep
//    the page short enough to scan (a 4:3 card per item made it ~22k px tall).
// Both follow the same tap rules as before: the photo opens the detail sheet,
// the body adds (or opens the story poster first), "+" always adds.
import { memo } from 'react';
import { Plus, Coffee, BookOpen, Flame, Star } from 'lucide-react';
import { formatCurrency } from '../config/constants';
import { getItemSalePrice } from '../utils/promotions';
import { dispField, displayPrice } from './display';

export function ItemBadges({ item, isBestSeller, sale, t, className = '' }) {
  if (!isBestSeller && !item.isFeatured && !sale?.onSale) return null;
  return (
    <span className={`flex flex-wrap gap-1 ${className}`}>
      {sale?.onSale && (
        <span className="inline-flex items-center rounded-full bg-[var(--state-danger)] text-[var(--text-on-danger)] text-[11px] font-semibold leading-[18px] px-2">
          Happy Hour -{sale.percent}%
        </span>
      )}
      {isBestSeller && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--state-warn)] text-[var(--text-on-warn)] text-[11px] font-semibold leading-[18px] px-2">
          <Flame size={11} aria-hidden="true" />{t('bestSellerBadgeText')}
        </span>
      )}
      {item.isFeatured && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--accent)] text-[var(--text-on-accent)] text-[11px] font-semibold leading-[18px] px-2">
          <Star size={11} aria-hidden="true" />{t('featuredBadge')}
        </span>
      )}
    </span>
  );
}

function PriceTag({ item, sale, t, size = 'md' }) {
  const from = item.allowBeanModifier ? t('startingFrom') : '';
  const big = size === 'lg' ? 'text-lg' : 'text-base';
  if (sale.onSale) {
    return (
      <span className="flex flex-col">
        <span className="text-xs text-[var(--text-muted)] line-through num">{from}{formatCurrency(displayPrice(item, sale.originalPrice))}</span>
        <span className={`${big} font-bold text-[var(--state-danger)] num leading-snug`}>{from}{formatCurrency(displayPrice(item, sale.price))}</span>
      </span>
    );
  }
  return (
    <span className={`${big} font-bold text-[var(--accent)] num leading-snug`}>
      {from}{formatCurrency(displayPrice(item, item.price))}
    </span>
  );
}

function AddButton({ item, onAdd, t, lang }) {
  return (
    <button
      type="button"
      aria-label={`${t('addToCart')} ${dispField(item, lang)}`}
      onClick={(e) => { e.stopPropagation(); onAdd(item); }}
      className="shrink-0 w-11 h-11 rounded-full bg-[var(--accent)] text-[var(--text-on-accent)] flex items-center justify-center shadow-[var(--elev-1)] active:scale-95 transition-transform"
    >
      <Plus size={20} strokeWidth={2.5} />
    </button>
  );
}

// `priority`: the first above-the-fold cake cards are the LCP element on
// /order, so load eagerly with high fetch priority instead of loading="lazy".
export const MenuCard = memo(function MenuCard({ item, onAdd, onView, settingsData, isBestSeller = false, t, lang = 'th', priority = false }) {
  const hasImage = Boolean(item.image);
  const sale = getItemSalePrice(item, settingsData);
  const canView = Boolean(onView && (hasImage || item.posterImage));
  const name = dispField(item, lang);

  return (
    <div
      className="h-full bg-[var(--bg-surface)] rounded-[var(--radius)] shadow-[var(--elev-1)] overflow-hidden flex flex-col cursor-pointer active:scale-[0.98] transition-transform"
      onClick={() => (item.posterImage && canView ? onView(item) : onAdd(item))}
    >
      <div
        className="relative w-full aspect-[4/3] bg-[var(--accent-soft)] flex items-center justify-center overflow-hidden"
        onClick={canView ? (e) => { e.stopPropagation(); onView(item); } : undefined}
      >
        {hasImage ? (
          <img
            src={item.image}
            alt={name}
            width="400"
            height="300"
            className="w-full h-full object-cover"
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : undefined}
            decoding="async"
          />
        ) : (
          <Coffee size={36} className="text-[var(--accent-soft-fg)]" strokeWidth={1.5} aria-hidden="true" />
        )}
        <ItemBadges item={item} isBestSeller={isBestSeller} sale={sale} t={t} className="absolute top-2 left-2 right-2" />
        {item.posterImage && (
          <span className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/70 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full">
            <BookOpen size={12} aria-hidden="true" /> {t('posterBadge')}
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1 flex-1">
        <p className="font-semibold text-[var(--text-primary)] text-sm leading-[1.45] line-clamp-2">{name}</p>
        <div className="mt-auto pt-1 flex items-end justify-between gap-2">
          <PriceTag item={item} sale={sale} t={t} />
          <AddButton item={item} onAdd={onAdd} t={t} lang={lang} />
        </div>
      </div>
    </div>
  );
});

export const MenuRow = memo(function MenuRow({ item, onAdd, onView, settingsData, isBestSeller = false, t, lang = 'th' }) {
  const hasImage = Boolean(item.image);
  const sale = getItemSalePrice(item, settingsData);
  const canView = Boolean(onView && (hasImage || item.posterImage));
  const name = dispField(item, lang);
  const description = dispField(item, lang, 'description');

  return (
    <div
      className="flex gap-3 p-2.5 pr-3 bg-[var(--bg-surface)] rounded-[var(--radius)] shadow-[var(--elev-1)] cursor-pointer active:bg-[var(--bg-hover)] transition-colors"
      onClick={() => (item.posterImage && canView ? onView(item) : onAdd(item))}
    >
      <button
        type="button"
        tabIndex={canView ? 0 : -1}
        aria-label={canView ? `${item.posterImage ? `${t('posterBadgeShort')} · ` : ''}${t('viewDetails')} ${name}` : undefined}
        aria-hidden={canView ? undefined : true}
        onClick={canView ? (e) => { e.stopPropagation(); onView(item); } : undefined}
        className="relative shrink-0 w-24 h-24 rounded-[var(--radius-sm)] overflow-hidden bg-[var(--accent-soft)] flex items-center justify-center"
      >
        {hasImage ? (
          <img
            src={item.image}
            alt=""
            width="96"
            height="96"
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <Coffee size={28} className="text-[var(--accent-soft-fg)]" strokeWidth={1.5} aria-hidden="true" />
        )}
        {item.posterImage && (
          <span className="absolute bottom-1 left-1 right-1 flex items-center justify-center gap-1 bg-black/70 text-white text-[10px] font-semibold rounded-full py-0.5">
            <BookOpen size={11} aria-hidden="true" /> {t('posterBadgeShort')}
          </span>
        )}
      </button>
      <div className="flex-1 min-w-0 flex flex-col">
        <p className="font-semibold text-[var(--text-primary)] text-[15px] leading-[1.45] line-clamp-2">{name}</p>
        {description && (
          <p className="text-[var(--text-muted)] text-[13px] leading-[1.5] line-clamp-1">{description}</p>
        )}
        <ItemBadges item={item} isBestSeller={isBestSeller} sale={sale} t={t} className="mt-1" />
        <div className="mt-auto pt-1 flex items-end justify-between gap-2">
          <PriceTag item={item} sale={sale} t={t} />
          <AddButton item={item} onAdd={onAdd} t={t} lang={lang} />
        </div>
      </div>
    </div>
  );
});
