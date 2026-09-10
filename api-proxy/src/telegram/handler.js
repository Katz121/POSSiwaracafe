import { dependencies, createFirestore } from '../firestore.js';
import { telegramApi, replyTelegramExpense, escapeTelegramHtml as h } from './api.js';
import { MANUAL_FORMATS, parseManualExpenses, parseEdit, parseCallback, inferExpenseCategory } from './parse.js';
import { extractExpenseFromImage } from './ocr.js';
import { PENDING_KEY, validPending, newPending, resolveLines, preview, confirmBatch } from './flow.js';
import { EXPENSE_CATEGORIES } from '../../../src/config/constants.js';

export function constantTimeEqual(a, b) {
  const x = new TextEncoder().encode(a || ''), y = new TextEncoder().encode(b || '');
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
let warned = false;
export function adminSecret(env) {
  if (env.ADMIN_SECRET) return env.ADMIN_SECRET;
  if (!warned) { console.warn('ADMIN_SECRET unset; falling back to NOTIFY_SHARED_SECRET'); warned = true; }
  return env.NOTIFY_SHARED_SECRET;
}
const adminAllowed = (request, env) => { const secret = adminSecret(env); return secret && constantTimeEqual(secret, (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')); };
export async function handleTelegramExpenseSetup(request, env, headers, injected) {
  if (!adminAllowed(request, env)) return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (!env.TELEGRAM_WEBHOOK_SECRET) return Response.json({ error: 'TELEGRAM_WEBHOOK_SECRET not configured' }, { status: 503, headers });
  const webhookUrl = 'https://pos-gemini-proxy.siwatid-99.workers.dev/telegram-expense';
  await telegramApi(env, 'setWebhook', { url: webhookUrl, allowed_updates: ['message', 'callback_query'], secret_token: env.TELEGRAM_WEBHOOK_SECRET }, injected);
  return Response.json({ success: true, webhookUrl }, { headers });
}
export async function handleTelegramExpenseStatus(request, env, headers, injected) {
  if (!adminAllowed(request, env)) return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  const info = await telegramApi(env, 'getWebhookInfo', {}, injected), bot = await telegramApi(env, 'getMe', {}, injected);
  return Response.json({ ok: true, botUsername: bot.username || null, botId: bot.id || null, url: info.url, pendingUpdateCount: info.pending_update_count, lastErrorDate: info.last_error_date || null, lastErrorMessage: info.last_error_message || null, allowedUpdates: info.allowed_updates || null }, { headers });
}
const help = () => `🤖 <b>คำสั่งผู้ช่วยร้าน</b>\n\n${MANUAL_FORMATS}\nส่งรูปใบเสร็จเพื่ออ่านและรอยืนยัน\nแก้ไข ลำดับ ชื่อ จำนวน หน่วย ยอด [บาท]\n\n/ยอดวันนี้\n/เช็คสต็อก [คำค้น]\n/เช็คเมล็ดกาแฟ\n/ยกเลิก`;
export async function listTelegramStock(db, query = '') {
  const items = await db.listAll('stock');
  const q = query.toLocaleLowerCase();
  const filtered = items.filter(item => !q || String(item.name || '').toLocaleLowerCase().includes(q) || String(item.category || '').toLocaleLowerCase().includes(q) || (q.includes('เมล็ดกาแฟ') && inferExpenseCategory(item.name) === 'เมล็ดกาแฟ'));
  const low = query ? filtered : filtered.filter(item => Number(item.quantity) <= Number(item.minQuantity));
  const all = low.length ? low : filtered, shown = all.slice(0, 30);
  if (!shown.length) return query ? `ไม่พบสต็อกที่ตรงกับ “${h(query)}”` : 'ไม่มีรายการสต็อก';
  return `${query ? `📦 <b>สต็อกที่ค้นหา: ${h(query)}</b>` : '📦 <b>สต็อกใกล้หมด</b>'}\n${shown.map(item => `· ${h(item.name)} · ${h(Number(item.quantity) || 0)} ${h(item.unit || 'หน่วย')}${Number(item.quantity) <= Number(item.minQuantity) ? ' ⚠️' : ''}`).join('\n')}${all.length > shown.length ? `\n· และอีก ${all.length - shown.length} รายการ` : ''}`;
}

export async function handleTelegramExpense(request, env, injected) {
  // ตรวจความลับก่อนอ่านภาพหรือส่งข้อความ ป้องกันผู้ปลอม webhook ทำให้เกิดผลข้างเคียง
  if (!env.TELEGRAM_WEBHOOK_SECRET) return new Response('Webhook secret not configured', { status: 503 });
  if (!constantTimeEqual(env.TELEGRAM_WEBHOOK_SECRET, request.headers.get('X-Telegram-Bot-Api-Secret-Token'))) return new Response('Forbidden', { status: 403 });
  const deps = dependencies(env, injected);
  if (!env.TELEGRAM_BOT_TOKEN || !deps.kv) return new Response('Telegram or KV not configured', { status: 503 });
  const update = await request.json().catch(() => null);
  if (!update || !Number.isSafeInteger(update.update_id)) return new Response('Bad request', { status: 400 });
  const ok = () => new Response('OK');
  const updateKey = `__tg_update:${update.update_id}`;
  if (await deps.kv.get(updateKey)) return ok();
  await deps.kv.put(updateKey, '1', { expirationTtl: 86400 });
  const callback = update.callback_query, message = callback?.message || update.message;
  const chatId = String(message?.chat?.id ?? '');
  const migrated = await deps.kv.get('__telegram_shop_chat');
  const allowed = [env.TELEGRAM_CHAT_ID, ...(env.TELEGRAM_ALLOWED_CHAT_IDS || '').split(','), migrated].filter(v => v != null && String(v).trim()).map(v => String(v).trim());
  const reply = (text, keyboard) => replyTelegramExpense(env, chatId, text, keyboard, deps);
  if (!chatId || !allowed.includes(chatId)) {
    if (!callback && /^\/(start|help)(?:@[\w_]+)?(?:\s|$)/i.test(message?.text || '')) await reply(`แชทนี้ยังไม่ได้รับอนุญาต · chat id: ${h(chatId)}`);
    return ok();
  }
  const work = async () => {
    const db = createFirestore(env, deps), key = `${PENDING_KEY}${chatId}`;
    const stored = await deps.kv.get(key, 'json');
    let pending = validPending(stored) ? stored : null;
    const show = async () => {
      resolveLines(pending, await db.listAll('stock'));
      const view = preview(pending, deps.now());
      await deps.kv.put(key, JSON.stringify(pending), { expirationTtl: 3600 });
      await reply(view.text, view.keyboard);
    };
    if (callback) {
      const data = parseCallback(callback.data);
      if (!data || !pending || pending.batchId !== data.batchId) {
        await telegramApi(env, 'answerCallbackQuery', { callback_query_id: callback.id, text: 'รายการนี้หมดอายุแล้ว ส่งใหม่อีกครั้ง' }, deps);
        return;
      }
      await telegramApi(env, 'answerCallbackQuery', { callback_query_id: callback.id }, deps);
      if (data.action === 'x') { await deps.kv.delete(key); await reply('ยกเลิกรายจ่ายแล้ว'); return; }
      if (data.action === 'c') {
        try {
          const summary = await confirmBatch(db, pending, callback.from, deps.now());
          await deps.kv.delete(key);
          await reply(`✅ <b>บันทึกรายจ่ายสำเร็จ</b>\n${h(summary)}`);
        } catch (error) {
          if (error.code !== 'ALREADY_EXISTS') throw error;
          await deps.kv.delete(key);
          await reply('บันทึกไปแล้ว');
        }
        return;
      }
      if (data.action === 'r' && pending.source === 'receipt' && pending.fileId) {
        const receipt = await extractExpenseFromImage(env, pending.fileId, deps);
        pending = { ...pending, ...receipt };
        await show(); return;
      }
      if (data.action === 'e') {
        pending.awaiting = { kind: 'edit', lineIdx: 0 };
        await deps.kv.put(key, JSON.stringify(pending), { expirationTtl: 3600 });
        await reply(`✏️ ใช้: แก้ไข ลำดับ ชื่อ จำนวน หน่วย ยอด [บาท]\n${MANUAL_FORMATS}`); return;
      }
      const first = pending.lines.findIndex(l => l.unresolved);
      const line = pending.lines[data.lineIdx];
      if (!line || first !== data.lineIdx) return;
      if (data.action === 'k' && line.unresolved === 'category' && EXPENSE_CATEGORIES[Number(data.pick)]) line.category = EXPENSE_CATEGORIES[Number(data.pick)];
      else if (data.action === 's' && line.unresolved === 'stock') {
        if (data.pick === 'new' || data.pick === 'skip') line.pick = data.pick;
        else if (line.candidates?.[Number(data.pick)]) line.stockId = line.candidates[Number(data.pick)].id;
        else return;
      } else return;
      await show(); return;
    }
    const text = (message?.text || '').trim();
    if (text.startsWith('/')) {
      const command = text.split(/\s/)[0].replace(/@[\w_]+$/, '').toLocaleLowerCase();
      if (['/start', '/help'].includes(command)) await reply(help());
      else if (['/ยกเลิก', '/cancel'].includes(command)) { await deps.kv.delete(key); await reply('ยกเลิกรายจ่ายแล้ว'); }
      else if (['/ยอดวันนี้', '/เช็คยอด', '/sales', '/summary'].includes(command)) {
        const report = await deps.buildDailyReport(env, deps);
        await reply(h(report.text));
      } else if (['/เช็คสต็อก', '/เช็คสต๊อก', '/stock', '/เช็คเมล็ดกาแฟ', '/coffee'].includes(command)) await reply(await listTelegramStock(db, ['/coffee', '/เช็คเมล็ดกาแฟ'].includes(command) ? 'เมล็ดกาแฟ' : text.split(/\s+/).slice(1).join(' ')));
      else await reply('ไม่รู้จักคำสั่งนี้\nพิมพ์ /help เพื่อดูคำสั่งทั้งหมด');
      return;
    }
    // ส่งรูปใหม่หรือพิมพ์ "รายจ่าย" ระหว่างที่บอทรอคำตอบ = เริ่มบิลใหม่ ไม่ใช่คำตอบ
    // ไม่งั้นผู้ใช้ติดวนอยู่กับคำถามเดิมจนกว่าจะรู้ว่าต้องพิมพ์ /ยกเลิก
    const photoId = message?.photo?.at(-1)?.file_id || (message?.document?.mime_type?.startsWith('image/') ? message.document.file_id : null);
    const startsNew = Boolean(photoId) || /^รายจ่าย(?:\s|$)/.test(text);
    if (pending?.awaiting?.kind === 'factor' && !startsNew) {
      const factor = /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN;
      const line = pending.lines[pending.awaiting.lineIdx];
      if (!Number.isFinite(factor) || factor <= 0 || !Number.isFinite(factor * line.quantity)) { await reply('ตอบอัตราแปลงเป็นตัวเลขมากกว่า 0'); return; }
      line.alias = { title: line.title, ...(line.barcode ? { barcode: line.barcode } : {}), unit: line.unit, toBase: factor };
      line.rememberAlias = true;
      await show(); return;
    }
    if (pending && !startsNew && (pending.awaiting?.kind === 'edit' || /^แก้ไข\s/.test(text))) {
      const edit = parseEdit(text, pending.lines.length);
      if (!edit) { await reply(`รูปแบบแก้ไขไม่ถูกต้อง\nแก้ไข ลำดับ รายการ\n${MANUAL_FORMATS}`); return; }
      pending.lines[edit.lineIdx] = edit.line;
      await show(); return;
    }
    const fileId = photoId;
    if (fileId) {
      await reply('🧾 รับรูปแล้ว กำลังอ่านใบเสร็จ');
      const receipt = await extractExpenseFromImage(env, fileId, deps);
      pending = newPending(receipt.lines, 'receipt', { ...receipt, fileId });
    } else {
      const lines = parseManualExpenses(text);
      if (!lines) { await reply(`รูปแบบไม่ถูกต้อง\n${MANUAL_FORMATS}`); return; }
      pending = newPending(lines);
    }
    await show();
  };
  const guarded = () => work().catch(error => reply(`ดำเนินการไม่สำเร็จ: ${h(error.message)}\nลองใหม่อีกครั้ง`));
  const image = message?.photo?.length || message?.document?.mime_type?.startsWith('image/');
  if (image && !callback && deps.ctx) deps.ctx.waitUntil(guarded());
  else await guarded();
  return ok();
}
