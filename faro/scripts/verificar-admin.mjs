/**
 * Verificación del panel de administración en un navegador real.
 *
 * Recorre el flujo completo que se demuestra a jefatura: crear una campaña,
 * enviarla a revisión, comprobar que el autor NO puede aprobarla, aprobarla con
 * otro usuario, publicarla y ver las métricas.
 *
 *   pnpm dev:api      (terminal 1)
 *   pnpm dev:admin    (terminal 2)
 *   node scripts/verificar-admin.mjs
 */
import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ADMIN = process.env.ADMIN ?? 'http://localhost:5173';

let fallos = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { console.log(`  ✗ ${m}`); fallos++; };
const titulo = (m) => console.log(`\n── ${m} ──`);

function buscarChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const raiz = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (existsSync(raiz)) {
    const version = readdirSync(raiz).find((d) => /^chromium-\d+$/.test(d));
    if (version) {
      const ruta = resolve(raiz, version, 'chrome-linux/chrome');
      if (existsSync(ruta)) return ruta;
    }
  }
  for (const c of ['/usr/bin/chromium', '/usr/bin/google-chrome']) {
    if (existsSync(c)) return c;
  }
  return undefined;
}

const navegador = await chromium.launch({
  headless: true,
  executablePath: buscarChromium(),
  args: ['--no-sandbox'],
});

const sufijo = String(Date.now()).slice(-6);

async function entrar(nombreUsuario) {
  const contexto = await navegador.newContext();
  const pagina = await contexto.newPage();
  await pagina.goto(ADMIN);
  await pagina.waitForSelector('select', { timeout: 15_000 });
  // Playwright exige una etiqueta exacta; se resuelve leyendo las opciones.
  const opciones = await pagina.$$eval('select option', (els) =>
    els.map((e) => ({ valor: e.value, etiqueta: e.textContent ?? '' })),
  );
  const elegida = opciones.find((o) => o.etiqueta.includes(nombreUsuario));
  if (!elegida) throw new Error(`No se encontró el usuario "${nombreUsuario}" en el selector`);
  await pagina.selectOption('select', elegida.valor);
  await pagina.click('button:has-text("Entrar")');
  await pagina.waitForSelector('.cabecera', { timeout: 15_000 });
  return { contexto, pagina };
}

try {
  // ── Editor crea la campaña ────────────────────────────────────────────────
  titulo('Sesión del operador de canales');

  const editor = await entrar('Carla Fuentes');
  ok('Carla Fuentes (editor) autenticada');

  const rolVisible = await editor.pagina.textContent('.usuario');
  rolVisible.includes('editor') ? ok('el rol se muestra en la cabecera') : fail(`rol inesperado: ${rolVisible}`);

  const hayInterruptor = await editor.pagina.$('button:has-text("Interruptor global")');
  hayInterruptor
    ? fail('el editor ve el interruptor global (debería ser solo para admin)')
    : ok('el editor NO ve el interruptor global');

  titulo('Creación de campaña');

  await editor.pagina.click('button:has-text("Nueva campaña")');
  await editor.pagina.waitForSelector('h1:has-text("Nueva campaña")');

  await editor.pagina.fill('input[type="text"] >> nth=0', `Contingencia de prueba ${sufijo}`);
  await editor.pagina.fill('input.mono', `prueba-panel-${sufijo}`);

  // Título con carga XSS: debe verse como texto en la vista previa.
  const tituloXss = '<img src=x onerror=alert(1)>';
  const camposTexto = await editor.pagina.$$('input[type="text"]');
  await camposTexto[2].fill(tituloXss);

  await editor.pagina.fill('textarea', 'Cuerpo de prueba con *negrita*.');
  await editor.pagina.waitForTimeout(600);

  const previa = await editor.pagina.textContent('.previsualizacion');
  previa.includes('onerror')
    ? ok('la vista previa muestra la carga XSS como texto, no la ejecuta')
    : fail('la vista previa no reflejó el título');

  const imgsEnPrevia = await editor.pagina.$$eval('.previsualizacion img', (els) => els.length);
  imgsEnPrevia === 0
    ? ok('el título no generó nodos HTML en la vista previa')
    : fail('¡el contenido del operador se interpretó como HTML!');

  await editor.pagina.click('button:has-text("Crear campaña")');

  // La confirmación real de que la creación funcionó es que aparezcan las
  // acciones de gobierno: el aviso de éxito es solo cosmético.
  const creada = await editor.pagina
    .waitForSelector('button:has-text("Enviar a revisión")', { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  if (creada) {
    ok('campaña creada y en estado borrador, lista para enviar a revisión');
  } else {
    const error = await editor.pagina.textContent('.aviso.error').catch(() => '(sin mensaje)');
    fail(`no se creó la campaña: ${error}`);
  }

  // ── Doble control ─────────────────────────────────────────────────────────
  titulo('Doble control');

  await editor.pagina.click('button:has-text("Enviar a revisión")');
  await editor.pagina.waitForTimeout(2000);

  const avisoAutor = await editor.pagina.textContent('.aviso.alerta').catch(() => '');
  avisoAutor.includes('no puedes aprobarla')
    ? ok('el panel advierte al autor que no puede aprobar su propia campaña')
    : fail('falta la advertencia de doble control');

  const botonAprobar = await editor.pagina.$('button:has-text("Aprobar")');
  botonAprobar
    ? fail('el editor ve el botón de aprobar')
    : ok('el editor no tiene el botón de aprobar (le falta el rol)');

  // ── Aprobador ─────────────────────────────────────────────────────────────
  titulo('Sesión del aprobador');

  const aprobador = await entrar('Rodrigo Pizarro');
  ok('Rodrigo Pizarro (approver) autenticado');

  await aprobador.pagina.click(`tr:has-text("prueba-panel-${sufijo}") button:has-text("Abrir")`);
  await aprobador.pagina.waitForTimeout(2000);

  const botonAprobarAP = await aprobador.pagina.$('button:has-text("Aprobar")');
  if (!botonAprobarAP) {
    fail('el aprobador no ve el botón de aprobar');
  } else {
    const deshabilitado = await botonAprobarAP.isDisabled();
    deshabilitado
      ? fail('el botón está deshabilitado para un aprobador distinto del autor')
      : ok('el aprobador (distinto del autor) puede aprobar');

    await botonAprobarAP.click();
    await aprobador.pagina.waitForTimeout(2000);

    const estado = await aprobador.pagina.textContent('.insignia');
    estado.includes('aprobada') ? ok('campaña aprobada') : fail(`estado tras aprobar: ${estado}`);
  }

  titulo('Publicación');

  const botonPublicar = await aprobador.pagina.$('button:has-text("Publicar")');
  if (botonPublicar) {
    await botonPublicar.click();
    await aprobador.pagina.waitForTimeout(2500);
    const estado = await aprobador.pagina.textContent('.insignia');
    estado.includes('activa') ? ok('campaña activa y firmada') : fail(`estado tras publicar: ${estado}`);
  } else {
    fail('no apareció el botón de publicar');
  }

  const botonDetener = await aprobador.pagina.$('button:has-text("Detener ahora")');
  botonDetener ? ok('el interruptor por campaña está disponible') : fail('falta el botón de detener');

  // ── Métricas ──────────────────────────────────────────────────────────────
  titulo('Métricas');

  await aprobador.pagina.click('button:has-text("← Volver")');
  await aprobador.pagina.waitForTimeout(1200);
  await aprobador.pagina.click(`tr:has-text("prueba-panel-${sufijo}") button:has-text("Métricas")`);
  await aprobador.pagina.waitForSelector('.metrica', { timeout: 12_000 });

  const etiquetas = await aprobador.pagina.$$eval('.metrica__etiqueta', (els) => els.map((e) => e.textContent));
  etiquetas.some((e) => e.includes('Elegibles')) ? ok('embudo con denominador de elegibles') : fail('falta "Elegibles"');
  etiquetas.some((e) => e.includes('Alcance')) ? ok('alcance único diferenciado de impresiones') : fail('falta "Alcance"');
  etiquetas.some((e) => e.includes('Confirmaron')) ? ok('tasa de confirmación de lectura presente') : fail('falta el acuse');

  titulo('Adopción');

  await aprobador.pagina.click('button:has-text("Adopción")');
  await aprobador.pagina.waitForSelector('.metrica', { timeout: 12_000 });

  const textoAdopcion = await aprobador.pagina.textContent('.contenido');
  textoAdopcion.includes('Instalados totales') ? ok('base instalada') : fail('falta instalados totales');
  textoAdopcion.includes('Activos 7 días') ? ok('activos 7 días — la métrica de salud real') : fail('falta activos 7d');

  titulo('Auditoría');

  await aprobador.pagina.click('button:has-text("Auditoría")');
  // Esperar a que la tabla tenga filas, no solo a que exista: se renderiza
  // vacía mientras llega la respuesta.
  await aprobador.pagina.waitForFunction(
    () => (document.querySelectorAll('tbody tr').length ?? 0) > 0,
    { timeout: 15_000 },
  );

  const filas = await aprobador.pagina.$$eval('tbody tr', (els) => els.map((e) => e.textContent));
  filas.some((f) => f.includes('publicar')) ? ok('la publicación quedó auditada') : fail('la publicación no aparece');
  filas.some((f) => f.includes('aprobar')) ? ok('la aprobación quedó auditada') : fail('la aprobación no aparece');

  // ── Admin ─────────────────────────────────────────────────────────────────
  titulo('Rol de administrador');

  // Deja el estado limpio: la campaña de prueba es P0 y ganaría el arbitraje
  // de superficie frente a las campañas del seed, interfiriendo con
  // verificar-extension.mjs. Pausarla aquí también ejercita el interruptor.
  titulo('Limpieza');

  await aprobador.pagina.click('button:has-text("Campañas")');
  await aprobador.pagina.waitForSelector(`tr:has-text("prueba-panel-${sufijo}")`, { timeout: 12_000 });
  await aprobador.pagina.click(`tr:has-text("prueba-panel-${sufijo}") button:has-text("Abrir")`);
  await aprobador.pagina.waitForSelector('button:has-text("Detener ahora")', { timeout: 12_000 });
  await aprobador.pagina.click('button:has-text("Detener ahora")');
  await aprobador.pagina.waitForTimeout(2000);

  const estadoFinal = await aprobador.pagina.textContent('.insignia');
  estadoFinal.includes('pausada')
    ? ok('campaña de prueba detenida: el entorno queda limpio')
    : fail(`no se pudo detener la campaña de prueba (estado: ${estadoFinal})`);

  const admin = await entrar('Soledad Ramírez');
  // La lista de campañas carga de forma asíncrona y el interruptor vive en su
  // cabecera.
  await admin.pagina.waitForSelector('h1:has-text("Campañas")', { timeout: 15_000 });
  await admin.pagina.waitForTimeout(1200);
  const interruptorAdmin = await admin.pagina.$('button:has-text("Interruptor global")');
  interruptorAdmin ? ok('el admin sí ve el interruptor global') : fail('el admin no ve el interruptor global');

  await editor.contexto.close();
  await aprobador.contexto.close();
  await admin.contexto.close();
} finally {
  await navegador.close();
}

console.log();
console.log(
  fallos === 0
    ? '════ EL PANEL FUNCIONA DE PUNTA A PUNTA ════'
    : `════ ${fallos} VERIFICACIÓN(ES) FALLARON ════`,
);
process.exit(fallos === 0 ? 0 : 1);
