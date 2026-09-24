import { Pencil, Plus, Trash2, Zap } from 'lucide-react';
import { Button, EmptyState, Input, Money, Sheet } from '../../ui';
import { NativeSelect } from './controls';
import { EXPENSE_CATEGORIES } from '../../../config/constants';

const ICONS = [
  ['💰', 'เงิน'], ['🧊', 'น้ำแข็ง'], ['💡', 'ไฟ'], ['💧', 'น้ำ'],
  ['🛒', 'ของเข้าร้าน'], ['👤', 'ค่าจ้าง'], ['📦', 'พัสดุ'], ['🏠', 'ค่าเช่า'],
];

/** Create / edit a quick-expense button (same fields + write as before). */
export function QuickExpenseSheet({ open, onClose, editing, value, onChange, onSubmit }) {
  const formId = 'quick-expense-form';
  return (
    <Sheet
      open={open}
      onClose={onClose}
      width={480}
      title={editing ? 'แก้ไขปุ่มรายจ่ายด่วน' : 'เพิ่มปุ่มรายจ่ายด่วน'}
      description="ปุ่มลัดในหน้ารายจ่าย กดแล้วกรอกรายการให้ทันที"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button type="submit" form={formId}>{editing ? 'บันทึกการแก้ไข' : 'เพิ่มปุ่ม'}</Button>
        </>
      )}
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4">
        <Input label="ชื่อปุ่ม" required placeholder="#ค่าไฟ" value={value.label} onChange={(e) => onChange({ ...value, label: e.target.value })} />
        <Input label="ชื่อที่บันทึก" required placeholder="ค่าไฟประจำเดือน" value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="ยอดเงิน (ถ้ามี)" type="number" inputMode="decimal" suffix="บาท" inputClassName="num"
            placeholder="เว้นว่างได้" value={value.amount} onChange={(e) => onChange({ ...value, amount: e.target.value })}
            hint="ไม่ต้องใส่ถ้ายอดเปลี่ยนทุกวัน" />
          <Input label="หน่วย" placeholder="บิล" value={value.unit} onChange={(e) => onChange({ ...value, unit: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NativeSelect label="ไอคอน" value={value.icon} onChange={(e) => onChange({ ...value, icon: e.target.value })}>
            {ICONS.map(([icon, label]) => <option key={icon} value={icon}>{icon} {label}</option>)}
          </NativeSelect>
          <NativeSelect label="หมวดหมู่" value={value.category} onChange={(e) => onChange({ ...value, category: e.target.value })}>
            {EXPENSE_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </NativeSelect>
        </div>
      </form>
    </Sheet>
  );
}

/** "รายจ่ายด่วน" · list of quick-expense buttons used on the Expenses screen. */
export default function QuickExpensesTab({ quickExpenses, onAdd, onEdit, onDelete, onUseDefaults }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-muted)]">ปุ่มเหล่านี้แสดงในหน้ารายจ่าย กดแล้วกรอกรายการ หมวด และยอดให้ทันที</p>
        <Button leftIcon={<Plus size={18} />} onClick={onAdd}>เพิ่มปุ่ม</Button>
      </div>
      {quickExpenses.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="ยังไม่มีปุ่มรายจ่ายด่วน"
          description="เริ่มจากชุดที่ร้านใช้บ่อย (ค่าน้ำแข็ง ค่าไฟ ซื้อของเข้าร้าน) แล้วค่อยแก้"
          action={{ label: 'ใช้ค่าเริ่มต้นทางร้าน', onClick: onUseDefaults }}
        />
      ) : (
        <ul className="rounded-[var(--radius)] bg-[var(--bg-surface)] shadow-[var(--elev-1)] px-4 md:px-5">
          {quickExpenses.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-3 border-b border-[var(--border-light)] last:border-b-0">
              <span aria-hidden="true" className="w-11 h-11 shrink-0 rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] flex items-center justify-center text-xl">{item.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-[var(--text-primary)] truncate">{item.label}</span>
                <span className="block text-sm text-[var(--text-muted)] truncate">
                  {item.title} · {item.category}
                  {item.amount !== '' && item.amount != null && <> · <Money value={Number(item.amount)} /></>}
                </span>
              </span>
              <Button variant="secondary" leftIcon={<Pencil size={16} />} onClick={() => onEdit(item)} aria-label={`แก้ไข ${item.label}`}>
                <span className="hidden sm:inline">แก้ไข</span>
              </Button>
              <button
                type="button"
                onClick={() => onDelete(item)}
                aria-label={`ลบ ${item.label}`}
                className="w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--state-danger)] hover:bg-[var(--state-danger-soft)] outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                <Trash2 size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
