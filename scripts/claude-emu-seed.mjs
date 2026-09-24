/**
 * claude-emu-seed.mjs — ใส่สำเนาข้อมูลร้าน (.claude/snapshot/*.json) ลง Firestore/Auth emulator
 *   1) npm run emu            (อีกหน้าต่าง · Firestore 8181 + Auth 9099)
 *   2) node scripts/claude-emu-seed.mjs [snapshot.json]
 *   3) npm run dev:emu        แล้วล็อกอิน  รหัสพนักงาน siwara / รหัสผ่าน emu-test-1234 · PIN แอดมิน 1234
 * ใช้ firebase-admin ชี้ emulator เท่านั้น · ถ้าตัวแปร EMULATOR_HOST หายจะหยุดทันที กันเขียนระบบจริง
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const require = createRequire(new URL('../firebase-functions/package.json', import.meta.url));
const admin = require('firebase-admin');

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('refuse: no emulator host');
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)
  .map(l => l.match(/^\s*([\w.]+)\s*=\s*(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim().replace(/^["']|["']$/g, '')]));
admin.initializeApp({ projectId: env.VITE_FIREBASE_PROJECT_ID });
const db = admin.firestore();

const dir = new URL('../.claude/snapshot/', import.meta.url);
const file = process.argv[2] || new URL(readdirSync(dir).filter(f => f.endsWith('.json')).sort().pop(), dir);
const snap = JSON.parse(readFileSync(file, 'utf8'));

// JSON ของ Timestamp ฝั่ง client = { type: 'firestore/timestamp/1.0', seconds, nanoseconds }
const revive = (v) => {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === 'object') {
    if (v.type === 'firestore/timestamp/1.0' && 'seconds' in v) return new admin.firestore.Timestamp(v.seconds, v.nanoseconds || 0);
    if (v.__ts) return admin.firestore.Timestamp.fromDate(new Date(v.__ts));
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]));
  }
  return v;
};

const base = db.collection('artifacts').doc('siwara-pos-v1').collection('public').doc('data');
let n = 0;
for (const [col, docs] of Object.entries(snap)) {
  if (col.startsWith('__') || !Array.isArray(docs)) continue;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    docs.slice(i, i + 400).forEach(({ id, ...data }) => batch.set(base.collection(col).doc(id), revive(data)));
    await batch.commit();
  }
  n += docs.length;
  console.log(col.padEnd(16), docs.length);
}
const cfg = snap.__config || {};
const settings = { ...(cfg.settings || {}), adminPin: '1234', geminiApiKey: '' };
await base.collection('config').doc('settings').set(revive(settings));
if (cfg.queue) await base.collection('config').doc('queue').set(revive(cfg.queue));
if (cfg.publicMenu) await base.collection('config').doc('publicMenu').set(revive(cfg.publicMenu));

const email = 'siwara@staff.siwara.local';
try { await admin.auth().deleteUser((await admin.auth().getUserByEmail(email)).uid); } catch { /* ยังไม่มี */ }
await admin.auth().createUser({ email, password: 'emu-test-1234' });
console.log(`seeded ${n} docs · login siwara / emu-test-1234 · PIN 1234`);
process.exit(0);
