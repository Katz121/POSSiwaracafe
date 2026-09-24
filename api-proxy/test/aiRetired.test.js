import { expect, test, vi } from 'vitest';
import worker from '../worker.js';

// AI ย้ายไป Muse (คิว Firestore) · POST / ต้องตอบ 410 และไม่ยิง Gemini อีก
test('POST / (old Gemini proxy) returns 410 without calling Gemini', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const res = await worker.fetch(new Request('https://w.example/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({ prompt: 'hi' }),
  }), { GEMINI_API_KEY: 'k' }, {});
  expect(res.status).toBe(410);
  expect(await res.json()).toEqual({ error: 'AI ย้ายไปใช้ Muse แล้ว' });
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});
