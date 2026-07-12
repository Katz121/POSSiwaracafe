/**
 * bake-landing-menu.mjs — refresh the STATIC menu on the marketing landing page
 * (D:\Siwaracafeweb\index.html) from the shop's live Firestore menu.
 *
 * WHY static-bake instead of fetching on the page:
 *   The landing site is on a free Firebase plan. Fetching the menu from every
 *   visitor's browser would spend one Firestore read per visit and could exhaust
 *   the free daily quota. Baking writes the menu into the HTML as real content
 *   (great for SEO too) and costs exactly ONE read per run of this script —
 *   independent of how many people visit the site.
 *
 * USAGE (from D:\code pos\my-pos-app):
 *   node scripts/bake-landing-menu.mjs
 * Re-run it whenever the shop's menu or prices change, then commit & push the
 * landing repo (Katz121/siwara-cafe → Vercel auto-deploys).
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { readFileSync, writeFileSync } from 'fs';

const LANDING = 'D:/Siwaracafeweb/index.html';
const APP_ID = 'siwara-pos-v1';
const firebaseConfig = {
  apiKey: 'AIzaSyDQLSceuXischnihqCsaFgrxqX76_OULC8',
  authDomain: 'siwarapos.firebaseapp.com',
  projectId: 'siwarapos',
  storageBucket: 'siwarapos.firebasestorage.app',
  messagingSenderId: '516304035232',
  appId: '1:516304035232:web:d561a56266d9c2d16a98c5',
};

// Category display order + bilingual headings. Unknown categories are appended.
const CATS = [
  ['Coffee', 'กาแฟ', 'Coffee'],
  ['มัทฉะ', 'มัทฉะ · โฮจิฉะ', 'Matcha & Hojicha'],
  ['Tea & Cocoa', 'ชา · โกโก้', 'Tea & Cocoa'],
  ['Italian Soda', 'อิตาเลียนโซดา', 'Italian Soda'],
  ['Milk & Sweet', 'นมสด · เครื่องดื่มหวาน', 'Milk & Sweet'],
  ['Cake', 'เค้ก · ของหวาน', 'Cake & Dessert'],
  ['อื่นๆ', 'อื่น ๆ', 'Other'],
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r5 = (n) => Math.ceil((Number(n) || 0) / 5) * 5;
const baht = (n) => '฿' + Number(n).toLocaleString('th-TH');
const priceTH = (m) => (m.allowBeanModifier ? 'เริ่ม ' : '') + baht(m.allowBeanModifier ? r5(m.price) : m.price);

function seqCats(menu) {
  const order = CATS.map((c) => c[0]);
  const extra = [...new Set(menu.map((m) => m.category || 'อื่นๆ'))].filter((c) => !order.includes(c));
  return [...order, ...extra];
}

function renderMenu(menu) {
  let html = '';
  for (const cat of seqCats(menu)) {
    const items = menu.filter((m) => (m.category || 'อื่นๆ') === cat);
    if (!items.length) continue;
    const cd = CATS.find((c) => c[0] === cat);
    const th = cd ? cd[1] : cat, en = cd ? cd[2] : cat;
    items.sort((a, b) => (b.isPinnedBest ? 1 : 0) - (a.isPinnedBest ? 1 : 0) || (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0));
    html += `\n      <div class="menu-cat reveal">\n        <h3 class="menu-cat-title" data-en="${esc(en)}">${esc(th)}</h3>\n        <div class="menu-grid">\n`;
    for (const m of items) {
      const tag = m.isPinnedBest ? `<small class="mi-tag best" data-en="Best seller">★ ขายดี</small>`
        : m.isFeatured ? `<small class="mi-tag rec" data-en="Recommended">แนะนำ</small>` : '';
      html += `          <div class="menu-item"><span class="mi-name">${esc(m.name)}${tag}</span><span class="mi-price">${priceTH(m)}</span></div>\n`;
    }
    html += `        </div>\n      </div>`;
  }
  return html;
}

function jsonldMenu(menu) {
  const sections = [];
  for (const [cat, , en] of CATS) {
    const items = menu.filter((m) => (m.category || 'อื่นๆ') === cat);
    if (!items.length) continue;
    sections.push({
      '@type': 'MenuSection', name: en,
      hasMenuItem: items.map((m) => ({
        '@type': 'MenuItem', name: m.name,
        offers: { '@type': 'Offer', price: Number(m.allowBeanModifier ? r5(m.price) : m.price) || 0, priceCurrency: 'THB' },
      })),
    });
  }
  return { '@context': 'https://schema.org', '@type': 'Menu', name: 'เมนูศิวรา คาเฟ่ · Siwara Cafe Menu', hasMenuSection: sections };
}

function replaceBetween(src, startMark, endMark, replacement, label) {
  const a = src.indexOf(startMark);
  if (a === -1) throw new Error(`marker not found: ${label} start`);
  const b = src.indexOf(endMark, a + startMark.length);
  if (b === -1) throw new Error(`marker not found: ${label} end`);
  return src.slice(0, a + startMark.length) + replacement + src.slice(b);
}

(async () => {
  const app = initializeApp(firebaseConfig);
  await signInAnonymously(getAuth(app));
  const db = getFirestore(app);
  const snap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'config', 'publicMenu')); // 1 read
  if (!snap.exists()) throw new Error('publicMenu doc not found');
  const menu = (snap.data().menu || []).filter((m) => m && m.available !== false && m.name);

  let html = readFileSync(LANDING, 'utf8');
  // Menu list: between `<div id="menuList">` and the closing `</div>\n    <p class="menu-note"`
  html = replaceBetween(html, '<div id="menuList">', '\n    </div>\n    <p class="menu-note"', renderMenu(menu) + '\n    </div>\n    <p class="menu-note"', 'menuList');
  // JSON-LD Menu block
  html = replaceBetween(
    html,
    '<!-- ===== MENU STRUCTURED DATA (baked from shop menu) ===== -->\n<script type="application/ld+json">\n',
    '\n</script>',
    JSON.stringify(jsonldMenu(menu)),
    'jsonld',
  );
  writeFileSync(LANDING, html, 'utf8');
  console.log(`Baked ${menu.length} menu items into ${LANDING}. Commit & push the landing repo to deploy.`);
  process.exit(0);
})().catch((e) => { console.error('bake failed:', e.message); process.exit(1); });
