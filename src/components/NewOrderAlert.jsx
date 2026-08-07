import React from 'react';
import { Bell, BellOff, X, QrCode } from 'lucide-react';
import useNewQrOrderAlert from '../hooks/useNewQrOrderAlert';

/**
 * ป้ายเตือน "มีออเดอร์ QR เข้ามา" · ลอยอยู่ทุกหน้าจอของแอป
 *
 * แทนที่จะพึ่งข้อความไลน์อย่างเดียว (แพ็กฟรีมี 300 ข้อความ/เดือน กลุ่ม 3 คน =
 * 3 ครั้งต่อออเดอร์) ตัวนี้เตือนในเครื่องล้วน ไม่กินโควตา และเด้งเร็วกว่าเพราะ
 * มาจาก Firestore listener ตรงๆ ไม่ต้องวิ่งอ้อม worker
 */
export default function NewOrderAlert({ orders }) {
  const { alerts, dismiss, dismissAll, soundOn, enableSound, disableSound } = useNewQrOrderAlert(orders);

  return (
    <>
      {/* ปุ่มเปิดเสียง · ต้องกดครั้งเดียวหลังเปิดแอป เบราว์เซอร์ไม่ยอมให้เล่นเสียงเองก่อนมีคนแตะจอ */}
      <button
        onClick={soundOn ? disableSound : enableSound}
        aria-label={soundOn ? 'ปิดเสียงแจ้งเตือนออเดอร์' : 'เปิดเสียงแจ้งเตือนออเดอร์'}
        className={`fixed top-4 right-4 z-[420] w-11 h-11 rounded-full flex items-center justify-center
          shadow-lg transition-all active:scale-95 ${
            soundOn
              ? 'bg-emerald-500 text-white'
              : 'bg-white text-gray-400 border border-gray-200 animate-pulse dark:bg-slate-800 dark:border-slate-700'
          }`}
      >
        {soundOn ? <Bell size={18} /> : <BellOff size={18} />}
      </button>

      {alerts.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[430] w-[min(92vw,26rem)] flex flex-col gap-2">
          {alerts.map((o) => (
            <div
              key={o.id}
              className="bg-orange-500 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 animate-bounce-once"
            >
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <QrCode size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-black text-sm leading-tight">
                  ออเดอร์ใหม่จาก QR · คิว {o.queueNumber}
                </p>
                <p className="text-xs text-white/85 truncate">
                  {o.customerName || 'ไม่ระบุชื่อ'} ·{' '}
                  {(o.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0)} รายการ · ฿
                  {Number(o.total || 0).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => dismiss(o.id)}
                aria-label="ปิดการแจ้งเตือน"
                className="shrink-0 w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center active:scale-95"
              >
                <X size={16} />
              </button>
            </div>
          ))}
          {alerts.length > 1 && (
            <button
              onClick={dismissAll}
              className="self-center text-xs font-bold text-white bg-black/40 px-3 py-1.5 rounded-full"
            >
              ปิดทั้งหมด ({alerts.length})
            </button>
          )}
        </div>
      )}
    </>
  );
}
