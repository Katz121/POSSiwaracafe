/**
 * Daily queue numbers — the shop's "business day" starts at 10:00 Asia/Bangkok.
 *
 * config/queue stores { current, day }: `current` is the number the next order
 * gets, `day` the business day it belongs to. Whoever issues a number (POS,
 * checkoutOrder function, direct-write fallback) calls nextQueueNumber(): when the
 * stored day isn't today's business day the count restarts at 1. No scheduled job
 * needed, and nothing is missed if every device was off at 10:00.
 *
 * Keep in sync with src/utils/queueDay.js (web app copy).
 */
export const QUEUE_RESET_HOUR = 10;

const bangkokDate = (date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);

/** Business day key "YYYY-MM-DD": 09:59 on the 12th still belongs to the 11th. */
export function queueDayKey(now = new Date()) {
  return bangkokDate(new Date(now.getTime() - QUEUE_RESET_HOUR * 3600e3));
}

/** When the current business day started (for "orders today" style filters). */
export function queueDayStart(now = new Date()) {
  const key = queueDayKey(now); // YYYY-MM-DD in Bangkok (UTC+7, no DST)
  return new Date(`${key}T${String(QUEUE_RESET_HOUR).padStart(2, '0')}:00:00+07:00`);
}

/**
 * @param {{current?: number, day?: string} | null} queueDoc
 * @returns {{ number: number, sameDay: boolean, day: string }}
 *   number  — queue number the next order gets
 *   sameDay — stored counter belongs to today (safe to increment it in place)
 *   day     — today's business day key, to store with the new counter
 */
export function nextQueueNumber(queueDoc, now = new Date()) {
  const day = queueDayKey(now);
  const current = Math.max(1, Number(queueDoc?.current) || 1);
  // Counter saved before daily reset existed (no `day`): keep counting, the
  // first reset happens at the next 10:00 instead of mid-shift on deploy.
  const sameDay = !queueDoc?.day || queueDoc.day === day;
  return { number: sameDay ? current : 1, sameDay, day };
}

/**
 * How many of `docs` (Firestore snapshots or plain objects with `createdAt`)
 * were created at/after `since`. Unreadable dates count, so a malformed order
 * is never hidden from the kitchen line.
 */
export function countPendingSince(docs = [], since) {
  const from = since.getTime();
  return docs.filter((d) => {
    const v = (typeof d?.data === 'function' ? d.data() : d)?.createdAt;
    const ms = v?.toMillis ? v.toMillis() : (v?.seconds != null ? v.seconds * 1000 : new Date(v).getTime());
    return !Number.isFinite(ms) || ms >= from;
  }).length;
}
