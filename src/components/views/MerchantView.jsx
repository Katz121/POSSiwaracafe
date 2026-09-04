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
    setEditingOrderId,
    handleViewChange
  } = useAppContext();

  const todayISO = getISODate();
  const todayRevenue = useMemo(() => {
    return orders
      .filter(o => o.status === 'completed' && getOrderDate(o) === todayISO)
      .reduce((s, o) => s + (Number(o.total) || 0), 0);
  }, [orders, todayISO]);

  const handleEdit = (order) => {
    setEditingOrderId(order.id);
    handleViewChange('pos');
  };

  return (
    <div className="h-full bg-[#030712] text-white flex flex-col overflow-hidden"> {/* Kitchen Display System: intentionally always dark for kitchen environments. */}
      <header className="h-16 md:h-20 lg:h-24 border-b border-[#1f2937]/50 flex justify-between items-center px-4 md:px-8 lg:px-12 bg-[#111827] shadow-[var(--elev-1)] z-[var(--z-dropdown)]">
        <div className="flex items-center gap-3 md:gap-5 text-emerald-500 font-bold">
          <ChefHat size={28} className="md:w-8 md:h-8 lg:w-9 lg:h-9" strokeWidth={2.5} />
          <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-[#f3f4f6] tracking-tighter">หน้าจอครัว</h1>
        </div>
        <div className="text-right flex items-center gap-4 md:gap-8 lg:gap-12 text-[#d1d5db]">
          <div className="border-r border-[#1f2937] pr-4 md:pr-8 lg:pr-12 text-right hidden md:block">
            <p className="text-xs md:text-xs text-[#6b7280] tracking-widest font-medium mb-1 md:mb-2">รายได้วันนี้</p>
            <p className="num text-xl md:text-2xl lg:text-3xl font-bold text-emerald-400 drop-shadow-md">฿{todayRevenue.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-xs md:text-xs text-[#6b7280] tracking-widest font-medium mb-1 md:mb-2">ออเดอร์ล่าสุด</p>
            <p className="num text-xl md:text-2xl lg:text-3xl font-bold text-orange-400 drop-shadow-md">#{Math.max(queueCounter - 1, 0)}</p>
          </div>
        </div>
      </header>
      <div className="flex-1 flex gap-3 md:gap-6 lg:gap-8 p-3 md:p-6 lg:p-8 overflow-x-auto scrollbar-hide text-[#1f2937]">
        <MerchantColumn
          title="รายการใหม่"
          color="bg-orange-500"
          status="pending"
          orders={orders}
          onUpdate={updateStatus}
          onCancel={(id) => setOrderToCancel(id)}
          onEdit={handleEdit}
        />
        <MerchantColumn
          title="กำลังจัดเตรียม"
          color="bg-blue-500"
          status="preparing"
          orders={orders}
          onUpdate={updateStatus}
          onCancel={(id) => setOrderToCancel(id)}
          onEdit={handleEdit}
        />
        <MerchantColumn
          title="พร้อมส่งมอบ"
          color="bg-emerald-500"
          status="ready"
          orders={orders}
          onUpdate={updateStatus}
          onCancel={(id) => setOrderToCancel(id)}
          onEdit={handleEdit}
        />
      </div>
    </div>
  );
}
