import { useState } from 'react';
import { Bot, Send, History, Download, RotateCcw, Package, Tag, Banknote, Users, Settings } from 'lucide-react';
import { Sheet, Button, Spinner } from '../../ui';
import { formatNumber } from '../../../utils/format';
import { AI_OFFLINE_HINT, AI_THINKING_TEXT } from '../../../utils/museJobs';

/**
 * AI ที่ปรึกษาธุรกิจ as a Sheet (was a hand-rolled violet modal). Logic stays in
 * DashboardView; this renders the conversation, history and quick actions.
 */
export default function AiConsultantSheet({
  open,
  onClose,
  query,
  onQueryChange,
  response,
  onNewQuestion,
  isConsulting,
  aiReady = true,
  onSubmit,
  suggestions = [],
  chatHistory = [],
  onExportHistory,
  onClearHistory,
  lowStockCount = 0,
  membersCount = 0,
  onNavigate,
}) {
  const [showHistory, setShowHistory] = useState(false);
  const go = (view) => { onClose?.(); onNavigate?.(view); };

  const footer = (
    <form
      className="flex w-full items-center gap-2"
      onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}
    >
      <label htmlFor="ai-consult-input" className="sr-only">คำถามถึง AI</label>
      <input
        id="ai-consult-input"
        type="text"
        value={query}
        onChange={(e) => onQueryChange?.(e.target.value)}
        placeholder={aiReady ? 'ถามเรื่องยอดขาย กำไร หรือขอคำแนะนำ' : AI_OFFLINE_HINT}
        disabled={isConsulting || !aiReady}
        className="flex-1 min-w-0 min-h-12 px-4 rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] border border-[var(--border-strong)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus-visible:shadow-[var(--focus-ring)]"
      />
      <Button type="submit" size="lg" disabled={!query.trim() || isConsulting || !aiReady} aria-label="ส่งคำถาม" className="shrink-0">
        {isConsulting ? <Spinner size="sm" color="current" /> : <Send size={18} />}
      </Button>
    </form>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      width={560}
      title={<span className="inline-flex items-center gap-2"><Bot size={22} className="text-[var(--accent-ai)]" />AI ที่ปรึกษาธุรกิจ</span>}
      description="วิเคราะห์จากข้อมูลร้านของเดือนที่เลือก"
      footer={footer}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={showHistory ? 'secondary' : 'ghost'}
            leftIcon={<History size={16} />}
            aria-expanded={showHistory}
            onClick={() => setShowHistory((v) => !v)}
          >
            ประวัติการสนทนา ({formatNumber(chatHistory.length)})
          </Button>
        </div>

        {showHistory && (
          <div className="rounded-[var(--radius)] bg-[var(--bg-sunken)] p-3 flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" leftIcon={<Download size={16} />} onClick={onExportHistory} disabled={chatHistory.length === 0}>ส่งออก</Button>
              <Button variant="outline-danger" leftIcon={<RotateCcw size={16} />} onClick={onClearHistory} disabled={chatHistory.length === 0}>ล้างประวัติ</Button>
            </div>
            {chatHistory.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] text-center py-3">ยังไม่มีประวัติการสนทนา</p>
            ) : (
              <ul className="flex flex-col gap-2 max-h-56 overflow-y-auto">
                {chatHistory.slice(-10).reverse().map((msg, idx) => (
                  <li key={msg.id || idx} className="rounded-[var(--radius-sm)] bg-[var(--bg-surface)] p-2.5 text-sm">
                    <div className="flex items-center gap-2 mb-0.5 text-xs text-[var(--text-muted)]">
                      <span className="font-semibold text-[var(--text-secondary)]">{msg.role === 'user' ? 'คุณ' : 'AI'}</span>
                      <span className="num">{new Date(msg.timestamp).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</span>
                    </div>
                    <p className="line-clamp-2 text-[var(--text-primary)]">{msg.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {response ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-[var(--radius)] bg-[var(--bg-surface)] border border-[var(--border-color)] p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)] mb-2"><Bot size={16} className="text-[var(--accent-ai)]" />AI วิเคราะห์</p>
              <div data-ai-consult-answer className="text-[var(--text-primary)] leading-relaxed whitespace-pre-line">{response}</div>
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--text-secondary)] mb-2">ไปจัดการต่อ</p>
              <div className="flex flex-wrap gap-2">
                {lowStockCount > 0 && (
                  <Button variant="secondary" leftIcon={<Package size={16} />} onClick={() => go('stock')}>สต็อกใกล้หมด ({formatNumber(lowStockCount)})</Button>
                )}
                <Button variant="secondary" leftIcon={<Tag size={16} />} onClick={() => go('menu_manage')}>จัดการโปรโมชั่น</Button>
                <Button variant="secondary" leftIcon={<Banknote size={16} />} onClick={() => go('expenses')}>บันทึกรายจ่าย</Button>
                <Button variant="secondary" leftIcon={<Users size={16} />} onClick={() => go('members_manage')}>ดูสมาชิก ({formatNumber(membersCount)})</Button>
                <Button variant="secondary" leftIcon={<Settings size={16} />} onClick={() => go('admin')}>ตั้งค่าร้าน</Button>
              </div>
            </div>
            <Button variant="ghost" className="self-start" onClick={onNewQuestion}>ถามคำถามใหม่</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col items-center text-center py-6 text-[var(--text-secondary)]">
              <Bot size={40} className="mb-2 text-[var(--text-muted)]" />
              {isConsulting ? (
                <div className="font-medium flex items-center gap-2" data-ai-consult-thinking><Spinner size="sm" /> {AI_THINKING_TEXT}</div>
              ) : (
                <>
                  <p className="font-medium">{aiReady ? 'พร้อมวิเคราะห์ข้อมูลร้านของคุณ' : AI_OFFLINE_HINT}</p>
                  <p className="text-sm text-[var(--text-muted)]">พิมพ์คำถามด้านล่าง หรือเลือกคำถามตัวอย่าง</p>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onQueryChange?.(s)}
                  className="min-h-11 px-3.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
