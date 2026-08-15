const DEFAULT_NOTIFY_URL = 'https://pos-gemini-proxy.siwatid-99.workers.dev/notify';

export function buildShopNotification(order) {
  return {
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
