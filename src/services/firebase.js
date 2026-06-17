import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
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

// Firestore with an IndexedDB-backed offline cache. WHY: every `onSnapshot`
// listener in usePosData loads its whole collection (orders ~1k + expenses ~0.5k
// + ... ≈ 1.9k docs) on each cold mount. With the default in-memory cache, every
// page reload / reconnect / sleep-wake re-reads all ~1.9k docs from the server.
// The persistent cache survives reloads, so the listener re-hydrates from local
// IndexedDB and the server only sends CHANGED docs (resume token) — turning a
// ~1,885-read reload into a handful of delta reads. persistentMultipleTabManager
// keeps the cache consistent when the POS is open in more than one tab.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const appId = 'siwara-pos-v1';
