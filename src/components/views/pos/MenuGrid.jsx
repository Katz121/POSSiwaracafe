import { memo } from 'react';
import { EmptyState, Skeleton } from '../../ui';
import MenuCard from './MenuCard';

/**
 * The full filtered menu in one scrolling grid (no pagination, spec WP1 P0).
 * Memoised so a cart change only reaches the tile whose in-cart count changed.
 *
 * Props: items, saleSettings, onAdd (stable), density 'grid'|'list',
 *        qtyById (Map id → qty in cart), loading, showFeatured
 */
function MenuGrid({ items, saleSettings, onAdd, density = 'grid', qtyById, loading = false, showFeatured = true }) {
  if (loading) return <Skeleton.MenuGrid items={8} />;
  if (items.length === 0) {
    return <EmptyState icon="search" title="ไม่พบเมนู" description="ลองหมวดอื่น หรือค้นด้วยชื่อเมนู" size="sm" />;
  }
  const list = density === 'list';
  return (
    <div
      className={list
        ? 'grid grid-cols-1 xl:grid-cols-2 gap-2'
        : 'grid grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3'}
    >
      {items.map((item) => (
        <MenuCard
          key={item.id}
          item={item}
          saleSettings={saleSettings}
          onAdd={onAdd}
          variant={density}
          inCart={qtyById.get(item.id) || 0}
          showFeatured={showFeatured}
        />
      ))}
    </div>
  );
}

export default memo(MenuGrid);
