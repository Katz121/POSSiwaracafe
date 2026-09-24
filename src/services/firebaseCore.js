// Firebase app + Auth + Functions only — NO Firestore.
//
// WHY a separate module: the full Firestore SDK is ~880 KB of JS (~95 KB gzip).
// The customer QR page (/order) and member card (/member) read the menu through
// `firebase/firestore/lite` and only need the full SDK for occasional writes
// (funnel counters, checkout fallback), so they import from here and load
// `./firebase` (full Firestore) lazily. Staff code keeps importing `./firebase`,
// which re-exports everything below, so nothing else changes.
import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence, connectAuthEmulator } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

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

export const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence] });
export const functions = getFunctions(app, 'asia-southeast1');
export const appId = 'siwara-pos-v1';

// โหมดทดสอบในเครื่อง (`npm run dev:emu`) · Auth/Functions ต่อ emulator ตรงนี้
// (Firestore ต่อ emulator ใน ./firebase.js และ ./firebaseLite.js)
export const IS_EMULATOR = import.meta.env.VITE_USE_EMULATOR === '1';
if (IS_EMULATOR) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFunctionsEmulator(functions, '127.0.0.1', 5999);
}
