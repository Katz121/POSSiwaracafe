import { Download, History, RefreshCcw, RotateCcw, Save, TrendingUp } from 'lucide-react';
import { Button, Input, ListRow } from '../../ui';
import { Section } from './controls';

/** "ข้อมูล" · export, backup, recompute, backdated sale, then a separate danger zone. */
export default function DataTab({
  onExportExcel, onBackupJson, onBackfill, isBackfilling,
  backdatedSale, onBackdatedSale, onSubmitBackdated,
  onResetQueue, onSeed,
}) {
  return (
    <div className="flex flex-col gap-5">
      <Section title="ส่งออกและสำรองข้อมูล">
        <div className="-mx-6 -mb-6 flex flex-col overflow-hidden rounded-b-[var(--radius)]">
          <ListRow
            leading={<Download size={20} className="text-[var(--accent)]" />}
            title="รายงาน Excel"
            subtitle="ภาพรวม รายการขาย เมนู รายจ่าย สมาชิก สต็อก ทั้งหมด"
            onClick={onExportExcel}
          />
          <ListRow
            leading={<Save size={20} className="text-[var(--accent)]" />}
            title="สำรองข้อมูล (JSON)"
            subtitle="ดาวน์โหลดไฟล์สำรองของทุกข้อมูลในร้าน"
            onClick={onBackupJson}
          />
          <ListRow
            leading={<TrendingUp size={20} className="text-[var(--accent)]" />}
            title={isBackfilling ? 'กำลังคำนวณ…' : 'คำนวณยอดขายย้อนหลัง'}
            subtitle="นับจำนวนขายของทุกเมนูใหม่จากบิลทั้งหมด (ใช้จัดอันดับขายดี)"
            onClick={onBackfill}
            disabled={isBackfilling}
          />
        </div>
      </Section>

      <Section title="บันทึกยอดขายย้อนหลัง" description="เพิ่มยอดขายที่ไม่ได้บันทึกผ่านหน้าขาย (บันทึกเป็นบิลที่จ่ายแล้ว)">
        <form onSubmit={onSubmitBackdated} className="flex flex-col gap-4">
          <Input
            label="รายการขาย / ชื่อสินค้า"
            required
            value={backdatedSale.title}
            onChange={(e) => onBackdatedSale({ ...backdatedSale, title: e.target.value })}
            placeholder="เช่น ยอดขายเงินสด, ชานมไข่มุก"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="ยอดเงิน"
              type="number"
              inputMode="decimal"
              required
              suffix="บาท"
              inputClassName="num"
              value={backdatedSale.amount}
              onChange={(e) => onBackdatedSale({ ...backdatedSale, amount: e.target.value })}
              placeholder="0"
            />
            <Input
              label="วันที่ขาย"
              type="date"
              required
              inputClassName="num"
              value={backdatedSale.date}
              onChange={(e) => onBackdatedSale({ ...backdatedSale, date: e.target.value })}
            />
          </div>
          <Input
            label="หมายเหตุ (ไม่บังคับ)"
            value={backdatedSale.note}
            onChange={(e) => onBackdatedSale({ ...backdatedSale, note: e.target.value })}
            placeholder="รายละเอียดเพิ่มเติม"
          />
          <Button type="submit" leftIcon={<History size={18} />} className="self-end">บันทึกยอดขายย้อนหลัง</Button>
        </form>
      </Section>

      <Section danger title="โซนอันตราย" description="ทำแล้วย้อนกลับไม่ได้ · ทุกปุ่มถามยืนยันก่อน">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] p-4">
            <div className="min-w-0">
              <p className="font-semibold text-[var(--text-primary)]">ล้างคิว เริ่มรอบวันใหม่</p>
              <p className="text-sm text-[var(--text-muted)]">ลบออเดอร์ที่ค้างของวันนี้ และคิวกลับไปเริ่มที่ #1 · ประวัติขายและสต็อกไม่หาย</p>
            </div>
            <Button variant="outline-danger" leftIcon={<RefreshCcw size={18} />} onClick={onResetQueue}>ล้างคิว</Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] p-4">
            <div className="min-w-0">
              <p className="font-semibold text-[var(--text-primary)]">กู้คืนข้อมูลเริ่มต้น</p>
              <p className="text-sm text-[var(--text-muted)]">เพิ่มเมนูและสต็อกตั้งต้นเข้าไปใหม่ · ข้อมูลเก่าไม่หาย แต่จะมีรายการซ้ำเพิ่ม</p>
            </div>
            <Button variant="outline-danger" leftIcon={<RotateCcw size={18} />} onClick={onSeed}>กู้คืน</Button>
          </div>
        </div>
      </Section>
    </div>
  );
}
