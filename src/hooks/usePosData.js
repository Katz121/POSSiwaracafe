import { useEffect, useState, useRef } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { publishPublicMenu } from '../utils/publicMenu';
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

export default function usePosData(user, appId) {
  const [isSyncing, setIsSyncing] = useState(true);
  const [syncError, setSyncError] = useState(null);
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);
  const [stock, setStock] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [members, setMembers] = useState([]);
  const [dynamicCategories, setDynamicCategories] = useState([]);
  const [beanModifiers, setBeanModifiers] = useState([]);
  const [queueCounter, setQueueCounter] = useState(1);
  const [pinEnabled, setPinEnabled] = useState(true);
  const [vatEnabled, setVatEnabled] = useState(true);
  const [adminPin, setAdminPin] = useState(DEFAULT_ADMIN_PIN);
  const [redeemPointsThreshold, setRedeemPointsThreshold] = useState(DEFAULT_REDEEM_POINTS_THRESHOLD);
  const [redeemDiscountValue, setRedeemDiscountValue] = useState(DEFAULT_REDEEM_DISCOUNT_VALUE);
  const [ownGlassDiscount, setOwnGlassDiscount] = useState(DEFAULT_OWN_GLASS_DISCOUNT);
  const [geminiApiKey, setGeminiApiKey] = useState(import.meta.env.VITE_GEMINI_API_KEY || '');
  const [startingCash, setStartingCash] = useState(DEFAULT_STARTING_CASH);
  const [quickExpenses, setQuickExpenses] = useState([]);
  const [reviewUrl, setReviewUrl] = useState('');
  const [cakeSaleEnabled, setCakeSaleEnabled] = useState(false);
  const [cakeSaleCategories, setCakeSaleCategories] = useState([]);
  const [cakeSalePercent, setCakeSalePercent] = useState(DEFAULT_CAKE_SALE_PERCENT);
  const [cakeSaleStart, setCakeSaleStart] = useState(DEFAULT_CAKE_SALE_START);
  const [cakeSaleEnd, setCakeSaleEnd] = useState(DEFAULT_CAKE_SALE_END);
  const [comboEnabled, setComboEnabled] = useState(false);
  const [comboPercent, setComboPercent] = useState(DEFAULT_COMBO_PERCENT);
  const [spendThreshold, setSpendThreshold] = useState(0);
  const [spendDiscount, setSpendDiscount] = useState(0);
  const [settingsRaw, setSettingsRaw] = useState(null);

  // Serialized bundle this device last published to config/publicMenu (skip no-op writes).
  const lastPublishedRef = useRef(null);

  // Use user UID as dependency instead of user object to prevent
  // re-subscribing all listeners when Firebase refreshes auth token
  const userId = user?.uid;

  useEffect(() => {
    if (!userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: show loading state while (re)subscribing to Firestore listeners
    setIsSyncing(true);

    const handleSnapshotError = (err) => {
      console.error("Firestore Error:", err);
      setSyncError(err.code === 'permission-denied' ? 'ไม่มีสิทธิ์เข้าถึงข้อมูล' : 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ');
      setIsSyncing(false);
    };

    const unsubCats = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'categories'), (s) => {
      setDynamicCategories(s.docs.map(d => ({ id: d.id, ...d.data() })));
      // Unblock the full-screen loader as soon as the first (tiny) collection
      // arrives. Don't wait for the 887-doc orders + multi-MB base64 menu — each
      // view shows its own skeleton while its data streams in behind the shell.
      setIsSyncing(false);
    }, handleSnapshotError);
    const unsubMenu = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'menu'), (s) => setMenu(s.docs.map(d => ({ id: d.id, ...d.data() }))), handleSnapshotError);
    const unsubStock = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'stock'), (s) => setStock(s.docs.map(d => ({ id: d.id, ...d.data() }))), handleSnapshotError);
    const unsubOrders = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), (s) => {
      setOrders(s.docs.map(d => ({ id: d.id, ...d.data() })));
    }, handleSnapshotError);
    const unsubExp = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'expenses'), (s) => setExpenses(s.docs.map(d => ({ id: d.id, ...d.data() }))), handleSnapshotError);
    const unsubMem = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'members'), (s) => setMembers(s.docs.map(d => ({ id: d.id, ...d.data() }))), handleSnapshotError);
    const unsubBeans = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'beanModifiers'), (s) => setBeanModifiers(s.docs.map(d => ({ id: d.id, ...d.data() }))), handleSnapshotError);
    const unsubQuickExp = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'quickExpenses'), (s) => setQuickExpenses(s.docs.map(d => ({ id: d.id, ...d.data() }))), handleSnapshotError);

    const unsubQueue = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'queue'), (d) => {
      if (d.exists()) setQueueCounter(d.data().current || 1);
      else setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'queue'), { current: 1 });
    }, handleSnapshotError);

    const unsubSettings = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'settings'), (d) => {
      if (d.exists()) {
        const data = d.data();
        setSettingsRaw(data);
        setPinEnabled(data.pinEnabled !== false);
        setVatEnabled(data.vatEnabled !== false);
        if (data.adminPin != null) setAdminPin(String(data.adminPin));
        if (data.redeemPointsThreshold != null) setRedeemPointsThreshold(Number(data.redeemPointsThreshold));
        if (data.redeemDiscountValue != null) setRedeemDiscountValue(Number(data.redeemDiscountValue));
        if (data.ownGlassDiscount != null) setOwnGlassDiscount(Number(data.ownGlassDiscount));
        if (data.geminiApiKey != null) setGeminiApiKey(String(data.geminiApiKey));
        if (data.startingCash != null) setStartingCash(Number(data.startingCash));
        if (data.reviewUrl != null) setReviewUrl(String(data.reviewUrl));
        setCakeSaleEnabled(data.cakeSaleEnabled === true);
        if (Array.isArray(data.cakeSaleCategories)) setCakeSaleCategories(data.cakeSaleCategories);
        if (data.cakeSalePercent != null) setCakeSalePercent(Number(data.cakeSalePercent));
        if (data.cakeSaleStart != null) setCakeSaleStart(String(data.cakeSaleStart));
        if (data.cakeSaleEnd != null) setCakeSaleEnd(String(data.cakeSaleEnd));
        setComboEnabled(data.comboEnabled === true);
        if (data.comboPercent != null) setComboPercent(Number(data.comboPercent));
        setSpendThreshold(Number(data.spendThreshold) || 0);
        setSpendDiscount(Number(data.spendDiscount) || 0);
      }
    }, handleSnapshotError);

    return () => { unsubCats(); unsubMenu(); unsubStock(); unsubOrders(); unsubExp(); unsubMem(); unsubBeans(); unsubQuickExp(); unsubQueue(); unsubSettings(); };
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

  return { isSyncing, syncError, orders, menu, stock, expenses, members, dynamicCategories, beanModifiers, quickExpenses, queueCounter, pinEnabled, vatEnabled, adminPin, redeemPointsThreshold, redeemDiscountValue, ownGlassDiscount, geminiApiKey, startingCash, reviewUrl, cakeSaleEnabled, cakeSaleCategories, cakeSalePercent, cakeSaleStart, cakeSaleEnd, comboEnabled, comboPercent, spendThreshold, spendDiscount };
}
