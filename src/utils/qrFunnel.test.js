import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  doc: (...path) => ({ path: path.slice(1).join('/') }),
  increment: (n) => ({ inc: n }),
  setDoc: vi.fn(async () => {}),
}));

import { setDoc } from 'firebase/firestore';
import { funnelDay, trackFunnelStep, summarizeFunnel } from './qrFunnel';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};

describe('funnelDay', () => {
  it('uses the Bangkok calendar day', () => {
    expect(funnelDay(new Date('2026-09-11T18:30:00Z'))).toBe('2026-09-12'); // 01:30 in Bangkok
  });
});

describe('trackFunnelStep', () => {
  it('writes +1 once per session per step', async () => {
    setDoc.mockClear();
    const storage = memoryStorage();
    const now = new Date('2026-09-11T05:00:00Z');
    expect(await trackFunnelStep({}, 'app', 'view', { storage, now })).toBe(true);
    expect(await trackFunnelStep({}, 'app', 'view', { storage, now })).toBe(false);
    expect(setDoc).toHaveBeenCalledTimes(1);
    const [ref, data, opts] = setDoc.mock.calls[0];
    expect(ref.path).toBe('artifacts/app/public/data/qrFunnel/2026-09-11');
    expect(data).toEqual({ view: { inc: 1 } });
    expect(opts).toEqual({ merge: true });
  });

  it('ignores unknown steps', async () => {
    setDoc.mockClear();
    expect(await trackFunnelStep({}, 'app', 'hack', { storage: memoryStorage() })).toBe(false);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('never throws when the write fails', async () => {
    setDoc.mockRejectedValueOnce(new Error('permission-denied'));
    await expect(trackFunnelStep({}, 'app', 'cart', { storage: memoryStorage() })).resolves.toBe(true);
  });
});

describe('summarizeFunnel', () => {
  it('sums days and computes conversion', () => {
    const rows = summarizeFunnel([
      { id: 'a', view: 60, add: 30, cart: 24, checkout: 20, order: 15 },
      { id: 'b', view: 40, add: 20, cart: 16, checkout: 10, order: 10 },
    ]);
    expect(rows.map((r) => r.count)).toEqual([100, 50, 40, 30, 25]);
    expect(rows[1].fromPrev).toBe(50);
    expect(rows[4].fromStart).toBe(25);
    expect(rows[0].fromPrev).toBeNull();
  });
});
