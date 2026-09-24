#!/usr/bin/env node
/**
 * muse-bridge · คนกลางระหว่างแอป POS กับ Meta Muse (CLI บนคอมที่ร้าน)
 *
 * แอปเขียนงานลง Firestore `aiJobs/{id}` (status: queued) · สคริปต์นี้ฟังคิว รับงานทีละงาน
 * รัน `python D:/workFull/scripts/muse_task.py --solo ...` แล้วเขียนผลกลับ (done / error)
 * และเขียน heartbeat `aiRunner/status` ทุก 30 วิ ให้แอปรู้ว่า AI พร้อมใช้
 *
 * ใช้:  node scripts/muse-bridge.mjs              (ระบบจริง · ต้องมี scripts/.muse-bridge.env)
 *       node scripts/muse-bridge.mjs --emulator   (Firestore 127.0.0.1:8181 / Auth 9099)
 *       node scripts/muse-bridge.mjs --once       (เคลียร์คิวที่ค้างแล้วออก · ไว้ทดสอบ)
 * รายละเอียด/การตั้ง PM2: scripts/MUSE_BRIDGE.md
 *
 * ความเป็นส่วนตัว: Muse เป็นโมเดล contributor (Meta อาจเอาไปเทรน) · แอปส่งเฉพาะชื่อเมนู/สต็อก/
 * ยอดรวม และ bridge ลบเบอร์โทรทุกแบบออกจากโจทย์อีกชั้นก่อนส่ง (redactPII)
 */
import { spawn, execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import {
  initializeFirestore, connectFirestoreEmulator, collection, doc, query, where, onSnapshot,
  getDocs, runTransaction, updateDoc, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';

import {
  AI_JOBS_COLLECTION, AI_RUNNER_COLLECTION, AI_RUNNER_DOC, AI_JOB_TYPES, AI_HEARTBEAT_MS,
  AI_RUNNER_TIMEOUT_MS, AI_CLIENT_TIMEOUT_MS, AI_MAX_PROMPT_CHARS,
  effortForJobType, extractJson, hasNestedArray, redactPII, wrapPromptForMuse, clipText, toMillis,
} from '../src/utils/museJobs.js';

const VERSION = '1.0.0';
const APP_ID = 'siwara-pos-v1';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK_DIR = path.join(REPO, '.claude', 'muse-bridge');
const LOG_FILE = path.join(REPO, '.claude', 'muse-bridge.log');
const ARGS = new Set(process.argv.slice(2));
const EMULATOR = ARGS.has('--emulator');
const ONCE = ARGS.has('--once');
// Muse ต้องจบก่อนแอปเลิกรอ (4 นาที) · เผื่อเวลา staging/เขียนผลอีกนิด
const MUSE_TIMEOUT_SEC = Math.floor((AI_CLIENT_TIMEOUT_MS - 15 * 1000) / 1000);
const PRUNE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

// ── env ────────────────────────────────────────────────────────────────────
function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const bridgeEnv = readEnvFile(path.join(REPO, 'scripts', '.muse-bridge.env'));
const appEnv = { ...readEnvFile(path.join(REPO, '.env')), ...readEnvFile(path.join(REPO, '.env.production')) };
const env = (key, fallback = '') => process.env[key] || bridgeEnv[key] || fallback;

const STAFF_ID = EMULATOR ? 'siwara' : env('STAFF_ID', 'siwara');
const STAFF_PASSWORD = EMULATOR ? 'emu-test-1234' : env('STAFF_PASSWORD');
const MUSE_TASK = env('MUSE_TASK', 'D:/workFull/scripts/muse_task.py');
const PYTHON = env('PYTHON', 'python');
const RUNNER_ID = `${os.hostname()}-${process.pid}-${randomBytes(2).toString('hex')}`;

// ── log ────────────────────────────────────────────────────────────────────
fs.mkdirSync(WORK_DIR, { recursive: true });
function log(...parts) {
  const line = `${new Date().toISOString()} ${EMULATOR ? '[emu] ' : ''}${parts.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, `${line}\n`); } catch { /* log เต็ม/ล็อก ไม่ให้ bridge ตาย */ }
}

// ── firebase ───────────────────────────────────────────────────────────────
const firebaseConfig = EMULATOR
  ? { apiKey: appEnv.VITE_FIREBASE_API_KEY || 'emulator', projectId: 'siwarapos', appId: 'emulator' }
  : {
    apiKey: env('VITE_FIREBASE_API_KEY', appEnv.VITE_FIREBASE_API_KEY),
    authDomain: env('VITE_FIREBASE_AUTH_DOMAIN', appEnv.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: env('VITE_FIREBASE_PROJECT_ID', appEnv.VITE_FIREBASE_PROJECT_ID),
    appId: env('VITE_FIREBASE_APP_ID', appEnv.VITE_FIREBASE_APP_ID),
  };
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  log('ERROR ไม่พบ VITE_FIREBASE_API_KEY / PROJECT_ID (.env ของแอป หรือ scripts/.muse-bridge.env)');
  process.exit(1);
}
if (!STAFF_PASSWORD) {
  log('ERROR ยังไม่ได้ตั้ง STAFF_PASSWORD · คัดลอก scripts/.muse-bridge.env.example เป็น scripts/.muse-bridge.env แล้วใส่รหัสพนักงาน');
  process.exit(1);
}

const app = initializeApp(firebaseConfig, 'muse-bridge');
const auth = getAuth(app);
const db = initializeFirestore(app, {});
if (EMULATOR) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8181);
}
const base = ['artifacts', APP_ID, 'public', 'data'];
const jobsCol = collection(db, ...base, AI_JOBS_COLLECTION);
const statusRef = doc(db, ...base, AI_RUNNER_COLLECTION, AI_RUNNER_DOC);

// ── heartbeat ──────────────────────────────────────────────────────────────
let currentJobId = null;
let stopping = false;
async function beat(extra = {}) {
  try {
    await setDoc(statusRef, {
      lastSeen: new Date().toISOString(),
      online: true,
      runnerId: RUNNER_ID,
      version: VERSION,
      mode: EMULATOR ? 'emulator' : 'production',
      busy: currentJobId,
      ...extra,
    });
  } catch (e) {
    log('WARN heartbeat ไม่สำเร็จ:', e.code || e.message);
  }
}

// ── muse ───────────────────────────────────────────────────────────────────
function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => {});
  else try { process.kill(-pid, 'SIGKILL'); } catch { /* จบไปแล้ว */ }
}

/** รัน muse_task.py หนึ่งงาน · คืนข้อความคำตอบ (stdout ของ Muse) หรือ throw */
function runMuse(job, jobId) {
  const stamp = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
  // ชื่อไฟล์ห้ามมีคำอย่าง token/secret (muse_task.py บล็อกชื่อไฟล์ลับ) · ใช้ stamp ของเราเอง
  const promptFile = path.join(WORK_DIR, `job-${stamp}.md`);
  const answerFile = path.join(WORK_DIR, `answer-${stamp}.txt`);
  fs.writeFileSync(promptFile, redactPII(wrapPromptForMuse(job)), 'utf8');
  const effort = effortForJobType(job.type);
  const args = [
    MUSE_TASK, '--slug', `pos-ai-${jobId}`, '--solo', '--effort', effort,
    '--prompt-file', promptFile, '--answer-file', answerFile, '--timeout', String(MUSE_TIMEOUT_SEC),
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, args, {
      cwd: path.dirname(path.dirname(MUSE_TASK)),
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; if (stdout.length > 200000) stdout = stdout.slice(-100000); });
    child.stderr.on('data', (d) => { stderr += d; if (stderr.length > 50000) stderr = stderr.slice(-20000); });
    const timer = setTimeout(() => {
      log(`WARN job ${jobId} เกิน ${AI_RUNNER_TIMEOUT_MS / 1000} วิ · ยกเลิก`);
      killTree(child.pid);
      reject(new Error('Muse ใช้เวลานานเกินไป (เกิน 5 นาที)'));
    }, AI_RUNNER_TIMEOUT_MS);
    const cleanup = () => {
      clearTimeout(timer);
      for (const f of [promptFile, answerFile]) fs.rm(f, { force: true }, () => {});
    };
    child.on('error', (e) => { cleanup(); reject(new Error(`เรียก python ไม่ได้: ${e.message}`)); });
    child.on('close', (code) => {
      let answer = '';
      try { answer = fs.readFileSync(answerFile, 'utf8').trim(); } catch { /* ไม่มีไฟล์ = ล้ม */ }
      cleanup();
      if (code === 0 && answer) return resolve(answer);
      const tail = clipText(`${stderr}\n${stdout}`.split(/\r?\n/).filter((l) => l.trim()).slice(-6).join(' | '), 400);
      reject(new Error(code === 124 ? 'Muse ตอบไม่ทันเวลา' : `Muse ล้มเหลว (exit ${code}) ${tail}`));
    });
  });
}

// ── jobs ───────────────────────────────────────────────────────────────────
const queued = new Map(); // id -> data (จาก onSnapshot)
let pumping = false;

async function claim(ref) {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.data().status !== 'queued') return null;
    tx.update(ref, { status: 'running', startedAt: serverTimestamp(), runnerId: RUNNER_ID });
    return snap.data();
  });
}

function validate(job) {
  if (!AI_JOB_TYPES.includes(job.type)) return `ไม่รู้จักงานชนิด "${job.type}"`;
  if (typeof job.prompt !== 'string' || !job.prompt.trim()) return 'ไม่มีโจทย์';
  if (job.prompt.length > AI_MAX_PROMPT_CHARS) return 'โจทย์ยาวเกินไป';
  return null;
}

async function finish(ref, patch) {
  try {
    await updateDoc(ref, { ...patch, finishedAt: serverTimestamp() });
  } catch (e) {
    log('ERROR เขียนผลไม่สำเร็จ', ref.id, e.code || e.message);
  }
}

async function processJob(id) {
  const ref = doc(jobsCol, id);
  const job = await claim(ref).catch((e) => { log('WARN claim ไม่สำเร็จ', id, e.code || e.message); return null; });
  if (!job) return;
  currentJobId = id;
  beat();
  const started = Date.now();
  log(`job ${id} · ${job.type} · ${job.prompt?.length || 0} ตัวอักษร · เริ่ม`);
  const bad = validate(job);
  if (bad) {
    await finish(ref, { status: 'error', error: bad });
    log(`job ${id} · ปฏิเสธ: ${bad}`);
    currentJobId = null;
    return;
  }
  try {
    const answer = await runMuse(job, id);
    let result = answer;
    let resultFormat = 'text';
    if (job.type !== 'text') {
      const parsed = extractJson(answer);
      // Firestore เก็บ array ซ้อน array ไม่ได้ · เก็บเป็นสตริง JSON แล้วแอป parse เอง
      if (hasNestedArray(parsed)) { result = JSON.stringify(parsed); resultFormat = 'json-string'; }
      else { result = parsed; resultFormat = 'json'; }
    }
    const durationMs = Date.now() - started;
    await finish(ref, { status: 'done', result, resultFormat, raw: clipText(answer, 20000), durationMs, error: null });
    log(`job ${id} · เสร็จ ${Math.round(durationMs / 1000)} วิ · ${resultFormat}`);
  } catch (e) {
    const durationMs = Date.now() - started;
    await finish(ref, { status: 'error', error: clipText(e.message, 500), durationMs });
    log(`job ${id} · ล้มเหลว ${Math.round(durationMs / 1000)} วิ · ${e.message}`);
  } finally {
    currentJobId = null;
    beat();
  }
}

async function pump() {
  if (pumping || stopping) return;
  pumping = true;
  try {
    while (queued.size && !stopping) {
      // เก่าสุดก่อน · งานที่รอนานกว่าที่แอปรอไหว = แอปเลิกรอไปแล้ว ไม่ต้องเสียโควตา Muse
      const [id, data] = [...queued.entries()].sort((a, b) => (toMillis(a[1].createdAt) ?? 0) - (toMillis(b[1].createdAt) ?? 0))[0];
      queued.delete(id);
      const created = toMillis(data.createdAt);
      if (created && Date.now() - created > AI_CLIENT_TIMEOUT_MS) {
        await expireIfQueued(id, 'หมดเวลารอ · ตอนสั่งงานคอมที่ร้านไม่ได้เปิด');
        continue;
      }
      await processJob(id);
    }
  } finally {
    pumping = false;
  }
}

async function expireIfQueued(id, reason) {
  const ref = doc(jobsCol, id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists() && snap.data().status === 'queued') {
      tx.update(ref, { status: 'error', error: reason, finishedAt: serverTimestamp() });
    }
  }).catch((e) => log('WARN expire ไม่สำเร็จ', id, e.code || e.message));
}

/** ตอนเริ่ม: งานที่ค้าง running = bridge ตัวก่อนตายกลางทาง · ปิดเป็น error · ล้างงานเก่าเกิน 14 วัน */
async function recoverStale() {
  const running = await getDocs(query(jobsCol, where('status', '==', 'running')));
  for (const d of running.docs) {
    await updateDoc(d.ref, { status: 'error', error: 'คอมที่ร้านรีสตาร์ตระหว่างทำงาน · กดใหม่อีกครั้ง', finishedAt: serverTimestamp() })
      .catch((e) => log('WARN ปิดงานค้างไม่สำเร็จ', d.id, e.code || e.message));
  }
  if (running.size) log(`ปิดงานค้าง running ${running.size} งาน`);
  let pruned = 0;
  for (const status of ['done', 'error']) {
    const snap = await getDocs(query(jobsCol, where('status', '==', status)));
    for (const d of snap.docs) {
      const t = toMillis(d.data().finishedAt) ?? toMillis(d.data().createdAt);
      if (t && Date.now() - t > PRUNE_AFTER_MS) { await deleteDoc(d.ref).catch(() => {}); pruned += 1; }
    }
  }
  if (pruned) log(`ลบงานเก่าเกิน 14 วัน ${pruned} งาน`);
}

// ── main ───────────────────────────────────────────────────────────────────
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log(`หยุด (${signal}) · แจ้งแอปว่า AI ออฟไลน์`);
  await beat({ online: false, stoppedAt: new Date().toISOString() });
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
// PM2 บน Windows ส่งข้อความ 'shutdown' แทนสัญญาณ
process.on('message', (msg) => { if (msg === 'shutdown') shutdown('pm2'); });

async function main() {
  log(`muse-bridge ${VERSION} · runner ${RUNNER_ID} · ${EMULATOR ? 'emulator' : firebaseConfig.projectId}`);
  if (!fs.existsSync(MUSE_TASK)) log(`WARN ไม่พบ ${MUSE_TASK} · งานจะล้มจนกว่าจะแก้ MUSE_TASK`);
  await signInWithEmailAndPassword(auth, `${STAFF_ID}@staff.siwara.local`, STAFF_PASSWORD);
  log(`ล็อกอินเป็น ${STAFF_ID}`);
  await recoverStale();

  if (ONCE) {
    const snap = await getDocs(query(jobsCol, where('status', '==', 'queued')));
    snap.docs.forEach((d) => queued.set(d.id, d.data()));
    await beat();
    await pump();
    await beat({ online: false, stoppedAt: new Date().toISOString() });
    log('--once เสร็จ');
    process.exit(0);
  }

  await beat();
  setInterval(() => { if (!stopping) beat(); }, AI_HEARTBEAT_MS);
  onSnapshot(query(jobsCol, where('status', '==', 'queued')), (snap) => {
    queued.clear();
    snap.docs.forEach((d) => { if (d.id !== currentJobId) queued.set(d.id, d.data()); });
    if (snap.size) log(`คิว ${snap.size} งาน`);
    pump();
  }, (e) => {
    log('ERROR ฟังคิวไม่ได้:', e.code || e.message, '· ออกให้ PM2 เริ่มใหม่');
    process.exit(1);
  });
  log('พร้อมรับงาน');
}

main().catch((e) => {
  log('ERROR เริ่มไม่สำเร็จ:', e.code || e.message);
  process.exit(1);
});
