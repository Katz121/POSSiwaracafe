import { describe, expect, it, vi } from 'vitest';

// In-memory Firestore: transactions run one at a time (like Firestore's
// optimistic retries end up doing) and always read the latest document.
const store = new Map();
let queue = Promise.resolve();
vi.mock('firebase/firestore', () => ({
  increment: (n) => ({ __inc: n }),
  arrayUnion: (...items) => ({ __union: items }),
  arrayRemove: (...items) => ({ __remove: items }),
  runTransaction: (_db, fn) => {
    const run = queue.then(() => fn({
      get: async (ref) => ({ exists: () => store.has(ref.path), data: () => structuredClone(store.get(ref.path)) }),
      update: (ref, payload) => {
        const cur = store.get(ref.path);
        for (const [k, v] of Object.entries(payload)) {
          if (v && v.__inc !== undefined) cur[k] = Number(cur[k] || 0) + v.__inc;
          else if (v && v.__union) cur[k] = [...(cur[k] || []), ...v.__union];
          else if (v && v.__remove) cur[k] = (cur[k] || []).filter(x => !v.__remove.includes(x));
          else cur[k] = v;
        }
      },
    }));
    queue = run.catch(() => {});
    return run;
  },
}));

import { settlePendingPoints, withInFlightGuard, planEarnClawback, planBillEditPoints } from './pointsActions';

const ref = { path: 'members/0839536697' };
const seed = (data) => store.set(ref.path, { points: 45, pendingPoints: 40, pendingReason: 'order', pendingOrderIds: ['order1', 'order2'], pointsHistory: [], ...data });

describe('settlePendingPoints', () => {
  it('approves a pending batch only once even when tapped 6 times', async () => {
    seed();
    const results = await Promise.all(Array.from({ length: 6 }, () => settlePendingPoints({}, ref, true, 'staff@example.com')));
    const m = store.get(ref.path);
    expect(results.filter(Boolean)).toEqual([40]);
    expect(m.points).toBe(85);
    expect(m.pendingPoints).toBe(0);
    expect(m.pendingOrderIds).toEqual([]);
    expect(m.pointsHistory).toHaveLength(1);
    expect(m.pointsHistory[0]).toMatchObject({ delta: 40, reason: 'order', by: 'staff@example.com', orderIds: ['order1', 'order2'] });
  });

  it('records a rejection with the real pending amount and leaves points alone', async () => {
    seed({ pendingPoints: 13, pendingOrderIds: ['order3'] });
    expect(await settlePendingPoints({}, ref, false, 'staff2@example.com')).toBe(13);
    expect(await settlePendingPoints({}, ref, false, 'staff2@example.com')).toBe(0);
    const m = store.get(ref.path);
    expect(m.points).toBe(45);
    expect(m.pendingOrderIds).toEqual([]);
    expect(m.pointsHistory).toEqual([expect.objectContaining({ delta: 0, reason: 'rejected', amount: 13, by: 'staff2@example.com', orderIds: ['order3'] })]);
  });

  it('does nothing when there is nothing pending', async () => {
    seed({ pendingPoints: 0 });
    expect(await settlePendingPoints({}, ref, true)).toBe(0);
    expect(store.get(ref.path).points).toBe(45);
  });
});

describe('planBillEditPoints', () => {
  it('handles same member with point increase', () => {
    const res = planBillEditPoints({ oldMember: { id: 'm1' }, newMemberId: 'm1', oldEarned: 10, newEarned: 15 });
    expect(res.oldMemberUpdates).toEqual({ pendingPointsUpdate: 5, pendingOrderIdsAction: 'add' });
    expect(res.newMemberUpdates).toBeNull();
  });
  
  it('handles same member with point decrease', () => {
    const res = planBillEditPoints({ oldMember: { id: 'm1', points: 10, pendingPoints: 5 }, newMemberId: 'm1', oldEarned: 15, newEarned: 10 });
    expect(res.oldMemberUpdates).toEqual({ pendingPointsUpdate: -5, pointsUpdate: 0, clawbackFromPoints: 0 });
  });

  it('handles changing members', () => {
    const res = planBillEditPoints({ oldMember: { id: 'm1', points: 10, pendingPoints: 20 }, newMemberId: 'm2', oldEarned: 15, newEarned: 10 });
    expect(res.oldMemberUpdates).toEqual({ pendingPointsUpdate: -15, pointsUpdate: 0, clawbackFromPoints: 0, pendingOrderIdsAction: 'remove' });
    expect(res.newMemberUpdates).toEqual({ pendingPointsUpdate: 10, pendingOrderIdsAction: 'add' });
  });
});

describe('planEarnClawback', () => {
  it('takes from pending first when enough is pending', () => {
    expect(planEarnClawback({ points: 100, pendingPoints: 20 }, 15)).toEqual({ fromPending: 15, fromPoints: 0 });
  });
  it('takes from points when pending is not enough', () => {
    expect(planEarnClawback({ points: 100, pendingPoints: 10 }, 15)).toEqual({ fromPending: 10, fromPoints: 5 });
  });
  it('does not take more than available, no negative', () => {
    expect(planEarnClawback({ points: 5, pendingPoints: 5 }, 15)).toEqual({ fromPending: 5, fromPoints: 5 });
  });
  it('ignores negative pending instead of adding points back', () => {
    expect(planEarnClawback({ points: 20, pendingPoints: -5 }, 15)).toEqual({ fromPending: 0, fromPoints: 15 });
  });
  it('returns 0 when earned is 0', () => {
    expect(planEarnClawback({ points: 100, pendingPoints: 100 }, 0)).toEqual({ fromPending: 0, fromPoints: 0 });
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
