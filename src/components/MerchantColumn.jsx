import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Inbox } from 'lucide-react';
import { useDataContext } from '../context/AppContext';
import RecipeSheet from './RecipeSheet';
import { effectiveRecipe } from '../utils/recipeDraft';
import Ticket from './views/kitchen/Ticket';

const EMPTY_TEXT = {
  pending: 'ยังไม่มีออเดอร์ใหม่',
  preparing: 'ไม่มีรายการที่กำลังทำ',
  ready: 'ยังไม่มีรายการรอส่ง',
};

/**
 * One kitchen column (KDS, always dark via --kds-* tokens).
 * Props: title, color (CSS colour of the status dot), status, orders (any list;
 * filtered to `status` here), now (ms, for ticket ages), onUpdate, onCancel, onEdit.
 */
export default function MerchantColumn({ title, color, status, orders, now, onUpdate, onCancel, onEdit, className = '' }) {
  const { recipes = {}, menu = [], stock = [] } = useDataContext();
  // สูตรของร้านก่อน ไม่มีค่อยใช้ที่ดึงจากวัตถุดิบที่ผูก (utils/recipeDraft.js)
  const menuById = useMemo(() => new Map(menu.map((m) => [m.id, m])), [menu]);
  const stockById = useMemo(() => new Map(stock.map((s) => [s.id, s])), [stock]);
  const recipeOf = useCallback((id) => effectiveRecipe(recipes, menuById.get(id) || { id }, stockById), [recipes, menuById, stockById]);
  const [recipeItem, setRecipeItem] = useState(null); // order line whose recipe is open
  const filtered = (orders || [])
    .filter(o => o.status === status)
    .sort((a, b) => (Number(a.queueNumber) || 0) - (Number(b.queueNumber) || 0));
  const hasRecipe = useCallback((id) => !!recipeOf(id), [recipeOf]);

  return (
    <>
      <RecipeSheet
        isOpen={!!recipeItem}
        onClose={() => setRecipeItem(null)}
        menuName={recipeItem?.name}
        recipe={recipeItem ? recipeOf(recipeItem.id) : null}
      >
        {recipeItem && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="num px-3 py-1 rounded-full bg-[var(--accent)] text-[var(--text-on-accent)] text-sm font-semibold">×{Number(recipeItem.quantity)}</span>
            {recipeItem.note && <span className="px-3 py-1 rounded-full bg-[var(--state-warn-soft)] text-[var(--state-warn)] text-sm font-medium">{String(recipeItem.note)}</span>}
          </div>
        )}
      </RecipeSheet>
      <section
        aria-label={title}
        data-kds-column={status}
        className={`flex flex-col min-h-0 rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--kds-surface)_55%,var(--kds-bg))] border border-[var(--kds-border)] ${className}`}
      >
        <header className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-[var(--kds-border)]">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} aria-hidden="true" />
          <h2 className="flex-1 text-lg font-semibold text-[var(--kds-text)]">{String(title)}</h2>
          <span className="num text-[length:var(--fs-3xl)] leading-[var(--lh-3xl)] font-semibold text-[var(--kds-text)]" aria-label={`${filtered.length} ออเดอร์`}>{filtered.length}</span>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 scrollbar-hide">
          {filtered.length === 0 ? (
            <div className="h-full min-h-40 flex flex-col items-center justify-center gap-2 text-center text-[var(--kds-muted)]">
              <Inbox size={32} strokeWidth={1.5} />
              <p className="text-base">{EMPTY_TEXT[status] || 'ไม่มีรายการ'}</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {filtered.map(order => (
                <Ticket
                  key={order.id}
                  order={order}
                  status={status}
                  now={now}
                  hasRecipe={hasRecipe}
                  onUpdate={onUpdate}
                  onCancel={onCancel}
                  onEdit={onEdit}
                  onRecipe={setRecipeItem}
                />
              ))}
            </AnimatePresence>
          )}
        </div>
      </section>
    </>
  );
}
