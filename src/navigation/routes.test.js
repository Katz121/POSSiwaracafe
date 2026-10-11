import { describe, it, expect } from 'vitest';
import { parseHash, buildHash, gateRoute } from './routes';
import { NAV_ITEMS, PROTECTED_VIEWS } from './navConfig';

describe('hash routes', () => {
  it('defaults to pos for empty or unknown hashes', () => {
    expect(parseHash('')).toMatchObject({ view: 'pos', unknown: true });
    expect(parseHash('#/nope')).toMatchObject({ view: 'pos', unknown: true });
  });

  it('parses spec hashes with params', () => {
    expect(parseHash('#/stock-audit?date=2026-09-24&tab=links')).toEqual({
      view: 'stock_audit', params: { date: '2026-09-24', tab: 'links' },
    });
    expect(parseHash('#/kitchen')).toEqual({ view: 'merchant', params: {} });
    expect(parseHash('#/reports/profit')).toEqual({ view: 'profitability', params: {} });
    expect(parseHash('#/expenses?intake=abc')).toEqual({ view: 'expenses', params: { intake: 'abc' } });
  });

  it('maps settings sub-routes to the admin tab param', () => {
    expect(parseHash('#/settings/security')).toEqual({ view: 'admin', params: { tab: 'security' } });
    expect(buildHash('admin', { tab: 'security' })).toBe('#/settings/security');
  });

  it('accepts raw view keys for old links', () => {
    expect(parseHash('#/stock_audit').view).toBe('stock_audit');
    expect(parseHash('#/admin').view).toBe('admin');
  });

  it('round-trips every nav item', () => {
    for (const item of NAV_ITEMS) {
      expect(parseHash(buildHash(item.key)).view).toBe(item.key);
      expect(parseHash(buildHash(item.key, { date: '2026-09-24' }))).toMatchObject({
        view: item.key, params: { date: '2026-09-24' },
      });
    }
  });

  it('drops empty params', () => {
    expect(buildHash('bills', { date: '', id: null, filter: 'unpaid' })).toBe('#/bills?filter=unpaid');
  });

  it('keeps the PIN-protected set unchanged', () => {
    expect(PROTECTED_VIEWS.sort()).toEqual(['admin', 'menu_manage']);
  });

  it('includes every existing view key', () => {
    const keys = NAV_ITEMS.map((i) => i.key).sort();
    expect(keys).toEqual([
      'admin', 'bills', 'cake_queue', 'category_summary', 'dashboard', 'expenses', 'financial',
      'members_manage', 'menu_manage', 'merchant', 'pos', 'production', 'profitability', 'recipes',
      'sales_history', 'stock', 'stock_audit', 'stock_units',
    ]);
  });
});

describe('gateRoute (PIN gate)', () => {
  it('holds protected views until settings are known', () => {
    expect(gateRoute({ view: 'admin', needsLock: false, settingsReady: false })).toEqual({ blocked: false, held: true });
    expect(gateRoute({ view: 'menu_manage', needsLock: false, settingsReady: false })).toEqual({ blocked: false, held: true });
  });
  it('never holds or blocks open views', () => {
    expect(gateRoute({ view: 'pos', needsLock: true, settingsReady: false })).toEqual({ blocked: false, held: false });
    expect(gateRoute({ view: 'stock', needsLock: true, settingsReady: true })).toEqual({ blocked: false, held: false });
  });
  it('blocks a protected view when the lock is on, unless the PIN was granted for it', () => {
    expect(gateRoute({ view: 'admin', needsLock: true, settingsReady: true })).toEqual({ blocked: true, held: false });
    expect(gateRoute({ view: 'admin', needsLock: true, settingsReady: true, grantedView: 'admin' })).toEqual({ blocked: false, held: false });
    expect(gateRoute({ view: 'admin', needsLock: true, settingsReady: true, grantedView: 'menu_manage' })).toEqual({ blocked: true, held: false });
  });
  it('lets protected views through once settings say the lock is off', () => {
    expect(gateRoute({ view: 'admin', needsLock: false, settingsReady: true })).toEqual({ blocked: false, held: false });
  });
});

describe('production route', () => {
  it('parses #/production with make/date params and round-trips', () => {
    expect(parseHash('#/production?make=abc')).toEqual({ view: 'production', params: { make: 'abc' } });
    expect(buildHash('production', { date: '2026-09-24' })).toBe('#/production?date=2026-09-24');
  });
});
