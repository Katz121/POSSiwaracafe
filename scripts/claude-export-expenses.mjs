/**
 * claude-export-expenses.mjs — ดึงรายจ่ายจาก Firestore ออกเป็น JSON (read-only)
 *   node scripts/claude-export-expenses.mjs 2026-08 > out.json
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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
    } catch { /* ไฟล์ไม่มีก็ข้าม */ }
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
const MONTH = process.argv[2] || '';

const app = initializeApp(firebaseConfig);
await signInAnonymously(getAuth(app));
const db = getFirestore(app);
const snap = await getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'expenses'));
const rows = snap.docs.map(d => {
  const x = d.data();
  const ts = x.createdAt?.seconds ? new Date(x.createdAt.seconds * 1000).toISOString() : null;
  return { id: d.id, date: x.date || null, title: x.title || '', category: x.category || '', quantity: x.quantity ?? null, unit: x.unit || '', pricePerUnit: x.pricePerUnit ?? null, amount: Number(x.amount) || 0, createdAt: ts };
});
const filtered = MONTH ? rows.filter(r => String(r.date || r.createdAt || '').startsWith(MONTH)) : rows;
filtered.sort((a, b) => String(a.date).localeCompare(String(b.date)));
console.log(JSON.stringify({ month: MONTH, count: filtered.length, total: filtered.reduce((s, r) => s + r.amount, 0), rows: filtered }, null, 2));
process.exit(0);
