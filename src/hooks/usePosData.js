import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import {
  DEFAULT_ADMIN_PIN,
  DEFAULT_REDEEM_POINTS_THRESHOLD,
  DEFAULT_REDEEM_DISCOUNT_VALUE,
  DEFAULT_OWN_GLASS_DISCOUNT,
  DEFAULT_STARTING_CASH
} from '../config/constants';

export default function usePosData(user, appId) {
  const [isSyncing, setIsSyncing] = useState(true);
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

  // Use user UID as dependency instead of user object to prevent
  // re-subscribing all listeners when Firebase refreshes auth token
  const userId = user?.uid;

  useEffect(() => {
    if (!userId) return;
    setIsSyncing(true);

    const handleSnapshotError = (err) => {
      console.error("Firestore Error:", err);
      // If permission denied or other error, stop syncing so app doesn't hang
      setIsSyncing(false);
    };

    const unsubCats = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'categories'), (s) => setDynamicCategories(s.docs.map(d => ({ id: d.id, ...d.data() }))), handleSnapshotError);
    const unsubMenu = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'menu'), (s) => setMenu(s.docs.map(d => ({ id: d.id, ...d.data() }))), handleSnapshotError);
    const unsubStock = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'stock'), (s) => setStock(s.docs.map(d => ({ id: d.id, ...d.data() }))), handleSnapshotError);
    const unsubOrders = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), (s) => {
      setOrders(s.docs.map(d => ({ id: d.id, ...d.data() })));
      setIsSyncing(false);
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
        setPinEnabled(data.pinEnabled !== false);
        setVatEnabled(data.vatEnabled !== false);
        if (data.adminPin) setAdminPin(String(data.adminPin));
        if (data.redeemPointsThreshold != null) setRedeemPointsThreshold(Number(data.redeemPointsThreshold));
        if (data.redeemDiscountValue != null) setRedeemDiscountValue(Number(data.redeemDiscountValue));
        if (data.ownGlassDiscount != null) setOwnGlassDiscount(Number(data.ownGlassDiscount));
        if (data.geminiApiKey) setGeminiApiKey(String(data.geminiApiKey));
        if (data.startingCash != null) setStartingCash(Number(data.startingCash));
      }
    }, handleSnapshotError);

    return () => { unsubCats(); unsubMenu(); unsubStock(); unsubOrders(); unsubExp(); unsubMem(); unsubBeans(); unsubQuickExp(); unsubQueue(); unsubSettings(); };
  }, [userId, appId]);

  return { isSyncing, orders, menu, stock, expenses, members, dynamicCategories, beanModifiers, quickExpenses, queueCounter, pinEnabled, vatEnabled, adminPin, redeemPointsThreshold, redeemDiscountValue, ownGlassDiscount, geminiApiKey, startingCash };
}
