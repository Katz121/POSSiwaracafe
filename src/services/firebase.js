import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Validate required config
['apiKey', 'projectId'].forEach(key => {
  if (!firebaseConfig[key]) {
    console.error(`Missing Firebase config: VITE_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`);
  }
});

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const functions = getFunctions(app, 'asia-southeast1');

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
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const appId = 'siwara-pos-v1';
