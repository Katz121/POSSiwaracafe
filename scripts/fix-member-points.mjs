/**
 * fix-member-points.mjs — ตั้งค่าแต้มสมาชิกให้ถูกต้อง (เขียนข้อมูลจริง!)
 *   node scripts/fix-member-points.mjs <phone> <targetPoints>
 * เช่น  node scripts/fix-member-points.mjs 0954288065 76
 *
 * จะตั้ง points = target, เคลียร์ pendingPoints = 0 และบันทึก history (manual)
 * เท่ากับส่วนต่างที่ปรับ เพื่อให้ตรวจย้อนได้ว่าปรับด้วยมือ
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, arrayUnion } from 'firebase/firestore';

function loadEnv() {
  const env = {};
  for (const file of ['.env', '.env.production', '.env.local']) {
    try {
      const txt = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        env[m[1]] = v;
      }
    } catch { /* skip */ }
  }
  return env;
}

const env = loadEnv();
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};
const APP_ID = 'siwara-pos-v1';
const PHONE = process.argv[2];
const TARGET = Number(process.argv[3]);
if (!PHONE || !Number.isFinite(TARGET)) {
  console.error('ใช้: node scripts/fix-member-points.mjs <phone|name:key> <targetPoints>');
  process.exit(1);
}

async function main() {
  const app = initializeApp(firebaseConfig);
  await signInAnonymously(getAuth(app));
  const db = getFirestore(app);
  const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'members', PHONE);

  const snap = await getDoc(ref);
  if (!snap.exists()) { console.error('ไม่พบสมาชิก:', PHONE); process.exit(1); }
  const cur = Number(snap.data().points || 0);
  const delta = TARGET - cur;

  await setDoc(ref, {
    points: TARGET,
    pendingPoints: 0,
    pointsHistory: arrayUnion({ delta, reason: 'manual', at: new Date().toISOString() }),
  }, { merge: true });

  console.log(`✅ ${snap.data().name} [${PHONE}]: ${cur} → ${TARGET} (${delta >= 0 ? '+' : ''}${delta}), pendingPoints=0`);
  process.exit(0);
}
main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
