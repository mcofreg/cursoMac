/**
 * Build de la extensión.
 *
 * Tres pasadas, porque los targets de MV3 tienen requisitos distintos:
 *
 *   1. content.js  → IIFE. Los content scripts NO pueden ser módulos ES.
 *   2. background + páginas → ESM (el service worker se declara type: module).
 *   3. manifest.json, íconos, y la comprobación anti-innerHTML.
 *
 * Sin CRXJS a propósito: una dependencia menos que puede romperse entre
 * versiones de Vite, y el proceso queda explícito y depurable.
 */
import { build } from 'vite';
import preact from '@preact/preset-vite';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, cpSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raizExt = resolve(aqui, '..');
const raizRepo = resolve(raizExt, '../..');
const salida = resolve(raizExt, 'dist');
const observar = process.argv.includes('--watch');

const paquete = JSON.parse(readFileSync(resolve(raizExt, 'package.json'), 'utf8'));
const VERSION = paquete.version;
const API_BASE = process.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

// ── Clave pública de firma ───────────────────────────────────────────────────
// Va embebida en el binario. Si viniera del servidor, quien comprometiera el
// servidor podría sustituirla y toda la verificación dejaría de servir.
const rutaClave = resolve(raizRepo, 'keys/signing-public.b64');
if (!existsSync(rutaClave)) {
  console.error('\nFalta la clave pública de firma.');
  console.error('Ejecuta primero:  pnpm keys:generate\n');
  process.exit(1);
}
const CLAVE_PUBLICA = readFileSync(rutaClave, 'utf8').trim();

const definiciones = {
  __API_BASE__: JSON.stringify(API_BASE),
  __VERSION__: JSON.stringify(VERSION),
  __CLAVE_PUBLICA__: JSON.stringify(CLAVE_PUBLICA),
  'process.env.NODE_ENV': JSON.stringify('production'),
};

// ── Pasada 1: content script (IIFE) ──────────────────────────────────────────

async function construirContentScript() {
  await build({
    root: raizExt,
    configFile: false,
    define: definiciones,
    logLevel: 'warn',
    build: {
      outDir: salida,
      emptyOutDir: true,
      minify: false, // legible para la revisión de Seguridad
      lib: {
        entry: resolve(raizExt, 'src/content/index.ts'),
        formats: ['iife'],
        name: 'FaroContent',
        fileName: () => 'content.js',
      },
      watch: observar ? {} : null,
    },
  });
}

// ── Pasada 2: service worker y páginas (ESM) ────────────────────────────────

async function construirResto() {
  await build({
    root: raizExt,
    configFile: false,
    plugins: [preact()],
    define: definiciones,
    logLevel: 'warn',
    build: {
      outDir: salida,
      emptyOutDir: false, // conserva content.js
      minify: false,
      modulePreload: false,
      rollupOptions: {
        input: {
          background: resolve(raizExt, 'src/background/index.ts'),
          surface: resolve(raizExt, 'src/surface/surface.html'),
          popup: resolve(raizExt, 'src/popup/popup.html'),
          sidepanel: resolve(raizExt, 'src/sidepanel/sidepanel.html'),
          onboarding: resolve(raizExt, 'src/onboarding/onboarding.html'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name].js',
          assetFileNames: 'assets/[name][extname]',
          format: 'es',
        },
      },
      watch: observar ? {} : null,
    },
  });
}

// ── Pasada 3: manifiesto, íconos y comprobaciones ───────────────────────────

const ORIGENES_INYECCION = (process.env.INJECTION_ORIGINS ?? 'http://localhost:8080')
  .split(',')
  .map((o) => `${o.trim().replace(/\/$/, '')}/*`);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ESTA FUNCIÓN GENERA LO QUE REVISA SEGURIDAD TI.
 *
 * Es la ÚNICA fuente de verdad del manifiesto: no hay una segunda copia en el
 * código fuente que pueda quedar desincronizada.
 *
 * Permisos deliberadamente ausentes:
 *
 *   · SIN "tabs"        → Chrome censura `url` y `title` de las pestañas cuyo
 *                         origen no esté en `host_permissions`. La navegación
 *                         general del ejecutivo —banca personal, correo,
 *                         cualquier sitio fuera de la lista— es invisible.
 *
 *                         MATIZ QUE HAY QUE ENUNCIAR BIEN: para los orígenes SÍ
 *                         declarados, Chrome entrega la URL. Tener
 *                         `host_permissions` sobre un dominio implica poder leer
 *                         la dirección de sus pestañas. Verificado en Chromium
 *                         real por scripts/verificar-extension.mjs.
 *
 *                         Que esas direcciones no se registren ni se transmitan
 *                         no lo garantiza el manifiesto sino el diseño: el
 *                         content script no tiene acceso a red, el puente filtra
 *                         contra una lista blanca de campos, el esquema de
 *                         eventos no admite ninguno capaz de llevar una URL, y
 *                         la ingesta rechaza el lote si aparece uno.
 *
 *   · SIN "scripting"   → no puede inyectar código en tiempo de ejecución; los
 *                         content scripts son estáticos y están declarados aquí.
 *
 *   · SIN "<all_urls>"  → la lista de dominios está aquí, y ampliarla exige
 *                         publicar una versión nueva, que pasa por revisión de
 *                         la Chrome Web Store.
 *
 *   · SIN "webNavigation", "cookies", "history", "downloads", "debugger".
 *
 * `verificarManifiesto()` falla el build si alguno de esos permisos reaparece.
 * ═══════════════════════════════════════════════════════════════════════════
 */
function manifiesto() {
  return {
    manifest_version: 3,
    name: 'Faro — Comunicaciones de canales digitales',
    short_name: 'Faro',
    version: VERSION,
    description:
      'Alertas de contingencia y comunicaciones de canales digitales. No registra la navegación.',
    minimum_chrome_version: '120',

    background: { service_worker: 'background.js', type: 'module' },

    permissions: ['storage', 'alarms', 'notifications', 'sidePanel'],
    host_permissions: [...ORIGENES_INYECCION, `${API_BASE}/*`],

    content_scripts: [
      {
        matches: ORIGENES_INYECCION,
        js: ['content.js'],
        run_at: 'document_idle',
        all_frames: false,
      },
    ],

    sandbox: { pages: ['surface.html'] },

    content_security_policy: {
      extension_pages: `script-src 'self'; object-src 'none'; base-uri 'none'; connect-src 'self' ${API_BASE}`,
      sandbox: `sandbox allow-scripts; script-src 'self'; object-src 'none'; base-uri 'none'; style-src 'unsafe-inline'; img-src 'self' data: ${API_BASE}`,
    },

    web_accessible_resources: [
      {
        resources: ['surface.html', 'assets/*', 'chunks/*'],
        matches: ORIGENES_INYECCION,
        use_dynamic_url: true,
      },
    ],

    action: {
      default_title: 'Faro — Comunicaciones',
      default_popup: 'popup.html',
      default_icon: { 16: 'assets/icono-16.png', 48: 'assets/icono-48.png', 128: 'assets/icono-128.png' },
    },
    icons: { 16: 'assets/icono-16.png', 48: 'assets/icono-48.png', 128: 'assets/icono-128.png' },
    side_panel: { default_path: 'sidepanel.html' },
    externally_connectable: { matches: [] },
  };
}

/**
 * Los archivos HTML quedan anidados bajo src/…; Vite los emite respetando la
 * ruta de entrada. Se mueven a la raíz de dist, que es donde el manifiesto los
 * busca.
 */
function aplanarHtml() {
  const paginas = ['surface', 'popup', 'sidepanel', 'onboarding'];
  const carpetas = { surface: 'surface', popup: 'popup', sidepanel: 'sidepanel', onboarding: 'onboarding' };

  for (const pagina of paginas) {
    const anidado = resolve(salida, `src/${carpetas[pagina]}/${pagina}.html`);
    if (!existsSync(anidado)) continue;

    let html = readFileSync(anidado, 'utf8');
    // Las rutas relativas suben un nivel de más tras aplanar.
    html = html.replace(/(src|href)="\.\.\/\.\.\//g, '$1="');
    html = html.replace(/(src|href)="\.\//g, '$1="');
    writeFileSync(resolve(salida, `${pagina}.html`), html);
  }
}

function copiarIconos() {
  const destino = resolve(salida, 'assets');
  mkdirSync(destino, { recursive: true });

  const origen = resolve(raizExt, 'public/assets');
  if (existsSync(origen)) cpSync(origen, destino, { recursive: true });
}

/**
 * Comprobación anti-XSS del código fuente.
 *
 * Falla el build si NUESTRO código contiene una vía para interpretar cadenas
 * como HTML o como código. Es la red de seguridad de la regla "el
 * administrador nunca inyecta marcado": si alguien reintrodujera un
 * `innerHTML` en el renderer, el build no pasa y hay que justificarlo.
 *
 * Se revisa el fuente y no el bundle a propósito: el runtime de Preact
 * contiene `innerHTML` internamente (es cómo implementa el soporte de
 * `dangerouslySetInnerHTML`, que nosotros no usamos), así que revisar el
 * compilado daría un falso positivo permanente y la comprobación acabaría
 * desactivada. Preact escapa todo el texto por defecto; lo que importa
 * controlar es que nosotros no usemos la escotilla de escape.
 */
function verificarFuente() {
  const prohibidos = [
    { patron: /\.innerHTML\s*=/, nombre: 'innerHTML' },
    { patron: /\.outerHTML\s*=/, nombre: 'outerHTML' },
    { patron: /insertAdjacentHTML/, nombre: 'insertAdjacentHTML' },
    { patron: /dangerouslySetInnerHTML/, nombre: 'dangerouslySetInnerHTML' },
    { patron: /document\.write/, nombre: 'document.write' },
    { patron: /\beval\s*\(/, nombre: 'eval' },
    { patron: /new\s+Function\s*\(/, nombre: 'new Function' },
  ];

  const hallazgos = [];

  const recorrer = (directorio) => {
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      const ruta = resolve(directorio, entrada.name);

      if (entrada.isDirectory()) {
        recorrer(ruta);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entrada.name)) continue;

      const codigo = readFileSync(ruta, 'utf8');
      // Se ignoran los comentarios: este mismo archivo y varios otros mencionan
      // "innerHTML" al explicar por qué no se usa.
      const sinComentarios = codigo
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');

      for (const { patron, nombre } of prohibidos) {
        if (patron.test(sinComentarios)) {
          hallazgos.push(`${ruta.replace(raizExt + '/', '')}: ${nombre}`);
        }
      }
    }
  };

  recorrer(resolve(raizExt, 'src'));

  if (hallazgos.length > 0) {
    console.error('\n✗ El código contiene construcciones que permiten inyección de HTML o código:');
    for (const hallazgo of hallazgos) console.error(`    ${hallazgo}`);
    console.error('\n  El renderer debe construir nodos con createElement/textContent.\n');
    process.exit(1);
  }

  console.log('  ✓ sin innerHTML, eval ni equivalentes en el código de la extensión');
}

function verificarManifiesto() {
  const m = JSON.parse(readFileSync(resolve(salida, 'manifest.json'), 'utf8'));
  const prohibidos = ['tabs', 'scripting', 'webNavigation', 'cookies', 'history', 'downloads', 'debugger'];

  const encontrados = m.permissions.filter((p) => prohibidos.includes(p));
  if (encontrados.length > 0) {
    console.error(`\n✗ El manifiesto pide permisos que rompen la garantía de privacidad: ${encontrados.join(', ')}\n`);
    process.exit(1);
  }

  if (m.host_permissions.some((h) => h.includes('<all_urls>') || h === '*://*/*')) {
    console.error('\n✗ El manifiesto pide acceso a todos los sitios.\n');
    process.exit(1);
  }

  console.log('  ✓ sin permisos tabs/scripting ni <all_urls>');
}

// ── Orquestación ─────────────────────────────────────────────────────────────

console.log('Compilando la extensión…');

await construirContentScript();
await construirResto();

aplanarHtml();
copiarIconos();
writeFileSync(resolve(salida, 'manifest.json'), JSON.stringify(manifiesto(), null, 2));

verificarFuente();
verificarManifiesto();

console.log(`\nListo: ${salida}`);
console.log('Cárgala en chrome://extensions → Modo desarrollador → Cargar descomprimida\n');
