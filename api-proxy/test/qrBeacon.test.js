import { it, expect, vi, afterEach } from 'vitest';
import worker, { sendPointsSummary, buildPointsReport } from '../worker.js';
import {
  parseQrBeaconBody,
  incrementQrBeaconCounts,
  allowQrBeaconHit,
  resetQrBeaconHits,
  formatQrBeaconToday,
  mergeQrBeaconIntoSummary,
  hasQrBeaconData,
  listThaiDates,
  bangkokISODate,
  qrBeaconKvKey,
  isQrBeaconOrigin,
  qrBeaconCorsHeaders,
  QR_BEACON_TTL_SEC,
  QR_BEACON_MAX_BODY,
} from '../src/qrBeacon.js';
import { encodeFields } from '../src/firestore.js';
import { env, harness, memoryKV, NOW } from './helpers.js';

afterEach(() => {
  resetQrBeaconHits();
  vi.unstubAllGlobals();
});

const AT = '2026-09-10T04:59:59.000Z';

function member(extra = {}) {
  return {
    id: '0981234629',
    name: 'สมชาย',
    phone: '0981234629',
    points: 0,
    pendingPoints: 0,
    pendingOrderIds: [],
    pointsHistory: [],
    ...extra,
  };
}

function withCollections(deps, { members = [], orders = [] } = {}) {
  const inner = deps.fetch;
  deps.fetch = vi.fn(async (url, options = {}) => {
    if (String(url).includes('/members?')) {
      return Response.json({
        documents: members.map((m) => {
          const { id, ...fields } = m;
          return {
            name: `projects/siwarapos/databases/(default)/documents/artifacts/siwara-pos-v1/public/data/members/${id}`,
            fields: encodeFields(fields),
          };
        }),
      });
    }
    if (String(url).endsWith(':runQuery')) {
      return Response.json(orders.map((o) => {
        const { id, ...fields } = o;
        return {
          document: {
            name: `projects/siwarapos/databases/(default)/documents/artifacts/siwara-pos-v1/public/data/orders/${id}`,
            fields: encodeFields(fields),
          },
        };
      }));
    }
    return inner(url, options);
  });
  return deps;
}

function beaconReq(body, { origin, ip, contentType = 'text/plain', method = 'POST' } = {}) {
  const headers = { 'Content-Type': contentType };
  if (origin) headers.Origin = origin;
  if (ip) headers['CF-Connecting-IP'] = ip;
  return new Request('https://test.invalid/qr-beacon', {
    method,
    headers,
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
}

it('parses allowed event/ua from text/plain JSON and rejects everything else silently', () => {
  expect(parseQrBeaconBody('{"event":"open","ua":"line"}', 'text/plain')).toEqual({ event: 'open', ua: 'line' });
  expect(parseQrBeaconBody('{"event":"menu_ok","ua":"facebook"}', 'application/json; charset=utf-8')).toEqual({ event: 'menu_ok', ua: 'facebook' });
  expect(parseQrBeaconBody('{"event":"error_auth","ua":"instagram"}')).toEqual({ event: 'error_auth', ua: 'instagram' });
  expect(parseQrBeaconBody('{"event":"retry","ua":"other"}', 'text/plain')).toEqual({ event: 'retry', ua: 'other' });
  expect(parseQrBeaconBody('{"event":"hack","ua":"line"}')).toBeNull();
  expect(parseQrBeaconBody('{"event":"open","ua":"chrome"}')).toBeNull();
  expect(parseQrBeaconBody('not json', 'text/plain')).toBeNull();
  expect(parseQrBeaconBody('{"event":"open","ua":"line"}', 'text/html')).toBeNull();
  expect(parseQrBeaconBody(`{"event":"open","ua":"line","pad":"${'x'.repeat(180)}"}`)).toBeNull();
  expect(new TextEncoder().encode(`{"event":"open","ua":"line","pad":"${'x'.repeat(180)}"}`).length).toBeGreaterThan(QR_BEACON_MAX_BODY);
});

it('increments event and event:ua without throwing on empty prev', () => {
  expect(incrementQrBeaconCounts(null, 'open', 'line')).toEqual({ open: 1, 'open:line': 1 });
  expect(incrementQrBeaconCounts({ open: 2, 'open:line': 1 }, 'open', 'facebook')).toEqual({
    open: 3, 'open:line': 1, 'open:facebook': 1,
  });
});

it('rate-limits 30 hits per IP per minute and isolates IPs', () => {
  const store = new Map();
  const t = 1_000_000;
  for (let i = 0; i < 30; i++) expect(allowQrBeaconHit(store, '1.1.1.1', t)).toBe(true);
  expect(allowQrBeaconHit(store, '1.1.1.1', t + 1)).toBe(false);
  expect(allowQrBeaconHit(store, '2.2.2.2', t + 1)).toBe(true);
  expect(allowQrBeaconHit(store, '1.1.1.1', t + 60_000)).toBe(true);
});

it('skips the QR heading when the day has no counts', () => {
  expect(hasQrBeaconData(null)).toBe(false);
  expect(hasQrBeaconData({ open: 0 })).toBe(false);
  expect(formatQrBeaconToday(null).section).toBeNull();
  expect(mergeQrBeaconIntoSummary('สรุปแต้ม', null)).toBe('สรุปแต้ม');
});

it('formats today totals, failed UA share, and ควรเช็ค when open-menu_ok exceeds 10%', () => {
  const counts = {
    open: 100,
    menu_ok: 80,
    error_auth: 10,
    error_menu: 5,
    error_chunk: 2,
    'error_auth:line': 8,
    'error_auth:facebook': 2,
    'error_menu:instagram': 5,
    'error_chunk:line': 2,
  };
  const { section, flags } = formatQrBeaconToday(counts);
  expect(section).toContain('หน้า QR วันนี้');
  expect(section).toContain('เปิด 100');
  expect(section).toContain('เห็นเมนู 80 (80%)');
  expect(section).toContain('ล็อกอินไม่สำเร็จ 10');
  expect(section).toContain('โหลดเมนูไม่สำเร็จ 5');
  expect(section).toContain('ไฟล์ JS ไม่ขึ้น 2');
  expect(section).toMatch(/LINE 59%/);
  expect(section).toMatch(/Facebook 12%/);
  expect(section).toMatch(/IG 29%/);
  expect(flags[0]).toContain('เปิดแล้วไม่เห็นเมนู 20%');

  const exactTen = formatQrBeaconToday({ open: 10, menu_ok: 9 });
  expect(exactTen.flags).toEqual([]);
  expect(exactTen.section).toContain('เห็นเมนู 9 (90%)');
});

it('merges drop-off into ควรเช็ค and appends the QR section', () => {
  const clean = 'สรุปแต้ม\n\nควรเช็ค\nไม่พบสิ่งผิดปกติ';
  const merged = mergeQrBeaconIntoSummary(clean, { open: 10, menu_ok: 5 });
  expect(merged).toContain('· หน้า QR เปิดแล้วไม่เห็นเมนู 50% (เปิด 10 เห็นเมนู 5)');
  expect(merged).not.toContain('ไม่พบสิ่งผิดปกติ');
  expect(merged).toContain('หน้า QR วันนี้');
  expect(merged.indexOf('ควรเช็ค')).toBeLessThan(merged.indexOf('หน้า QR วันนี้'));
});

it('allows pages.dev and localhost http origins only', () => {
  expect(isQrBeaconOrigin('https://possiwaracafe.pages.dev')).toBe(true);
  expect(isQrBeaconOrigin('http://localhost:5173')).toBe(true);
  expect(isQrBeaconOrigin('http://127.0.0.1:4173')).toBe(true);
  expect(isQrBeaconOrigin('https://siwaracafe.com')).toBe(false);
  expect(isQrBeaconOrigin('https://evil.example')).toBe(false);
  expect(qrBeaconCorsHeaders('https://possiwaracafe.pages.dev')['Access-Control-Allow-Origin']).toBe('https://possiwaracafe.pages.dev');
  expect(qrBeaconCorsHeaders('https://evil.example')['Access-Control-Allow-Origin']).toBeUndefined();
});

it('lists Thai calendar days including today', () => {
  const dates = listThaiDates(NOW, 7);
  expect(dates).toHaveLength(7);
  expect(dates[0]).toBe('2026-09-10');
  expect(dates[1]).toBe('2026-09-09');
  expect(qrBeaconKvKey(dates[0])).toBe('qrbeacon:2026-09-10');
});

it('POST /qr-beacon counts into FOLLOWERS with 60-day TTL and always returns 204', async () => {
  const kv = memoryKV();
  const origin = 'https://possiwaracafe.pages.dev';
  const res = await worker.fetch(
    beaconReq({ event: 'open', ua: 'line' }, { origin, ip: '9.9.9.9' }),
    { ...env, FOLLOWERS: kv },
    {},
  );
  expect(res.status).toBe(204);
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
  const key = qrBeaconKvKey(bangkokISODate());
  expect(await kv.get(key, 'json')).toEqual({ open: 1, 'open:line': 1 });
  expect(kv.ttls.get(key)).toBe(QR_BEACON_TTL_SEC);

  const again = await worker.fetch(
    beaconReq({ event: 'menu_ok', ua: 'line' }, { origin, ip: '9.9.9.9', contentType: 'application/json' }),
    { ...env, FOLLOWERS: kv },
    {},
  );
  expect(again.status).toBe(204);
  expect(await kv.get(key, 'json')).toEqual({ open: 1, 'open:line': 1, menu_ok: 1, 'menu_ok:line': 1 });
});

it('invalid or oversized beacon body still returns 204 without counting', async () => {
  const kv = memoryKV();
  const config = { ...env, FOLLOWERS: kv };
  const bad = await worker.fetch(beaconReq({ event: 'nope', ua: 'line' }, { ip: '8.8.8.8' }), config, {});
  const huge = await worker.fetch(beaconReq({ event: 'open', ua: 'line', pad: 'x'.repeat(180) }, { ip: '8.8.8.8' }), config, {});
  expect(bad.status).toBe(204);
  expect(huge.status).toBe(204);
  expect(kv.put).not.toHaveBeenCalled();
});

it('OPTIONS /qr-beacon answers CORS for allowed origins and omits it otherwise', async () => {
  const allowed = await worker.fetch(new Request('https://test.invalid/qr-beacon', {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:5173' },
  }), env, {});
  expect(allowed.status).toBe(204);
  expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
  expect(allowed.headers.get('Access-Control-Allow-Methods')).toContain('POST');

  const denied = await worker.fetch(new Request('https://test.invalid/qr-beacon', {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example' },
  }), env, {});
  expect(denied.status).toBe(204);
  expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();
});

it('rate-limit over 30/min returns 204 and does not increment', async () => {
  const kv = memoryKV();
  const config = { ...env, FOLLOWERS: kv };
  for (let i = 0; i < 30; i++) {
    const res = await worker.fetch(beaconReq({ event: 'open', ua: 'other' }, { ip: '3.3.3.3' }), config, {});
    expect(res.status).toBe(204);
  }
  const blocked = await worker.fetch(beaconReq({ event: 'open', ua: 'other' }, { ip: '3.3.3.3' }), config, {});
  expect(blocked.status).toBe(204);
  const stored = await kv.get(qrBeaconKvKey(bangkokISODate()), 'json');
  expect(stored.open).toBe(30);
});

it('KV failures still return 204', async () => {
  const kv = {
    get: vi.fn(async () => { throw new Error('kv down'); }),
    put: vi.fn(async () => { throw new Error('kv down'); }),
  };
  const res = await worker.fetch(beaconReq({ event: 'error_chunk', ua: 'other' }, { ip: '4.4.4.4' }), { ...env, FOLLOWERS: kv }, {});
  expect(res.status).toBe(204);
});

it('GET /qr-beacon/stats?days=7 requires the existing admin secret and returns daily JSON', async () => {
  const kv = memoryKV();
  const today = bangkokISODate();
  await kv.put(qrBeaconKvKey(today), JSON.stringify({ open: 4, menu_ok: 3, 'open:line': 4 }));
  const denied = await worker.fetch(new Request('https://test.invalid/qr-beacon/stats?days=7', {
    method: 'GET', headers: { Authorization: 'Bearer notify' },
  }), { ...env, FOLLOWERS: kv }, {});
  expect(denied.status).toBe(401);

  const res = await worker.fetch(new Request('https://test.invalid/qr-beacon/stats?days=7', {
    method: 'GET', headers: { Authorization: 'Bearer admin' },
  }), { ...env, FOLLOWERS: kv }, {});
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.days).toBe(7);
  expect(body.stats).toHaveLength(7);
  expect(body.stats[0]).toMatchObject({ date: today, open: 4, menu_ok: 3, 'open:line': 4 });
});

it('owner points summary adds หน้า QR วันนี้ and skip the heading when that day is empty', async () => {
  const history = [{ delta: 8, reason: 'order', at: AT, by: 'owner@shop.com' }];
  const withData = withCollections(harness(), { members: [member({ pointsHistory: history })] });
  await withData.kv.put('qrbeacon:2026-09-10', JSON.stringify({
    open: 100, menu_ok: 80, error_auth: 10, error_menu: 5, error_chunk: 2,
    'error_auth:line': 8, 'error_auth:facebook': 2, 'error_menu:instagram': 5, 'error_chunk:line': 2,
  }));
  const result = await sendPointsSummary({ ...env, FOLLOWERS: withData.kv, TELEGRAM_OWNER_CHAT_ID: '99' }, withData);
  expect(result.text).toContain('หน้า QR วันนี้');
  expect(result.text).toContain('เปิด 100');
  expect(result.text).toContain('เห็นเมนู 80 (80%)');
  expect(result.text).toContain('ล็อกอินไม่สำเร็จ 10');
  expect(result.text).toContain('LINE 59%');
  expect(result.text).toContain('ควรเช็ค');
  expect(result.text).not.toContain('ไม่พบสิ่งผิดปกติ');
  expect(result.text).toContain('เปิดแล้วไม่เห็นเมนู 20%');

  const empty = withCollections(harness(), { members: [member({ pointsHistory: history })] });
  const skipped = await buildPointsReport({ ...env, FOLLOWERS: empty.kv }, empty);
  expect(skipped.text).not.toContain('หน้า QR วันนี้');
  expect(skipped.text).toContain('ไม่พบสิ่งผิดปกติ');
});
