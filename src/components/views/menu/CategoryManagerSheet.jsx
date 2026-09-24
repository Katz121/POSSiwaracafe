import { useState } from 'react';
import { ChevronUp, ChevronDown, Trash2, Plus } from 'lucide-react';
import { Banner, Button, Input, Sheet } from '../../ui';

const ICONS = ['📁', '☕', '🧋', '🍵', '🧁', '🍰', '🥐', '🥪', '🍜', '🍕', '🍔', '🥗', '🍹', '🧃', '🍦', '⭐'];
const ICON_BTN = 'w-11 h-11 shrink-0 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-30 disabled:cursor-not-allowed';

/**
 * จัดการหมวดหมู่ · add, reorder (▲▼ drives POS + QR tab order), delete.
 * Handlers are the v1 ones from MenuManageView (same Firestore writes).
 */
export default function CategoryManagerSheet({
  open, onClose, categories, menu, newCategory, setNewCategory, onAdd, onMove, onDelete,
}) {
  const [confirmId, setConfirmId] = useState(null);
  const close = () => { setConfirmId(null); onClose(); };

  return (
    <Sheet open={open} onClose={close} title="จัดการหมวดหมู่" description="เพิ่ม เรียงลำดับ หรือลบหมวดหมู่สินค้า" width={520}>
      <div className="flex flex-col gap-6">
        <form onSubmit={onAdd} className="rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-canvas)] p-4 flex flex-col gap-3">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">เพิ่มหมวดหมู่ใหม่</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="ชื่อหมวดหมู่" value={newCategory.name} placeholder="เช่น กาแฟ, ชา, ขนม" onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })} />
            <Input label="ชื่อ (EN)" value={newCategory.nameEn} placeholder="เช่น Coffee, Tea" onChange={(e) => setNewCategory({ ...newCategory, nameEn: e.target.value })} />
          </div>
          <div className="flex items-end gap-3">
            <div>
              <label htmlFor="cat-icon" className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5">ไอคอน</label>
              <select
                id="cat-icon"
                value={newCategory.icon}
                onChange={(e) => setNewCategory({ ...newCategory, icon: e.target.value })}
                className="min-h-11 w-20 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 text-xl outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                {ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <Button type="submit" leftIcon={<Plus size={18} />} disabled={!newCategory.name.trim()} className="flex-1">เพิ่มหมวดหมู่</Button>
          </div>
        </form>

        <div className="flex flex-col gap-2">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">หมวดหมู่ทั้งหมด <span className="num text-[var(--text-muted)] font-normal">({categories.length})</span></h3>
          {categories.length === 0 ? (
            <p className="py-8 text-center text-[var(--text-muted)]">ยังไม่มีหมวดหมู่</p>
          ) : (
            <ul className="rounded-[var(--radius)] border border-[var(--border-color)] divide-y divide-[var(--border-light)] bg-[var(--bg-surface)]">
              {categories.map((cat, index) => {
                const itemCount = menu.filter((m) => m.category === cat.name).length;
                const confirming = confirmId === cat.id;
                return (
                  <li key={cat.id} className={`flex items-center gap-2 px-2 py-2 min-h-16 ${confirming ? 'bg-[var(--state-danger-soft)]' : ''}`}>
                    <div className="flex flex-col">
                      <button type="button" className={ICON_BTN} onClick={() => onMove(index, -1)} disabled={index === 0} aria-label={`เลื่อน ${cat.name} ขึ้น (แสดงก่อน)`}><ChevronUp size={20} /></button>
                      <button type="button" className={ICON_BTN} onClick={() => onMove(index, 1)} disabled={index === categories.length - 1} aria-label={`เลื่อน ${cat.name} ลง (แสดงทีหลัง)`}><ChevronDown size={20} /></button>
                    </div>
                    <span className="text-2xl w-9 text-center" aria-hidden="true">{cat.icon || '📁'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[var(--text-primary)] break-words">{cat.name}</p>
                      <p className="text-sm text-[var(--text-muted)]">{itemCount > 0 ? `${itemCount} เมนูในหมวดหมู่นี้` : 'ไม่มีเมนู'}</p>
                    </div>
                    {confirming ? (
                      <div className="flex items-center gap-2">
                        <Button variant="danger" onClick={async () => { await onDelete(cat); setConfirmId(null); }}>ยืนยันลบ</Button>
                        <Button variant="secondary" onClick={() => setConfirmId(null)}>ยกเลิก</Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmId(cat.id)}
                        disabled={itemCount > 0}
                        aria-label={itemCount > 0 ? `ลบ ${cat.name} ไม่ได้ มี ${itemCount} เมนูใช้อยู่` : `ลบหมวดหมู่ ${cat.name}`}
                        title={itemCount > 0 ? `ไม่สามารถลบได้ มี ${itemCount} เมนูใช้อยู่` : 'ลบหมวดหมู่'}
                        className={`${ICON_BTN} text-[var(--state-danger)] hover:bg-[var(--state-danger-soft)]`}
                      >
                        <Trash2 size={20} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Banner tone="info" title="ลำดับหมวดหมู่มีผลทั้งหน้าขายและหน้า QR ลูกค้า">
          ลบหมวดหมู่ที่มีเมนูใช้อยู่ไม่ได้ · ย้ายหรือลบเมนูในหมวดนั้นก่อน
        </Banner>
      </div>
    </Sheet>
  );
}
