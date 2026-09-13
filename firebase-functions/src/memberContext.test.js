import { describe, expect, it } from 'vitest';
import {
  DAYS_AWAY_THRESHOLD,
  REGULAR_THRESHOLD,
  buildMemberContext,
  computeDaysAway,
  formatMemberContextLine,
} from './memberContext.js';

const matcha = (quantity = 1) => ({ items: [{ name: 'มัทฉะลาเต้', quantity }] });
const latte = (quantity = 1) => ({ items: [{ name: 'ลาเต้', quantity }] });
const cocoa = (quantity = 1) => ({ items: [{ name: 'โกโก้', quantity }] });
const emptyBill = () => ({ items: [] });

function regularOrders() {
  return [matcha(2), matcha(), latte(), matcha(), cocoa()];
}

describe('computeDaysAway', () => {
  const now = new Date('2026-02-20T10:00:00.000Z');

  it('returns null when the member has no previous lastOrderAt', () => {
    expect(computeDaysAway(null, now)).toBeNull();
    expect(computeDaysAway(undefined, now)).toBeNull();
    expect(computeDaysAway('', now)).toBeNull();
  });

  it('floors elapsed 24-hour periods', () => {
    expect(computeDaysAway(new Date('2026-01-31T10:00:00.000Z'), now)).toBe(20);
    expect(computeDaysAway(new Date('2026-02-06T10:00:00.000Z'), now)).toBe(14);
    expect(computeDaysAway(new Date('2026-02-07T10:00:00.001Z'), now)).toBe(12);
  });

  it('reads Firestore Timestamp-like values', () => {
    const last = new Date('2026-01-31T10:00:00.000Z');
    expect(computeDaysAway({ toDate: () => last }, now)).toBe(20);
    expect(computeDaysAway({ seconds: last.getTime() / 1000, nanoseconds: 0 }, now)).toBe(20);
  });

  it('does not return a negative gap if lastOrderAt is in the future', () => {
    expect(computeDaysAway(new Date('2026-02-21T10:00:00.000Z'), now)).toBe(0);
  });
});

describe('buildMemberContext', () => {
  it('ลูกค้าใหม่: ไม่มีบิลและไม่มี lastOrderAt', () => {
    expect(buildMemberContext({ orders: [], daysAway: null })).toEqual({
      isRegular: false,
      favoriteItem: null,
      orderCount: 0,
      daysAway: null,
    });
  });

  it('ลูกค้าประจำเมื่อจำนวนบิลถึงเกณฑ์ และเลือกเมนูที่สั่งบ่อยสุดตามจำนวนแก้ว', () => {
    const ctx = buildMemberContext({ orders: regularOrders(), daysAway: 3 });
    expect(ctx).toEqual({
      isRegular: true,
      favoriteItem: 'มัทฉะลาเต้',
      orderCount: 5,
      daysAway: 3,
    });
    expect(REGULAR_THRESHOLD).toBe(5);
  });

  it('ยังไม่ประจำถ้าน้อยกว่าเกณฑ์', () => {
    const ctx = buildMemberContext({
      orders: [matcha(), latte(), cocoa(), matcha()],
      daysAway: null,
    });
    expect(ctx.isRegular).toBe(false);
    expect(ctx.orderCount).toBe(4);
    expect(ctx.favoriteItem).toBe('มัทฉะลาเต้');
  });

  it('ไม่มีเมนูโปรดเมื่อบิลไม่มีชื่อเมนู', () => {
    const orders = Array.from({ length: 5 }, emptyBill);
    expect(buildMemberContext({ orders, daysAway: null })).toEqual({
      isRegular: true,
      favoriteItem: null,
      orderCount: 5,
      daysAway: null,
    });
  });

  it('นับเกณฑ์ประจำจาก regularThreshold ที่ส่งเข้ามา', () => {
    const ctx = buildMemberContext({
      orders: [matcha(), latte()],
      daysAway: null,
      regularThreshold: 2,
    });
    expect(ctx.isRegular).toBe(true);
    expect(ctx.orderCount).toBe(2);
  });
});

describe('formatMemberContextLine', () => {
  it('ลูกค้าใหม่ไม่มีบรรทัดให้โชว์', () => {
    const ctx = buildMemberContext({ orders: [], daysAway: null });
    expect(formatMemberContextLine(ctx)).toBe('');
  });

  it('ลูกค้าประจำพร้อมเมนูโปรด', () => {
    const ctx = buildMemberContext({ orders: regularOrders(), daysAway: 3 });
    expect(formatMemberContextLine(ctx)).toBe('⭐ ลูกค้าประจำ · ชอบ มัทฉะลาเต้');
  });

  it('หายไปนานโชว์เมื่อครบเกณฑ์วัน', () => {
    const ctx = buildMemberContext({ orders: regularOrders(), daysAway: 20 });
    expect(formatMemberContextLine(ctx)).toBe(
      '⭐ ลูกค้าประจำ · ชอบ มัทฉะลาเต้ · หายไป 20 วัน',
    );
    expect(DAYS_AWAY_THRESHOLD).toBe(14);
  });

  it('ไม่โชว์หายไปเมื่อยังไม่ครบ 14 วัน', () => {
    const ctx = buildMemberContext({ orders: regularOrders(), daysAway: 13 });
    expect(formatMemberContextLine(ctx)).toBe('⭐ ลูกค้าประจำ · ชอบ มัทฉะลาเต้');
  });

  it('ไม่มีเมนูโปรดแล้วยังโชว์สถานะประจำได้', () => {
    const ctx = buildMemberContext({
      orders: Array.from({ length: 5 }, emptyBill),
      daysAway: null,
    });
    expect(formatMemberContextLine(ctx)).toBe('⭐ ลูกค้าประจำ');
  });

  it('โชว์แค่เมนูโปรดเมื่อยังไม่ประจำและไม่หายไปนาน', () => {
    const ctx = buildMemberContext({ orders: [matcha(), matcha()], daysAway: 2 });
    expect(formatMemberContextLine(ctx)).toBe('⭐ ชอบ มัทฉะลาเต้');
  });

  it('โชว์แค่หายไปนานเมื่อไม่มีอย่างอื่น', () => {
    expect(formatMemberContextLine({
      isRegular: false,
      favoriteItem: null,
      orderCount: 1,
      daysAway: 14,
    })).toBe('⭐ หายไป 14 วัน');
  });

  it('คืนข้อความว่างเมื่อไม่มีบริบท', () => {
    expect(formatMemberContextLine(null)).toBe('');
    expect(formatMemberContextLine({
      isRegular: false,
      favoriteItem: '',
      orderCount: 1,
      daysAway: 0,
    })).toBe('');
  });
});
