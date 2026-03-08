import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Edit3, Utensils } from 'lucide-react';

export default function MerchantColumn({ title, color, status, orders, onUpdate, onCancel, onEdit }) {
  const filtered = (orders || [])
    .filter(o => o.status === status)
    .sort((a, b) => (Number(a.queueNumber) || 0) - (Number(b.queueNumber) || 0));
  
  const nextStatusMap = { pending: 'preparing', preparing: 'ready', ready: 'completed' };
  const statusLabelMap = { pending: 'เริ่มปรุง', preparing: 'เสร็จแล้ว', ready: 'ส่งงาน/เช็คบิล' };

  return (
    <div className="w-80 lg:w-96 shrink-0 flex flex-col gap-4 bg-gray-900/50 rounded-[2.5rem] p-4 border border-gray-800 shadow-2xl">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800/50 pb-4 text-gray-400">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest">
          <div className={`w-3 h-3 rounded-full ${color} animate-pulse shadow-sm`}></div>
          {String(title)}
        </div>
        <span className="bg-gray-800 text-emerald-400 px-3 py-1 rounded-full text-xs font-black border border-gray-700">{filtered.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-5 pr-1 scrollbar-hide text-gray-200">
        <AnimatePresence>
        {filtered.map(order => (
          <motion.div
            key={order.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="bg-gray-800 border border-gray-700 rounded-[2rem] overflow-hidden shadow-xl relative"
          >
            <div className={`absolute top-0 left-0 px-4 py-2 text-xs font-black uppercase rounded-br-2xl z-20 ${order.isPaid ? 'bg-emerald-500 text-white' : 'bg-orange-500 text-white animate-pulse'}`}>
              {order.isPaid ? 'จ่ายแล้ว' : 'ยังไม่จ่าย'}
            </div>
            <div className="absolute top-0 right-0 w-14 h-14 bg-emerald-500 flex items-center justify-center text-white font-black text-2xl rounded-bl-3xl shadow-lg z-20">{Number(order.queueNumber)}</div>
            <div className="p-5 border-b border-gray-700 bg-gray-800/80 pt-12">
              <div className="flex justify-between items-start mb-2 text-gray-500">
                <span className="font-bold text-xs uppercase leading-none">#{String(order.id).slice(-4).toUpperCase()}</span>
                <button onClick={() => onEdit(order)} aria-label="แก้ไขออเดอร์" className="bg-white/5 hover:bg-emerald-500/20 text-gray-400 hover:text-emerald-400 p-2.5 rounded-2xl transition-all border border-white/5 active:scale-90"><Edit3 size={16} /></button>
              </div>
              <div className="flex items-center gap-2 text-white font-black text-xl"><Utensils size={18} className="text-emerald-400" />{String(order.table || 'Walk-in')}</div>
              {order.memberNickname && <p className="text-emerald-400 text-xs font-black mt-2 uppercase tracking-wide">👤 {order.memberNickname}</p>}
            </div>
            <div className="p-5 space-y-3 min-h-[80px] bg-gray-900/20">
              {(order.items || []).map((item, idx) => (
                <div key={idx} className="flex flex-col border-b border-gray-700/50 pb-3 last:border-0 leading-tight">
                  <div className="flex justify-between items-start text-base">
                    <span className="font-black flex-1 pr-2">{String(item.name)}</span>
                    <span className="text-emerald-400 font-black ml-3 shrink-0 text-lg">x{Number(item.quantity)}</span>
                  </div>
                  {item.note && <p className="text-xs text-orange-400 font-bold mt-2 bg-orange-400/5 p-2 rounded-lg border border-orange-400/10">📍 {String(item.note)}</p>}
                </div>
              ))}
            </div>
            <div className="p-5 bg-gray-900/50 flex flex-col gap-4">
              <div className="flex justify-between text-xs border-t border-gray-700 pt-4 font-bold">
                <span className="uppercase text-gray-500"><Clock size={12} className="inline mr-1" /> {String(order.time)}</span>
                <div className="text-right text-gray-200 font-black text-lg">฿{Number(order.total || 0).toLocaleString()}</div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => onCancel(order.id)} className="flex-1 py-4 rounded-2xl text-xs font-black text-red-400 border border-red-900/30 hover:bg-red-500 hover:text-white transition-all uppercase active:scale-95">ลบ</button>
                <button onClick={() => onUpdate(order.id, nextStatusMap[status])} className={`flex-[3] py-4 rounded-2xl text-sm font-black text-white shadow-lg transition-all active:scale-95 ${status === 'pending' ? 'bg-orange-600' : status === 'preparing' ? 'bg-blue-600' : 'bg-emerald-600'}`}>{String(statusLabelMap[status])}</button>
              </div>
            </div>
          </motion.div>
        ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
