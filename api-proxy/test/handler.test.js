import { it, expect, vi, afterEach } from 'vitest';
import worker from '../worker.js';
import { handleTelegramExpense, handleTelegramExpenseSetup, handleTelegramExpenseStatus, adminSecret } from '../src/telegram/handler.js';
import { sendTelegramShopMessage } from '../src/telegram/api.js';
import { env, harness, request, message, callback } from './helpers.js';
afterEach(() => vi.unstubAllGlobals());
const sent = deps => deps.calls.filter(c => c.url.endsWith('/sendMessage')).map(c => c.body);
it('admin fallback warns only once', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(adminSecret({ NOTIFY_SHARED_SECRET: 'legacy' })).toBe('legacy');
  expect(adminSecret({ NOTIFY_SHARED_SECRET: 'legacy' })).toBe('legacy');
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});
it('shop notification preserves migration retry and KV destination', async () => {
  const deps = harness();
  deps.fetch = vi.fn().mockResolvedValueOnce(Response.json({ ok: false, parameters: { migrate_to_chat_id: -10042 } }, { status: 400 })).mockResolvedValueOnce(Response.json({ ok: true }));
  expect(await sendTelegramShopMessage(env, 'order', deps)).toEqual({ ok: true, migratedTo: '-10042' });
  expect(await deps.kv.get('__telegram_shop_chat')).toBe('-10042');
  expect(JSON.parse(deps.fetch.mock.calls[1][1].body)).toEqual({ chat_id: '-10042', text: 'order' });
});
it.each(['new', 'skip', '0'])('stock pick %s resolves first line', async pick => {
  const deps = harness([{ id: 'milk', name: 'นมจืด', unit: 'กรัม', quantity: 100, unitCost: 1 }]);
  await handleTelegramExpense(request(message('รายจ่าย นม 100 กรัม 100')), env, deps);
  let p = await deps.kv.get('__expense_pending:42', 'json');
  expect(p.lines[0].unresolved).toBe('stock');
  await handleTelegramExpense(request(callback(`s:${p.batchId}:0:${pick}`)), env, deps);
  p = await deps.kv.get('__expense_pending:42', 'json');
  expect(p.lines[0].unresolved).toBeUndefined();
  expect(sent(deps).at(-1).reply_markup.inline_keyboard.flat().some(b => b.callback_data.startsWith('c:'))).toBe(true);
});
it('failed commit retains pending and does not claim success', async () => {
  const deps = harness();
  await handleTelegramExpense(request(message('รายจ่าย ค่าไฟ 400')), env, deps);
  const p = await deps.kv.get('__expense_pending:42', 'json'); deps.state.commitError = 'PERMISSION_DENIED';
  await handleTelegramExpense(request(callback(`c:${p.batchId}`)), env, deps);
  expect(await deps.kv.get('__expense_pending:42', 'json')).toEqual(p);
  expect(sent(deps).at(-1).text).toContain('ดำเนินการไม่สำเร็จ');
});
it.each([null, 'bad'])('rejects webhook secret %s before side effects', async secret => {
  const deps = harness();
  expect((await handleTelegramExpense(request(message('/start'), secret), env, deps)).status).toBe(403);
  expect(deps.fetch).not.toHaveBeenCalled(); expect(deps.kv.put).not.toHaveBeenCalled();
});
it('missing webhook secret returns 503', async () => expect((await handleTelegramExpense(request(message('/start')), { ...env, TELEGRAM_WEBHOOK_SECRET: '' }, harness())).status).toBe(503));
it('accepts secret, dedupes before reply, uses exact TTL', async () => {
  const deps = harness();
  await handleTelegramExpense(request(message('/start')), env, deps);
  await handleTelegramExpense(request(message('/start')), env, deps);
  expect(sent(deps)).toHaveLength(1);
  expect(deps.kv.ttls.get('__tg_update:1')).toBe(86400);
});
it('unauthorized help only exposes own chat id and never enrolls', async () => {
  const deps = harness(); await deps.kv.put('__telegram_owner_chat', '99');
  await handleTelegramExpense(request(message('/start', 1, 99)), env, deps);
  await handleTelegramExpense(request(message('/ยอดวันนี้', 2, 99)), env, deps);
  expect(sent(deps).map(s => s.text)).toEqual(['แชทนี้ยังไม่ได้รับอนุญาต · chat id: 99']);
  expect(deps.kv.get.mock.calls.some(([key]) => key === '__telegram_owner_chat')).toBe(false);
});
it.each(['allowed', 'migrated'])('authorizes %s chat', async kind => {
  const deps = harness();
  if (kind === 'migrated') await deps.kv.put('__telegram_shop_chat', '99');
  await handleTelegramExpense(request(message('/help', 1, 99)), { ...env, TELEGRAM_ALLOWED_CHAT_IDS: kind === 'allowed' ? ' 98, 99 ' : '' }, deps);
  expect(sent(deps)[0].text).toContain('คำสั่งผู้ช่วยร้าน');
});
it.each([null, { v: 1, expenses: [] }, { v: 2, batchId: 'other123', lines: [{}] }])('expires stale callback %j', async pending => {
  const deps = harness(); if (pending) await deps.kv.put('__expense_pending:42', JSON.stringify(pending));
  await handleTelegramExpense(request(callback('c:abc12345')), env, deps);
  expect(deps.calls[0].body.text).toBe('รายการนี้หมดอายุแล้ว ส่งใหม่อีกครั้ง');
  expect(deps.commits).toHaveLength(0);
});
it('manual category pick, preview, confirm and ALREADY_EXISTS re-confirm', async () => {
  const deps = harness();
  await handleTelegramExpense(request(message('รายจ่าย ไม่รู้จัก 400')), env, deps);
  let p = await deps.kv.get('__expense_pending:42', 'json');
  expect(p.v).toBe(2); expect(p.batchId).toMatch(/^[a-z0-9]{8}$/); expect(deps.kv.ttls.get('__expense_pending:42')).toBe(3600);
  const pick = sent(deps).at(-1).reply_markup.inline_keyboard.flat().find(b => b.text === 'ค่าไฟ');
  await handleTelegramExpense(request(callback(pick.callback_data, 2)), env, deps);
  p = await deps.kv.get('__expense_pending:42', 'json');
  await handleTelegramExpense(request(callback(`c:${p.batchId}`, 3)), env, deps);
  expect(deps.commits).toHaveLength(1); expect(await deps.kv.get('__expense_pending:42')).toBeNull();
  await deps.kv.put('__expense_pending:42', JSON.stringify(p)); deps.state.commitError = 'ALREADY_EXISTS';
  await handleTelegramExpense(request(callback(`c:${p.batchId}`, 4)), env, deps);
  expect(sent(deps).at(-1).text).toBe('บันทึกไปแล้ว');
  expect(await deps.kv.get('__expense_pending:42')).toBeNull();
  expect(deps.commits).toHaveLength(2);
});
it('factor answer remembers alias and edit clears old stock resolution', async () => {
  const deps = harness([{ id: 'milk', name: 'นม', unit: 'กรัม', quantity: 100, unitCost: 1 }]);
  await handleTelegramExpense(request(message('รายจ่าย นม 1 ขวด 100')), env, deps);
  await handleTelegramExpense(request(message('1000', 2)), env, deps);
  let p = await deps.kv.get('__expense_pending:42', 'json');
  expect(p.lines[0]).toMatchObject({ rememberAlias: true, alias: { toBase: 1000 } });
  await handleTelegramExpense(request(callback(`e:${p.batchId}`, 3)), env, deps);
  await handleTelegramExpense(request(message('แก้ไข 1 ค่าไฟ 400', 4)), env, deps);
  p = await deps.kv.get('__expense_pending:42', 'json');
  expect(p.lines[0].stockId).toBeUndefined(); expect(p.lines[0].category).toBe('ค่าไฟ');
});
it('a new รายจ่าย while waiting for a factor starts a new bill instead of being rejected', async () => {
  const deps = harness([{ id: 'milk', name: 'นม', unit: 'กรัม', quantity: 100, unitCost: 1 }]);
  await handleTelegramExpense(request(message('รายจ่าย นม 1 ขวด 100')), env, deps);
  const before = await deps.kv.get('__expense_pending:42', 'json');
  expect(before.awaiting?.kind).toBe('factor');
  await handleTelegramExpense(request(message('รายจ่าย ค่าไฟ 400', 2)), env, deps);
  const after = await deps.kv.get('__expense_pending:42', 'json');
  expect(after.batchId).not.toBe(before.batchId);
  expect(after.lines[0].category).toBe('ค่าไฟ');
});
it('long previews are split at line breaks with the keyboard on the last chunk', async () => {
  const { splitTelegramText, replyTelegramExpense } = await import('../src/telegram/api.js');
  const text = Array.from({ length: 120 }, (_, i) => `<b>${i + 1}. รายการสินค้าทดสอบยาวพอสมควร</b> · ฿100`).join('\n');
  const chunks = splitTelegramText(text);
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.every(c => c.length <= 4000)).toBe(true);
  expect(chunks.join('\n')).toBe(text);
  const deps = harness();
  await replyTelegramExpense(env, '42', text, [[{ text: 'ok', callback_data: 'x' }]], deps);
  const bodies = sent(deps);
  expect(bodies).toHaveLength(chunks.length);
  expect(bodies.slice(0, -1).every(b => !b.reply_markup)).toBe(true);
  expect(bodies.at(-1).reply_markup).toBeDefined();
});
it('admin setup uses ADMIN_SECRET and sends secret_token', async () => {
  const deps = harness();
  const req = secret => new Request('https://test.invalid', { method: 'POST', headers: { Authorization: `Bearer ${secret}` } });
  expect((await handleTelegramExpenseSetup(req('notify'), env, {}, deps)).status).toBe(401);
  expect((await handleTelegramExpenseSetup(req('admin'), env, {}, deps)).status).toBe(200);
  expect(deps.calls[0].body.secret_token).toBe('webhook');
  expect((await handleTelegramExpenseStatus(req('notify'), env, {}, deps)).status).toBe(401);
});
it('worker rejects forged photo before any reply and report uses admin while notify stays unchanged', async () => {
  const deps = harness(); vi.stubGlobal('fetch', deps.fetch);
  const config = { ...env, FOLLOWERS: deps.kv };
  expect((await worker.fetch(request({ ...message(''), message: { chat: { id: 42 }, photo: [{ file_id: 'x' }] } }, 'bad'), config, {})).status).toBe(403);
  expect(deps.fetch).not.toHaveBeenCalled();
  const req = (route, secret, body = {}) => new Request(`https://test.invalid/${route}`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, body: JSON.stringify(body) });
  expect((await worker.fetch(req('report', 'notify'), config, {})).status).toBe(401);
  expect((await worker.fetch(req('notify', 'admin'), config, {})).status).toBe(401);
  expect((await worker.fetch(req('notify', 'notify'), config, {})).status).toBe(200);
  expect(sent(deps).at(-1).parse_mode).toBeUndefined();
  expect((await worker.fetch(req('report', 'admin', { dryRun: true }), config, {})).status).toBe(200);
});
it('a title that is an existing stock item takes that stock category instead of asking', async () => {
  const deps = harness([{ id: 'bb', name: 'บลูเบอรี่', category: 'ผลไม้และของสด', unit: 'กรัม', quantity: 719, unitCost: 0.73 }]);
  await handleTelegramExpense(request(message('รายจ่าย บลูเบอรี่ 1 กก. 50')), env, deps);
  const p = await deps.kv.get('__expense_pending:42', 'json');
  expect(p.lines[0]).toMatchObject({ category: 'ผลไม้และของสด', stockId: 'bb' });
  expect(p.lines[0].unresolved).toBeUndefined();
  expect(p.lines[0].plan).toMatchObject({ inQty: 1000, stockUnit: 'กรัม' });
});
