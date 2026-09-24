import React from 'react';
import { X, QrCode } from 'lucide-react';
import { formatBaht } from '../utils/format';

/**
 * ป้ายเตือน "มีออเดอร์ QR เข้ามา" · ลอยกลางจอด้านบนทุกหน้าของแอป
 *
 * แทนที่จะพึ่งข้อความไลน์อย่างเดียว (แพ็กฟรีมี 300 ข้อความ/เดือน กลุ่ม 3 คน =
 * 3 ครั้งต่อออเดอร์) ตัวนี้เตือนในเครื่องล้วน ไม่กินโควตา และเด้งเร็วกว่าเพราะ
 * มาจาก Firestore listener ตรงๆ ไม่ต้องวิ่งอ้อม worker
 *
 * UX v2: ปุ่มกระดิ่งมุมขวาบนถูกเอาออก (เคยทับปุ่มของหัวหน้าจอทุกหน้า) ·
 * ปุ่มเปิด/ปิดเสียงย้ายไปอยู่ท้ายแถบเมนูข้าง และในชีต "เมนู" บนมือถือ
 * App เรียก useNewQrOrderAlert ครั้งเดียวแล้วส่ง state มาที่นี่ + ปุ่มเสียงในเมนู
 */
export default function NewOrderAlert({ alerts = [], dismiss, dismissAll }) {
  if (alerts.length === 0) return null;

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[var(--z-toast)] w-[min(92vw,26rem)] flex flex-col gap-2"
      style={{ top: 'calc(var(--space-4) + env(safe-area-inset-top))' }}
      role="status"
      aria-live="polite"
    >
      {alerts.map((o) => (
        <div
          key={o.id}
          className="bg-[var(--state-warn)] text-[var(--text-on-warn)] rounded-[var(--radius)] shadow-[var(--elev-3)] px-4 py-3 flex items-center gap-3 animate-bounce-once"
        >
          <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-black/15 flex items-center justify-center shrink-0">
            <QrCode size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm leading-snug">
              ออเดอร์ใหม่จาก QR · คิว {o.queueNumber}
            </p>
            <p className="text-xs leading-snug opacity-90 truncate">
              {o.customerName || 'ไม่ระบุชื่อ'} ·{' '}
              {(o.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0)} รายการ ·{' '}
              <span className="num">{formatBaht(o.total)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => dismiss?.(o.id)}
            aria-label="ปิดการแจ้งเตือน"
            className="shrink-0 w-10 h-10 rounded-[var(--radius-sm)] bg-black/15 flex items-center justify-center active:scale-95"
          >
            <X size={16} />
          </button>
        </div>
      ))}
      {alerts.length > 1 && (
        <button
          type="button"
          onClick={dismissAll}
          className="self-center text-xs font-semibold text-[var(--text-on-inverse)] bg-[var(--surface-inverse)] px-3 min-h-9 rounded-full"
        >
          ปิดทั้งหมด ({alerts.length})
        </button>
      )}
    </div>
  );
}
