import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Input } from '../../ui';
import { activeStock } from '../../../utils/stockMerge';
import { resolvePackagingPresets } from '../../../utils/packagingPresets';
import { SaveBar, Section } from './controls';

const PACK_RE = /แก้ว|หลอด|ฝา|cup|straw|lid/i;
const newId = () => `p${Date.now().toString(36)}`;

/**
 * "ชุดแก้ว/หลอด" · ทางลัดตอนผูกสต็อกเมนู (ตัวแก้เมนู → ผูกสต็อก → ปุ่มชุด)
 * ตั้งได้ว่าแต่ละชุดใช้แก้ว/ฝา/หลอดตัวไหน · บันทึกที่ config/settings.packagingPresets
 */
export default function PackagingPresetsCard({ stock = [], setting, onSave }) {
  const effective = useMemo(() => resolvePackagingPresets(setting, stock), [setting, stock]);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const presets = draft ?? effective.presets;

  const candidates = useMemo(() => {
    const picked = new Set(presets.flatMap((p) => p.links.map((l) => l.stockId)));
    return activeStock(stock)
      .filter((s) => (PACK_RE.test(String(s.name || '')) && !/ตวง|หลุม|กล่อง|ถ้วย/.test(String(s.name || ''))) || picked.has(s.id))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'th'));
  }, [stock, presets]);

  const edit = (i, patch) => setDraft(presets.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const toggle = (i, stockId) => {
    const p = presets[i];
    const has = p.links.some((l) => l.stockId === stockId);
    edit(i, { links: has ? p.links.filter((l) => l.stockId !== stockId) : [...p.links, { stockId, usage: 1 }] });
  };
  const valid = presets.every((p) => p.label.trim() && p.links.length);
  const dirty = draft !== null || effective.isDefault;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const ok = await onSave(presets.map((p) => ({ id: p.id || newId(), label: p.label.trim(), links: p.links })));
      if (ok !== false) setDraft(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      id="packaging-presets"
      title="ชุดแก้ว/หลอด (ทางลัดผูกสต็อก)"
      description="ตั้งว่าแต่ละชุดใช้แก้ว ฝา หลอดตัวไหน · ตอนผูกสต็อกเมนูกดปุ่มชุดเดียวใส่ครบ"
      actions={effective.isDefault ? <Badge tone="warn">ใช้ค่าเริ่มต้น</Badge> : <Badge tone="ok">ตั้งค่าแล้ว</Badge>}
    >
      <div className="flex flex-col gap-4">
        {presets.map((p, i) => (
          <div key={p.id || i} className="rounded-[var(--radius)] border border-[var(--border-color)] p-3 flex flex-col gap-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input label="ชื่อชุด" value={p.label} onChange={(e) => edit(i, { label: e.target.value })} placeholder="เช่น แก้ว 16oz ใส + หลอด" />
              </div>
              <Button variant="ghost" aria-label={`ลบชุด ${p.label}`} onClick={() => setDraft(presets.filter((_, idx) => idx !== i))}><Trash2 size={18} /></Button>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label={`ของในชุด ${p.label}`}>
              {candidates.map((s) => {
                const checked = p.links.some((l) => l.stockId === s.id);
                return (
                  <label key={s.id} className={`min-h-11 inline-flex items-center gap-2 rounded-[var(--radius-sm)] border-2 px-3 cursor-pointer ${checked ? 'border-[var(--accent)] bg-[var(--bg-sunken)]' : 'border-[var(--border-strong)]'}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(i, s.id)} className="w-4 h-4 accent-[var(--accent)]" />
                    <span className="text-[var(--text-primary)]">{s.name}</span>
                  </label>
                );
              })}
            </div>
            {!p.links.length && <p className="text-sm text-[var(--state-danger)]">เลือกอย่างน้อย 1 อย่าง</p>}
          </div>
        ))}
        <Button variant="secondary" leftIcon={<Plus size={18} />} onClick={() => setDraft([...presets, { id: newId(), label: '', links: [] }])}>เพิ่มชุด</Button>
        {effective.isDefault && <p className="text-sm text-[var(--text-muted)]">ค่าเริ่มต้นเดาจากชื่อสต็อก · ปรับแล้วกดบันทึกเพื่อยืนยัน</p>}
      </div>
      <SaveBar inline dirty={dirty && valid} saving={saving} onSave={save} />
    </Section>
  );
}
