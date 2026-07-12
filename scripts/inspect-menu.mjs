/** inspect-menu.mjs — read-only dump of categories + matcha-related menu items */
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';

const APP_ID = 'siwara-pos-v1';
const firebaseConfig = {
  apiKey: 'AIzaSyDQLSceuXischnihqCsaFgrxqX76_OULC8',
  authDomain: 'siwarapos.firebaseapp.com',
  projectId: 'siwarapos',
  storageBucket: 'siwarapos.firebasestorage.app',
  messagingSenderId: '516304035232',
  appId: '1:516304035232:web:d561a56266d9c2d16a98c5',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
await signInAnonymously(auth);
const db = getFirestore(app);
const base = ['artifacts', APP_ID, 'public', 'data'];

const catSnap = await getDocs(collection(db, ...base, 'categories'));
console.log('=== CATEGORIES (' + catSnap.size + ') ===');
catSnap.forEach((d) => {
  const c = d.data();
  console.log(JSON.stringify({ id: d.id, name: c.name, nameEn: c.nameEn, order: c.order ?? null }));
});

const menuSnap = await getDocs(collection(db, ...base, 'menu'));
console.log('\n=== MENU (' + menuSnap.size + ' items) — grouped by category ===');
const byCat = {};
menuSnap.forEach((d) => {
  const m = d.data();
  const cat = m.category || '(none)';
  (byCat[cat] ||= []).push({ id: d.id, name: m.name, nameEn: m.nameEn, price: m.price, allowBeanModifier: !!m.allowBeanModifier, modifierGroups: m.modifierGroups || null, available: m.available });
});
for (const [cat, items] of Object.entries(byCat)) {
  console.log(`\n--- ${cat} (${items.length}) ---`);
  items.forEach((i) => console.log('  ' + JSON.stringify(i)));
}

console.log('\n=== items matching มัทฉะ/matcha (by name) ===');
menuSnap.forEach((d) => {
  const m = d.data();
  const hay = ((m.name || '') + ' ' + (m.nameEn || '')).toLowerCase();
  if (hay.includes('มัทฉะ') || hay.includes('matcha')) {
    console.log('  ' + JSON.stringify({ id: d.id, name: m.name, category: m.category, price: m.price, allowBeanModifier: !!m.allowBeanModifier }));
  }
});

console.log('\n=== beanModifiers (groups) ===');
const bmSnap = await getDocs(collection(db, ...base, 'beanModifiers'));
bmSnap.forEach((d) => {
  const b = d.data();
  console.log('  ' + JSON.stringify({ id: d.id, name: b.name, group: b.group, price: b.price }));
});

process.exit(0);
