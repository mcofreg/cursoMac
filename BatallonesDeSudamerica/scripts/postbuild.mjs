// Tras `vite build`, genera además dist-single/index.html: el juego completo en un solo archivo HTML
// (CSS y JS incrustados) para compartirlo o abrirlo sin servidor.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const assets = join(dist, 'assets');
for (const f of readdirSync(assets)) {
  const content = readFileSync(join(assets, f), 'utf8');
  if (f.endsWith('.js')) {
    html = html.replace(new RegExp(`<script type="module"[^>]*src="\\./assets/${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*></script>`), () => `<script type="module">${content.replace(/<\/script>/g, '<\\/script>')}</script>`);
  } else if (f.endsWith('.css')) {
    html = html.replace(new RegExp(`<link rel="stylesheet"[^>]*href="\\./assets/${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`), () => `<style>${content}</style>`);
  }
}
mkdirSync('dist-single', { recursive: true });
writeFileSync(join('dist-single', 'index.html'), html);
console.log(`dist-single/index.html: ${(html.length / 1024).toFixed(0)} KB`);

// Variante para publicar como Artifact (sin doctype/html/head/body: sólo title, style, contenido y script).
const inner = html
  .replace(/^[\s\S]*?<head>/, '')
  .replace(/<\/head>\s*<body>/, '')
  .replace(/<\/body>\s*<\/html>\s*$/, '')
  .replace(/<meta[^>]*>\s*/g, '')
  .replace(/<link[^>]*>\s*/g, '');
writeFileSync(join('dist-single', 'artifact.html'), inner);
console.log(`dist-single/artifact.html: ${(inner.length / 1024).toFixed(0)} KB`);
