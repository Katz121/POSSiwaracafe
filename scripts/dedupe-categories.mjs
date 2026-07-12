/**
 * dedupe-categories.mjs — remove duplicate category docs (same name) and
 * re-index every category's `order` to a clean 0..n sequence by current order,
 * then republish config/publicMenu.
 *
 * Menu items reference categories by NAME string, so deleting a duplicate doc
 * never orphans an item. We keep the first doc per name (lowest order) and drop
 * the rest.
 *
 * USAGE (from D:\code pos\my-pos-app):
 *   node scripts/dedupe-categories.mjs           # dry-run
 *   node scripts/dedupe-categories.mjs --apply
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  getFirestore, collection, getDocs, doc, getDoc, deleteDoc, writeBatch,
} from 'firebase/firestore';
import { publishPublicMenu } from '../src/utils/publicMenu.js';

const APPLY = process.argv.includes('--apply');
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
const path = (...p) => collection(db, ...base, ...p);

const [catSnap, menuSnap, beanSnap, settingsSnap] = await Promise.all([
  getDocs(path('categories')),
  getDocs(path('menu')),
  getDocs(path('beanModifiers')),
  getDoc(doc(db, ...base, 'config', 'settings')),
]);

let categories = catSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
const menu = menuSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
const beanModifiers = beanSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
const settings = settingsSnap.exists() ? settingsSnap.data() : {};

// Sort by current order (nulls last) so "keep the first" = keep the earliest tab.
categories.sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));

const seen = new Set();
const keep = [];
const dropDupes = [];
for (const c of categories) {
  const key = (c.name || '').trim().toLowerCase();
  if (seen.has(key)) dropDupes.push(c);
  else { seen.add(key); keep.push(c); }
}

console.log(`\n== Dedupe categories (${APPLY ? 'APPLY' : 'DRY-RUN'}) ==`);
console.log(`\nDuplicate docs to delete (${dropDupes.length}):`);
dropDupes.forEach((c) => console.log(`  • ${c.name} (${c.id})`));

console.log('\nFinal category order after re-index:');
keep.forEach((c, i) => console.log(`  ${i}. ${c.name}${c.order === i ? '' : `  (was ${c.order ?? '-'})`}`));

if (!APPLY) {
  console.log('\nDry-run only. Re-run with --apply to write.\n');
  process.exit(0);
}

// Delete duplicates.
for (const c of dropDupes) {
  await deleteDoc(doc(db, ...base, 'categories', c.id));
}

// Re-index kept categories to 0..n-1.
const batch = writeBatch(db);
keep.forEach((c, i) => {
  if (c.order !== i) {
    batch.update(doc(db, ...base, 'categories', c.id), { order: i });
    c.order = i;
  }
});
await batch.commit();
console.log(`\nDeleted ${dropDupes.length} duplicate(s), re-indexed ${keep.length} categories.`);

// Republish the customer bundle (categories already in 0..n order).
const written = await publishPublicMenu(db, APP_ID, { menu, categories: keep, beanModifiers, settings }, null);
console.log(written ? 'Republished config/publicMenu.' : 'publicMenu unchanged.');
console.log('\nDone.\n');
process.exit(0);
