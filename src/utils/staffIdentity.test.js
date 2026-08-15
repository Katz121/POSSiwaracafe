import { describe, expect, it } from 'vitest';
import { normalizeStaffId, staffIdToEmail } from './staffIdentity';

describe('staff identity', () => {
  it('normalizes a staff ID', () => {
    expect(normalizeStaffId('  Siwara ')).toBe('siwara');
  });

  it('maps an ID to the internal Firebase email', () => {
    expect(staffIdToEmail('siwara')).toBe('siwara@staff.siwara.local');
  });

  it.each(['', 'siwara cafe', 'ศิวรา', 'siwara@shop'])('rejects invalid ID %j', (staffId) => {
    expect(() => staffIdToEmail(staffId)).toThrow('invalid-staff-id');
  });
});
