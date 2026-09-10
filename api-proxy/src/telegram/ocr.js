import { dependencies } from '../firestore.js';
import { telegramApi } from './api.js';
import { inferExpenseCategory } from './parse.js';
import { roundMoney } from '../../../src/utils/stockIntake.js';
export const OCR_MODEL = 'gemini-3.5-flash-lite';
const clean = (value, max) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function parseOcrNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const match = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

export async function extractExpenseFromImage(env, fileId, injected, testImage = null, testMimeType = 'image/jpeg', retry = false) {
  let mimeType = testMimeType;
  let image = testImage;
  if (!image) {
    const file = await telegramApi(env, 'getFile', { file_id: fileId }, injected);
    const imageRes = await dependencies(env, injected).fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`);
    if (!imageRes.ok) throw new Error('Receipt image download failed');
    const detectedMime = imageRes.headers.get('content-type') || '';
    const extensionMime = /\.png$/i.test(file.file_path || '') ? 'image/png'
      : /\.webp$/i.test(file.file_path || '') ? 'image/webp' : 'image/jpeg';
    mimeType = /^image\/(jpeg|png|webp|gif)$/i.test(detectedMime) ? detectedMime : extensionMime;
    image = bytesToBase64(new Uint8Array(await imageRes.arrayBuffer()));
  }
  try {
  const prompt = `อ่านข้อความจากภาพใบเสร็จ แล้วตอบเป็น JSON เท่านั้นตาม schema นี้:
{"receiptDate":"YYYY-MM-DD","vendor":"ชื่อร้าน","total":0,"items":[{"title":"ชื่อสินค้า","barcode":"885xxxxxxxxx","quantity":1,"unit":"ชิ้น","pricePerUnit":0,"amount":0}]}
ต้องแยกรายการสินค้าทุกบรรทัดออกเป็น items ห้ามรวมหลายสินค้าเป็นรายการเดียว
ให้โฟกัสคอลัมน์ Code/รหัสอ้างอิงของบิลเป็นพิเศษ เช่น เลขขึ้นต้น 885 และอ่านตัวเลขให้ครบ ห้ามเอา Code ไปรวมใน title ถ้าไม่มีให้ใช้ barcode เป็นสตริงว่าง
amount คือยอดรวมของรายการนั้น และ pricePerUnit คือ amount หาร quantity
ถ้ามีหลายรายการให้แยกเป็นคนละ item เสมอ และใช้ยอดของแต่ละบรรทัดตามใบเสร็จ
ห้ามใส่ markdown ห้ามเดาข้อมูลที่ไม่มีในภาพ ตัวเลขต้องเป็น number`;
  const orientationInstruction = '\n\nภาพอาจเอียงหรือหมุน 90/180 องศา ให้ปรับมุมมองก่อนอ่าน และอ่านข้อความจากบนลงล่างทีละบรรทัด ห้ามตอบ items ว่าง หากชื่อสินค้าไม่ชัดให้ใช้ข้อความที่มองเห็นได้ แต่ต้องเก็บ Code และยอดเงินของแต่ละบรรทัด';
  const ocrPrompt = retry
    ? `${prompt}${orientationInstruction}\nตรวจซ้ำอีกครั้งและตอบ JSON เท่านั้น`
    : `${prompt}${orientationInstruction}`;
  const res = await dependencies(env, injected).fetch(`https://generativelanguage.googleapis.com/v1beta/models/${OCR_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: ocrPrompt }, { inline_data: { mime_type: mimeType, data: image } }] }], generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: 'application/json' } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Gemini OCR API error (${res.status}): ${data?.error?.message || 'ไม่สามารถอ่านผลจาก Gemini ได้'}`);
  }
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map(part => part?.text || '')
    .filter(Boolean)
    .join('\n');
  const jsonText = text.replace(/```json|```/gi, '').trim();
  const jsonMatch = jsonText.match(/(?:\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!jsonMatch) throw new Error('Gemini ไม่ส่งข้อมูลใบเสร็จกลับมา');
  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('Gemini ส่งข้อมูลใบเสร็จมาไม่อยู่ในรูปแบบ JSON');
  }
  const rawItems = Array.isArray(parsed)
    ? parsed
    : (Array.isArray(parsed.items)
      ? parsed.items
      : (Array.isArray(parsed.products)
        ? parsed.products
        : (Array.isArray(parsed.lines)
          ? parsed.lines
          : (Array.isArray(parsed.rows)
            ? parsed.rows
            : (Array.isArray(parsed.data)
              ? parsed.data
              : (Array.isArray(parsed.results) ? parsed.results : [parsed]))))));
  const items = rawItems.map((item) => {
    const itemQuantity = parseOcrNumber(item.quantity ?? item.qty ?? item.count ?? item['จำนวน']) || 1;
    const lineAmount = parseOcrNumber(item.amount ?? item.total ?? item.lineTotal ?? item.totalAmount ?? item.line_amount ?? item.line_total ?? item['รวม']);
    const unitAmount = parseOcrNumber(item.pricePerUnit ?? item.unitPrice ?? item.unit_price ?? item.price ?? item.ราคา);
    const itemAmount = lineAmount || (unitAmount * itemQuantity);
    const title = clean(item.title || item.name || item.product || item.productName || item.product_name || item.description || item['สินค้า'], 120);
    const barcode = String(item.barcode || item.code || item.productCode || '').replace(/[^0-9]/g, '').slice(0, 32);
    return {
      title,
      barcode,
      quantity: itemQuantity,
      unit: clean(item.unit || 'ชิ้น', 20),
      pricePerUnit: itemAmount / itemQuantity,
      amount: roundMoney(itemAmount),
      category: inferExpenseCategory(title),
      source: 'receipt',
    };
  }).filter(item => item.title && item.amount > 0 && item.quantity > 0 && Number.isFinite(item.quantity));
  if (!items.length) throw new Error('ไม่พบรายการสินค้าและยอดเงินในใบเสร็จ');
  return { lines: items, receiptDate: parsed.receiptDate || null, vendor: parsed.vendor || null, total: parsed.total == null ? null : parseOcrNumber(parsed.total) };
  } catch (error) {
    // ใช้ภาพเดิมลองอีกครั้งเมื่อ AI ตอบเสีย เพื่อไม่ดาวน์โหลดภาพซ้ำและไม่วนไม่สิ้นสุด
    if (!retry) return extractExpenseFromImage(env, null, injected, image, mimeType, true);
    throw error;
  }
}

