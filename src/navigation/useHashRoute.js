import { createContext, createElement, useCallback, useContext, useEffect, useState } from 'react';
import { parseHash, buildHash } from './routes';

const readRoute = () => {
  const { view, params } = parseHash(typeof window === 'undefined' ? '' : window.location.hash);
  return { view, params };
};

/**
 * Hash router (UX v2 spec §5.3). The URL hash is the source of truth:
 * refresh keeps the view, the back button / iPad back swipe works, and any
 * screen can deep-link (`navigate('stock_audit', { tab: 'links' })`).
 *
 * Returns { view, params, navigate(key, params?, { replace }) }.
 * Lives in src/navigation (not src/hooks, which the perf track owns).
 */
export default function useHashRoute() {
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    // Normalise an empty/unknown hash once so the address bar shows where we are.
    const parsed = parseHash(window.location.hash);
    if (parsed.unknown) {
      window.history.replaceState(window.history.state, '', buildHash(parsed.view, parsed.params));
    }
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((view, params = {}, { replace = false } = {}) => {
    const next = buildHash(view, params);
    if (next === window.location.hash) {
      setRoute(readRoute());
      return;
    }
    if (replace) {
      // replaceState does not fire hashchange, so update state ourselves.
      window.history.replaceState(window.history.state, '', next);
      setRoute(readRoute());
    } else {
      window.location.hash = next; // push · hashchange listener updates state
    }
  }, []);

  return { view: route.view, params: route.params, navigate };
}

// ---------------------------------------------------------------------------
// Route context · lets views read the query params without prop drilling.
// ---------------------------------------------------------------------------
const RouteContext = createContext({ view: 'pos', params: {}, navigate: () => {} });

export function RouteProvider({ value, children }) {
  return createElement(RouteContext.Provider, { value }, children);
}

/** `{ date, tab, id, ... }` from the current hash. Use as INITIAL state only. */
export const useRouteParams = () => useContext(RouteContext).params;

/** `navigate(key, params?, { replace })` · same as UI context `navigate`. */
export const useNavigate = () => useContext(RouteContext).navigate;

/** `{ view, params, navigate }` */
export const useRoute = () => useContext(RouteContext);
