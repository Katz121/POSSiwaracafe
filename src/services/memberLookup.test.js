import { describe, expect, it, vi } from 'vitest';

vi.mock('./firebase', () => ({ auth: {}, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('firebase/auth', () => ({ signInAnonymously: vi.fn() }));

import { lookupMemberByPhone } from './memberLookup';

describe('lookupMemberByPhone', () => {
  it('waits for auth and signs in before calling the backend', async () => {
    const order = [];
    const authInstance = { currentUser: null, authStateReady: async () => { order.push('ready'); } };
    const signIn = vi.fn(async (a) => { order.push('signIn'); a.currentUser = { uid: 'anon' }; });
    const callableFactory = () => async ({ phone }) => { order.push(`call:${phone}`); return { data: { exists: true, points: 5 } }; };
    const data = await lookupMemberByPhone('0983245629', { authInstance, signIn, callableFactory });
    expect(order).toEqual(['ready', 'signIn', 'call:0983245629']);
    expect(data).toEqual({ exists: true, points: 5 });
  });

  it('does not sign in again when already signed in', async () => {
    const authInstance = { currentUser: { uid: 'x' }, authStateReady: async () => {} };
    const signIn = vi.fn();
    await lookupMemberByPhone('0800000000', { authInstance, signIn, callableFactory: () => async () => ({ data: { exists: false } }) });
    expect(signIn).not.toHaveBeenCalled();
  });
});
