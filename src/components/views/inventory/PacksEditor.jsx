import { Plus, X } from 'lucide-react';
import { Button } from '../../ui';

const FIELD = 'w-full min-h-12 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-surface)] px-4 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus-visible:shadow-[var(--focus-ring)]';

// ── หน่วยซื้อ (ตัวเทียบ) ─────────────────────────────────────────────────────
// ซื้อเป็นขวด/ถุง/ลัง แต่สูตรตัดเป็นหน่วยของสต็อก (กรัม) · ตั้งไว้ครั้งเดียว รับของเข้าเลือก "ขวด" ได้เลย
export default function PacksEditor({ packs, unit, onChange, idBase }) {
  const update = (i, patch) => onChange(packs.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <fieldset className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border-color)] p-3">
      <legend className="px-1 text-sm font-medium text-[var(--text-secondary)]">หน่วยซื้อ (ตัวเทียบ)</legend>
      <p className="text-xs text-[var(--text-muted)]">
        เช่น น้ำช่อดอกมะพร้าว 1 ขวด = 1000 {unit || 'กรัม'} · ลัง (12 ขวด) = 12000 · ของเหลวที่ตัดเป็นกรัม ใส่น้ำหนักจริงของ 1 ขวด
      </p>
      {packs.map((p, i) => (
        <div key={i} className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor={`${idBase}-l${i}`} className="mb-1 block text-xs text-[var(--text-muted)]">1 หน่วยซื้อ</label>
            <input id={`${idBase}-l${i}`} type="text" placeholder="ขวด, ถุง, ลัง" value={p.label} onChange={(e) => update(i, { label: e.target.value })} className={FIELD} />
          </div>
          <span className="pb-3 text-[var(--text-muted)]" aria-hidden="true">=</span>
          <div className="min-w-0 flex-1">
            <label htmlFor={`${idBase}-s${i}`} className="mb-1 block text-xs text-[var(--text-muted)]">เท่ากับกี่ {unit || 'หน่วย'}</label>
            <input id={`${idBase}-s${i}`} type="number" inputMode="decimal" step="any" min="0" placeholder="1000" value={p.size} onChange={(e) => update(i, { size: e.target.value })} className={`num ${FIELD}`} />
          </div>
          <button type="button" aria-label={`ลบหน่วยซื้อ ${p.label || i + 1}`} onClick={() => onChange(packs.filter((_, j) => j !== i))}
            className="mb-0.5 flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--state-danger)] hover:bg-[var(--state-danger-soft)] outline-none focus-visible:shadow-[var(--focus-ring)]">
            <X size={20} />
          </button>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" leftIcon={<Plus size={16} />} onClick={() => onChange([...packs, { label: '', size: '' }])} className="self-start">
        เพิ่มหน่วยซื้อ
      </Button>
    </fieldset>
  );
}
