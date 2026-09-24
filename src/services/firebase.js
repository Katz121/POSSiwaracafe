import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
// App + Auth + Functions live in ./firebaseCore so the customer pages can use
// them without pulling in the full Firestore SDK. Re-exported here unchanged.
import { app, auth, functions, appId, IS_EMULATOR } from './firebaseCore';

export { auth, functions, appId, IS_EMULATOR };

// Firestore with an IndexedDB-backed offline cache. WHY: every `onSnapshot`
// listener in usePosData loads its whole collection (orders ~1k + expenses ~0.5k
// + ... ≈ 1.9k docs) on each cold start. With the default in-memory cache, every
// page reload / reopened tab / PWA cold start re-reads all ~1.9k docs from the
// server (the resume token lives only in memory, so a new JS context = full
// re-query). The persistent cache stores docs AND resume tokens in IndexedDB, so
// a reload re-hydrates locally and the server only sends CHANGED docs — turning a
// ~1,885-read reload into a handful of delta reads. (A tab that stays open across
// sleep/wake already resumes from its in-memory token; this targets new contexts.)
// NOTE: this only collapses the re-read MULTIPLIER — the first cold start on each
// device still costs ~1,885 and grows with the orders/expenses collections, so a
// recent-window query bound is still the eventual fix for the baseline.
// Failure modes (IndexedDB blocked in private mode / in-app webviews like LINE)
// degrade silently to memory cache — they do NOT throw here, so the customer QR
// page can't white-screen. persistentMultipleTabManager keeps the cache
// consistent when the POS is open in more than one tab.
//
// Customer routes (/order, /member) MUST stay out of that shared cache. Multi-tab
// mode funnels every tab's listeners through ONE primary tab's connection, sent
// with that tab's auth token. Staff sign in per tab (session persistence) while
// customers are anonymous, so a customer tab open on the POS machine becomes the
// primary and the staff tab's orders/stock listeners go out as anonymous — which
// firestore.rules now rejects ("ไม่มีสิทธิ์เข้าถึงข้อมูล", new QR orders never
// show up). The customer page reads the menu once, so memory cache costs nothing.
const pathname = (typeof window !== 'undefined' ? window.location.pathname : '/').replace(/\/+$/, '') || '/';
const isCustomerRoute = pathname === '/order' || pathname === '/member';
export const db = initializeFirestore(app, {
  localCache: isCustomerRoute
    ? memoryLocalCache()
    : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// โหมดทดสอบในเครื่อง (`npm run dev:emu`) · ต่อ Firestore/Auth emulator แทนระบบจริง
// ใช้เทสต์ UI, Lighthouse และตัดสต็อกกับสำเนาข้อมูล โดยไม่แตะร้านจริงแม้แต่ record เดียว
// Functions ไม่ได้ emulate · checkout จะตกไปเส้นทางสำรอง (checkoutFallback) เอง
// (Auth/Functions emulator hookup lives in ./firebaseCore, IS_EMULATOR re-exported above)
if (IS_EMULATOR) {
  connectFirestoreEmulator(db, '127.0.0.1', 8181);
}
