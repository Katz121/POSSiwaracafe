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
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

// Fields in config/settings that must NEVER be exposed to customers.
// (The customer page only needs display + promo config — never the admin PIN,
//  API key, or the cash float.)
export const SENSITIVE_SETTINGS_KEYS = ['adminPin', 'geminiApiKey', 'startingCash'];

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

// Stay under Firestore's 1 MiB per-document hard limit (with headroom for field
// names + overhead). Menu images are stored inline as base64, so a big menu can
// realistically approach this.
export const PUBLIC_MENU_SAFE_BYTES = 1_000_000;

/**
 * Admin side: publish the bundle if it changed.
 * @param prevSerialized JSON string of the last bundle this device processed.
 * @returns the serialized bundle to remember as last-processed (whether it was
 *          written OR skipped for being oversize — so we don't re-warn every
 *          snapshot), or null if the content was unchanged.
 */
export async function publishPublicMenu(db, appId, input, prevSerialized) {
  const bundle = buildPublicMenuBundle(input);
  const serialized = JSON.stringify(bundle);
  if (serialized === prevSerialized) return null; // unchanged → no write

  if (serialized.length > PUBLIC_MENU_SAFE_BYTES) {
    // Almost certainly base64 menu images pushing the doc over 1 MiB. Writing
    // would throw, so skip and make the cause obvious. Customers keep working
    // via the per-collection fallback. Fix: shrink menu images or move them to
    // Firebase Storage / a CDN and store URLs instead of base64.
    console.warn(
      `[publicMenu] bundle is ${(serialized.length / 1024).toFixed(0)} KB — exceeds the ` +
      `single-document budget; skipping publish (customers fall back to per-collection reads).`,
    );
    // Remove any previously-published (now-stale) bundle, otherwise customers
    // would keep reading the old smaller doc forever and never see updates —
    // deleting it forces them onto the live per-collection fallback instead.
    try { await deleteDoc(publicMenuDocRef(db, appId)); } catch { /* already gone / no perms */ }
    return serialized; // remember it so we don't warn + delete again until the menu changes
  }

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

// ---------------------------------------------------------------------------
// localStorage cache (per device) — lets a returning customer paint the menu
// instantly with ZERO Firestore reads, and skip the network entirely while the
// cache is still fresh. A coffee-shop menu barely changes intra-day, so a few
// minutes of staleness is a fine trade for cutting reads on refreshes/re-scans.
// ---------------------------------------------------------------------------
export const PUBLIC_MENU_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cacheKey = (appId) => `publicMenu:${appId}`;

/**
 * @returns { bundle, fresh } where `fresh` means the cache is within TTL and the
 *          caller may skip the network read, or null if there is no usable cache.
 */
export function readCachedPublicMenu(appId) {
  try {
    const raw = localStorage.getItem(cacheKey(appId));
    if (!raw) return null;
    const { bundle, cachedAt } = JSON.parse(raw);
    if (!bundle) return null;
    const age = Date.now() - (cachedAt || 0);
    return { bundle, fresh: age >= 0 && age < PUBLIC_MENU_CACHE_TTL_MS };
  } catch {
    return null; // corrupt entry / disabled storage → behave as no cache
  }
}

export function writeCachedPublicMenu(appId, bundle) {
  try {
    localStorage.setItem(cacheKey(appId), JSON.stringify({ bundle, cachedAt: Date.now() }));
  } catch {
    // quota exceeded / private mode — caching is best-effort, ignore.
  }
}
