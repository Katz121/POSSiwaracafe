import { useEffect, useState, useRef, useMemo } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { publishPublicMenu } from '../utils/publicMenu';
import { nextQueueNumber, queueDayKey } from '../utils/queueDay';
import {
  DEFAULT_ADMIN_PIN,
  DEFAULT_REDEEM_POINTS_THRESHOLD,
  DEFAULT_REDEEM_DISCOUNT_VALUE,
  DEFAULT_OWN_GLASS_DISCOUNT,
  DEFAULT_STARTING_CASH,
  DEFAULT_CAKE_SALE_PERCENT,
  DEFAULT_CAKE_SALE_START,
  DEFAULT_CAKE_SALE_END,
  DEFAULT_COMBO_PERCENT
} from '../config/constants';

// Map a collection snapshot to `{ id, ...data }` rows, re-using the previous row
// object for every doc that did not change. WHY: the whole-collection listeners
// (orders ~2.3k, expenses ~1k, members ~300) fire on every write/ack; calling
// d.data() + spreading for all N docs each time allocates N fresh objects and
// burns main-thread time on the POS iPad. Only docChanges() are rebuilt now.
// Output (content + order) is identical to the old s.docs.map(...).
function mapDocsReusing(s, cache, { includeMetadataChanges = false, extra } = {}) {
  const changed = new Set();
  for (const c of s.docChanges({ includeMetadataChanges })) changed.add(c.doc.id);
  const next = new Map();
  const rows = s.docs.map((d) => {
    let row = changed.has(d.id) ? undefined : cache.current.get(d.id);
    if (!row) row = extra ? { id: d.id, ...d.data(), ...extra(d) } : { id: d.id, ...d.data() };
    next.set(d.id, row);
    return row;
  });
  cache.current = next;
  return rows;
}

export default function usePosData(user, appId) {
  const [isSyncing, setIsSyncing] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);
  const [stock, setStock] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [members, setMembers] = useState([]);
  const [dynamicCategories, setDynamicCategories] = useState([]);
  const [beanModifiers, setBeanModifiers] = useState([]);
  // config/queue raw doc · the number shown/used restarts at 1 every business
  // day (10:00 Bangkok), re-evaluated each minute so an open POS rolls over too.
  const [queueDoc, setQueueDoc] = useState(null);
  // recipes/{menuId} → { text, menuName, updatedAt } · staff-only (see firestore.rules)
  const [recipes, setRecipes] = useState({});
  const [queueTick, setQueueTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setQueueTick((n) => n + 1), 60 * 1000); return () => clearInterval(t); }, []);
  const queueInfo = useMemo(() => nextQueueNumber(queueDoc), [queueDoc, queueTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const queueCounter = queueInfo.number;
  const [pinEnabled, setPinEnabled] = useState(true);
  const [vatEnabled, setVatEnabled] = useState(true);
  const [adminPin, setAdminPin] = useState(DEFAULT_ADMIN_PIN);
  const [redeemPointsThreshold, setRedeemPointsThreshold] = useState(DEFAULT_REDEEM_POINTS_THRESHOLD);
  const [pointsExpiryMonths, setPointsExpiryMonths] = useState(0);
  const [pointsRewardsEnabled, setPointsRewardsEnabled] = useState(false);
  const [pointsRewards, setPointsRewards] = useState([]);
  const [redeemDiscountValue, setRedeemDiscountValue] = useState(DEFAULT_REDEEM_DISCOUNT_VALUE);
  const [ownGlassDiscount, setOwnGlassDiscount] = useState(DEFAULT_OWN_GLASS_DISCOUNT);
  const [geminiApiKey, setGeminiApiKey] = useState(''); // เลิกใช้แล้ว (AI ย้ายไป Muse) · อ่านไว้เฉยๆ ไม่ลบฟิลด์ใน Firestore
  const [startingCash, setStartingCash] = useState(DEFAULT_STARTING_CASH);
  const [quickExpenses, setQuickExpenses] = useState([]);
  const [reviewUrl, setReviewUrl] = useState('');
  const [shopName, setShopName] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [taxId, setTaxId] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [receiptPaperWidth, setReceiptPaperWidth] = useState(80);
  const [cakeSaleEnabled, setCakeSaleEnabled] = useState(false);
  const [cakeSaleCategories, setCakeSaleCategories] = useState([]);
  const [cakeSalePercent, setCakeSalePercent] = useState(DEFAULT_CAKE_SALE_PERCENT);
  const [cakeSaleStart, setCakeSaleStart] = useState(DEFAULT_CAKE_SALE_START);
  const [cakeSaleEnd, setCakeSaleEnd] = useState(DEFAULT_CAKE_SALE_END);
  const [comboEnabled, setComboEnabled] = useState(false);
  const [comboPercent, setComboPercent] = useState(DEFAULT_COMBO_PERCENT);
  const [spendThreshold, setSpendThreshold] = useState(0);
  const [spendDiscount, setSpendDiscount] = useState(0);
  const [milkSwapSetting, setMilkSwapSetting] = useState(null);
  const [packagingPresetsSetting, setPackagingPresetsSetting] = useState(null);
  const [settingsRaw, setSettingsRaw] = useState(null);

  // Row caches for mapDocsReusing (reset whenever the listeners re-subscribe).
  const ordersCache = useRef(new Map());
  const expensesCache = useRef(new Map());
  const membersCache = useRef(new Map());

  // Serialized bundle this device last published to config/publicMenu (skip no-op writes).
  const lastPublishedRef = useRef(null);

  // Use user UID as dependency instead of user object to prevent
  // re-subscribing all listeners when Firebase refreshes auth token
  const userId = user?.uid;

  useEffect(() => {
    if (!userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: show loading state while (re)subscribing to Firestore listeners
    setIsSyncing(true);
    ordersCache.current = new Map();
    expensesCache.current = new Map();
    membersCache.current = new Map();

    // pinEnabled/adminPin live in config/settings, which Firestore can deliver
    // after the multi-MB orders snapshot (10+ s on a cold device). App holds
    // PIN-protected views until this flips, instead of holding the whole loader.
    setSettingsLoaded(false);

    const handleSnapshotError = (err) => {
      console.error("Firestore Error:", err);
      setSettingsLoaded(true); // never strand the owner on a spinner
      setSyncError(err.code === 'permission-denied' ? 'ไม่มีสิทธิ์เข้าถึงข้อมูล' : 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ');
      setIsSyncing(false);
    };

    const unsubCats = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'categories'), (s) => {
      // Sort by the `order` field so the category sequence (POS dropdowns + the
      // customer QR tab bar, which both consume this order) is controllable.
      // Categories without an `order` fall to the end, keeping insertion order
      // among themselves (Array.prototype.sort is stable).
      setDynamicCategories(
        s.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
      );
      // Unblock the full-screen loader as soon as the first (tiny) collection
      // arrives. Don't wait for the 887-doc orders + multi-MB base64 menu — each
      // view shows its own skeleton while its data streams in behind the shell.
      setIsSyncing(false);
    }, handleSnapshotError);
    const unsubMenu = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'menu'), (s) => setMenu(s.docs.map(d => ({ id: d.id, ...d.data() }))), handleSnapshotError);
    const unsubStock = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'stock'), (s) => setStock(s.docs.map(d => ({ id: d.id, ...d.data() }))), handleSnapshotError);
    // includeMetadataChanges: needed so `hasPendingWrites` is accurate. Firestore
    // applies a write to the local cache immediately (latency compensation), so the
    // UI moves before the server has acked — and without this flag no snapshot fires
    // when the ack finally arrives, because the document data itself didn't change.
    // The kitchen view surfaces this per order, turning a write that silently never
    // lands into something staff can actually see. These callbacks are local-only:
    // they cost no extra Firestore reads.
    const unsubOrders = onSnapshot(
      collection(db, 'artifacts', appId, 'public', 'data', 'orders'),
      { includeMetadataChanges: true },
      (s) => {
        setOrders(mapDocsReusing(s, ordersCache, {
          includeMetadataChanges: true,
          // Not a stored field — derived per snapshot. Nothing writes an order doc
          // back by spreading it, so this can't leak into Firestore. (A flip of
          // hasPendingWrites is a metadata docChange, so that row is rebuilt.)
          extra: (d) => ({ hasPendingWrites: d.metadata.hasPendingWrites }),
        }));
      },
      handleSnapshotError
    );
    const unsubExp = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'expenses'), (s) => setExpenses(mapDocsReusing(s, expensesCache)), handleSnapshotError);
    const unsubMem = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'members'), (s) => setMembers(mapDocsReusing(s, membersCache)), handleSnapshotError);
    const unsubBeans = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'beanModifiers'), (s) => setBeanModifiers(s.docs.map(d => ({ id: d.id, ...d.data() }))), handleSnapshotError);
    const unsubQuickExp = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'quickExpenses'), (s) => setQuickExpenses(s.docs.map(d => ({ id: d.id, ...d.data() }))), handleSnapshotError);

    const unsubRecipes = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'recipes'), (s) => {
      setRecipes(Object.fromEntries(s.docs.map((d) => [d.id, d.data()])));
    }, handleSnapshotError);

    const unsubQueue = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'queue'), (d) => {
      if (d.exists()) setQueueDoc(d.data());
      else setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'queue'), { current: 1, day: queueDayKey() });
    }, handleSnapshotError);

    const unsubSettings = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'settings'), (d) => {
      const rewardsSettings = d.exists() ? d.data() : {};
      setPointsRewardsEnabled(rewardsSettings.pointsRewardsEnabled === true);
      setPointsRewards(Array.isArray(rewardsSettings.pointsRewards) ? rewardsSettings.pointsRewards : []);
      if (d.exists()) {
        const data = d.data();
        setSettingsRaw(data);
        setPinEnabled(data.pinEnabled !== false);
        setVatEnabled(data.vatEnabled !== false);
        if (data.adminPin != null) setAdminPin(String(data.adminPin));
        if (data.redeemPointsThreshold != null) setRedeemPointsThreshold(Number(data.redeemPointsThreshold));
        if (data.pointsExpiryMonths != null) setPointsExpiryMonths(Number(data.pointsExpiryMonths));
        if (data.redeemDiscountValue != null) setRedeemDiscountValue(Number(data.redeemDiscountValue));
        if (data.ownGlassDiscount != null) setOwnGlassDiscount(Number(data.ownGlassDiscount));
        if (data.geminiApiKey != null) setGeminiApiKey(String(data.geminiApiKey));
        if (data.startingCash != null) setStartingCash(Number(data.startingCash));
        if (data.reviewUrl != null) setReviewUrl(String(data.reviewUrl));
        if (data.shopName != null) setShopName(String(data.shopName));
        if (data.shopAddress != null) setShopAddress(String(data.shopAddress));
        if (data.shopPhone != null) setShopPhone(String(data.shopPhone));
        if (data.taxId != null) setTaxId(String(data.taxId));
        if (data.receiptFooter != null) setReceiptFooter(String(data.receiptFooter));
        if (data.receiptPaperWidth != null) setReceiptPaperWidth(Number(data.receiptPaperWidth) || 0);
        setCakeSaleEnabled(data.cakeSaleEnabled === true);
        if (Array.isArray(data.cakeSaleCategories)) setCakeSaleCategories(data.cakeSaleCategories);
        if (data.cakeSalePercent != null) setCakeSalePercent(Number(data.cakeSalePercent));
        if (data.cakeSaleStart != null) setCakeSaleStart(String(data.cakeSaleStart));
        if (data.cakeSaleEnd != null) setCakeSaleEnd(String(data.cakeSaleEnd));
        setComboEnabled(data.comboEnabled === true);
        if (data.comboPercent != null) setComboPercent(Number(data.comboPercent));
        setSpendThreshold(Number(data.spendThreshold) || 0);
        setSpendDiscount(Number(data.spendDiscount) || 0);
        // นมโอ๊ตตัดแทนนมวัว · ยังไม่ตั้ง = null → App ใช้ค่าเริ่มต้นจากชื่อสต็อก (milkSwap.js)
        setMilkSwapSetting(data.milkSwap && typeof data.milkSwap === 'object' ? data.milkSwap : null);
        // ชุดแก้ว/หลอด · ยังไม่ตั้ง = null → ค่าเริ่มต้นจากชื่อสต็อก (packagingPresets.js)
        setPackagingPresetsSetting(Array.isArray(data.packagingPresets) ? data.packagingPresets : null);
      }
      setSettingsLoaded(true);
    }, handleSnapshotError);

    return () => { unsubCats(); unsubMenu(); unsubStock(); unsubOrders(); unsubExp(); unsubMem(); unsubBeans(); unsubQuickExp(); unsubRecipes(); unsubQueue(); unsubSettings(); };
  }, [userId, appId]);

  // (Re)publish the single-doc customer menu bundle whenever the source data changes.
  // Debounced so the initial burst of separate snapshot callbacks coalesces into one write.
  useEffect(() => {
    // Don't publish a half-loaded bundle. `isSyncing` only clears from the orders
    // snapshot, which can resolve before the menu snapshot — so also require menu
    // to have loaded, otherwise an empty `menu` could overwrite a good bundle.
    if (isSyncing || !appId || menu.length === 0) return;

    const timeout = setTimeout(async () => {
      try {
        const written = await publishPublicMenu(
          db,
          appId,
          { menu, categories: dynamicCategories, beanModifiers, settings: settingsRaw || {} },
          lastPublishedRef.current
        );
        if (written) lastPublishedRef.current = written;
      } catch (err) {
        console.error('publishPublicMenu failed:', err);
      }
    }, 800);

    return () => clearTimeout(timeout);
  }, [menu, dynamicCategories, beanModifiers, settingsRaw, appId, isSyncing]);

  return { pointsRewardsEnabled, pointsRewards, isSyncing, settingsLoaded, syncError, orders, menu, stock, expenses, members, dynamicCategories, beanModifiers, quickExpenses, queueCounter, queueInfo, recipes, pinEnabled, vatEnabled, adminPin, redeemPointsThreshold, pointsExpiryMonths, redeemDiscountValue, ownGlassDiscount, geminiApiKey, startingCash, reviewUrl, shopName, shopAddress, shopPhone, taxId, receiptFooter, receiptPaperWidth, cakeSaleEnabled, cakeSaleCategories, cakeSalePercent, cakeSaleStart, cakeSaleEnd, comboEnabled, comboPercent, spendThreshold, spendDiscount, milkSwapSetting, packagingPresetsSetting };
}
