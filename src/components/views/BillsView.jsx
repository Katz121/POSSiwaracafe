import React, { useState, useMemo } from 'react';
import { ChevronLeft, Calendar, Search, Clock, Receipt, Wallet, CreditCard, Coffee, UserCheck } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { useAppContext } from '../../context/AppContext';
import { getISODate, getOrderDate, groupItemsByCategory } from '../../utils/calculations';
import useDebounce from '../../hooks/useDebounce';

export default function BillsView() {
  const {
    orders,
    menu,
    members,
    isSyncing,
    ownGlassDiscount,
    runDbAction,
    handleViewChange,
    startEditOrder,
    setOrderToCancel
  } = useAppContext();

  const OWN_GLASS_DISCOUNT = Number(ownGlassDiscount) || 5;

  // Local states
  const [selectedHistoryDate, setSelectedHistoryDate] = useState(getISODate());
  const [billSearchTerm, setBillSearchTerm] = useState('');
  const [selectedBill, setSelectedBill] = useState(null);

  const debouncedBillSearchTerm = useDebounce(billSearchTerm, 200);

  // Memos
  const billsForSelectedDate = useMemo(() => {
    return orders
      .filter(o => o.status === 'completed' && getOrderDate(o) === selectedHistoryDate)
      .filter(o => debouncedBillSearchTerm === '' || String(o.queueNumber).includes(debouncedBillSearchTerm))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [orders, selectedHistoryDate, debouncedBillSearchTerm]);

  return (
    <div className="h-full bg-[#f8faf9] flex flex-col animate-in fade-in duration-500 overflow-hidden text-gray-800">
      <header className="h-24 bg-white border-b border-gray-100 px-12 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4 text-emerald-600 cursor-pointer font-black" onClick={() => handleViewChange('admin')}>
          <ChevronLeft size={32} />
          <h1 className="text-2xl font-black uppercase tracking-tight text-gray-800">ประวัติบิลการขาย</h1>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => handleViewChange('category_summary')} className="bg-emerald-600 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg hover:bg-emerald-700 transition-all">
            สรุปตามหมวดหมู่
          </button>
          <div className="relative flex items-center bg-emerald-50 border border-emerald-100 rounded-3xl p-1.5 shadow-sm">
            <Calendar className="text-emerald-500 ml-4" size={22} />
            <input type="date" value={selectedHistoryDate} onChange={(e) => setSelectedHistoryDate(e.target.value)} className="bg-transparent border-none py-3 pl-3 pr-6 text-base font-black text-emerald-700 outline-none cursor-pointer" />
          </div>
        </div>
      </header>
      <div className="flex-1 flex gap-8 p-8 overflow-hidden">
        {/* Bills List */}
        <div className="w-[450px] bg-white rounded-[3.5rem] shadow-sm border border-gray-100 flex flex-col animate-in slide-in-from-left">
          <div className="p-8 border-b border-gray-50 flex flex-col gap-5">
            <div className="relative">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300" size={22} />
              <input type="text" placeholder="ค้นหาเลขคิวออเดอร์..." value={billSearchTerm} onChange={(e) => setBillSearchTerm(e.target.value)} className="w-full bg-gray-50 border-none rounded-2xl py-4.5 pl-16 pr-6 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/10 text-gray-800" />
            </div>
            <span className="text-xs font-black text-gray-400 uppercase tracking-widest px-2">บิลในระบบ ({billsForSelectedDate.length})</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50 scrollbar-hide text-gray-800 px-2">
            {isSyncing && (
              <div className="py-12 text-center text-xs font-black uppercase tracking-widest text-gray-400">
                กำลังโหลดบิล...
              </div>
            )}
            {!isSyncing && billsForSelectedDate.length === 0 && (
              <div className="py-12 text-center text-xs font-black uppercase tracking-widest text-gray-400">
                ไม่มีบิลในช่วงวันที่นี้
              </div>
            )}
            {billsForSelectedDate.map(bill => (
              <button key={bill.id} onClick={() => setSelectedBill(bill)} className={`w-full p-8 text-left transition-all flex items-center justify-between rounded-[2rem] my-1 ${selectedBill?.id === bill.id ? 'bg-emerald-50 shadow-inner' : 'hover:bg-gray-50'}`}>
                <div className="flex items-center gap-5 min-w-0">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl ${selectedBill?.id === bill.id ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-gray-100 text-gray-500 shadow-sm'}`}>{Number(bill.queueNumber)}</div>
                  <div className="min-w-0">
                    <p className="font-black text-gray-800 text-base mb-2 uppercase tracking-tighter">#{String(bill.id).slice(-6).toUpperCase()}</p>
                    <p className="text-xs font-bold text-gray-400 flex items-center gap-1.5 uppercase"><Clock size={12} /> {String(bill.time)} น.</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-black text-emerald-600 text-xl mb-1.5">฿{Number(bill.total || 0).toLocaleString()}</p>
                  <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border ${bill.isPaid ? 'bg-emerald-100 text-emerald-600 border-emerald-200' : 'bg-orange-100 text-orange-600 border-orange-200'}`}>{bill.isPaid ? 'จ่ายแล้ว' : 'ค้างชำระ'}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Bill Detail */}
        <div className="flex-1 bg-white rounded-[4rem] shadow-xl border border-gray-100 overflow-hidden flex flex-col shadow-emerald-500/5">
          {selectedBill ? (
            <div className="flex flex-col h-full animate-in fade-in">
              <div className="p-10 border-b border-gray-50 flex justify-between items-start">
                <div>
                  <h2 className="text-3xl font-black text-gray-800 tracking-tighter uppercase flex items-center gap-4">
                    <Receipt className="text-emerald-500" size={32} /> บิล #{String(selectedBill.id).slice(-8).toUpperCase()}
                  </h2>
                  <p className="text-sm font-bold text-gray-400 mt-3 uppercase tracking-widest">วันที่ {new Date(selectedHistoryDate).toLocaleDateString('th-TH', { dateStyle: 'long' })} • {String(selectedBill.time)} น.</p>

                  {(selectedBill.memberPhone || selectedBill.memberNickname) && (
                    <div className="mt-5 p-5 bg-emerald-50 rounded-3xl border border-emerald-100 flex items-center gap-4 animate-in slide-in-from-top duration-300">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-500 shadow-sm border border-emerald-100/50">
                        <UserCheck size={24} />
                      </div>
                      <div>
                        <p className="text-[11px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-1">ข้อมูลลูกค้าสมาชิก</p>
                        <p className="text-lg font-black text-gray-800">
                          {selectedBill.memberNickname || members.find(m => m.phone === selectedBill.memberPhone)?.name || 'ลูกค้าทั่วไป'}
                          {selectedBill.memberPhone && <span className="ml-3 text-emerald-600 font-bold opacity-70 tracking-tighter">({selectedBill.memberPhone})</span>}
                        </p>
                      </div>
                    </div>
                  )}
                  {selectedBill.bringOwnGlass && (
                    <div className="mt-3 p-3 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100 text-xs font-black uppercase flex items-center gap-2 w-fit">
                      <Coffee size={14} /> ส่วนลดนำแก้วมาเอง (-฿{OWN_GLASS_DISCOUNT})
                    </div>
                  )}
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={async () => {
                      const newPaidStatus = !selectedBill.isPaid;
                      await runDbAction(async () => {
                        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', selectedBill.id), { isPaid: newPaidStatus });
                        setSelectedBill({ ...selectedBill, isPaid: newPaidStatus });
                      }, 'อัปเดตสถานะการชำระเงินไม่สำเร็จ');
                    }}
                    className={`px-8 py-4.5 rounded-2xl text-sm font-black transition-all border active:scale-95 shadow-sm flex items-center gap-2 ${selectedBill.isPaid ? 'bg-orange-50 text-orange-600 border-orange-100 hover:bg-orange-600 hover:text-white' : 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-600 hover:text-white'}`}
                  >
                    {selectedBill.isPaid ? <><Wallet size={18} /> ยกเลิกชำระ</> : <><CreditCard size={18} /> ชำระแล้ว</>}
                  </button>
                  <button onClick={() => startEditOrder(selectedBill)} className="bg-blue-50 text-blue-600 px-8 py-4.5 rounded-2xl text-sm font-black hover:bg-blue-600 hover:text-white transition-all border border-blue-100 active:scale-95 shadow-sm">แก้ไขข้อมูล</button>
                  <button onClick={() => setOrderToCancel(selectedBill.id)} className="bg-red-50 text-red-600 px-8 py-4.5 rounded-2xl text-sm font-black hover:bg-red-600 hover:text-white transition-all border border-red-100 active:scale-95 shadow-sm">ลบบิลนี้</button>
                  <button onClick={() => setSelectedBill(null)} className="bg-gray-50 text-gray-400 px-8 py-4.5 rounded-2xl text-sm font-black hover:bg-gray-100 border border-gray-100">ปิด</button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-12 scrollbar-hide">
                <div className="max-w-3xl mx-auto space-y-12">
                  <div>
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.3em] mb-6 border-b pb-3 px-4">รายการสินค้าแยกตามหมวดหมู่</h3>
                    <div className="space-y-8 px-2">
                      {Object.entries(groupItemsByCategory(selectedBill.items, menu)).map(([category, data]) => (
                        <div key={category} className="space-y-3">
                          <div className="flex items-center justify-between px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                              <h4 className="text-sm font-black text-gray-700 uppercase tracking-wider">{category}</h4>
                            </div>
                            <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100">
                              {data.quantity} ชิ้น • ฿{data.total.toLocaleString()}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {data.items.map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between p-5 bg-gray-50 rounded-[2rem] border border-gray-100/50 shadow-sm group hover:bg-white transition-all">
                                <div className="flex items-center gap-5">
                                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center font-black text-sm text-emerald-500 shadow-sm border border-gray-100">x{Number(item.quantity)}</div>
                                  <div>
                                    <p className="font-black text-gray-800 text-lg mb-1">{String(item.name)}</p>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-tighter">฿{Number(item.price).toLocaleString()} / ชิ้น</p>
                                    {item.note && <p className="text-[11px] text-orange-500 font-bold mt-1.5">✨ {item.note}</p>}
                                  </div>
                                </div>
                                <p className="font-black text-gray-700 text-xl">฿{(Number(item.price) * Number(item.quantity)).toLocaleString()}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-gray-900 rounded-[3.5rem] p-12 text-white shadow-2xl relative overflow-hidden border-b-8 border-emerald-500/20">
                    <div className="relative space-y-5">
                      <div className="flex justify-between text-base opacity-50 font-bold uppercase tracking-widest">
                        <span>ยอดรวมก่อนส่วนลด</span>
                        <span>฿{Number(selectedBill.subtotal || 0).toLocaleString()}</span>
                      </div>
                      {Number(selectedBill.discount || 0) > 0 && (
                        <div className="flex justify-between items-start text-base text-orange-400 font-black uppercase tracking-widest">
                          <div className="flex flex-col">
                            <span>ส่วนลดทั้งหมด</span>
                            {selectedBill.promotionTitle && (
                              <span className="text-[10px] text-orange-200 opacity-60 normal-case mb-1 flex items-center gap-1">✨ {selectedBill.promotionTitle} {selectedBill.promotionDiscountPercent > 0 && `(${selectedBill.promotionDiscountPercent}%)`}</span>
                            )}
                          </div>
                          <span>-฿{Number(selectedBill.discount).toLocaleString()}</span>
                        </div>
                      )}
                      {selectedBill.vatIncluded && (
                        <div className="flex justify-between text-base text-emerald-400 font-bold uppercase tracking-widest border-t border-white/5 pt-8">
                          <span>ภาษีมูลค่าเพิ่ม (VAT 7%)</span>
                          <span>฿{Number(selectedBill.vat || 0).toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-end border-t border-white/10 pt-10">
                        <div className="flex flex-col">
                          <span className="text-xs font-black uppercase tracking-[0.4em] opacity-40 mb-2">ยอดรวมสุทธิ</span>
                          <span className={`text-[11px] font-black uppercase px-4 py-1.5 rounded-xl w-fit ${selectedBill.isPaid ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' : 'bg-orange-500 text-white'}`}>{selectedBill.isPaid ? 'จ่ายเรียบร้อย' : 'ค้างชำระ'}</span>
                        </div>
                        <span className="text-6xl font-black tracking-tighter text-white drop-shadow-lg">฿{Number(selectedBill.total || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center opacity-20 uppercase tracking-[0.4em] text-gray-800">
              <Receipt size={140} className="text-emerald-500 mb-8" />
              <h3 className="text-2xl font-black text-gray-800">เลือกบิลด้านซ้ายเพื่อดูรายละเอียด</h3>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
