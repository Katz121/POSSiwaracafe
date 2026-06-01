/**
 * CustomerOrderApp — Self-service QR ordering page
 * Standalone component; does NOT import AppContext or App.jsx internals.
 * Customers scan a QR code, browse the menu, add to cart, enter their name, and submit.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingCart,
  Plus,
  Minus,
  X,
  Check,
  Search,
  ChevronDown,
  Coffee,
  AlertCircle,
  RefreshCw,
  FileText,
  Star,
} from 'lucide-react';
import {
  signInAnonymously,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  runTransaction,
  serverTimestamp,
  increment,
  setDoc,
  getDoc,
  updateDoc,
  getCountFromServer,
  query,
  where,
} from 'firebase/firestore';
import { auth, db, appId } from '../services/firebase';
import { Button, Modal, Input, Spinner, EmptyState } from '../components/ui';
import { formatCurrency, VAT_RATE, roundUpTo5 } from '../config/constants';
import { getISODate } from '../utils/calculations';
import { getItemSalePrice, cakeSaleNoteTag, getComboDiscount, COMBO_PROMO_TITLE, isCakeSaleActive, isCakeCategory } from '../utils/promotions';
import { bumpMenuSoldCount } from '../utils/menuSales';
import { notifyNewOrderToLine } from '../services/lineNotify';

// ---------------------------------------------------------------------------
// Helper: merge stock links from a menu item and a bean modifier
// ---------------------------------------------------------------------------
function mergeStockLinks(itemLinks = [], modifierLinks = []) {
  const map = {};
  [...itemLinks, ...modifierLinks].forEach((link) => {
    const key = link.stockId || link.id || link.name;
    if (map[key]) {
      map[key] = { ...map[key], quantity: (map[key].quantity || 0) + (link.quantity || 0) };
    } else {
      map[key] = { ...link };
    }
  });
  return Object.values(map);
}

// ---------------------------------------------------------------------------
// Sub-component: MenuItemCard
// ---------------------------------------------------------------------------
function MenuItemCard({ item, onAdd, settingsData, isBestSeller = false }) {
  const hasImage = Boolean(item.image);
  const sale = getItemSalePrice(item, settingsData);
  // Coffee menus display prices rounded up to the nearest 5 baht.
  const dp = (p) => (item.allowBeanModifier ? roundUpTo5(p) : p);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileTap={{ scale: 0.97 }}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col cursor-pointer active:shadow-inner"
      onClick={() => onAdd(item)}
    >
      {/* Image */}
      <div className="relative w-full aspect-[4/3] bg-emerald-50 flex items-center justify-center overflow-hidden">
        {hasImage ? (
          <img
            src={item.image}
            alt={item.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <Coffee size={36} className="text-emerald-300" strokeWidth={1.5} />
        )}
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {isBestSeller && (
            <span className="bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              🔥 ขายดี
            </span>
          )}
          {item.isFeatured && (
            <span className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              แนะนำ
            </span>
          )}
        </div>
        {sale.onSale && (
          <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
            Happy Hour -{sale.percent}%
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1 flex-1">
        <p className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2">{item.name}</p>
        {item.description && (
          <p className="text-gray-400 text-xs leading-tight line-clamp-2">{item.description}</p>
        )}
        <div className="mt-auto pt-2 flex items-center justify-between">
          {sale.onSale ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-gray-400 text-xs line-through leading-none">
                {item.allowBeanModifier ? 'เริ่มต้น ' : ''}{formatCurrency(dp(sale.originalPrice))}
              </span>
              <span className="text-red-500 font-bold text-base leading-none">
                {item.allowBeanModifier ? 'เริ่มต้น ' : ''}{formatCurrency(dp(sale.price))}
              </span>
            </div>
          ) : (
            <span className="text-emerald-600 font-bold text-base">
              {item.allowBeanModifier ? 'เริ่มต้น ' : ''}{formatCurrency(dp(item.price))}
            </span>
          )}
          <div className="w-9 h-9 bg-emerald-500 rounded-full flex items-center justify-center shadow-md">
            <Plus size={18} className="text-white" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: HighlightRail — horizontal carousel of highlighted menu items
// ---------------------------------------------------------------------------
function HighlightRail({ title, items, onAdd, settingsData, bestSellerIds }) {
  if (!items || items.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-bold text-gray-700 mb-2 px-4">{title}</h2>
      <div className="flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-hide">
        {items.map((item) => (
          <div key={item.id} className="w-40 flex-shrink-0">
            <MenuItemCard
              item={item}
              onAdd={onAdd}
              settingsData={settingsData}
              isBestSeller={bestSellerIds ? bestSellerIds.has(item.id) : true}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: BeanModifierModal — picker for bean/blend selection
// ---------------------------------------------------------------------------
function BeanModifierModal({ isOpen, item, modifiers, onSelect, onClose }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`เลือก${item?.modifierGroup || 'เมล็ดกาแฟ'}`}
      size="sm"
      footer={
        <Button variant="ghost" fullWidth onClick={onClose} className="text-gray-400">
          ยกเลิก
        </Button>
      }
    >
      {item && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">เลือก{item.modifierGroup || 'เมล็ดกาแฟ'}สำหรับ <strong>{item.name}</strong></p>
          {modifiers.map((mod) => {
            // Base beans use the menu price; others: max(menu, bean + add-on).
            // Rounded up to 5 for coffee.
            const isBaseBean = mod.isDefault || (item.baseBeanIds || []).includes(mod.id);
            const base = Number(item.price) || 0;
            const effective = roundUpTo5(isBaseBean ? base : Math.max(base, (Number(mod.price) || 0) + (Number(item.beanExtra) || 0)));
            const raisesPrice = effective > roundUpTo5(base);
            return (
              <motion.button
                key={mod.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSelect(item, mod)}
                className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-gray-100 hover:border-emerald-400 hover:bg-emerald-50 transition-all text-left min-h-[56px]"
              >
                <span className="font-semibold text-gray-800">{mod.name}</span>
                {/* Show the combined price only when this bean raises it above the menu price */}
                {raisesPrice && (
                  <span className="text-emerald-600 font-bold">{formatCurrency(effective)}</span>
                )}
              </motion.button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: CartDrawer — slide-up drawer with cart contents
// ---------------------------------------------------------------------------
function CartDrawer({ isOpen, cart, onClose, onUpdateQty, onRemove, onUpdateNote, total, onProceed }) {
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteValue, setNoteValue] = useState('');

  const startEditNote = (cartId, currentNote) => {
    setEditingNoteId(cartId);
    setNoteValue(currentNote || '');
  };

  const saveNote = (cartId) => {
    onUpdateNote(cartId, noteValue);
    setEditingNoteId(null);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: '85vh' }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h2 className="font-bold text-lg text-gray-900">รายการสั่ง</h2>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-3">
              {cart.length === 0 ? (
                <EmptyState
                  icon="cart"
                  title="ยังไม่มีรายการ"
                  description="กลับไปเพิ่มเมนูที่ต้องการ"
                  size="sm"
                />
              ) : (
                cart.map((cartItem) => {
                  const id = cartItem.cartId || cartItem.id;
                  return (
                    <div key={id} className="bg-gray-50 rounded-2xl p-3 space-y-2">
                      <div className="flex items-start gap-3">
                        {/* Name & modifier */}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-gray-900 leading-tight">{cartItem.name}</p>
                          {cartItem.beanModifier && cartItem.beanModifier !== '' && (
                            <p className="text-xs text-emerald-600 font-medium">{cartItem.beanModifier}</p>
                          )}
                          <p className="text-emerald-600 font-bold text-sm mt-0.5">
                            {formatCurrency(Number(cartItem.price) * Number(cartItem.quantity))}
                          </p>
                        </div>

                        {/* Qty controls */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => onUpdateQty(id, cartItem.quantity - 1)}
                            className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 hover:bg-red-100 hover:text-red-600 transition-colors"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="w-6 text-center font-bold text-gray-800 text-sm">
                            {cartItem.quantity}
                          </span>
                          <button
                            onClick={() => onUpdateQty(id, cartItem.quantity + 1)}
                            className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white hover:bg-emerald-600 transition-colors"
                          >
                            <Plus size={14} />
                          </button>
                        </div>

                        {/* Remove */}
                        <button
                          onClick={() => onRemove(id)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      {/* Note */}
                      {editingNoteId === id ? (
                        <div className="flex gap-2">
                          <input
                            autoFocus
                            value={noteValue}
                            onChange={(e) => setNoteValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveNote(id); }}
                            placeholder="หมายเหตุ (เช่น ไม่ใส่น้ำตาล)"
                            className="flex-1 text-xs border border-gray-200 rounded-xl px-3 py-1.5 bg-white focus:outline-none focus:border-emerald-400"
                          />
                          <button
                            onClick={() => saveNote(id)}
                            className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white flex-shrink-0"
                          >
                            <Check size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditNote(id, cartItem.note)}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-emerald-600 transition-colors"
                        >
                          <FileText size={12} />
                          <span>{cartItem.note && cartItem.note !== cartItem.beanModifier ? cartItem.note : 'เพิ่มหมายเหตุ'}</span>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer: total + proceed (always visible, never overlaps items) */}
            {cart.length > 0 && (
              <div className="flex-shrink-0 border-t border-gray-100 px-5 py-4 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-500 font-medium">ยอดรวม</span>
                  <span className="font-black text-lg text-emerald-600">{formatCurrency(total)}</span>
                </div>
                <Button variant="primary" size="lg" fullWidth onClick={onProceed}>
                  ดำเนินการต่อ
                </Button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: StickyCartBar — fixed bottom bar showing cart summary
// ---------------------------------------------------------------------------
function StickyCartBar({ cart, total, onClick }) {
  const itemCount = cart.reduce((s, i) => s + Number(i.quantity), 0);

  if (itemCount === 0) return null;

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-6 pt-2"
    >
      <button
        onClick={onClick}
        className="w-full bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white rounded-2xl flex items-center justify-between px-5 py-4 shadow-xl transition-colors"
        style={{ minHeight: 56 }}
      >
        <span className="bg-white/20 rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm">
          {itemCount}
        </span>
        <span className="font-bold text-base flex items-center gap-2">
          <ShoppingCart size={18} />
          ดูตะกร้า
        </span>
        <span className="font-bold text-base">{formatCurrency(total)}</span>
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: CheckoutStep — name input + order summary + submit
// ---------------------------------------------------------------------------
function CheckoutStep({
  cart,
  subtotal,
  vat,
  total,
  vatEnabled,
  customerName,
  onNameChange,
  onSubmit,
  onBack,
  submitting,
  submitError,
  // member / points props
  customerPhone,
  onPhoneChange,
  member,
  memberPoints,
  pointsEligible,
  usePoints,
  onTogglePoints,
  redeemPointsThreshold,
  redeemDiscountValue,
  // discount breakdown
  comboDiscount,
  pointsDiscount,
}) {
  const itemCount = cart.reduce((s, i) => s + Number(i.quantity), 0);
  const canSubmit = customerName.trim().length > 0 && itemCount > 0 && !submitting;

  return (
    <motion.div
      key="checkout"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      className="flex flex-col min-h-screen bg-gray-50"
    >
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"
        >
          <ChevronDown size={20} className="rotate-90" />
        </button>
        <h1 className="font-bold text-gray-900 text-lg">ยืนยันออเดอร์</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 pb-40">
        {/* Order items summary */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="font-bold text-gray-800">รายการที่สั่ง</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {cart.map((cartItem) => {
              const id = cartItem.cartId || cartItem.id;
              return (
                <div key={id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-800 leading-tight">{cartItem.name}</p>
                    {cartItem.beanModifier && cartItem.beanModifier !== '' && (
                      <p className="text-xs text-emerald-600">{cartItem.beanModifier}</p>
                    )}
                    {cartItem.note && cartItem.note !== cartItem.beanModifier && (
                      <p className="text-xs text-gray-400">{cartItem.note}</p>
                    )}
                  </div>
                  <span className="text-sm text-gray-500 flex-shrink-0">x{cartItem.quantity}</span>
                  <span className="font-semibold text-sm text-gray-900 flex-shrink-0">
                    {formatCurrency(Number(cartItem.price) * Number(cartItem.quantity))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Totals */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4 space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>ราคาสินค้า</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {comboDiscount > 0 && (
            <div className="flex justify-between text-sm text-red-500">
              <span>คอมโบเค้ก+เครื่องดื่ม</span>
              <span>-{formatCurrency(comboDiscount)}</span>
            </div>
          )}
          {pointsDiscount > 0 && (
            <div className="flex justify-between text-sm text-emerald-600">
              <span>ส่วนลดแต้มสมาชิก</span>
              <span>-{formatCurrency(pointsDiscount)}</span>
            </div>
          )}
          {vatEnabled && (
            <div className="flex justify-between text-sm text-gray-500">
              <span>VAT 7%</span>
              <span>{formatCurrency(vat)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base text-gray-900 pt-2 border-t border-gray-100">
            <span>ยอดรวม</span>
            <span className="text-emerald-600">{formatCurrency(total)}</span>
          </div>
        </div>

        {/* Customer name input */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4 space-y-4">
          <Input
            label="ชื่อของคุณ *"
            placeholder="กรอกชื่อเพื่อรับออเดอร์"
            value={customerName}
            onChange={(e) => onNameChange(e.target.value)}
            maxLength={60}
            autoFocus
          />
          <p className="text-xs text-gray-400 -mt-2">ชื่อนี้จะใช้เรียกออเดอร์ของคุณ</p>

          {/* Phone input for membership */}
          <div>
            <Input
              label="เบอร์โทร (สำหรับสะสมแต้ม)"
              placeholder="กรอกเบอร์โทร (ไม่บังคับ)"
              value={customerPhone}
              onChange={(e) => onPhoneChange(e.target.value)}
              inputMode="numeric"
              maxLength={10}
            />
            {/* Member status line + points progress */}
            {member ? (
              <div className="mt-1.5 space-y-0.5">
                <p className="text-xs text-emerald-600 font-medium">
                  สมาชิก: {member.name || 'ลูกค้า'} • {memberPoints} แต้ม
                </p>
                <p className="text-xs text-amber-600 font-bold">
                  {memberPoints >= redeemPointsThreshold
                    ? `🎉 ครบแล้ว! แลกส่วนลด ฿${redeemDiscountValue} ได้เลย`
                    : `อีก ${redeemPointsThreshold - memberPoints} แต้ม แลกส่วนลด ฿${redeemDiscountValue}`}
                </p>
              </div>
            ) : customerPhone.length >= 9 ? (
              <p className="text-xs text-gray-500 mt-1.5">
                เบอร์ใหม่ — ระบบจะสมัครสมาชิกให้อัตโนมัติ และเริ่มสะสมแต้ม
              </p>
            ) : null}
          </div>

          {/* Points redemption toggle */}
          {pointsEligible && (
            <motion.button
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              type="button"
              onClick={onTogglePoints}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 transition-all ${
                usePoints
                  ? 'bg-emerald-50 border-emerald-400'
                  : 'bg-gray-50 border-gray-200 hover:border-emerald-300'
              }`}
              style={{ minHeight: 44 }}
            >
              <span className={`text-sm font-semibold ${usePoints ? 'text-emerald-700' : 'text-gray-700'}`}>
                ใช้ {redeemPointsThreshold} แต้ม แลกส่วนลด ฿{redeemDiscountValue}
              </span>
              <div
                className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                  usePoints ? 'bg-emerald-500' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    usePoints ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </div>
            </motion.button>
          )}
        </div>

        {/* Error message */}
        <AnimatePresence>
          {submitError && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-red-600"
            >
              <AlertCircle size={16} />
              <span className="text-sm font-medium">{submitError}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Submit button (fixed) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-4">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={onSubmit}
          loading={submitting}
          disabled={!canSubmit}
        >
          {submitting ? 'กำลังส่งออเดอร์...' : 'ส่งออเดอร์'}
        </Button>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: SuccessScreen
// ---------------------------------------------------------------------------
function SuccessScreen({ customerName, onReset, reviewUrl, queueNumber, canEarnReviewPoints = false, onReviewClick }) {
  const hasReviewUrl = typeof reviewUrl === 'string' && reviewUrl.trim() !== '';
  const [reviewDone, setReviewDone] = useState(false);

  const handleReviewClick = () => {
    window.open(reviewUrl.trim(), '_blank', 'noopener,noreferrer');
    if (canEarnReviewPoints && !reviewDone) {
      setReviewDone(true);
      onReviewClick?.();
    }
  };

  return (
    <motion.div
      key="success"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-emerald-50 to-white px-6 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
        className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-emerald-200"
      >
        <Check size={44} className="text-white" strokeWidth={3} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="space-y-3"
      >
        <p className="text-gray-500 font-medium text-sm">ออเดอร์ของ</p>
        <h1 className="font-black text-3xl text-gray-900">{customerName}</h1>

        {queueNumber > 1 ? (
          <div className="bg-emerald-500 text-white rounded-3xl px-8 py-5 inline-block shadow-lg shadow-emerald-200 my-4">
            <p className="text-sm font-medium opacity-80 mb-1">มีคิวก่อนหน้า · คิวของคุณ</p>
            <p className="text-5xl font-black tracking-tight">#{queueNumber}</p>
          </div>
        ) : (
          <p className="text-emerald-600 font-black text-2xl leading-relaxed mt-4">
            กำลังทำเครื่องดื่มของคุณ ☕
          </p>
        )}
        <p className="text-gray-600 font-semibold text-base leading-relaxed">
          กรุณาชำระเงินที่เคาน์เตอร์
        </p>
        <p className="text-gray-400 text-sm">
          พนักงานจะเรียกชื่อเมื่อเครื่องดื่มพร้อม
        </p>
      </motion.div>

      {/* Review prompt card */}
      {hasReviewUrl && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="mt-8 w-full max-w-xs bg-white rounded-2xl shadow-sm border border-emerald-100 px-5 py-4 text-center"
        >
          {reviewDone ? (
            <p className="font-bold text-emerald-600 text-base py-2">ได้รับ 10 แต้มแล้ว ขอบคุณนะคะ 💚</p>
          ) : (
            <>
              <p className="font-bold text-gray-900 text-base mb-1">
                {canEarnReviewPoints ? 'เขียนรีวิวรับ 10 แต้ม! 💚' : 'ถูกใจร้านเราไหม? 💚'}
              </p>
              <p className="text-gray-500 text-sm mb-4 leading-relaxed">
                {canEarnReviewPoints
                  ? 'ฝากรีวิวแล้วรับ 10 แต้มทันที (สะสมแลกส่วนลดได้)'
                  : 'ฝากรีวิวให้เราหน่อยน้า เป็นกำลังใจให้ร้านมากๆ'}
              </p>
              <Button
                variant="primary"
                size="md"
                fullWidth
                leftIcon={<Star size={16} />}
                onClick={handleReviewClick}
                noUppercase
              >
                เขียนรีวิว{canEarnReviewPoints ? ' รับ 10 แต้ม' : ''}
              </Button>
            </>
          )}
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="mt-6 w-full max-w-xs"
      >
        <Button
          variant="outline"
          size="lg"
          fullWidth
          onClick={onReset}
          leftIcon={<RefreshCw size={18} />}
          noUppercase
        >
          สั่งเพิ่ม / สั่งใหม่
        </Button>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
function CustomerOrderApp() {
  // --- Auth & data state ---
  const [authed, setAuthed] = useState(false);
  const [menu, setMenu] = useState([]);
  const [categories, setCategories] = useState([]);
  const [beanModifiers, setBeanModifiers] = useState([]);
  const [settings, setSettings] = useState({ shopName: 'ร้านกาแฟ', vatEnabled: true });
  const [settingsData, setSettingsData] = useState({});
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);

  // --- UI state ---
  const [activeCategory, setActiveCategory] = useState('ทั้งหมด');
  const [searchQuery, setSearchQuery] = useState('');
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [beanModalOpen, setBeanModalOpen] = useState(false);
  const [pendingItem, setPendingItem] = useState(null);

  // --- Cart & checkout state ---
  const [cart, setCart] = useState([]);
  const [view, setView] = useState('menu'); // 'menu' | 'checkout' | 'success'
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [usePoints, setUsePoints] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successQueue, setSuccessQueue] = useState(null);

  // Cleanup listeners refs
  const unsubs = useRef([]);

  // ---------------------------------------------------------------------------
  // Anonymous sign-in
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthed(true);
      } else {
        signInAnonymously(auth).catch(() => {
          // If sign-in fails, still try to load data in case rules allow
          setAuthed(true);
        });
      }
    });
    return () => unsubAuth();
  }, []);

  // ---------------------------------------------------------------------------
  // Firestore subscriptions (start only after auth)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!authed) return;

    const base = ['artifacts', appId, 'public', 'data'];

    // Menu
    const unsubMenu = onSnapshot(
      collection(db, ...base, 'menu'),
      (snap) => {
        setMenu(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
    );

    // Categories
    const unsubCats = onSnapshot(
      collection(db, ...base, 'categories'),
      (snap) => {
        setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
    );

    // Bean modifiers
    const unsubBeans = onSnapshot(
      collection(db, ...base, 'beanModifiers'),
      (snap) => {
        setBeanModifiers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
    );

    // Settings (single doc)
    const unsubSettings = onSnapshot(
      doc(db, ...base, 'config', 'settings'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setSettings({
            shopName: data.shopName || 'ร้านกาแฟ',
            vatEnabled: data.vatEnabled !== false,
          });
          setSettingsData(data);
        }
        setLoading(false);
      },
      () => {
        // settings doc may not exist
        setLoading(false);
      },
    );

    unsubs.current = [unsubMenu, unsubCats, unsubBeans, unsubSettings];
    return () => {
      unsubs.current.forEach((fn) => fn());
      unsubs.current = [];
    };
  }, [authed]);

  // ---------------------------------------------------------------------------
  // Derived: filtered menu
  // ---------------------------------------------------------------------------
  const availableMenu = menu.filter((item) => item.available !== false);

  const filteredMenu = availableMenu.filter((item) => {
    const matchCat = activeCategory === 'ทั้งหมด' || item.category === activeCategory;
    const q = searchQuery.trim().toLowerCase();
    const matchSearch = q === '' || item.name.toLowerCase().includes(q) || (item.description || '').toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  // ---------------------------------------------------------------------------
  // Highlights: ขายดี (by soldCount) + แนะนำ (isFeatured)
  // Shown only on the default "ทั้งหมด" view without an active search.
  // ---------------------------------------------------------------------------
  // Best-sellers = ONLY items the shop manually pins (no auto-fill from sales).
  const bestSellers = useMemo(
    () => availableMenu.filter((m) => m.isPinnedBest),
    [availableMenu],
  );
  const featuredItems = useMemo(
    () => availableMenu.filter((m) => m.isFeatured),
    [availableMenu],
  );
  const bestSellerIds = useMemo(() => new Set(bestSellers.map((m) => m.id)), [bestSellers]);
  const showHighlights = activeCategory === 'ทั้งหมด' && searchQuery.trim() === '';

  // Re-render every minute so the Happy Hour banner (and sale prices) appear and
  // disappear automatically as the time window opens/closes during a session.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // Happy Hour banner: only when the cake sale window is active AND at least one
  // cake item is actually available today (some days there's no cake to sell).
  const happyHourActive =
    isCakeSaleActive(settingsData) &&
    availableMenu.some((m) => isCakeCategory(m.category, settingsData));
  const happyHourPercent = Math.round(Number(settingsData.cakeSalePercent) || 0);
  // Minutes left until the sale window ends (recomputed every minute via nowTick).
  const happyHourLeft = (() => {
    if (!happyHourActive) return 0;
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(settingsData.cakeSaleEnd || ''));
    if (!m) return 0;
    const endMin = Number(m[1]) * 60 + Number(m[2]);
    const now = new Date();
    let diff = endMin - (now.getHours() * 60 + now.getMinutes());
    if (diff < 0) diff += 1440; // window crosses midnight
    return diff;
  })();
  const happyHourLeftText = happyHourLeft >= 60
    ? `${Math.floor(happyHourLeft / 60)} ชม. ${happyHourLeft % 60} นาที`
    : `${happyHourLeft} นาที`;

  // ---------------------------------------------------------------------------
  // Category list: "ทั้งหมด" + each category that has at least one available item
  // ---------------------------------------------------------------------------
  const categoryNames = ['ทั้งหมด', ...new Set(categories.map((c) => c.name).filter(Boolean))];

  // ---------------------------------------------------------------------------
  // Membership / points derivations
  // ---------------------------------------------------------------------------
  const redeemPointsThreshold = Number(settingsData.redeemPointsThreshold) || 100;
  const redeemDiscountValue = Number(settingsData.redeemDiscountValue) || 50;

  // Look up the member by phone on demand (debounced) instead of loading the
  // whole members collection on every QR scan — keeps Firestore reads minimal.
  useEffect(() => {
    const phone = customerPhone.trim();
    if (phone.length < 9) { setMember(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'members', phone));
        if (!cancelled) setMember(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      } catch {
        if (!cancelled) setMember(null);
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [customerPhone]);

  const memberPoints = Number(member?.points || 0);
  const pointsEligible = !!member && memberPoints >= redeemPointsThreshold;

  // ---------------------------------------------------------------------------
  // Cart totals
  // ---------------------------------------------------------------------------
  const subtotal = cart.reduce((s, i) => s + Number(i.price) * Number(i.quantity), 0);
  const combo = getComboDiscount(cart, settingsData);
  const comboDiscount = combo.applies ? combo.amount : 0;
  const pointsDiscount = (pointsEligible && usePoints) ? redeemDiscountValue : 0;
  const discount = comboDiscount + pointsDiscount;
  const vat = settings.vatEnabled ? Math.round(Math.max(0, subtotal - discount) * VAT_RATE) : 0;
  const total = Math.max(0, subtotal - discount + vat);

  // ---------------------------------------------------------------------------
  // Cart operations
  // ---------------------------------------------------------------------------
  const addToCart = useCallback((item, modifier = null) => {
    const modifierName = modifier ? `#${modifier.name}` : '';
    const cartId = modifier ? `${item.id}-${modifier.id}` : item.id;
    const stockLinks = mergeStockLinks(item.stockLinks || [], modifier?.stockLinks || []);

    // For modifier path keep original pricing; for plain items apply sale if active
    let finalPrice;
    let saleFields = {};
    if (modifier) {
      // Base beans (global default คั่วเข้ม, or tagged on this menu) are included
      // in the menu price — no surcharge. Other beans: max(menu price, bean price
      // + this menu's special add-on) so a premium bean can raise it (135).
      const isBaseBean = modifier.isDefault || (item.baseBeanIds || []).includes(modifier.id);
      finalPrice = isBaseBean
        ? (Number(item.price) || 0)
        : Math.max(Number(item.price) || 0, (Number(modifier.price) || 0) + (Number(item.beanExtra) || 0));
    } else {
      const sale = getItemSalePrice(item, settingsData);
      finalPrice = sale.price;
      if (sale.onSale) {
        saleFields = {
          originalPrice: sale.originalPrice,
        };
      }
    }

    // Coffee menus: round the charged price up to the nearest 5 baht.
    if (item.allowBeanModifier) finalPrice = roundUpTo5(finalPrice);

    setCart((prev) => {
      const existing = prev.find((c) => (c.cartId || c.id) === cartId);
      if (existing) {
        return prev.map((c) =>
          (c.cartId || c.id) === cartId
            ? { ...c, quantity: c.quantity + 1 }
            : c,
        );
      }

      // Build note: for sale items append the sale tag
      let note = modifierName;
      if (!modifier && saleFields.originalPrice !== undefined) {
        const sale = getItemSalePrice(item, settingsData);
        const tag = cakeSaleNoteTag(sale.percent);
        note = note ? `${note} ${tag}` : tag;
      }

      return [
        ...prev,
        {
          ...item,
          cartId,
          price: finalPrice,
          ...saleFields,
          beanModifier: modifierName,
          stockLinks,
          quantity: 1,
          note,
        },
      ];
    });
  }, [settingsData]);

  const handleMenuItemClick = useCallback((item) => {
    // Only offer options from this menu's group that are in stock (not hidden)
    const group = item.modifierGroup || 'เมล็ดกาแฟ';
    const availableBeans = beanModifiers.filter((b) => b.available !== false && (b.group || 'เมล็ดกาแฟ') === group);
    if (item.allowBeanModifier && availableBeans.length > 0) {
      setPendingItem(item);
      setBeanModalOpen(true);
    } else {
      addToCart(item);
    }
  }, [addToCart, beanModifiers]);

  const handleBeanSelect = useCallback((item, modifier) => {
    addToCart(item, modifier);
    setBeanModalOpen(false);
    setPendingItem(null);
  }, [addToCart]);

  const updateQty = useCallback((cartId, newQty) => {
    if (newQty <= 0) {
      setCart((prev) => prev.filter((c) => (c.cartId || c.id) !== cartId));
    } else {
      setCart((prev) =>
        prev.map((c) =>
          (c.cartId || c.id) === cartId ? { ...c, quantity: newQty } : c,
        ),
      );
    }
  }, []);

  const removeItem = useCallback((cartId) => {
    setCart((prev) => prev.filter((c) => (c.cartId || c.id) !== cartId));
  }, []);

  const updateNote = useCallback((cartId, note) => {
    setCart((prev) =>
      prev.map((c) =>
        (c.cartId || c.id) === cartId ? { ...c, note } : c,
      ),
    );
  }, []);

  // ---------------------------------------------------------------------------
  // Order submission
  // ---------------------------------------------------------------------------
  const handleSubmit = async () => {
    if (!customerName.trim() || cart.length === 0 || submitting) return;

    setSubmitting(true);
    setSubmitError('');

    try {
      const base = ['artifacts', appId, 'public', 'data'];
      const queueRef = doc(db, ...base, 'config', 'queue');
      const phone = customerPhone.trim();

      let assignedQueue;
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(queueRef);
        const current = snap.exists() ? (snap.data().current || 1) : 1;
        assignedQueue = current;
        tx.set(queueRef, { current: current + 1 }, { merge: true });
      });

      // Strip heavy display-only fields (base64 image, description) so the order
      // doc stays small — avoids Firestore's 1 MiB limit and speeds up the write.
      // Views fall back to the menu's own image via the kept item id.
      const leanItems = cart.map((c) => {
        const lean = { ...c };
        delete lean.image;
        delete lean.description;
        return lean;
      });

      const orderData = {
        queueNumber: assignedQueue,
        items: leanItems,
        subtotal: Number(subtotal),
        discount: Number(discount),
        vat: Number(vat),
        total: Number(total),
        vatIncluded: settings.vatEnabled,
        isPaid: false,
        memberPhone: phone,
        memberNickname: customerName.trim(),
        customerName: customerName.trim(),
        status: 'pending',
        promotionTitle: combo.applies ? COMBO_PROMO_TITLE : '',
        promotionDiscountPercent: 0,
        bringOwnGlass: false,
        createdAt: serverTimestamp(),
        date: getISODate(),
        time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        table: 'QR',
        source: 'qr',
      };

      await addDoc(collection(db, ...base, 'orders'), orderData);

      // --- Best-selling counter (best-effort; never blocks the order) ---
      bumpMenuSoldCount(cart);

      // --- LINE notification to the shop (best-effort; never blocks) ---
      notifyNewOrderToLine({
        queueNumber: assignedQueue,
        customerName: customerName.trim(),
        items: leanItems,
        total,
        time: orderData.time,
      });

      // --- Member side-effect (non-blocking) ---
      if (phone.length >= 9) {
        try {
          const memberRef = doc(db, ...base, 'members', phone);
          const pointsToAdd = Math.floor(total / 10);
          const redeemDeduct = (usePoints && pointsEligible) ? redeemPointsThreshold : 0;
          const netPoints = pointsToAdd - redeemDeduct;

          const isExisting = !!member && member.phone === phone;
          const memberPayload = {
            phone,
            name: customerName.trim(),
            points: increment(netPoints),
            lastOrderAt: serverTimestamp(),
          };
          if (!isExisting) {
            memberPayload.createdAt = serverTimestamp();
          }
          await setDoc(memberRef, memberPayload, { merge: true });
        } catch {
          // Member write failure is non-critical — order already saved
        }
      }

      // Queue shown to the customer = number of orders still pending (real load).
      // 1 (only this order) → no number, just "preparing". Best-effort; never blocks.
      try {
        const snap = await getCountFromServer(
          query(collection(db, ...base, 'orders'), where('status', '==', 'pending')),
        );
        setSuccessQueue(snap.data().count || 0);
      } catch {
        setSuccessQueue(0);
      }
      setView('success');
    } catch (err) {
      // Surface the real cause: 'permission-denied' (rules), 'invalid-argument'
      // (bad/oversized doc), 'unavailable' (network/offline), etc.
      console.error('[QR order submit] failed:', err);
      const code = err?.code || err?.message || 'unknown';
      setSubmitError(`สั่งออเดอร์ไม่สำเร็จ (${code}) — ลองใหม่อีกครั้ง`);
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Reset to order again
  // ---------------------------------------------------------------------------
  const handleReset = () => {
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setUsePoints(false);
    setSubmitError('');
    setSuccessQueue(null);
    setView('menu');
  };

  // Award 10 points for a review — ONCE per member (flag prevents farming).
  // Trust-based: we can't verify the external review, so we credit on click but
  // only the first time for that phone.
  const awardReviewPoints = useCallback(async () => {
    const phone = customerPhone.trim();
    if (phone.length < 9) return;
    try {
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'members', phone);
      const snap = await getDoc(ref);
      if (!snap.exists() || snap.data().reviewRewarded) return; // already rewarded
      await updateDoc(ref, { points: increment(10), reviewRewarded: true });
      setMember((m) => (m ? { ...m, reviewRewarded: true, points: (Number(m.points) || 0) + 10 } : m));
    } catch (e) {
      console.warn('[review points] failed', e);
    }
  }, [customerPhone]);

  // ---------------------------------------------------------------------------
  // Loading screen
  // ---------------------------------------------------------------------------
  if (loading || !authed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white gap-4">
        <Spinner size="xl" color="emerald" />
        <p className="text-gray-400 font-medium text-sm">กำลังโหลดเมนู...</p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Success screen
  // ---------------------------------------------------------------------------
  if (view === 'success') {
    return (
      <AnimatePresence mode="wait">
        <SuccessScreen
          queueNumber={successQueue}
          customerName={customerName}
          onReset={handleReset}
          reviewUrl={settingsData.reviewUrl}
          canEarnReviewPoints={customerPhone.trim().length >= 9 && !(member && member.reviewRewarded)}
          onReviewClick={awardReviewPoints}
        />
      </AnimatePresence>
    );
  }

  // ---------------------------------------------------------------------------
  // Checkout step
  // ---------------------------------------------------------------------------
  if (view === 'checkout') {
    return (
      <AnimatePresence mode="wait">
        <CheckoutStep
          cart={cart}
          subtotal={subtotal}
          vat={vat}
          total={total}
          vatEnabled={settings.vatEnabled}
          customerName={customerName}
          onNameChange={setCustomerName}
          onSubmit={handleSubmit}
          onBack={() => setView('menu')}
          submitting={submitting}
          submitError={submitError}
          customerPhone={customerPhone}
          onPhoneChange={setCustomerPhone}
          member={member}
          memberPoints={memberPoints}
          pointsEligible={pointsEligible}
          usePoints={usePoints}
          onTogglePoints={() => setUsePoints((v) => !v)}
          redeemPointsThreshold={redeemPointsThreshold}
          redeemDiscountValue={redeemDiscountValue}
          comboDiscount={comboDiscount}
          pointsDiscount={pointsDiscount}
        />
      </AnimatePresence>
    );
  }

  // ---------------------------------------------------------------------------
  // Menu browsing view
  // ---------------------------------------------------------------------------
  const itemCount = cart.reduce((s, i) => s + Number(i.quantity), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ---- Header ---- */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-black text-gray-900 text-xl leading-tight">{settings.shopName}</h1>
            <p className="text-emerald-500 text-xs font-semibold mt-0.5">สั่งออเดอร์ผ่าน QR</p>
          </div>
          {itemCount > 0 && (
            <button
              onClick={() => setCartDrawerOpen(true)}
              className="relative w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 hover:bg-emerald-100 transition-colors"
            >
              <ShoppingCart size={22} />
              <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {itemCount}
              </span>
            </button>
          )}
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาเมนู..."
              className="w-full bg-gray-100 rounded-xl py-2.5 pl-9 pr-4 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-hide">
          {categoryNames.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                activeCategory === cat
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </header>

      {/* ---- Happy Hour banner (only when a cake is actually available) ---- */}
      <AnimatePresence>
        {happyHourActive && (
          <motion.div
            key="happy-hour"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-4 mt-3 rounded-2xl px-4 py-3 bg-gradient-to-r from-amber-400 to-orange-500 shadow-lg flex items-center gap-3"
          >
            <span className="text-2xl">🍰</span>
            <div className="leading-tight flex-1">
              <p className="text-white font-black text-sm">Happy Hour! เค้กลด {happyHourPercent}% · เหลืออีก {happyHourLeftText} ⏳</p>
              <p className="text-white/90 font-semibold text-xs">
                ถึง {settingsData.cakeSaleEnd} น. · รีบสั่งก่อนหมดเวลา!
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Combo nudge banner ---- */}
      <AnimatePresence>
        {combo.enabled && combo.percent > 0 && (combo.hasCake !== combo.hasDrink) && (
          <motion.div
            key="combo-nudge"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-4 mt-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center gap-2"
          >
            <span className="text-emerald-700 font-semibold text-sm">
              {combo.hasCake
                ? `เพิ่มเครื่องดื่มอีก 1 แก้ว รับส่วนลด ${combo.percent}%! 🥤`
                : `เพิ่มเค้กอีก 1 ชิ้น รับส่วนลด ${combo.percent}%! 🍰`}
            </span>
          </motion.div>
        )}
        {combo.applies && (
          <motion.div
            key="combo-applied"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-4 mt-3 bg-emerald-500 rounded-2xl px-4 py-3 flex items-center gap-2"
          >
            <span className="text-white font-semibold text-sm">
              🎉 คุณได้รับส่วนลดคอมโบ {combo.percent}% แล้ว
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Highlight rails: ขายดี + แนะนำ ---- */}
      {showHighlights && (bestSellers.length > 0 || featuredItems.length > 0) && (
        <div className="pt-4 space-y-5">
          {bestSellers.length > 0 && (
            <HighlightRail
              title="🔥 เมนูขายดี"
              items={bestSellers}
              onAdd={handleMenuItemClick}
              settingsData={settingsData}
            />
          )}
          {featuredItems.length > 0 && (
            <HighlightRail
              title="⭐ เมนูแนะนำ"
              items={featuredItems}
              onAdd={handleMenuItemClick}
              settingsData={settingsData}
              bestSellerIds={bestSellerIds}
            />
          )}
        </div>
      )}

      {/* ---- Menu grid ---- */}
      <main className="px-4 py-4 pb-32">
        {showHighlights && (bestSellers.length > 0 || featuredItems.length > 0) && (
          <h2 className="text-sm font-bold text-gray-700 mb-3 px-0.5">เมนูทั้งหมด</h2>
        )}
        {filteredMenu.length === 0 ? (
          <EmptyState
            icon={searchQuery ? 'search' : 'default'}
            title={searchQuery ? 'ไม่พบเมนูที่ค้นหา' : 'ยังไม่มีเมนู'}
            description={searchQuery ? `ไม่พบ "${searchQuery}" ลองค้นหาคำอื่น` : 'กรุณารอสักครู่'}
          />
        ) : (
          <motion.div
            layout
            className="grid grid-cols-2 gap-3"
          >
            <AnimatePresence>
              {filteredMenu.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  onAdd={handleMenuItemClick}
                  settingsData={settingsData}
                  isBestSeller={bestSellerIds.has(item.id)}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </main>

      {/* ---- Sticky cart bar ---- */}
      <AnimatePresence>
        {itemCount > 0 && (
          <StickyCartBar
            cart={cart}
            total={total}
            onClick={() => setCartDrawerOpen(true)}
          />
        )}
      </AnimatePresence>

      {/* ---- Cart drawer ---- */}
      <CartDrawer
        isOpen={cartDrawerOpen}
        cart={cart}
        total={total}
        onClose={() => setCartDrawerOpen(false)}
        onUpdateQty={updateQty}
        onRemove={removeItem}
        onUpdateNote={updateNote}
        onProceed={() => {
          setCartDrawerOpen(false);
          setView('checkout');
        }}
      />

      {/* ---- Bean modifier modal ---- */}
      <BeanModifierModal
        isOpen={beanModalOpen}
        item={pendingItem}
        modifiers={beanModifiers.filter((b) => b.available !== false && (b.group || 'เมล็ดกาแฟ') === (pendingItem?.modifierGroup || 'เมล็ดกาแฟ'))}
        onSelect={handleBeanSelect}
        onClose={() => {
          setBeanModalOpen(false);
          setPendingItem(null);
        }}
      />
    </div>
  );
}

CustomerOrderApp.displayName = 'CustomerOrderApp';

export default CustomerOrderApp;
