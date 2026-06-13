/**
 * seo.js — runtime SEO for the customer ordering page.
 *
 * The site is a client-rendered SPA, so the static <head> in index.html can only
 * carry generic shop branding. Once the live menu loads from Firestore we enrich
 * the page with the REAL shop name and a JSON-LD `CafeOrCoffeeShop` document
 * (built from the actual menu) so search engines and link unfurlers understand
 * what this page is and what it sells.
 *
 * Everything here is best-effort and DOM-only — it never throws into React.
 */

const JSONLD_ID = 'siwara-jsonld';
const SITE_URL = 'https://www.siwara.cafe/';

function setMeta(selector, attr, value) {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

/**
 * Apply the shop name to the document title + description/OG tags, and inject
 * (or replace) a JSON-LD structured-data block describing the menu.
 *
 * @param {object}   opts
 * @param {string}   opts.shopName    Live shop name from settings.
 * @param {Array}    opts.menu        Menu items (only `available !== false` used).
 * @param {Array}    opts.categories  Category docs ({ name }) for menu sections.
 */
export function applyCustomerSEO({ shopName, menu = [], categories = [] }) {
  if (typeof document === 'undefined') return;
  try {
    const name = (shopName || '').trim() || 'Siwara Cafe';
    const title = `${name} — สั่งเมนูออนไลน์ | เมนูแนะนำ & ขายดี`;
    const description =
      `สั่งเมนูของ ${name} ผ่าน QR — ดูเมนูแนะนำและเมนูขายดี กาแฟสด เค้ก และเครื่องดื่ม พร้อมสะสมแต้มสมาชิก`;

    document.title = title;
    setMeta('meta[name="description"]', 'content', description);
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', description);

    // --- JSON-LD: CafeOrCoffeeShop + nested Menu ----------------------------
    const available = menu.filter((m) => m && m.available !== false && m.name);

    // Group items into menu sections by category (only categories that have items).
    const catNames = [...new Set(categories.map((c) => c?.name).filter(Boolean))];
    const sections = catNames
      .map((cat) => {
        const items = available
          .filter((m) => m.category === cat)
          .slice(0, 30) // cap per section — keep the document lean
          .map((m) => ({
            '@type': 'MenuItem',
            name: m.name,
            ...(m.description ? { description: String(m.description).slice(0, 160) } : {}),
            offers: {
              '@type': 'Offer',
              price: Number(m.price) || 0,
              priceCurrency: 'THB',
            },
          }));
        return items.length ? { '@type': 'MenuSection', name: cat, hasMenuItem: items } : null;
      })
      .filter(Boolean);

    const jsonld = {
      '@context': 'https://schema.org',
      '@type': 'CafeOrCoffeeShop',
      name,
      url: SITE_URL,
      servesCuisine: ['Coffee', 'Cafe', 'Dessert'],
      priceRange: '฿฿',
      acceptsReservations: false,
      image: `${SITE_URL}icons/icon-512x512.svg`,
      ...(sections.length
        ? { hasMenu: { '@type': 'Menu', name: `เมนู ${name}`, hasMenuSection: sections } }
        : {}),
    };

    let script = document.getElementById(JSONLD_ID);
    if (!script) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.id = JSONLD_ID;
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(jsonld);
  } catch {
    // SEO enrichment is non-critical — never let it break the page.
  }
}
