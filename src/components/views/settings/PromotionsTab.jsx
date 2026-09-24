import { Input } from '../../ui';
import { SaveBar, Section, Toggle } from './controls';

/** "โปรโมชั่น & ส่วนลด" · cake happy hour, combo, spend threshold, own glass, review link. */
export default function PromotionsTab({ draft, patch, dirty, onSave, dynamicCategories }) {
  const selectedCats = draft.cakeSaleCategories || [];
  const toggleCat = (name) => {
    const next = selectedCats.includes(name) ? selectedCats.filter((n) => n !== name) : [...selectedCats, name];
    patch({ cakeSaleCategories: next });
  };

  return (
    <div className="flex flex-col gap-5">
      <Section title="ลดราคาตามช่วงเวลา (Happy Hour เค้ก)" description="ในช่วงเวลานี้ เมนูในหมวดที่เลือกจะลดราคาอัตโนมัติ ทั้งหน้า POS และหน้า QR ลูกค้า">
        <div className="flex flex-col gap-4">
          <Toggle
            label="เปิดใช้งานลดราคาช่วงเวลา"
            checked={draft.cakeSaleEnabled}
            onChange={(v) => patch({ cakeSaleEnabled: v })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="ส่วนลด" type="number" inputMode="decimal" min={0} max={100} suffix="%" inputClassName="num" placeholder="20"
              value={draft.cakeSalePercent} onChange={(e) => patch({ cakeSalePercent: e.target.value })} />
            <Input label="เริ่ม" type="time" value={draft.cakeSaleStart} onChange={(e) => patch({ cakeSaleStart: e.target.value })} inputClassName="num" />
            <Input label="สิ้นสุด" type="time" value={draft.cakeSaleEnd} onChange={(e) => patch({ cakeSaleEnd: e.target.value })} inputClassName="num" />
          </div>
          <fieldset>
            <legend className="text-sm font-semibold text-[var(--text-primary)] mb-2">หมวดหมู่ที่เข้าร่วม</legend>
            {dynamicCategories.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">ยังไม่มีหมวดหมู่ในระบบ</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {dynamicCategories.map((cat) => {
                  const on = selectedCats.includes(cat.name);
                  return (
                    <button
                      key={cat.id || cat.name}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleCat(cat.name)}
                      className={`min-h-11 px-4 rounded-full text-sm font-medium border outline-none focus-visible:shadow-[var(--focus-ring)] ${on
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-soft-fg)] border-[var(--accent)]'
                        : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-strong)] hover:bg-[var(--bg-hover)]'}`}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>
        </div>
      </Section>

      <Section title="คอมโบ เค้ก + เครื่องดื่ม" description="ลูกค้าสั่งเค้กและเครื่องดื่มในออเดอร์เดียว ระบบลดราคาให้อัตโนมัติ (ทั้งหน้า POS และหน้า QR ลูกค้า)">
        <div className="flex flex-col gap-4">
          <Toggle label="เปิดใช้งานส่วนลดคอมโบ" checked={draft.comboEnabled} onChange={(v) => patch({ comboEnabled: v })} />
          <Input label="ส่วนลดคอมโบ" type="number" inputMode="decimal" min={0} max={100} suffix="%" inputClassName="num" placeholder="10" className="sm:max-w-xs"
            value={draft.comboPercent} onChange={(e) => patch({ comboPercent: e.target.value })} />
        </div>
      </Section>

      <Section title="ส่วนลดเมื่อสั่งครบยอด (หน้า QR)" description={'สั่งครบยอดที่กำหนด รับส่วนลดทันที และมีข้อความกระตุ้น "สั่งอีก ฿X รับส่วนลด Y%" บนหน้า QR · ใส่ 0 = ปิด'}>
        <div className="grid grid-cols-2 gap-3">
          <Input label="สั่งครบ" type="number" inputMode="decimal" suffix="บาท" inputClassName="num" placeholder="0"
            value={draft.spendThreshold} onChange={(e) => patch({ spendThreshold: e.target.value })} />
          <Input label="ลด" type="number" inputMode="decimal" suffix="%" inputClassName="num" placeholder="0"
            value={draft.spendDiscount} onChange={(e) => patch({ spendDiscount: e.target.value })} />
        </div>
      </Section>

      <Section title="ส่วนลดแก้วส่วนตัว" description="ลดให้ลูกค้าที่นำแก้วมาเอง (ปุ่ม &quot;แก้วตัวเอง&quot; ที่หน้าขาย)">
        <Input label="ส่วนลดต่อบิล" type="number" inputMode="decimal" suffix="บาท" inputClassName="num" className="sm:max-w-xs"
          value={draft.ownGlassDiscount} onChange={(e) => patch({ ownGlassDiscount: e.target.value })} />
      </Section>

      <Section title="ลิงก์รีวิวร้าน" description="วางลิงก์ Google / Facebook / LINE ให้ลูกค้ากดรีวิวท้ายออเดอร์ และใช้สร้าง QR บนใบเสร็จ">
        <Input type="url" inputMode="url" placeholder="https://g.page/..." label="ลิงก์รีวิว"
          value={draft.reviewUrl} onChange={(e) => patch({ reviewUrl: e.target.value })} />
      </Section>

      <SaveBar dirty={dirty} onSave={onSave} />
    </div>
  );
}
