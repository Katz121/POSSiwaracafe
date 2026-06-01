/**
 * LINE notification (shop side)
 *
 * Sends a "new QR order" alert to the shop's LINE. The actual LINE credentials
 * (Channel Access Token + target userId/groupId) live ONLY on the Cloudflare
 * Worker — this client just POSTs the order fields to the worker's `/notify`
 * endpoint, which composes the message server-side. No LINE secret is ever
 * exposed in the browser bundle.
 *
 * Auth: the worker requires a shared secret. We send VITE_LINE_NOTIFY_SECRET as
 * a Bearer token. NOTE: in a public SPA this value ships inside the JS bundle,
 * so it only stops casual abuse of the endpoint — it is not cryptographically
 * secret. For real protection, move this trigger to a Firestore onCreate Cloud
 * Function and/or add Cloudflare Rate Limiting on the /notify route.
 *
 * Configure via:
 *   VITE_LINE_NOTIFY_URL     e.g. https://pos-gemini-proxy.<account>.workers.dev/notify
 *   VITE_LINE_NOTIFY_SECRET  same value as the worker's NOTIFY_SHARED_SECRET
 * If either is unset, notifications are silently skipped — orders still work.
 */

const NOTIFY_URL = import.meta.env.VITE_LINE_NOTIFY_URL;
const NOTIFY_SECRET = import.meta.env.VITE_LINE_NOTIFY_SECRET;

/**
 * @param {{ queueNumber: number, customerName: string, items: Array, total: number, time: string }} order
 */
export async function notifyNewOrderToLine({ queueNumber, customerName, items = [], total, time }) {
  if (!NOTIFY_URL || !NOTIFY_SECRET) return; // not configured — skip silently

  try {
    // Send only the structured fields the worker needs; it formats + validates.
    const payload = {
      type: 'order',
      queueNumber,
      customerName,
      total,
      time,
      items: items.map((it) => ({
        name: it.beanModifier ? `${it.name} ${it.beanModifier}` : it.name,
        quantity: it.quantity,
      })),
    };

    await fetch(NOTIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${NOTIFY_SECRET}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    // Non-fatal: the order is already saved; notification is best-effort.
    console.warn('[lineNotify] failed to notify shop', e);
  }
}
