/** verify-matcha.mjs — read-only check that the matcha migration landed. */
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';

const APP_ID = 'siwara-pos-v1';
const app = initializeApp({
  apiKey: 'AIzaSyDQLSceuXischnihqCsaFgrxqX76_OULC8',
  authDomain: 'siwarapos.firebaseapp.com', projectId: 'siwarapos',
  storageBucket: 'siwarapos.firebasestorage.app', messagingSenderId: '516304035232',
  appId: '1:516304035232:web:d561a56266d9c2d16a98c5',
});
await signInAnonymously(getAuth(app));
const db = getFirestore(app);
const base = ['artifacts', APP_ID, 'public', 'data'];

const cats = (await getDocs(collection(db, ...base, 'categories'))).docs.map((d) => ({ id: d.id, ...d.data() }));
console.log('CATEGORIES sorted by order (what QR tab bar shows after "ทั้งหมด"):');
[...cats].sort((a, b) => (a.order ?? 9e9) - (b.order ?? 9e9))
  .forEach((c) => console.log(`  ${String(c.order ?? '-').padStart(3)}  ${c.name}`));

const menu = (await getDocs(collection(db, ...base, 'menu'))).docs.map((d) => d.data());
const matcha = menu.filter((m) => m.category === 'มัทฉะ');
const teaLeft = menu.filter((m) => m.category === 'Tea & Cocoa');
console.log(`\nItems now in "มัทฉะ": ${matcha.length}`);
console.log(`Items still in "Tea & Cocoa": ${teaLeft.length}`);
const strays = teaLeft.filter((m) => /มัทฉะ|matcha|โฮจิฉะ|hojicha/i.test(`${m.name} ${m.nameEn}`));
console.log(`Matcha/Hojicha left behind in Tea & Cocoa (should be 0): ${strays.length}`);
strays.forEach((m) => console.log('  ! ' + m.name));

const pm = await getDoc(doc(db, ...base, 'config', 'publicMenu'));
const b = pm.data();
console.log('\npublicMenu doc (customer read) category order:');
b.categories.forEach((c, i) => console.log(`  ${i + 1}. ${c.name}${c.order != null ? ` (order ${c.order})` : ''}`));
console.log(`publicMenu matcha items: ${b.menu.filter((m) => m.category === 'มัทฉะ').length}`);
process.exit(0);
