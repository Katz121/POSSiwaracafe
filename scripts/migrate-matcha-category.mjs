/**
 * migrate-matcha-category.mjs — carve a standalone "มัทฉะ" (Matcha) category out
 * of "Tea & Cocoa" and make it appear first in the customer QR tab bar.
 *
 * What it does (idempotent — safe to re-run):
 *   1. Ensure a "มัทฉะ" category exists (nameEn: "Matcha").
 *   2. Assign an explicit `order` to every category so the QR/POS tab sequence is
 *      controllable. "มัทฉะ" gets order 1 → first tab (after the built-in "ทั้งหมด").
 *   3. Move every matcha/hojicha drink currently in "Tea & Cocoa" into "มัทฉะ".
 *      (Matched by name; cakes in the "Cake" category are left untouched.)
 *   4. Republish config/publicMenu so the change reaches QR customers immediately,
 *      even while the POS app isn't open (customers read that single doc).
 *
 * USAGE (from D:\code pos\my-pos-app):
 *   node scripts/migrate-matcha-category.mjs           # dry-run (prints the plan)
 *   node scripts/migrate-matcha-category.mjs --apply   # actually write
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  getFirestore, collection, getDocs, doc, getDoc, addDoc, writeBatch,
} from 'firebase/firestore';
import { publishPublicMenu } from '../src/utils/publicMenu.js';

const APPLY = process.argv.includes('--apply');
const APP_ID = 'siwara-pos-v1';
const firebaseConfig = {
  apiKey: 'AIzaSyDQLSceuXischnihqCsaFgrxqX76_OULC8',
  authDomain: 'siwarapos.firebaseapp.com',
  projectId: 'siwarapos',
  storageBucket: 'siwarapos.firebasestorage.app',
  messagingSenderId: '516304035232',
  appId: '1:516304035232:web:d561a56266d9c2d16a98c5',
};

// The new standalone category and where it sits in the tab bar.
const MATCHA_NAME = 'มัทฉะ';
const MATCHA_NAME_EN = 'Matcha';
const SOURCE_CATEGORY = 'Tea & Cocoa';
// Drinks whose name contains any of these move into the Matcha category.
const MATCHA_RE = /มัทฉะ|matcha|โฮจิฉะ|hojicha/i;
// Explicit tab order. Lower = earlier. Matcha first, then the usual flow.
const ORDER = {
  'มัทฉะ': 1,
  'Coffee': 2,
  'Tea & Cocoa': 3,
  'Italian Soda': 4,
  'Milk & Sweet': 5,
  'Cake': 6,
  'combo set': 7,
  'อื่นๆ': 8,
};

const app = initializeApp(firebaseConfig);
await signInAnonymously(getAuth(app));
const db = getFirestore(app);
const base = ['artifacts', APP_ID, 'public', 'data'];
const path = (...p) => collection(db, ...base, ...p);

// --- Load current state ---------------------------------------------------
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

// --- Plan the item moves --------------------------------------------------
const toMove = menu.filter((m) => m.category === SOURCE_CATEGORY && MATCHA_RE.test(`${m.name || ''} ${m.nameEn || ''}`));

console.log(`\n== Matcha category migration (${APPLY ? 'APPLY' : 'DRY-RUN'}) ==`);
console.log(`\nItems to move Tea & Cocoa → "${MATCHA_NAME}" (${toMove.length}):`);
toMove.forEach((m) => console.log(`  • ${m.name}${m.nameEn ? ` / ${m.nameEn}` : ''}`));

const existingMatcha = categories.find((c) => c.name === MATCHA_NAME);
console.log(`\nMatcha category: ${existingMatcha ? `exists (${existingMatcha.id})` : 'will be created'}`);
console.log('\nCategory order to set:');
Object.entries(ORDER).forEach(([n, o]) => console.log(`  ${o}. ${n}`));

if (!APPLY) {
  console.log('\nDry-run only. Re-run with --apply to write.\n');
  process.exit(0);
}

// --- 1. Ensure the Matcha category exists ---------------------------------
let matchaCat = existingMatcha;
if (!matchaCat) {
  const ref = await addDoc(path('categories'), {
    name: MATCHA_NAME, nameEn: MATCHA_NAME_EN, order: ORDER[MATCHA_NAME],
  });
  matchaCat = { id: ref.id, name: MATCHA_NAME, nameEn: MATCHA_NAME_EN, order: ORDER[MATCHA_NAME] };
  categories.push(matchaCat);
  console.log(`\nCreated category "${MATCHA_NAME}" (${ref.id}).`);
}

// --- 2. Batch: set category order + move items ----------------------------
const batch = writeBatch(db);

for (const c of categories) {
  const o = ORDER[c.name];
  if (o != null && c.order !== o) {
    batch.update(doc(db, ...base, 'categories', c.id), { order: o });
    c.order = o; // keep in-memory copy in sync for the bundle
  }
}
for (const m of toMove) {
  batch.update(doc(db, ...base, 'menu', m.id), { category: MATCHA_NAME });
  m.category = MATCHA_NAME; // keep in-memory copy in sync for the bundle
}
await batch.commit();
console.log(`\nApplied: ${toMove.length} items moved, category orders set.`);

// --- 3. Republish the single-doc public menu (sorted like the live app) ----
const sortedCategories = [...categories].sort(
  (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER),
);
const written = await publishPublicMenu(
  db, APP_ID,
  { menu, categories: sortedCategories, beanModifiers, settings },
  null, // force a write regardless of previous bundle
);
console.log(written ? '\nRepublished config/publicMenu (QR customers get it within ~60s).' : '\npublicMenu unchanged.');

console.log('\nDone.\n');
process.exit(0);
