import { useEffect } from 'react';
import { Link2, Plus, Trash2 } from 'lucide-react';
import { Banner, Button, Input, SearchSelect, Sheet } from '../../ui';
import { Toggle } from './controls';

const SELECT_CLASS = 'w-full min-h-12 rounded-[var(--radius-sm)] border-2 border-[var(--border-strong)] bg-[var(--bg-tertiary)] px-4 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus-visible:shadow-[var(--focus-ring)]';

/**
 * Create / edit a menu option (bean, matcha, …). Same fields and the same
 * Firestore write (AdminView.saveBeanModifier) as the old inline form.
 */
export default function ModifierSheet({
  open, onClose, editing, value, onChange, onSubmit, stock, stockById, stockLinkGroups, groups,
  onAddLink, onRemoveLink, onUpdateLink,
}) {
  // Sheet closes on Escape (document capture). While a stock picker's list is
  // open, Escape should only close that list: intercept at window capture and
  // blur the combobox (SearchSelect closes its list on blur).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const el = e.target;
      if (el?.getAttribute?.('role') === 'combobox' && el.getAttribute('aria-expanded') === 'true') {
        e.stopPropagation();
        el.blur();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  const links = value.stockLinks || [];
  const formId = 'modifier-form';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      width={520}
      title={editing ? 'แก้ไขตัวเลือก' : 'เพิ่มตัวเลือก'}
      description="ตัวเลือกที่ลูกค้าเลือกได้ในเมนู เช่น เมล็ดกาแฟ มัทฉะ"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button type="submit" form={formId}>{editing ? 'บันทึกการแก้ไข' : 'เพิ่มตัวเลือก'}</Button>
        </>
      )}
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4">
        <Input
          label="ชื่อตัวเลือก"
          required
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="เช่น คั่วอ่อน"
        />
        <Input
          label="ราคาเมนูเมื่อเลือกตัวนี้"
          type="number"
          inputMode="decimal"
          required
          suffix="บาท"
          inputClassName="num"
          value={value.price}
          onChange={(e) => onChange({ ...value, price: e.target.value })}
          placeholder="80"
          hint="ระบบคิดราคาที่สูงกว่าระหว่างราคาเมนูกับราคานี้ · เมนูที่แพงกว่าจะไม่ถูกลดราคาเพราะเลือกตัวเลือกนี้"
        />
        <div>
          <Input
            label="กลุ่ม"
            value={value.group}
            onChange={(e) => onChange({ ...value, group: e.target.value })}
            placeholder="เมล็ดกาแฟ"
            list="modifier-groups"
            hint="เมนูเลือกได้ว่าจะใช้ตัวเลือกจากกลุ่มไหน (เมนูกาแฟ → เมล็ดกาแฟ, เพียวมัทฉะ → มัทฉะ)"
          />
          <datalist id="modifier-groups">
            {groups.map((g) => <option key={g} value={g} />)}
          </datalist>
        </div>
        <Toggle
          label="ตัวเลือกเริ่มต้น (เบส)"
          description="เลือกแล้วใช้ราคาเมนู ไม่บวกเพิ่ม"
          checked={value.isDefault}
          onChange={(v) => onChange({ ...value, isDefault: v })}
        />

        <fieldset className="flex flex-col gap-3 rounded-[var(--radius)] bg-[var(--bg-sunken)] p-4">
          <legend className="sr-only">ผูกสต็อก</legend>
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-semibold text-[var(--text-primary)]"><Link2 size={18} /> ผูกสต็อก</p>
            <Button variant="secondary" leftIcon={<Plus size={16} />} onClick={onAddLink}>เพิ่มวัตถุดิบ</Button>
          </div>
          {links.length === 0 && <p className="text-sm text-[var(--text-muted)]">ยังไม่ได้ผูกสต็อก · ขายแล้วจะไม่ตัดสต็อกเมล็ด</p>}
          {links.map((link, idx) => {
            const item = stockById.get(link.stockId);
            const dead = !!link.stockId && !item;
            return (
              <div key={idx} className={`flex flex-col gap-3 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] p-3 border ${dead ? 'border-[var(--state-danger)]' : 'border-[var(--border-color)]'}`}>
                {dead && <Banner tone="danger" compact title="วัตถุดิบเดิมถูกลบไปแล้ว" >เลือกวัตถุดิบตัวใหม่แทน แล้วกดบันทึก</Banner>}
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)] mb-1.5">วัตถุดิบ</p>
                  <SearchSelect
                    value={link.stockId}
                    onChange={(id) => onUpdateLink(idx, 'stockId', id)}
                    groups={stockLinkGroups}
                    getOptionValue={(s) => s.id}
                    getOptionLabel={(s) => String(s.name)}
                    placeholder={dead ? 'ถูกลบแล้ว · พิมพ์ค้นหาตัวใหม่' : 'พิมพ์ค้นหาวัตถุดิบ...'}
                    className={SELECT_CLASS}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Input
                    label="ปริมาณที่หักต่อแก้ว"
                    type="number"
                    step="any"
                    inputMode="decimal"
                    inputClassName="num"
                    value={link.usage}
                    onChange={(e) => onUpdateLink(idx, 'usage', e.target.value)}
                    placeholder="0.00"
                    suffix={stock.find((s) => s.id === link.stockId)?.unit || 'หน่วย'}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveLink(idx)}
                    aria-label="เอาวัตถุดิบนี้ออก"
                    className="w-12 h-12 shrink-0 inline-flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--state-danger)] hover:bg-[var(--state-danger-soft)] outline-none focus-visible:shadow-[var(--focus-ring)]"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            );
          })}
        </fieldset>
      </form>
    </Sheet>
  );
}
