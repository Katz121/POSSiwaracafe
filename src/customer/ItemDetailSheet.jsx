// ItemDetailSheet · the whole photo (or the story poster, e.g. Poh) plus the
// full description of one menu. Cards crop photos and clamp descriptions, so
// this is where the customer reads the full story. "Add" continues into the
// normal add flow (option sheet etc.).
import { Plus } from 'lucide-react';
import Sheet from '../components/ui/Sheet';
import Button from '../components/ui/Button';
import { formatCurrency } from '../config/constants';
import { getItemSalePrice } from '../utils/promotions';
import { dispField, displayPrice } from './display';
import { ItemBadges } from './MenuItems';

export default function ItemDetailSheet({ item, settingsData, onAdd, onClose, isBestSeller = false, t, lang = 'th' }) {
  const sale = item ? getItemSalePrice(item, settingsData) : null;
  const description = item ? dispField(item, lang, 'description') : '';
  const src = item ? (item.posterImage || item.image) : '';
  const from = item?.allowBeanModifier ? t('startingFrom') : '';

  const footer = item ? (
    <div className="w-full flex items-center gap-3">
      <div className="flex-1 min-w-0">
        {sale.onSale && (
          <p className="text-xs text-[var(--text-muted)] line-through num">{from}{formatCurrency(displayPrice(item, sale.originalPrice))}</p>
        )}
        <p className={`text-xl font-bold num leading-snug ${sale.onSale ? 'text-[var(--state-danger)]' : 'text-[var(--accent)]'}`}>
          {from}{formatCurrency(displayPrice(item, sale.price))}
        </p>
      </div>
      <Button size="xl" onClick={() => onAdd(item)} leftIcon={<Plus size={20} />} className="px-6">
        {t('addToCart')}
      </Button>
    </div>
  ) : null;

  return (
    <Sheet open={Boolean(item)} onClose={onClose} title={item ? dispField(item, lang) : ''} width={560} footer={footer}>
      {item && (
        <div className="space-y-4">
          {src && (
            <div className={`-mx-5 -mt-4 flex justify-center ${item.posterImage ? 'bg-[#0B111B]' : 'bg-[var(--bg-sunken)]'}`}>
              <img
                src={src}
                alt={dispField(item, lang)}
                width="720"
                height={item.posterImage ? 960 : 540}
                decoding="async"
                className={`w-full h-auto object-contain ${item.posterImage ? 'max-h-[70dvh]' : 'max-h-[50dvh]'}`}
              />
            </div>
          )}
          <ItemBadges item={item} isBestSeller={isBestSeller} sale={sale} t={t} />
          {description && (
            <p className="text-[var(--text-secondary)] text-base leading-[1.7] whitespace-pre-line">{description}</p>
          )}
        </div>
      )}
    </Sheet>
  );
}
