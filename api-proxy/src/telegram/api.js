import { dependencies } from '../firestore.js';
export async function telegramApi(env, method, body, injected) {
  const res = await dependencies(env, injected).fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(`Telegram ${method} failed (${res.status}): ${data.description || ''}`);
  return data.result;
}
export const escapeTelegramHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Telegram รับข้อความได้ไม่เกิน 4096 ตัว · ใบเสร็จ Makro ยาวๆ เกินได้จริง
// ตัดที่ขึ้นบรรทัดเท่านั้น เพราะแท็ก <b> ของ preview เปิดปิดจบในบรรทัดเดียว ตัดกลางบรรทัดแล้ว HTML พัง
export function splitTelegramText(text, max = 4000) {
  const chunks = [];
  let current = '';
  for (const line of String(text).split('\n')) {
    const piece = line.length > max ? line.slice(0, max) : line;
    if (current && current.length + 1 + piece.length > max) { chunks.push(current); current = piece; }
    else current = current ? `${current}\n${piece}` : piece;
  }
  if (current || !chunks.length) chunks.push(current);
  return chunks;
}
export async function replyTelegramExpense(env, chatId, text, keyboard, injected) {
  const chunks = splitTelegramText(text);
  let result;
  // ปุ่มติดกับข้อความก้อนสุดท้าย ผู้ใช้จะอ่านครบทุกรายการก่อนกดยืนยัน
  for (const [i, chunk] of chunks.entries()) {
    const last = i === chunks.length - 1;
    result = await telegramApi(env, 'sendMessage', { chat_id: chatId, text: chunk, parse_mode: 'HTML', ...(last && keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}) }, injected);
  }
  return result;
}
const TG_SHOP_CHAT_KEY = '__telegram_shop_chat';

export async function resolveShopChatId(env, injected) {
  if (dependencies(env, injected).kv) {
    const migrated = await dependencies(env, injected).kv.get(TG_SHOP_CHAT_KEY);
    if (migrated) return migrated;
  }
  return env.TELEGRAM_CHAT_ID;
}

export async function postTelegramMessage(env, chatId, text, injected) {
  const res = await dependencies(env, injected).fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const result = await res.json().catch(() => ({}));
  return { res, result };
}

export async function sendTelegramShopMessage(env, text, injected) {
  const chatId = await resolveShopChatId(env, injected);
  let { res, result } = await postTelegramMessage(env, chatId, text, injected);

  const migratedTo = result?.parameters?.migrate_to_chat_id;
  // จำปลายทางใหม่เมื่อกลุ่มอัปเกรด เพื่อให้แจ้งเตือนครั้งต่อไปยังเข้าร้านได้
  if ((!res.ok || !result.ok) && migratedTo) {
    const newChatId = String(migratedTo);
    if (dependencies(env, injected).kv) await dependencies(env, injected).kv.put(TG_SHOP_CHAT_KEY, newChatId);
    ({ res, result } = await postTelegramMessage(env, newChatId, text, injected));
    if (res.ok && result.ok) return { ok: true, migratedTo: newChatId };
  }

  if (!res.ok || !result.ok) {
    return { ok: false, status: res.status, detail: result.description || 'Unknown Telegram error' };
  }
  return { ok: true };
}

