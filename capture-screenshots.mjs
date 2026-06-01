import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

const OUT_DIR = resolve('./design-screenshots');
mkdirSync(OUT_DIR, { recursive: true });

const sizes = [
  { name: 'desktop', width: 1280, height: 800, wait: 6000 },
  { name: 'tablet',  width: 768,  height: 1024, wait: 2000 },
  { name: 'mobile',  width: 375,  height: 812, wait: 2000 },
];

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox'],
});

try {
  for (const s of sizes) {
    const page = await browser.newPage();
    await page.setViewport({ width: s.width, height: s.height, deviceScaleFactor: 2 });
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, s.wait));
    const out = `${OUT_DIR}/pos-${s.name}.png`;
    await page.screenshot({ path: out, fullPage: false });
    console.log(`✓ Saved ${out} (${s.width}x${s.height})`);
    await page.close();
  }
} finally {
  await browser.close();
}
