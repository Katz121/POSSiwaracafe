import { getFirestore, doc, getDoc, collection, getDocs, connectFirestoreEmulator } from 'firebase/firestore/lite';
import { auth } from './firebaseCore';
import { ensureSignedIn } from './memberLookup';

// Reuse the initialized app and its Auth provider; keep the full SDK for writes.
export const liteDb = getFirestore(auth.app);
if (import.meta.env.VITE_USE_EMULATOR === '1') connectFirestoreEmulator(liteDb, '127.0.0.1', 8181);

export const menuLiteReader = {
  doc,
  async getDoc(ref) {
    await ensureSignedIn();
    return getDoc(ref);
  },
};

export async function fetchMenuCollectionsLite(appId) {
  await ensureSignedIn();
  const base = ['artifacts', appId, 'public', 'data'];
  return Promise.all(['menu', 'categories', 'beanModifiers'].map(
    (name) => getDocs(collection(liteDb, ...base, name)),
  ));
}
