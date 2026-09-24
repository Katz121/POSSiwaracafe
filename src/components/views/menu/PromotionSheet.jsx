import { Sparkles, RefreshCcw, CheckCircle2, Trash2, Edit } from 'lucide-react';
import { Banner, Button, Input, Textarea, SegmentedControl, Sheet, Spinner } from '../../ui';

/**
 * โปรโมชั่น · AI ideas or a manual promotion. Applying sets the app-wide
 * `activePromotion` (same handlers as v1, passed in from MenuManageView).
 */
export default function PromotionSheet({
  open, onClose, mode, setMode,
  ideas, isGenerating, onGenerate, onSelectIdea,
  manualPromo, setManualPromo, onApplyManual,
  activePromotion, onCancelActive,
}) {
  return (
    <Sheet open={open} onClose={onClose} title="โปรโมชั่น" description="ให้ AI คิดโปรที่ไม่กินกำไร หรือสร้างเอง" width={640}>
      <div className="flex flex-col gap-5">
        {activePromotion && (
          <Banner
            tone="ok"
            title={`ใช้อยู่ตอนนี้: ${activePromotion.title}${activePromotion.discountPercent ? ` · ลด ${activePromotion.discountPercent}%` : ''}`}
            action={{ label: 'ยกเลิกโปร', onClick: onCancelActive }}
          >
            {activePromotion.description || null}
          </Banner>
        )}

        <SegmentedControl
          ariaLabel="วิธีสร้างโปรโมชั่น"
          fullWidth
          value={mode}
          onChange={setMode}
          options={[
            { value: 'ai', label: 'AI คิดให้', icon: <Sparkles size={16} /> },
            { value: 'manual', label: 'สร้างเอง', icon: <Edit size={16} /> },
          ]}
        />

        {mode === 'ai' && (
          isGenerating ? (
            <div className="py-14 flex flex-col items-center gap-3 text-[var(--text-secondary)]">
              <Spinner size="lg" />
              <p>AI กำลังคิดโปรโมชั่นให้...</p>
            </div>
          ) : ideas.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-4 text-center">
              <Sparkles size={40} className="text-[var(--accent-ai)]" aria-hidden="true" />
              <p className="text-[var(--text-secondary)]">AI ดูยอดขายและรายจ่ายเดือนนี้ แล้วเสนอ 3 โปรที่รักษากำไร</p>
              <Button variant="ai" size="lg" leftIcon={<Sparkles size={18} />} onClick={onGenerate}>เริ่มคิดโปรโมชั่น</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {ideas.map((idea, idx) => (
                <article key={idx} className="rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-surface)] p-4 flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <span className="num shrink-0 w-8 h-8 rounded-full bg-[var(--bg-sunken)] text-[var(--text-secondary)] flex items-center justify-center text-sm font-semibold">{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-[var(--text-primary)]">{idea.title}</h3>
                      <p className="text-sm leading-[var(--lh-sm)] text-[var(--text-secondary)] mt-1">{idea.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {idea.code
                      ? <span className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] px-3 py-1.5 text-sm">โค้ด <strong className="font-semibold">{idea.code}</strong></span>
                      : <span />}
                    <Button leftIcon={<CheckCircle2 size={18} />} onClick={() => onSelectIdea(idea)}>ใช้โปรโมชั่นนี้</Button>
                  </div>
                </article>
              ))}
              <Button variant="ghost" leftIcon={<RefreshCcw size={18} />} onClick={onGenerate} className="self-center">ลองคิดใหม่</Button>
            </div>
          )
        )}

        {mode === 'manual' && (
          <div className="flex flex-col gap-4">
            <Input label="ชื่อโปรโมชั่น" required value={manualPromo.title} placeholder="เช่น ลด 20% ทุกเมนู, ซื้อ 2 แถม 1" onChange={(e) => setManualPromo({ ...manualPromo, title: e.target.value })} />
            <Textarea label="รายละเอียด" rows={3} value={manualPromo.description} placeholder="รายละเอียดเพิ่มเติมของโปรโมชั่น..." onChange={(e) => setManualPromo({ ...manualPromo, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="โค้ดโปรโมชั่น" value={manualPromo.code} placeholder="เช่น SAVE20" onChange={(e) => setManualPromo({ ...manualPromo, code: e.target.value.toUpperCase() })} />
              <Input
                label="ส่วนลด (%)"
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                value={manualPromo.discountPercent}
                placeholder="0"
                onChange={(e) => setManualPromo({ ...manualPromo, discountPercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
              />
            </div>
            {manualPromo.title && (
              <div className="rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-sunken)] p-4">
                <p className="text-sm text-[var(--text-muted)] mb-1">ตัวอย่าง</p>
                <p className="text-lg font-semibold text-[var(--text-primary)]">{manualPromo.title}</p>
                {manualPromo.description && <p className="text-sm text-[var(--text-secondary)] mt-1">{manualPromo.description}</p>}
                <div className="flex flex-wrap gap-2 mt-3">
                  {manualPromo.code && <span className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] px-3 py-1 text-sm">โค้ด {manualPromo.code}</span>}
                  {manualPromo.discountPercent > 0 && <span className="rounded-[var(--radius-sm)] bg-[var(--accent-soft)] text-[var(--accent-soft-fg)] px-3 py-1 text-sm font-semibold">ลด {manualPromo.discountPercent}%</span>}
                </div>
              </div>
            )}
            <Button size="lg" leftIcon={<CheckCircle2 size={18} />} disabled={!manualPromo.title.trim()} onClick={onApplyManual}>ใช้โปรโมชั่นนี้</Button>
          </div>
        )}

        {activePromotion && mode === 'ai' && ideas.length > 0 && (
          <Button variant="ghost" className="self-center text-[var(--state-danger)]" leftIcon={<Trash2 size={18} />} onClick={onCancelActive}>ยกเลิกโปรโมชั่นที่ใช้อยู่</Button>
        )}
      </div>
    </Sheet>
  );
}
