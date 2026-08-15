const STAFF_AUTH_DOMAIN = 'staff.siwara.local';
const STAFF_ID_PATTERN = /^[a-z0-9._-]+$/;

export function normalizeStaffId(value) {
  return String(value || '').trim().toLowerCase();
}

export function staffIdToEmail(value) {
  const staffId = normalizeStaffId(value);
  if (!STAFF_ID_PATTERN.test(staffId)) {
    throw new Error('invalid-staff-id');
  }
  return `${staffId}@${STAFF_AUTH_DOMAIN}`;
}
