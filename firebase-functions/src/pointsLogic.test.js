import { describe, expect, it } from 'vitest';
import {
  addCalendarMonths,
  buildExpireHistoryEntry,
  computeAutoApproveTake,
  computePointsExpireAt,
  isLookupPhone,
  isQrOrder,
  parseInstant,
  publicMemberLookup,
  resolvePointsEarned,
  shouldAutoApproveQrPoints,
  shouldExpirePoints,
} from './pointsLogic.js';

const bkk = (isoDateTime) => new Date(`${isoDateTime}+07:00`);

describe('addCalendarMonths (Bangkok calendar, clamp end-of-month)', () => {
  it('keeps 31 Jan + 1 month on the last day of February', () => {
    expect(addCalendarMonths(bkk('2026-01-31T15:00:00'), 1).toISOString())
      .toBe(bkk('2026-02-28T15:00:00').toISOString());
  });

  it('uses 29 Feb on a leap year', () => {
    expect(addCalendarMonths(bkk('2024-01-31T15:00:00'), 1).toISOString())
      .toBe(bkk('2024-02-29T15:00:00').toISOString());
  });

  it('clamps 31 Mar + 1 month to 30 Apr', () => {
    expect(addCalendarMonths(bkk('2026-03-31T08:30:00'), 1).toISOString())
      .toBe(bkk('2026-04-30T08:30:00').toISOString());
  });

  it('keeps the same day when the target month has enough days', () => {
    expect(addCalendarMonths(bkk('2026-01-15T10:00:00'), 1).toISOString())
      .toBe(bkk('2026-02-15T10:00:00').toISOString());
  });

  it('adds several months across a year boundary', () => {
    expect(addCalendarMonths(bkk('2026-11-30T00:00:00'), 3).toISOString())
      .toBe(bkk('2027-02-28T00:00:00').toISOString());
  });
});

describe('computePointsExpireAt / shouldExpirePoints', () => {
  it('returns null when expiry is off or lastOrderAt is missing', () => {
    expect(computePointsExpireAt(bkk('2026-01-01T10:00:00'), 0)).toBeNull();
    expect(computePointsExpireAt(bkk('2026-01-01T10:00:00'), null)).toBeNull();
    expect(computePointsExpireAt(null, 6)).toBeNull();
    expect(shouldExpirePoints(null, 6, new Date())).toBe(false);
  });

  it('expires when lastOrderAt + N months is in the past', () => {
    const last = bkk('2025-01-01T10:00:00');
    const now = bkk('2025-08-01T10:00:00');
    expect(shouldExpirePoints(last, 6, now)).toBe(true);
    expect(shouldExpirePoints(last, 6, bkk('2025-07-01T10:00:00'))).toBe(true);
    expect(shouldExpirePoints(last, 6, bkk('2025-06-30T10:00:00'))).toBe(false);
  });

  it('accepts Firestore Timestamp-like values', () => {
    const last = {
      toDate: () => bkk('2025-01-31T10:00:00'),
    };
    expect(computePointsExpireAt(last, 1).toISOString())
      .toBe(bkk('2025-02-28T10:00:00').toISOString());
  });
});

describe('parseInstant', () => {
  it('reads Date, ISO, Timestamp, and {seconds}', () => {
    const iso = '2026-01-31T08:00:00.000Z';
    expect(parseInstant(new Date(iso)).toISOString()).toBe(iso);
    expect(parseInstant(iso).toISOString()).toBe(iso);
    expect(parseInstant({ seconds: 1738300800, nanoseconds: 0 }).getTime()).toBe(1738300800 * 1000);
    expect(parseInstant({ _seconds: 1738300800 }).getTime()).toBe(1738300800 * 1000);
    expect(parseInstant('')).toBeNull();
    expect(parseInstant(undefined)).toBeNull();
  });
});

describe('points earn helpers', () => {
  it('uses pointsEarned including 0, otherwise floor(total/10)', () => {
    expect(resolvePointsEarned({ pointsEarned: 7, total: 99 })).toBe(7);
    expect(resolvePointsEarned({ pointsEarned: 0, total: 99 })).toBe(0);
    expect(resolvePointsEarned({ total: 99 })).toBe(9);
    expect(resolvePointsEarned({})).toBe(0);
  });

  it('takes min(earn, pending) and never goes negative', () => {
    expect(computeAutoApproveTake(10, 3)).toBe(3);
    expect(computeAutoApproveTake(2, 8)).toBe(2);
    expect(computeAutoApproveTake(5, 0)).toBe(0);
    expect(computeAutoApproveTake(-1, 4)).toBe(0);
  });

  it('builds the expire history note in Thai', () => {
    expect(buildExpireHistoryEntry(40, 6, '2026-01-01T00:00:00.000Z')).toEqual({
      delta: -40,
      reason: 'expire',
      by: 'system:expire',
      at: '2026-01-01T00:00:00.000Z',
      note: 'แต้มหมดอายุ ไม่ได้มาซื้อ 6 เดือน',
    });
  });
});

describe('QR auto-approve conditions', () => {
  const qrPaid = { isPaid: true, source: 'qr', memberPhone: '0812345678' };

  it('fires when a QR bill flips to paid', () => {
    expect(shouldAutoApproveQrPoints({ isPaid: false, source: 'qr', memberPhone: '0812345678' }, qrPaid)).toBe(true);
    expect(shouldAutoApproveQrPoints(null, qrPaid)).toBe(true);
    expect(shouldAutoApproveQrPoints(null, { isPaid: true, checkoutRequestId: 'abc', memberPhone: '0812345678' })).toBe(true);
  });

  it('skips POS bills, unpaid bills, already-approved, and missing phone', () => {
    expect(shouldAutoApproveQrPoints(null, { isPaid: true, source: 'pos', memberPhone: '0812345678' })).toBe(false);
    expect(shouldAutoApproveQrPoints(null, { isPaid: false, source: 'qr', memberPhone: '0812345678' })).toBe(false);
    expect(shouldAutoApproveQrPoints({ isPaid: true, source: 'qr', memberPhone: '0812345678' }, qrPaid)).toBe(false);
    expect(shouldAutoApproveQrPoints(null, { ...qrPaid, pointsAutoApproved: true })).toBe(false);
    expect(shouldAutoApproveQrPoints(null, { isPaid: true, source: 'qr' })).toBe(false);
  });

  it('detects QR from source or checkoutRequestId', () => {
    expect(isQrOrder({ source: 'qr' })).toBe(true);
    expect(isQrOrder({ checkoutRequestId: 'x' })).toBe(true);
    expect(isQrOrder({ source: 'pos' })).toBe(false);
  });
});

describe('lookupMember helpers', () => {
  it('accepts 9-10 digit phones only', () => {
    expect(isLookupPhone('081234567')).toBe(true);
    expect(isLookupPhone('0812345678')).toBe(true);
    expect(isLookupPhone('08123456')).toBe(false);
    expect(isLookupPhone('08123456789')).toBe(false);
    expect(isLookupPhone('081-234-5678')).toBe(false);
  });

  it('returns only the public fields', () => {
    expect(publicMemberLookup(null)).toEqual({ exists: false });
    expect(publicMemberLookup({
      name: 'ลูกค้า',
      phone: '0812345678',
      points: 12,
      pendingPoints: 3,
      pointsExpireAt: '2026-06-01T00:00:00.000Z',
      pointsHistory: [{ delta: 1 }],
      secret: 'nope',
    })).toEqual({
      exists: true,
      name: 'ลูกค้า',
      points: 12,
      pendingPoints: 3,
      pointsExpireAt: '2026-06-01T00:00:00.000Z',
    });
    expect(publicMemberLookup({ name: 'x' })).toEqual({
      exists: true,
      name: 'x',
      points: 0,
      pendingPoints: 0,
      pointsExpireAt: null,
    });
  });
});
