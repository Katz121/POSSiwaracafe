import { describe, expect, it, vi } from 'vitest';

// In-memory Firestore: transactions run one at a time (like Firestore's
// optimistic retries end up doing) and always read the latest document.
const store = new Map();
let queue = Promise.resolve();
vi.mock('firebase/firestore', () => ({
  increment: (n) => ({ __inc: n }),
  arrayUnion: (...items) => ({ __union: items }),
  runTransaction: (_db, fn) => {
    const run = queue.then(() => fn({
      get: async (ref) => ({ exists: () => store.has(ref.path), data: () => structuredClone(store.get(ref.path)) }),
      update: (ref, payload) => {
        const cur = store.get(ref.path);
        for (const [k, v] of Object.entries(payload)) {
          if (v && v.__inc !== undefined) cur[k] = Number(cur[k] || 0) + v.__inc;
          else if (v && v.__union) cur[k] = [...(cur[k] || []), ...v.__union];
          else cur[k] = v;
        }
      },
    }));
    queue = run.catch(() => {});
    return run;
  },
}));

import { settlePendingPoints, withInFlightGuard } from './pointsActions';

const ref = { path: 'members/0839536697' };
const seed = (data) => store.set(ref.path, { points: 45, pendingPoints: 40, pendingReason: 'order', pointsHistory: [], ...data });

describe('settlePendingPoints', () => {
  it('approves a pending batch only once even when tapped 6 times', async () => {
    seed();
    const results = await Promise.all(Array.from({ length: 6 }, () => settlePendingPoints({}, ref, true)));
    const m = store.get(ref.path);
    expect(results.filter(Boolean)).toEqual([40]);
    expect(m.points).toBe(85);
    expect(m.pendingPoints).toBe(0);
    expect(m.pointsHistory).toHaveLength(1);
    expect(m.pointsHistory[0]).toMatchObject({ delta: 40, reason: 'order' });
  });

  it('records a rejection with the real pending amount and leaves points alone', async () => {
    seed({ pendingPoints: 13 });
    expect(await settlePendingPoints({}, ref, false)).toBe(13);
    expect(await settlePendingPoints({}, ref, false)).toBe(0);
    const m = store.get(ref.path);
    expect(m.points).toBe(45);
    expect(m.pointsHistory).toEqual([expect.objectContaining({ delta: 0, reason: 'rejected', amount: 13 })]);
  });

  it('does nothing when there is nothing pending', async () => {
    seed({ pendingPoints: 0 });
    expect(await settlePendingPoints({}, ref, true)).toBe(0);
    expect(store.get(ref.path).points).toBe(45);
  });
});

describe('withInFlightGuard', () => {
  it('runs the action once while a call for the same member is in flight', async () => {
    const inFlight = new Set();
    let release;
    const action = vi.fn(() => new Promise((r) => { release = r; }));
    const calls = Array.from({ length: 6 }, () => withInFlightGuard(inFlight, ['a'], action));
    expect(action).toHaveBeenCalledTimes(1);
    release('done');
    expect(await calls[0]).toBe('done');
    expect(inFlight.size).toBe(0);
    expect(await withInFlightGuard(inFlight, ['a'], async () => 'again')).toBe('again');
  });

  it('releases the lock when the action throws', async () => {
    const inFlight = new Set();
    await expect(withInFlightGuard(inFlight, ['a'], async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(inFlight.size).toBe(0);
  });
});
