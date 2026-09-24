import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ShoppingBag, ChevronRight } from 'lucide-react';
import { collection, doc, writeBatch, increment, arrayUnion, arrayRemove, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db, appId, auth } from '../../services/firebase';
import { useDataContext, useConfigContext, useUIContext } from '../../context/AppContext';
import { getEligibleRewards, toggleRewardSelection } from '../../utils/rewards';
import { getISODate, getNameKey } from '../../utils/calculations';
import { COMBO_PROMO_TITLE } from '../../utils/promotions';
import { sortByFeaturedOrder } from '../../utils/featuredOrder';
import { queueDayKey } from '../../utils/queueDay';
import { bumpMenuSoldCount } from '../../utils/menuSales';
import { withInFlightGuard, planBillEditPoints } from '../../utils/pointsActions';
import { formatBaht } from '../../utils/format';
import useDebounce from '../../hooks/useDebounce';
import { trackRecommendationsShown, trackRecommendationAccepted } from '../../services/upsellTracker';
import { Sheet, useToast, useMediaQuery } from '../ui';
import {
  DEFAULT_REDEEM_POINTS_THRESHOLD,
  DEFAULT_REDEEM_DISCOUNT_VALUE,
  DEFAULT_OWN_GLASS_DISCOUNT,
  MEMBER_MIN_PHONE_LENGTH,
  ALLOW_NAME_ONLY_MEMBERS
} from '../../config/constants';
import CategoryRail from './pos/CategoryRail';
import MenuHeader from './pos/MenuHeader';
import MenuGrid from './pos/MenuGrid';
import OptionSheet from './pos/OptionSheet';
import CartPanel from './pos/CartPanel';
import CheckoutBar from './pos/CheckoutBar';
import usePosTotals from './pos/usePosTotals';
import DiscountMemberPanel from './pos/DiscountMemberPanel';
import {
  needsOptionSheet, buildPlainLine, buildOptionLine, addPlainLine, addOptionLine, toOrderItems, repeatLines,
} from './pos/posCart';

const DENSITY_KEY = 'pos-menu-density';
const orderMillis = (o) => (o?.createdAt?.toMillis ? o.createdAt.toMillis() : Number(o?.createdAt?.seconds || 0) * 1000);

export default function PosView() {
  const {
    user, menu, members, orders, beanModifiers, dynamicCategories, queueCounter, queueInfo, isSyncing,
  } = useDataContext();
  const {
    vatEnabled, redeemPointsThreshold, redeemDiscountValue, ownGlassDiscount,
    cakeSaleEnabled, cakeSaleCategories, cakeSalePercent, cakeSaleStart, cakeSaleEnd,
    comboEnabled, comboPercent, spendThreshold, spendDiscount, pointsRewardsEnabled, pointsRewards,
  } = useConfigContext();
  const {
    activePromotion, setActivePromotion, runDbAction, callGeminiAPI, editingOrderId, setEditingOrderId,
  } = useUIContext();

  const REDEEM_POINTS_THRESHOLD = Number(redeemPointsThreshold) || DEFAULT_REDEEM_POINTS_THRESHOLD;
  const REDEEM_DISCOUNT_VALUE = Number(redeemDiscountValue) || DEFAULT_REDEEM_DISCOUNT_VALUE;
  const OWN_GLASS_DISCOUNT = Number(ownGlassDiscount) || DEFAULT_OWN_GLASS_DISCOUNT;

  const saleSettings = useMemo(
    () => ({ cakeSaleEnabled, cakeSaleCategories, cakeSalePercent, cakeSaleStart, cakeSaleEnd }),
    [cakeSaleEnabled, cakeSaleCategories, cakeSalePercent, cakeSaleStart, cakeSaleEnd]
  );
  const comboSettings = useMemo(
    () => ({ cakeSaleCategories, comboEnabled, comboPercent }),
    [cakeSaleCategories, comboEnabled, comboPercent]
  );

  const toast = useToast();
  // Render either the iPad/desktop cart column or the phone cart bar + sheet, never both.
  const isMdUp = useMediaQuery('(min-width: 768px)');

  const [cart, setCart] = useState([]);
  const [activeCategory, setActiveCategory] = useState('แนะนำ');
  const [searchTerm, setSearchTerm] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [usePoints, setUsePoints] = useState(false);
  const [redeemRewardId, setRedeemRewardId] = useState(null);
  const [bringOwnGlass, setBringOwnGlass] = useState(false);
  const [reviewDiscount, setReviewDiscount] = useState(false); // staff applies 5% for a verified review
  const [pendingItem, setPendingItem] = useState(null); // menu item whose option sheet is open
  const [recommendations, setRecommendations] = useState([]);
  const [isRecommending, setIsRecommending] = useState(false);
  const [memberPhone, setMemberPhone] = useState('');
  const [memberNickname, setMemberNickname] = useState('');
  const [currentMember, setCurrentMember] = useState(null);
  const [isMemberNameFocused, setIsMemberNameFocused] = useState(false);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [isRefreshingMembers, setIsRefreshingMembers] = useState(false);
  const [density, setDensityState] = useState(() => {
    try { return localStorage.getItem(DENSITY_KEY) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
  });
  const setDensity = useCallback((next) => {
    setDensityState(next);
    try { localStorage.setItem(DENSITY_KEY, next); } catch { /* private mode */ }
  }, []);

  const debouncedSearchTerm = useDebounce(searchTerm, 200);

  // --- Loyalty points redemption: ONE source of truth -------------------------
  // The bill discount and the points deduction MUST share the same condition.
  // Previously the bill subtracted REDEEM_DISCOUNT_VALUE whenever `usePoints` was
  // on, while the deduction additionally required a loaded member with enough
  // points AND only ran in the new-order branch. So any race that dropped
  // `currentMember`, or any edited bill, handed out the ฿discount for free without
  // ever taking the points (audit found 30 such leaked redemptions). Gate both on
  // `pointsRedeemActive`, and reconcile against the order's own `pointsRedeemed`
  // flag at save time so editing/re-saving never double-deducts or leaks.
  const redeemNameKey = getNameKey(currentMember?.name);
  const redeemMemberId = (currentMember && !currentMember.isNew)
    ? (currentMember.phone || (redeemNameKey ? `name:${redeemNameKey}` : null))
    : null;
  const editingOrder = editingOrderId ? orders.find(o => o.id === editingOrderId) : null;
  const wasRedeemed = !!editingOrder?.pointsRedeemed;
  // A bill that already redeemed stays redeemable on edit even if the member's
  // balance has since dropped below the threshold (we're keeping an existing
  // redemption, not creating a new one). A brand-new redemption still needs a
  // sufficient balance.
  const pointsRedeemActive = usePoints
    && !!redeemMemberId
    && (Number(currentMember?.points || 0) >= REDEEM_POINTS_THRESHOLD || wasRedeemed);

  const {
    subtotal, effectiveComboDiscount, effectiveSpendDiscount, reviewDiscountAmount,
    discountAmount, vatAmount, netTotal, totalRows, totalHints,
  } = usePosTotals({
    cart, comboSettings, saleSettings, spendThreshold, spendDiscount, reviewDiscount, activePromotion,
    pointsRedeemActive, redeemDiscountValue: REDEEM_DISCOUNT_VALUE, bringOwnGlass, ownGlassDiscount: OWN_GLASS_DISCOUNT, vatEnabled,
  });
  const SPEND_THRESHOLD = Number(spendThreshold) || 0;
  const SPEND_DISCOUNT_PERCENT = Number(spendDiscount) || 0;

  const categories = useMemo(() => ['แนะนำ', ...[...new Set(dynamicCategories.map(c => c.name))]], [dynamicCategories]);
  const menuById = useMemo(() => new Map(menu.map(m => [m.id, m])), [menu]);

  const filteredMenu = useMemo(() => {
    const search = debouncedSearchTerm.toLowerCase();
    if (search) {
      return menu.filter(i => i.available !== false && String(i.name || '').toLowerCase().includes(search));
    }
    const items = menu.filter(i => {
      const categoryMatch = activeCategory === 'แนะนำ' ? i.isFeatured : (i.category === activeCategory);
      return categoryMatch && i.available !== false;
    });
    // แท็บแนะนำเรียงตามที่ตั้งไว้ใน เมนู → จัดลำดับแนะนำ
    return activeCategory === 'แนะนำ' ? sortByFeaturedOrder(items) : items;
  }, [activeCategory, debouncedSearchTerm, menu]);

  const cartCount = useMemo(() => cart.reduce((s, i) => s + Number(i.quantity || 0), 0), [cart]);
  const qtyById = useMemo(() => {
    const m = new Map();
    for (const line of cart) m.set(line.id, (m.get(line.id) || 0) + Number(line.quantity || 0));
    return m;
  }, [cart]);
  const memberNameSuggestions = useMemo(() => {
    const query = getNameKey(memberNickname);
    if (!query || memberPhone) return [];
    return members
      .filter(member => member.phone && getNameKey(member.name).includes(query))
      .slice(0, 6);
  }, [memberNickname, memberPhone, members]);
  const currentQueue = editingOrderId ? (orders.find(o => o.id === editingOrderId)?.queueNumber || queueCounter) : queueCounter;

  useEffect(() => {
    if (memberPhone.length >= MEMBER_MIN_PHONE_LENGTH) {
      const found = members.find(m => m.phone === memberPhone);
      if (found) {
        setCurrentMember(found);
        setMemberNickname(found.name || '');
      } else {
        setCurrentMember({ phone: memberPhone, points: 0, name: memberNickname || 'ลูกค้าใหม่', isNew: true });
      }
    } else if (memberPhone.length > 0 && memberPhone.length < MEMBER_MIN_PHONE_LENGTH) {
      setCurrentMember(null);
      setUsePoints(false);
      setRedeemRewardId(null);
    } else if (!memberPhone && !memberNickname) {
      setCurrentMember(null);
      setUsePoints(false);
      setRedeemRewardId(null);
    }
  }, [memberPhone, members, memberNickname]);

  useEffect(() => {
    if (memberPhone && memberPhone.length >= MEMBER_MIN_PHONE_LENGTH) return;
    const nameKey = getNameKey(memberNickname);
    if (!nameKey) {
      if (!memberPhone) {
        setCurrentMember(null); setUsePoints(false);
        setRedeemRewardId(null);
      }
      return;
    }
    // Do not resolve members while the nickname is still being typed. A partial
    // name such as "โอ" may itself be a member and used to hijack "โอ๊ต" by
    // auto-filling that member's phone. Phone is the canonical member identity;
    // a name without a phone remains freely editable guest text on this bill.
    setCurrentMember({ phone: '', points: 0, name: memberNickname, isNew: true, isGuest: !ALLOW_NAME_ONLY_MEMBERS });
    setUsePoints(false);
    setRedeemRewardId(null);
  }, [memberNickname, memberPhone]);

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
        setReviewDiscount(orderToEdit.reviewDiscount || false);
        // Keep an existing redemption on when re-opening the bill so the discount is
        // preserved and reconciliation (in handleCheckout) doesn't refund it.
        setUsePoints(!!orderToEdit.pointsRedeemed);
        if (orderToEdit.memberPhone) setMemberPhone(orderToEdit.memberPhone);
        if (orderToEdit.memberNickname) setMemberNickname(orderToEdit.memberNickname);
      } else {
        toast.warning('บิลนี้ถูกลบแล้ว');
        setEditingOrderId(null);
      }
    }
    prevEditingIdRef.current = editingOrderId;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only when editingOrderId changes; toast/setEditingOrderId are stable
  }, [editingOrderId]);

  const featuredItems = useMemo(() => sortByFeaturedOrder(menu.filter(i => i.isFeatured && i.available !== false)), [menu]);
  const cartRef = useRef(cart);
  cartRef.current = cart;
  const featuredItemsRef = useRef(featuredItems);
  featuredItemsRef.current = featuredItems;
  const checkoutInFlight = useRef(new Set());
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const handleCheckoutRef = useRef(null);
  const handleClearCartRef = useRef(null);
  const addToCartRef = useRef(null);

  // ---- cart mutations: stable callbacks so memoised tiles/rows skip re-rendering ----
  const addToCart = useCallback((p) => {
    if (needsOptionSheet(p, beanModifiers, saleSettings)) {
      setPendingItem(p);
      return;
    }
    setCart(prev => addPlainLine(prev, buildPlainLine(p, saleSettings)));
  }, [beanModifiers, saleSettings]);
  addToCartRef.current = addToCart;

  const addFromSheet = useCallback((item, mods, sweetness, milkType) => {
    setCart(prev => addOptionLine(prev, buildOptionLine(item, mods, sweetness, milkType, saleSettings)));
    setPendingItem(null);
  }, [saleSettings]);
  const closeSheet = useCallback(() => setPendingItem(null), []);

  const updateCartItemNote = useCallback((cartItemId, note) => setCart(prev => prev.map(item => (item.cartId || item.id) === cartItemId ? { ...item, note } : item)), []);
  const updateQuantity = useCallback((cartItemId, d) => setCart(prev => prev.map(item => (item.cartId || item.id) === cartItemId ? { ...item, quantity: Math.max(0, item.quantity + d) } : item).filter(item => item.quantity > 0)), []);
  const removeItem = useCallback((cartItemId) => setCart(prev => prev.filter(item => (item.cartId || item.id) !== cartItemId)), []);

  const toggleItemPromo = useCallback((cartItemId) => {
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
  }, [activePromotion, toast]);

  useEffect(() => {
    const handlePosShortcut = (event) => {
      const { action, index } = event.detail || {};
      switch (action) {
        case 'checkout':
          if (cartRef.current.length > 0) handleCheckoutRef.current();
          break;
        case 'clear':
          handleClearCartRef.current();
          break;
        case 'remove_last':
          if (cartRef.current.length > 0) {
            const lastItem = cartRef.current[cartRef.current.length - 1];
            updateQuantity(lastItem.cartId || lastItem.id, -1);
          }
          break;
        case 'quick_add':
          if (typeof index === 'number' && featuredItemsRef.current[index]) {
            addToCartRef.current(featuredItemsRef.current[index]);
          }
          break;
        default: break;
      }
    };
    window.addEventListener('pos-shortcut', handlePosShortcut);
    return () => window.removeEventListener('pos-shortcut', handlePosShortcut);
  }, [updateQuantity]);

  // "ซ้ำล่าสุด": the most recent order, rebuilt from today's menu (read-only on orders).
  const lastOrder = useMemo(() => {
    let best = null;
    for (const o of orders) {
      if (o.status === 'cancelled' || !(o.items || []).length) continue;
      if (!best || orderMillis(o) > orderMillis(best)) best = o;
    }
    return best;
  }, [orders]);
  const repeatCandidate = useMemo(
    () => (lastOrder ? repeatLines(lastOrder, { menuById, beanModifiers, saleSettings }) : []),
    [lastOrder, menuById, beanModifiers, saleSettings],
  );
  const handleRepeatLast = useCallback(() => {
    setCart(prev => repeatCandidate.reduce((acc, line) => (line.cartId
      ? (acc.some(c => c.cartId === line.cartId) ? acc.map(c => (c.cartId === line.cartId ? { ...c, quantity: c.quantity + line.quantity } : c)) : [...acc, line])
      : (acc.some(c => c.id === line.id && !c.beanModifier && !c.cartId) ? acc.map(c => (c.id === line.id && !c.beanModifier && !c.cartId ? { ...c, quantity: c.quantity + line.quantity } : c)) : [...acc, line])), prev));
  }, [repeatCandidate]);

  const handleRefreshMembers = useCallback(() => {
    setIsRefreshingMembers(true);
    setTimeout(() => setIsRefreshingMembers(false), 1000);
  }, []);

  const handleClearMember = useCallback(() => {
    setMemberPhone('');
    setMemberNickname('');
    setCurrentMember(null);
    setUsePoints(false);
    setRedeemRewardId(null);
  }, []);

  const handleSelectMember = useCallback((member) => {
    setMemberPhone(String(member.phone || ''));
    setMemberNickname(String(member.name || ''));
    setCurrentMember(member);
    setUsePoints(false);
    setRedeemRewardId(null);
    setIsMemberNameFocused(false);
  }, []);

  const handleNicknameChange = useCallback((value) => {
    setMemberNickname(value);
    if (memberPhone) {
      setMemberPhone('');
      setCurrentMember(null);
      setUsePoints(false);
      setRedeemRewardId(null);
    }
  }, [memberPhone]);

  // Clear the whole in-progress sale — including edit mode. Leaving editingOrderId
  // set after "ล้าง" made the next customer's checkout OVERWRITE the previously
  // edited order (data corruption). Also drop member/redeem/review state tied to
  // the abandoned sale so it can't leak onto the next bill.
  const handleClearCart = () => {
    setCart([]);
    setUsePoints(false);
    setRedeemRewardId(null);
    setBringOwnGlass(false);
    setReviewDiscount(false);
    setMemberPhone('');
    setMemberNickname('');
    setCurrentMember(null);
    setEditingOrderId(null);
  };
  handleClearCartRef.current = handleClearCart;

  // `paidArg` comes from the split CTA (รับเงินแล้ว = true / ค้างจ่าย = false). The
  // keyboard shortcut and edit mode pass nothing → the current `isPaid` state.
  const handleCheckout = (paidArg) => withInFlightGuard(checkoutInFlight.current, ['checkout'], async () => {
    if (cart.length === 0) return;
    const paid = typeof paidArg === 'boolean' ? paidArg : isPaid;
    if (!user) {
      toast.error('ไม่พบข้อมูลผู้ใช้งาน - กรุณารีเฟรชหน้าจอหรือตรวจสอบอินเทอร์เน็ต');
      return;
    }
    await runDbAction(async () => {
      const orderData = {
        queueNumber: editingOrderId ? (orders.find(o => o.id === editingOrderId)?.queueNumber || queueCounter) : queueCounter,
        items: toOrderItems(cart), subtotal: Number(subtotal), discount: Number(discountAmount),
        vat: Number(vatAmount), total: Number(netTotal), vatIncluded: vatEnabled,
        isPaid: paid, memberPhone: currentMember?.phone || '', memberNickname,
        status: 'pending',
        promotionTitle: activePromotion?.title
          || (effectiveComboDiscount > 0 ? COMBO_PROMO_TITLE : '')
          || (effectiveSpendDiscount > 0 ? `สั่งครบ ฿${SPEND_THRESHOLD.toLocaleString()} -${SPEND_DISCOUNT_PERCENT}%` : ''),
        promotionDiscountPercent: activePromotion?.discountPercent || 0,
        bringOwnGlass, reviewDiscount, createdAt: serverTimestamp(), date: getISODate(),
        time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        table: 'Walk-in'
      };
      const nameKey = getNameKey(memberNickname);
      const phoneValid = memberPhone && memberPhone.length >= MEMBER_MIN_PHONE_LENGTH;
      const nameValid = nameKey && nameKey.length > 0;
      const existingByPhone = phoneValid ? members.find(m => m.phone === memberPhone) : null;
      const existingByName = !existingByPhone && nameValid ? members.find(m => getNameKey(m.name) === nameKey) : null;
      const existingMember = existingByPhone || existingByName;
      let memberId = existingMember ? (existingMember.id || existingMember.phone) : null;
      if (!memberId) {
        if (phoneValid) memberId = memberPhone;
        // ไม่มีเบอร์ = ไม่สร้างสมาชิกใหม่ (ชื่อเล่นยังอยู่บนบิล แต่ไม่เข้าระบบสมาชิก)
        // ชื่อเล่นซ้ำกันได้ง่ายมาก การสร้าง doc `name:xxx` ทำให้คนละคนถูกยำรวมกัน
        else if (nameValid && ALLOW_NAME_ONLY_MEMBERS) memberId = `name:${nameKey}`;
      }
      // Collect every member-doc write keyed by id so the batch never writes
      // the same document twice (e.g. a member who both earns pending points
      // and redeems on the same bill is merged into one payload).
      const memberWrites = {};
      const addMemberWrite = (id, fields) => {
        if (!id) return;
        memberWrites[id] = { ...(memberWrites[id] || {}), ...fields };
      };

      if (memberId) {
        const memberData = { lastOrderAt: serverTimestamp() };
        if (!editingOrderId) {
          // Earned points go to pendingPoints and require the owner's approval
          // in the Members page — never auto-credited. (Redemption below is
          // applied in real time because the customer is using points now.)
          const pointsToAdd = Math.floor(netTotal / 10);
          if (pointsToAdd > 0) {
            memberData.pendingPoints = increment(pointsToAdd);
            memberData.pendingReason = 'order';
          }
        }
        if (memberNickname) memberData.name = memberNickname;
        if (phoneValid) memberData.phone = memberPhone;
        if (!existingMember) {
          if (!memberData.name) memberData.name = memberNickname || 'ลูกค้าใหม่';
          if (!memberData.phone && phoneValid) memberData.phone = memberPhone;
          memberData.createdAt = serverTimestamp();
        }
        addMemberWrite(memberId, memberData);
      }

      // Loyalty redemption: deduct/refund points atomically with saving the
      // order (single writeBatch), and stamp the order with what it redeemed so
      // re-edits stay idempotent. If the order write fails, no points move.
      const redeemAmount = REDEEM_POINTS_THRESHOLD;
      const membersPath = ['artifacts', appId, 'public', 'data', 'members'];
      const batch = writeBatch(db);

      if (editingOrderId) {
        const originalOrder = orders.find(o => o.id === editingOrderId);
        const editData = { ...orderData, updatedAt: serverTimestamp() };
        if (originalOrder?.status) editData.status = originalOrder.status;
        if (originalOrder?.createdAt) editData.createdAt = originalOrder.createdAt;
        if (originalOrder?.date) editData.date = originalOrder.date;
        
        await runTransaction(db, async transaction => {
          const oldMemberDocId = originalOrder?.memberPhone 
            ? (members.find(m => m.phone === originalOrder.memberPhone)?.id || originalOrder.memberPhone) 
            : null;
            
          // Only the old member's balance matters (clawback); the new member just gets pending.
          const oldMemberSnap = oldMemberDocId ? await transaction.get(doc(db, ...membersPath, oldMemberDocId)) : null;
          
          const oldMemberData = oldMemberSnap?.exists() ? { id: oldMemberDocId, ...oldMemberSnap.data() } : null;
          
          const oldEarned = typeof originalOrder?.pointsEarned === 'number' ? originalOrder.pointsEarned : Math.floor(Number(originalOrder?.total || 0) / 10);
          const newEarned = Math.floor(netTotal / 10);
          
          editData.pointsEarned = newEarned;
          
          const { oldMemberUpdates, newMemberUpdates } = planBillEditPoints({
             oldMember: oldMemberData,
             newMemberId: memberId,
             oldEarned,
             newEarned
          });
          
          // Points-only changes; the member's name/phone/lastOrderAt come from memberWrites below.
          const applyUpdates = (memberRef, updates) => {
            if (!updates) return;
            const payload = {};
            if (updates.pendingPointsUpdate) payload.pendingPoints = increment(updates.pendingPointsUpdate);
            if (updates.pointsUpdate) {
              payload.points = increment(updates.pointsUpdate);
              const historyEntry = { delta: updates.pointsUpdate, reason: 'bill-edit', orderId: editingOrderId, at: new Date().toISOString() };
              if (auth.currentUser?.email) historyEntry.by = auth.currentUser.email;
              payload.pointsHistory = arrayUnion(historyEntry);
            }
            if (updates.pendingOrderIdsAction === 'add') {
              payload.pendingOrderIds = arrayUnion(editingOrderId);
              payload.pendingReason = 'order';
            } else if (updates.pendingOrderIdsAction === 'remove') {
              payload.pendingOrderIds = arrayRemove(editingOrderId);
            }
            if (Object.keys(payload).length) transaction.set(memberRef, payload, { merge: true });
          };
          
          if (oldMemberDocId) {
             applyUpdates(doc(db, ...membersPath, oldMemberDocId), oldMemberUpdates);
          }
          if (memberId && memberId !== oldMemberDocId) {
             applyUpdates(doc(db, ...membersPath, memberId), newMemberUpdates);
          }
          
          // Loyalty redemption for edit
          if (pointsRedeemActive && !wasRedeemed && redeemMemberId) {
             const rEntry = { delta: -redeemAmount, reason: 'redeem', at: new Date().toISOString() };
             if (auth.currentUser?.email) rEntry.by = auth.currentUser.email;
             transaction.set(doc(db, ...membersPath, redeemMemberId), {
                points: increment(-redeemAmount),
                pointsHistory: arrayUnion(rEntry)
             }, { merge: true });
             editData.pointsRedeemed = true;
             editData.pointsRedeemId = redeemMemberId;
             editData.pointsRedeemAmount = redeemAmount;
          } else if (!pointsRedeemActive && wasRedeemed) {
             const refundId = originalOrder?.pointsRedeemId;
             const refundAmt = Number(originalOrder?.pointsRedeemAmount) || redeemAmount;
             if (refundId) {
                const rEntry = { delta: refundAmt, reason: 'redeem-refund', at: new Date().toISOString() };
                if (auth.currentUser?.email) rEntry.by = auth.currentUser.email;
                transaction.set(doc(db, ...membersPath, refundId), {
                   points: increment(refundAmt),
                   pointsHistory: arrayUnion(rEntry)
                }, { merge: true });
             }
             editData.pointsRedeemed = false;
             editData.pointsRedeemId = '';
             editData.pointsRedeemAmount = 0;
          }
          
          // Name/phone/lastOrderAt (and createdAt for a brand-new member) for the bill's member.
          Object.entries(memberWrites).forEach(([id, data]) => {
            transaction.set(doc(db, ...membersPath, id), data, { merge: true });
          });
          transaction.update(doc(db, 'artifacts', appId, 'public', 'data', 'orders', editingOrderId), editData);
        });
        
        setEditingOrderId(null);
      } else {
        const orderRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'orders'));
        const queueRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'queue');
        
        const pointsEarned = Math.floor(netTotal / 10);
        orderData.pointsEarned = pointsEarned;
        
        if (memberId && pointsEarned > 0) {
           addMemberWrite(memberId, {
              pendingOrderIds: arrayUnion(orderRef.id)
           });
        }
        
        if (pointsRedeemActive && redeemMemberId) {
          const rEntry = { delta: -redeemAmount, reason: 'redeem', at: new Date().toISOString() };
          if (auth.currentUser?.email) rEntry.by = auth.currentUser.email;
          addMemberWrite(redeemMemberId, {
            points: increment(-redeemAmount),
            pointsHistory: arrayUnion(rEntry),
          });
          orderData.pointsRedeemed = true;
          orderData.pointsRedeemId = redeemMemberId;
          orderData.pointsRedeemAmount = redeemAmount;
        }
        
        // New order doc + member writes + queue increment, all-or-nothing.
        Object.entries(memberWrites).forEach(([id, data]) => {
          batch.set(doc(db, ...membersPath, id), data, { merge: true });
        });
        batch.set(orderRef, orderData);
        // Atomic increment — prevents duplicate queue numbers when POS and QR checkout race.
        // First order of a new business day (10:00) restarts the count: this sale is #1.
        if (queueInfo?.sameDay === false) batch.set(queueRef, { current: 2, day: queueInfo.day });
        else batch.set(queueRef, { current: increment(1), day: queueInfo?.day ?? queueDayKey() }, { merge: true });
        await batch.commit();
        // Best-selling counter (best-effort; never blocks the sale)
        bumpMenuSoldCount(cart);
      }
      setCart([]); setIsPaid(false); setMemberPhone(''); setMemberNickname(''); setUsePoints(false);
      setRedeemRewardId(null); setBringOwnGlass(false); setReviewDiscount(false);
      toast.success(editingOrderId ? 'แก้ไขออเดอร์สำเร็จ' : `บันทึกออเดอร์ #${queueCounter} สำเร็จ · ${paid ? 'รับเงินแล้ว' : 'ค้างจ่าย'}`);
    }, 'บันทึกออเดอร์ไม่สำเร็จ');
  }, ids => setCheckoutBusy(ids.size > 0));

  handleCheckoutRef.current = handleCheckout;

  const handleGetRecommendations = useCallback(async () => {
    const cart = cartRef.current;
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
      toast.error('แนะนำเมนูไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setIsRecommending(false);
    }
  }, [menu, callGeminiAPI, toast]);

  // ---------------------------------------------------------------- render parts
  // Every callback handed to a memoised child is stable, so a cart tap only
  // re-renders what shows the cart (grid tile badge, cart lines, totals).
  const selectCategory = useCallback((cat) => { setActiveCategory(cat); setSearchTerm(''); }, []);
  const clearPromotion = useCallback(() => setActivePromotion(null), [setActivePromotion]);
  const toggleOwnGlass = useCallback(() => setBringOwnGlass(v => !v), []);
  const toggleReview = useCallback(() => setReviewDiscount(v => !v), []);
  const focusName = useCallback(() => setIsMemberNameFocused(true), []);
  const blurName = useCallback(() => setIsMemberNameFocused(false), []);
  const toggleRedeem = useCallback(() => {
    const res = toggleRewardSelection(usePoints, redeemRewardId, 'discount');
    setUsePoints(res.usePoints);
    setRedeemRewardId(res.redeemRewardId);
  }, [usePoints, redeemRewardId]);
  const selectReward = useCallback((rewardId) => {
    const res = toggleRewardSelection(usePoints, redeemRewardId, 'reward', rewardId);
    setUsePoints(res.usePoints);
    setRedeemRewardId(res.redeemRewardId);
  }, [usePoints, redeemRewardId]);
  const dismissUpsell = useCallback(() => setRecommendations([]), []);
  const pickUpsell = useCallback((rec) => { trackRecommendationAccepted(rec); addToCartRef.current(rec); }, []);
  const checkout = useCallback((paid) => handleCheckoutRef.current(paid), []);
  const checkoutFromSheet = useCallback((paid) => { handleCheckoutRef.current(paid); setIsMobileCartOpen(false); }, []);

  const eligibleRewards = useMemo(() => ((pointsRewardsEnabled && currentMember && !currentMember.isGuest)
    ? getEligibleRewards(pointsRewards, currentMember.points) : []), [pointsRewardsEnabled, currentMember, pointsRewards]);
  const upsell = useMemo(() => ({
    items: recommendations, loading: isRecommending, onAsk: handleGetRecommendations, onDismiss: dismissUpsell, onPick: pickUpsell,
  }), [recommendations, isRecommending, handleGetRecommendations, dismissUpsell, pickUpsell]);


  const discountPanel = (
    <DiscountMemberPanel
      bringOwnGlass={bringOwnGlass} onToggleOwnGlass={toggleOwnGlass} ownGlassDiscount={OWN_GLASS_DISCOUNT}
      reviewDiscount={reviewDiscount} onToggleReview={toggleReview} reviewDiscountAmount={reviewDiscountAmount}
      memberPhone={memberPhone} onPhoneChange={setMemberPhone}
      memberNickname={memberNickname} onNicknameChange={handleNicknameChange}
      nameFocused={isMemberNameFocused} onNameFocus={focusName} onNameBlur={blurName}
      nameSuggestions={memberNameSuggestions} onSelectMember={handleSelectMember}
      currentMember={currentMember} onClearMember={handleClearMember}
      onRefreshMembers={handleRefreshMembers} isRefreshingMembers={isRefreshingMembers}
      netTotal={currentMember?.isNew ? netTotal : 0}
      redeemThreshold={REDEEM_POINTS_THRESHOLD} redeemDiscountValue={REDEEM_DISCOUNT_VALUE}
      usePoints={usePoints} pointsRedeemActive={pointsRedeemActive} onToggleRedeem={toggleRedeem}
      eligibleRewards={eligibleRewards} redeemRewardId={redeemRewardId} onSelectReward={selectReward}
    />
  );

  const checkoutBar = (onCheckout) => (
    <CheckoutBar
      subtotal={subtotal} rows={totalRows} hints={totalHints} netTotal={netTotal}
      disabled={cart.length === 0} busy={checkoutBusy} editing={!!editingOrderId}
      isPaid={isPaid} onPaidChange={setIsPaid} onCheckout={onCheckout}
    />
  );

  const cartPanelProps = {
    cart, menuById, activePromotion, currentQueue, cartCount, editing: !!editingOrderId,
    onQty: updateQuantity, onRemove: removeItem, onNote: updateCartItemNote, onTogglePromo: toggleItemPromo,
    onClear: handleClearCart,
    repeat: repeatCandidate.length > 0 ? { count: repeatCandidate.length, queue: lastOrder?.queueNumber, onRepeat: handleRepeatLast } : null,
    upsell,
  };

  const searching = !!debouncedSearchTerm;

  return (
    <>
      <div className="flex flex-col md:flex-row h-full min-h-0 bg-[var(--bg-canvas)] text-[var(--text-primary)]">
        {/* Category rail · fixed 88px on iPad landscape / desktop */}
        <div className="hidden lg:block h-full">
          <CategoryRail categories={categories} active={searching ? null : activeCategory} onSelect={selectCategory} vertical />
        </div>

        {/* Menu */}
        <section className="flex-1 min-w-0 min-h-0 flex flex-col" aria-label="เมนู">
          <div className="lg:hidden bg-[var(--bg-canvas)]">
            <CategoryRail categories={categories} active={searching ? null : activeCategory} onSelect={selectCategory} />
          </div>
          <MenuHeader
            searchTerm={searchTerm} onSearch={setSearchTerm}
            density={density} onDensity={setDensity}
            title={searching ? `ผลค้นหา “${debouncedSearchTerm}”` : activeCategory}
            count={filteredMenu.length}
            promotion={activePromotion} onClearPromotion={clearPromotion}
          />
          <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-5 pb-28 md:pb-6" data-menu-scroll>
            <MenuGrid
              items={filteredMenu}
              saleSettings={saleSettings}
              onAdd={addToCart}
              density={density}
              qtyById={qtyById}
              loading={isSyncing}
              showFeatured={activeCategory !== 'แนะนำ' || searching}
            />
          </div>
        </section>

        {/* Cart · iPad / desktop */}
        {isMdUp && (
          <aside className="flex w-[300px] lg:w-[340px] shrink-0 h-full min-h-0 border-l border-[var(--border-color)]" aria-label="ตะกร้า">
            <div className="w-full h-full">
              <CartPanel {...cartPanelProps} discountPanel={discountPanel} checkoutBar={checkoutBar(checkout)} />
            </div>
          </aside>
        )}
      </div>

      {!isMdUp && (
        <>
          {/* Phone: cart bar above the tab bar */}
          <button
            type="button"
            onClick={() => setIsMobileCartOpen(true)}
            data-mobile-cart-bar
            className="fixed left-4 right-4 z-[140] min-h-14 px-4 flex items-center gap-3 rounded-[var(--radius)] bg-[var(--accent)] text-[var(--text-on-accent)] shadow-[var(--elev-3)] active:scale-[0.99] transition-transform"
            style={{ bottom: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 8px)' }}
          >
            <ShoppingBag size={20} />
            <span className="flex-1 min-w-0 text-left">
              <span className="block text-sm font-semibold leading-normal">
                {cart.length ? <>ตะกร้า · <span className="num">{cartCount}</span> ชิ้น</> : 'ตะกร้าว่าง'}
              </span>
              <span className="block text-xs leading-[18px] opacity-90">คิว <span className="num">#{currentQueue}</span></span>
            </span>
            <span className="num text-lg font-semibold">{formatBaht(netTotal)}</span>
            <ChevronRight size={18} />
          </button>

          <Sheet
            open={isMobileCartOpen}
            onClose={() => setIsMobileCartOpen(false)}
            side="bottom"
            title={editingOrderId ? 'แก้ไขบิล' : 'ตะกร้า'}
            description={<><span className="num">{cartCount}</span> ชิ้น · คิว <span className="num">#{currentQueue}</span></>}
            footer={(
              <div className="w-[calc(100%+2.5rem)] -mx-5 -my-3">
                {discountPanel}
                {checkoutBar(checkoutFromSheet)}
              </div>
            )}
          >
            <CartPanel {...cartPanelProps} showHeader={false} />
          </Sheet>
        </>
      )}

      <OptionSheet
        item={pendingItem}
        beanModifiers={beanModifiers}
        saleSettings={saleSettings}
        onAdd={addFromSheet}
        onClose={closeSheet}
      />
    </>
  );
}
