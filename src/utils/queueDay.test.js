import { describe, expect, it } from 'vitest';
import { queueDayKey, queueDayStart, nextQueueNumber, countPendingSince } from './queueDay';

const bkk = (s) => new Date(`${s}+07:00`);

describe('queueDayKey (business day starts 10:00 Bangkok)', () => {
  it('rolls over exactly at 10:00', () => {
    expect(queueDayKey(bkk('2026-09-12T09:59:59'))).toBe('2026-09-11');
    expect(queueDayKey(bkk('2026-09-12T10:00:00'))).toBe('2026-09-12');
    expect(queueDayKey(bkk('2026-09-12T23:30:00'))).toBe('2026-09-12');
    expect(queueDayKey(bkk('2026-09-13T01:00:00'))).toBe('2026-09-12');
  });
  it('knows when the business day started', () => {
    expect(queueDayStart(bkk('2026-09-12T15:00:00')).toISOString()).toBe('2026-09-12T03:00:00.000Z');
    expect(queueDayStart(bkk('2026-09-12T08:00:00')).toISOString()).toBe('2026-09-11T03:00:00.000Z');
  });
});

describe('nextQueueNumber', () => {
  const now = bkk('2026-09-12T13:00:00');
  it('continues the count on the same business day', () => {
    expect(nextQueueNumber({ current: 12, day: '2026-09-12' }, now)).toEqual({ number: 12, sameDay: true, day: '2026-09-12' });
  });
  it('restarts at 1 on a new business day', () => {
    expect(nextQueueNumber({ current: 903, day: '2026-09-11' }, now)).toEqual({ number: 1, sameDay: false, day: '2026-09-12' });
  });
  it('keeps counting a legacy counter without a day (no mid-shift reset on deploy)', () => {
    expect(nextQueueNumber({ current: 903 }, now)).toEqual({ number: 903, sameDay: true, day: '2026-09-12' });
  });
  it('starts at 1 when there is no counter yet', () => {
    expect(nextQueueNumber(null, now).number).toBe(1);
    expect(nextQueueNumber({ current: 0, day: '2026-09-12' }, now).number).toBe(1);
  });
});

describe('countPendingSince', () => {
  it('counts only orders from the current business day (any date shape)', () => {
    const since = bkk('2026-09-12T10:00:00');
    const docs = [
      { createdAt: bkk('2026-09-11T20:00:00') },                        // yesterday, never closed
      { createdAt: bkk('2026-09-12T11:00:00') },                        // Date
      { createdAt: { toMillis: () => bkk('2026-09-12T12:00:00').getTime() } }, // Timestamp
      { createdAt: { seconds: bkk('2026-09-12T12:30:00').getTime() / 1000 } }, // plain {seconds}
      { data: () => ({ createdAt: '2026-09-12T13:00:00+07:00' }) },     // snapshot + string
      { createdAt: 'garbage' },                                          // unreadable → counted
    ];
    expect(countPendingSince(docs, since)).toBe(5);
  });
});
