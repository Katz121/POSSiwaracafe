// Ticket age for the kitchen board (Toast KDS style: yellow 5 min, orange 10, red 15).

/** Milliseconds of an order's createdAt (Firestore Timestamp, {seconds}, Date, ISO, number). null if unknown/pending. */
export function createdMillis(order) {
  const c = order?.createdAt;
  if (!c) return null;
  if (typeof c.toMillis === 'function') return c.toMillis();
  if (typeof c.seconds === 'number') return c.seconds * 1000 + Math.floor((c.nanoseconds || 0) / 1e6);
  if (c instanceof Date) return c.getTime();
  const n = typeof c === 'number' ? c : Date.parse(c);
  return Number.isFinite(n) ? n : null;
}

/** Whole minutes waited (0 while the server timestamp is still pending). */
export function ageMinutes(order, now = Date.now()) {
  const t = createdMillis(order);
  if (t == null) return 0;
  return Math.max(0, Math.floor((now - t) / 60000));
}

/** 'ok' < 5 min ≤ 'age5' < 10 ≤ 'age10' < 15 ≤ 'age15' */
export function ageTone(minutes) {
  if (minutes >= 15) return 'age15';
  if (minutes >= 10) return 'age10';
  if (minutes >= 5) return 'age5';
  return 'ok';
}

export const AGE_COLOR = {
  ok: 'var(--kds-age-ok)',
  age5: 'var(--kds-age-5)',
  age10: 'var(--kds-age-10)',
  age15: 'var(--kds-age-15)',
};

export function ageLabel(minutes) {
  if (minutes < 1) return 'เพิ่งสั่ง';
  if (minutes < 60) return `${minutes} นาที`;
  const h = Math.floor(minutes / 60);
  return `${h} ชม. ${minutes % 60} นาที`;
}
