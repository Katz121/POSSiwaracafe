/**
 * claude-check-sales-logic.mjs — รัน buildSalesHistory ตัวจริงกับข้อมูล Firestore จริง
 * แล้วเทียบกับตัวเลขที่นับแยกไว้ (read-only) · node scripts/claude-check-sales-logic.mjs
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { buildSalesHistory } from '../src/utils/salesHistory.js';
function loadEnv(){const e={};for(const f of ['.env','.env.production','.env.local']){try{const t=readFileSync(new URL(`../${f}`,import.meta.url),'utf8');for(const l of t.split(/\r?\n/)){const m=l.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);if(!m)continue;let v=m[2].trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);e[m[1]]=v;}}catch{}}return e;}
const env=loadEnv();
const app=initializeApp({apiKey:env.VITE_FIREBASE_API_KEY,authDomain:env.VITE_FIREBASE_AUTH_DOMAIN,projectId:env.VITE_FIREBASE_PROJECT_ID,storageBucket:env.VITE_FIREBASE_STORAGE_BUCKET,messagingSenderId:env.VITE_FIREBASE_MESSAGING_SENDER_ID,appId:env.VITE_FIREBASE_APP_ID});
await signInAnonymously(getAuth(app)); const db=getFirestore(app);
const base=['artifacts','siwara-pos-v1','public','data'];
const g=async c=>(await getDocs(collection(db,...base,c))).docs.map(d=>({id:d.id,...d.data()}));
const [orders,expenses]=await Promise.all([g('orders'),g('expenses')]);

const d=buildSalesHistory(orders,expenses,'all');
let pass=0,fail=0;
const chk=(label,actual,expected,tol=1)=>{
  const ok=Math.abs(Number(actual)-Number(expected))<=tol;
  ok?pass++:fail++;
  console.log(`${ok?'✓':'✗'} ${label.padEnd(42)} ได้ ${String(actual).padStart(10)}  ควรได้ ${expected}`);
};
console.log('=== ช่วง "ทั้งหมด" ===');
chk('จำนวนบิลรวม', d.totals.bills, 2028);
chk('ยอดขายรวม', Math.round(d.totals.revenue), 328262, 2);
chk('รายจ่ายรวม', Math.round(d.totals.expense), 165381, 2);
chk('กำไรรวม', Math.round(d.totals.revenue-d.totals.expense), 162880, 2);
chk('จำนวนวันที่มีข้อมูล', d.days.length, 234);
chk('จำนวนวันที่ขาดทุน', d.losses.length, 58);

const m=Object.fromEntries(d.ordered.map(x=>[x.key,x]));
console.log('\n=== รายเดือน ===');
const exp={'2026-01':[153,29908,12532],'2026-02':[172,25234,15102],'2026-03':[156,20436,10596],
 '2026-04':[203,29578,15473],'2026-05':[148,25120,13788],'2026-06':[263,43376,23006],
 '2026-07':[420,69026,35063],'2026-08':[462,77852,39540],'2026-09':[50,7637,280]};
for(const [k,[b,r,e]] of Object.entries(exp)){
  chk(`${k} บิล`, m[k]?.bills.length ?? 'ไม่มี', b);
  chk(`${k} ยอดขาย`, Math.round(m[k]?.revenue ?? 0), r, 2);
  chk(`${k} รายจ่าย`, Math.round(m[k]?.expense ?? 0), e, 2);
}
console.log('\n=== หมวดรายจ่าย ===');
const cat=Object.fromEntries(d.catRows.map(c=>[c.name,c]));
chk('จำนวนหมวด', d.catRows.length, 18);
chk('วัตถุดิบ · รายการ', cat['วัตถุดิบ']?.count, 518);
chk('วัตถุดิบ · ยอด', Math.round(cat['วัตถุดิบ']?.amount ?? 0), 112804, 2);
chk('ค่าไฟ · ยอด', Math.round(cat['ค่าไฟ']?.amount ?? 0), 10200, 2);
chk('ค่าไฟ/น้ำ · ยอด', Math.round(cat['ค่าไฟ/น้ำ']?.amount ?? 0), 7750, 2);

console.log('\n=== หัวข้อรายจ่าย ===');
chk('หัวข้อไม่ซ้ำ', d.titleRows.length, 265);
const t=Object.fromEntries(d.titleRows.map(x=>[x.name,x]));
chk('ค่าไฟรายวัน · ครั้ง', t['ค่าไฟรายวัน']?.count, 143);
chk('ค่าไฟรายวัน · ยอด', Math.round(t['ค่าไฟรายวัน']?.amount ?? 0), 14300, 2);
chk('ผงมัทฉะ · ยอด', Math.round(t['ผงมัทฉะ']?.amount ?? 0), 9923, 2);

console.log('\n=== ต้นทุนคงที่ (เกณฑ์ใหม่ 50%) ===');
console.log('  รายการที่เข้าเกณฑ์:', d.fixedTitles.map(x=>`${x.name} (${x.count})`).join(' · ')||'ไม่มี');
chk('ต้นทุนคงที่รวม', Math.round(d.fixed), 19325, 2);

console.log('\n=== วันในสัปดาห์ ===');
const wd=Object.fromEntries(d.weekdays.map(w=>[w.name,w]));
for(const [n,days,avg] of [['อาทิตย์',34,2337],['จันทร์',9,868],['เสาร์',35,1749]]){
  chk(`${n} · จำนวนวัน`, wd[n]?.days, days);
  chk(`${n} · เฉลี่ย/วัน`, Math.round(wd[n]?.average ?? 0), avg, 2);
}
console.log('\n=== ข้อสังเกตที่ระบบสร้างได้ ===');
d.observations.forEach((o,i)=>console.log(`  ${i+1}. ${o.text}`));
console.log(`\nสรุป: ผ่าน ${pass} · ไม่ผ่าน ${fail}`);
process.exit(fail?1:0);
