import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  QR_LOAD_BEACON,
  QR_LOAD_TIMEOUT_MS,
  QrLoadTimeoutError,
  bundleFromCache,
  chooseQrMenuSource,
  classifyQrLoadTimeout,
  hasUsableMenuCache,
  isMenuReadyFromSources,
  isQrLoadTimeoutError,
  readWithRetry,
  retryLoadState,
  shouldShowQrLoadError,
  shouldShowQrSpinner,
  withTimeout,
} from './qrMenuLoad';

const cached = { bundle: { menu: [{ id: 'latte' }], categories: [], beanModifiers: [], settings: {} }, fresh: false };

afterEach(() => {
  vi.useRealTimers();
});

describe('cache vs network', () => {
  it('paints any cached bundle even when the TTL has expired', () => {
    expect(bundleFromCache(cached)).toEqual(cached.bundle);
    expect(hasUsableMenuCache(cached)).toBe(true);
    expect(hasUsableMenuCache(null)).toBe(false);
    expect(hasUsableMenuCache({ bundle: null })).toBe(false);
    expect(bundleFromCache(undefined)).toBeNull();
  });

  it('prefers a live network bundle, then cache, then nothing', () => {
    const network = { menu: [{ id: 'new' }] };
    expect(chooseQrMenuSource({ cached, networkBundle: network })).toEqual({ source: 'network', bundle: network });
    expect(chooseQrMenuSource({ cached, networkBundle: null })).toEqual({ source: 'cache', bundle: cached.bundle });
    expect(chooseQrMenuSource({})).toEqual({ source: 'none', bundle: null });
  });

  it('marks the menu ready from bundle, cache, or the per-collection fallback', () => {
    expect(isMenuReadyFromSources({ bundle: cached.bundle })).toBe(true);
    expect(isMenuReadyFromSources({ cached })).toBe(true);
    expect(isMenuReadyFromSources({ sourceMenuReady: true })).toBe(true);
    expect(isMenuReadyFromSources({})).toBe(false);
  });
});

describe('spinner vs retry screen', () => {
  it('unblocks as soon as a cached menu has painted — even before auth', () => {
    expect(shouldShowQrSpinner({ loading: true, authed: false, hasPainted: true })).toBe(false);
    expect(shouldShowQrSpinner({ loading: false, authed: false, menuReady: true })).toBe(false);
  });

  it('keeps the spinner only while loading or waiting for auth with nothing on screen', () => {
    expect(shouldShowQrSpinner({ loading: true, authed: true })).toBe(true);
    expect(shouldShowQrSpinner({ loading: false, authed: false })).toBe(true);
    expect(shouldShowQrSpinner({ loading: false, authed: true })).toBe(false);
  });

  it('drops the spinner on timeout so the retry screen can show', () => {
    expect(shouldShowQrSpinner({ loading: true, authed: false, loadError: 'error_auth' })).toBe(false);
    expect(shouldShowQrLoadError({ loadError: 'error_auth' })).toBe(true);
    expect(shouldShowQrLoadError({ loadError: 'error_menu', hasPainted: true })).toBe(false);
    expect(shouldShowQrLoadError({ loadError: 'error_menu', menuReady: true })).toBe(false);
    expect(shouldShowQrLoadError({})).toBe(false);
  });
});

describe('timeout classification', () => {
  it('uses an 8 second budget', () => {
    expect(QR_LOAD_TIMEOUT_MS).toBe(8000);
  });

  it('reports auth timeout when still unsigned-in with no cache', () => {
    expect(classifyQrLoadTimeout({ authed: false })).toBe(QR_LOAD_BEACON.errorAuth);
  });

  it('reports menu timeout once auth succeeded but the getDoc never returned', () => {
    expect(classifyQrLoadTimeout({ authed: true })).toBe(QR_LOAD_BEACON.errorMenu);
  });

  it('stays silent when the customer already has a menu (cache or ready)', () => {
    expect(classifyQrLoadTimeout({ authed: false, hasCache: true })).toBeNull();
    expect(classifyQrLoadTimeout({ authed: true, menuReady: true })).toBeNull();
  });
});

describe('withTimeout', () => {
  it('resolves when the work finishes inside the budget', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50, 'error_menu')).resolves.toBe('ok');
  });

  it('rejects with QrLoadTimeoutError when the work never settles', async () => {
    vi.useFakeTimers();
    const hung = new Promise(() => {});
    const pending = withTimeout(hung, QR_LOAD_TIMEOUT_MS, QR_LOAD_BEACON.errorMenu);
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'QrLoadTimeoutError',
      kind: 'error_menu',
    });
    await vi.advanceTimersByTimeAsync(QR_LOAD_TIMEOUT_MS);
    await assertion;
    expect(isQrLoadTimeoutError(new QrLoadTimeoutError('error_auth'))).toBe(true);
    expect(isQrLoadTimeoutError(new Error('nope'))).toBe(false);
  });

  it('waits the full 8 seconds and clears the deadline after timing out', async () => {
    vi.useFakeTimers();
    let rejected = false;
    const pending = withTimeout(new Promise(() => {})).catch(() => { rejected = true; });
    await vi.advanceTimersByTimeAsync(7999);
    expect(rejected).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(rejected).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores a late result after the deadline', async () => {
    vi.useFakeTimers();
    let resolve;
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const pending = withTimeout(new Promise((done) => { resolve = done; }))
      .then(onSuccess, onError);
    await vi.advanceTimersByTimeAsync(8000);
    resolve('late menu');
    await pending;
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('preserves a fast network error and removes its timer', async () => {
    vi.useFakeTimers();
    const error = new Error('unavailable');
    await expect(withTimeout(Promise.reject(error))).rejects.toBe(error);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects immediately for a non-positive budget', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 0)).rejects.toBeInstanceOf(QrLoadTimeoutError);
  });
});

describe('retryLoadState', () => {
  it('clears the error and puts the spinner back up', () => {
    expect(retryLoadState()).toEqual({
      loadError: null,
      loading: true,
      menuReady: false,
      hasPainted: false,
    });
  });
});

describe('CustomerOrderApp wiring', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../customer/CustomerOrderApp.jsx'), 'utf8');

  it('paints cache before auth and no longer gates the page on !authed', () => {
    expect(src).toContain('readCachedPublicMenu');
    expect(src).toContain('bundleFromCache');
    expect(src).toContain('shouldShowQrSpinner');
    expect(src).toContain('shouldShowQrLoadError');
    expect(src).not.toMatch(/if \(loading \|\| !authed\)/);
  });

  it('times out auth and menu, fires beacons, and shows a Thai retry', () => {
    expect(src).toContain('QR_LOAD_TIMEOUT_MS');
    expect(src).toContain('withTimeout');
    expect(src).toContain("sendQrBeacon('menu_ok')");
    expect(src).toContain("sendQrBeacon('error_auth')");
    expect(src).toContain("sendQrBeacon('error_menu')");
    expect(src).toContain("sendQrBeacon('retry')");
    expect(src).toContain('โหลดเมนูช้าผิดปกติ');
    expect(src).toContain('ลองใหม่');
    expect(src).toMatch(/ค่ะ/);
  });
});

describe('readWithRetry', () => {
  it('returns on the first success without retrying', async () => {
    let calls = 0;
    const r = await readWithRetry(async () => { calls += 1; return 'ok'; }, { sleep: async () => {} });
    expect(r).toBe('ok'); expect(calls).toBe(1);
  });
  it('retries a fast permission-denied race then succeeds', async () => {
    let calls = 0;
    const r = await readWithRetry(async () => { calls += 1; if (calls < 3) throw new Error('permission-denied'); return 'menu'; }, { sleep: async () => {} });
    expect(r).toBe('menu'); expect(calls).toBe(3);
  });
  it('gives up after all attempts and throws the last error', async () => {
    let calls = 0;
    await expect(readWithRetry(async () => { calls += 1; throw new Error('denied'); }, { attempts: 3, sleep: async () => {} })).rejects.toThrow('denied');
    expect(calls).toBe(3);
  });
  it('does not retry our own timeout — fails fast', async () => {
    let calls = 0;
    await expect(readWithRetry(async () => { calls += 1; throw new QrLoadTimeoutError('error_menu'); }, { sleep: async () => {} })).rejects.toBeInstanceOf(QrLoadTimeoutError);
    expect(calls).toBe(1);
  });
});
