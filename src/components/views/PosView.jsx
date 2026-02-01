import React, { useState, useMemo, useEffect } from 'react';
import {
  Search, Star, Receipt, Minus, Plus, Edit3, Tag, Zap, X, PlusCircle,
  Coffee, Users, Gift, Wallet, CreditCard, ChevronLeft, ChevronRight,
  ShoppingBag, CheckCircle2
} from 'lucide-react';
import { collection, doc, addDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { useAppContext } from '../../context/AppContext';
import { getISODate, getNameKey } from '../../utils/calculations';
import useDebounce from '../../hooks/useDebounce';

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
    isNavExpanded
  } = useAppContext();

  const REDEEM_POINTS_THRESHOLD = Number(redeemPointsThreshold) || 100;
  const REDEEM_DISCOUNT_VALUE = Number(redeemDiscountValue) || 50;
  const OWN_GLASS_DISCOUNT = Number(ownGlassDiscount) || 5;

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
  const [itemsPerPage, setItemsPerPage] = useState(12);

  // Order editing
  const [editingOrderId, setEditingOrderId] = useState(null);

  // Member states
  const [memberPhone, setMemberPhone] = useState('');
  const [memberNickname, setMemberNickname] = useState('');
  const [currentMember, setCurrentMember] = useState(null);

  // Mobile
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

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

  const vatAmount = useMemo(() => vatEnabled ? Math.round((subtotal - discountAmount) * 0.07) : 0, [subtotal, discountAmount, vatEnabled]);
  const netTotal = useMemo(() => Math.max(0, (subtotal - discountAmount) + vatAmount), [subtotal, discountAmount, vatAmount]);

  const categories = useMemo(() => ['แนะนำ', ...dynamicCategories.map(c => c.name)], [dynamicCategories]);

  const filteredMenu = useMemo(() => menu.filter(i => {
    const categoryMatch = activeCategory === 'แนะนำ' ? i.isFeatured : (i.category === activeCategory);
    return categoryMatch && String(i.name || '').toLowerCase().includes(debouncedSearchTerm.toLowerCase()) && i.available !== false;
  }), [activeCategory, debouncedSearchTerm, menu]);

  const totalPages = Math.ceil(filteredMenu.length / itemsPerPage);
  const pagedMenu = useMemo(() => {
    const start = (menuPage - 1) * itemsPerPage;
    return filteredMenu.slice(start, start + itemsPerPage);
  }, [filteredMenu, menuPage, itemsPerPage]);

  // Effects
  useEffect(() => {
    setMenuPage(1);
  }, [activeCategory, debouncedSearchTerm, itemsPerPage]);

  useEffect(() => {
    if (memberPhone.length === 10) {
      const found = members.find(m => m.phone === memberPhone);
      if (found) {
        setCurrentMember(found);
        setMemberNickname(found.name || '');
      } else {
        setCurrentMember({ phone: memberPhone, points: 0, name: 'ลูกค้าใหม่' });
      }
    } else {
      setCurrentMember(null);
      setUsePoints(false);
      setMemberNickname('');
    }
  }, [memberPhone, members]);

  useEffect(() => {
    if (memberPhone) return;
    const nameKey = getNameKey(memberNickname);
    if (!nameKey) {
      setCurrentMember(null);
      setUsePoints(false);
      return;
    }
    const found = members.find(m => getNameKey(m.name) === nameKey);
    if (found) {
      setCurrentMember(found);
      if (found.phone) setMemberPhone(found.phone);
    }
  }, [memberNickname, memberPhone, members]);

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
      alert('กรุณาเลือกโปรโมชั่นก่อนครับ (ปุ่มสายฟ้าหน้าหน้าเมนู)');
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

  const handleCheckout = async () => {
    if (cart.length === 0 || !user) return;
    await runDbAction(async () => {
      const orderData = {
        queueNumber: editingOrderId ? orders.find(o => o.id === editingOrderId).queueNumber : queueCounter,
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

      if (editingOrderId) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', editingOrderId), { ...orderData, updatedAt: serverTimestamp() });
        setEditingOrderId(null);
      } else {
        if (usePoints && currentMember && Number(currentMember.points || 0) >= REDEEM_POINTS_THRESHOLD) {
          const nameKey = getNameKey(currentMember.name);
          const memberId = currentMember.phone || (nameKey ? `name:${nameKey}` : null);
          if (memberId) {
            const memRef = doc(db, 'artifacts', appId, 'public', 'data', 'members', memberId);
            await updateDoc(memRef, { points: increment(-REDEEM_POINTS_THRESHOLD) });
          }
        }

        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), orderData);
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'queue'), { current: Number(queueCounter) + 1 });
      }
      setCart([]); setIsPaid(false); setMemberPhone(''); setMemberNickname(''); setUsePoints(false); setBringOwnGlass(false);
    }, 'บันทึกออเดอร์ไม่สำเร็จ');
  };

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
        const suggestedItems = availableMenu.filter(m => result.data.includes(m.name));
        setRecommendations(suggestedItems.slice(0, 3));
      } else {
        setRecommendations(availableMenu.filter(m => m.recommended).slice(0, 3));
      }
    } catch (error) {
      console.error('Smart Upsell Error:', error);
    } finally {
      setIsRecommending(false);
    }
  };

  return (
    <>
      <div className="flex flex-col md:flex-row h-full animate-in fade-in duration-500">
        {/* Left Category Sidebar */}
        <div className="hidden md:flex w-20 lg:w-28 xl:w-32 bg-white border-r border-gray-100 flex-col items-center py-4 lg:py-8 gap-2 lg:gap-4 shadow-xl z-10 text-gray-800">
          <div className="w-12 h-12 lg:w-16 lg:h-16 xl:w-20 xl:h-20 bg-emerald-500 rounded-2xl lg:rounded-3xl flex items-center justify-center text-white mb-4 lg:mb-8 shadow-lg font-black text-xl lg:text-2xl xl:text-3xl tracking-tighter uppercase border-b-4 border-emerald-700 shadow-emerald-500/20">S</div>
          <div className="flex-1 overflow-y-auto w-full px-2 lg:px-3 space-y-2 lg:space-y-4 scrollbar-hide">
            {categories.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)} className={`w-full py-3 lg:py-5 xl:py-7 rounded-xl lg:rounded-[1.5rem] text-[10px] lg:text-xs xl:text-sm font-black uppercase tracking-wider lg:tracking-widest transition-all ${activeCategory === cat ? 'bg-emerald-500 text-white shadow-xl shadow-emerald-500/20 scale-105' : 'text-gray-400 hover:bg-gray-50 hover:text-emerald-500'}`}>{String(cat)}</button>
            ))}
          </div>
        </div>

        {/* Mobile Category Bar */}
        <div className="md:hidden flex overflow-x-auto scrollbar-hide bg-white border-b border-gray-100 px-4 py-3 gap-2 shrink-0">
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all shrink-0 ${activeCategory === cat ? 'bg-emerald-500 text-white shadow-lg' : 'bg-gray-100 text-gray-500'}`}>{String(cat)}</button>
          ))}
        </div>

        <div className="flex-1 flex flex-col bg-[#f8faf9] min-w-0 overflow-hidden">
          <header className="h-16 md:h-20 lg:h-24 bg-white border-b border-gray-100 px-3 md:px-6 lg:px-10 flex items-center justify-between sticky top-0 z-10 text-gray-800 shrink-0 gap-2 md:gap-4">
            <div className="relative flex-1 max-w-xs md:max-w-md lg:max-w-xl">
              <Search className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
              <input type="text" placeholder="ค้นหา..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-gray-50 border-none rounded-xl md:rounded-2xl lg:rounded-3xl py-2.5 md:py-3.5 lg:py-4 pl-10 md:pl-14 lg:pl-16 pr-4 text-sm md:text-base focus:ring-2 focus:ring-emerald-500/10 outline-none transition-all text-gray-800 font-bold" />
            </div>
            <div className="flex items-center gap-2 md:gap-4 lg:gap-6 text-gray-800">
              {activePromotion && (
                <div className="hidden sm:flex items-center gap-4 bg-violet-50 px-6 py-2 rounded-2xl border border-violet-100 animate-in slide-in-from-top duration-500 overflow-hidden relative group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-violet-500"></div>
                  <div>
                    <span className="text-[10px] font-black text-violet-600 uppercase tracking-widest block leading-none mb-1 flex items-center gap-1"><Zap size={10} fill="currentColor" /> โปรโมชั่นปัจจุบัน</span>
                    <p className="text-xs font-black text-gray-800 truncate max-w-[200px]">{activePromotion.title} {activePromotion.code && <span className="text-[10px] text-violet-400 opacity-60 ml-1">({activePromotion.code})</span>}</p>
                  </div>
                  <button onClick={() => setActivePromotion(null)} className="p-1 px-3 text-[10px] font-black text-gray-400 hover:text-red-500 bg-white border border-gray-100 rounded-lg shadow-sm">ลบออก</button>
                </div>
              )}

              <div className="hidden lg:flex items-center gap-2 bg-gray-50 p-1.5 rounded-2xl border border-gray-100">
                <span className="text-[10px] font-black text-gray-400 pl-2 uppercase tracking-wider">Show:</span>
                {[3, 6, 9, 12].map(num => (
                  <button key={num} onClick={() => setItemsPerPage(num)} className={`w-8 h-8 rounded-xl text-[10px] font-black transition-all ${itemsPerPage === num ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 scale-105' : 'text-gray-400 hover:bg-white hover:text-emerald-500 hover:shadow-sm'}`}>{num}</button>
                ))}
              </div>

              <div className="bg-emerald-50 text-emerald-600 px-3 md:px-6 lg:px-8 py-2 md:py-3 lg:py-4 rounded-xl md:rounded-2xl lg:rounded-3xl border border-emerald-100 font-black text-xs md:text-sm lg:text-lg uppercase tracking-wider lg:tracking-widest shadow-sm">{editingOrderId ? `#${orders.find(o => o.id === editingOrderId)?.queueNumber}` : `#${queueCounter}`}</div>
            </div>
          </header>

          <div className="flex-1 flex flex-col overflow-hidden relative">
            <div className="flex-1 overflow-y-auto p-3 md:p-6 lg:p-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4 lg:gap-6 scrollbar-hide text-gray-800 content-start pb-32 md:pb-40 lg:pb-52">
              {isSyncing && (
                <div className="col-span-full text-center text-xs font-black uppercase tracking-widest text-gray-400 py-8">กำลังโหลดเมนู...</div>
              )}
              {!isSyncing && pagedMenu.length === 0 && (
                <div className="col-span-full text-center text-xs font-black uppercase tracking-widest text-gray-400 py-8">ไม่พบเมนูในหมวดนี้</div>
              )}
              {pagedMenu.map(item => (
                <div key={item.id} onClick={() => addToCart(item)} className="bg-white rounded-[2.5rem] border border-gray-50 overflow-hidden cursor-pointer hover:border-emerald-500 hover:shadow-2xl transition-all duration-300 active:scale-95 group relative shadow-sm text-gray-800 flex flex-col h-full animate-in zoom-in-95 duration-200">
                  {(item.isFeatured || item.recommended) && <div className="absolute top-4 left-4 z-10 bg-orange-500 text-white text-[10px] font-black px-4 py-1.5 rounded-full shadow-lg flex items-center gap-2 border border-white/20"><Star size={12} fill="white" stroke="white" /> แนะนำ</div>}
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
                <button disabled={menuPage === 1} onClick={() => setMenuPage(p => Math.max(1, p - 1))} className={`p-3.5 rounded-2xl transition-all ${menuPage === 1 ? 'text-gray-200 cursor-not-allowed' : 'text-emerald-500 bg-emerald-50 hover:bg-emerald-500 hover:text-white shadow-sm'}`}><ChevronLeft size={24} strokeWidth={3} /></button>
                <div className="flex items-center gap-3 px-4">
                  <span className="text-sm font-black text-emerald-600 bg-emerald-50 w-12 h-12 flex items-center justify-center rounded-2xl shadow-inner">{menuPage}</span>
                  <span className="text-xs font-black text-gray-300 uppercase tracking-widest">จาก {totalPages} หน้า</span>
                </div>
                <button disabled={menuPage === totalPages} onClick={() => setMenuPage(p => Math.min(totalPages, p + 1))} className={`p-3.5 rounded-2xl transition-all ${menuPage === totalPages ? 'text-gray-200 cursor-not-allowed' : 'text-emerald-500 bg-emerald-50 hover:bg-emerald-500 hover:text-white shadow-sm'}`}><ChevronRight size={24} strokeWidth={3} /></button>
              </div>
            )}
          </div>
        </div>

        {/* Cart Sidebar */}
        <div className="hidden md:flex w-72 lg:w-80 xl:w-96 2xl:w-[420px] bg-white border-l border-gray-100 shadow-[-15px_0_40px_rgba(0,0,0,0.02)] flex-col z-20 overflow-hidden text-gray-800">
          <div className="p-4 lg:p-6 xl:p-8 border-b flex justify-between items-center bg-gray-50/40 text-gray-800">
            <div className="flex items-center gap-2 lg:gap-4 font-black text-lg lg:text-xl xl:text-2xl tracking-tighter uppercase text-gray-800"><Receipt size={20} className="text-emerald-500 lg:w-6 lg:h-6" /> ตะกร้า</div>
            <button onClick={() => { setCart([]); setUsePoints(false); setBringOwnGlass(false); }} className="text-[10px] lg:text-xs text-gray-400 font-black uppercase hover:text-red-500 transition-colors px-2 lg:px-4 py-1.5 lg:py-2 hover:bg-red-50 rounded-xl">ล้าง</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 lg:p-4 xl:p-6 space-y-3 lg:space-y-5 scrollbar-hide text-gray-800">
            {cart.map(item => (
              <div key={item.cartId || item.id} className="py-3 lg:py-5 px-3 lg:px-5 bg-[#fcfdfc] rounded-xl lg:rounded-[2rem] border border-emerald-50/50 shadow-sm transition-all group space-y-2 lg:space-y-4 text-gray-800">
                <div className="flex gap-2 lg:gap-4 text-gray-800">
                  <div className="flex-1 min-w-0 text-gray-800">
                    <p className="text-base font-black text-gray-800 truncate mb-1">{String(item.name)}</p>
                    {item.beanModifier && <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">{item.beanModifier}</span>}
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mt-1">฿{Number(item.price).toLocaleString()} x {Number(item.quantity)}</p>
                  </div>
                  <div className="flex items-center bg-white border border-gray-100 rounded-2xl p-1.5 shadow-sm text-gray-800 h-fit">
                    <button onClick={() => updateQuantity(item.cartId || item.id, -1)} className="p-2 hover:text-red-500 text-gray-400 transition-colors"><Minus size={18} /></button>
                    <span className="w-10 text-center text-base font-black text-gray-800">{Number(item.quantity)}</span>
                    <button onClick={() => updateQuantity(item.cartId || item.id, 1)} className="p-2 hover:text-emerald-500 text-gray-400 transition-colors"><Plus size={18} /></button>
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
                      {item.promoApplied && <span className="text-[10px] font-black">{activePromotion.discountPercent}%</span>}
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
                      <span className="text-[10px] font-black text-violet-500 uppercase tracking-widest flex items-center gap-1"><Zap size={12} fill="currentColor" /> แนะนำทานคู่กัน</span>
                      <button onClick={() => setRecommendations([])} className="text-[10px] text-gray-300 hover:text-red-400"><X size={12} /></button>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {recommendations.map(rec => (
                        <div key={rec.id} onClick={() => addToCart(rec)} className="bg-white p-3 rounded-2xl border border-violet-100 flex items-center gap-3 cursor-pointer hover:border-violet-500 hover:shadow-md transition-all group">
                          <div className="w-10 h-10 bg-gray-100 rounded-lg overflow-hidden shrink-0">
                            <img src={rec.image} alt={rec.name} className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-gray-800 truncate">{rec.name}</p>
                            <p className="text-[10px] text-emerald-500 font-bold">฿{Number(rec.price).toLocaleString()}</p>
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

          <div className="px-8 py-6 bg-emerald-50/40 border-t border-emerald-50 space-y-4 text-gray-800">
            <button onClick={() => setBringOwnGlass(!bringOwnGlass)} className={`w-full py-4 rounded-[1.5rem] flex items-center justify-center gap-3 transition-all border font-black uppercase text-xs tracking-widest shadow-sm ${bringOwnGlass ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-blue-600 border-blue-100 hover:bg-blue-50'}`}><Coffee size={18} /> นำแก้วมาเอง (-฿{OWN_GLASS_DISCOUNT}) {bringOwnGlass && <CheckCircle2 size={16} />}</button>
            <div className="flex items-center justify-between text-xs font-black text-emerald-600 uppercase tracking-[0.1em]">
              <span className="flex items-center gap-3"><Users size={18} /> สะสมแต้มสมาชิก</span>
              {currentMember && Number(currentMember.points || 0) >= REDEEM_POINTS_THRESHOLD && (
                <button onClick={() => setUsePoints(!usePoints)} className={`px-5 py-2.5 rounded-2xl flex items-center gap-2 transition-all border shadow-md font-black uppercase text-[10px] ${usePoints ? 'bg-orange-500 text-white border-orange-600' : 'bg-white text-orange-500 border-orange-200 hover:bg-orange-50'}`}><Gift size={14} /> {usePoints ? 'ยกเลิก' : `ใช้ ${REDEEM_POINTS_THRESHOLD} แต้ม`}</button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input type="tel" maxLength={10} placeholder="เบอร์โทรศัพท์..." value={memberPhone} onChange={(e) => setMemberPhone(e.target.value)} className="w-full bg-white border border-emerald-100 rounded-2xl py-4 px-5 text-sm font-black outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all shadow-inner text-gray-800" />
              <input type="text" placeholder="ชื่อเล่นลูกค้า..." value={memberNickname} onChange={(e) => setMemberNickname(e.target.value)} className="w-full bg-white border border-emerald-100 rounded-2xl py-4 px-5 text-sm font-black outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all shadow-inner text-gray-800" />
            </div>
            {currentMember && (
              <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-emerald-100 animate-in fade-in text-gray-800 shadow-sm">
                <div className="min-w-0">
                  <p className="text-xs font-black text-gray-800 truncate uppercase tracking-tight">{String(currentMember.name)}</p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase mt-1.5">แต้มปัจจุบัน: <span className="text-emerald-500 font-black">{Number(currentMember.points || 0)}</span></p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <div className="bg-emerald-500 text-white px-3 py-1.5 rounded-xl text-[10px] font-black tracking-widest">+ {Math.floor(netTotal / 10)}</div>
                  {usePoints && <div className="text-[9px] font-black text-red-500 uppercase bg-red-50 px-2 py-1 rounded-lg">หัก {REDEEM_POINTS_THRESHOLD} แต้ม</div>}
                </div>
              </div>
            )}
          </div>

          <div className="p-10 bg-gray-50 border-t border-gray-100 space-y-6 shadow-inner text-gray-800">
            <div className="grid grid-cols-2 gap-4 mb-2">
              <button onClick={() => setIsPaid(false)} className={`py-4 rounded-3xl border font-black text-xs uppercase flex items-center justify-center gap-3 transition-all ${!isPaid ? 'bg-orange-500 text-white border-orange-600 shadow-lg scale-[1.03]' : 'bg-white text-gray-400 border-gray-100'}`}><Wallet size={20} /> ยังไม่จ่าย</button>
              <button onClick={() => setIsPaid(true)} className={`py-4 rounded-3xl border font-black text-xs uppercase flex items-center justify-center gap-3 transition-all ${isPaid ? 'bg-emerald-500 text-white border-emerald-600 shadow-lg scale-[1.03]' : 'bg-white text-gray-400 border-gray-100'}`}><CreditCard size={20} /> จ่ายแล้ว</button>
            </div>
            <div className="space-y-2">
              {bringOwnGlass && (<div className="flex justify-between items-center text-xs font-black text-blue-600 uppercase tracking-widest bg-blue-50 p-3 rounded-xl border border-blue-100"><span>ส่วนลดนำแก้วมาเอง</span><span>-฿{OWN_GLASS_DISCOUNT}</span></div>)}
              {usePoints && (<div className="flex justify-between items-center text-xs font-black text-orange-600 uppercase tracking-widest bg-orange-50 p-3 rounded-xl border border-orange-100"><span>ส่วนลดใช้แต้มสมาชิก</span><span>-฿{REDEEM_DISCOUNT_VALUE}</span></div>)}
              <div className="flex justify-between items-end pb-2 text-gray-800 px-2"><span className="text-sm font-black text-gray-400 uppercase tracking-[0.2em]">ยอดสุทธิ</span><span className="text-5xl font-black text-emerald-600 tracking-tighter drop-shadow-sm">฿{netTotal.toLocaleString()}</span></div>
            </div>
            <button onClick={handleCheckout} disabled={cart.length === 0} className="w-full py-6 lg:py-8 rounded-[2.5rem] bg-emerald-500 text-white font-black shadow-2xl active:scale-95 transition-all text-xl uppercase tracking-[0.2em] border-b-8 border-emerald-800 shadow-emerald-500/30">ยืนยันการสั่งซื้อ</button>
          </div>
        </div>
      </div>

      {/* Mobile Cart Button */}
      <button onClick={() => setIsMobileCartOpen(true)} className="md:hidden fixed bottom-20 right-4 z-[90] bg-emerald-500 text-white p-4 rounded-full shadow-2xl border-2 border-white/20 active:scale-95">
        <ShoppingBag size={24} />
        {cart.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-white">{cart.reduce((s, i) => s + i.quantity, 0)}</span>
        )}
      </button>

      {/* Mobile Cart Drawer */}
      {isMobileCartOpen && (
        <div className="md:hidden fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-sm bg-white shadow-2xl flex flex-col animate-in slide-in-from-right">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <div className="flex items-center gap-3 font-black text-lg text-gray-800"><Receipt size={20} className="text-emerald-500" /> ตะกร้า ({cart.length})</div>
              <button onClick={() => setIsMobileCartOpen(false)} className="p-2 rounded-xl hover:bg-gray-100"><X size={24} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <p className="text-center text-gray-400 font-bold py-8">ตะกร้าว่างเปล่า</p>
              ) : cart.map(item => (
                <div key={item.cartId || item.id} className="p-4 bg-gray-50 rounded-2xl space-y-2">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-gray-800 truncate">{item.name}</p>
                      {item.beanModifier && <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded">{item.beanModifier}</span>}
                      <p className="text-sm text-gray-400 font-bold">฿{Number(item.price).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2 bg-white rounded-xl p-1 border">
                      <button onClick={() => updateQuantity(item.cartId || item.id, -1)} className="p-1.5 text-gray-400"><Minus size={16} /></button>
                      <span className="w-6 text-center font-black">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.cartId || item.id, 1)} className="p-1.5 text-gray-400"><Plus size={16} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 bg-gray-50 border-t space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-black text-gray-500 uppercase text-sm">ยอดสุทธิ</span>
                <span className="text-3xl font-black text-emerald-600">฿{netTotal.toLocaleString()}</span>
              </div>
              <button onClick={() => { handleCheckout(); setIsMobileCartOpen(false); }} disabled={cart.length === 0} className="w-full py-4 rounded-2xl bg-emerald-500 text-white font-black text-lg uppercase shadow-xl active:scale-95">สั่งซื้อ</button>
            </div>
          </div>
        </div>
      )}

      {/* Bean Modifier Selection Modal */}
      {pendingBeanItem && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/80 backdrop-blur-3xl p-6 animate-in fade-in text-gray-900">
          <div className="bg-white rounded-[4rem] p-10 max-w-lg w-full shadow-2xl space-y-6">
            <div className="text-center">
              <h3 className="font-black text-2xl uppercase tracking-tight mb-2">เลือกเมล็ดกาแฟ</h3>
              <p className="text-gray-400 font-bold">{pendingBeanItem.name}</p>
            </div>
            <div className="space-y-3">
              <button onClick={() => addToCartWithBean(pendingBeanItem, null)} className="w-full p-5 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between hover:border-emerald-500 hover:bg-emerald-50 transition-all">
                <span className="font-black text-gray-800">ไม่เพิ่มกาแฟ</span>
                <span className="font-black text-emerald-600">฿{Number(pendingBeanItem.price).toLocaleString()}</span>
              </button>
              {beanModifiers.map(mod => (
                <button key={mod.id} onClick={() => addToCartWithBean(pendingBeanItem, mod)} className="w-full p-5 bg-amber-50 rounded-2xl border border-amber-100 flex items-center justify-between hover:border-amber-500 hover:bg-amber-100 transition-all">
                  <span className="font-black text-amber-800">#{mod.name}</span>
                  <span className="font-black text-amber-600">฿{Number(mod.price).toLocaleString()}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setPendingBeanItem(null)} className="w-full py-4 bg-gray-100 rounded-2xl font-black text-gray-400 uppercase text-xs tracking-widest">ยกเลิก</button>
          </div>
        </div>
      )}
    </>
  );
}
