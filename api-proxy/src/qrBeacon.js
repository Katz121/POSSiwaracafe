export const QR_BEACON_EVENTS = ['open', 'menu_ok', 'error_auth', 'error_menu', 'error_chunk', 'retry'];
export const QR_BEACON_UA = ['line', 'facebook', 'instagram', 'other'];
export const QR_BEACON_KEY_PREFIX = 'qrbeacon:';
export const QR_BEACON_TTL_SEC = 60 * 24 * 60 * 60;
export const QR_BEACON_MAX_BODY = 200;
export const QR_BEACON_RATE_LIMIT = 30;
export const QR_BEACON_RATE_WINDOW_MS = 60_000;
export const QR_BEACON_ORIGIN_PAGES = 'https://possiwaracafe.pages.dev';

const FAILED_EVENTS = ['error_auth', 'error_menu', 'error_chunk'];

/** In-memory hits per isolate — enough for a small shop. */
export const qrBeaconHits = new Map();

export function resetQrBeaconHits() {
  qrBeaconHits.clear();
}

export function bangkokISODate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now instanceof Date ? now : new Date(now));
}

export function qrBeaconKvKey(dateStr) {
  return `${QR_BEACON_KEY_PREFIX}${dateStr}`;
}

export function isQrBeaconOrigin(origin) {
  if (origin === QR_BEACON_ORIGIN_PAGES) return true;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:') return false;
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '192.168.1.152';
  } catch {
    return false;
  }
}

export function qrBeaconCorsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (isQrBeaconOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function byteLength(text) {
  return new TextEncoder().encode(text).length;
}

function allowedContentType(contentType) {
  const ct = String(contentType || '').toLowerCase();
  if (!ct) return true;
  return ct.startsWith('text/plain') || ct.startsWith('application/json');
}

/**
 * @returns {{ event: string, ua: string } | null}
 */
export function parseQrBeaconBody(raw, contentType = '') {
  if (raw == null) return null;
  const text = typeof raw === 'string' ? raw : String(raw);
  if (byteLength(text) > QR_BEACON_MAX_BODY) return null;
  if (!allowedContentType(contentType)) return null;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const event = String(data.event || '');
  const ua = String(data.ua || '');
  if (!QR_BEACON_EVENTS.includes(event)) return null;
  if (!QR_BEACON_UA.includes(ua)) return null;
  return { event, ua };
}

export function incrementQrBeaconCounts(prev, event, ua) {
  const next = prev && typeof prev === 'object' && !Array.isArray(prev) ? { ...prev } : {};
  next[event] = (Number(next[event]) || 0) + 1;
  const combo = `${event}:${ua}`;
  next[combo] = (Number(next[combo]) || 0) + 1;
  return next;
}

export function allowQrBeaconHit(store, ip, now = Date.now(), limit = QR_BEACON_RATE_LIMIT, windowMs = QR_BEACON_RATE_WINDOW_MS) {
  const map = store || qrBeaconHits;
  const key = String(ip || 'unknown');
  if (map.size > 500) {
    for (const [k, v] of map) {
      if (now - (v?.start || 0) >= windowMs) map.delete(k);
    }
  }
  const rec = map.get(key);
  if (!rec || now - rec.start >= windowMs) {
    map.set(key, { start: now, count: 1 });
    return true;
  }
  if (rec.count >= limit) return false;
  rec.count += 1;
  return true;
}

export function listThaiDates(now = new Date(), days = 7) {
  const parsed = Math.trunc(Number(days));
  const n = Number.isFinite(parsed) && parsed > 0 ? Math.min(60, parsed) : 7;
  const origin = now instanceof Date ? now.getTime() : Number(now);
  const base = Number.isFinite(origin) ? origin : Date.now();
  const dates = [];
  for (let i = 0; i < n; i++) {
    dates.push(bangkokISODate(new Date(base - i * 24 * 60 * 60 * 1000)));
  }
  return dates;
}

function n(counts, key) {
  return Number(counts?.[key]) || 0;
}

export function hasQrBeaconData(counts) {
  if (!counts || typeof counts !== 'object') return false;
  return Object.values(counts).some((v) => Number(v) > 0);
}

function uaFailed(counts, ua) {
  return FAILED_EVENTS.reduce((sum, event) => sum + n(counts, `${event}:${ua}`), 0);
}

/**
 * @returns {{ section: string | null, flags: string[] }}
 */
export function formatQrBeaconToday(counts) {
  if (!hasQrBeaconData(counts)) return { section: null, flags: [] };

  const open = n(counts, 'open');
  const menuOk = n(counts, 'menu_ok');
  const auth = n(counts, 'error_auth');
  const menu = n(counts, 'error_menu');
  const chunk = n(counts, 'error_chunk');
  const menuPct = open > 0 ? Math.round((menuOk / open) * 100) : 0;
  const failed = auth + menu + chunk;
  const pctOf = (x) => (failed > 0 ? Math.round((x / failed) * 100) : 0);

  const lines = [
    'หน้า QR วันนี้',
    `เปิด ${open}`,
    `เห็นเมนู ${menuOk} (${menuPct}%)`,
    `ค้าง/ล้ม · ล็อกอินไม่สำเร็จ ${auth} · โหลดเมนูไม่สำเร็จ ${menu} · ไฟล์ JS ไม่ขึ้น ${chunk}`,
  ];
  if (failed > 0) {
    lines.push(
      `สัดส่วนในกลุ่มที่ล้ม · LINE ${pctOf(uaFailed(counts, 'line'))}% · Facebook ${pctOf(uaFailed(counts, 'facebook'))}% · IG ${pctOf(uaFailed(counts, 'instagram'))}%`
    );
  }

  const flags = [];
  if (open > 0 && (open - menuOk) / open > 0.10) {
    const drop = Math.round(((open - menuOk) / open) * 100);
    flags.push(`หน้า QR เปิดแล้วไม่เห็นเมนู ${drop}% (เปิด ${open} เห็นเมนู ${menuOk})`);
  }

  return { section: lines.join('\n'), flags };
}

export function mergeQrBeaconIntoSummary(text, counts) {
  const { section, flags } = formatQrBeaconToday(counts);
  if (!section) return text || '';
  let out = text || '';
  if (flags.length) {
    const extra = flags.map((f) => `· ${f}`).join('\n');
    if (out.includes('\nไม่พบสิ่งผิดปกติ')) {
      out = out.replace('\nไม่พบสิ่งผิดปกติ', `\n${extra}`);
    } else if (out.includes('\nควรเช็ค')) {
      out = `${out}\n${extra}`;
    } else {
      out = `${out}\n\nควรเช็ค\n${extra}`;
    }
  }
  return out ? `${out}\n\n${section}` : section;
}
