// Renderiza el video completo: Chromium headless dibuja cada frame en <canvas>,
// las capturas PNG se envían por tubería a ffmpeg (sin guardar miles de PNG en disco).
// uso: node tools/render.js [workers=3]
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const T = require('../src/timeline.js');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'entrega');
const TMP = path.join(ROOT, 'frames', 'partes');
fs.mkdirSync(TMP, { recursive: true });
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
const tl = T.build(data);
const FPS = data.meta.fps;
const total = Math.round(tl.duration * FPS);
const workers = Number(process.argv[2] || 3);

async function renderPart(k, f0, f1) {
  const file = path.join(TMP, `parte_${k}.mp4`);
  const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.addInitScript((d) => { window.DATA = d; }, data);
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForFunction(() => window.__ready === true);
  const canvas = page.locator('#c');
  const t0 = Date.now();
  for (let f = f0; f < f1; f++) {
    await page.evaluate((tt) => window.renderAt(tt), f / FPS);
    const png = await canvas.screenshot({ type: 'png' });
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
    if ((f - f0) % 90 === 0) console.log(`[w${k}] frame ${f}/${f1 - 1}  ${((Date.now() - t0) / Math.max(1, f - f0)).toFixed(0)} ms/frame`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  await browser.close();
  return file;
}

(async () => {
  const t0 = Date.now();
  const per = Math.ceil(total / workers);
  const parts = await Promise.all([...Array(workers).keys()].map((k) => renderPart(k, k * per, Math.min(total, (k + 1) * per))));
  fs.writeFileSync(path.join(TMP, 'lista.txt'), parts.map((p) => `file '${p}'`).join('\n'));
  const video = path.join(TMP, 'video_sin_audio.mp4');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(TMP, 'lista.txt'), '-c', 'copy', video]);
  // audio: mezcla sintetizada, normalizada en loudness (−16 LUFS)
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-i', path.join(OUT, 'mezcla.wav'),
    '-filter_complex', '[1:a]loudnorm=I=-16:TP=-1.5:LRA=11[a]', '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', path.join(OUT, 'asesor_ia.mp4')]);
  console.log(`listo: ${total} frames en ${((Date.now() - t0) / 1000).toFixed(0)} s → entrega/asesor_ia.mp4`);
})();
