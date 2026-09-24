// CartSheet · cart contents (bottom sheet on phones, right sheet on tablets).
// Replaces the hand-rolled CartDrawer; same callbacks, same cart rules.
import { useState } from 'react';
import { Plus, Minus, Trash2, Coffee, FileText, Check, Pencil } from 'lucide-react';
import Sheet from '../components/ui/Sheet';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import { formatCurrency } from '../config/constants';
import { dispField, lineOptionSummary, defaultOptionNote } from './display';

export default function CartSheet({ isOpen, cart, onClose, onUpdateQty, onUpdateNote, onEditOptions, crossSell, comboPercent, onAdd, total, onProceed, t, lang = 'th' }) {
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteValue, setNoteValue] = useState('');
  const itemCount = cart.reduce((s, i) => s + Number(i.quantity), 0);

  const startEditNote = (cartId, currentNote) => {
    setEditingNoteId(cartId);
    setNoteValue(currentNote || '');
  };
  const saveNote = (cartId) => {
    onUpdateNote(cartId, noteValue);
    setEditingNoteId(null);
  };

  const footer = cart.length > 0 ? (
    <Button variant="primary" size="xl" fullWidth onClick={onProceed}>
      <span className="flex w-full items-center justify-between gap-3">
        <span>{t('proceed')}</span>
        <span className="num">{formatCurrency(total)}</span>
      </span>
    </Button>
  ) : null;

  return (
    <Sheet
      open={isOpen}
      onClose={onClose}
      title={t('cartTitle')}
      description={itemCount > 0 ? t('cartCount', itemCount) : undefined}
      width={460}
      footer={footer}
    >
      {cart.length === 0 ? (
        <EmptyState icon="cart" title={t('cartEmptyTitle')} description={t('cartEmptyDesc')} size="sm" />
      ) : (
        <ul className="divide-y divide-[var(--border-color)] -mt-2">
          {cart.map((line) => {
            const id = line.cartId || line.id;
            const options = lineOptionSummary(line, t, lang);
            const customNote = line.note && line.note !== defaultOptionNote(line) ? line.note : '';
            const hasOptions = line.modifierIds?.length > 0 || line.sweetness != null || line.milkType;
            return (
              <li key={id} className="py-3 space-y-2">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[var(--text-primary)] leading-snug">{dispField(line, lang)}</p>
                    {options && <p className="text-sm text-[var(--text-secondary)] leading-snug mt-0.5">{options}</p>}
                  </div>
                  <p className="shrink-0 font-bold text-[var(--text-primary)] num">{formatCurrency(Number(line.price) * Number(line.quantity))}</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center rounded-full bg-[var(--bg-sunken)] p-0.5">
                    <button
                      type="button"
                      onClick={() => onUpdateQty(id, line.quantity - 1)}
                      aria-label={line.quantity <= 1 ? t('removeItem') : t('decrease')}
                      className="w-11 h-11 rounded-full flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                    >
                      {line.quantity <= 1 ? <Trash2 size={16} /> : <Minus size={16} />}
                    </button>
                    <span className="w-8 text-center font-bold text-[var(--text-primary)] num" aria-live="polite">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => onUpdateQty(id, line.quantity + 1)}
                      aria-label={t('increase')}
                      className="w-11 h-11 rounded-full flex items-center justify-center bg-[var(--accent)] text-[var(--text-on-accent)]"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  {hasOptions && (
                    <button type="button" onClick={() => onEditOptions(line)} className="min-h-11 px-3 inline-flex items-center gap-1.5 rounded-full text-sm font-semibold text-[var(--accent-soft-fg)] hover:bg-[var(--accent-soft)]">
                      <Pencil size={14} aria-hidden="true" />{t('editOptions')}
                    </button>
                  )}
                  {editingNoteId !== id && (
                    <button type="button" onClick={() => startEditNote(id, line.note)} className="min-h-11 px-3 inline-flex items-center gap-1.5 rounded-full text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] min-w-0">
                      <FileText size={14} aria-hidden="true" className="shrink-0" />
                      <span className="truncate max-w-[12rem]">{customNote || t('addNote')}</span>
                    </button>
                  )}
                </div>

                {editingNoteId === id && (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={noteValue}
                      onChange={(e) => setNoteValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveNote(id); }}
                      onBlur={() => saveNote(id)} // tapping elsewhere / "proceed" must not drop the note
                      placeholder={t('notePlaceholder')}
                      aria-label={t('addNote')}
                      className="flex-1 min-w-0 min-h-11 border border-[var(--border-strong)] rounded-[var(--radius-sm)] px-3 bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                    />
                    <button type="button" onClick={() => saveNote(id)} aria-label={t('saveNote')} className="w-11 h-11 shrink-0 rounded-[var(--radius-sm)] bg-[var(--accent)] text-[var(--text-on-accent)] flex items-center justify-center">
                      <Check size={16} />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {crossSell.length > 0 && (
        <section className="mt-4 space-y-2" aria-label={t('crossSell', comboPercent)}>
          <p className="text-sm font-semibold text-[var(--accent-soft-fg)]">{t('crossSell', comboPercent)}</p>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5 scrollbar-hide">
            {crossSell.map(({ item, extra }) => (
              <button key={item.id} type="button" onClick={() => onAdd(item)} className="min-h-11 w-64 shrink-0 flex items-center gap-3 p-2 text-left rounded-[var(--radius)] bg-[var(--bg-sunken)] hover:bg-[var(--bg-hover)]">
                {item.image
                  ? <img src={item.image} alt="" width="48" height="48" loading="lazy" decoding="async" className="w-12 h-12 shrink-0 rounded-[var(--radius-sm)] object-cover" />
                  : <Coffee size={24} className="shrink-0 text-[var(--text-muted)]" aria-hidden="true" />}
                <span className="min-w-0 text-sm text-[var(--text-primary)]">
                  <span className="block leading-snug line-clamp-2">{dispField(item, lang)}</span>
                  <span className="block text-xs font-semibold text-[var(--accent-soft-fg)]">{t('netAdd', formatCurrency(extra))}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </Sheet>
  );
}
