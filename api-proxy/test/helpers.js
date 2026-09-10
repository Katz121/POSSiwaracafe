import { vi } from 'vitest';
import { encodeFields } from '../src/firestore.js';
export const NOW = Date.parse('2026-09-10T05:00:00Z');
export const env = { TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: '42', TELEGRAM_WEBHOOK_SECRET: 'webhook', ADMIN_SECRET: 'admin', NOTIFY_SHARED_SECRET: 'notify', BOT_EMAIL: 'test@example.invalid', BOT_PASSWORD: 'test-password', FIREBASE_API_KEY: 'test-key' };
export function memoryKV() {
  const data = new Map(), ttls = new Map();
  return { data, ttls, get: vi.fn(async (key, type) => { const value = data.get(key); return value == null ? null : type === 'json' ? JSON.parse(value) : value; }), put: vi.fn(async (key, value, options) => { data.set(key, value); ttls.set(key, options?.expirationTtl); }), delete: vi.fn(async key => data.delete(key)) };
}
export function harness(stocks = []) {
  const kv = memoryKV(), calls = [], commits = [];
  const state = { commitError: null, aborts: 0 };
  const fetch = vi.fn(async (url, options = {}) => {
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    calls.push({ url, body, options });
    if (url.includes('identitytoolkit')) return Response.json({ idToken: 'id-token', refreshToken: 'refresh' });
    if (url.includes('securetoken')) return Response.json({ id_token: 'id-token', refresh_token: 'refresh' });
    if (url.includes('api.telegram.org')) return Response.json({ ok: true, result: {} });
    if (url.includes('/stock?')) return Response.json({ documents: stocks.map(s => ({ name: `projects/siwarapos/databases/(default)/documents/artifacts/siwara-pos-v1/public/data/stock/${s.id}`, fields: encodeFields(s) })) });
    if (url.endsWith(':beginTransaction')) return Response.json({ transaction: 'tx-test' });
    if (url.endsWith(':batchGet')) return Response.json(body.documents.map(name => { const s = stocks.find(s => name.endsWith(`/stock/${s.id}`)); return s ? { found: { name, fields: encodeFields(s) } } : { missing: name }; }));
    if (url.endsWith(':commit')) {
      commits.push(body);
      if (state.aborts-- > 0) return Response.json({ error: { status: 'ABORTED' } }, { status: 409 });
      if (state.commitError) return Response.json({ error: { status: state.commitError } }, { status: 409 });
      return Response.json({ writeResults: [] });
    }
    if (url.endsWith(':rollback')) return Response.json({});
    if (url.endsWith(':runQuery')) return Response.json([]);
    throw new Error(`Unmocked request: ${url}`);
  });
  return { kv, fetch, now: () => NOW, calls, commits, state };
}
export const request = (update, secret = 'webhook') => new Request('https://test.invalid/telegram-expense', { method: 'POST', headers: secret === null ? {} : { 'X-Telegram-Bot-Api-Secret-Token': secret }, body: JSON.stringify(update) });
export const message = (text, id = 1, chat = 42) => ({ update_id: id, message: { chat: { id: chat }, text, from: { id: 7, first_name: 'Staff' } } });
export const callback = (data, id = 2) => ({ update_id: id, callback_query: { id: `cb${id}`, data, from: { id: 7, first_name: 'Staff' }, message: { chat: { id: 42 } } } });
