import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Search, Star, Receipt, Minus, Plus, Edit3, Tag, Zap, X, PlusCircle,
  Coffee, Users, Gift, Wallet, CreditCard, ChevronLeft, ChevronRight,
  ShoppingBag, CheckCircle2, RefreshCcw
} from 'lucide-react';
import { collection, doc, addDoc, setDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { useAppContext } from '../../context/AppContext';
import { getISODate, getNameKey } from '../../utils/calculations';
import useDebounce from '../../hooks/useDebounce';
import { trackRecommendationsShown, trackRecommendationAccepted } from '../../services/upsellTracker';
import { Button, Modal, IconButton, Badge, Spinner, EmptyState, useToast, Skeleton } from '../ui';
import {
  DEFAULT_REDEEM_POINTS_THRESHOLD,
  DEFAULT_REDEEM_DISCOUNT_VALUE,
  DEFAULT_OWN_GLASS_DISCOUNT,
  DEFAULT_ITEMS_PER_PAGE,
  VAT_RATE,
  DEBOUNCE_DELAY,
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

  // Cart states
  const [cart, setCart] = useState([]);
  const [activeCategory, setActiveCategory] = useState('แนะนำ');
  const [searchTerm, setSearchTerm] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [usePoints, setUsePoints] = useState(false);
  const [bringOwnGlass, setBringOwnGlass] = useState(false);
  const [pendingBeanItem, setPendingBeanItem] = useState(null);

  // AI Recommendations
  const [recommendations, setRecommendations] = useState([]);
  const [isRecommending, setIsRecommending] = useState(false);

  // Pagination
  const [menuPage, setMenuPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_ITEMS_PER_PAGE);

  // Member states
  const [memberPhone, setMemberPhone] = useState('');
  const [memberNickname, setMemberNickname] = useState('');
  const [currentMember, setCurrentMember] = useState(null);

  // Mobile
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [isRefreshingMembers, setIsRefreshingMembers] = useState(false);

  const debouncedSearchTerm = useDebounce(searchTerm, 200);

  // Memos
  const subtotal = useMemo(() => cart.reduce((s, i) => s + (Number(i.price) * Number(i.quantity)), 0), [cart]);

  const discountAmount = useMemo(() => {
    let d = 0;
    if (usePoints) d += REDEEM_DISCOUNT_VALUE;
    if (bringOwnGlass) d += OWN_GLASS_DISCOUNT;

    // Add item-level promotion percentage discount
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
    // ถ้ามีคำค้นหา → ค้นทุกหมวดเลย ไม่ต้องเลือกหมวดก่อน
    if (search) {
      return menu.filter(i => i.available !== false && String(i.name || '').toLowerCase().includes(search));
    }
    // ไม่มีคำค้นหา → กรองตามหมวดปกติ
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

  // Effects
  useEffect(() => {
    setMenuPage(1);
  }, [activeCategory, debouncedSearchTerm, itemsPerPage]);

  // Check member by phone (9-10 digits)
  useEffect(() => {
    if (memberPhone.length >= 9) {
      const found = members.find(m => m.phone === memberPhone);
      if (found) {
        setCurrentMember(found);
        setMemberNickname(found.name || '');
      } else {
        // New member with phone - keep nickname if already entered
        setCurrentMember({ phone: memberPhone, points: 0, name: memberNickname || 'ลูกค้าใหม่', isNew: true });
      }
    } else if (memberPhone.length > 0 && memberPhone.length < 9) {
      // Phone is being typed but not complete yet
      setCurrentMember(null);
      setUsePoints(false);
    } else if (!memberPhone && !memberNickname) {
      // Both empty - clear
      setCurrentMember(null);
      setUsePoints(false);
    }
  }, [memberPhone, members, memberNickname]);

  // Check member by nickname only (when no phone)
  useEffect(() => {
    if (memberPhone && memberPhone.length >= 9) return; // Phone takes priority
    const nameKey = getNameKey(memberNickname);
    if (!nameKey) {
      if (!memberPhone) {
        setCurrentMember(null);
        setUsePoints(false);
      }
      return;
    }
    const found = members.find(m => getNameKey(m.name) === nameKey);
    if (found) {
      setCurrentMember(found);
      if (found.phone) setMemberPhone(found.phone);
    } else {
      // New member with name only
      setCurrentMember({ phone: '', points: 0, name: memberNickname, isNew: true });
    }
  }, [memberNickname, memberPhone, members]);

  // Load Order for Editing - only when editingOrderId changes, NOT on every orders update
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  const prevEditingIdRef = useRef(null);
  useEffect(() => {
    // Only load when editingOrderId actually changes to a new value
    if (editingOrderId && editingOrderId !== prevEditingIdRef.current) {
      const orderToEdit = ordersRef.current.find(o => o.id === editingOrderId);
      if (orderToEdit) {
        setCart(orderToEdit.items || []);
        setIsPaid(orderToEdit.isPaid || false);
        setBringOwnGlass(orderToEdit.bringOwnGlass || false);
        setUsePoints(false);
        if (orderToEdit.memberPhone) {
          setMemberPhone(orderToEdit.memberPhone);
        }
        if (orderToEdit.memberNickname) {
          setMemberNickname(orderToEdit.memberNickname);
        }
      } else {
        // Order was deleted while trying to edit
        toast.warning('บิลนี้ถูกลบแล้ว');
        setEditingOrderId(null);
      }
    }
    prevEditingIdRef.current = editingOrderId;
  }, [editingOrderId]);

  // Featured items for quick add
  const featuredItems = useMemo(() => menu.filter(i => i.isFeatured && i.available !== false), [menu]);

  // Keyboard Shortcuts Event Listener - use refs to avoid re-registering on every cart change
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
          setCart([]);
          setUsePoints(false);
          setBringOwnGlass(false);
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
        default:
          break;
      }
    };

    window.addEventListener('pos-shortcut', handlePosShortcut);
    return () => window.removeEventListener('pos-shortcut', handlePosShortcut);
  }, []); // Empty deps - uses refs for latest values

  // Handlers
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
        if (existing) {
          existing.usage = (Number(existing.usage) || 0) + (Number(link.usage) || 0);
        } else {
          mergedStockLinks.push({ ...link });
        }
      });
    }

    setCart(prev => {
      const existing = prev.find(c => c.cartId === cartItemId);
      if (existing) {
        return prev.map(c => c.cartId === cartItemId ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, {
        ...item,
        cartId: cartItemId,
        price: finalPrice,
        beanModifier: modifierName,
        stockLinks: mergedStockLinks,
        quantity: 1,
        note: modifierName
      }];
    });
    setPendingBeanItem(null);
  };

  const updateCartItemNote = (cartItemId, note) => setCart(prev => prev.map(item => (item.cartId || item.id) === cartItemId ? { ...item, note } : item));
  const updateQuantity = (cartItemId, d) => setCart(prev => prev.map(item => (item.cartId || item.id) === cartItemId ? { ...item, quantity: Math.max(0, item.quantity + d) } : item).filter(item => item.quantity > 0));

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
        items: cart,
        subtotal: Number(subtotal),
        discount: Number(discountAmount),
        vat: Number(vatAmount),
        total: Number(netTotal),
        vatIncluded: vatEnabled,
        isPaid,
        memberPhone: currentMember?.phone || '',
        memberNickname: memberNickname,
        status: 'pending',
        promotionTitle: activePromotion?.title || '',
        promotionDiscountPercent: activePromotion?.discountPercent || 0,
        bringOwnGlass: bringOwnGlass,
        createdAt: serverTimestamp(),
        date: getISODate(),
        time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        table: 'Walk-in'
      };

      // --- Member creation/update (runs for BOTH new and edited orders) ---
      const nameKey = getNameKey(memberNickname);
      const phoneValid = memberPhone && memberPhone.length >= 9; // รองรับเบอร์ 9-10 หลัก
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

        // Only add points for NEW orders (not edits)
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
        // Preserve original order status when editing
        const originalOrder = orders.find(o => o.id === editingOrderId);
        const editData = { ...orderData, updatedAt: serverTimestamp() };
        if (originalOrder?.status) {
          editData.status = originalOrder.status;
        }
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', editingOrderId), editData);
        setEditingOrderId(null);
      } else {
        // Deduct points if using redemption
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
        // Track recommendations shown
        if (suggestedItems.length > 0) {
          trackRecommendationsShown(suggestedItems);
        }
      } else {
        const fallbackItems = availableMenu.filter(m => m.recommended).slice(0, 3);
        setRecommendations(fallbackItems);
        if (fallbackItems.length > 0) {
          trackRecommendationsShown(fallbackItems);
        }
      }
    } catch (error) {
      console.error('Smart Upsell Error:', error);
    } finally {
      setIsRecommending(false);
    }
  };

  return (
    <>
      <div data-pos="main" className="flex flex-col md:flex-row h-full animate-in fade-in duration-500">
        {/* Left Category Sidebar */}
        <div data-pos="sidebar-cat" className="hidden md:flex w-20 lg:w-24 xl:w-32 bg-white border-r border-gray-100 flex-col items-center py-4 lg:py-4 xl:py-8 gap-2 lg:gap-2 xl:gap-4 shadow-xl z-10 text-gray-800">
          <div className="w-12 h-12 lg:w-14 lg:h-14 xl:w-20 xl:h-20 bg-emerald-500 rounded-2xl lg:rounded-2xl xl:rounded-3xl flex items-center justify-center text-white mb-4 lg:mb-4 xl:mb-8 shadow-lg font-black text-xl lg:text-xl xl:text-3xl tracking-tighter uppercase border-b-4 border-emerald-700 shadow-emerald-500/20">S</div>
          <div className="flex-1 overflow-y-auto w-full px-2 lg:px-2 xl:px-3 space-y-2 lg:space-y-2 xl:space-y-4 scrollbar-hide">
            {categories.map(cat => (
              <button key={cat} onClick={() => { setActiveCategory(cat); setSearchTerm(''); }} className={`w-full py-3 lg:py-3 xl:py-7 rounded-xl lg:rounded-xl xl:rounded-[1.5rem] text-xs lg:text-xs xl:text-sm font-black uppercase tracking-wider lg:tracking-wider xl:tracking-widest transition-all ${activeCategory === cat ? 'bg-emerald-500 text-white shadow-xl shadow-emerald-500/20 scale-105' : 'text-gray-400 hover:bg-gray-50 hover:text-emerald-500'}`}>{String(cat)}</button>
            ))}
          </div>
        </div>

        {/* Mobile Category Bar */}
        <div data-pos="mobile-cat" className="md:hidden flex overflow-x-auto scrollbar-hide bg-white border-b border-gray-100 px-4 py-3 gap-2 shrink-0">
          {categories.map(cat => (
            <button key={cat} onClick={() => { setActiveCategory(cat); setSearchTerm(''); }} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all shrink-0 ${activeCategory === cat ? 'bg-emerald-500 text-white shadow-lg' : 'bg-gray-100 text-gray-500'}`}>{String(cat)}</button>
          ))}
        </div>

        <div className="flex-1 flex flex-col bg-[#f8faf9] min-w-0 overflow-hidden">
          <header className="h-16 md:h-16 lg:h-16 xl:h-24 bg-white border-b border-gray-100 px-3 md:px-6 lg:px-8 xl:px-10 flex items-center justify-between sticky top-0 z-10 text-gray-800 shrink-0 gap-2 md:gap-4">
            <div className="relative flex-1 max-w-xs md:max-w-md lg:max-w-xl">
              <Search className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
              <input type="text" placeholder="ค้นหา..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-gray-50 border-none rounded-xl md:rounded-2xl lg:rounded-3xl py-2.5 md:py-3.5 lg:py-4 pl-10 md:pl-14 lg:pl-16 pr-4 text-sm md:text-base focus:ring-2 focus:ring-emerald-500/10 outline-none transition-all text-gray-800 font-bold" />
            </div>
            <div className="flex items-center gap-2 md:gap-4 lg:gap-6 text-gray-800">
              {activePromotion && (
                <div className="hidden sm:flex items-center gap-4 bg-violet-50 px-6 py-2 rounded-2xl border border-violet-100 animate-in slide-in-from-top duration-500 overflow-hidden relative group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-violet-500"></div>
                  <div>
                    <span className="text-xs font-black text-violet-600 uppercase tracking-widest block leading-none mb-1 flex items-center gap-1"><Zap size={10} fill="currentColor" /> โปรโมชั่นปัจจุบัน</span>
                    <p className="text-xs font-black text-gray-800 truncate max-w-[200px]">{activePromotion.title} {activePromotion.code && <span className="text-xs text-violet-400 opacity-60 ml-1">({activePromotion.code})</span>}</p>
                  </div>
                  <button onClick={() => setActivePromotion(null)} className="p-1 px-3 text-xs font-black text-gray-400 hover:text-red-500 bg-white border border-gray-100 rounded-lg shadow-sm">ลบออก</button>
                </div>
              )}

              <div className="hidden lg:flex items-center gap-2 bg-gray-50 p-1.5 rounded-2xl border border-gray-100">
                <span className="text-xs font-black text-gray-400 pl-2 uppercase tracking-wider">Show:</span>
                {MENU_PAGE_OPTIONS.map(num => (
                  <button key={num} onClick={() => setItemsPerPage(num)} className={`w-8 h-8 rounded-xl text-xs font-black transition-all ${itemsPerPage === num ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 scale-105' : 'text-gray-400 hover:bg-white hover:text-emerald-500 hover:shadow-sm'}`}>{num}</button>
                ))}
              </div>

              <div className="bg-emerald-50 text-emerald-600 px-3 md:px-6 lg:px-8 py-2 md:py-3 lg:py-4 rounded-xl md:rounded-2xl lg:rounded-3xl border border-emerald-100 font-black text-xs md:text-sm lg:text-lg uppercase tracking-wider lg:tracking-widest shadow-sm">{editingOrderId ? `#${orders.find(o => o.id === editingOrderId)?.queueNumber}` : `#${queueCounter}`}</div>
            </div>
          </header>

          <div className="flex-1 flex flex-col overflow-hidden relative">
            <div data-pos="menu-grid" className="flex-1 overflow-y-auto p-3 md:p-4 lg:p-4 xl:p-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-3 lg:gap-4 xl:gap-6 scrollbar-hide text-gray-800 content-start pb-24 md:pb-28 lg:pb-28 xl:pb-52">
              {isSyncing && (
                <div className="col-span-full"><Skeleton.MenuGrid items={8} /></div>
              )}
              {!isSyncing && pagedMenu.length === 0 && (
                <div className="col-span-full">
                  <EmptyState icon="search" title="ไม่พบเมนูในหมวดนี้" description="ลองเลือกหมวดหมู่อื่นหรือเพิ่มเมนูใหม่" size="sm" />
                </div>
              )}
              {pagedMenu.map(item => (
                <div key={item.id} onClick={() => addToCart(item)} className="bg-white rounded-[2.5rem] border border-gray-50 overflow-hidden cursor-pointer hover:border-emerald-500 hover:shadow-2xl transition-all duration-300 active:scale-95 group relative shadow-sm text-gray-800 flex flex-col h-full animate-in zoom-in-95 duration-200">
                  {(item.isFeatured || item.recommended) && <div className="absolute top-4 left-4 z-10 bg-orange-500 text-white text-xs font-black px-4 py-1.5 rounded-full shadow-lg flex items-center gap-2 border border-white/20"><Star size={12} fill="white" stroke="white" /> แนะนำ</div>}
                  <div className="h-32 lg:h-40 bg-gray-100 overflow-hidden shrink-0">
                    <img src={item.image || 'https://via.placeholder.com/300x300?text=No+Image'} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={item.name} />
                  </div>
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <h3 className="text-base lg:text-lg font-black text-gray-800 line-clamp-3 min-h-[64px] leading-[1.3] mb-2">{String(item.name)}</h3>
                    <p className="text-emerald-500 font-black text-xl lg:text-2xl mt-auto">฿{Number(item.price).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className={`absolute left-1/2 -translate-x-1/2 flex items-center gap-4 bg-white/90 backdrop-blur-xl px-10 py-5 rounded-[2.5rem] shadow-2xl border border-white/50 z-10 animate-in slide-in-from-bottom-4 transition-all duration-500 ${isNavExpanded ? 'bottom-32' : 'bottom-8'}`}>
                <button disabled={menuPage === 1} onClick={() => setMenuPage(p => Math.max(1, p - 1))} aria-label="หน้าก่อนหน้า" className={`p-3.5 rounded-2xl transition-all ${menuPage === 1 ? 'text-gray-200 cursor-not-allowed' : 'text-emerald-500 bg-emerald-50 hover:bg-emerald-500 hover:text-white shadow-sm'}`}><ChevronLeft size={24} strokeWidth={3} /></button>
                <div className="flex items-center gap-3 px-4">
                  <span className="text-sm font-black text-emerald-600 bg-emerald-50 w-12 h-12 flex items-center justify-center rounded-2xl shadow-inner">{menuPage}</span>
                  <span className="text-xs font-black text-gray-300 uppercase tracking-widest">จาก {totalPages} หน้า</span>
                </div>
                <button disabled={menuPage === totalPages} onClick={() => setMenuPage(p => Math.min(totalPages, p + 1))} aria-label="หน้าถัดไป" className={`p-3.5 rounded-2xl transition-all ${menuPage === totalPages ? 'text-gray-200 cursor-not-allowed' : 'text-emerald-500 bg-emerald-50 hover:bg-emerald-500 hover:text-white shadow-sm'}`}><ChevronRight size={24} strokeWidth={3} /></button>
              </div>
            )}
          </div>
        </div>

        {/* Cart Sidebar */}
        <div data-pos="sidebar-cart" className="hidden md:flex w-72 lg:w-80 xl:w-96 2xl:w-[420px] bg-white border-l border-gray-100 shadow-[-15px_0_40px_rgba(0,0,0,0.02)] flex-col z-20 overflow-hidden text-gray-800">
          <div className="p-4 lg:p-4 xl:p-8 border-b flex justify-between items-center bg-gray-50/40 text-gray-800 shrink-0">
            <div className="flex items-center gap-2 lg:gap-4 font-black text-lg lg:text-xl xl:text-2xl tracking-tighter uppercase text-gray-800"><Receipt size={20} className="text-emerald-500 lg:w-6 lg:h-6" /> ตะกร้า</div>
            <button onClick={() => { setCart([]); setUsePoints(false); setBringOwnGlass(false); }} className="text-xs lg:text-xs text-gray-400 font-black uppercase hover:text-red-500 transition-colors px-2 lg:px-4 py-1.5 lg:py-2 hover:bg-red-50 rounded-xl">ล้าง</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 lg:p-3 xl:p-6 space-y-3 lg:space-y-3 scrollbar-hide text-gray-800 min-h-0">
            {cart.map(item => (
              <div key={item.cartId || item.id} className="py-3 lg:py-5 px-3 lg:px-5 bg-[#fcfdfc] rounded-xl lg:rounded-[2rem] border border-emerald-50/50 shadow-sm transition-all group space-y-2 lg:space-y-4 text-gray-800">
                <div className="flex gap-2 lg:gap-4 text-gray-800">
                  <div className="flex-1 min-w-0 text-gray-800">
                    <p className="text-base font-black text-gray-800 truncate mb-1">{String(item.name)}</p>
                    {item.beanModifier && <span className="text-xs font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">{item.beanModifier}</span>}
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mt-1">฿{Number(item.price).toLocaleString()} x {Number(item.quantity)}</p>
                  </div>
                  <div className="flex items-center bg-white border border-gray-100 rounded-2xl p-1.5 shadow-sm text-gray-800 h-fit">
                    <button onClick={() => updateQuantity(item.cartId || item.id, -1)} aria-label="ลดจำนวน" className="p-2 hover:text-red-500 text-gray-400 transition-colors"><Minus size={18} /></button>
                    <span className="w-10 text-center text-base font-black text-gray-800">{Number(item.quantity)}</span>
                    <button onClick={() => updateQuantity(item.cartId || item.id, 1)} aria-label="เพิ่มจำนวน" className="p-2 hover:text-emerald-500 text-gray-400 transition-colors"><Plus size={18} /></button>
                  </div>
                </div>
                <div className="flex items-center gap-2 relative text-gray-800">
                  <div className="relative flex-1">
                    <Edit3 size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" />
                    <input type="text" placeholder="ระบุตัวเลือกพิเศษ..." value={item.note || ''} onChange={(e) => updateCartItemNote(item.cartId || item.id, e.target.value)} className="w-full bg-white/50 border border-gray-100 rounded-2xl py-3.5 pl-12 pr-6 text-xs font-bold outline-none focus:bg-white text-gray-800" />
                  </div>
                  {activePromotion && (
                    <button onClick={() => toggleItemPromo(item.cartId || item.id)} className={`p-3.5 rounded-2xl border transition-all flex items-center justify-center gap-2 ${item.promoApplied ? 'bg-violet-600 text-white border-violet-700 shadow-lg' : 'bg-white text-violet-500 border-violet-100 hover:bg-violet-50'}`} title="ใช้โปรโมชั่นกับเมนูนี้">
                      <Tag size={16} />
                      {item.promoApplied && <span className="text-xs font-black">{activePromotion.discountPercent}%</span>}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* AI Upsell */}
            {cart.length > 0 && (
              <div className="pt-2 animate-in slide-in-from-bottom-2 fade-in">
                {recommendations.length === 0 ? (
                  <button onClick={handleGetRecommendations} disabled={isRecommending} className="w-full py-3 rounded-2xl bg-gradient-to-r from-violet-100 to-fuchsia-100 text-violet-600 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all border border-violet-200 shadow-sm">
                    {isRecommending ? (<><div className="w-4 h-4 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" /> กำลังวิเคราะห์...</>) : (<><Zap size={16} fill="currentColor" /> เชียร์ขายอะไรดี? (AI Upsell)</>)}
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-xs font-black text-violet-500 uppercase tracking-widest flex items-center gap-1"><Zap size={12} fill="currentColor" /> แนะนำทานคู่กัน</span>
                      <button onClick={() => setRecommendations([])} aria-label="ปิดรายการแนะนำ" className="text-xs text-gray-300 hover:text-red-400"><X size={12} /></button>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {recommendations.map(rec => (
                        <div key={rec.id} onClick={() => { trackRecommendationAccepted(rec); addToCart(rec); }} className="bg-white p-3 rounded-2xl border border-violet-100 flex items-center gap-3 cursor-pointer hover:border-violet-500 hover:shadow-md transition-all group">
                          <div className="w-10 h-10 bg-gray-100 rounded-lg overflow-hidden shrink-0">
                            <img src={rec.image} alt={rec.name} className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-gray-800 truncate">{rec.name}</p>
                            <p className="text-xs text-emerald-500 font-bold">฿{Number(rec.price).toLocaleString()}</p>
                          </div>
                          <PlusCircle size={20} className="text-violet-300 group-hover:text-violet-600 transition-colors" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="px-4 lg:px-4 xl:px-8 py-3 lg:py-3 xl:py-6 bg-emerald-50/40 border-t border-emerald-50 space-y-2 lg:space-y-2 xl:space-y-4 text-gray-800 shrink-0">
            <button onClick={() => setBringOwnGlass(!bringOwnGlass)} className={`w-full py-3 lg:py-3 xl:py-4 rounded-xl lg:rounded-xl xl:rounded-[1.5rem] flex items-center justify-center gap-2 lg:gap-2 xl:gap-3 transition-all border font-black uppercase text-xs tracking-wider lg:tracking-wider xl:tracking-widest shadow-sm ${bringOwnGlass ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-blue-600 border-blue-100 hover:bg-blue-50'}`}><Coffee size={16} /> นำแก้วมาเอง (-฿{OWN_GLASS_DISCOUNT}) {bringOwnGlass && <CheckCircle2 size={14} />}</button>
            <div className="flex items-center justify-between text-xs font-black text-emerald-600 uppercase tracking-[0.1em]">
              <span className="flex items-center gap-2"><Users size={16} /> สะสมแต้ม</span>
              {currentMember && Number(currentMember.points || 0) >= REDEEM_POINTS_THRESHOLD && (
                <button onClick={() => setUsePoints(!usePoints)} className={`px-3 lg:px-3 xl:px-5 py-2 rounded-xl lg:rounded-xl xl:rounded-2xl flex items-center gap-2 transition-all border shadow-md font-black uppercase text-xs ${usePoints ? 'bg-orange-500 text-white border-orange-600' : 'bg-white text-orange-500 border-orange-200 hover:bg-orange-50'}`}><Gift size={14} /> {usePoints ? 'ยกเลิก' : `ใช้ ${REDEEM_POINTS_THRESHOLD} แต้ม`}</button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="grid grid-cols-2 gap-2 flex-1">
                <input type="tel" maxLength={10} placeholder="เบอร์โทร..." value={memberPhone} onChange={(e) => setMemberPhone(e.target.value)} className="w-full bg-white border border-emerald-100 rounded-xl lg:rounded-xl xl:rounded-2xl py-3 lg:py-3 xl:py-4 px-3 lg:px-3 xl:px-5 text-sm font-black outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all shadow-inner text-gray-800" />
                <input type="text" placeholder="ชื่อเล่น..." value={memberNickname} onChange={(e) => setMemberNickname(e.target.value)} className="w-full bg-white border border-emerald-100 rounded-xl lg:rounded-xl xl:rounded-2xl py-3 lg:py-3 xl:py-4 px-3 lg:px-3 xl:px-5 text-sm font-black outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all shadow-inner text-gray-800" />
              </div>
              <button
                onClick={handleRefreshMembers}
                className={`p-3 rounded-xl bg-white border border-emerald-100 text-emerald-500 hover:bg-emerald-50 transition-all active:scale-95 shadow-sm ${isRefreshingMembers ? 'animate-pulse' : ''}`}
                title="รีเฟรชสมาชิก"
              >
                <RefreshCcw size={18} className={`${isRefreshingMembers ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {currentMember && (
              <div className="flex justify-between items-center bg-white p-3 lg:p-3 xl:p-4 rounded-xl lg:rounded-xl xl:rounded-2xl border border-emerald-100 animate-in fade-in text-gray-800 shadow-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs font-black text-gray-800 truncate uppercase tracking-tight">
                      {currentMember.isNew ? (memberNickname || 'ลูกค้าใหม่') : String(currentMember.name)}
                    </p>
                    {currentMember.isNew && (
                      <span className="bg-emerald-100 text-emerald-600 text-[8px] font-black px-2 py-0.5 rounded-full border border-emerald-200 uppercase animate-pulse">New!</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 font-bold uppercase">
                    {currentMember.isNew ? 'ใหม่ - ได้รับ' : 'แต้ม:'} <span className="text-emerald-500 font-black">{currentMember.isNew ? Math.floor(netTotal / 10) : Number(currentMember.points || 0)}</span> แต้ม
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {!currentMember.isNew && <div className="bg-emerald-500 text-white px-2 py-1 rounded-lg text-xs font-black tracking-widest">+ {Math.floor(netTotal / 10)}</div>}
                  {usePoints && <div className="text-xs font-black text-red-500 uppercase bg-red-50 px-2 py-1 rounded-lg">หัก {REDEEM_POINTS_THRESHOLD} แต้ม</div>}
                </div>
              </div>
            )}
          </div>

          <div className="p-3 lg:p-3 xl:p-6 bg-gray-50 border-t border-gray-100 space-y-2 lg:space-y-2 xl:space-y-4 shadow-inner text-gray-800 shrink-0">
            <div className="grid grid-cols-2 gap-2 lg:gap-2 xl:gap-4">
              <button onClick={() => setIsPaid(false)} className={`py-3 lg:py-3 xl:py-4 rounded-xl lg:rounded-xl xl:rounded-3xl border font-black text-xs uppercase flex items-center justify-center gap-2 transition-all ${!isPaid ? 'bg-orange-500 text-white border-orange-600 shadow-lg scale-[1.03]' : 'bg-white text-gray-400 border-gray-100'}`}><Wallet size={18} /> ยังไม่จ่าย</button>
              <button onClick={() => setIsPaid(true)} className={`py-3 lg:py-3 xl:py-4 rounded-xl lg:rounded-xl xl:rounded-3xl border font-black text-xs uppercase flex items-center justify-center gap-2 transition-all ${isPaid ? 'bg-emerald-500 text-white border-emerald-600 shadow-lg scale-[1.03]' : 'bg-white text-gray-400 border-gray-100'}`}><CreditCard size={18} /> จ่ายแล้ว</button>
            </div>
            <div className="space-y-1.5">
              {bringOwnGlass && (<div className="flex justify-between items-center text-xs font-black text-blue-600 uppercase tracking-wider bg-blue-50 p-2 lg:p-2 xl:p-3 rounded-lg lg:rounded-lg xl:rounded-xl border border-blue-100"><span>แก้วมาเอง</span><span>-฿{OWN_GLASS_DISCOUNT}</span></div>)}
              {usePoints && (<div className="flex justify-between items-center text-xs font-black text-orange-600 uppercase tracking-wider bg-orange-50 p-2 lg:p-2 xl:p-3 rounded-lg lg:rounded-lg xl:rounded-xl border border-orange-100"><span>ใช้แต้ม</span><span>-฿{REDEEM_DISCOUNT_VALUE}</span></div>)}
              <div className="flex justify-between items-end pb-1 text-gray-800 px-1"><span className="text-xs lg:text-xs xl:text-sm font-black text-gray-400 uppercase tracking-wider lg:tracking-wider xl:tracking-[0.2em]">ยอดสุทธิ</span><span className="text-3xl lg:text-3xl xl:text-5xl font-black text-emerald-600 tracking-tighter drop-shadow-sm">฿{netTotal.toLocaleString()}</span></div>
            </div>
            <Button
              variant="primary"
              size="xl"
              fullWidth
              onClick={handleCheckout}
              disabled={cart.length === 0}
              className="!py-3 lg:!py-3 xl:!py-6 !rounded-xl lg:!rounded-xl xl:!rounded-[2rem] !text-base lg:!text-base xl:!text-lg !tracking-[0.15em] !border-b-4"
            >
              {editingOrderId ? 'บันทึกการแก้ไข' : 'ยืนยันการสั่งซื้อ'}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Cart Button - Adjusted position */}
      <button data-pos="mobile-cart-btn" onClick={() => setIsMobileCartOpen(true)} className={`md:hidden fixed right-4 z-[90] bg-emerald-500 text-white p-4 rounded-full shadow-2xl border-2 border-white/20 active:scale-95 transition-all duration-300 ${isNavExpanded ? 'bottom-24' : 'bottom-6'}`}>
        <ShoppingBag size={24} />
        {cart.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-white animate-pulse">{cart.reduce((s, i) => s + i.quantity, 0)}</span>
        )}
      </button>

      {/* Mobile Cart Drawer - Full Featured */}
      {isMobileCartOpen && (
        <div data-pos="mobile-cart-drawer" className="md:hidden fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="absolute right-0 top-0 bottom-0 w-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right">
            {/* Header */}
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 shrink-0">
              <div className="flex items-center gap-3 font-black text-lg text-gray-800"><Receipt size={20} className="text-emerald-500" /> ตะกร้า ({cart.reduce((s, i) => s + i.quantity, 0)})</div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setCart([]); setUsePoints(false); setBringOwnGlass(false); }} className="text-xs text-gray-400 font-black uppercase hover:text-red-500 px-3 py-2 hover:bg-red-50 rounded-xl">ล้าง</button>
                <button onClick={() => setIsMobileCartOpen(false)} aria-label="ปิดตะกร้า" className="p-2 rounded-xl hover:bg-gray-100"><X size={24} /></button>
              </div>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <EmptyState icon="cart" title="ตะกร้าว่างเปล่า" description="เลือกเมนูเพื่อเริ่มสั่งอาหาร" size="sm" />
              ) : cart.map(item => (
                <div key={item.cartId || item.id} className="p-4 bg-gray-50 rounded-2xl space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-gray-800 truncate">{item.name}</p>
                      {item.beanModifier && <span className="text-xs font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded">{item.beanModifier}</span>}
                      <p className="text-sm text-gray-400 font-bold">฿{Number(item.price).toLocaleString()} x {item.quantity}</p>
                    </div>
                    <div className="flex items-center gap-1 bg-white rounded-xl p-1 border shrink-0">
                      <button onClick={() => updateQuantity(item.cartId || item.id, -1)} aria-label="ลดจำนวน" className="p-2 text-gray-400 active:text-red-500"><Minus size={16} /></button>
                      <span className="w-8 text-center font-black">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.cartId || item.id, 1)} aria-label="เพิ่มจำนวน" className="p-2 text-gray-400 active:text-emerald-500"><Plus size={16} /></button>
                    </div>
                  </div>
                  {/* Note & Promo */}
                  <div className="flex items-center gap-2">
                    <input type="text" placeholder="หมายเหตุ..." value={item.note || ''} onChange={(e) => updateCartItemNote(item.cartId || item.id, e.target.value)} className="flex-1 bg-white border border-gray-100 rounded-xl py-2 px-3 text-xs font-bold outline-none text-gray-800" />
                    {activePromotion && (
                      <button onClick={() => toggleItemPromo(item.cartId || item.id)} className={`p-2.5 rounded-xl border transition-all ${item.promoApplied ? 'bg-violet-600 text-white border-violet-700' : 'bg-white text-violet-500 border-violet-100'}`}>
                        <Tag size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* AI Upsell for Mobile */}
              {cart.length > 0 && (
                <div className="pt-2">
                  {recommendations.length === 0 ? (
                    <button onClick={handleGetRecommendations} disabled={isRecommending} className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-100 to-fuchsia-100 text-violet-600 font-black text-xs uppercase flex items-center justify-center gap-2 border border-violet-200">
                      {isRecommending ? (<><div className="w-4 h-4 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" /> วิเคราะห์...</>) : (<><Zap size={14} fill="currentColor" /> AI แนะนำ</>)}
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-black text-violet-500 uppercase flex items-center gap-1"><Zap size={10} fill="currentColor" /> แนะนำ</span>
                        <button onClick={() => setRecommendations([])} aria-label="ปิดรายการแนะนำ" className="text-gray-300"><X size={12} /></button>
                      </div>
                      {recommendations.map(rec => (
                        <div key={rec.id} onClick={() => { trackRecommendationAccepted(rec); addToCart(rec); }} className="bg-white p-3 rounded-xl border border-violet-100 flex items-center gap-3 active:bg-violet-50">
                          <div className="w-10 h-10 bg-gray-100 rounded-lg overflow-hidden shrink-0">
                            <img src={rec.image} alt={rec.name} className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-gray-800 truncate">{rec.name}</p>
                            <p className="text-xs text-emerald-500 font-bold">฿{Number(rec.price).toLocaleString()}</p>
                          </div>
                          <PlusCircle size={18} className="text-violet-400 shrink-0" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Member & Options Section */}
            <div className="px-4 py-3 bg-emerald-50/50 border-t border-emerald-100 space-y-3 shrink-0">
              {/* Bring Own Glass */}
              <button onClick={() => setBringOwnGlass(!bringOwnGlass)} className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 transition-all border font-black text-xs ${bringOwnGlass ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-blue-600 border-blue-100'}`}>
                <Coffee size={16} /> นำแก้วมาเอง (-฿{OWN_GLASS_DISCOUNT}) {bringOwnGlass && <CheckCircle2 size={14} />}
              </button>

              {/* Member Inputs */}
              <div className="flex items-center gap-2">
                <div className="grid grid-cols-2 gap-2 flex-1">
                  <input type="tel" maxLength={10} placeholder="เบอร์โทร" value={memberPhone} onChange={(e) => setMemberPhone(e.target.value)} className="w-full bg-white border border-emerald-100 rounded-xl py-3 px-4 text-sm font-black outline-none text-gray-800" />
                  <input type="text" placeholder="ชื่อเล่น" value={memberNickname} onChange={(e) => setMemberNickname(e.target.value)} className="w-full bg-white border border-emerald-100 rounded-xl py-3 px-4 text-sm font-black outline-none text-gray-800" />
                </div>
                <button
                  onClick={handleRefreshMembers}
                  className={`p-3 rounded-xl bg-white border border-emerald-100 text-emerald-500 active:bg-emerald-50 transition-all ${isRefreshingMembers ? 'animate-pulse' : ''}`}
                >
                  <RefreshCcw size={18} className={`${isRefreshingMembers ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Member Info */}
              {currentMember && (
                <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-emerald-100 animate-in fade-in">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-gray-800 truncate flex items-center gap-2">
                      <Users size={14} className="text-emerald-500" />
                      {currentMember.isNew ? (memberNickname || 'ลูกค้าใหม่') : String(currentMember.name)}
                      {currentMember.isNew && (
                        <span className="bg-emerald-100 text-emerald-600 text-[8px] font-black px-1.5 py-0.5 rounded-full">New</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 font-bold">
                      {currentMember.isNew ? 'จะได้รับ' : 'แต้ม:'} <span className="text-emerald-500 font-black">{currentMember.isNew ? Math.floor(netTotal / 10) : Number(currentMember.points || 0)}</span>
                      {!currentMember.isNew && <span> | +{Math.floor(netTotal / 10)}</span>}
                    </p>
                  </div>
                  {!currentMember.isNew && Number(currentMember.points || 0) >= REDEEM_POINTS_THRESHOLD && (
                    <button onClick={() => setUsePoints(!usePoints)} className={`px-3 py-2 rounded-xl text-xs font-black border ${usePoints ? 'bg-orange-500 text-white border-orange-600' : 'bg-white text-orange-500 border-orange-200'}`}>
                      <Gift size={12} className="inline mr-1" /> {usePoints ? 'ยกเลิก' : `ใช้ ${REDEEM_POINTS_THRESHOLD} แต้ม`}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Payment & Checkout */}
            <div className="p-4 bg-gray-50 border-t space-y-3 shrink-0">
              {/* Payment Status */}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setIsPaid(false)} className={`py-3 rounded-xl border font-black text-xs flex items-center justify-center gap-2 transition-all ${!isPaid ? 'bg-orange-500 text-white border-orange-600 shadow-lg' : 'bg-white text-gray-400 border-gray-100'}`}><Wallet size={16} /> ยังไม่จ่าย</button>
                <button onClick={() => setIsPaid(true)} className={`py-3 rounded-xl border font-black text-xs flex items-center justify-center gap-2 transition-all ${isPaid ? 'bg-emerald-500 text-white border-emerald-600 shadow-lg' : 'bg-white text-gray-400 border-gray-100'}`}><CreditCard size={16} /> จ่ายแล้ว</button>
              </div>

              {/* Discount Info */}
              {(bringOwnGlass || usePoints) && (
                <div className="space-y-1">
                  {bringOwnGlass && <div className="flex justify-between text-xs font-black text-blue-600 bg-blue-50 p-2 rounded-lg"><span>นำแก้วมาเอง</span><span>-฿{OWN_GLASS_DISCOUNT}</span></div>}
                  {usePoints && <div className="flex justify-between text-xs font-black text-orange-600 bg-orange-50 p-2 rounded-lg"><span>ใช้แต้ม</span><span>-฿{REDEEM_DISCOUNT_VALUE}</span></div>}
                </div>
              )}

              {/* Total & Checkout */}
              <div className="flex justify-between items-center pt-2">
                <span className="font-black text-gray-500 uppercase text-sm">ยอดสุทธิ</span>
                <span className="text-3xl font-black text-emerald-600">฿{netTotal.toLocaleString()}</span>
              </div>
              <button onClick={() => { handleCheckout(); setIsMobileCartOpen(false); }} disabled={cart.length === 0} className="w-full py-4 rounded-2xl bg-emerald-500 text-white font-black text-lg uppercase shadow-xl active:scale-95 border-b-4 border-emerald-700 disabled:opacity-50">
                {editingOrderId ? 'บันทึกการแก้ไข' : 'ยืนยันการสั่งซื้อ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bean Modifier Selection Modal */}
      <Modal
        isOpen={!!pendingBeanItem}
        onClose={() => setPendingBeanItem(null)}
        title="เลือกเมล็ดกาแฟ"
        size="sm"
      >
        {pendingBeanItem && (
          <div className="space-y-4">
            <p className="text-center text-gray-500 font-medium -mt-2 mb-4">{pendingBeanItem.name}</p>
            <div className="space-y-3">
              <button onClick={() => addToCartWithBean(pendingBeanItem, null)} className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-between hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all">
                <span className="font-bold text-gray-800 dark:text-gray-200">ไม่เพิ่มกาแฟ</span>
                <span className="font-bold text-emerald-600">฿{Number(pendingBeanItem.price).toLocaleString()}</span>
              </button>
              {beanModifiers.map(mod => (
                <button key={mod.id} onClick={() => addToCartWithBean(pendingBeanItem, mod)} className="w-full p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 flex items-center justify-between hover:border-amber-500 transition-all">
                  <span className="font-bold text-amber-800 dark:text-amber-400">#{mod.name}</span>
                  <span className="font-bold text-amber-600">฿{Number(mod.price).toLocaleString()}</span>
                </button>
              ))}
            </div>
            <Button variant="secondary" fullWidth onClick={() => setPendingBeanItem(null)}>
              ยกเลิก
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
