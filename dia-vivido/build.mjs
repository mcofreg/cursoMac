// Junta la app en un solo archivo (dia-vivido.html) que abre con doble clic,
// sin servidor: los módulos de src/ no cargan desde file://.
import { readFileSync, writeFileSync } from 'node:fs';

const MODULES = ['logic', 'state', 'view', 'app']; // en orden de dependencia
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

function inline(name) {
  const source = read(`src/${name}.js`);
  const exported = [...source.matchAll(/^export (?:const|function) (\w+)/gm)].map((match) => match[1]);
  const body = source
    .replace(/^import \* as (\w+) from '\.\/(\w+)\.js';$/gm, 'const $1 = __$2;')
    .replace(/^import (\{[^}]+\}) from '\.\/(\w+)\.js';$/gm, 'const $1 = __$2;')
    .replace(/^export /gm, '');
  return `const __${name} = (() => {\n${body}\nreturn { ${exported.join(', ')} };\n})();`;
}

const page = read('index.html')
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${read('style.css')}</style>`)
  .replace('<script type="module" src="src/app.js"></script>', () => `<script>\n${MODULES.map(inline).join('\n')}\n</script>`);

writeFileSync(new URL('dia-vivido.html', import.meta.url), page);
console.log(`dia-vivido.html: ${page.length} caracteres`);
