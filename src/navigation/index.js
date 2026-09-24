// Navigation contract for view packages (UX v2 spec §5).
//   import { useRouteParams, useNavigate } from '../../navigation';
//   const { tab, date } = useRouteParams();      // initial state only
//   const navigate = useNavigate();             // PIN-aware
//   navigate('stock_audit', { tab: 'links' });  // → #/stock-audit?tab=links
//   navigate('bills', { date }, { replace: true }); // sync a filter without a history entry
export { default as useHashRoute, RouteProvider, useRouteParams, useNavigate, useRoute } from './useHashRoute';
export { parseHash, buildHash, gateRoute } from './routes';
export {
  NAV_ITEMS, NAV_SECTIONS, NAV_BY_KEY, PROTECTED_VIEWS, AUTO_COLLAPSE_VIEWS, DEFAULT_VIEW,
  isProtectedView, navSections,
} from './navConfig';
export { default as AppSidebar } from './AppSidebar';
export { default as MobileTabBar } from './MobileTabBar';
export { default as NavMenuSheet } from './NavMenuSheet';
