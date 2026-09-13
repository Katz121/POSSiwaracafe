/**
 * qrMenuLoad — cache / timeout / spinner decisions for the customer QR page.
 *
 * The page used to wait for anonymous auth before even reading the menu, and a
 * hung signInAnonymously / getDoc left the full-screen spinner up forever.
 * These helpers keep the new first-paint + 8s timeout rules testable without
 * mounting Firebase.
 */

export const QR_LOAD_TIMEOUT_MS = 8000;

export const QR_LOAD_BEACON = {
  menuOk: 'menu_ok',
  errorAuth: 'error_auth',
  errorMenu: 'error_menu',
  retry: 'retry',
};

export class QrLoadTimeoutError extends Error {
  constructor(kind = QR_LOAD_BEACON.errorMenu) {
    super(kind);
    this.name = 'QrLoadTimeoutError';
    this.kind = kind;
  }
}

export function isQrLoadTimeoutError(err) {
  return err instanceof QrLoadTimeoutError || err?.name === 'QrLoadTimeoutError';
}

/** Cache is usable for first paint even when stale — network will revalidate. */
export function bundleFromCache(cached) {
  return cached?.bundle || null;
}

export function hasUsableMenuCache(cached) {
  return Boolean(cached?.bundle);
}

/**
 * First-paint source: a live network bundle wins; otherwise the device cache.
 */
export function chooseQrMenuSource({ cached, networkBundle } = {}) {
  if (networkBundle) return { source: 'network', bundle: networkBundle };
  if (cached?.bundle) return { source: 'cache', bundle: cached.bundle };
  return { source: 'none', bundle: null };
}

export function isMenuReadyFromSources({ bundle, cached, sourceMenuReady } = {}) {
  return Boolean(bundle || cached || sourceMenuReady);
}

/**
 * Full-page spinner only while we have nothing to show and have not timed out.
 * A cached (or already painted) menu unblocks immediately — do not wait for auth.
 */
export function shouldShowQrSpinner({
  loading,
  authed,
  menuReady,
  loadError,
  hasPainted,
} = {}) {
  if (hasPainted || menuReady) return false;
  if (loadError) return false;
  return Boolean(loading || !authed);
}

/** Timed-out load with nothing on screen → retry UI, not an infinite spinner. */
export function shouldShowQrLoadError({ loadError, menuReady, hasPainted } = {}) {
  return Boolean(loadError) && !menuReady && !hasPainted;
}

/**
 * Classify an 8s hang for the beacon + error state.
 * Auth timeout wins when we never got a user (menu fetch never started).
 * A painted cache means the customer already has a menu — no error screen.
 */
export function classifyQrLoadTimeout({ authed, menuReady, hasCache } = {}) {
  if (menuReady || hasCache) return null;
  if (!authed) return QR_LOAD_BEACON.errorAuth;
  return QR_LOAD_BEACON.errorMenu;
}

export function retryLoadState() {
  return { loadError: null, loading: true, menuReady: false, hasPainted: false };
}

/**
 * Race a promise against a timeout. Does not cancel the underlying work —
 * the caller should ignore stale results (e.g. via a load sequence number).
 */
export function withTimeout(promise, ms = QR_LOAD_TIMEOUT_MS, kind = QR_LOAD_BEACON.errorMenu) {
  const budget = Number(ms);
  if (!Number.isFinite(budget) || budget <= 0) {
    return Promise.reject(new QrLoadTimeoutError(kind));
  }
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new QrLoadTimeoutError(kind)), budget);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

// The customer page reads config/publicMenu, which firestore.rules gate behind
// signedIn(). On a cold load the anonymous auth token sometimes hasn't attached
// to the Firestore client yet when the first read fires, so it fails fast with
// "permission-denied" (~1 in 3 loads). That transient almost always succeeds on
// an immediate retry, so retry a few times with a short backoff before giving up
// — the customer should never see an error screen for a race the retry fixes.
export const QR_LOAD_READ_ATTEMPTS = 3;
export const QR_LOAD_RETRY_DELAY_MS = 500;

export async function readWithRetry(makePromise, {
  attempts = QR_LOAD_READ_ATTEMPTS,
  delayMs = QR_LOAD_RETRY_DELAY_MS,
  isTimeout = isQrLoadTimeoutError,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await makePromise();
    } catch (err) {
      lastErr = err;
      if (isTimeout(err)) throw err; // our own deadline — stop, don't burn more time
      if (i < attempts - 1) await sleep(delayMs);
    }
  }
  throw lastErr;
}
