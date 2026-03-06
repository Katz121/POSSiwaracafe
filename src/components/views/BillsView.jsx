import React, { useState, useMemo } from 'react';
import { ChevronLeft, Calendar, Search, Clock, Receipt, Wallet, CreditCard, Coffee, UserCheck, X, ChevronRight } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { useAppContext } from '../../context/AppContext';
import { getISODate, getOrderDate, groupItemsByCategory } from '../../utils/calculations';
import useDebounce from '../../hooks/useDebounce';
import { Button, Badge, EmptyState, Spinner, Skeleton } from '../ui';
import { DEFAULT_OWN_GLASS_DISCOUNT, VAT_PERCENTAGE } from '../../config/constants';

export default function BillsView() {
  const {
    orders,
    menu,
    members,
    isSyncing,
    ownGlassDiscount,
    runDbAction,
    handleViewChange,
    setEditingOrderId,
    setOrderToCancel
  } = useAppContext();

  const OWN_GLASS_DISCOUNT = Number(ownGlassDiscount) || DEFAULT_OWN_GLASS_DISCOUNT;

  // Local states
  const [selectedHistoryDate, setSelectedHistoryDate] = useState(getISODate());
  const [billSearchTerm, setBillSearchTerm] = useState('');
  const [selectedBill, setSelectedBill] = useState(null);
  const [showMobileBillDetail, setShowMobileBillDetail] = useState(false);

  const debouncedBillSearchTerm = useDebounce(billSearchTerm, 200);

  // Memos
  const billsForSelectedDate = useMemo(() => {
    return orders
      .filter(o => o.status === 'completed' && getOrderDate(o) === selectedHistoryDate)
      .filter(o => debouncedBillSearchTerm === '' || String(o.queueNumber).includes(debouncedBillSearchTerm))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [orders, selectedHistoryDate, debouncedBillSearchTerm]);

  // Mobile bill selection handler
  const handleBillSelect = (bill) => {
    setSelectedBill(bill);
    setShowMobileBillDetail(true);
  };

  return (
    <div className="h-full bg-[#f8faf9] flex flex-col animate-in fade-in duration-500 overflow-hidden text-gray-800">
      {/* Responsive Header */}
      <header className="h-16 md:h-20 lg:h-24 bg-white border-b border-gray-100 px-3 md:px-6 lg:px-12 flex items-center justify-between shadow-sm z-10 gap-2">
        <div className="flex items-center gap-2 md:gap-4 text-emerald-600 cursor-pointer font-black min-w-0" onClick={() => handleViewChange('pos')}>
          <ChevronLeft size={24} className="shrink-0 md:w-8 md:h-8" />
          <h1 className="text-base md:text-xl lg:text-2xl font-black uppercase tracking-tight text-gray-800 truncate">ประวัติบิล</h1>
        </div>
        <div className="flex items-center gap-2 md:gap-4 shrink-0">
          <button onClick={() => handleViewChange('category_summary')} className="hidden sm:flex bg-emerald-600 text-white px-3 md:px-6 py-2 md:py-3 rounded-xl md:rounded-2xl text-[10px] md:text-xs font-black uppercase tracking-wider md:tracking-widest shadow-lg hover:bg-emerald-700 transition-all">
            สรุปหมวดหมู่
          </button>
          <div className="relative flex items-center bg-emerald-50 border border-emerald-100 rounded-xl md:rounded-3xl p-1 md:p-1.5 shadow-sm">
            <Calendar className="text-emerald-500 ml-2 md:ml-4 w-4 h-4 md:w-5 md:h-5" />
            <input type="date" value={selectedHistoryDate} onChange={(e) => setSelectedHistoryDate(e.target.value)} className="bg-transparent border-none py-2 md:py-3 pl-2 md:pl-3 pr-2 md:pr-6 text-xs md:text-base font-black text-emerald-700 outline-none cursor-pointer w-28 md:w-auto" />
          </div>
        </div>
      </header>

      {/* Mobile: Category Summary Button */}
      <div className="sm:hidden px-3 py-2 bg-white border-b border-gray-100">
        <button onClick={() => handleViewChange('category_summary')} className="w-full bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg">
          สรุปตามหมวดหมู่
        </button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-3 md:gap-6 lg:gap-8 p-3 md:p-6 lg:p-8 overflow-hidden">
        {/* Bills List */}
        <div className={`w-full lg:w-[400px] xl:w-[450px] bg-white rounded-2xl md:rounded-[2.5rem] lg:rounded-[3.5rem] shadow-sm border border-gray-100 flex flex-col animate-in slide-in-from-left ${showMobileBillDetail ? 'hidden lg:flex' : 'flex'}`}>
          <div className="p-4 md:p-6 lg:p-8 border-b border-gray-50 flex flex-col gap-3 md:gap-5">
            <div className="relative">
              <Search className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2 text-gray-300 w-5 h-5 md:w-[22px] md:h-[22px]" />
              <input type="text" placeholder="ค้นหาเลขคิว..." value={billSearchTerm} onChange={(e) => setBillSearchTerm(e.target.value)} className="w-full bg-gray-50 border-none rounded-xl md:rounded-2xl py-3 md:py-4 pl-12 md:pl-16 pr-4 md:pr-6 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/10 text-gray-800" />
            </div>
            <span className="text-[10px] md:text-xs font-black text-gray-400 uppercase tracking-wider md:tracking-widest px-2">บิลในระบบ ({billsForSelectedDate.length})</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50 scrollbar-hide text-gray-800 px-1 md:px-2">
            {isSyncing && (
              <div className="py-4 px-2 space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton.OrderCard key={i} />)}
              </div>
            )}
            {!isSyncing && billsForSelectedDate.length === 0 && (
              <EmptyState icon="receipt" title="ไม่มีบิลในช่วงวันที่นี้" description="ลองเลือกวันที่อื่นหรือสร้างออเดอร์ใหม่" size="sm" />
            )}
            {billsForSelectedDate.map(bill => (
              <button key={bill.id} onClick={() => handleBillSelect(bill)} className={`w-full p-4 md:p-6 lg:p-8 text-left transition-all flex items-center justify-between rounded-xl md:rounded-2xl lg:rounded-[2rem] my-0.5 md:my-1 ${selectedBill?.id === bill.id ? 'bg-emerald-50 shadow-inner' : 'hover:bg-gray-50 active:bg-gray-100'}`}>
                <div className="flex items-center gap-3 md:gap-5 min-w-0">
                  <div className={`w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 rounded-xl md:rounded-2xl flex items-center justify-center font-black text-base md:text-lg lg:text-xl shrink-0 ${selectedBill?.id === bill.id ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-gray-100 text-gray-500 shadow-sm'}`}>{Number(bill.queueNumber)}</div>
                  <div className="min-w-0">
                    <p className="font-black text-gray-800 text-sm md:text-base mb-1 md:mb-2 uppercase tracking-tighter truncate">#{String(bill.id).slice(-6).toUpperCase()}</p>
                    <p className="text-[10px] md:text-xs font-bold text-gray-400 flex items-center gap-1 md:gap-1.5 uppercase"><Clock size={10} className="md:w-3 md:h-3" /> {String(bill.time)} น.</p>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-1 md:gap-1.5">
                  <p className="font-black text-emerald-600 text-base md:text-lg lg:text-xl">฿{Number(bill.total || 0).toLocaleString()}</p>
                  <span className={`text-[8px] md:text-[10px] font-black uppercase px-2 md:px-3 py-0.5 md:py-1 rounded-full border ${bill.isPaid ? 'bg-emerald-100 text-emerald-600 border-emerald-200' : 'bg-orange-100 text-orange-600 border-orange-200'}`}>{bill.isPaid ? 'จ่ายแล้ว' : 'ค้างชำระ'}</span>
                </div>
                <ChevronRight size={16} className="text-gray-300 lg:hidden shrink-0 ml-2" />
              </button>
            ))}
          </div>
        </div>

        {/* Bill Detail - Desktop */}
        <div className={`flex-1 bg-white rounded-2xl md:rounded-[3rem] lg:rounded-[4rem] shadow-xl border border-gray-100 overflow-hidden flex-col shadow-emerald-500/5 hidden lg:flex`}>
          {selectedBill ? (
            <div className="flex flex-col h-full animate-in fade-in">
              <div className="p-6 lg:p-10 border-b border-gray-50 flex flex-col xl:flex-row justify-between items-start gap-4">
                <div className="min-w-0">
                  <h2 className="text-xl lg:text-2xl xl:text-3xl font-black text-gray-800 tracking-tighter uppercase flex items-center gap-3 lg:gap-4">
                    <Receipt className="text-emerald-500 shrink-0" size={28} /> <span className="truncate">บิล #{String(selectedBill.id).slice(-8).toUpperCase()}</span>
                  </h2>
                  <p className="text-xs lg:text-sm font-bold text-gray-400 mt-2 lg:mt-3 uppercase tracking-wider lg:tracking-widest">วันที่ {new Date(selectedHistoryDate).toLocaleDateString('th-TH', { dateStyle: 'long' })} • {String(selectedBill.time)} น.</p>

                  {(selectedBill.memberPhone || selectedBill.memberNickname) && (
                    <div className="mt-4 lg:mt-5 p-4 lg:p-5 bg-emerald-50 rounded-2xl lg:rounded-3xl border border-emerald-100 flex items-center gap-3 lg:gap-4 animate-in slide-in-from-top duration-300">
                      <div className="w-10 h-10 lg:w-12 lg:h-12 bg-white rounded-xl lg:rounded-2xl flex items-center justify-center text-emerald-500 shadow-sm border border-emerald-100/50 shrink-0">
                        <UserCheck size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] lg:text-[11px] font-black text-emerald-600 uppercase tracking-wider lg:tracking-[0.2em] mb-1">ข้อมูลลูกค้าสมาชิก</p>
                        <p className="text-sm lg:text-lg font-black text-gray-800 truncate">
                          {selectedBill.memberNickname || members.find(m => m.phone === selectedBill.memberPhone)?.name || 'ลูกค้าทั่วไป'}
                          {selectedBill.memberPhone && <span className="ml-2 lg:ml-3 text-emerald-600 font-bold opacity-70 tracking-tighter">({selectedBill.memberPhone})</span>}
                        </p>
                      </div>
                    </div>
                  )}
                  {selectedBill.bringOwnGlass && (
                    <div className="mt-3 p-2.5 lg:p-3 bg-blue-50 text-blue-600 rounded-xl lg:rounded-2xl border border-blue-100 text-[10px] lg:text-xs font-black uppercase flex items-center gap-2 w-fit">
                      <Coffee size={14} /> ส่วนลดนำแก้วมาเอง (-฿{OWN_GLASS_DISCOUNT})
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 lg:gap-4 shrink-0">
                  <button
                    onClick={async () => {
                      const newPaidStatus = !selectedBill.isPaid;
                      await runDbAction(async () => {
                        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', selectedBill.id), { isPaid: newPaidStatus });
                        setSelectedBill({ ...selectedBill, isPaid: newPaidStatus });
                      }, 'อัปเดตสถานะการชำระเงินไม่สำเร็จ');
                    }}
                    className={`px-4 lg:px-8 py-3 lg:py-4 rounded-xl lg:rounded-2xl text-xs lg:text-sm font-black transition-all border active:scale-95 shadow-sm flex items-center gap-2 ${selectedBill.isPaid ? 'bg-orange-50 text-orange-600 border-orange-100 hover:bg-orange-600 hover:text-white' : 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-600 hover:text-white'}`}
                  >
                    {selectedBill.isPaid ? <><Wallet size={16} /> <span className="hidden xl:inline">ยกเลิกชำระ</span></> : <><CreditCard size={16} /> <span className="hidden xl:inline">ชำระแล้ว</span></>}
                  </button>
                  <button onClick={() => { setEditingOrderId(selectedBill.id); handleViewChange('pos'); }} className="bg-blue-50 text-blue-600 px-4 lg:px-8 py-3 lg:py-4 rounded-xl lg:rounded-2xl text-xs lg:text-sm font-black hover:bg-blue-600 hover:text-white transition-all border border-blue-100 active:scale-95 shadow-sm">แก้ไข</button>
                  <button onClick={() => setOrderToCancel(selectedBill.id)} className="bg-red-50 text-red-600 px-4 lg:px-8 py-3 lg:py-4 rounded-xl lg:rounded-2xl text-xs lg:text-sm font-black hover:bg-red-600 hover:text-white transition-all border border-red-100 active:scale-95 shadow-sm">ลบ</button>
                  <button onClick={() => setSelectedBill(null)} className="bg-gray-50 text-gray-400 px-4 lg:px-8 py-3 lg:py-4 rounded-xl lg:rounded-2xl text-xs lg:text-sm font-black hover:bg-gray-100 border border-gray-100">ปิด</button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 lg:p-12 scrollbar-hide">
                <div className="max-w-3xl mx-auto space-y-8 lg:space-y-12">
                  <div>
                    <h3 className="text-[10px] lg:text-xs font-black text-gray-400 uppercase tracking-wider lg:tracking-[0.3em] mb-4 lg:mb-6 border-b pb-2 lg:pb-3 px-2 lg:px-4">รายการสินค้าแยกตามหมวดหมู่</h3>
                    <div className="space-y-6 lg:space-y-8 px-1 lg:px-2">
                      {Object.entries(groupItemsByCategory(selectedBill.items, menu)).map(([category, data]) => (
                        <div key={category} className="space-y-2 lg:space-y-3">
                          <div className="flex items-center justify-between px-2 lg:px-4">
                            <div className="flex items-center gap-2 lg:gap-3">
                              <div className="w-2 h-2 lg:w-3 lg:h-3 rounded-full bg-emerald-500"></div>
                              <h4 className="text-xs lg:text-sm font-black text-gray-700 uppercase tracking-wide lg:tracking-wider">{category}</h4>
                            </div>
                            <span className="text-[10px] lg:text-xs font-black text-emerald-600 bg-emerald-50 px-2 lg:px-3 py-1 lg:py-1.5 rounded-lg lg:rounded-xl border border-emerald-100">
                              {data.quantity} ชิ้น • ฿{data.total.toLocaleString()}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {data.items.map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between p-3 lg:p-5 bg-gray-50 rounded-xl lg:rounded-[2rem] border border-gray-100/50 shadow-sm group hover:bg-white transition-all">
                                <div className="flex items-center gap-3 lg:gap-5 min-w-0">
                                  <div className="w-10 h-10 lg:w-12 lg:h-12 bg-white rounded-lg lg:rounded-xl flex items-center justify-center font-black text-xs lg:text-sm text-emerald-500 shadow-sm border border-gray-100 shrink-0">x{Number(item.quantity)}</div>
                                  <div className="min-w-0">
                                    <p className="font-black text-gray-800 text-sm lg:text-lg mb-0.5 lg:mb-1 truncate">{String(item.name)}</p>
                                    <p className="text-[10px] lg:text-xs font-bold text-gray-400 uppercase tracking-tighter">฿{Number(item.price).toLocaleString()} / ชิ้น</p>
                                    {item.note && <p className="text-[10px] lg:text-[11px] text-orange-500 font-bold mt-1 lg:mt-1.5 truncate">✨ {item.note}</p>}
                                  </div>
                                </div>
                                <p className="font-black text-gray-700 text-base lg:text-xl shrink-0 ml-2">฿{(Number(item.price) * Number(item.quantity)).toLocaleString()}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-gray-900 rounded-2xl lg:rounded-[3.5rem] p-6 lg:p-12 text-white shadow-2xl relative overflow-hidden border-b-4 lg:border-b-8 border-emerald-500/20">
                    <div className="relative space-y-4 lg:space-y-5">
                      <div className="flex justify-between text-xs lg:text-base opacity-50 font-bold uppercase tracking-wider lg:tracking-widest">
                        <span>ยอดรวมก่อนส่วนลด</span>
                        <span>฿{Number(selectedBill.subtotal || 0).toLocaleString()}</span>
                      </div>
                      {Number(selectedBill.discount || 0) > 0 && (
                        <div className="flex justify-between items-start text-xs lg:text-base text-orange-400 font-black uppercase tracking-wider lg:tracking-widest">
                          <div className="flex flex-col">
                            <span>ส่วนลดทั้งหมด</span>
                            {selectedBill.promotionTitle && (
                              <span className="text-[9px] lg:text-[10px] text-orange-200 opacity-60 normal-case mb-1 flex items-center gap-1">✨ {selectedBill.promotionTitle} {selectedBill.promotionDiscountPercent > 0 && `(${selectedBill.promotionDiscountPercent}%)`}</span>
                            )}
                          </div>
                          <span>-฿{Number(selectedBill.discount).toLocaleString()}</span>
                        </div>
                      )}
                      {selectedBill.vatIncluded && (
                        <div className="flex justify-between text-xs lg:text-base text-emerald-400 font-bold uppercase tracking-wider lg:tracking-widest border-t border-white/5 pt-4 lg:pt-8">
                          <span>VAT {VAT_PERCENTAGE}%</span>
                          <span>฿{Number(selectedBill.vat || 0).toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-end border-t border-white/10 pt-6 lg:pt-10">
                        <div className="flex flex-col">
                          <span className="text-[10px] lg:text-xs font-black uppercase tracking-wider lg:tracking-[0.4em] opacity-40 mb-1.5 lg:mb-2">ยอดรวมสุทธิ</span>
                          <span className={`text-[9px] lg:text-[11px] font-black uppercase px-3 lg:px-4 py-1 lg:py-1.5 rounded-lg lg:rounded-xl w-fit ${selectedBill.isPaid ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' : 'bg-orange-500 text-white'}`}>{selectedBill.isPaid ? 'จ่ายเรียบร้อย' : 'ค้างชำระ'}</span>
                        </div>
                        <span className="text-3xl lg:text-6xl font-black tracking-tighter text-white drop-shadow-lg">฿{Number(selectedBill.total || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center opacity-20 uppercase tracking-wider lg:tracking-[0.4em] text-gray-800 p-6">
              <Receipt size={100} className="text-emerald-500 mb-6 lg:mb-8 lg:w-[140px] lg:h-[140px]" />
              <h3 className="text-lg lg:text-2xl font-black text-gray-800 text-center">เลือกบิลด้านซ้ายเพื่อดูรายละเอียด</h3>
            </div>
          )}
        </div>

        {/* Mobile Bill Detail Drawer */}
        {showMobileBillDetail && selectedBill && (
          <div className="lg:hidden fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="absolute inset-0 bg-white flex flex-col animate-in slide-in-from-right overflow-hidden">
              {/* Mobile Header */}
              <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <button onClick={() => setShowMobileBillDetail(false)} className="p-2 rounded-xl hover:bg-gray-100">
                    <ChevronLeft size={24} />
                  </button>
                  <div className="min-w-0">
                    <h2 className="text-base font-black text-gray-800 truncate">บิล #{String(selectedBill.id).slice(-6).toUpperCase()}</h2>
                    <p className="text-[10px] text-gray-400 font-bold">{String(selectedBill.time)} น.</p>
                  </div>
                </div>
                <button onClick={() => { setShowMobileBillDetail(false); setSelectedBill(null); }} className="p-2 rounded-xl hover:bg-gray-100">
                  <X size={20} />
                </button>
              </div>

              {/* Mobile Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Member Info */}
                {(selectedBill.memberPhone || selectedBill.memberNickname) && (
                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-emerald-500 shadow-sm shrink-0">
                      <UserCheck size={20} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">สมาชิก</p>
                      <p className="text-sm font-black text-gray-800 truncate">
                        {selectedBill.memberNickname || members.find(m => m.phone === selectedBill.memberPhone)?.name || 'ลูกค้าทั่วไป'}
                      </p>
                    </div>
                  </div>
                )}

                {selectedBill.bringOwnGlass && (
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 text-xs font-black uppercase flex items-center gap-2">
                    <Coffee size={14} /> นำแก้วมาเอง (-฿{OWN_GLASS_DISCOUNT})
                  </div>
                )}

                {/* Items */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider">รายการสินค้า</h3>
                  {Object.entries(groupItemsByCategory(selectedBill.items, menu)).map(([category, data]) => (
                    <div key={category} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-gray-600 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                          {category}
                        </span>
                        <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">{data.quantity} ชิ้น</span>
                      </div>
                      {data.items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center font-black text-xs text-emerald-500 shrink-0">x{Number(item.quantity)}</div>
                            <div className="min-w-0">
                              <p className="font-black text-gray-800 text-sm truncate">{String(item.name)}</p>
                              {item.note && <p className="text-[10px] text-orange-500 font-bold truncate">✨ {item.note}</p>}
                            </div>
                          </div>
                          <p className="font-black text-gray-700 text-sm shrink-0 ml-2">฿{(Number(item.price) * Number(item.quantity)).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                {/* Summary */}
                <div className="bg-gray-900 rounded-2xl p-5 text-white space-y-3">
                  <div className="flex justify-between text-xs opacity-50 font-bold">
                    <span>ยอดรวม</span>
                    <span>฿{Number(selectedBill.subtotal || 0).toLocaleString()}</span>
                  </div>
                  {Number(selectedBill.discount || 0) > 0 && (
                    <div className="flex justify-between text-xs text-orange-400 font-black">
                      <span>ส่วนลด</span>
                      <span>-฿{Number(selectedBill.discount).toLocaleString()}</span>
                    </div>
                  )}
                  {selectedBill.vatIncluded && (
                    <div className="flex justify-between text-xs text-emerald-400 font-bold border-t border-white/10 pt-3">
                      <span>VAT {VAT_PERCENTAGE}%</span>
                      <span>฿{Number(selectedBill.vat || 0).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-end border-t border-white/10 pt-4">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider opacity-40 block mb-1">ยอดสุทธิ</span>
                      <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg ${selectedBill.isPaid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500 text-white'}`}>{selectedBill.isPaid ? 'จ่ายแล้ว' : 'ค้างชำระ'}</span>
                    </div>
                    <span className="text-3xl font-black">฿{Number(selectedBill.total || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Mobile Actions */}
              <div className="p-4 bg-gray-50 border-t border-gray-100 space-y-3 shrink-0">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={async () => {
                      const newPaidStatus = !selectedBill.isPaid;
                      await runDbAction(async () => {
                        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', selectedBill.id), { isPaid: newPaidStatus });
                        setSelectedBill({ ...selectedBill, isPaid: newPaidStatus });
                      }, 'อัปเดตไม่สำเร็จ');
                    }}
                    className={`py-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 active:scale-95 transition-all ${selectedBill.isPaid ? 'bg-orange-100 text-orange-600' : 'bg-emerald-500 text-white'}`}
                  >
                    {selectedBill.isPaid ? <><Wallet size={16} /> ยกเลิกชำระ</> : <><CreditCard size={16} /> ชำระแล้ว</>}
                  </button>
                  <button onClick={() => { setEditingOrderId(selectedBill.id); handleViewChange('pos'); }} className="py-3 rounded-xl text-xs font-black bg-blue-100 text-blue-600 active:scale-95 transition-all">
                    แก้ไขข้อมูล
                  </button>
                </div>
                <button onClick={() => setOrderToCancel(selectedBill.id)} className="w-full py-3 rounded-xl text-xs font-black bg-red-100 text-red-600 active:scale-95 transition-all">
                  ลบบิลนี้
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
