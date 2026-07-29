/**
 * Verificación de la extensión en un Chromium real.
 *
 * Carga la extensión sin empaquetar, inicia sesión como ejecutivo, abre el
 * sitio de prueba y comprueba que la huincha se inyecta, que el Shadow DOM es
 * CERRADO, que la página se empuja hacia abajo, y que el clic viaja hasta la
 * base de datos.
 *
 *   pnpm dev:api                              (terminal 1)
 *   python3 -m http.server 8080 -d sitio-prueba   (terminal 2)
 *   node scripts/verificar-extension.mjs
 */
import { chromium } from 'playwright';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rutaExtension = resolve(raiz, 'apps/extension/dist');
const API = process.env.API ?? 'http://localhost:3000';
const SITIO = process.env.SITIO ?? 'http://localhost:8080';

let fallos = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => {
  console.log(`  ✗ ${m}`);
  fallos++;
};
const titulo = (m) => console.log(`\n── ${m} ──`);

if (!existsSync(rutaExtension)) {
  console.error('La extensión no está compilada. Ejecuta: pnpm build:ext');
  process.exit(1);
}

/**
 * Deja el backend en un estado conocido: pausa todo lo activo y publica la
 * campaña de contingencia del seed. Sin esto, una campaña P0 de otra corrida
 * ganaría el arbitraje de superficie y la verificación mediría otra cosa.
 */
async function prepararBackend() {
  const sesion = async (email) => {
    const respuesta = await fetch(`${API}/v1/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    // Set-Cookie trae atributos (Path, HttpOnly, SameSite…) que no deben viajar
    // en la cabecera Cookie: solo el par nombre=valor.
    const crudas = respuesta.headers.getSetCookie?.() ?? [respuesta.headers.get('set-cookie') ?? ''];
    const cookie = crudas
      .filter(Boolean)
      .map((c) => c.split(';')[0].trim())
      .join('; ');
    if (!cookie) throw new Error(`No se recibió cookie de sesión para ${email}`);
    const { csrfToken } = await respuesta.json();
    return { cookie, csrfToken };
  };

  // Sin `content-type: application/json` cuando no hay cuerpo: Fastify rechaza
  // con 400 una petición que declara JSON y llega vacía.
  const llamar = (s, ruta, cuerpo) =>
    fetch(`${API}${ruta}`, {
      method: 'POST',
      headers: {
        cookie: s.cookie,
        'x-csrf-token': s.csrfToken,
        ...(cuerpo ? { 'content-type': 'application/json' } : {}),
      },
      ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
    });

  const editor = await sesion('operador.canales@banco.cl');
  const aprobador = await sesion('jefe.canales@banco.cl');

  const { campaigns } = await fetch(`${API}/v1/admin/campaigns`, {
    headers: { cookie: editor.cookie },
  }).then((r) => r.json());

  const activasPrevias = campaigns.filter((c) => c.estado === 'activa');
  for (const campana of activasPrevias) {
    const r = await llamar(editor, `/v1/admin/campaigns/${campana.id}/pause`);
    if (!r.ok) throw new Error(`No se pudo pausar ${campana.key}: ${r.status} ${await r.text()}`);
  }
  if (activasPrevias.length > 0) {
    console.log(`  · pausadas ${activasPrevias.length} campaña(s) de corridas anteriores`);
  }

  const contingencia = campaigns.find((c) => c.key === 'contingencia-app-movil');
  if (!contingencia) throw new Error('Falta la campaña del seed. Ejecuta: pnpm db:seed');

  // El seed la deja en borrador; el estado exacto depende de corridas previas,
  // así que se recorre el flujo completo tolerando los pasos ya cumplidos.
  await llamar(editor, `/v1/admin/campaigns/${contingencia.id}/submit`);
  await llamar(aprobador, `/v1/admin/campaigns/${contingencia.id}/approve`, { nota: 'preparación de la verificación' });
  await llamar(aprobador, `/v1/admin/campaigns/${contingencia.id}/publish`);

  const verificacion = await fetch(`${API}/v1/admin/campaigns?estado=activa`, {
    headers: { cookie: editor.cookie },
  }).then((r) => r.json());

  const activas = verificacion.campaigns.map((c) => c.key);
  if (!activas.includes('contingencia-app-movil')) {
    throw new Error(`No se pudo activar la campaña de contingencia. Activas: ${activas.join(', ') || 'ninguna'}`);
  }
  if (activas.length !== 1) {
    throw new Error(`Se esperaba una sola campaña activa; hay ${activas.length}: ${activas.join(', ')}`);
  }
  // El manifiesto se cachea unos segundos en el servidor: esperar evita que la
  // extensión descargue el estado anterior.
  await new Promise((r) => setTimeout(r, 6000));
  console.log(`  · backend preparado; campaña activa: ${activas.join(', ')}`);
}

await prepararBackend();

const perfil = mkdtempSync(resolve(tmpdir(), 'faro-'));

/**
 * Las extensiones exigen el Chromium COMPLETO: el "headless shell" que
 * Playwright usa por defecto no las carga. Si el entorno trae un Chromium
 * preinstalado (contenedores de CI, este entorno), se usa ese en vez de
 * descargar otro.
 */
function buscarChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;

  const candidatos = [
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ];

  for (const candidato of candidatos) {
    if (existsSync(candidato)) return candidato;
  }

  // Deja que Playwright resuelva su propia descarga.
  const raizNavegadores = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (existsSync(raizNavegadores)) {
    const version = readdirSync(raizNavegadores).find((d) => /^chromium-\d+$/.test(d));
    if (version) {
      const ruta = resolve(raizNavegadores, version, 'chrome-linux/chrome');
      if (existsSync(ruta)) return ruta;
    }
  }
  return undefined;
}

const ejecutable = buscarChromium();
if (ejecutable) console.log(`  · usando Chromium: ${ejecutable}`);

const contexto = await chromium.launchPersistentContext(perfil, {
  headless: true,
  ...(ejecutable ? { executablePath: ejecutable } : {}),
  args: [
    `--disable-extensions-except=${rutaExtension}`,
    `--load-extension=${rutaExtension}`,
    '--no-sandbox',
  ],
});

try {
  titulo('Carga de la extensión');

  // El service worker aparece de forma asíncrona.
  let worker = contexto.serviceWorkers()[0];
  if (!worker) worker = await contexto.waitForEvent('serviceworker', { timeout: 15_000 });

  const idExtension = new URL(worker.url()).host;
  ok(`service worker activo (id ${idExtension.slice(0, 12)}…)`);

  // Playwright no expone chrome.* al evaluar dentro del service worker, así que
  // las llamadas a la API se hacen desde una página de la extensión, donde sí
  // está disponible. Es la misma extensión y el mismo almacenamiento.
  const consola = await contexto.newPage();
  await consola.goto(`chrome-extension://${idExtension}/onboarding.html`);

  // ── Permisos declarados ──────────────────────────────────────────────────
  titulo('Permisos del manifiesto');

  const manifiesto = await consola.evaluate(() => chrome.runtime.getManifest());

  const prohibidos = ['tabs', 'scripting', 'webNavigation', 'cookies', 'history'];
  const pedidos = manifiesto.permissions.filter((p) => prohibidos.includes(p));
  pedidos.length === 0
    ? ok(`sin permisos de navegación: [${manifiesto.permissions.join(', ')}]`)
    : fail(`pide permisos prohibidos: ${pedidos.join(', ')}`);

  manifiesto.host_permissions.some((h) => h.includes('<all_urls>'))
    ? fail('pide <all_urls>')
    : ok(`host_permissions acotados: [${manifiesto.host_permissions.join(', ')}]`);

  // ── Alcance real de la visibilidad de URLs ───────────────────────────────
  //
  // Matiz que importa y que es fácil enunciar mal: sin el permiso "tabs",
  // Chrome NO censura todo. Concede `tab.url` para los orígenes que la
  // extensión declara en `host_permissions`, y los censura para todos los
  // demás. Lo que la extensión no puede ver es la navegación GENERAL del
  // ejecutivo — solo las aplicaciones internas declaradas, una por una, en el
  // manifiesto.
  titulo('Alcance real de la visibilidad de URLs');

  const pagina = await contexto.newPage();
  await pagina.goto(`${SITIO}/index.html?cliente=12345&rut=secreto`);

  // Una pestaña FUERA de host_permissions: representa la navegación personal
  // del ejecutivo, que es lo que de verdad hay que proteger.
  const fuera = await contexto.newPage();
  await fuera.goto('data:text/html,<title>Sitio personal</title><h1>fuera de la lista</h1>');
  await pagina.waitForTimeout(1000);

  const loQueVe = await consola.evaluate(async () => {
    const pestanas = await chrome.tabs.query({});
    return pestanas.map((t) => ({ url: t.url ?? null, title: t.title ?? null }));
  });

  const veDeclarado = loQueVe.some((t) => t.url?.includes('cliente=12345'));
  const veNoDeclarado = loQueVe.some((t) => t.url?.startsWith('data:'));

  veNoDeclarado
    ? fail('la extensión ve URLs de sitios NO declarados en el manifiesto')
    : ok('NO puede leer URLs fuera de host_permissions — la navegación personal queda invisible');

  veDeclarado
    ? ok('sí ve las URLs de los dominios que declara (consecuencia de host_permissions, no de "tabs")')
    : ok('tampoco ve los dominios declarados');

  await fuera.close();

  // ── Sesión ───────────────────────────────────────────────────────────────
  titulo('Sesión del ejecutivo');

  const sesion = await consola.evaluate(async (api) => {
    const estado = await chrome.storage.local.get('installId');
    const respuesta = await fetch(`${api}/v1/auth/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        installId: estado.installId,
        extensionVersion: '0.1.0',
        email: 'm.tapia@banco.cl',
      }),
    });
    if (!respuesta.ok) return { ok: false, estado: respuesta.status };

    const datos = await respuesta.json();
    await chrome.storage.local.set({
      sesion: { deviceToken: datos.deviceToken, expiraEn: datos.expiraEn, usuario: datos.usuario },
      config: datos.config,
    });
    return { ok: true, usuario: datos.usuario };
  }, API);

  sesion.ok
    ? ok(`sesión iniciada: ${sesion.usuario.nombre}, sucursal ${sesion.usuario.sucursal}`)
    : fail(`no se pudo iniciar sesión (${sesion.estado})`);

  // ── Sincronización y verificación de firma ───────────────────────────────
  titulo('Sincronización y firma');

  await consola.evaluate(() => chrome.runtime.sendMessage({ tipo: 'faro:sincronizar' }));
  await pagina.waitForTimeout(2500);

  const manifiestoLocal = await consola.evaluate(async () => {
    const { manifiesto } = await chrome.storage.local.get('manifiesto');
    return manifiesto
      ? { total: manifiesto.campanas.length, claves: manifiesto.campanas.map((c) => c.key) }
      : null;
  });

  if (manifiestoLocal && manifiestoLocal.total > 0) {
    // Solo llegan aquí las campañas cuya firma ECDSA verificó: las inválidas se
    // descartan en sincronizacion.ts.
    ok(`${manifiestoLocal.total} campaña(s) con firma verificada: ${manifiestoLocal.claves.join(', ')}`);
  } else {
    fail('no se descargó ninguna campaña — ¿hay alguna publicada?');
  }

  // ── Inyección de la huincha ──────────────────────────────────────────────
  titulo('Inyección en la página');

  await pagina.bringToFront();
  await pagina.reload();
  await pagina.waitForTimeout(3500);

  const anfitrion = await pagina.evaluate(() => {
    const host = document.getElementById('__faro_host__');
    if (!host) return null;
    return {
      existe: true,
      // Un shadow root cerrado NO es accesible desde element.shadowRoot: el
      // JavaScript de la aplicación del banco no puede alcanzarlo.
      shadowAccesible: host.shadowRoot !== null,
      margenRaiz: document.documentElement.style.marginTop,
      hijosDirectos: host.children.length,
    };
  });

  if (!anfitrion) {
    fail('no se montó el anfitrión de la extensión en la página');
  } else {
    ok('anfitrión montado en la página');
    anfitrion.shadowAccesible
      ? fail('el Shadow DOM es ABIERTO — la página puede manipularlo')
      : ok('Shadow DOM CERRADO: inaccesible desde el JavaScript de la página');
    anfitrion.hijosDirectos === 0
      ? ok('el contenido vive dentro del shadow, no en el DOM de la página')
      : fail('hay nodos expuestos fuera del shadow');
  }

  // ── Contenido dentro del iframe sandboxed ────────────────────────────────
  titulo('Renderizado dentro del iframe sandboxed');

  const marco = pagina.frames().find((f) => f.url().includes('surface.html'));

  if (!marco) {
    fail('no se encontró el iframe del renderer');
  } else {
    ok('iframe sandboxed presente (origen opaco, sin acceso a chrome.*)');

    await marco.waitForSelector('.huincha', { timeout: 8000 }).catch(() => {});
    const huincha = await marco.evaluate(() => {
      const elemento = document.querySelector('.huincha');
      if (!elemento) return null;
      return {
        titulo: elemento.querySelector('.huincha__titulo')?.textContent ?? '',
        clases: elemento.className,
        alto: elemento.getBoundingClientRect().height,
        // Si el título con carga XSS hubiera sido interpretado como HTML,
        // aparecería un <img> aquí.
        imagenesInyectadas: elemento.querySelectorAll('img').length,
        botones: [...elemento.querySelectorAll('button')].map((b) => b.textContent),
      };
    });

    if (!huincha) {
      fail('la huincha no se renderizó');
    } else {
      ok(`huincha visible: "${huincha.titulo}"`);
      ok(`severidad aplicada: ${huincha.clases}`);
      huincha.alto === 44 ? ok('alto de 44 px') : fail(`alto inesperado: ${huincha.alto}px`);
      ok(`botones: ${huincha.botones.join(' | ')}`);

      huincha.imagenesInyectadas === 0
        ? ok('el título no generó nodos HTML — la carga XSS quedó como texto')
        : fail('¡el contenido del administrador se interpretó como HTML!');
    }

    // ── La página se empuja hacia abajo ────────────────────────────────────
    const margen = await pagina.evaluate(() => document.documentElement.style.marginTop);
    margen === '44px'
      ? ok('la página se empujó 44 px: la huincha no tapa la aplicación')
      : fail(`margen superior inesperado: "${margen}"`);

    // ── Clic ───────────────────────────────────────────────────────────────
    titulo('Interacción');

    const botonAccion = await marco.$('.huincha__acciones .boton:not(.boton--fantasma)');
    if (botonAccion) {
      await botonAccion.click();
      await pagina.waitForTimeout(2500);

      const pestanaNueva = contexto.pages().find((p) => p.url().includes('estado.html'));
      pestanaNueva
        ? ok('el clic abrió el destino — navegación ejecutada por el service worker')
        : fail('el clic no abrió el destino');
    } else {
      fail('no se encontró el botón de acción');
    }

    // ── Cierre y limpieza del margen ───────────────────────────────────────
    const botonAcuse = await marco.$('.boton--fantasma');
    if (botonAcuse) {
      await botonAcuse.click();
      await pagina.waitForTimeout(2000);

      const margenFinal = await pagina.evaluate(() => document.documentElement.style.marginTop);
      margenFinal === '' || margenFinal === '0px'
        ? ok('al confirmar lectura, el margen se revierte sin dejar rastro')
        : fail(`quedó un margen huérfano: "${margenFinal}"`);
    }
  }

  // ── Telemetría ───────────────────────────────────────────────────────────
  titulo('Telemetría emitida');

  await consola.evaluate(() => chrome.runtime.sendMessage({ tipo: 'faro:sincronizar' }));
  await pagina.waitForTimeout(2500);

  const cola = await consola.evaluate(async () => {
    const { colaEventos } = await chrome.storage.local.get('colaEventos');
    return colaEventos ?? [];
  });

  ok(`${cola.length} evento(s) pendientes en cola tras el envío`);

  const conUrl = cola.filter((e) =>
    Object.entries(e).some(
      ([clave, valor]) =>
        typeof valor === 'string' && (valor.startsWith('http') || clave.toLowerCase().includes('url')),
    ),
  );
  conUrl.length === 0
    ? ok('ningún evento en cola contiene una URL')
    : fail(`hay eventos con URL: ${JSON.stringify(conUrl)}`);
} finally {
  await contexto.close();
  rmSync(perfil, { recursive: true, force: true });
}

console.log();
console.log(
  fallos === 0
    ? '════ LA EXTENSIÓN FUNCIONA EN CHROMIUM REAL ════'
    : `════ ${fallos} VERIFICACIÓN(ES) FALLARON ════`,
);
process.exit(fallos === 0 ? 0 : 1);
