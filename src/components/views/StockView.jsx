import React, { useState } from 'react';
import { ChevronLeft, Box, Plus, Minus, Edit, Trash2, Package, AlertTriangle, AlertCircle } from 'lucide-react';
import { collection, doc, updateDoc, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { useAppContext } from '../../context/AppContext';
import { getISODate } from '../../utils/calculations';

export default function StockView() {
  const { stock, isSyncing, runDbAction, handleViewChange } = useAppContext();

  // Local states
  const [newStockItem, setNewStockItem] = useState({ name: '', quantity: 0, unit: 'ชิ้น', minQuantity: 5, unitCost: 0 });
  const [editingStockItem, setEditingStockItem] = useState(null);
  const [showAdjustStockModal, setShowAdjustStockModal] = useState(false);
  const [stockToAdjust, setStockToAdjust] = useState(null);
  const [adjustmentInput, setAdjustmentInput] = useState({ amount: '', reason: 'waste' });

  // Handlers
  const saveStockItem = async (e) => {
    e.preventDefault();
    const col = collection(db, 'artifacts', appId, 'public', 'data', 'stock');
    const data = { ...newStockItem, quantity: Number(newStockItem.quantity), minQuantity: Number(newStockItem.minQuantity), unitCost: Number(newStockItem.unitCost) || 0 };
    await runDbAction(async () => {
      if (editingStockItem) await updateDoc(doc(col, editingStockItem.id), data);
      else await addDoc(col, data);
      setEditingStockItem(null);
      setNewStockItem({ name: '', quantity: 0, unit: 'ชิ้น', minQuantity: 5, unitCost: 0 });
    }, 'บันทึกสต็อกไม่สำเร็จ');
  };

  const updateStockQuantity = async (item, delta) => {
    await runDbAction(async () => {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stock', item.id), {
        quantity: Math.max(0, (Number(item.quantity) || 0) + delta)
      });
    }, 'อัปเดตสต็อกไม่สำเร็จ');
  };

  const handleAdjustStock = async () => {
    if (!stockToAdjust || !adjustmentInput.amount) return;
    const amount = Number(adjustmentInput.amount);
    await runDbAction(async () => {
      // 1. Update stock quantity
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stock', stockToAdjust.id), {
        quantity: Math.max(0, (Number(stockToAdjust.quantity) || 0) - amount)
      });
      // 2. Record as expense if it's waste
      if (adjustmentInput.reason === 'waste') {
        const costPerUnit = Number(stockToAdjust.unitCost) || 0;
        const totalLoss = costPerUnit * amount;

        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'expenses'), {
          title: `ของเสีย: ${stockToAdjust.name} (x${amount} ${stockToAdjust.unit})`,
          amount: totalLoss,
          category: 'ของเสีย (Waste)',
          date: getISODate(),
          createdAt: serverTimestamp()
        });
      }
      setShowAdjustStockModal(false);
      setStockToAdjust(null);
      setAdjustmentInput({ amount: '', reason: 'waste' });
    }, 'ปรับปรุงสต็อกไม่สำเร็จ');
  };

  return (
    <>
      <div className="h-full bg-[#f8faf9] flex flex-col animate-in fade-in duration-500 overflow-hidden text-gray-800">
        <header className="h-24 bg-white border-b border-gray-100 px-12 flex items-center justify-between shadow-sm z-10 text-gray-800">
          <div className="flex items-center gap-4 text-emerald-600 leading-none uppercase font-black" onClick={() => handleViewChange('admin')}>
            <ChevronLeft size={32} className="cursor-pointer" />
            <h1 className="text-2xl font-black uppercase tracking-tight text-gray-800">คลังพัสดุและวัตถุดิบ</h1>
          </div>
          <button
            onClick={() => {
              setEditingStockItem(null);
              setNewStockItem({ name: '', quantity: 0, unit: 'ชิ้น', minQuantity: 5, unitCost: 0 });
            }}
            className="bg-emerald-500 text-white px-10 py-4.5 rounded-2xl font-black shadow-lg border-b-4 border-emerald-700 active:scale-95 uppercase text-xs tracking-widest leading-none"
          >
            เพิ่มรายการสต็อก
          </button>
        </header>
        <div className="flex-1 flex gap-8 p-8 overflow-hidden text-gray-800">
          {/* Stock List */}
          <div className="flex-[2] bg-white rounded-[4rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col shadow-emerald-500/5">
            <div className="p-8 bg-gray-50/50 border-b font-black text-gray-400 text-xs uppercase flex justify-between px-10 tracking-[0.2em] leading-none">
              <span>รายการในสต็อกทั้งหมด ({stock.length})</span>
              {stock.some(s => Number(s.quantity) <= Number(s.minQuantity)) && (
                <span className="text-red-500 flex items-center gap-2 animate-pulse uppercase">
                  <AlertTriangle size={16} /> วัตถุดิบใกล้หมด!
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50 scrollbar-hide px-6">
              {isSyncing && (
                <div className="py-12 text-center text-xs font-black uppercase tracking-widest text-gray-400">
                  กำลังโหลดสต็อก...
                </div>
              )}
              {!isSyncing && stock.length === 0 && (
                <div className="py-12 text-center text-xs font-black uppercase tracking-widest text-gray-400">
                  ไม่มีข้อมูลสต็อก
                </div>
              )}
              {stock.map(item => (
                <div
                  key={item.id}
                  className={`p-8 flex items-center gap-8 group rounded-[2.5rem] transition-all my-3 border ${
                    Number(item.quantity) <= Number(item.minQuantity)
                      ? 'bg-red-50 border-red-100 shadow-sm'
                      : 'bg-white border-gray-50 hover:border-emerald-100'
                  }`}
                >
                  <div
                    className={`w-20 h-20 rounded-3xl flex items-center justify-center shadow-inner ${
                      Number(item.quantity) <= Number(item.minQuantity)
                        ? 'bg-red-100 text-red-600'
                        : 'bg-emerald-50 text-emerald-600'
                    }`}
                  >
                    <Box size={36} />
                  </div>
                  <div className="flex-1 min-w-0 text-gray-800">
                    <div className="flex items-center gap-4 mb-2">
                      <h3 className="font-black text-gray-800 text-2xl truncate uppercase tracking-tighter leading-none">
                        {String(item.name)}
                      </h3>
                    </div>
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest leading-none">
                      จุดสั่งซื้อขั้นต่ำที่ตั้งไว้: {Number(item.minQuantity)} {String(item.unit)}
                    </p>
                  </div>
                  <div className="flex items-center gap-12 text-gray-800">
                    <div className="text-right">
                      <p className="text-4xl font-black text-gray-800 mb-2 tracking-tighter leading-none">
                        {(Number(item.quantity) || 0).toLocaleString()}
                      </p>
                      <p className="text-xs font-black text-gray-400 uppercase tracking-[0.3em] leading-none">
                        {String(item.unit)}
                      </p>
                    </div>
                    <div className="flex items-center bg-gray-100/50 rounded-2xl p-2 shadow-inner border border-gray-100">
                      <button
                        onClick={() => updateStockQuantity(item, -1)}
                        className="p-4 hover:bg-red-50 text-red-400 transition-all active:scale-90"
                      >
                        <Minus size={22} />
                      </button>
                      <div className="w-[1.5px] h-12 bg-gray-200 mx-3"></div>
                      <button
                        onClick={() => updateStockQuantity(item, 1)}
                        className="p-4 hover:bg-emerald-50 text-emerald-400 transition-all active:scale-90"
                      >
                        <Plus size={22} />
                      </button>
                    </div>
                    <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          setStockToAdjust(item);
                          setShowAdjustStockModal(true);
                        }}
                        className="p-4 bg-orange-50 text-orange-500 rounded-2xl shadow-sm border border-orange-100 active:scale-90"
                        title="ตัดของเสีย"
                      >
                        <Trash2 size={24} />
                      </button>
                      <button
                        onClick={() => {
                          setEditingStockItem(item);
                          setNewStockItem({
                            name: item.name || '',
                            quantity: item.quantity || 0,
                            unit: item.unit || 'ชิ้น',
                            minQuantity: item.minQuantity || 5,
                            unitCost: item.unitCost || 0
                          });
                        }}
                        className="p-4 bg-blue-50 text-blue-500 rounded-2xl shadow-sm border border-blue-100 active:scale-90"
                      >
                        <Edit size={24} />
                      </button>
                      <button
                        onClick={async () => {
                          if (!window.confirm('ลบออกจากสต็อก?')) return;
                          await runDbAction(async () => {
                            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stock', item.id));
                          }, 'ลบสต็อกไม่สำเร็จ');
                        }}
                        className="p-4 bg-red-50 text-red-500 rounded-2xl shadow-sm border border-red-100 active:scale-90"
                      >
                        <Trash2 size={24} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add/Edit Form */}
          <div className="w-[500px] bg-white rounded-[4rem] shadow-2xl border border-emerald-50 p-12 overflow-y-auto flex flex-col animate-in slide-in-from-right duration-500 shadow-emerald-500/10 text-gray-800">
            <h2 className="font-black text-3xl text-gray-800 mb-12 flex items-center gap-5 uppercase leading-none">
              <div
                className={`p-4 rounded-3xl shadow-lg ${
                  editingStockItem ? 'bg-blue-500 shadow-blue-500/20' : 'bg-emerald-500 shadow-emerald-500/20'
                } text-white`}
              >
                <Package size={32} />
              </div>
              {editingStockItem ? 'แก้ไขข้อมูลสต็อก' : 'เพิ่มสต็อกใหม่'}
            </h2>
            <form onSubmit={saveStockItem} className="space-y-10">
              <div>
                <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] block mb-4 ml-3 leading-none">
                  ชื่อรายการพัสดุ
                </label>
                <input
                  type="text"
                  required
                  value={newStockItem.name}
                  onChange={e => setNewStockItem({ ...newStockItem, name: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-100 rounded-[2rem] p-6 text-base font-black outline-none focus:bg-white transition-all shadow-inner leading-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] block mb-4 ml-3 leading-none">
                    ต้นทุนต่อหน่วย (บาท)
                  </label>
                  <input
                    type="number"
                    required
                    value={newStockItem.unitCost}
                    onChange={e => setNewStockItem({ ...newStockItem, unitCost: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-100 rounded-[2rem] p-6 text-base font-black outline-none transition-all shadow-inner leading-none"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] block mb-4 ml-3 leading-none">
                    หน่วยเรียก (ชิ้น, กรัม)
                  </label>
                  <input
                    type="text"
                    required
                    value={newStockItem.unit}
                    onChange={e => setNewStockItem({ ...newStockItem, unit: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-100 rounded-[2rem] p-6 text-base font-black outline-none transition-all shadow-inner leading-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] block mb-4 ml-3 leading-none">
                    ปริมาณคงเหลือ
                  </label>
                  <input
                    type="number"
                    required
                    value={newStockItem.quantity}
                    onChange={e => setNewStockItem({ ...newStockItem, quantity: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-100 rounded-[2rem] p-6 text-base font-black outline-none transition-all shadow-inner leading-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] block mb-4 ml-3 leading-none">
                    จุดสั่งซื้อขั้นต่ำ
                  </label>
                  <input
                    type="number"
                    required
                    value={newStockItem.minQuantity}
                    onChange={e => setNewStockItem({ ...newStockItem, minQuantity: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-100 rounded-[2rem] p-6 text-base font-black outline-none transition-all shadow-inner leading-none"
                  />
                </div>
              </div>
              <button
                type="submit"
                className={`w-full py-8 rounded-[2.5rem] font-black text-white text-sm uppercase tracking-[0.3em] mt-8 border-b-8 shadow-2xl active:scale-95 transition-all leading-none ${
                  editingStockItem ? 'bg-blue-600 border-blue-800' : 'bg-emerald-600 border-emerald-800'
                }`}
              >
                {editingStockItem ? 'อัปเดตข้อมูลพัสดุ' : 'บันทึกเข้าคลังสินค้า'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Adjust Stock Modal */}
      {showAdjustStockModal && stockToAdjust && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/80 backdrop-blur-3xl p-6 animate-in fade-in text-center text-gray-900 leading-none">
          <div className="bg-white rounded-[4rem] p-12 max-w-lg w-full shadow-2xl border border-white/10 space-y-8">
            <div className="w-24 h-24 bg-orange-50 rounded-full mx-auto flex items-center justify-center text-orange-500 shadow-inner">
              <Trash2 size={48} />
            </div>
            <div>
              <h3 className="font-black text-3xl mb-2 tracking-tighter uppercase leading-none">ตัดของเสีย / ปรับสต็อก</h3>
              <p className="text-gray-400 font-bold text-sm">{stockToAdjust.name}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 text-left ml-4">
                  จำนวนที่ต้องการตัดออก ({stockToAdjust.unit})
                </label>
                <input
                  type="number"
                  value={adjustmentInput.amount}
                  onChange={(e) => setAdjustmentInput({ ...adjustmentInput, amount: e.target.value })}
                  className="w-full bg-gray-100 border-none rounded-2xl p-5 text-lg font-black outline-none focus:ring-2 focus:ring-orange-500/20"
                  placeholder="0"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setAdjustmentInput({ ...adjustmentInput, reason: 'waste' })}
                  className={`py-4 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all ${
                    adjustmentInput.reason === 'waste'
                      ? 'bg-red-500 text-white border-red-600 shadow-lg'
                      : 'bg-gray-50 text-gray-400 border-gray-100'
                  }`}
                >
                  ของเสีย (ทิ้ง)
                </button>
                <button
                  onClick={() => setAdjustmentInput({ ...adjustmentInput, reason: 'correction' })}
                  className={`py-4 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all ${
                    adjustmentInput.reason === 'correction'
                      ? 'bg-blue-500 text-white border-blue-600 shadow-lg'
                      : 'bg-gray-50 text-gray-400 border-gray-100'
                  }`}
                >
                  ปรับปรุงยอด
                </button>
              </div>

              {adjustmentInput.reason === 'waste' && !Number(stockToAdjust.unitCost) && (
                <div className="mt-3 p-3 bg-red-50 text-red-500 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                  <AlertCircle size={16} />
                  <span>คำเตือน: รายการนี้ไม่มีต้นทุน (฿0) มูลค่าของเสียจะเป็น 0</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4">
              <button
                onClick={() => {
                  setShowAdjustStockModal(false);
                  setStockToAdjust(null);
                }}
                className="py-6 bg-gray-100 rounded-[2rem] font-black uppercase text-xs tracking-widest text-gray-400 active:scale-95 transition-all"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleAdjustStock}
                disabled={!adjustmentInput.amount}
                className="py-6 bg-orange-500 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl border-b-8 border-orange-700 active:scale-95 transition-all disabled:opacity-50"
              >
                ยืนยันการตัด
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
