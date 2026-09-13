export function uaClass(ua) {
  if (/Line\//i.test(ua)) return 'line';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook';
  if (/Instagram/i.test(ua)) return 'instagram';
  return 'other';
}

export function sendQrBeacon(event) {
  try {
    if (event !== 'retry') {
      const sentKey = `qrBeacon_sent_${event}`;
      if (sessionStorage.getItem(sentKey)) return;
      sessionStorage.setItem(sentKey, '1');
    }

    const payload = JSON.stringify({
      event,
      ua: uaClass(navigator.userAgent)
    });

    const url = 'https://pos-gemini-proxy.siwatid-99.workers.dev/qr-beacon';
    
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, payload);
    } else {
      fetch(url, { method: 'POST', body: payload, keepalive: true, mode: 'no-cors' }).catch(() => {});
    }
  } catch {
    // ignore
  }
}
