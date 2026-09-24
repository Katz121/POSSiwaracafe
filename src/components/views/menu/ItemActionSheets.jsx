import { ArrowUp, ArrowDown, Coffee, Star } from 'lucide-react';
import { Banner, Button, EmptyState, Input, Money, Sheet } from '../../ui';

/** จัดลำดับเมนูแนะนำ · the draft list lives in MenuManageView (featuredOrder writes unchanged). */
export function FeaturedOrderSheet({ draft, setDraft, saving, onSave, onClose, moveItem }) {
  const open = draft !== null;
  return (
    <Sheet
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      title="จัดลำดับเมนูแนะนำ"
      description={'ใช้กับแถบ "เมนูแนะนำ" หน้า QR และแท็บ "แนะนำ" หน้าร้าน'}
      width={520}
      footer={(
        <>
          <Button variant="secondary" disabled={saving} onClick={onClose}>ยกเลิก</Button>
          <Button loading={saving} disabled={!draft?.length} onClick={onSave}>บันทึกลำดับ</Button>
        </>
      )}
    >
      {draft?.length === 0 && <EmptyState icon={Star} title="ยังไม่มีเมนูแนะนำ" description="เปิด &quot;เมนูแนะนำ&quot; ที่เมนูก่อน (ปุ่ม ⋯ ของแต่ละเมนู)" />}
      <ol className="flex flex-col gap-2">
        {(draft || []).map((item, idx) => (
          <li key={item.id} className="flex items-center gap-3 p-2 rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-surface)]">
            <span className="num w-7 text-center text-sm font-semibold text-[var(--text-muted)]">{idx + 1}</span>
            <div className="w-12 h-12 rounded-[var(--radius-sm)] overflow-hidden bg-[var(--bg-sunken)] shrink-0 flex items-center justify-center">
              {item.image
                ? <img src={item.image} alt="" width={48} height={48} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                : <Coffee size={18} className="text-[var(--text-muted)]" aria-hidden="true" />}
            </div>
            <span className="flex-1 min-w-0 text-sm font-semibold text-[var(--text-primary)] line-clamp-2">{item.name}</span>
            <button type="button" aria-label={`เลื่อน ${item.name} ขึ้น`} disabled={idx === 0 || saving}
              onClick={() => setDraft((d) => moveItem(d, idx, idx - 1))}
              className="w-11 h-11 shrink-0 rounded-[var(--radius-sm)] flex items-center justify-center bg-[var(--bg-sunken)] text-[var(--text-primary)] disabled:opacity-30 outline-none focus-visible:shadow-[var(--focus-ring)]">
              <ArrowUp size={18} />
            </button>
            <button type="button" aria-label={`เลื่อน ${item.name} ลง`} disabled={idx === draft.length - 1 || saving}
              onClick={() => setDraft((d) => moveItem(d, idx, idx + 1))}
              className="w-11 h-11 shrink-0 rounded-[var(--radius-sm)] flex items-center justify-center bg-[var(--bg-sunken)] text-[var(--text-primary)] disabled:opacity-30 outline-none focus-visible:shadow-[var(--focus-ring)]">
              <ArrowDown size={18} />
            </button>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}

/** บันทึกของเสีย · cost + stock usage preview; the batch write stays in MenuManageView. */
export function WasteSheet({
  open, onClose, menuItem, quantity, setQuantity, saving, waste, unitWaste, validQuantity, stockById, onConfirm, onGoLink,
}) {
  return (
    <Sheet
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      title="บันทึกของเสีย"
      description={menuItem?.name || 'เมนูนี้ถูกลบแล้ว'}
      width={480}
      footer={(
        <>
          <Button variant="secondary" disabled={saving} onClick={onClose}>ยกเลิก</Button>
          <Button variant="danger" disabled={!menuItem || !validQuantity || !waste.costed || saving} loading={saving} onClick={onConfirm}>ยืนยันบันทึกของเสีย</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        {waste.costed
          ? <p className="text-[var(--text-secondary)]">ต้นทุนต่อชิ้น <Money value={unitWaste.costPerUnit} decimals={2} className="font-semibold text-[var(--text-primary)]" /></p>
          : (
            <Banner tone="warn" title="ต้องผูกสต็อกก่อนถึงจะรู้มูลค่าของเสีย" action={menuItem ? { label: 'ไปผูกสต็อก', onClick: onGoLink } : undefined} />
          )}
        {waste.missingLinks > 0 && <Banner tone="danger" title={`มีลิงก์ชี้ไปสต็อกที่ถูกลบแล้ว ${waste.missingLinks} รายการ · มูลค่าของเสียจะต่ำกว่าจริง`} />}
        <Input label="จำนวนชิ้นที่ทิ้ง" type="number" inputMode="decimal" min="0" step="any" value={quantity} disabled={saving} onChange={(e) => setQuantity(e.target.value)} />
        {validQuantity && waste.costed && (
          <div aria-live="polite" className="rounded-[var(--radius)] bg-[var(--bg-sunken)] p-4 flex flex-col gap-1">
            <p className="text-[var(--text-primary)]">มูลค่าของเสีย <Money value={waste.cost} decimals={2} className="font-semibold" /></p>
            <p className="text-sm text-[var(--text-secondary)]">จะตัดสต็อก:</p>
            <ul className="text-sm text-[var(--text-secondary)]">
              {Object.entries(waste.usageByStock).map(([id, used]) => <li key={id} className="num">{stockById.get(id)?.name} {used} {stockById.get(id)?.unit}</li>)}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** สร้างสต็อกก้อน · creates a stock doc + links it to the menu (batch in MenuManageView). */
export function CakeStockSheet({
  open, onClose, menuItem, cakeStock, setCakeStock, saving, onSubmit,
  duplicate, validQuantity, validCost, validPortions, validAll, cakeCost, cakePortions, cakeUsage, cakeUnit, defaultUnit,
}) {
  const formId = 'menu-cake-stock-form';
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="สร้างสต็อกก้อน"
      description={menuItem?.name || 'เมนูนี้ถูกลบแล้ว'}
      width={480}
      footer={(
        <>
          <Button variant="secondary" disabled={saving} onClick={onClose}>ยกเลิก</Button>
          <Button type="submit" form={formId} disabled={!validAll || saving} loading={saving}>สร้างสต็อกและผูกเมนู</Button>
        </>
      )}
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4">
        <Input label="ชื่อสต็อก" required value={cakeStock.name} disabled={saving} onChange={(e) => setCakeStock((prev) => ({ ...prev, name: e.target.value }))} />
        {duplicate && <Banner tone="warn" title="มีสต็อกชื่อนี้อยู่แล้ว">การยืนยันจะสร้างตัวใหม่ซ้ำชื่อ ทำต่อได้หากต้องการแยกล็อต</Banner>}
        <Input label="หน่วย" value={cakeStock.unit} placeholder={defaultUnit} hint={`หากเว้นว่างจะใช้หน่วย ${defaultUnit}`} disabled={saving} onChange={(e) => setCakeStock((prev) => ({ ...prev, unit: e.target.value }))} />
        <Input label="จำนวนที่มีตอนนี้" type="number" inputMode="decimal" min="0" step="any" value={cakeStock.quantity} hint="เว้นว่างได้ ระบบจะบันทึกเป็น 0" error={!validQuantity ? 'จำนวนต้องเป็น 0 หรือมากกว่า' : undefined} disabled={saving} onChange={(e) => setCakeStock((prev) => ({ ...prev, quantity: e.target.value }))} />
        <Input label="ต้นทุนต่อก้อน" required type="number" inputMode="decimal" min="0" step="any" value={cakeStock.unitCost} hint="ต้องมากกว่า 0" error={cakeStock.unitCost !== '' && !validCost ? 'ต้นทุนต้องมากกว่า 0' : undefined} disabled={saving} onChange={(e) => setCakeStock((prev) => ({ ...prev, unitCost: e.target.value }))} />
        <Input label="1 ก้อนตัดได้กี่ชิ้น" required type="number" inputMode="numeric" min="1" step="1" value={cakeStock.portions} error={!validPortions ? 'กรุณาระบุจำนวนเต็มมากกว่า 0' : undefined} disabled={saving} onChange={(e) => setCakeStock((prev) => ({ ...prev, portions: e.target.value }))} />
        <div aria-live="polite" className="rounded-[var(--radius)] bg-[var(--bg-sunken)] p-4 text-[var(--text-primary)] flex flex-col gap-1">
          <p>ทุนต่อชิ้น = {validCost && validPortions ? <Money value={cakeCost / cakePortions} decimals={2} className="font-semibold" /> : 'กรอกต้นทุนและจำนวนชิ้นให้ครบ'}</p>
          {validPortions && <p className="text-sm text-[var(--text-secondary)] break-words">ระบบจะบันทึกเป็น usage = {cakeUsage} {cakeUnit}/ชิ้น</p>}
        </div>
      </form>
    </Sheet>
  );
}
