import { describe, expect, it, vi } from 'vitest';
import { browserSessionPersistence } from 'firebase/auth';
import { signInStaff } from './staffAuth';

describe('signInStaff', () => {
  it('sets session persistence before sending credentials', async () => {
    const calls = [];
    const authInstance = { name: 'test-auth' };
    const authApi = {
      setPersistence: vi.fn(async (auth, persistence) => {
        calls.push('persistence');
        expect(auth).toBe(authInstance);
        expect(persistence).toBe(browserSessionPersistence);
      }),
      signInWithEmailAndPassword: vi.fn(async (auth, email, password) => {
        calls.push('sign-in');
        expect(auth).toBe(authInstance);
        expect(email).toBe('siwara@staff.siwara.local');
        expect(password).toBe('test-password');
        return { user: { uid: 'staff-1' } };
      }),
    };

    const credential = await signInStaff(
      authInstance,
      'siwara',
      'test-password',
      authApi,
    );

    expect(calls).toEqual(['persistence', 'sign-in']);
    expect(credential.user.uid).toBe('staff-1');
  });
});
