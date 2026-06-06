/**
 * publicMenu — single-document menu snapshot for the customer QR ordering page.
 *
 * Why: the customer page used to open realtime `onSnapshot` listeners on the
 * `menu`, `categories`, `beanModifiers` collections + the `settings` doc. Every
 * customer that scanned the QR therefore read the whole menu (N document reads)
 * and kept listening for live changes — burning Firestore reads fast.
 *
 * Instead the POS (admin) side publishes everything the customer needs into ONE
 * document (`config/publicMenu`). Customers read that single doc once = 1 read.
 *
 * Bonus: this strips admin-only secrets (adminPin, geminiApiKey) that the old
 * full-settings read was leaking to every customer device.
 */
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// Fields in config/settings that must NEVER be exposed to customers.
export const SENSITIVE_SETTINGS_KEYS = ['adminPin', 'geminiApiKey'];

export function publicMenuDocRef(db, appId) {
  return doc(db, 'artifacts', appId, 'public', 'data', 'config', 'publicMenu');
}

function stripSensitive(settings = {}) {
  const clean = { ...settings };
  for (const key of SENSITIVE_SETTINGS_KEYS) delete clean[key];
  return clean;
}

/**
 * Build the serializable bundle (without updatedAt) — used both to write the
 * doc and to diff against the previously-written bundle so we skip no-op writes.
 */
export function buildPublicMenuBundle({ menu = [], categories = [], beanModifiers = [], settings = {} }) {
  return {
    menu,
    categories,
    beanModifiers,
    settings: stripSensitive(settings),
  };
}

/**
 * Admin side: publish the bundle if it changed.
 * @param prevSerialized JSON string of the last bundle this device wrote.
 * @returns the new serialized bundle if written, or null if skipped (unchanged).
 */
export async function publishPublicMenu(db, appId, input, prevSerialized) {
  const bundle = buildPublicMenuBundle(input);
  const serialized = JSON.stringify(bundle);
  if (serialized === prevSerialized) return null; // unchanged → no write
  await setDoc(publicMenuDocRef(db, appId), { ...bundle, updatedAt: serverTimestamp() });
  return serialized;
}

/**
 * Customer side: read the bundle once.
 * @returns the bundle data ({ menu, categories, beanModifiers, settings, updatedAt })
 *          or null if it has not been published yet (caller should fall back).
 */
export async function fetchPublicMenu(db, appId) {
  const snap = await getDoc(publicMenuDocRef(db, appId));
  if (!snap.exists()) return null;
  return snap.data();
}
