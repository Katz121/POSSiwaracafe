import { it, expect, vi, afterEach } from 'vitest';
import worker, { sendPointsSummary } from '../worker.js';
import { buildPointsSummary, maskPhone } from '../src/pointsSummary.js';
import { handleTelegramExpense } from '../src/telegram/handler.js';
import { encodeFields } from '../src/firestore.js';
import { env, harness, request, message, NOW } from './helpers.js';

afterEach(() => vi.unstubAllGlobals());

const sent = deps => deps.calls.filter(c => c.url.endsWith('/sendMessage')).map(c => c.body);
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
        documents: members.map(m => {
          const { id, ...fields } = m;
          return {
            name: `projects/siwarapos/databases/(default)/documents/artifacts/siwara-pos-v1/public/data/members/${id}`,
            fields: encodeFields(fields),
          };
        }),
      });
    }
    if (String(url).endsWith(':runQuery')) {
      return Response.json(orders.map(o => {
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

async function flushScheduled(envConfig) {
  const jobs = [];
  await worker.scheduled({}, envConfig, { waitUntil: p => jobs.push(p) });
  await Promise.all(jobs);
  return jobs;
}

it('masks the middle four digits of a Thai mobile number', () => {
  expect(maskPhone('0981234629')).toBe('098xxxx629');
});

it('flags six duplicate approvals in one second under ควรเช็ค', () => {
  const history = Array.from({ length: 6 }, () => ({
    delta: 40, reason: 'order', at: AT, by: 'staff@shop.com',
  }));
  const { text, flags, manualPoints } = buildPointsSummary([member({ points: 240, pointsHistory: history })], [], NOW);
  expect(manualPoints).toBe(240);
  expect(text).toContain('ควรเช็ค');
  expect(text).not.toContain('ไม่พบสิ่งผิดปกติ');
  expect(text).toContain('อนุมัติซ้ำ');
  expect(text).toContain('6 ครั้ง');
  expect(text).toContain('098xxxx629');
  expect(text).toContain('สมชาย');
  expect(flags.some(f => f.includes('อนุมัติซ้ำ'))).toBe(true);
});

it('shows ไม่ระบุ when by is missing and ไม่พบสิ่งผิดปกติ when clean', () => {
  const dirty = buildPointsSummary([member({
    pointsHistory: [{ delta: 10, reason: 'manual', at: AT }],
  })], [], NOW);
  expect(dirty.text).toContain('ไม่ระบุ');
  expect(dirty.text).toContain('แก้มือ');

  const clean = buildPointsSummary([member({
    pointsHistory: [{ delta: 8, reason: 'order', at: AT, by: 'owner@shop.com' }],
  })], [], NOW);
  expect(clean.text).toContain('ไม่พบสิ่งผิดปกติ');
  expect(clean.text).toContain('อนุมัติมือ 8 แต้ม');
});

it('splits manual approve, auto-qr, redeem and expire, and counts pending', () => {
  const m = member({
    pendingPoints: 15,
    pendingOrderIds: ['o1'],
    pointsHistory: [
      { delta: 20, reason: 'order', at: AT, by: 'staff@shop.com' },
      { delta: 12, reason: 'review', at: AT, by: 'staff@shop.com' },
      { delta: 30, reason: 'order', at: AT, by: 'system:auto-qr' },
      { delta: -50, reason: 'redeem', at: AT, by: 'system:checkout' },
      { delta: -50, reason: 'redeem', at: AT, by: 'staff@shop.com' },
      { delta: -7, reason: 'expire', at: AT, by: 'system:expire' },
    ],
  });
  const r = buildPointsSummary([m, member({ id: '0811111111', phone: '0811111111', name: 'มานี', pendingPoints: 5 })], [], NOW);
  expect(r.manualPoints).toBe(32);
  expect(r.autoQrPoints).toBe(30);
  expect(r.redeemCount).toBe(2);
  expect(r.redeemPoints).toBe(100);
  expect(r.expirePoints).toBe(7);
  expect(r.pendingPeople).toBe(2);
  expect(r.pendingPoints).toBe(20);
  expect(r.text).toContain('อัตโนมัติ QR 30 แต้ม');
  expect(r.text).toContain('แลก 2 ครั้ง / 100 แต้ม');
  expect(r.text).toContain('2 คน · 20 แต้ม');
});

it('lists top 3 earners and bill-edit / deleted-bill / high-earn / clustered bills / POS spike', () => {
  const clustered = ['a', 'b', 'c'].map((id, i) => ({
    id, memberPhone: '0981234629', total: 100, source: 'pos', date: '2026-09-10',
    createdAt: new Date(NOW - (9 - i * 3) * 60_000).toISOString(),
  }));
  const spike = { id: 'spike', memberPhone: '0981234629', total: 3000, source: 'pos', date: '2026-09-10', queueNumber: 12, createdAt: AT };
  const qrSmall = { id: 'qr1', memberPhone: '0812345678', total: 100, source: 'qr', date: '2026-09-10', createdAt: AT };
  const others = [
    { id: 'p1', memberPhone: '0812345678', total: 100, date: '2026-09-10', createdAt: AT },
    { id: 'p2', total: 100, date: '2026-09-10', createdAt: AT },
  ];
  const members = [
    member({
      pointsHistory: [
        { delta: 120, reason: 'order', at: AT, by: 'staff@shop.com' },
        { delta: -20, reason: 'manual', at: AT, by: 'owner@shop.com', orderId: 'gone' },
        { delta: -8, reason: 'bill-edit', at: AT, by: 'owner@shop.com', orderId: 'spike' },
      ],
      pendingOrderIds: ['unlinked'],
    }),
    member({ id: '0812345678', phone: '0812345678', name: 'มานี', pointsHistory: [{ delta: 40, reason: 'order', at: AT, by: 'system:auto-qr' }] }),
    member({ id: '0901111111', phone: '0901111111', name: 'ปิติ', pointsHistory: [{ delta: 12, reason: 'recalc', at: AT, by: 'staff@shop.com' }] }),
  ];
  const orders = [...clustered, spike, qrSmall, ...others, { id: 'unlinked', memberPhone: '', total: 50, date: '2026-09-10', createdAt: AT }];
  const r = buildPointsSummary(members, orders, NOW);
  expect(r.text).toMatch(/1\. สมชาย 098xxxx629 · 120 แต้ม/);
  expect(r.text).toContain('ได้แต้มเกิน 100');
  expect(r.text).toContain('ลบบิล');
  expect(r.text).toContain('แก้มือ owner@shop.com');
  expect(r.text).toContain('ถอดสมาชิกจากบิล');
  expect(r.text).toContain('บิลถี่');
  expect(r.text).toContain('บิล POS สูงผิดปกติ #12');
  expect(r.text).not.toContain('ไม่พบสิ่งผิดปกติ');
});

it('skips sending when TELEGRAM_OWNER_CHAT_ID is unset', async () => {
  const deps = harness();
  vi.stubGlobal('fetch', deps.fetch);
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const result = await sendPointsSummary({ ...env, FOLLOWERS: deps.kv }, deps);
  expect(result).toEqual({ skipped: true, reason: 'TELEGRAM_OWNER_CHAT_ID not set' });
  expect(sent(deps)).toHaveLength(0);
  expect(log.mock.calls.some(c => String(c[0]).includes('TELEGRAM_OWNER_CHAT_ID'))).toBe(true);
  log.mockRestore();
});

it('sends the points summary to the owner chat, never the shop group', async () => {
  const history = Array.from({ length: 6 }, () => ({ delta: 40, reason: 'order', at: AT, by: 'staff@shop.com' }));
  const deps = withCollections(harness(), { members: [member({ pointsHistory: history })] });
  const result = await sendPointsSummary({ ...env, FOLLOWERS: deps.kv, TELEGRAM_OWNER_CHAT_ID: '99' }, deps);
  expect(result.sent).toBe(true);
  expect(result.channel).toBe('telegram-owner');
  expect(result.text).toContain('อนุมัติซ้ำ');
  const msgs = sent(deps);
  expect(msgs.length).toBeGreaterThan(0);
  expect(msgs.every(s => String(s.chat_id) === '99')).toBe(true);
  expect(msgs.some(s => String(s.chat_id) === '42')).toBe(false);
});

it('scheduled skip without owner id does not send to the shop group, and both jobs are independent', async () => {
  const deps = harness();
  vi.stubGlobal('fetch', deps.fetch);
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const jobs = await flushScheduled({ ...env, FOLLOWERS: deps.kv });
  expect(jobs).toHaveLength(2);
  expect(sent(deps).some(s => String(s.text || '').includes('สรุปแต้ม'))).toBe(false);
  expect(log.mock.calls.some(c => String(c[0]).includes('TELEGRAM_OWNER_CHAT_ID'))).toBe(true);
  log.mockRestore();
});

it('/myid replies with chat id even when the chat is not allowed', async () => {
  const deps = harness();
  await handleTelegramExpense(request(message('/myid', 1, 99)), env, deps);
  expect(sent(deps).map(s => s.text)).toEqual(['99\nส่งเลขนี้ให้ผู้ดูแลเพื่อเปิดรับรายงานแต้ม']);
});

it('/myid@bot works in a private unauthorized chat and other commands stay rejected', async () => {
  const deps = harness();
  await handleTelegramExpense(request(message('/myid@SiwaraBot', 1, 77)), env, deps);
  await handleTelegramExpense(request(message('/ยอดวันนี้', 2, 77)), env, deps);
  expect(sent(deps).map(s => s.text)).toEqual(['77\nส่งเลขนี้ให้ผู้ดูแลเพื่อเปิดรับรายงานแต้ม']);
});

it('POST /points-report?dry=1 returns text without sending', async () => {
  const history = Array.from({ length: 6 }, () => ({ delta: 40, reason: 'order', at: new Date().toISOString(), by: 'staff@shop.com' }));
  const deps = withCollections(harness(), { members: [member({ pointsHistory: history })] });
  vi.stubGlobal('fetch', deps.fetch);
  const req = (route, secret) => new Request(`https://test.invalid/${route}`, {
    method: 'POST', headers: { Authorization: `Bearer ${secret}` }, body: '{}',
  });
  const denied = await worker.fetch(req('points-report?dry=1', 'notify'), { ...env, FOLLOWERS: deps.kv }, {});
  expect(denied.status).toBe(401);
  const res = await worker.fetch(req('points-report?dry=1', 'admin'), { ...env, FOLLOWERS: deps.kv }, {});
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.dryRun).toBe(true);
  expect(body.text).toContain('ควรเช็ค');
  expect(sent(deps)).toHaveLength(0);
});

it('splits a long owner report with splitTelegramText and still never uses the shop group', async () => {
  const members = Array.from({ length: 80 }, (_, i) => member({
    id: `08${String(i).padStart(8, '0')}`,
    phone: `08${String(i).padStart(8, '0')}`,
    name: `ลูกค้าทดสอบชื่อยาวพอสมควรคนที่ ${i}`,
    pointsHistory: [{ delta: 3, reason: 'manual', at: AT, by: `staff${i}@shop.com` }],
  }));
  const deps = withCollections(harness(), { members });
  const result = await sendPointsSummary({ ...env, FOLLOWERS: deps.kv, TELEGRAM_OWNER_CHAT_ID: '99' }, deps);
  expect(result.text.length).toBeGreaterThan(4000);
  const msgs = sent(deps);
  expect(msgs.length).toBeGreaterThan(1);
  expect(msgs.every(s => String(s.chat_id) === '99' && s.text.length <= 4000)).toBe(true);
});
