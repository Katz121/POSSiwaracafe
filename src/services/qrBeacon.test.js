import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uaClass, sendQrBeacon } from './qrBeacon';

describe('qrBeacon', () => {
  beforeEach(() => {
    let store = {};
    const sessionStorageMock = {
      getItem: vi.fn(key => store[key] || null),
      setItem: vi.fn((key, value) => { store[key] = value.toString(); }),
      clear: vi.fn(() => { store = {}; })
    };
    vi.stubGlobal('sessionStorage', sessionStorageMock);
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0',
      sendBeacon: vi.fn(),
    });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('uaClass', () => {
    it('detects Line', () => {
      expect(uaClass('Mozilla/5.0 Line/11.0')).toBe('line');
    });
    it('detects Facebook', () => {
      expect(uaClass('Mozilla/5.0 FBAN/1')).toBe('facebook');
      expect(uaClass('Mozilla/5.0 FBAV/1')).toBe('facebook');
      expect(uaClass('Mozilla/5.0 FB_IAB/1')).toBe('facebook');
    });
    it('detects Instagram', () => {
      expect(uaClass('Mozilla/5.0 Instagram 1.0')).toBe('instagram');
    });
    it('returns other for unknown', () => {
      expect(uaClass('Mozilla/5.0 Chrome')).toBe('other');
    });
  });

  describe('sendQrBeacon', () => {
    it('sends beacon and uses sessionStorage to prevent duplicates', () => {
      sendQrBeacon('open');
      expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
      
      const payload = JSON.parse(navigator.sendBeacon.mock.calls[0][1]);
      expect(payload).toEqual({ event: 'open', ua: 'other' });

      sendQrBeacon('open');
      expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
    });

    it('allows retry event multiple times', () => {
      sendQrBeacon('retry');
      sendQrBeacon('retry');
      expect(navigator.sendBeacon).toHaveBeenCalledTimes(2);
    });

    it('falls back to fetch if sendBeacon is not available', () => {
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0' }); // no sendBeacon
      sendQrBeacon('open');
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith('https://pos-gemini-proxy.siwatid-99.workers.dev/qr-beacon', expect.objectContaining({
        method: 'POST',
        keepalive: true,
        mode: 'no-cors'
      }));
    });
  });
});
