import { it, expect, vi } from 'vitest';
import { extractExpenseFromImage, OCR_MODEL } from '../src/telegram/ocr.js';
import { env, harness, request, message, callback } from './helpers.js';
import { handleTelegramExpense } from '../src/telegram/handler.js';
const response = obj => Response.json({ candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] } }] });
it('normalizes tolerant receipt fields and asks for JSON metadata', async () => {
  const fetch = vi.fn(async () => response({ receiptDate: '2026-09-09', vendor: 'shop', total: '1,000', products: [{ product_name: 'นม', qty: '2', unit: 'ขวด', unit_price: '500', code: '885-123' }] }));
  const result = await extractExpenseFromImage(env, null, { fetch }, 'image');
  expect(result).toMatchObject({ receiptDate: '2026-09-09', vendor: 'shop', total: 1000, lines: [{ title: 'นม', quantity: 2, amount: 1000, barcode: '885123' }] });
  expect(fetch.mock.calls[0][0]).toContain(OCR_MODEL);
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.generationConfig.responseMimeType).toBe('application/json');
  expect(body.contents[0].parts[0].text).toContain('receiptDate');
});
it.each(['not JSON', { items: [] }])('automatically retries malformed/empty result once: %j', async first => {
  const fetch = vi.fn().mockResolvedValueOnce(response(first)).mockResolvedValueOnce(response({ items: [{ name: 'ค่าไฟ', amount: 400 }] }));
  expect((await extractExpenseFromImage(env, null, { fetch }, 'image')).lines[0].category).toBe('ค่าไฟ');
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('stops automatic retry after second failure', async () => {
  const fetch = vi.fn(async () => response({ items: [] }));
  await expect(extractExpenseFromImage(env, null, { fetch }, 'image')).rejects.toThrow('ไม่พบรายการ');
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('photo capture and manual recheck preserve batch and receipt metadata', async () => {
  const deps = harness(), fallback = deps.fetch;
  deps.fetch = vi.fn(async (url, options) => {
    if (url.endsWith('/getFile')) return Response.json({ ok: true, result: { file_path: 'receipt.png' } });
    if (url.includes('/file/bot')) return new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/png' } });
    if (url.includes('generativelanguage')) return response({ receiptDate: '2026-09-09', total: 500, items: [{ name: 'ค่าไฟ', amount: 400 }] });
    return fallback(url, options);
  });
  await handleTelegramExpense(request({ ...message(''), message: { chat: { id: 42 }, photo: [{ file_id: 'photo' }] } }), env, deps);
  const before = await deps.kv.get('__expense_pending:42', 'json');
  expect(before).toMatchObject({ fileId: 'photo', source: 'receipt', receiptDate: '2026-09-09' });
  await handleTelegramExpense(request(callback(`r:${before.batchId}`, 2)), env, deps);
  const after = await deps.kv.get('__expense_pending:42', 'json');
  expect(after.batchId).toBe(before.batchId);
  expect(deps.fetch.mock.calls.filter(([url]) => url.includes('generativelanguage'))).toHaveLength(2);
});
it('escapes OCR errors in HTML replies', async () => {
  const deps = harness(), fallback = deps.fetch;
  deps.fetch = vi.fn(async (url, options) => {
    if (url.endsWith('/getFile')) throw new Error('<malicious>&');
    return fallback(url, options);
  });
  await handleTelegramExpense(request({ ...message(''), message: { chat: { id: 42 }, photo: [{ file_id: 'photo' }] } }), env, deps);
  expect(deps.calls.at(-1).body.text).toContain('&lt;malicious&gt;&amp;');
});
