import { Download, RotateCcw, Trash2 } from 'lucide-react';
import { Button, Input } from '../../ui';
import { AI_OFFLINE_HINT } from '../../../utils/museJobs';
import { formatBaht, formatNumber } from '../../../utils/format';
import { NativeSelect, SaveBar, Section, Toggle } from './controls';
import { getUpsellStats } from '../../../services/upsellTracker';

const RECEIPT_FIELDS = [
  ['shopName', 'ชื่อร้าน', 'ศิวรา คาเฟ่'],
  ['shopAddress', 'ที่อยู่'],
  ['shopPhone', 'โทรศัพท์'],
  ['taxId', 'เลขผู้เสียภาษี'],
];

function Stat({ label, value }) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] px-3 py-2 min-w-0">
      <p className="text-lg font-semibold text-[var(--text-primary)] num truncate">{value}</p>
      <p className="text-xs leading-[var(--lh-xs)] text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

/** "ร้าน & ใบเสร็จ" · shop info, receipt, VAT, AI (Muse) status + usage. */
export default function ShopTab({
  draft, patch, dirty, onSave,
  vatEnabled, onToggleVat,
  aiUtils, aiStatus, onClearAICache, onExportUpsell, onResetUpsell,
}) {
  const aiStats = aiUtils?.getApiStats ? aiUtils.getApiStats() : null;
  const upsell = getUpsellStats();

  return (
    <div className="flex flex-col gap-5">
      <Section title="ข้อมูลร้านบนใบเสร็จ">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {RECEIPT_FIELDS.map(([field, label, placeholder]) => (
            <Input
              key={field}
              label={label}
              placeholder={placeholder}
              value={draft[field]}
              onChange={(e) => patch({ [field]: e.target.value })}
            />
          ))}
          <Input
            label="ข้อความเหนือ QR รีวิว"
            placeholder="สแกนรีวิวร้านให้เราหน่อยนะคะ"
            value={draft.receiptFooter}
            onChange={(e) => patch({ receiptFooter: e.target.value })}
            hint="QR สร้างจากลิงก์รีวิวในแท็บโปรโมชั่น · ถ้าไม่ใส่ลิงก์ ใบเสร็จจะแสดงแค่ข้อความ"
          />
          <NativeSelect
            label="ความกว้างกระดาษ"
            value={draft.receiptPaperWidth}
            onChange={(e) => patch({ receiptPaperWidth: Number(e.target.value) === 58 ? 58 : 80 })}
          >
            <option value={80}>80 mm</option>
            <option value={58}>58 mm</option>
          </NativeSelect>
        </div>
      </Section>

      <Section title="ภาษีมูลค่าเพิ่ม" description="เปลี่ยนแล้วมีผลทันที ไม่ต้องกดบันทึก">
        <Toggle
          label="คิด VAT ในบิล"
          description={vatEnabled ? 'เปิดอยู่ · บิลใหม่จะคิด VAT' : 'ปิดอยู่ · บิลใหม่ไม่คิด VAT'}
          checked={vatEnabled}
          onChange={onToggleVat}
        />
      </Section>

      <Section
        title="ผู้ช่วย AI"
        description="AI ทำงานผ่าน Meta Muse บนคอมที่ร้าน · ใช้ได้เฉพาะตอนเปิดคอมและรัน muse-bridge อยู่"
      >
        <p data-ai-status className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-primary)]">
          <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full ${aiStatus?.ready ? 'bg-[var(--state-ok)]' : 'bg-[var(--text-muted)]'}`} />
          <span className="font-semibold">สถานะ AI (Muse):</span>
          <span>{aiStatus?.ready ? 'ออนไลน์' : 'ออฟไลน์'}</span>
          <span className="text-[var(--text-muted)]">
            {aiStatus?.lastSeen
              ? `· ติดต่อล่าสุด ${new Date(aiStatus.lastSeen).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
              : '· ยังไม่เคยเชื่อมต่อ'}
          </span>
        </p>
        {!aiStatus?.ready && <p className="mt-1 text-sm text-[var(--text-muted)]">{AI_OFFLINE_HINT}</p>}

        {aiStats && (
          <div className="mt-5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-sm font-semibold text-[var(--text-secondary)]">การใช้งาน AI</p>
              <Button variant="ghost" leftIcon={<Trash2 size={16} />} onClick={onClearAICache}>ล้าง Cache</Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="คำขอ" value={formatNumber(aiStats.requestCount)} />
              <Stat label="เก็บ Cache" value={formatNumber(aiStats.cacheSize)} />
              <Stat label="ประวัติแชท" value={formatNumber(aiStats.chatHistoryCount)} />
              <Stat label="เรียกล่าสุด" value={aiStats.lastRequestTime || '-'} />
            </div>
          </div>
        )}

        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <p className="text-sm font-semibold text-[var(--text-secondary)]">AI แนะนำเมนูเพิ่ม (Upsell)</p>
            <div className="flex gap-1">
              <Button variant="ghost" leftIcon={<Download size={16} />} onClick={onExportUpsell}>ส่งออก</Button>
              <Button variant="ghost" leftIcon={<RotateCcw size={16} />} onClick={onResetUpsell}>ล้างสถิติ</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="แสดง" value={formatNumber(upsell.totalShown)} />
            <Stat label="ลูกค้ารับ" value={formatNumber(upsell.totalAccepted)} />
            <Stat label="อัตรารับ" value={`${upsell.conversionRate}%`} />
            <Stat label="รายได้" value={formatBaht(upsell.totalRevenue)} />
          </div>
          {upsell.topItems.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {upsell.topItems.slice(0, 3).map((item, idx) => (
                <li key={idx} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-[var(--text-secondary)] truncate">{item.name}</span>
                  <span className="font-semibold text-[var(--text-primary)] num shrink-0">{item.conversionRate}% ({item.accepted}/{item.shown})</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-sm text-[var(--text-muted)] num">
            วันนี้ แสดง {formatNumber(upsell.todayShown)} · รับ {formatNumber(upsell.todayAccepted)} · รายได้ {formatBaht(upsell.todayRevenue)}
          </p>
        </div>
      </Section>

      <SaveBar dirty={dirty} onSave={onSave} />
    </div>
  );
}
