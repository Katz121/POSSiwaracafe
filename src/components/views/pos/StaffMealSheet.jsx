import { Banner, Button, Money, Sheet } from '../../ui';
import { STAFF_MEAL_NOTE } from '../../../utils/staffMeal';

/**
 * ยืนยันเจ้าของ/พนักงานกินจากตะกร้าหน้าขาย · ลอกหน้าตา WasteSheet มา
 * (รายชื่อของที่จะตัด + มูลค่าทุน + คำเตือนลิงก์เสีย) ต่างกันแค่ของในตะกร้ามี
 * หลายรายการและสูตรรวมตัวเลือกมาแล้ว ไม่ต้องกรอกจำนวนเพิ่ม
 */
export default function StaffMealSheet({ open, onClose, plan, stockById, saving, onConfirm }) {
  const lines = plan?.lines || [];
  const appliedEntries = Object.entries(plan?.applied || {});
  const unlinked = plan?.unlinked || [];
  const skipped = plan?.skipped || [];
  const nothingToDeduct = appliedEntries.length === 0;
  return (
    <Sheet
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      title="บันทึกเจ้าของ/พนักงานกิน"
      description={`${lines.length} รายการในตะกร้า`}
      width={480}
      footer={(
        <>
          <Button variant="secondary" disabled={saving} onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" disabled={saving || nothingToDeduct} loading={saving} onClick={onConfirm}>ยืนยันบันทึก</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--text-secondary)]">{STAFF_MEAL_NOTE}</p>
        <ul className="flex flex-col gap-1 text-sm text-[var(--text-primary)]">
          {lines.map((line, idx) => (
            <li key={idx} className="flex justify-between gap-2">
              <span className="min-w-0 truncate">{line.name}{line.modifierName ? ` ${line.modifierName}` : ''}</span>
              <span className="num shrink-0">×{line.quantity}</span>
            </li>
          ))}
        </ul>
        <div aria-live="polite" className="rounded-[var(--radius)] bg-[var(--bg-sunken)] p-4 flex flex-col gap-1">
          <p className="text-[var(--text-primary)]">มูลค่าตามราคาทุน <Money value={plan?.cost || 0} decimals={2} className="font-semibold" /></p>
          <p className="text-sm text-[var(--text-secondary)]">จะตัดสต็อก:</p>
          <ul className="text-sm text-[var(--text-secondary)]">
            {appliedEntries.map(([id, used]) => <li key={id} className="num">{stockById.get(id)?.name} {used} {stockById.get(id)?.unit}</li>)}
          </ul>
        </div>
        {unlinked.length > 0 && (
          <Banner tone="warn" title={`ยังไม่ผูกสต็อก ${unlinked.length} รายการ · ส่วนนี้ไม่ถูกตัดและไม่มีต้นทุน`}>
            {unlinked.map((u) => u.name).join(', ')}
          </Banner>
        )}
        {skipped.length > 0 && (
          <Banner tone="danger" title={`มีลิงก์ชี้ไปสต็อกที่ถูกลบแล้ว ${skipped.length} รายการ · มูลค่าจะต่ำกว่าจริง`} />
        )}
      </div>
    </Sheet>
  );
}
