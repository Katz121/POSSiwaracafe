import { describe, expect, it } from 'vitest';
import { isPasswordUser } from './useStaffAuth';

describe('isPasswordUser', () => {
  it('accepts a Firebase Email/Password staff session', () => {
    expect(isPasswordUser({
      providerData: [{ providerId: 'password' }],
    })).toBe(true);
  });

  it('rejects an anonymous customer session', () => {
    expect(isPasswordUser({
      isAnonymous: true,
      providerData: [],
    })).toBe(false);
  });

  it('rejects a session from a different sign-in provider', () => {
    expect(isPasswordUser({
      providerData: [{ providerId: 'google.com' }],
    })).toBe(false);
  });

  it('rejects a missing session safely', () => {
    expect(isPasswordUser(null)).toBe(false);
  });
});
