import { useMemo, useState } from 'react';
import { Badge } from '../../ui';
import { activeStock } from '../../../utils/stockMerge';
import { DEFAULT_OAT_MILK_NAME, resolveMilkSwap } from '../../../utils/milkSwap';
import { NativeSelect, SaveBar, Section } from './controls';

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * "นมโอ๊ต: ตัดสต็อกแทนนมวัว" · ลูกค้าเลือกนมโอ๊ตในเมนูลาเต้ → ตอนบิลเสร็จ ลิงก์นมวัว
 * (from) ในสูตรถูกตัดจากนมโอ๊ต (to) แทน ปริมาณเท่าเดิม · บันทึกที่ config/settings.milkSwap
 * ยังไม่ตั้ง = ใช้ค่าเริ่มต้นจากชื่อสต็อก (แสดงให้เห็นว่าตอนนี้ใช้อะไรอยู่)
 */
export default function MilkSwapCard({ stock = [], setting, onSave }) {
  const effective = useMemo(() => resolveMilkSwap(setting, stock), [setting, stock]);
  const baseFrom = effective.oat.from;
  const baseTo = effective.oat.to || '';

  // แก้ไขแล้วค้างไว้ใน draft · ค่า null = ยังไม่แตะ ใช้ค่าที่ใช้จริงอยู่
  const [draftFrom, setDraftFrom] = useState(null);
  const [draftTo, setDraftTo] = useState(null);
  const [saving, setSaving] = useState(false);
  const from = draftFrom ?? baseFrom;
  const to = draftTo ?? baseTo;

  const live = useMemo(() => activeStock(stock), [stock]);
  // ตัวเลือก = สต็อกที่ชื่อมี "นม"/milk/oat + ตัวที่ถูกเลือกอยู่ (กันหายจากลิสต์)
  const candidates = useMemo(() => {
    const picked = new Set([...from, to].filter(Boolean));
    return live
      .filter((s) => /นม|milk|oat/i.test(String(s.name || '')) || picked.has(s.id))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'th'));
  }, [live, from, to]);
  const nameOf = (id) => stock.find((s) => s.id === id)?.name || 'สต็อกที่ถูกลบแล้ว';

  const dirty = !sameSet(from, baseFrom) || to !== baseTo || effective.isDefault;
  const toggleFrom = (id) => setDraftFrom(from.includes(id) ? from.filter((x) => x !== id) : [...from, id]);

  const save = async () => {
    setSaving(true);
    try {
      const ok = await onSave({ oat: { from: from.filter((id) => id !== to), to } });
      if (ok !== false) { setDraftFrom(null); setDraftTo(null); }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      id="milk-swap"
      title="นมโอ๊ต: ตัดสต็อกแทนนมวัว"
      description="เมนูลาเต้ที่ลูกค้าเลือกนมโอ๊ต ระบบจะตัดนมโอ๊ตแทนนมวัวในสูตร ปริมาณเท่าเดิม (ทั้งบิลหน้าร้านและ QR)"
      actions={effective.isDefault
        ? <Badge tone="warn">ใช้ค่าเริ่มต้น</Badge>
        : <Badge tone="ok">ตั้งค่าแล้ว</Badge>}
    >
      <div className="flex flex-col gap-4">
        <fieldset>
          <legend className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5">นมวัวที่จะไม่ถูกตัด (เลือกได้หลายตัว)</legend>
          {candidates.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">ยังไม่มีสต็อกนมในระบบ</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {candidates.filter((s) => s.id !== to).map((s) => {
                const checked = from.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className={`min-h-11 inline-flex items-center gap-2 rounded-[var(--radius-sm)] border-2 px-3 cursor-pointer ${checked ? 'border-[var(--accent)] bg-[var(--bg-sunken)]' : 'border-[var(--border-strong)]'}`}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleFrom(s.id)} className="w-4 h-4 accent-[var(--accent)]" />
                    <span className="text-[var(--text-primary)]">{s.name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        <NativeSelect
          label="ตัดจากนมโอ๊ตตัวนี้แทน"
          value={to}
          onChange={(e) => setDraftTo(e.target.value)}
          hint={`ค่าเริ่มต้นคือสต็อกชื่อ "${DEFAULT_OAT_MILK_NAME}"`}
        >
          <option value="">- ไม่ตัดแทน (ปิด) -</option>
          {candidates.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </NativeSelect>

        <p className="text-sm text-[var(--text-muted)]" aria-live="polite">
          {to && from.length
            ? `ใช้อยู่: ${from.map(nameOf).join(', ')} → ${nameOf(to)}`
            : 'ตอนนี้ไม่สลับ · เลือกนมโอ๊ต 1 ตัว และนมวัวอย่างน้อย 1 ตัว'}
          {effective.isDefault ? ' (ค่าเริ่มต้นจากชื่อสต็อก · กดบันทึกเพื่อยืนยัน)' : ''}
        </p>
      </div>
      <SaveBar inline dirty={dirty} saving={saving} onSave={save} />
    </Section>
  );
}
