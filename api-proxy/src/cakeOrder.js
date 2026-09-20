/**
 * cakeOrder — ออเดอร์เค้กจากเว็บ siwaracafe.com/cake ที่ส่งต่อเข้าแชท LINE
 *
 * ทำไมต้องมี: deep link ของ LINE ส่งได้แต่ข้อความล้วน แนบรูปไม่ได้ ร้านเลยเห็นแต่ตัวหนังสือ
 * ว่าลูกค้าเลือกลายไหน ทางออกคือเว็บฝากออเดอร์ไว้ที่นี่ แล้วได้โค้ดสั้น ๆ ติดท้ายข้อความ
 * พอลูกค้ากดส่ง webhook เจอโค้ดก็ตอบกลับเป็น "รูปลายที่เลือก + สรุปออเดอร์" ในห้องแชทเดียวกัน
 *
 * ทำไมใช้ reply ไม่ใช่ push: reply ไม่นับโควตา 300 ข้อความ/เดือนของแพ็กฟรี
 *
 * ความปลอดภัย: รับเฉพาะรูปของเว็บร้านเอง (cakes/v2/cNN.jpg) ไม่รับ URL จากผู้ใช้
 * ฟิลด์ทุกตัวถูกตัดความยาว และโค้ดสุ่มจากตัวอักษรที่อ่านผิดยาก
 */

export const CAKE_ORDER_PREFIX = 'order:';
export const CAKE_ORDER_TTL_SEC = 7 * 24 * 60 * 60;   // 7 วัน · เลยวันรับไปแล้วไม่มีประโยชน์
export const CAKE_ORDER_MAX_BODY = 4000;
export const CAKE_ORDER_RATE_LIMIT = 12;              // ต่อ IP ต่อนาที
export const CAKE_ORDER_RATE_WINDOW_MS = 60_000;
export const CAKE_SITE = 'https://siwaracafe.com';

/** ตัด I O U 0 1 ออก · อ่านจากจอแล้วพิมพ์ตามไม่ผิด */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CAKE_CODE_RE = /SW-?([23456789ABCDEFGHJKMNPQRSTVWXYZ]{4})/i;

/** path รูปที่ยอมรับ · ต้องเป็นไฟล์ในเว็บร้านเท่านั้น */
const IMG_RE = /^cakes\/v2\/c\d{2}\.jpg$/;

export const cakeOrderHits = new Map();

export function resetCakeOrderHits() {
  cakeOrderHits.clear();
}

export function allowCakeOrder(ip, now = Date.now()) {
  const key = ip || 'unknown';
  const hits = (cakeOrderHits.get(key) || []).filter((t) => now - t < CAKE_ORDER_RATE_WINDOW_MS);
  if (hits.length >= CAKE_ORDER_RATE_LIMIT) {
    cakeOrderHits.set(key, hits);
    return false;
  }
  hits.push(now);
  cakeOrderHits.set(key, hits);
  return true;
}

export function makeCakeCode(randomValues) {
  const bytes = new Uint8Array(4);
  if (randomValues) randomValues(bytes);
  else crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `SW-${out}`;
}

export function cakeOrderKey(code) {
  return `${CAKE_ORDER_PREFIX}${String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
}

/** ดึงโค้ดออกจากข้อความลูกค้า · คืน "SW-XXXX" หรือ null */
export function extractCakeCode(text) {
  const m = CAKE_CODE_RE.exec(String(text || ''));
  return m ? `SW-${m[1].toUpperCase()}` : null;
}

const str = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * รับ body จากเว็บ แล้วคืนเฉพาะฟิลด์ที่เก็บได้ · คืน null ถ้าข้อมูลใช้ไม่ได้
 * ไม่เก็บที่อยู่เต็มและไม่เก็บอะไรที่ไม่ได้ใช้ตอบกลับ
 */
export function sanitizeCakeOrder(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const design = str(body.design, 40);
  const img = str(body.img, 60);
  const order = {
    design,
    designName: str(body.designName, 80),
    // รูปต้องเป็นไฟล์ในเว็บร้านเท่านั้น · ลาย "own" (ลูกค้าส่งรูปเอง) ไม่มีรูป
    img: IMG_RE.test(img) ? img : '',
    size: str(body.size, 40),
    flavor: str(body.flavor, 60),
    msg: str(body.msg, 80),
    date: str(body.date, 40),
    time: str(body.time, 40),
    fulfill: str(body.fulfill, 60),
    total: Number.isFinite(Number(body.total)) ? Math.max(0, Math.round(Number(body.total))) : 0,
    name: str(body.name, 60),
    tel: str(body.tel, 24),
    rush: !!body.rush,
  };
  // ไม่มีลายและไม่มีขนาด = ไม่ใช่ออเดอร์จริง
  if (!order.design && !order.size) return null;
  return order;
}

export function cakeImageUrl(order) {
  return order?.img ? `${CAKE_SITE}/${order.img}` : '';
}

/** ข้อความสรุปที่ร้านอ่านในแชท · สั้น อ่านจบในจอเดียว */
export function cakeOrderSummary(order, code) {
  const lines = [`ออเดอร์เค้กจากเว็บ ${code}`];
  if (order.designName || order.design) {
    lines.push(`ลาย: ${order.designName || order.design}${order.design && order.design !== 'own' ? ` (${order.design})` : ''}`);
  }
  if (order.size) lines.push(`ขนาด: ${order.size}`);
  if (order.flavor) lines.push(`รส: ${order.flavor}`);
  if (order.msg) lines.push(`ข้อความบนเค้ก: ${order.msg}`);
  if (order.date) lines.push(`วันรับ: ${order.date}${order.time ? ` ${order.time}` : ''}${order.rush ? ' (ขอด่วน)' : ''}`);
  if (order.fulfill) lines.push(`รับ: ${order.fulfill}`);
  if (order.total) lines.push(`ยอดประเมิน ~${order.total.toLocaleString('th-TH')} บาท`);
  if (order.name || order.tel) lines.push(`${order.name || '-'} ${order.tel || ''}`.trim());
  return lines.join('\n');
}

/**
 * ข้อความตอบลูกค้า · ห้ามยืนยันคิวหรือราคาแทนเจ้าของ
 * ลาย "own" ให้ลูกค้าส่งรูปต่อในแชท ไม่แทนด้วยรูปลายอื่น
 */
export function cakeReplyText(order, opts = {}) {
  if (opts.repeat) {
    return 'ออเดอร์นี้ส่งถึงร้านแล้วนะคะ รอทางร้านเช็กคิวแล้วตอบกลับได้เลยค่ะ';
  }
  const tail = order.design === 'own'
    ? '\n\nส่งรูปแบบที่อยากได้ต่อในแชทนี้ได้เลยค่ะ'
    : '';
  return 'ได้รับรายละเอียดออเดอร์แล้วค่ะ'
    + '\nรอทางร้านเช็กคิวและยืนยันยอดอีกครั้งนะคะ'
    + tail;
}

/** ข้อความตอบเมื่อหาโค้ดไม่เจอ · ไม่ใบ้ว่ามีโค้ดอื่นอยู่ */
export const CAKE_CODE_NOT_FOUND =
  'ไม่พบรหัสออเดอร์นี้ค่ะ อาจหมดอายุแล้ว (เก็บไว้ 7 วัน)\n'
  + 'ลองกดสั่งใหม่ที่ https://siwaracafe.com/cake แล้วส่งรหัสใหม่เข้ามาได้เลยค่ะ\n'
  + 'หรือพิมพ์รายละเอียดที่อยากได้มาในแชทนี้ก็ได้ค่ะ';

/** ประกอบข้อความ reply สำหรับ LINE · รูปมาก่อนเพื่อให้เห็นลายทันที */
export function buildCakeReplyMessages(order, code, opts = {}) {
  const messages = [];
  const img = cakeImageUrl(order);
  if (img && !opts.repeat) {
    messages.push({ type: 'image', originalContentUrl: img, previewImageUrl: img });
  }
  messages.push({ type: 'text', text: cakeOrderSummary(order, code) });
  messages.push({ type: 'text', text: cakeReplyText(order, opts) });
  return messages;
}
