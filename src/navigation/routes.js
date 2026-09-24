import { NAV_ITEMS, NAV_BY_KEY, DEFAULT_VIEW } from './navConfig';

// Pure hash <-> route helpers (no window access) so they are unit-testable.

const HASH_TO_KEY = new Map(NAV_ITEMS.map((item) => [item.hash, item.key]));

// Internal, non-nav routes (dev UI gallery).
export const DEV_ROUTES = { '__ui': '__ui' };

/**
 * "#/stock-audit?date=2026-09-24&tab=links" → { view: 'stock_audit', params: { date, tab } }
 * "#/settings/security"                      → { view: 'admin', params: { tab: 'security' } }
 * Unknown / empty                            → { view: 'pos', params: {}, unknown: true }
 * Raw view keys are accepted too ("#/stock_audit") so old links keep working.
 */
export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#/, '').replace(/^\/+/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = decodeURIComponent(pathPart || '').replace(/\/+$/, '');
  const params = Object.fromEntries(new URLSearchParams(queryPart));

  if (!path) return { view: DEFAULT_VIEW, params, unknown: true };
  if (DEV_ROUTES[path]) return { view: DEV_ROUTES[path], params };

  if (HASH_TO_KEY.has(path)) return { view: HASH_TO_KEY.get(path), params };
  if (NAV_BY_KEY[path]) return { view: path, params };

  // One extra segment → the item's subParam (e.g. settings/<tab>).
  const cut = path.lastIndexOf('/');
  if (cut > 0) {
    const base = path.slice(0, cut);
    const rest = path.slice(cut + 1);
    const key = HASH_TO_KEY.get(base) || (NAV_BY_KEY[base] ? base : null);
    const item = key && NAV_BY_KEY[key];
    if (item?.subParam && rest) return { view: key, params: { ...params, [item.subParam]: rest } };
  }

  return { view: DEFAULT_VIEW, params, unknown: true };
}

/** Inverse of parseHash. Empty / nullish params are dropped. */
export function buildHash(view, params = {}) {
  const item = NAV_BY_KEY[view];
  let path = item ? item.hash : (DEV_ROUTES[view] ? view : NAV_BY_KEY[DEFAULT_VIEW].hash);
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    if (item?.subParam === k) {
      path = `${path}/${encodeURIComponent(v)}`;
      return;
    }
    query.set(k, String(v));
  });
  const qs = query.toString();
  return `#/${path}${qs ? `?${qs}` : ''}`;
}
