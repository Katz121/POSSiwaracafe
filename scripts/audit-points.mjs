/**
 * audit-points.mjs — ตรวจย้อนหลังระบบแต้มสมาชิก (read-only ไม่แก้ข้อมูล)
 *
 * วิธีรัน (จากโฟลเดอร์ my-pos-app):
 *   node scripts/audit-points.mjs            # ย้อนหลัง 14 วัน (ค่าเริ่มต้น)
 *   node scripts/audit-points.mjs 30         # ย้อนหลัง 30 วัน
 *
 * อ่าน config จาก .env.local / .env.production / .env (ตัวแปร VITE_FIREBASE_*)
 * แล้วล็อกอินแบบ anonymous เหมือนแอป จากนั้นพิมพ์รายงาน:
 *   - การเคลื่อนไหวแต้มของสมาชิกแต่ละคนในช่วงเวลา
 *   - ⚠️ flag จุดที่ระบบเคย "เติมแต้มย้อนหลัง" (reason=recalc) ซึ่งอาจคืนแต้มที่ลูกค้าแลกไปแล้ว
 *   - ออเดอร์ที่อาจมีการแลกแต้ม (ส่วนลด >= มูลค่าแลกแต้ม)
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';

// --- โหลด .env (ง่าย ๆ ไม่ต้องพึ่ง dotenv) ---
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
        env[m[1]] = v; // ไฟล์ที่อ่านทีหลังทับของเดิม (.env.local ชนะ)
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
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('❌ ไม่พบ VITE_FIREBASE_API_KEY / VITE_FIREBASE_PROJECT_ID ใน .env');
  process.exit(1);
}

const APP_ID = 'siwara-pos-v1';
const DAYS = Number(process.argv[2]) || 14;
const DEFAULTS = { threshold: 100, redeemValue: 50, ownGlass: 5 };

// getNameKey เหมือนในแอป (ตัดช่องว่าง + lower-case)
const getNameKey = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '');

const toMs = (v) => {
  if (!v) return 0;
  if (typeof v === 'object' && v.seconds != null) return v.seconds * 1000;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
};
const fmt = (ms) => ms ? new Date(ms).toLocaleString('th-TH') : '-';

async function main() {
  const app = initializeApp(firebaseConfig);
  await signInAnonymously(getAuth(app));
  const db = getFirestore(app);
  const base = ['artifacts', APP_ID, 'public', 'data'];

  // settings (threshold / redeem value)
  let s = { ...DEFAULTS };
  try {
    const cfg = await getDoc(doc(db, ...base, 'config', 'settings'));
    if (cfg.exists()) {
      const d = cfg.data();
      s.threshold = Number(d.redeemPointsThreshold) || s.threshold;
      s.redeemValue = Number(d.redeemDiscountValue) || s.redeemValue;
      s.ownGlass = Number(d.ownGlassDiscount) || s.ownGlass;
    }
  } catch { /* ใช้ค่า default */ }

  const [ordersSnap, membersSnap] = await Promise.all([
    getDocs(collection(db, ...base, 'orders')),
    getDocs(collection(db, ...base, 'members')),
  ]);
  const orders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const members = membersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const cutoff = Date.now() - DAYS * 24 * 60 * 60 * 1000;
  const orderMs = (o) => toMs(o.createdAt) || toMs(o.date);
  const inWindow = (ms) => ms >= cutoff;

  console.log(`\n=== AUDIT ระบบแต้ม ย้อนหลัง ${DAYS} วัน (ตั้งแต่ ${fmt(cutoff)}) ===`);
  console.log(`เกณฑ์: แลกแต้ม ${s.threshold} แต้ม = ส่วนลด ฿${s.redeemValue} | สมาชิก ${members.length} คน | ออเดอร์ทั้งหมด ${orders.length}\n`);

  const suspects = [];
  let reportedMembers = 0;

  for (const m of members) {
    const phone = String(m.phone || '').trim();
    const nameKey = getNameKey(m.name);

    const memberOrders = orders.filter((o) => {
      if (phone && o.memberPhone === phone) return true;
      if (!nameKey) return false;
      return !o.memberPhone && getNameKey(o.memberNickname) === nameKey;
    });
    const winOrders = memberOrders.filter((o) => inWindow(orderMs(o))).sort((a, b) => orderMs(a) - orderMs(b));

    const history = Array.isArray(m.pointsHistory) ? m.pointsHistory : [];
    const winHist = history.filter((h) => inWindow(toMs(h.at))).sort((a, b) => toMs(a.at) - toMs(b.at));

    if (winOrders.length === 0 && winHist.length === 0) continue; // ไม่มีความเคลื่อนไหวในช่วงนี้
    reportedMembers++;

    const earnedFromOrders = winOrders.reduce((sum, o) => sum + Math.floor(Number(o.total || 0) / 10), 0);
    const recalcTotal = winHist.filter((h) => h.reason === 'recalc').reduce((sum, h) => sum + Number(h.delta || 0), 0);
    const redeemEntries = winHist.filter((h) => h.reason === 'redeem');
    const earnHistTotal = winHist.filter((h) => h.reason === 'order').reduce((sum, h) => sum + Number(h.delta || 0), 0);
    // ออเดอร์ที่ "น่าจะมีการแลกแต้ม" = ส่วนลดถึงมูลค่าแลกแต้ม (order ไม่ได้เก็บ flag usePoints ไว้)
    const maybeRedeemOrders = winOrders.filter((o) => Number(o.discount || 0) >= s.redeemValue);

    console.log('────────────────────────────────────────────────────────');
    console.log(`👤 ${m.name || '(ไม่ระบุชื่อ)'}  [${phone || 'ไม่มีเบอร์'}]  แต้มปัจจุบัน=${Number(m.points || 0)}  รออนุมัติ=${Number(m.pendingPoints || 0)}`);
    console.log(`   ออเดอร์ในช่วง: ${winOrders.length} | แต้มที่ควรได้จากยอดซื้อ ≈ ${earnedFromOrders} | บันทึก history(order) = ${earnHistTotal}`);
    if (redeemEntries.length) console.log(`   🔻 แลกแต้ม (history): ${redeemEntries.length} ครั้ง รวม ${redeemEntries.reduce((s2, h) => s2 + Number(h.delta || 0), 0)} แต้ม`);
    if (maybeRedeemOrders.length) console.log(`   ❓ ออเดอร์ที่ส่วนลด ≥ ฿${s.redeemValue} (อาจแลกแต้ม): ${maybeRedeemOrders.length} รายการ`);

    if (recalcTotal > 0) {
      console.log(`   ⚠️  ระบบเคยเติมแต้มย้อนหลัง (recalc) +${recalcTotal} แต้ม — อาจคืนแต้มที่ลูกค้าแลกไปแล้ว!`);
      suspects.push({ name: m.name, phone, recalcTotal, redeem: redeemEntries.length, maybeRedeem: maybeRedeemOrders.length });
    } else if (redeemEntries.length || maybeRedeemOrders.length) {
      // มีการใช้แต้มแต่ไม่มี recalc → ตรวจดูว่าถูกต้องไหม
      suspects.push({ name: m.name, phone, recalcTotal: 0, redeem: redeemEntries.length, maybeRedeem: maybeRedeemOrders.length });
    }

    // timeline ละเอียด
    if (winHist.length) {
      console.log('   ── ประวัติแต้ม ──');
      for (const h of winHist) console.log(`      ${fmt(toMs(h.at))}  ${Number(h.delta) >= 0 ? '+' : ''}${Number(h.delta)}  (${h.reason || '-'})`);
    }
    if (winOrders.length) {
      console.log('   ── ออเดอร์ ──');
      for (const o of winOrders) {
        const flag = Number(o.discount || 0) >= s.redeemValue ? ' ❓อาจแลกแต้ม' : '';
        console.log(`      ${fmt(orderMs(o))}  ฿${Number(o.total || 0)}  ส่วนลด฿${Number(o.discount || 0)}  earn+${Math.floor(Number(o.total || 0) / 10)}  [${o.status}]${flag}`);
      }
    }
  }

  console.log('\n══════════════════ สรุปรายชื่อที่ควรตรวจ ══════════════════');
  if (suspects.length === 0) {
    console.log('✅ ไม่พบความผิดปกติของแต้มในช่วงเวลานี้');
  } else {
    suspects.sort((a, b) => b.recalcTotal - a.recalcTotal);
    for (const x of suspects) {
      const tags = [];
      if (x.recalcTotal > 0) tags.push(`⚠️ คืนแต้มย้อนหลัง +${x.recalcTotal}`);
      if (x.redeem) tags.push(`แลกแต้ม ${x.redeem} ครั้ง`);
      if (x.maybeRedeem) tags.push(`ออเดอร์น่าสงสัย ${x.maybeRedeem}`);
      console.log(` • ${x.name || '(ไม่ระบุ)'} [${x.phone || '-'}] — ${tags.join(', ')}`);
    }
  }
  console.log(`\nตรวจสมาชิกที่มีความเคลื่อนไหว ${reportedMembers} คน · รายชื่อควรตรวจ ${suspects.length} คน\n`);
  console.log('หมายเหตุ: ออเดอร์ไม่ได้บันทึก flag "ใช้แต้ม" ไว้ จึงอนุมานการแลกแต้มจากส่วนลด (❓) — ใช้ประกอบดุลยพินิจ');
  process.exit(0);
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
