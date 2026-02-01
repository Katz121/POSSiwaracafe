import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';

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
  const [adminPin, setAdminPin] = useState('1234');
  const [redeemPointsThreshold, setRedeemPointsThreshold] = useState(100);
  const [redeemDiscountValue, setRedeemDiscountValue] = useState(50);
  const [ownGlassDiscount, setOwnGlassDiscount] = useState(5);
  const [geminiApiKey, setGeminiApiKey] = useState(import.meta.env.VITE_GEMINI_API_KEY || '');

  useEffect(() => {
    if (!user) return;
    setIsSyncing(true);

    const unsubCats = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'categories'), (s) => setDynamicCategories(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubMenu = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'menu'), (s) => setMenu(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubStock = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'stock'), (s) => setStock(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubOrders = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), (s) => { setOrders(s.docs.map(d => ({ id: d.id, ...d.data() }))); setIsSyncing(false); });
    const unsubExp = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'expenses'), (s) => setExpenses(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubMem = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'members'), (s) => setMembers(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubBeans = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'beanModifiers'), (s) => setBeanModifiers(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubQueue = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'queue'), (d) => { if (d.exists()) setQueueCounter(d.data().current || 1); else setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'queue'), { current: 1 }); });

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
      }
    });

    return () => { unsubCats(); unsubMenu(); unsubStock(); unsubOrders(); unsubExp(); unsubMem(); unsubBeans(); unsubQueue(); unsubSettings(); };
  }, [user, appId]);

  return { isSyncing, orders, menu, stock, expenses, members, dynamicCategories, beanModifiers, queueCounter, pinEnabled, vatEnabled, adminPin, redeemPointsThreshold, redeemDiscountValue, ownGlassDiscount, geminiApiKey };
}
