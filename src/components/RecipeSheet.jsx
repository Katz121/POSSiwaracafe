import { BookOpen } from 'lucide-react';
import { Modal } from './ui';

/**
 * Read-only recipe popup, shared by the kitchen (tap a menu in an order) and the
 * สูตรเมนู page. `children` = order-specific info (qty, sweetness/note) shown above
 * the recipe; `actions` = extra buttons (e.g. "แก้ไขสูตร" on the recipes page).
 */
export default function RecipeSheet({ isOpen, onClose, menuName, recipe, children, actions }) {
  const text = String(recipe?.text || '').trim();
  const updated = recipe?.updatedAt?.toDate ? recipe.updatedAt.toDate() : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={menuName ? `สูตร · ${menuName}` : 'สูตร'} size="lg">
      <div className="space-y-4">
        {children}
        {text ? (
          <div className="rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-tertiary)] p-4 max-h-[60vh] overflow-y-auto">
            <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-[var(--text-primary)]">{text}</p>
          </div>
        ) : (
          <div className="rounded-[var(--radius)] border border-dashed border-[var(--border-color)] p-6 text-center">
            <BookOpen size={28} className="mx-auto mb-2 text-[var(--text-muted)]" />
            <p className="font-semibold text-[var(--text-secondary)]">ยังไม่มีสูตรของเมนูนี้</p>
            <p className="text-sm text-[var(--text-muted)] mt-1">เพิ่มได้ที่ เพิ่มเติม → สูตรเมนู</p>
          </div>
        )}
        {updated && (
          <p className="text-xs text-[var(--text-muted)]">แก้ไขล่าสุด {updated.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</p>
        )}
        {actions && <div className="flex flex-wrap gap-2 justify-end">{actions}</div>}
      </div>
    </Modal>
  );
}
