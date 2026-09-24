/**
 * แอป → คิวงาน AI ใน Firestore → muse-bridge บนคอมที่ร้าน (ดู scripts/MUSE_BRIDGE.md)
 * แทนการยิง Gemini ตรง · คอมร้านปิด = AI ออฟไลน์ (ปุ่ม AI ถูกปิดพร้อมคำแนะนำ)
 */
import {
  addDoc, collection, doc, onSnapshot, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { auth, db, appId } from './firebase';
import {
  AI_JOBS_COLLECTION, AI_RUNNER_COLLECTION, AI_RUNNER_DOC, AI_JOB_TYPES, AI_CLIENT_TIMEOUT_MS, extractJson,
} from '../utils/museJobs';

const dataPath = ['artifacts', appId, 'public', 'data'];

// งานที่กำลังรอ · ให้ pill "Muse กำลังคิด…" รู้ว่ามีงานค้าง
let pending = 0;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(pending));
export const subscribeAiActivity = (fn) => { listeners.add(fn); fn(pending); return () => listeners.delete(fn); };

/** ฟัง heartbeat ของ muse-bridge · cb(statusDoc | null) */
export function subscribeRunnerStatus(cb) {
  return onSnapshot(
    doc(db, ...dataPath, AI_RUNNER_COLLECTION, AI_RUNNER_DOC),
    (snap) => cb(snap.exists() ? snap.data() : null),
    () => cb(null),
  );
}

/** ผลจาก bridge → ค่าที่ผู้เรียกใช้ (json-string = array ซ้อน array ที่ Firestore เก็บตรงๆ ไม่ได้) */
export function decodeJobResult(data) {
  if (data?.resultFormat === 'json-string') return extractJson(data.result);
  return data?.result;
}

/**
 * ส่งงานเข้าคิวแล้วรอผล · resolve เป็น { ok, result, raw, durationMs } หรือ { ok:false, error }
 * ไม่ throw · หมดเวลา 4 นาทีแล้วยังไม่มีใครรับ = ปิดงานเป็น error (bridge จะไม่หยิบไปทำทีหลัง)
 */
export async function enqueueAiJob({ type = 'text', prompt, timeoutMs = AI_CLIENT_TIMEOUT_MS }) {
  if (!AI_JOB_TYPES.includes(type)) return { ok: false, error: `ไม่รู้จักงาน AI ชนิด ${type}` };
  let ref;
  try {
    ref = await addDoc(collection(db, ...dataPath, AI_JOBS_COLLECTION), {
      type,
      prompt: String(prompt || ''),
      status: 'queued',
      result: null,
      error: null,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser?.email || null,
    });
  } catch (e) {
    return { ok: false, error: `ส่งงานให้ AI ไม่สำเร็จ: ${e.message}` };
  }

  pending += 1;
  emit();
  try {
    return await new Promise((resolve) => {
      let unsub = () => {};
      const timer = setTimeout(async () => {
        unsub();
        try {
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            if (snap.exists() && snap.data().status === 'queued') {
              tx.update(ref, { status: 'error', error: 'หมดเวลารอ (แอปเลิกรอแล้ว)', finishedAt: serverTimestamp() });
            }
          });
        } catch { /* ออฟไลน์ ไม่เป็นไร · bridge ข้ามงานที่เก่าเกิน 4 นาทีเองอยู่แล้ว */ }
        resolve({ ok: false, error: 'AI ตอบไม่ทันเวลา (4 นาที) · เช็คว่าคอมที่ร้านเปิดอยู่' });
      }, timeoutMs);
      unsub = onSnapshot(ref, (snap) => {
        const data = snap.data();
        if (!data || (data.status !== 'done' && data.status !== 'error')) return;
        clearTimeout(timer);
        unsub();
        if (data.status === 'error') { resolve({ ok: false, error: data.error || 'AI ทำงานไม่สำเร็จ' }); return; }
        try {
          resolve({ ok: true, result: decodeJobResult(data), raw: data.raw, durationMs: data.durationMs, jobId: ref.id });
        } catch (e) {
          resolve({ ok: false, error: `อ่านคำตอบ AI ไม่ได้: ${e.message}` });
        }
      }, (e) => {
        clearTimeout(timer);
        resolve({ ok: false, error: `ติดตามงาน AI ไม่ได้: ${e.message}` });
      });
    });
  } finally {
    pending -= 1;
    emit();
  }
}
