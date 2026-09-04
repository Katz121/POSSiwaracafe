/**
 * claude-verify-sales-history.mjs — คำนวณตัวเลขเกณฑ์ตรวจรับของหน้า "ประวัติการขาย" จากข้อมูลจริง (read-only)
 *   node scripts/claude-verify-sales-history.mjs
 * ใช้เทียบกับสิ่งที่หน้าเว็บแสดง · ไม่เขียนอะไรลง Firestore
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
function loadEnv(){const e={};for(const f of ['.env','.env.production','.env.local']){try{const t=readFileSync(new URL(`../${f}`,import.meta.url),'utf8');for(const l of t.split(/\r?\n/)){const m=l.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);if(!m)continue;let v=m[2].trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);e[m[1]]=v;}}catch{}}return e;}
const env=loadEnv();
const app=initializeApp({apiKey:env.VITE_FIREBASE_API_KEY,authDomain:env.VITE_FIREBASE_AUTH_DOMAIN,projectId:env.VITE_FIREBASE_PROJECT_ID,storageBucket:env.VITE_FIREBASE_STORAGE_BUCKET,messagingSenderId:env.VITE_FIREBASE_MESSAGING_SENDER_ID,appId:env.VITE_FIREBASE_APP_ID});
await signInAnonymously(getAuth(app)); const db=getFirestore(app);
const base=['artifacts','siwara-pos-v1','public','data'];
const g=async c=>(await getDocs(collection(db,...base,c))).docs.map(d=>({id:d.id,...d.data()}));
const [orders,expenses]=await Promise.all([g('orders'),g('expenses')]);
const iso=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||''));
const B=orders.filter(o=>!o.status||o.status==='completed');
const money=n=>'฿'+Math.round(n).toLocaleString();

const M={};
for(const o of B){const k=iso(o.date)?String(o.date).slice(0,7):'ไม่ระบุ';(M[k]=M[k]||{bills:0,rev:0,exp:0}).bills++;M[k].rev+=+o.total||0;}
for(const e of expenses){const k=iso(e.date)?String(e.date).slice(0,7):'ไม่ระบุ';(M[k]=M[k]||{bills:0,rev:0,exp:0}).exp+=+e.amount||0;}
console.log('=== รายเดือน (ช่วง "ทั้งหมด") ===');
console.log('เดือน      บิล      ยอดขาย      รายจ่าย   จ่าย/ขาย        กำไร');
let tb=0,tr=0,te=0;
for(const [k,v] of Object.entries(M).sort()){tb+=v.bills;tr+=v.rev;te+=v.exp;
  console.log(`${k.padEnd(9)}${String(v.bills).padStart(4)}  ${money(v.rev).padStart(10)}  ${money(v.exp).padStart(10)}  ${(v.rev?Math.round(v.exp/v.rev*100)+'%':'—').padStart(7)}  ${money(v.rev-v.exp).padStart(10)}`);}
console.log(`รวม      ${String(tb).padStart(4)}  ${money(tr).padStart(10)}  ${money(te).padStart(10)}  ${Math.round(te/tr*100)}%  ${money(tr-te).padStart(10)}`);

const cat={};for(const e of expenses){const c=e.category||'(ไม่ระบุ)';(cat[c]=cat[c]||{n:0,s:0}).n++;cat[c].s+=+e.amount||0;}
console.log('\n=== รายจ่ายแยกหมวด ===');
for(const [c,v] of Object.entries(cat).sort((a,b)=>b[1].s-a[1].s))
  console.log(`  ${c.padEnd(20)}${String(v.n).padStart(4)}  ${money(v.s).padStart(10)}  ${(v.s/te*100).toFixed(1)}%`);

const ti={};for(const e of expenses){const t=String(e.title||'(ไม่ระบุ)').trim();(ti[t]=ti[t]||{n:0,s:0,last:''}).n++;ti[t].s+=+e.amount||0;if(String(e.date||'')>ti[t].last)ti[t].last=String(e.date||'');}
console.log(`\n=== หัวข้อไม่ซ้ำ ${Object.keys(ti).length} แบบ · 20 อันดับ ===`);
for(const [t,v] of Object.entries(ti).sort((a,b)=>b[1].s-a[1].s).slice(0,20))
  console.log(`  ${t.slice(0,24).padEnd(26)}${String(v.n).padStart(4)} ครั้ง ${money(v.s).padStart(9)}  เฉลี่ย ${money(v.s/v.n).padStart(7)}  ล่าสุด ${v.last}`);

const dR={},dE={};
for(const o of B) if(iso(o.date)) dR[o.date]=(dR[o.date]||0)+(+o.total||0);
for(const e of expenses) if(iso(e.date)) dE[e.date]=(dE[e.date]||0)+(+e.amount||0);
const days=[...new Set([...Object.keys(dR),...Object.keys(dE)])].sort();
const loss=days.filter(d=>(dR[d]||0)-(dE[d]||0)<0);
console.log(`\n=== วัน ===\nมีข้อมูล ${days.length} วัน · ขาดทุน ${loss.length} วัน (${Math.round(loss.length/days.length*100)}%)`);
console.log('ขาดทุนหนักสุด 5 วัน:');
for(const d of loss.sort((a,b)=>((dR[a]||0)-(dE[a]||0))-((dR[b]||0)-(dE[b]||0))).slice(0,5))
  console.log(`  ${d}  ขาย ${money(dR[d]||0).padStart(8)}  จ่าย ${money(dE[d]||0).padStart(8)}  =  ${money((dR[d]||0)-(dE[d]||0))}`);
const wd=['อา','จ','อ','พ','พฤ','ศ','ส'],W={};
for(const d of Object.keys(dR)){const k=wd[new Date(d+'T00:00:00').getDay()];(W[k]=W[k]||{n:0,s:0}).n++;W[k].s+=dR[d];}
console.log('\n=== ยอดขายแยกวันในสัปดาห์ ===');
for(const k of wd) if(W[k]) console.log(`  ${k.padEnd(4)}${String(W[k].n).padStart(3)} วัน  เฉลี่ย ${money(W[k].s/W[k].n).padStart(8)}  รวม ${money(W[k].s)}`);
// ต้นทุนคงที่ (จ่าย > 60% ของวัน)
console.log('\n=== หัวข้อที่จ่ายเกือบทุกวัน (>60% ของ '+days.length+' วัน) ===');
let fixedSum=0;
for(const [t,v] of Object.entries(ti).sort((a,b)=>b[1].s-a[1].s)) if(v.n/days.length>0.6){fixedSum+=v.s;console.log(`  ${t.padEnd(20)}${v.n} ครั้ง (${Math.round(v.n/days.length*100)}% ของวัน)  ${money(v.s)}`);}
console.log(`  รวมต้นทุนคงที่ ${money(fixedSum)} = ${(fixedSum/te*100).toFixed(1)}% ของรายจ่าย · เฉลี่ย ${money(fixedSum/days.length)}/วัน`);
process.exit(0);
