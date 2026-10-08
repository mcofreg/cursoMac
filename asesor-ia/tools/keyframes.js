// Renderiza frames clave como PNG para revisión visual.
// uso: node tools/keyframes.js 4.5 12.9 ...   (sin args: lista por defecto)
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const ROOT = path.resolve(__dirname, '..');
(async () => {
  const times = process.argv.slice(2).map(Number);
  const list = times.length ? times : [1.5, 4.8, 7.2, 9.5, 11.8, 13.6, 15.5, 17.3, 19.2, 23.8, 25.9, 29.5, 33.4, 37.5, 39.8, 42.0, 44.5, 46.6, 49.0, 52.0, 56.0];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', (m) => console.log('[page]', m.text()));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
  await page.addInitScript((d) => { window.DATA = d; }, data);
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForFunction(() => window.__ready === true);
  fs.mkdirSync(path.join(ROOT, 'frames'), { recursive: true });
  for (const t of list) {
    await page.evaluate((tt) => window.renderAt(tt), t);
    const f = path.join(ROOT, 'frames', `kf_${t.toFixed(1).padStart(5, '0')}.png`);
    await page.locator('#c').screenshot({ path: f });
    console.log(f);
  }
  await browser.close();
})();
