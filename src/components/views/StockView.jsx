import React, { useState } from 'react';
import { ChevronLeft, Box, Plus, Minus, Edit, Trash2, Package, AlertTriangle, AlertCircle } from 'lucide-react';
import { collection, doc, updateDoc, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { useAppContext } from '../../context/AppContext';
import { getISODate } from '../../utils/calculations';
import { Button, Modal, Input, Badge, Card, EmptyState, ConfirmModal, Skeleton, useToast } from '../ui';
import { DEFAULT_STOCK_UNIT, DEFAULT_MIN_QUANTITY } from '../../config/constants';

export default function StockView() {
  const { stock, isSyncing, runDbAction, handleViewChange } = useAppContext();
  const toast = useToast();

  // Local states
  const [newStockItem, setNewStockItem] = useState({ name: '', quantity: 0, unit: DEFAULT_STOCK_UNIT, minQuantity: DEFAULT_MIN_QUANTITY, unitCost: 0 });
  const [editingStockItem, setEditingStockItem] = useState(null);
  const [showAdjustStockModal, setShowAdjustStockModal] = useState(false);
  const [stockToAdjust, setStockToAdjust] = useState(null);
  const [adjustmentInput, setAdjustmentInput] = useState({ amount: '', reason: 'waste' });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [stockToDelete, setStockToDelete] = useState(null);

  // Handlers
  const saveStockItem = async (e) => {
    e.preventDefault();
    const col = collection(db, 'artifacts', appId, 'public', 'data', 'stock');
    const data = { ...newStockItem, quantity: Number(newStockItem.quantity), minQuantity: Number(newStockItem.minQuantity), unitCost: Number(newStockItem.unitCost) || 0 };
    await runDbAction(async () => {
      if (editingStockItem) await updateDoc(doc(col, editingStockItem.id), data);
      else await addDoc(col, data);
      toast.success(editingStockItem ? 'แก้ไขสต็อกสำเร็จ' : 'เพิ่มสต็อกใหม่สำเร็จ');
      setEditingStockItem(null);
      setNewStockItem({ name: '', quantity: 0, unit: DEFAULT_STOCK_UNIT, minQuantity: DEFAULT_MIN_QUANTITY, unitCost: 0 });
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
      toast.success('ปรับปรุงสต็อกสำเร็จ');
      setShowAdjustStockModal(false);
      setStockToAdjust(null);
      setAdjustmentInput({ amount: '', reason: 'waste' });
    }, 'ปรับปรุงสต็อกไม่สำเร็จ');
  };

  return (
    <>
      <div className="h-full bg-[#f8faf9] flex flex-col animate-in fade-in duration-500 overflow-hidden text-gray-800">
        <header className="h-16 md:h-20 lg:h-24 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-4 md:px-8 lg:px-12 flex items-center justify-between shadow-sm z-10">
          <div className="flex items-center gap-2 md:gap-4 text-emerald-600 cursor-pointer" onClick={() => handleViewChange('admin')}>
            <ChevronLeft size={24} className="md:w-7 md:h-7 lg:w-8 lg:h-8" />
            <h1 className="text-base md:text-xl lg:text-2xl font-black uppercase tracking-tight text-gray-800 dark:text-white">คลังพัสดุ</h1>
          </div>
          <Button
            variant="primary"
            size="lg"
            leftIcon={<Plus size={18} />}
            onClick={() => {
              setEditingStockItem(null);
              setNewStockItem({ name: '', quantity: 0, unit: DEFAULT_STOCK_UNIT, minQuantity: DEFAULT_MIN_QUANTITY, unitCost: 0 });
            }}
          >
            เพิ่มสต็อก
          </Button>
        </header>
        <div className="flex-1 flex flex-col lg:flex-row gap-4 md:gap-6 p-4 md:p-6 lg:p-8 overflow-hidden text-gray-800">
          {/* Stock List */}
          <div className="flex-1 min-w-0 bg-white rounded-2xl md:rounded-[2.5rem] lg:rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col shadow-emerald-500/5">
            <div className="p-4 md:p-5 lg:p-6 xl:p-8 bg-gray-50/50 border-b font-black text-gray-400 text-xs md:text-xs uppercase flex justify-between px-4 md:px-6 lg:px-8 xl:px-10 tracking-[0.2em] leading-none">
              <span>รายการในสต็อกทั้งหมด ({stock.length})</span>
              {stock.some(s => Number(s.quantity) <= Number(s.minQuantity)) && (
                <span className="text-red-500 flex items-center gap-2 animate-pulse uppercase">
                  <AlertTriangle size={16} /> วัตถุดิบใกล้หมด!
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50 scrollbar-hide px-3 md:px-4 lg:px-6">
              {isSyncing && (
                <div className="py-6 px-4">
                  <Skeleton.Table rows={6} cols={4} />
                </div>
              )}
              {!isSyncing && stock.length === 0 && (
                <EmptyState
                  icon={Package}
                  title="ไม่มีข้อมูลสต็อก"
                  description="เพิ่มวัตถุดิบหรือพัสดุเพื่อเริ่มต้นใช้งาน"
                  actionLabel="เพิ่มสต็อกใหม่"
                  onAction={() => setNewStockItem({ name: '', quantity: 0, unit: DEFAULT_STOCK_UNIT, minQuantity: DEFAULT_MIN_QUANTITY, unitCost: 0 })}
                />
              )}
              {stock.map(item => (
                <div
                  key={item.id}
                  className={`p-3 md:p-4 lg:p-5 xl:p-8 flex flex-col sm:flex-row items-center gap-3 md:gap-4 lg:gap-6 xl:gap-8 group rounded-2xl md:rounded-[2rem] xl:rounded-[2.5rem] transition-all my-2 md:my-3 border shadow-sm ${Number(item.quantity) <= Number(item.minQuantity)
                      ? 'bg-red-50 border-red-100'
                      : 'bg-white border-gray-50 hover:border-emerald-100'
                    }`}
                >
                  <div
                    className={`w-14 h-14 md:w-16 md:h-16 lg:w-18 lg:h-18 xl:w-20 xl:h-20 rounded-2xl md:rounded-3xl flex items-center justify-center shadow-inner shrink-0 ${Number(item.quantity) <= Number(item.minQuantity)
                        ? 'bg-red-100 text-red-600'
                        : 'bg-emerald-50 text-emerald-600'
                      }`}
                  >
                    <Box size={24} className="md:w-7 md:h-7 lg:w-8 lg:h-8 xl:w-9 xl:h-9" />
                  </div>
                  <div className="flex-1 min-w-0 text-gray-800 text-center sm:text-left">
                    <div className="flex items-center gap-2 md:gap-3 mb-1 justify-center sm:justify-start">
                      <h3 className="font-black text-gray-800 text-base md:text-lg lg:text-xl xl:text-2xl truncate uppercase tracking-tighter leading-none">
                        {String(item.name)}
                      </h3>
                    </div>
                    <p className="text-xs md:text-xs lg:text-sm font-bold text-gray-400 uppercase tracking-wider leading-none hidden sm:block">
                      ขั้นต่ำ: {Number(item.minQuantity)} {String(item.unit)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 md:gap-6 lg:gap-8 xl:gap-12 text-gray-800">
                    <div className="text-right">
                      <p className="text-2xl md:text-3xl lg:text-4xl font-black text-gray-800 mb-1 tracking-tighter leading-none">
                        {(Number(item.quantity) || 0).toLocaleString()}
                      </p>
                      <p className="text-xs md:text-xs font-black text-gray-400 uppercase tracking-[0.2em] leading-none">
                        {String(item.unit)}
                      </p>
                    </div>
                    <div className="flex items-center bg-gray-100/50 rounded-xl md:rounded-2xl p-1 md:p-2 shadow-inner border border-gray-100">
                      <button
                        onClick={() => updateStockQuantity(item, -1)}
                        aria-label="ลดจำนวนสต็อก"
                        className="p-2 md:p-3 lg:p-4 hover:bg-red-50 text-red-400 transition-all active:scale-90"
                      >
                        <Minus size={18} className="md:w-5 md:h-5 lg:w-[22px] lg:h-[22px]" />
                      </button>
                      <div className="w-[1px] h-8 md:h-10 lg:h-12 bg-gray-200 mx-1 md:mx-2 lg:mx-3"></div>
                      <button
                        onClick={() => updateStockQuantity(item, 1)}
                        aria-label="เพิ่มจำนวนสต็อก"
                        className="p-2 md:p-3 lg:p-4 hover:bg-emerald-50 text-emerald-400 transition-all active:scale-90"
                      >
                        <Plus size={18} className="md:w-5 md:h-5 lg:w-[22px] lg:h-[22px]" />
                      </button>
                    </div>
                    <div className="flex gap-1 md:gap-2">
                      <button
                        onClick={() => {
                          setStockToAdjust(item);
                          setShowAdjustStockModal(true);
                        }}
                        className="p-2 md:p-3 lg:p-4 bg-orange-50 text-orange-500 rounded-xl md:rounded-2xl shadow-sm border border-orange-100 active:scale-90"
                        title="ตัดของเสีย"
                        aria-label="ตัดของเสีย"
                      >
                        <Trash2 size={18} className="md:w-5 md:h-5 lg:w-6 lg:h-6" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingStockItem(item);
                          setNewStockItem({
                            name: item.name || '',
                            quantity: item.quantity || 0,
                            unit: item.unit || DEFAULT_STOCK_UNIT,
                            minQuantity: item.minQuantity || DEFAULT_MIN_QUANTITY,
                            unitCost: item.unitCost || 0
                          });
                        }}
                        aria-label="แก้ไขสต็อก"
                        className="p-2 md:p-3 lg:p-4 bg-blue-50 text-blue-500 rounded-xl md:rounded-2xl shadow-sm border border-blue-100 active:scale-90"
                      >
                        <Edit size={18} className="md:w-5 md:h-5 lg:w-6 lg:h-6" />
                      </button>
                      <button
                        onClick={() => {
                          setStockToDelete(item);
                          setShowDeleteConfirm(true);
                        }}
                        aria-label="ลบสต็อก"
                        className="p-2 md:p-3 lg:p-4 bg-red-50 text-red-500 rounded-xl md:rounded-2xl shadow-sm border border-red-100 active:scale-90"
                      >
                        <Trash2 size={18} className="md:w-5 md:h-5 lg:w-6 lg:h-6" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add/Edit Form */}
          <div className="w-full lg:w-[320px] xl:w-[380px] 2xl:w-[450px] shrink-0 bg-white rounded-2xl md:rounded-[2.5rem] lg:rounded-[3rem] shadow-2xl border border-emerald-50 p-4 md:p-5 lg:p-6 xl:p-8 overflow-y-auto flex flex-col animate-in slide-in-from-right duration-500 shadow-emerald-500/10 text-gray-800 order-first lg:order-last">
            <h2 className="font-black text-base md:text-lg lg:text-xl xl:text-2xl text-gray-800 mb-4 md:mb-5 lg:mb-6 flex items-center gap-2 md:gap-3 uppercase leading-none">
              <div
                className={`p-2 md:p-2.5 lg:p-3 rounded-xl md:rounded-2xl shadow-lg ${editingStockItem ? 'bg-blue-500 shadow-blue-500/20' : 'bg-emerald-500 shadow-emerald-500/20'
                  } text-white`}
              >
                <Package size={20} className="md:w-6 md:h-6 lg:w-7 lg:h-7" />
              </div>
              {editingStockItem ? 'แก้ไขสต็อก' : 'เพิ่มสต็อกใหม่'}
            </h2>
            <form onSubmit={saveStockItem} className="space-y-4 lg:space-y-6">
              <div>
                <label className="text-xs lg:text-xs font-black text-gray-400 uppercase tracking-[0.15em] block mb-2 ml-2 leading-none">
                  ชื่อรายการพัสดุ
                </label>
                <input
                  type="text"
                  required
                  value={newStockItem.name}
                  onChange={e => setNewStockItem({ ...newStockItem, name: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl lg:rounded-2xl p-3 lg:p-4 text-sm lg:text-base font-black outline-none focus:bg-white transition-all shadow-inner leading-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 lg:gap-4">
                <div>
                  <label className="text-xs lg:text-xs font-black text-gray-400 uppercase tracking-[0.15em] block mb-2 ml-2 leading-none">
                    ต้นทุนต่อหน่วย (บาท)
                  </label>
                  <input
                    type="number"
                    required
                    value={newStockItem.unitCost}
                    onChange={e => setNewStockItem({ ...newStockItem, unitCost: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl lg:rounded-2xl p-3 lg:p-4 text-sm lg:text-base font-black outline-none transition-all shadow-inner leading-none"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-xs lg:text-xs font-black text-gray-400 uppercase tracking-[0.15em] block mb-2 ml-2 leading-none">
                    หน่วยเรียก (ชิ้น, กรัม)
                  </label>
                  <input
                    type="text"
                    required
                    value={newStockItem.unit}
                    onChange={e => setNewStockItem({ ...newStockItem, unit: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl lg:rounded-2xl p-3 lg:p-4 text-sm lg:text-base font-black outline-none transition-all shadow-inner leading-none"
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
              <Button
                type="submit"
                variant={editingStockItem ? 'primary' : 'primary'}
                size="xl"
                fullWidth
                className="!py-6 !rounded-[2rem] !mt-8"
              >
                {editingStockItem ? 'อัปเดตข้อมูลพัสดุ' : 'บันทึกเข้าคลังสินค้า'}
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Adjust Stock Modal */}
      <Modal
        isOpen={showAdjustStockModal && !!stockToAdjust}
        onClose={() => {
          setShowAdjustStockModal(false);
          setStockToAdjust(null);
        }}
        title="ตัดของเสีย / ปรับสต็อก"
        size="sm"
      >
        {stockToAdjust && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-20 h-20 bg-orange-50 dark:bg-orange-900/30 rounded-full mx-auto flex items-center justify-center text-orange-500 mb-4">
                <Trash2 size={40} />
              </div>
              <p className="text-gray-500 dark:text-gray-400 font-medium">{stockToAdjust.name}</p>
            </div>

            <Input
              type="number"
              label={`จำนวนที่ต้องการตัดออก (${stockToAdjust.unit})`}
              value={adjustmentInput.amount}
              onChange={(e) => setAdjustmentInput({ ...adjustmentInput, amount: e.target.value })}
              placeholder="0"
            />

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant={adjustmentInput.reason === 'waste' ? 'danger' : 'secondary'}
                fullWidth
                onClick={() => setAdjustmentInput({ ...adjustmentInput, reason: 'waste' })}
              >
                ของเสีย (ทิ้ง)
              </Button>
              <Button
                variant={adjustmentInput.reason === 'correction' ? 'primary' : 'secondary'}
                fullWidth
                onClick={() => setAdjustmentInput({ ...adjustmentInput, reason: 'correction' })}
              >
                ปรับปรุงยอด
              </Button>
            </div>

            {adjustmentInput.reason === 'waste' && !Number(stockToAdjust.unitCost) && (
              <Card variant="danger" padding="sm">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
                  <AlertCircle size={16} />
                  <span>คำเตือน: รายการนี้ไม่มีต้นทุน (฿0) มูลค่าของเสียจะเป็น 0</span>
                </div>
              </Card>
            )}

            <div className="grid grid-cols-2 gap-4 pt-4">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => {
                  setShowAdjustStockModal(false);
                  setStockToAdjust(null);
                }}
              >
                ยกเลิก
              </Button>
              <Button
                variant="warning"
                size="lg"
                onClick={handleAdjustStock}
                disabled={!adjustmentInput.amount}
              >
                ยืนยันการตัด
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Stock Confirm Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setStockToDelete(null); }}
        onConfirm={async () => {
          setShowDeleteConfirm(false);
          if (!stockToDelete) return;
          await runDbAction(async () => {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stock', stockToDelete.id));
          }, 'ลบสต็อกไม่สำเร็จ');
          setStockToDelete(null);
        }}
        title="ลบสต็อก"
        message={`ต้องการลบ "${stockToDelete?.name || 'สต็อก'}" ออกจากระบบใช่หรือไม่?`}
        confirmText="ลบ"
        cancelText="ยกเลิก"
        variant="danger"
      />
    </>
  );
}
