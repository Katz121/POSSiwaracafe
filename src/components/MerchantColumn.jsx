import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Edit3, Utensils, CloudOff } from 'lucide-react';

export default function MerchantColumn({ title, color, status, orders, onUpdate, onCancel, onEdit }) {
  const filtered = (orders || [])
    .filter(o => o.status === status)
    .sort((a, b) => (Number(a.queueNumber) || 0) - (Number(b.queueNumber) || 0));
  
  const nextStatusMap = { pending: 'preparing', preparing: 'ready', ready: 'completed' };
  const statusLabelMap = { pending: 'เริ่มปรุง', preparing: 'เสร็จแล้ว', ready: 'ส่งงาน/เช็คบิล' };

  return (
    <div className="w-80 lg:w-96 shrink-0 flex flex-col gap-4 bg-[#111827]/50 rounded-[var(--radius)] p-4 border border-[#1f2937] shadow-[var(--elev-1)]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1f2937]/50 pb-4 text-[#9ca3af]">
        <div className="flex items-center gap-2 text-xs font-medium tracking-widest">
          <div className={`w-3 h-3 rounded-full ${color} animate-pulse shadow-sm`}></div>
          {String(title)}
        </div>
        <span className="num bg-[#1f2937] text-emerald-400 px-3 py-1 rounded-[var(--radius-sm)] text-xs font-medium border border-[#374151]">{filtered.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-hide text-[#e5e7eb]">
        <AnimatePresence>
        {filtered.map(order => (
          <motion.div
            key={order.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="bg-[#1f2937] border border-[#374151] rounded-[var(--radius)] overflow-hidden shadow-[var(--elev-1)] relative"
          >
            <div className={`absolute top-0 left-0 px-4 py-2 text-xs font-medium rounded-br-[var(--radius-sm)] z-20 ${order.isPaid ? 'bg-emerald-500 text-white' : 'bg-orange-500 text-white animate-pulse'}`}>
              {order.isPaid ? 'จ่ายแล้ว' : 'ยังไม่จ่าย'}
            </div>
            <div className="num absolute top-0 right-0 w-14 h-14 bg-emerald-500 flex items-center justify-center text-white font-bold text-2xl rounded-bl-[var(--radius-sm)] shadow-[var(--elev-2)] z-20">{Number(order.queueNumber)}</div>
            <div className="p-4 border-b border-[#374151] bg-[#1f2937]/80 pt-12">
              <div className="flex justify-between items-start mb-2 text-[#6b7280]">
                <span className="font-semibold text-xs leading-none">#{String(order.id).slice(-4).toUpperCase()}</span>
                <button onClick={() => onEdit(order)} aria-label="แก้ไขออเดอร์" className="bg-white/5 hover:bg-emerald-500/20 text-[#9ca3af] hover:text-emerald-400 p-2 rounded-[var(--radius-sm)] transition-all border border-white/5 active:scale-90"><Edit3 size={16} /></button>
              </div>
              <div className="flex items-center gap-2 text-white font-semibold text-xl"><Utensils size={18} className="text-emerald-400" />{String(order.table || 'Walk-in')}</div>
              {order.memberNickname && <p className="text-emerald-400 text-xs font-medium mt-2 tracking-wide">👤 {order.memberNickname}</p>}
            </div>
            <div className="p-4 space-y-3 min-h-[80px] bg-[#111827]/20">
              {(order.items || []).map((item, idx) => (
                <div key={idx} className="flex flex-col border-b border-[#374151]/50 pb-3 last:border-0 leading-tight">
                  <div className="flex justify-between items-start text-base">
                    <span className="font-semibold flex-1 pr-2">{String(item.name)}</span>
                    <span className="num text-emerald-400 font-bold ml-3 shrink-0 text-lg">x{Number(item.quantity)}</span>
                  </div>
                  {item.note && <p className="text-xs text-orange-400 font-bold mt-2 bg-orange-400/5 p-2 rounded-lg border border-orange-400/10">📍 {String(item.note)}</p>}
                </div>
              ))}
            </div>
            <div className="p-4 bg-[#111827]/50 flex flex-col gap-4">
              {/* A write that reached the local cache but not the server yet. If this
                  sticks around, the change is NOT saved and can still be rolled back. */}
              {order.hasPendingWrites && (
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-[var(--radius-sm)] px-4 py-2 text-xs font-medium tracking-wider">
                  <CloudOff size={14} className="shrink-0 animate-pulse" />
                  ยังบันทึกไม่สำเร็จ
                </div>
              )}
              <div className="flex justify-between text-xs border-t border-[#374151] pt-4 font-semibold">
                <span className="text-[#6b7280]"><Clock size={12} className="inline mr-1" /> {String(order.time)}</span>
                <div className="num text-right text-[#e5e7eb] font-bold text-lg">฿{Number(order.total || 0).toLocaleString()}</div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => onCancel(order.id)} className="flex-1 py-4 rounded-[var(--radius-sm)] text-xs font-medium text-red-400 border border-red-900/30 hover:bg-red-500 hover:text-white transition-all active:scale-95">ลบ</button>
                <button onClick={() => onUpdate(order.id, nextStatusMap[status])} className={`flex-[3] py-4 rounded-[var(--radius-sm)] text-sm font-semibold text-white shadow-[var(--elev-2)] transition-all active:scale-95 ${status === 'pending' ? 'bg-orange-600' : status === 'preparing' ? 'bg-blue-600' : 'bg-emerald-600'}`}>{String(statusLabelMap[status])}</button>
              </div>
            </div>
          </motion.div>
        ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
