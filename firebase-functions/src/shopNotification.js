import { formatMemberContextLine } from './memberContext.js';

const DEFAULT_NOTIFY_URL = 'https://pos-gemini-proxy.siwatid-99.workers.dev/notify';

function toMemberContext(value) {
  if (!value) return undefined;
  if (typeof value === 'string') {
    const line = value.trim();
    return line ? { line } : undefined;
  }
  if (typeof value !== 'object') return undefined;
  const favoriteRaw = value.favoriteItem == null ? '' : String(value.favoriteItem).trim();
  const orderCount = Number(value.orderCount);
  const daysRaw = value.daysAway;
  const daysAway = daysRaw == null || daysRaw === ''
    ? null
    : (Number.isFinite(Number(daysRaw)) ? Number(daysRaw) : null);
  const ctx = {
    isRegular: !!value.isRegular,
    favoriteItem: favoriteRaw || null,
    orderCount: Number.isFinite(orderCount) ? orderCount : 0,
    daysAway,
  };
  const line = typeof value.line === 'string' && value.line.trim()
    ? String(value.line).trim()
    : formatMemberContextLine(ctx);
  return { ...ctx, line };
}

export function buildShopNotification(order) {
  const payload = {
    type: 'order',
    queueNumber: order.queueNumber,
    customerName: order.customerName,
    total: order.total,
    time: order.time,
    items: (order.items || []).map((item) => ({
      name: item.beanModifier ? `${item.name} ${item.beanModifier}` : item.name,
      quantity: item.quantity,
    })),
  };
  const memberContext = toMemberContext(order.memberContext);
  if (memberContext) payload.memberContext = memberContext;
  return payload;
}

export async function notifyShopOrder(order, {
  secret,
  url = DEFAULT_NOTIFY_URL,
  fetchImpl = fetch,
} = {}) {
  if (!secret) throw new Error('notify-secret-missing');

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(buildShopNotification(order)),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) {
    throw new Error(`shop-notification-failed:${response.status}`);
  }
  return result;
}
