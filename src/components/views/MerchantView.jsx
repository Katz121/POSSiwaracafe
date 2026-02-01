import React, { useMemo } from 'react';
import { ChefHat } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { getISODate, getOrderDate } from '../../utils/calculations';
import MerchantColumn from '../MerchantColumn';

export default function MerchantView() {
  const {
    orders,
    queueCounter,
    updateStatus,
    setOrderToCancel,
    startEditOrder
  } = useAppContext();

  const todayISO = getISODate();
  const todayRevenue = useMemo(() => {
    return orders
      .filter(o => o.status === 'completed' && getOrderDate(o) === todayISO)
      .reduce((s, o) => s + (Number(o.total) || 0), 0);
  }, [orders, todayISO]);

  return (
    <div className="h-full bg-[#0a0c10] text-white flex flex-col animate-in fade-in duration-500 overflow-hidden">
      <header className="h-24 border-b border-gray-800/50 flex justify-between items-center px-12 bg-[#0d1117] shadow-2xl z-10">
        <div className="flex items-center gap-5 text-emerald-500 font-black">
          <ChefHat size={36} strokeWidth={2.5} />
          <h1 className="text-2xl font-black uppercase text-gray-100 tracking-tighter">Kitchen Monitor Pro</h1>
        </div>
        <div className="text-right flex items-center gap-12 text-gray-300">
          <div className="border-r border-gray-800 pr-12 text-right">
            <p className="text-[11px] text-gray-500 uppercase tracking-widest font-black mb-2">รายได้วันนี้</p>
            <p className="text-3xl font-black text-emerald-400 drop-shadow-md">฿{todayRevenue.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-gray-500 uppercase tracking-widest font-black mb-2">ออเดอร์ล่าสุด</p>
            <p className="text-3xl font-black text-orange-400 drop-shadow-md">#{queueCounter - 1}</p>
          </div>
        </div>
      </header>
      <div className="flex-1 flex gap-8 p-8 overflow-x-auto scrollbar-hide text-gray-800">
        <MerchantColumn
          title="รายการใหม่"
          color="bg-orange-500"
          status="pending"
          orders={orders}
          onUpdate={updateStatus}
          onCancel={(id) => setOrderToCancel(id)}
          onEdit={startEditOrder}
        />
        <MerchantColumn
          title="กำลังจัดเตรียม"
          color="bg-blue-500"
          status="preparing"
          orders={orders}
          onUpdate={updateStatus}
          onCancel={(id) => setOrderToCancel(id)}
          onEdit={startEditOrder}
        />
        <MerchantColumn
          title="พร้อมส่งมอบ"
          color="bg-emerald-500"
          status="ready"
          orders={orders}
          onUpdate={updateStatus}
          onCancel={(id) => setOrderToCancel(id)}
          onEdit={startEditOrder}
        />
      </div>
    </div>
  );
}
