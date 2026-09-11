/**
 * qrFunnel — anonymous daily counters for the customer QR page.
 *
 * Answers "where do people drop off?": how many visits reach each step
 * (view → add → cart → checkout → order). Orders alone can't tell us that.
 *
 * Privacy: only aggregate numbers per day. No name, phone, cart contents or ids.
 * Each step counts at most once per browser session (sessionStorage flag), so a
 * number means "sessions that reached this step", not taps.
 *
 * Best-effort: every failure is swallowed — counting must never affect ordering.
 * Firestore rules (config: qrFunnel/{day}) only let a customer add exactly +1 to
 * one known step per write; only staff can read.
 */
import { doc, setDoc, increment } from 'firebase/firestore';

export const FUNNEL_STEPS = ['view', 'add', 'cart', 'checkout', 'order'];

export const FUNNEL_LABELS = {
  view: 'เปิดเมนู',
  add: 'เพิ่มของลงตะกร้า',
  cart: 'เปิดตะกร้า',
  checkout: 'หน้ายืนยัน',
  order: 'สั่งสำเร็จ',
};

/** Local calendar day in the shop's time zone (Asia/Bangkok), "YYYY-MM-DD". */
export function funnelDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

const flagKey = (day, step) => `qrFunnel:${day}:${step}`;

/**
 * Count one step for this session (once per day per session).
 * @returns {Promise<boolean>} true if a write was attempted
 */
export async function trackFunnelStep(db, appId, step, { storage = globalThis.sessionStorage, now = new Date() } = {}) {
  if (!FUNNEL_STEPS.includes(step) || !db || !appId) return false;
  const day = funnelDay(now);
  try {
    if (storage?.getItem(flagKey(day, step))) return false;
    storage?.setItem(flagKey(day, step), '1');
  } catch {
    // storage blocked (private mode) → still count, may over-count slightly
  }
  try {
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'qrFunnel', day), { [step]: increment(1) }, { merge: true });
  } catch {
    // offline / rules not deployed yet — ignore
  }
  return true;
}

/**
 * Turn daily docs into rows with step-to-step conversion.
 * @param {Array<{id: string} & Record<string, number>>} docs
 */
export function summarizeFunnel(docs = []) {
  const totals = Object.fromEntries(FUNNEL_STEPS.map((s) => [s, 0]));
  for (const d of docs) for (const s of FUNNEL_STEPS) totals[s] += Number(d?.[s]) || 0;
  return FUNNEL_STEPS.map((step, i) => {
    const count = totals[step];
    const prev = i === 0 ? count : totals[FUNNEL_STEPS[i - 1]];
    const first = totals[FUNNEL_STEPS[0]];
    return {
      step,
      label: FUNNEL_LABELS[step],
      count,
      fromPrev: i === 0 || !prev ? null : Math.round((count / prev) * 100),
      fromStart: !first ? null : Math.round((count / first) * 100),
    };
  });
}
