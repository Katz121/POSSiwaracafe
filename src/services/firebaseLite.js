import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore/lite';
import { auth } from './firebase';
import { ensureSignedIn } from './memberLookup';

// Reuse the initialized app and its Auth provider; keep the full SDK for writes.
export const liteDb = getFirestore(auth.app);

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
