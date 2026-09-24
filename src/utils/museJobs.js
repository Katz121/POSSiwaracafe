/**
 * AI ผ่าน Meta Muse (CLI บนคอมที่ร้าน) · ใช้คิวใน Firestore แทนการยิง API ตรง
 *
 *   แอป ──addDoc──▶ aiJobs/{id} {status:'queued'} ──▶ scripts/muse-bridge.mjs (คอมร้าน)
 *   แอป ◀─onSnapshot── {status:'done', result}   ◀── muse_task.py --solo
 *
 * คอมร้านเขียน heartbeat ที่ aiRunner/status ทุก 30 วิ · แอปถือว่า AI พร้อมเมื่อเห็นภายใน 90 วิ
 *
 * ไฟล์นี้เป็นฟังก์ชันล้วน (ไม่แตะ Firebase/Vite) เพราะตัว bridge ที่รันบน Node ก็ import ไฟล์นี้ด้วย
 */

export const AI_JOBS_COLLECTION = 'aiJobs';
export const AI_RUNNER_COLLECTION = 'aiRunner';
export const AI_RUNNER_DOC = 'status';

export const AI_JOB_TYPES = ['stockSuggest', 'text', 'json'];
export const AI_HEARTBEAT_MS = 30 * 1000;
export const AI_RUNNER_FRESH_MS = 90 * 1000;
export const AI_CLIENT_TIMEOUT_MS = 4 * 60 * 1000;
export const AI_RUNNER_TIMEOUT_MS = 5 * 60 * 1000;
export const AI_MAX_PROMPT_CHARS = 150000;

export const AI_OFFLINE_HINT = 'AI ออฟไลน์ · เปิดคอมที่ร้านเพื่อใช้ AI';
export const AI_THINKING_TEXT = 'Muse กำลังคิด… (ต้องเปิดคอมที่ร้าน)';

/** effort ที่ส่งให้ Muse · ผูกสต็อกต้องคิดสูตร+แปลงหน่วย จึงให้ medium · งานสั้นให้ low (เร็วกว่า) */
export const effortForJobType = (type) => (type === 'stockSuggest' ? 'medium' : 'low');

/** แปลง lastSeen (ISO / millis / Firestore Timestamp) เป็น millis · อ่านไม่ได้ = null */
export function toMillis(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value === 'object' && Number.isFinite(value.seconds)) return value.seconds * 1000;
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? t : null;
}

/**
 * คอมที่ร้านยังออนไลน์ไหม · heartbeat ต้องไม่เก่ากว่า maxAge
 * เผื่อนาฬิกาเครื่องคลาดกันได้ 60 วิ (lastSeen "อนาคต" เล็กน้อยยังนับว่าสด)
 * runner ปิดตัวเองเรียบร้อยจะเขียน online:false = ออฟไลน์ทันทีไม่ต้องรอ 90 วิ
 */
export function isRunnerFresh(status, now = Date.now(), maxAgeMs = AI_RUNNER_FRESH_MS) {
  if (!status || status.online === false) return false;
  const seen = toMillis(status.lastSeen);
  if (seen == null) return false;
  const age = now - seen;
  return age <= maxAgeMs && age >= -60 * 1000;
}

const stripFences = (text) => String(text ?? '').replace(/```(?:json|JSON)?/g, '').trim();

/** หา JSON ก้อนที่สมดุลตัวแรก เริ่มที่ตำแหน่ง start · เคารพสตริงและ escape */
function balancedEnd(text, start) {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') {
      depth -= 1;
      if (depth === 0) return ch === close ? i : -1;
    }
  }
  return -1;
}

/**
 * ดึง JSON object/array ตัวแรกที่ parse ได้จากคำตอบของโมเดล
 * (โมเดลชอบเกริ่นก่อน / ใส่ ```json / ปิดท้ายด้วยคำอธิบาย) · ไม่เจอเลย = throw
 */
export function extractJson(text) {
  const clean = stripFences(text);
  if (!clean) throw new Error('คำตอบว่างเปล่า');
  try { return JSON.parse(clean); } catch { /* มีข้อความปน · ไล่หาเอง */ }
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch !== '{' && ch !== '[') continue;
    const end = balancedEnd(clean, i);
    if (end < 0) continue;
    try { return JSON.parse(clean.slice(i, end + 1)); } catch { /* ลองตัวถัดไป */ }
  }
  throw new Error('ไม่พบ JSON ในคำตอบ');
}

/** Firestore เก็บ array ซ้อน array ไม่ได้ · เจอแบบนั้นต้องเก็บเป็นสตริง JSON แทน */
export function hasNestedArray(value, insideArray = false) {
  if (Array.isArray(value)) {
    if (insideArray) return true;
    return value.some((v) => hasNestedArray(v, true));
  }
  if (value && typeof value === 'object') return Object.values(value).some((v) => hasNestedArray(v, false));
  return false;
}

/**
 * กันเบอร์โทรหลุดไป Meta (Muse เป็นโมเดล contributor) · แทนเบอร์ไทยทุกแบบด้วย [เบอร์โทร]
 * 0812345678 · 081-234-5678 · 02 123 4567 · +66812345678
 */
export function redactPII(text) {
  return String(text ?? '').replace(/(?<![\d.])(?:\+66|0)[-\s]?\d{1,2}[-\s]?\d{3}[-\s]?\d{3,4}(?![\d.])/g, '[เบอร์โทร]');
}

/** กรอบคำสั่งที่ bridge ห่อทุกงานก่อนส่ง Muse (Muse เป็น coding agent ต้องบอกว่าไม่ต้องทำไฟล์) */
export function wrapPromptForMuse(job) {
  const type = AI_JOB_TYPES.includes(job?.type) ? job.type : 'text';
  const wantsJson = type !== 'text';
  const rules = [
    'คุณคือผู้ช่วย AI ของร้านคาเฟ่ไทย "ศิวรา" ทำงานผ่านระบบ POS ของร้าน',
    'ตอบคำถามด้านล่างอย่างเดียว ห้ามสร้าง/แก้ไฟล์ ห้ามรันคำสั่ง (ค้นเว็บได้เฉพาะเมื่อจำเป็นจริง)',
    'ตอบจากข้อมูลที่ให้มาเป็นหลัก กระชับ ตรงประเด็น ถ้าข้อมูลไม่พอให้บอกตรงๆ ว่าไม่พอ ห้ามเดาตัวเลข',
    wantsJson
      ? 'รูปแบบคำตอบ: JSON ล้วนตามที่โจทย์กำหนด ไม่มีข้อความอื่น ไม่มี markdown code fence'
      : 'รูปแบบคำตอบ: ข้อความภาษาไทยที่พร้อมแสดงให้เจ้าของร้านอ่านได้ทันที',
  ];
  return `${rules.map((r) => `- ${r}`).join('\n')}\n\n--- โจทย์ ---\n${String(job?.prompt ?? '')}`;
}

/** ตัดข้อความ error ให้สั้นก่อนเก็บลง Firestore / โชว์หน้าจอ */
export const clipText = (text, max = 500) => {
  const s = String(text ?? '').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
};
