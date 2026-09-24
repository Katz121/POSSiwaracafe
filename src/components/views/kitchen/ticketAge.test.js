import { describe, expect, it } from 'vitest';
import { createdMillis, ageMinutes, ageTone, ageLabel } from './ticketAge';

const now = Date.parse('2026-09-24T10:30:00Z');

describe('kitchen ticket age', () => {
  it('reads every createdAt shape', () => {
    const t = now - 7 * 60000;
    expect(createdMillis({ createdAt: { toMillis: () => t } })).toBe(t);
    expect(createdMillis({ createdAt: { seconds: t / 1000, nanoseconds: 0 } })).toBe(t);
    expect(createdMillis({ createdAt: new Date(t) })).toBe(t);
    expect(createdMillis({ createdAt: new Date(t).toISOString() })).toBe(t);
    expect(createdMillis({ createdAt: null })).toBe(null);
  });
  it('pending server timestamp counts as just placed', () => {
    expect(ageMinutes({ createdAt: null }, now)).toBe(0);
    expect(ageLabel(0)).toBe('เพิ่งสั่ง');
  });
  it('colours at 5 / 10 / 15 minutes', () => {
    expect([0, 4, 5, 9, 10, 14, 15, 90].map(ageTone)).toEqual(['ok', 'ok', 'age5', 'age5', 'age10', 'age10', 'age15', 'age15']);
    expect(ageMinutes({ createdAt: { seconds: (now - 16 * 60000) / 1000 } }, now)).toBe(16);
    expect(ageLabel(75)).toBe('1 ชม. 15 นาที');
  });
});
