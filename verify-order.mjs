import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

const OUT_DIR = resolve('./design-screenshots');
mkdirSync(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox'],
});

const errors = [];
try {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto('http://localhost:5173/order', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));

  // 1) Find a menu card whose price text contains "เริ่มต้น" (= allowBeanModifier item)
  const beanCardIdx = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('main .grid > *')];
    const idx = cards.findIndex(c => c.innerText.includes('เริ่มต้น'));
    return idx;
  });
  console.log('Bean-enabled card index (with "เริ่มต้น"):', beanCardIdx);

  if (beanCardIdx >= 0) {
    await page.evaluate((i) => {
      const cards = [...document.querySelectorAll('main .grid > *')];
      cards[i].click();
    }, beanCardIdx);
    await new Promise(r => setTimeout(r, 1200));
    // Capture any modal/dialog text
    const modalInfo = await page.evaluate(() => {
      // Heuristic: the topmost fixed overlay containing buttons
      const all = [...document.querySelectorAll('div')].filter(d => {
        const s = getComputedStyle(d);
        return s.position === 'fixed' && d.innerText && d.innerText.includes('เลือก');
      });
      const modal = all[all.length - 1];
      return modal ? modal.innerText.slice(0, 500) : '(no modal with เลือก found)';
    });
    console.log('--- BEAN MODAL TEXT ---');
    console.log(modalInfo);
    await page.screenshot({ path: `${OUT_DIR}/bean-modal.png`, fullPage: false });
    console.log('✓ bean-modal.png saved');
    // close modal by Escape
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 500));
  }

  // 2) Add several items then open cart drawer to inspect scroll/proceed overlap
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('main .grid > *')];
    // click first 6 non-bean cards (avoid opening modal)
    let added = 0;
    for (const c of cards) {
      if (!c.innerText.includes('เริ่มต้น')) { c.click(); added++; }
      if (added >= 6) break;
    }
  });
  await new Promise(r => setTimeout(r, 800));
  // open cart drawer via sticky bar
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('ดูตะกร้า') || b.innerText.includes('ดูตะกร้า'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: `${OUT_DIR}/cart-drawer.png`, fullPage: false });
  console.log('✓ cart-drawer.png saved');
  const drawerHasProceed = await page.evaluate(() => document.body.innerText.includes('ดำเนินการต่อ'));
  console.log('Drawer shows "ดำเนินการต่อ":', drawerHasProceed);

  console.log('--- Console errors (' + errors.length + ') ---');
  errors.forEach(e => console.log('  ✗', e));
  await page.close();
} finally {
  await browser.close();
}
