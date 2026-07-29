import type { CampanaFirmada, PerfilUsuario } from '@faro/contracts';
import { API_BASE, VERSION_EXTENSION } from '../lib/config.ts';
import {
  claveDeHoy,
  escribirEstado,
  escribirSesionNavegador,
  leerEstado,
  leerSesionNavegador,
} from '../lib/storage.ts';
import { encolar, enviarCola, sanearEvento } from './eventos.ts';
import { arbitrar, evaluarCampanas, registroActualizado, type Decision } from './elegibilidad.ts';
import { enviarLatido, sincronizar } from './sincronizacion.ts';
import { validarDestino } from './urls.ts';

/**
 * Service worker.
 *
 * Todo el diseño asume que este proceso muere a los ~30 segundos de
 * inactividad: no hay estado en memoria, no hay setInterval, y cada handler
 * lee lo que necesita de chrome.storage.
 */

const ALARMA_SYNC = 'faro-sync';
const ALARMA_LATIDO = 'faro-latido';
const ALARMA_EVENTOS = 'faro-eventos';

// ── Ciclo de vida ────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (detalle) => {
  await programarAlarmas();

  if (detalle.reason === 'install') {
    // Pantalla de transparencia: qué se registra y qué no. Se muestra ANTES de
    // pedir sesión, porque el compromiso de privacidad tiene que ser lo primero
    // que el ejecutivo vea, no una casilla escondida.
    await chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }

  await cicloCompleto('instalacion');
});

chrome.runtime.onStartup.addListener(async () => {
  await programarAlarmas();
  await cicloCompleto('arranque');
});

chrome.alarms.onAlarm.addListener(async (alarma) => {
  if (alarma.name === ALARMA_SYNC) await cicloCompleto('alarma');
  else if (alarma.name === ALARMA_LATIDO) await enviarLatido();
  else if (alarma.name === ALARMA_EVENTOS) await enviarCola();
});

async function programarAlarmas(): Promise<void> {
  const estado = await leerEstado();

  // Chrome 120 permite un mínimo de 30 s. Durante una contingencia P0 el
  // servidor devuelve `pollSegundos: 30` y la latencia máxima se reduce a la
  // mitad; el resto del tiempo, 60 s.
  await chrome.alarms.create(ALARMA_SYNC, {
    periodInMinutes: Math.max(estado.config.pollSegundos / 60, 0.5),
  });
  await chrome.alarms.create(ALARMA_LATIDO, {
    periodInMinutes: estado.config.latidoSegundos / 60,
  });
  await chrome.alarms.create(ALARMA_EVENTOS, {
    periodInMinutes: estado.config.flushEventosSegundos / 60,
  });
}

// ── Ciclo principal ──────────────────────────────────────────────────────────

async function cicloCompleto(motivo: string): Promise<void> {
  const resultado = await sincronizar(motivo !== 'pagina');
  const estado = await leerEstado();

  if (!estado.sesion) {
    await chrome.action.setBadgeText({ text: '' });
    await desmontarEnTodasLasPestanas();
    return;
  }

  // Interruptor global: desmonta todo y deja solo los latidos. El botón rojo
  // para "la extensión está rompiendo el CRM".
  if (resultado.killGlobal) {
    await chrome.action.setBadgeText({ text: '' });
    await desmontarEnTodasLasPestanas();
    return;
  }

  const perfil = perfilDesdeSesion(estado.sesion);
  const mostradasEnSesion = await leerSesionNavegador<string[]>('mostradasEnSesion', []);
  const pestana = await pestanaActiva();
  const origen = pestana?.url ? origenDe(pestana.url) : null;

  const decisiones = await evaluarCampanas(
    resultado.campanas,
    perfil,
    estado,
    origen,
    mostradasEnSesion,
  );

  await registrarEntregas(decisiones, estado.installId);

  const { ganadoras, perdedoras } = arbitrar(decisiones);

  for (const perdedora of perdedoras) {
    if (!perdedora.motivoSupresion) continue;
    await encolar({
      tipo: 'suprimido',
      campaignId: perdedora.campana.id,
      campaignVersion: perdedora.campana.version,
      variante: perdedora.variante,
      formato: perdedora.campana.presentacion.formato,
      motivoSupresion: perdedora.motivoSupresion,
      sessionId: await sessionIdActual(),
    });
  }

  await actualizarInsignia(ganadoras);
  await notificarCriticas(ganadoras);
  await sincronizarSuperficies(ganadoras);
}

/**
 * Emite `entregado` una vez por campaña y versión, incluido el grupo de control.
 *
 * Sin este registro para el control no habría línea base contra la cual
 * comparar la incrementalidad.
 */
async function registrarEntregas(decisiones: Decision[], _installId: string): Promise<void> {
  const yaEntregadas = await leerSesionNavegador<string[]>('entregadas', []);
  const nuevas: string[] = [];

  for (const decision of decisiones) {
    const clave = `${decision.campana.id}:${decision.campana.version}`;
    if (yaEntregadas.includes(clave)) continue;

    await encolar({
      tipo: 'entregado',
      campaignId: decision.campana.id,
      campaignVersion: decision.campana.version,
      variante: decision.variante,
      formato: decision.campana.presentacion.formato,
      sessionId: await sessionIdActual(),
    });
    nuevas.push(clave);
  }

  if (nuevas.length > 0) {
    await escribirSesionNavegador('entregadas', [...yaEntregadas, ...nuevas]);
  }
}

async function actualizarInsignia(ganadoras: Decision[]): Promise<void> {
  if (ganadoras.length === 0) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }
  const criticas = ganadoras.filter((d) => d.campana.prioridad === 0).length;
  await chrome.action.setBadgeText({ text: String(ganadoras.length) });
  await chrome.action.setBadgeBackgroundColor({ color: criticas > 0 ? '#C62828' : '#1565C0' });
}

/**
 * Notificación del sistema operativo para contingencias.
 *
 * Es el único canal que llega al ejecutivo aunque tenga Chrome minimizado y
 * esté trabajando en Citrix o en una aplicación de escritorio — el escenario
 * que hay que medir antes de comprometerse con este proyecto.
 */
async function notificarCriticas(ganadoras: Decision[]): Promise<void> {
  const notificadas = await leerSesionNavegador<string[]>('notificadas', []);
  const nuevas: string[] = [];

  for (const decision of ganadoras) {
    if (decision.campana.prioridad !== 0) continue;

    const clave = `${decision.campana.id}:${decision.campana.version}`;
    if (notificadas.includes(clave)) continue;

    const campos = decision.campana.contenido.campos as { titulo: string; cuerpo?: string };

    try {
      await chrome.notifications.create(`faro-${decision.campana.id}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/icono-128.png'),
        title: campos.titulo,
        message: campos.cuerpo || 'Comunicación de canales digitales',
        priority: 2,
        requireInteraction: true,
      });
      nuevas.push(clave);
    } catch {
      // Las notificaciones pueden estar bloqueadas por política; no es fatal.
    }
  }

  if (nuevas.length > 0) {
    await escribirSesionNavegador('notificadas', [...notificadas, ...nuevas]);
  }
}

// ── Montaje y desmontaje de superficies ──────────────────────────────────────

/**
 * Envía a la pestaña activa exactamente lo que debe mostrar.
 *
 * Solo la pestaña activa: así una impresión se cuenta una vez por dispositivo,
 * no una por pestaña abierta. La decisión la toma el service worker, no el
 * content script.
 */
async function sincronizarSuperficies(ganadoras: Decision[]): Promise<void> {
  const pestana = await pestanaActiva();
  if (!pestana?.id) return;

  const carga = ganadoras.map((d) => ({
    id: d.campana.id,
    version: d.campana.version,
    prioridad: d.campana.prioridad,
    contenido: d.campana.contenido,
    presentacion: d.campana.presentacion,
    variante: d.variante,
  }));

  try {
    await chrome.tabs.sendMessage(pestana.id, { tipo: 'faro:mostrar', campanas: carga });
  } catch {
    // Sin content script en esa pestaña (dominio fuera de la lista): normal.
  }
}

async function desmontarEnTodasLasPestanas(): Promise<void> {
  // Nótese que esto NO requiere el permiso "tabs": chrome.tabs.query devuelve
  // los objetos con url y title redactados, y aquí solo se necesita el id.
  const pestanas = await chrome.tabs.query({});
  for (const pestana of pestanas) {
    if (!pestana.id) continue;
    try {
      await chrome.tabs.sendMessage(pestana.id, { tipo: 'faro:mostrar', campanas: [] });
    } catch {
      // Pestaña sin content script.
    }
  }
}

// ── Mensajes desde el content script ─────────────────────────────────────────

chrome.runtime.onMessage.addListener((mensaje, remitente, responder) => {
  manejarMensaje(mensaje, remitente)
    .then(responder)
    .catch(() => responder({ ok: false }));
  // Devolver true mantiene abierto el canal para la respuesta asíncrona.
  return true;
});

async function manejarMensaje(mensaje: unknown, remitente: chrome.runtime.MessageSender) {
  const msg = mensaje as { tipo?: string; [k: string]: unknown };

  switch (msg.tipo) {
    case 'faro:hola':
      // Verificación oportunista al cargar una página: si la caché tiene más de
      // 20 s, se refresca antes de decidir. Es lo que hace que navegar muestre
      // el estado más reciente casi al instante.
      await cicloCompleto('pagina');
      return { ok: true };

    case 'faro:evento':
      return await procesarEvento(msg.evento as Record<string, unknown>);

    case 'faro:abrir': {
      // La navegación la ejecuta el service worker, nunca el renderer
      // sandboxed, y la URL se revalida aquí contra la lista blanca aunque ya
      // se validara al publicar.
      const resultado = await abrirDestino(msg.campaignId as string, msg.ctaId as string);
      return resultado;
    }

    case 'faro:abrir-panel':
      if (remitente.tab?.windowId) {
        await chrome.sidePanel.open({ windowId: remitente.tab.windowId });
      }
      return { ok: true };

    case 'faro:login':
      return { ok: await iniciarSesion(msg.email as string) };

    case 'faro:logout':
      await escribirEstado({ sesion: null, manifiesto: null, etag: null, registro: {} });
      await chrome.storage.session.clear();
      await chrome.action.setBadgeText({ text: '' });
      await desmontarEnTodasLasPestanas();
      return { ok: true };

    case 'faro:sincronizar':
      await cicloCompleto('manual');
      await enviarCola();
      return { ok: true };

    case 'faro:estado': {
      // Lo consume el panel lateral para dibujar el historial.
      const estado = await leerEstado();
      return {
        ok: true,
        sesion: estado.sesion,
        campanas: estado.manifiesto?.campanas ?? [],
        registro: estado.registro,
      };
    }

    default:
      return { ok: false };
  }
}

/**
 * Procesa un evento venido del content script.
 *
 * Lo primero que hace es sanearlo contra la lista blanca de claves: aunque el
 * renderer estuviera comprometido y adjuntara la URL de la página, se elimina
 * antes de llegar a la cola.
 */
async function procesarEvento(crudo: Record<string, unknown>) {
  const limpio = sanearEvento(crudo);
  const tipo = limpio.tipo as string;
  const campaignId = limpio.campaignId as string | null;

  const estado = await leerEstado();
  const ahora = Date.now();

  if (campaignId) {
    const campana = estado.manifiesto?.campanas.find((c) => c.id === campaignId);

    if (tipo === 'impresion' && campana) {
      await escribirEstado({
        registro: {
          ...estado.registro,
          [campaignId]: registroActualizado(estado.registro[campaignId], campana.version, ahora),
        },
      });
      const enSesion = await leerSesionNavegador<string[]>('mostradasEnSesion', []);
      if (!enSesion.includes(campaignId)) {
        await escribirSesionNavegador('mostradasEnSesion', [...enSesion, campaignId]);
      }
    }

    if ((tipo === 'descarte' || tipo === 'acuse') && campana) {
      const previo = estado.registro[campaignId] ?? registroActualizado(undefined, campana.version, ahora);
      await escribirEstado({
        registro: {
          ...estado.registro,
          [campaignId]: {
            ...previo,
            descartadaEn: tipo === 'descarte' ? ahora : previo.descartadaEn,
            acusadaEn: tipo === 'acuse' ? ahora : previo.acusadaEn,
          },
        },
      });

      // Al confirmar lectura, la superficie desaparece: la campaña ya cumplió
      // su propósito con esa persona.
      if (tipo === 'acuse') await cicloCompleto('acuse');
    }
  }

  await encolar({
    tipo: tipo as never,
    campaignId,
    campaignVersion: limpio.campaignVersion as number | null,
    variante: limpio.variante as never,
    formato: limpio.formato as never,
    ctaId: limpio.ctaId as string | null,
    dwellMs: limpio.dwellMs as number | null,
    sessionId: (limpio.sessionId as string) ?? (await sessionIdActual()),
  });

  return { ok: true };
}

async function abrirDestino(campaignId: string, ctaId: string) {
  const estado = await leerEstado();
  const campana = estado.manifiesto?.campanas.find((c) => c.id === campaignId);
  if (!campana) return { ok: false, motivo: 'campana_desconocida' };

  const url = buscarUrlDeCta(campana, ctaId);
  if (!url) return { ok: false, motivo: 'cta_desconocido' };

  const validacion = validarDestino(url);
  if (!validacion.valida) return { ok: false, motivo: validacion.motivo };

  await chrome.tabs.create({ url });
  return { ok: true };
}

function buscarUrlDeCta(campana: CampanaFirmada, ctaId: string): string | null {
  const campos = campana.contenido.campos as Record<string, unknown>;
  const candidatos = [campos.cta, campos.ctaPrimario, campos.ctaSecundario];

  for (const candidato of candidatos) {
    const cta = candidato as { id?: string; accion?: { kind?: string; url?: string } } | null;
    if (cta?.id === ctaId && cta.accion?.kind === 'abrir_url' && cta.accion.url) {
      return cta.accion.url;
    }
  }
  return null;
}

// ── Cambio de pestaña ────────────────────────────────────────────────────────

chrome.tabs.onActivated.addListener(async () => {
  // La superficie se mueve a la pestaña que el ejecutivo está mirando; la
  // impresión no se vuelve a contar porque el registro ya está en storage.
  await cicloCompleto('cambio-pestana');
});

// ── Utilidades ───────────────────────────────────────────────────────────────

function perfilDesdeSesion(sesion: NonNullable<Awaited<ReturnType<typeof leerEstado>>['sesion']>): PerfilUsuario {
  return {
    rol: sesion.usuario.rol,
    sucursal: sesion.usuario.sucursal,
    region: sesion.usuario.region,
    area: sesion.usuario.area,
    tags: sesion.usuario.tags,
    origenPerfil: sesion.usuario.origenPerfil,
  };
}

async function pestanaActiva(): Promise<chrome.tabs.Tab | null> {
  const [pestana] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return pestana ?? null;
}

function origenDe(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

async function sessionIdActual(): Promise<string> {
  let id = await leerSesionNavegador<string | null>('sessionId', null);
  if (!id) {
    id = crypto.randomUUID();
    await escribirSesionNavegador('sessionId', id);
  }
  return id;
}

// ── Sesión (iniciada desde el popup) ─────────────────────────────────────────

export async function iniciarSesion(email: string): Promise<boolean> {
  const estado = await leerEstado();

  const respuesta = await fetch(`${API_BASE}/v1/auth/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      installId: estado.installId,
      extensionVersion: VERSION_EXTENSION,
      chromeVersion: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1],
      so: navigator.platform,
      email,
    }),
  });

  if (!respuesta.ok) return false;

  const datos = await respuesta.json();
  await escribirEstado({
    sesion: { deviceToken: datos.deviceToken, expiraEn: datos.expiraEn, usuario: datos.usuario },
    config: datos.config,
    // Un usuario distinto reinicia el control de frecuencia y la caché.
    registro: {},
    manifiesto: null,
    etag: null,
  });

  await programarAlarmas();
  await cicloCompleto('login');
  return true;
}

// Expone lo necesario para el popup y el panel lateral.
Object.assign(globalThis, { faroIniciarSesion: iniciarSesion, faroCiclo: cicloCompleto, claveDeHoy });
