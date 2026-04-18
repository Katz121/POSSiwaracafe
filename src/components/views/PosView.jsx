import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search, Star, Receipt, Minus, Plus, Tag, Zap, X, PlusCircle,
  Coffee, Gift, Wallet, CreditCard, ChevronLeft, ChevronRight,
  ShoppingBag, CheckCircle, RefreshCcw, ArrowRight,
  Trash2, Sparkles, Phone, User, Flame
} from 'lucide-react';
import { collection, doc, addDoc, setDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { useAppContext } from '../../context/AppContext';
import { getISODate, getNameKey } from '../../utils/calculations';
import useDebounce from '../../hooks/useDebounce';
import { trackRecommendationsShown, trackRecommendationAccepted } from '../../services/upsellTracker';
import { Button, Modal, EmptyState, useToast, Skeleton } from '../ui';
import {
  DEFAULT_REDEEM_POINTS_THRESHOLD,
  DEFAULT_REDEEM_DISCOUNT_VALUE,
  DEFAULT_OWN_GLASS_DISCOUNT,
  DEFAULT_ITEMS_PER_PAGE,
  VAT_RATE,
  MENU_PAGE_OPTIONS
} from '../../config/constants';

export default function PosView() {
  const {
    user,
    menu,
    members,
    orders,
    beanModifiers,
    dynamicCategories,
    queueCounter,
    isSyncing,
    vatEnabled,
    redeemPointsThreshold,
    redeemDiscountValue,
    ownGlassDiscount,
    activePromotion,
    setActivePromotion,
    runDbAction,
    callGeminiAPI,
    isNavExpanded,
    editingOrderId,
    setEditingOrderId
  } = useAppContext();

  const REDEEM_POINTS_THRESHOLD = Number(redeemPointsThreshold) || DEFAULT_REDEEM_POINTS_THRESHOLD;
  const REDEEM_DISCOUNT_VALUE = Number(redeemDiscountValue) || DEFAULT_REDEEM_DISCOUNT_VALUE;
  const OWN_GLASS_DISCOUNT = Number(ownGlassDiscount) || DEFAULT_OWN_GLASS_DISCOUNT;

  const toast = useToast();

  const [cart, setCart] = useState([]);
  const [activeCategory, setActiveCategory] = useState('แนะนำ');
  const [searchTerm, setSearchTerm] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [usePoints, setUsePoints] = useState(false);
  const [bringOwnGlass, setBringOwnGlass] = useState(false);
  const [pendingBeanItem, setPendingBeanItem] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [isRecommending, setIsRecommending] = useState(false);
  const [menuPage, setMenuPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_ITEMS_PER_PAGE);
  const [memberPhone, setMemberPhone] = useState('');
  const [memberNickname, setMemberNickname] = useState('');
  const [currentMember, setCurrentMember] = useState(null);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [isRefreshingMembers, setIsRefreshingMembers] = useState(false);

  const debouncedSearchTerm = useDebounce(searchTerm, 200);

  const subtotal = useMemo(() => cart.reduce((s, i) => s + (Number(i.price) * Number(i.quantity)), 0), [cart]);

  const discountAmount = useMemo(() => {
    let d = 0;
    if (usePoints) d += REDEEM_DISCOUNT_VALUE;
    if (bringOwnGlass) d += OWN_GLASS_DISCOUNT;
    cart.forEach(item => {
      if (item.promoApplied && activePromotion?.discountPercent > 0) {
        d += (Number(item.price) * Number(item.quantity) * (activePromotion.discountPercent / 100));
      }
    });
    return d;
  }, [usePoints, bringOwnGlass, activePromotion, cart, REDEEM_DISCOUNT_VALUE, OWN_GLASS_DISCOUNT]);

  const vatAmount = useMemo(() => vatEnabled ? Math.round(Math.max(0, subtotal - discountAmount) * VAT_RATE) : 0, [subtotal, discountAmount, vatEnabled]);
  const netTotal = useMemo(() => Math.max(0, (subtotal - discountAmount) + vatAmount), [subtotal, discountAmount, vatAmount]);

  const categories = useMemo(() => ['แนะนำ', ...[...new Set(dynamicCategories.map(c => c.name))]], [dynamicCategories]);

  const filteredMenu = useMemo(() => {
    const search = debouncedSearchTerm.toLowerCase();
    if (search) {
      return menu.filter(i => i.available !== false && String(i.name || '').toLowerCase().includes(search));
    }
    return menu.filter(i => {
      const categoryMatch = activeCategory === 'แนะนำ' ? i.isFeatured : (i.category === activeCategory);
      return categoryMatch && i.available !== false;
    });
  }, [activeCategory, debouncedSearchTerm, menu]);

  const totalPages = Math.ceil(filteredMenu.length / itemsPerPage);
  const pagedMenu = useMemo(() => {
    const start = (menuPage - 1) * itemsPerPage;
    return filteredMenu.slice(start, start + itemsPerPage);
  }, [filteredMenu, menuPage, itemsPerPage]);

  const cartCount = useMemo(() => cart.reduce((s, i) => s + Number(i.quantity || 0), 0), [cart]);
  const currentQueue = editingOrderId ? (orders.find(o => o.id === editingOrderId)?.queueNumber || queueCounter) : queueCounter;

  useEffect(() => { setMenuPage(1); }, [activeCategory, debouncedSearchTerm, itemsPerPage]);

  useEffect(() => {
    if (memberPhone.length >= 9) {
      const found = members.find(m => m.phone === memberPhone);
      if (found) {
        setCurrentMember(found);
        setMemberNickname(found.name || '');
      } else {
        setCurrentMember({ phone: memberPhone, points: 0, name: memberNickname || 'ลูกค้าใหม่', isNew: true });
      }
    } else if (memberPhone.length > 0 && memberPhone.length < 9) {
      setCurrentMember(null);
      setUsePoints(false);
    } else if (!memberPhone && !memberNickname) {
      setCurrentMember(null);
      setUsePoints(false);
    }
  }, [memberPhone, members, memberNickname]);

  useEffect(() => {
    if (memberPhone && memberPhone.length >= 9) return;
    const nameKey = getNameKey(memberNickname);
    if (!nameKey) {
      if (!memberPhone) { setCurrentMember(null); setUsePoints(false); }
      return;
    }
    const found = members.find(m => getNameKey(m.name) === nameKey);
    if (found) {
      setCurrentMember(found);
      if (found.phone) setMemberPhone(found.phone);
    } else {
      setCurrentMember({ phone: '', points: 0, name: memberNickname, isNew: true });
    }
  }, [memberNickname, memberPhone, members]);

  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const prevEditingIdRef = useRef(null);
  useEffect(() => {
    if (editingOrderId && editingOrderId !== prevEditingIdRef.current) {
      const orderToEdit = ordersRef.current.find(o => o.id === editingOrderId);
      if (orderToEdit) {
        setCart(orderToEdit.items || []);
        setIsPaid(orderToEdit.isPaid || false);
        setBringOwnGlass(orderToEdit.bringOwnGlass || false);
        setUsePoints(false);
        if (orderToEdit.memberPhone) setMemberPhone(orderToEdit.memberPhone);
        if (orderToEdit.memberNickname) setMemberNickname(orderToEdit.memberNickname);
      } else {
        toast.warning('บิลนี้ถูกลบแล้ว');
        setEditingOrderId(null);
      }
    }
    prevEditingIdRef.current = editingOrderId;
  }, [editingOrderId]);

  const featuredItems = useMemo(() => menu.filter(i => i.isFeatured && i.available !== false), [menu]);
  const cartRef = useRef(cart);
  cartRef.current = cart;
  const featuredItemsRef = useRef(featuredItems);
  featuredItemsRef.current = featuredItems;
  const handleCheckoutRef = useRef(null);

  useEffect(() => {
    const handlePosShortcut = (event) => {
      const { action, index } = event.detail || {};
      switch (action) {
        case 'checkout':
          if (cartRef.current.length > 0) handleCheckoutRef.current();
          break;
        case 'clear':
          setCart([]); setUsePoints(false); setBringOwnGlass(false);
          break;
        case 'remove_last':
          if (cartRef.current.length > 0) {
            const lastItem = cartRef.current[cartRef.current.length - 1];
            updateQuantity(lastItem.cartId || lastItem.id, -1);
          }
          break;
        case 'quick_add':
          if (typeof index === 'number' && featuredItemsRef.current[index]) {
            addToCart(featuredItemsRef.current[index]);
          }
          break;
        default: break;
      }
    };
    window.addEventListener('pos-shortcut', handlePosShortcut);
    return () => window.removeEventListener('pos-shortcut', handlePosShortcut);
  }, []);

  const addToCart = (p) => {
    if (p.allowBeanModifier && beanModifiers.length > 0) {
      setPendingBeanItem(p);
      return;
    }
    setCart(prev => {
      const existing = prev.find(item => item.id === p.id && !item.beanModifier);
      if (existing) return prev.map(item => item.id === p.id && !item.beanModifier ? { ...item, quantity: item.quantity + 1 } : item);
      return [...prev, { ...p, quantity: 1, note: '' }];
    });
  };

  const addToCartWithBean = (item, modifier) => {
    const finalPrice = modifier ? modifier.price : item.price;
    const modifierName = modifier ? `#${modifier.name}` : '';
    const cartItemId = modifier ? `${item.id}-${modifier.id}` : item.id;
    const mergedStockLinks = [...(item.stockLinks || [])];
    if (modifier && modifier.stockLinks) {
      modifier.stockLinks.forEach(link => {
        const existing = mergedStockLinks.find(l => l.stockId === link.stockId);
        if (existing) existing.usage = (Number(existing.usage) || 0) + (Number(link.usage) || 0);
        else mergedStockLinks.push({ ...link });
      });
    }
    setCart(prev => {
      const existing = prev.find(c => c.cartId === cartItemId);
      if (existing) return prev.map(c => c.cartId === cartItemId ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, {
        ...item, cartId: cartItemId, price: finalPrice,
        beanModifier: modifierName, stockLinks: mergedStockLinks,
        quantity: 1, note: modifierName
      }];
    });
    setPendingBeanItem(null);
  };

  const updateCartItemNote = (cartItemId, note) => setCart(prev => prev.map(item => (item.cartId || item.id) === cartItemId ? { ...item, note } : item));
  const updateQuantity = (cartItemId, d) => setCart(prev => prev.map(item => (item.cartId || item.id) === cartItemId ? { ...item, quantity: Math.max(0, item.quantity + d) } : item).filter(item => item.quantity > 0));
  const removeItem = (cartItemId) => setCart(prev => prev.filter(item => (item.cartId || item.id) !== cartItemId));

  const toggleItemPromo = (cartItemId) => {
    if (!activePromotion) {
      toast.warning('กรุณาเลือกโปรโมชั่นก่อนครับ');
      return;
    }
    setCart(prev => prev.map(item => {
      if ((item.cartId || item.id) === cartItemId) {
        const isCurrentlyApplied = !!item.promoApplied;
        const promoTag = `[${activePromotion.title}]`;
        let nextNote = (item.note || '').trim();
        if (!isCurrentlyApplied) {
          if (!nextNote.includes(promoTag)) nextNote = nextNote ? `${nextNote} ${promoTag}` : promoTag;
        } else {
          nextNote = nextNote.replace(promoTag, '').trim();
        }
        return { ...item, promoApplied: !isCurrentlyApplied, note: nextNote };
      }
      return item;
    }));
  };

  const handleRefreshMembers = () => {
    setIsRefreshingMembers(true);
    setTimeout(() => setIsRefreshingMembers(false), 1000);
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (!user) {
      toast.error('ไม่พบข้อมูลผู้ใช้งาน - กรุณารีเฟรชหน้าจอหรือตรวจสอบอินเทอร์เน็ต');
      return;
    }
    await runDbAction(async () => {
      const orderData = {
        queueNumber: editingOrderId ? (orders.find(o => o.id === editingOrderId)?.queueNumber || queueCounter) : queueCounter,
        items: cart, subtotal: Number(subtotal), discount: Number(discountAmount),
        vat: Number(vatAmount), total: Number(netTotal), vatIncluded: vatEnabled,
        isPaid, memberPhone: currentMember?.phone || '', memberNickname,
        status: 'pending',
        promotionTitle: activePromotion?.title || '',
        promotionDiscountPercent: activePromotion?.discountPercent || 0,
        bringOwnGlass, createdAt: serverTimestamp(), date: getISODate(),
        time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        table: 'Walk-in'
      };
      const nameKey = getNameKey(memberNickname);
      const phoneValid = memberPhone && memberPhone.length >= 9;
      const nameValid = nameKey && nameKey.length > 0;
      const existingByPhone = phoneValid ? members.find(m => m.phone === memberPhone) : null;
      const existingByName = !existingByPhone && nameValid ? members.find(m => getNameKey(m.name) === nameKey) : null;
      const existingMember = existingByPhone || existingByName;
      let memberId = existingMember ? (existingMember.id || existingMember.phone) : null;
      if (!memberId) {
        if (phoneValid) memberId = memberPhone;
        else if (nameValid) memberId = `name:${nameKey}`;
      }
      if (memberId) {
        const memRef = doc(db, 'artifacts', appId, 'public', 'data', 'members', memberId);
        const memberData = { lastOrderAt: serverTimestamp() };
        if (!editingOrderId) {
          const pointsToAdd = Math.floor(netTotal / 10);
          memberData.points = increment(pointsToAdd);
        }
        if (memberNickname) memberData.name = memberNickname;
        if (phoneValid) memberData.phone = memberPhone;
        if (!existingMember) {
          if (!memberData.name) memberData.name = memberNickname || 'ลูกค้าใหม่';
          if (!memberData.phone && phoneValid) memberData.phone = memberPhone;
          memberData.createdAt = serverTimestamp();
        }
        await setDoc(memRef, memberData, { merge: true });
      }
      if (editingOrderId) {
        const originalOrder = orders.find(o => o.id === editingOrderId);
        const editData = { ...orderData, updatedAt: serverTimestamp() };
        if (originalOrder?.status) editData.status = originalOrder.status;
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', editingOrderId), editData);
        setEditingOrderId(null);
      } else {
        if (usePoints && currentMember && Number(currentMember.points || 0) >= REDEEM_POINTS_THRESHOLD) {
          const memNameKey = getNameKey(currentMember.name);
          const redeemMemberId = currentMember.phone || (memNameKey ? `name:${memNameKey}` : null);
          if (redeemMemberId) {
            const memRef = doc(db, 'artifacts', appId, 'public', 'data', 'members', redeemMemberId);
            await updateDoc(memRef, { points: increment(-REDEEM_POINTS_THRESHOLD) });
          }
        }
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), orderData);
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'queue'), { current: Number(queueCounter) + 1 });
      }
      setCart([]); setIsPaid(false); setMemberPhone(''); setMemberNickname(''); setUsePoints(false); setBringOwnGlass(false);
      toast.success(editingOrderId ? 'แก้ไขออเดอร์สำเร็จ' : `บันทึกออเดอร์ #${queueCounter} สำเร็จ`);
    }, 'บันทึกออเดอร์ไม่สำเร็จ');
  };

  handleCheckoutRef.current = handleCheckout;

  const handleGetRecommendations = async () => {
    if (cart.length === 0) return;
    setIsRecommending(true);
    setRecommendations([]);
    try {
      const cartItemsName = cart.map(c => c.name).join(', ');
      const availableMenu = menu.filter(m => !cart.find(c => c.id === m.id) && m.available !== false);
      const menuContext = availableMenu.slice(0, 20).map(m => `${m.name} (${m.category})`).join(', ');
      const prompt = `
        Role: Expert Cafe Barista.
        Current Order: ${cartItemsName}
        Available Menu: ${menuContext}
        Task: Suggest 3 items from the "Available Menu" that go best with the "Current Order".
        Rules:
        1. Return ONLY the exact names of the 3 items as a JSON array of strings. Example: ["Espresso", "Croissant", "Water"]
        2. Do not include items already in the order.
        3. Do not include markdown code blocks.
      `;
      const result = await callGeminiAPI(prompt, true);
      if (result.success && Array.isArray(result.data)) {
        const suggestedItems = availableMenu.filter(m => result.data.includes(m.name)).slice(0, 3);
        setRecommendations(suggestedItems);
        if (suggestedItems.length > 0) trackRecommendationsShown(suggestedItems);
      } else {
        const fallbackItems = availableMenu.filter(m => m.recommended).slice(0, 3);
        setRecommendations(fallbackItems);
        if (fallbackItems.length > 0) trackRecommendationsShown(fallbackItems);
      }
    } catch (error) {
      console.error('Smart Upsell Error:', error);
    } finally {
      setIsRecommending(false);
    }
  };

  // ------- Reusable cart render helpers (regular functions, NOT components — avoids Fast Refresh hook issues) -------

  const renderCartItems = (compact = false) => (
    <div className={`flex-1 overflow-y-auto ${compact ? 'px-4' : 'px-5'} scrollbar-hide`}>
      {cart.length === 0 ? (
        <div className="h-full flex items-center justify-center py-10">
          <EmptyState icon="cart" title="ตะกร้าว่างเปล่า" description="เลือกเมนูด้านข้างเพื่อเริ่มสั่ง" size="sm" />
        </div>
      ) : cart.map(item => {
        const cartItemId = item.cartId || item.id;
        return (
          <div key={cartItemId} className="flex gap-3 py-3 border-b border-[var(--border-color)] last:border-b-0">
            <div className="w-12 h-12 flex-shrink-0 rounded-xl overflow-hidden bg-[var(--bg-tertiary)]">
              {item.image ? (
                <img src={item.image} className="w-full h-full object-cover" alt={item.name} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
                  <Coffee size={20} />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold leading-tight line-clamp-1 text-[var(--text-primary)]">{String(item.name)}</div>
              {item.beanModifier && (
                <span className="inline-block text-[10px] font-black text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded mt-0.5">{item.beanModifier}</span>
              )}
              <div className="text-xs mt-0.5 text-[var(--text-muted)] font-medium">฿{Number(item.price).toLocaleString()} / แก้ว</div>
              <div className="flex items-center gap-2 mt-2">
                <button onClick={() => updateQuantity(cartItemId, -1)} aria-label="ลดจำนวน"
                  className="w-7 h-7 rounded-full flex items-center justify-center bg-[var(--bg-tertiary)] text-[var(--text-primary)] active:scale-95 transition-transform">
                  <Minus size={12} strokeWidth={2.5} />
                </button>
                <span className="text-sm font-black w-5 text-center text-[var(--text-primary)]">{Number(item.quantity)}</span>
                <button onClick={() => updateQuantity(cartItemId, 1)} aria-label="เพิ่มจำนวน"
                  className="w-7 h-7 rounded-full flex items-center justify-center bg-[var(--accent-emerald)] text-white active:scale-95 transition-transform">
                  <Plus size={12} strokeWidth={2.5} />
                </button>
                {activePromotion && (
                  <button onClick={() => toggleItemPromo(cartItemId)}
                    className={`ml-auto h-7 px-2 rounded-full text-[10px] font-black flex items-center gap-1 transition-all ${item.promoApplied ? 'bg-violet-600 text-white' : 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300'}`}
                    title="ใช้โปรโมชั่นกับเมนูนี้">
                    <Tag size={10} strokeWidth={2.5} />
                    {item.promoApplied ? `${activePromotion.discountPercent}%` : 'PROMO'}
                  </button>
                )}
              </div>
              <input
                type="text"
                placeholder="หมายเหตุ..."
                value={item.note || ''}
                onChange={(e) => updateCartItemNote(cartItemId, e.target.value)}
                className="w-full mt-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg py-1.5 px-2 text-[11px] font-medium outline-none focus:border-[var(--accent-emerald)] text-[var(--text-primary)]"
              />
            </div>
            <div className="flex flex-col items-end justify-between flex-shrink-0">
              <button onClick={() => removeItem(cartItemId)} aria-label="ลบรายการ"
                className="p-1 text-[var(--text-muted)] hover:text-red-500 transition-colors">
                <X size={14} strokeWidth={2.5} />
              </button>
              <div className="text-sm font-black text-[var(--text-primary)]">฿{(Number(item.price) * Number(item.quantity)).toLocaleString()}</div>
            </div>
          </div>
        );
      })}

      {/* AI Upsell */}
      {cart.length > 0 && (
        <div className="py-3">
          {recommendations.length === 0 ? (
            <button onClick={handleGetRecommendations} disabled={isRecommending}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-100 to-fuchsia-100 dark:from-violet-900/30 dark:to-fuchsia-900/30 text-violet-600 dark:text-violet-300 font-black text-[11px] uppercase tracking-wider flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all border border-violet-200 dark:border-violet-800">
              {isRecommending ? (<><div className="w-3.5 h-3.5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" /> กำลังวิเคราะห์...</>) : (<><Zap size={14} fill="currentColor" /> เชียร์ขายอะไรดี? (AI Upsell)</>)}
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-violet-500 uppercase tracking-widest flex items-center gap-1"><Zap size={10} fill="currentColor" /> แนะนำทานคู่กัน</span>
                <button onClick={() => setRecommendations([])} aria-label="ปิด" className="text-[var(--text-muted)]"><X size={12} /></button>
              </div>
              {recommendations.map(rec => (
                <div key={rec.id} onClick={() => { trackRecommendationAccepted(rec); addToCart(rec); }}
                  className="bg-[var(--bg-secondary)] p-2.5 rounded-xl border border-violet-200 dark:border-violet-900 flex items-center gap-2.5 cursor-pointer hover:border-violet-500 hover:shadow-sm transition-all group">
                  <div className="w-9 h-9 bg-[var(--bg-tertiary)] rounded-lg overflow-hidden shrink-0">
                    {rec.image && <img src={rec.image} alt={rec.name} className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-[var(--text-primary)] truncate">{rec.name}</p>
                    <p className="text-[11px] text-[var(--accent-emerald)] font-bold">฿{Number(rec.price).toLocaleString()}</p>
                  </div>
                  <PlusCircle size={18} className="text-violet-400 group-hover:text-violet-600 transition-colors" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderCartOptions = () => (
    <div className="px-5 py-4 space-y-3 bg-[var(--bg-tertiary)] border-t border-[var(--border-color)] shrink-0">
      {/* Bring-own-cup toggle */}
      <button onClick={() => setBringOwnGlass(!bringOwnGlass)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-[var(--bg-secondary)] transition-all active:scale-[0.98]"
        style={{ border: `1.5px solid ${bringOwnGlass ? 'var(--accent-emerald)' : 'var(--border-color)'}` }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[var(--accent-emerald-light)] text-[var(--accent-emerald)]">
            <Coffee size={16} strokeWidth={2} />
          </div>
          <div className="text-left">
            <div className="text-[13px] font-bold text-[var(--text-primary)]">นำแก้วมาเอง</div>
            <div className="text-[10px] text-[var(--text-muted)]">ลดทันที ฿{OWN_GLASS_DISCOUNT}</div>
          </div>
        </div>
        <div className={`w-10 h-6 rounded-full relative transition-colors ${bringOwnGlass ? 'bg-[var(--accent-emerald)]' : 'bg-[var(--border-color)]'}`}>
          <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${bringOwnGlass ? 'right-0.5' : 'left-0.5'}`} />
        </div>
      </button>

      {/* Points card */}
      <div className="p-3 rounded-2xl bg-[var(--bg-secondary)] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-[var(--accent-emerald)]" />
            <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text-secondary)]">สะสมแต้ม</span>
          </div>
          <button onClick={handleRefreshMembers} aria-label="รีเฟรชสมาชิก"
            className={`p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-emerald)] transition-colors ${isRefreshingMembers ? 'animate-spin' : ''}`}>
            <RefreshCcw size={12} />
          </button>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-1.5 px-3 h-9 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
            <Phone size={12} className="text-[var(--text-muted)] shrink-0" />
            <input type="tel" maxLength={10} placeholder="เบอร์โทร" value={memberPhone} onChange={(e) => setMemberPhone(e.target.value)}
              className="bg-transparent outline-none text-xs flex-1 min-w-0 w-full font-medium text-[var(--text-primary)]" />
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-1.5 px-3 h-9 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
            <User size={12} className="text-[var(--text-muted)] shrink-0" />
            <input type="text" placeholder="ชื่อเล่น" value={memberNickname} onChange={(e) => setMemberNickname(e.target.value)}
              className="bg-transparent outline-none text-xs flex-1 min-w-0 w-full font-medium text-[var(--text-primary)]" />
          </div>
        </div>
        {currentMember && (
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-black text-[var(--text-primary)] truncate">
                {currentMember.isNew ? (memberNickname || 'ลูกค้าใหม่') : String(currentMember.name)}
              </span>
              {currentMember.isNew && (
                <span className="bg-[var(--accent-emerald-light)] text-[var(--accent-emerald)] text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase shrink-0">New</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">
                {currentMember.isNew ? 'จะได้' : 'แต้ม'}
              </span>
              <span className="text-xs font-black text-[var(--accent-emerald)]">
                {currentMember.isNew ? `+${Math.floor(netTotal / 10)}` : Number(currentMember.points || 0)}
              </span>
              {!currentMember.isNew && Number(currentMember.points || 0) >= REDEEM_POINTS_THRESHOLD && (
                <button onClick={() => setUsePoints(!usePoints)}
                  className={`ml-1 px-2 h-6 rounded-full text-[9px] font-black uppercase flex items-center gap-1 transition-all ${usePoints ? 'bg-[var(--accent-orange)] text-white' : 'bg-[var(--accent-orange-light)] text-[var(--accent-orange)]'}`}>
                  <Gift size={10} />{usePoints ? 'ยกเลิก' : `ใช้ ${REDEEM_POINTS_THRESHOLD}`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderCartTotals = (onConfirm) => (
    <div className="px-5 py-4 space-y-3 bg-[var(--bg-secondary)] border-t border-[var(--border-color)] shrink-0">
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-[var(--text-secondary)]">
          <span>รวม</span>
          <span className="font-bold">฿{subtotal.toLocaleString()}</span>
        </div>
        {bringOwnGlass && (
          <div className="flex justify-between text-xs text-[var(--accent-emerald)]">
            <span>ส่วนลดแก้วส่วนตัว</span>
            <span className="font-bold">-฿{OWN_GLASS_DISCOUNT}</span>
          </div>
        )}
        {usePoints && (
          <div className="flex justify-between text-xs text-[var(--accent-emerald)]">
            <span>ใช้แต้มสะสม</span>
            <span className="font-bold">-฿{REDEEM_DISCOUNT_VALUE}</span>
          </div>
        )}
        {vatAmount > 0 && (
          <div className="flex justify-between text-xs text-[var(--text-secondary)]">
            <span>VAT 7%</span>
            <span className="font-bold">+฿{vatAmount.toLocaleString()}</span>
          </div>
        )}
        <div className="flex items-end justify-between pt-1">
          <span className="text-sm font-bold text-[var(--text-primary)]">ยอดสุทธิ</span>
          <span className="text-3xl font-black text-[var(--accent-emerald)] leading-none">฿{netTotal.toLocaleString()}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setIsPaid(false)}
          className={`h-11 rounded-2xl text-[13px] font-black flex items-center justify-center gap-1.5 transition-all ${!isPaid ? 'bg-[var(--accent-orange)] text-white shadow-lg' : 'bg-[var(--accent-orange-light)] text-[var(--accent-orange)]'}`}>
          <Wallet size={14} strokeWidth={2.5} /> ยังไม่จ่าย
        </button>
        <button onClick={() => setIsPaid(true)}
          className={`h-11 rounded-2xl text-[13px] font-black flex items-center justify-center gap-1.5 transition-all ${isPaid ? 'bg-[var(--accent-emerald)] text-white shadow-lg' : 'bg-[var(--accent-emerald-light)] text-[var(--accent-emerald)]'}`}>
          <CreditCard size={14} strokeWidth={2.5} /> จ่ายแล้ว
        </button>
      </div>

      <button onClick={onConfirm} disabled={cart.length === 0}
        className="w-full h-14 rounded-2xl text-[15px] font-black flex items-center justify-center gap-2 bg-[var(--accent-emerald)] text-white active:scale-[0.98] transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ boxShadow: cart.length === 0 ? 'none' : '0 8px 24px -8px var(--accent-emerald)' }}>
        <CheckCircle size={18} strokeWidth={2.5} />
        {editingOrderId ? 'บันทึกการแก้ไข' : 'ยืนยันการสั่งซื้อ'}
        <ArrowRight size={18} strokeWidth={2.5} />
      </button>
    </div>
  );

  return (
    <>
      <div data-pos="main" className="flex flex-col md:flex-row h-full animate-in fade-in duration-500"
        style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        {/* LEFT: Desktop Category Sidebar */}
        <div data-pos="sidebar-cat"
          className="hidden md:flex w-[76px] lg:w-[200px] flex-shrink-0 flex-col p-4 gap-3 border-r z-10"
          style={{ borderColor: 'var(--border-color)', background: 'var(--bg-primary)' }}>
          <div className="flex items-center gap-2 px-1 pt-1 pb-1">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center text-white font-black text-base shrink-0 shadow-lg"
              style={{ background: 'var(--accent-emerald)', boxShadow: '0 4px 12px -4px var(--accent-emerald)' }}>S</div>
            <div className="hidden lg:block min-w-0">
              <div className="text-[14px] font-black leading-tight text-[var(--text-primary)]">Siwara</div>
              <div className="text-[10px] text-[var(--text-muted)] leading-tight">POS System</div>
            </div>
          </div>
          <div className="hidden lg:block text-[10px] font-black uppercase tracking-widest px-2 mt-2 text-[var(--text-muted)]">หมวดหมู่</div>
          <div className="flex flex-col gap-1.5 flex-1 overflow-y-auto scrollbar-hide">
            {categories.map(cat => {
              const isActive = activeCategory === cat;
              return (
                <button key={cat} onClick={() => { setActiveCategory(cat); setSearchTerm(''); }}
                  className={`w-full flex items-center lg:gap-3 gap-1.5 rounded-2xl transition-all active:scale-95 lg:flex-row flex-col lg:py-3 lg:px-4 py-3 px-2`}
                  style={{
                    background: isActive ? 'var(--accent-emerald)' : 'transparent',
                    color: isActive ? '#fff' : 'var(--text-secondary)'
                  }}>
                  {cat === 'แนะนำ' ? <Star size={18} strokeWidth={isActive ? 2.5 : 1.8} fill={isActive ? 'currentColor' : 'none'} /> : <Coffee size={18} strokeWidth={isActive ? 2.5 : 1.8} />}
                  <span className="lg:text-sm text-[10px] font-black tracking-tight leading-tight text-center lg:text-left">{String(cat)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mobile Category Chips */}
        <div data-pos="mobile-cat" className="md:hidden flex overflow-x-auto scrollbar-hide px-4 py-2 gap-2 shrink-0"
          style={{ background: 'var(--bg-primary)' }}>
          {categories.map(cat => {
            const isActive = activeCategory === cat;
            return (
              <button key={cat} onClick={() => { setActiveCategory(cat); setSearchTerm(''); }}
                className="flex items-center gap-1.5 px-4 h-10 rounded-full flex-shrink-0 text-[12px] font-black active:scale-95 transition-all"
                style={{
                  background: isActive ? 'var(--accent-emerald)' : 'var(--bg-secondary)',
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${isActive ? 'var(--accent-emerald)' : 'var(--border-color)'}`
                }}>
                {cat === 'แนะนำ' ? <Star size={12} strokeWidth={2} fill={isActive ? 'currentColor' : 'none'} /> : <Coffee size={12} strokeWidth={2} />}
                {String(cat)}
              </button>
            );
          })}
        </div>

        {/* CENTER: Menu Grid */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="px-3 md:px-5 pt-3 md:pt-4 pb-2 flex items-center gap-2 md:gap-3 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={18} />
              <input type="text" placeholder="ค้นหาเมนู..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-14 pl-12 pr-4 rounded-2xl text-[15px] outline-none font-medium transition-all focus:ring-2 focus:ring-[var(--accent-emerald)]/20"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }} />
            </div>

            <div className="hidden lg:flex items-center gap-1.5 px-2 h-14 rounded-2xl shrink-0"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <span className="text-[11px] font-black uppercase tracking-wide px-2 text-[var(--text-muted)]">Show</span>
              {MENU_PAGE_OPTIONS.map(n => {
                const isActive = itemsPerPage === n;
                return (
                  <button key={n} onClick={() => setItemsPerPage(n)}
                    className="w-9 h-9 rounded-xl text-xs font-black transition-all active:scale-95"
                    style={{ background: isActive ? 'var(--accent-emerald)' : 'transparent', color: isActive ? '#fff' : 'var(--text-secondary)' }}>{n}</button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 px-4 h-14 rounded-2xl font-black shrink-0"
              style={{ background: 'var(--accent-emerald-light)', color: 'var(--accent-emerald)', border: '1px solid color-mix(in srgb, var(--accent-emerald) 20%, transparent)' }}>
              <Receipt size={16} strokeWidth={2.5} />
              <span className="text-sm hidden sm:inline">คิว</span>
              <span className="text-lg">#{currentQueue}</span>
            </div>
          </header>

          {/* Section heading */}
          <div className="px-3 md:px-5 pb-2 flex items-center justify-between shrink-0">
            <div>
              <div className="text-[18px] md:text-[22px] font-black tracking-tight text-[var(--text-primary)] leading-tight">
                {activeCategory}
              </div>
              <div className="text-[11px] md:text-xs text-[var(--text-muted)] font-medium">
                {filteredMenu.length} เมนู · แตะเพื่อเพิ่มลงตะกร้า
              </div>
            </div>
            {activePromotion ? (
              <div className="hidden sm:flex items-center gap-2 px-3 h-9 rounded-xl text-[11px] font-bold"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                <Zap size={12} fill="currentColor" className="text-violet-500" />
                <span className="truncate max-w-[160px]">{activePromotion.title}</span>
                <button onClick={() => setActivePromotion(null)} className="text-[var(--text-muted)] hover:text-red-500"><X size={12} /></button>
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-1.5 px-3 h-9 rounded-xl text-[11px] font-bold"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                <Flame size={12} /> Rush Hour
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden relative">
            <div data-pos="menu-grid" className="flex-1 overflow-y-auto px-3 md:px-5 pb-24 md:pb-8 scrollbar-hide">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                {isSyncing && <div className="col-span-full"><Skeleton.MenuGrid items={8} /></div>}
                {!isSyncing && pagedMenu.length === 0 && (
                  <div className="col-span-full">
                    <EmptyState icon="search" title="ไม่พบเมนูในหมวดนี้" description="ลองเลือกหมวดหมู่อื่นหรือเพิ่มเมนูใหม่" size="sm" />
                  </div>
                )}
                {pagedMenu.map(item => (
                  <div key={item.id} onClick={() => addToCart(item)}
                    className="group relative rounded-3xl overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.97] animate-in zoom-in-95"
                    style={{ background: 'var(--bg-secondary)', boxShadow: '0 1px 0 var(--border-color), 0 8px 24px -12px var(--shadow-color)' }}>
                    {(item.isFeatured || item.recommended) && (
                      <div className="absolute top-3 left-3 z-10 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black"
                        style={{ background: 'var(--accent-orange)', color: '#fff', letterSpacing: '0.02em' }}>
                        <Star size={10} strokeWidth={2.5} fill="currentColor" />
                        <span>แนะนำ</span>
                      </div>
                    )}
                    <div className="aspect-[4/3] md:aspect-[4/3] bg-[var(--bg-tertiary)] overflow-hidden shrink-0">
                      <img src={item.image || 'https://via.placeholder.com/300x300?text=No+Image'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        alt={item.name} loading="lazy" />
                    </div>
                    <div className="p-3.5 space-y-1">
                      <div className="text-[13px] leading-tight font-bold line-clamp-2 min-h-[2.4em] text-[var(--text-primary)]">{String(item.name)}</div>
                      <div className="flex items-baseline justify-between pt-1">
                        <div className="text-xl font-black text-[var(--accent-emerald)]">฿{Number(item.price).toLocaleString()}</div>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center transition-all group-hover:scale-110"
                          style={{ background: 'var(--accent-emerald-light)', color: 'var(--accent-emerald)' }}>
                          <Plus size={16} strokeWidth={2.5} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {totalPages > 1 && (
              <div className={`absolute left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2.5 rounded-full z-10 animate-in slide-in-from-bottom-4 transition-all duration-500 ${isNavExpanded ? 'bottom-28' : 'bottom-6'}`}
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', boxShadow: '0 8px 24px -8px var(--shadow-color)' }}>
                <button disabled={menuPage === 1} onClick={() => setMenuPage(p => Math.max(1, p - 1))} aria-label="ก่อนหน้า"
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-all disabled:opacity-30"
                  style={{ background: 'var(--accent-emerald-light)', color: 'var(--accent-emerald)' }}>
                  <ChevronLeft size={18} strokeWidth={2.5} />
                </button>
                <div className="flex items-center gap-1.5 px-1">
                  <span className="text-sm font-black text-[var(--accent-emerald)]">{menuPage}</span>
                  <span className="text-[11px] font-bold text-[var(--text-muted)]">/ {totalPages}</span>
                </div>
                <button disabled={menuPage === totalPages} onClick={() => setMenuPage(p => Math.min(totalPages, p + 1))} aria-label="ถัดไป"
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-all disabled:opacity-30"
                  style={{ background: 'var(--accent-emerald-light)', color: 'var(--accent-emerald)' }}>
                  <ChevronRight size={18} strokeWidth={2.5} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Desktop Cart Sidebar */}
        <div data-pos="sidebar-cart"
          className="hidden md:flex w-72 lg:w-[340px] flex-col shrink-0 p-3 lg:p-4"
          style={{ borderLeft: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
          <div className="flex flex-col h-full rounded-3xl overflow-hidden"
            style={{ background: 'var(--bg-secondary)', boxShadow: '0 1px 0 var(--border-color), 0 8px 24px -12px var(--shadow-color)' }}>
            {/* 1. Header */}
            <div className="px-5 py-4 flex items-center justify-between shrink-0 border-b"
              style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0"
                  style={{ background: 'var(--accent-emerald)' }}>
                  <ShoppingBag size={16} strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-black text-[var(--text-primary)] leading-tight">ตะกร้า</div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">{cartCount} รายการ · คิว #{currentQueue}</div>
                </div>
              </div>
              <button onClick={() => { setCart([]); setUsePoints(false); setBringOwnGlass(false); }}
                className="text-xs font-bold flex items-center gap-1 text-[var(--text-muted)] hover:text-red-500 transition-colors px-2 py-1.5 rounded-lg">
                <Trash2 size={13} strokeWidth={2.5} /> ล้าง
              </button>
            </div>

            {/* 2. Items */}
            {renderCartItems(false)}

            {/* 3. Options */}
            {renderCartOptions()}

            {/* 4. Totals + CTA */}
            {renderCartTotals(handleCheckout)}
          </div>
        </div>
      </div>

      {/* Mobile Floating Cart Bar */}
      {cart.length > 0 && (
        <button data-pos="mobile-cart-btn" onClick={() => setIsMobileCartOpen(true)}
          className={`md:hidden fixed left-3 right-3 rounded-2xl p-1.5 flex items-center gap-2 active:scale-[0.98] transition-transform z-[90] ${isNavExpanded ? 'bottom-24' : 'bottom-6'}`}
          style={{ background: 'var(--accent-emerald)', boxShadow: '0 20px 40px -16px var(--accent-emerald)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 relative bg-white/20 text-white">
            <ShoppingBag size={18} strokeWidth={2.5} />
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white flex items-center justify-center text-[10px] font-black"
              style={{ color: 'var(--accent-emerald)' }}>{cartCount}</div>
          </div>
          <div className="flex-1 text-left text-white">
            <div className="text-[10px] opacity-80 font-bold leading-none">ยอดสุทธิ</div>
            <div className="text-[15px] font-black leading-none mt-0.5">฿{netTotal.toLocaleString()}</div>
          </div>
          <div className="h-10 px-4 rounded-xl flex items-center gap-1.5 text-[12px] font-black bg-white"
            style={{ color: 'var(--accent-emerald)' }}>
            ยืนยันสั่ง <ArrowRight size={14} strokeWidth={2.5} />
          </div>
        </button>
      )}

      {/* Empty-cart FAB (mobile, to open drawer anyway) */}
      {cart.length === 0 && (
        <button data-pos="mobile-cart-btn" onClick={() => setIsMobileCartOpen(true)}
          className={`md:hidden fixed right-4 rounded-full p-4 shadow-2xl active:scale-95 transition-transform z-[90] ${isNavExpanded ? 'bottom-24' : 'bottom-6'}`}
          style={{ background: 'var(--accent-emerald)', color: '#fff' }}>
          <ShoppingBag size={22} strokeWidth={2.5} />
        </button>
      )}

      {/* Mobile Cart Drawer */}
      {isMobileCartOpen && (
        <div data-pos="mobile-cart-drawer" className="md:hidden fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-md flex flex-col animate-in slide-in-from-right"
            style={{ background: 'var(--bg-primary)' }}>
            <div className="p-3 flex flex-col h-full">
              <div className="flex-1 flex flex-col rounded-3xl overflow-hidden"
                style={{ background: 'var(--bg-secondary)' }}>
                {/* Header */}
                <div className="px-5 py-4 flex items-center justify-between shrink-0 border-b"
                  style={{ borderColor: 'var(--border-color)' }}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0"
                      style={{ background: 'var(--accent-emerald)' }}>
                      <ShoppingBag size={16} strokeWidth={2.5} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-black text-[var(--text-primary)]">ตะกร้า</div>
                      <div className="text-[11px] text-[var(--text-muted)] truncate">{cartCount} รายการ · คิว #{currentQueue}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setCart([]); setUsePoints(false); setBringOwnGlass(false); }}
                      className="text-xs font-bold text-[var(--text-muted)] hover:text-red-500 px-2 py-1.5 rounded-lg">
                      <Trash2 size={14} strokeWidth={2.5} />
                    </button>
                    <button onClick={() => setIsMobileCartOpen(false)} aria-label="ปิด"
                      className="p-2 rounded-lg text-[var(--text-muted)]">
                      <X size={20} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>

                {renderCartItems(true)}
                {renderCartOptions()}
                {renderCartTotals(() => { handleCheckout(); setIsMobileCartOpen(false); })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bean Modifier Selection Modal */}
      <Modal isOpen={!!pendingBeanItem} onClose={() => setPendingBeanItem(null)} title="เลือกเมล็ดกาแฟ" size="sm">
        {pendingBeanItem && (
          <div className="space-y-4">
            <p className="text-center font-medium -mt-2 mb-4 text-[var(--text-secondary)]">{pendingBeanItem.name}</p>
            <div className="space-y-3">
              <button onClick={() => addToCartWithBean(pendingBeanItem, null)}
                className="w-full p-4 rounded-xl border flex items-center justify-between hover:border-[var(--accent-emerald)] transition-all"
                style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-color)' }}>
                <span className="font-bold text-[var(--text-primary)]">ไม่เพิ่มกาแฟ</span>
                <span className="font-black text-[var(--accent-emerald)]">฿{Number(pendingBeanItem.price).toLocaleString()}</span>
              </button>
              {beanModifiers.map(mod => (
                <button key={mod.id} onClick={() => addToCartWithBean(pendingBeanItem, mod)}
                  className="w-full p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 flex items-center justify-between hover:border-amber-500 transition-all">
                  <span className="font-bold text-amber-800 dark:text-amber-400">#{mod.name}</span>
                  <span className="font-bold text-amber-600">฿{Number(mod.price).toLocaleString()}</span>
                </button>
              ))}
            </div>
            <Button variant="secondary" fullWidth onClick={() => setPendingBeanItem(null)}>ยกเลิก</Button>
          </div>
        )}
      </Modal>
    </>
  );
}
