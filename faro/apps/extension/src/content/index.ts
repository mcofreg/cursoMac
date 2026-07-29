import { ALTO_HUINCHA } from '../lib/config.ts';

/**
 * Content script.
 *
 * NO renderiza contenido de campaña. Solo hace de andamio:
 *
 *   1. crea un <div> anfitrión
 *   2. le adjunta un Shadow DOM CERRADO — el JavaScript de la aplicación del
 *      banco no puede alcanzarlo, y nuestros estilos no se filtran hacia fuera
 *   3. dentro del shadow monta un <iframe> apuntando a surface.html, que el
 *      manifiesto declara como página sandboxed
 *   4. hace de puente entre ese iframe y el service worker, validando cada
 *      mensaje contra una lista blanca de campos
 *
 * ── Por qué un iframe y no renderizar directo en el Shadow DOM ──────────────
 *
 * 1. EL CSP DE LAS APLICACIONES INTERNAS. Los recursos que carga un content
 *    script quedan sujetos a la política de seguridad de la página. Si la
 *    intranet tiene un `img-src` restrictivo, las imágenes de campaña
 *    simplemente no cargan. Un iframe chrome-extension:// trae su PROPIA CSP.
 *    Es la única forma robusta de que el contenido funcione sin depender de la
 *    configuración de cada aplicación del banco.
 *
 * 2. CONTENCIÓN. Aunque una plantilla tuviera un bug, el código corre en un
 *    origen opaco, sin acceso a chrome.* ni al DOM de la aplicación. No puede
 *    leer el token de sesión del CRM ni el formulario abierto.
 *
 * 3. CERO RIESGO DE ROMPER LA APP. El CSS no cruza en ninguna dirección.
 *
 * Este archivo no hace `fetch` ni `XMLHttpRequest`: toda la red pasa por el
 * service worker. Es una de las capas que garantizan que la extensión no
 * reporta navegación — la que importa aquí, porque este script SÍ corre dentro
 * de la página y por lo tanto sí ve su URL. Lo que no tiene es forma de
 * enviarla a ninguna parte: los mensajes hacia el service worker pasan por una
 * lista blanca de campos que no incluye ninguno capaz de llevar una dirección.
 */

const ID_ANFITRION = '__faro_host__';
const ATRIBUTO_MARGEN = 'data-faro-margen-previo';

interface CampanaMostrable {
  id: string;
  version: number;
  prioridad: number;
  contenido: { templateKey: string; campos: Record<string, unknown> };
  presentacion: Record<string, unknown>;
  variante: 'target' | 'control';
}

let anfitrion: HTMLDivElement | null = null;
let marco: HTMLIFrameElement | null = null;
let listoParaRecibir = false;
let pendientes: CampanaMostrable[] | null = null;

// ── Montaje ──────────────────────────────────────────────────────────────────

function montar(): void {
  if (anfitrion) return;

  anfitrion = document.createElement('div');
  anfitrion.id = ID_ANFITRION;
  // `all: initial` corta la herencia de estilos de la página del banco.
  anfitrion.setAttribute(
    'style',
    'all: initial; position: fixed; inset: 0; width: 0; height: 0; ' +
      'z-index: 2147483647; pointer-events: none;',
  );

  // Shadow DOM CERRADO: ni siquiera el JavaScript de la página puede
  // inspeccionarlo con element.shadowRoot.
  const shadow = anfitrion.attachShadow({ mode: 'closed' });

  marco = document.createElement('iframe');
  marco.src = chrome.runtime.getURL('surface.html');
  marco.setAttribute('title', 'Comunicaciones de canales digitales');
  marco.setAttribute('allow', '');
  marco.setAttribute('referrerpolicy', 'no-referrer');
  marco.setAttribute(
    'style',
    'position: fixed; inset: 0; width: 100vw; height: 100vh; border: 0; ' +
      'background: transparent; color-scheme: normal; pointer-events: none;',
  );

  shadow.appendChild(marco);
  document.documentElement.appendChild(anfitrion);
}

function desmontar(): void {
  quitarMargenSuperior();
  anfitrion?.remove();
  anfitrion = null;
  marco = null;
  listoParaRecibir = false;
}

/**
 * Empuja la página hacia abajo para que la huincha no tape su barra de
 * navegación. Se guarda el valor previo para poder revertirlo con exactitud:
 * dejar un margen huérfano rompería el layout de la aplicación del banco, que
 * es el riesgo número dos del proyecto.
 */
function aplicarMargenSuperior(): void {
  const raiz = document.documentElement;
  if (raiz.hasAttribute(ATRIBUTO_MARGEN)) return;

  raiz.setAttribute(ATRIBUTO_MARGEN, raiz.style.marginTop || '');
  raiz.style.marginTop = `${ALTO_HUINCHA}px`;
}

function quitarMargenSuperior(): void {
  const raiz = document.documentElement;
  if (!raiz.hasAttribute(ATRIBUTO_MARGEN)) return;

  raiz.style.marginTop = raiz.getAttribute(ATRIBUTO_MARGEN) || '';
  raiz.removeAttribute(ATRIBUTO_MARGEN);
}

// ── Puente con el iframe ─────────────────────────────────────────────────────

/**
 * Campos que el renderer puede enviar de vuelta.
 *
 * Cualquier otra clave se descarta aquí. Es la capa que hace que ni siquiera un
 * renderer comprometido pueda adjuntar `location.href` a un evento.
 */
const CAMPOS_PERMITIDOS = new Set([
  'tipo',
  'campaignId',
  'campaignVersion',
  'variante',
  'formato',
  'ctaId',
  'dwellMs',
]);

const TIPOS_EVENTO = new Set([
  'impresion',
  'fin_vista',
  'clic',
  'acuse',
  'descarte',
  'expansion',
  'error',
]);

window.addEventListener('message', (evento) => {
  // Solo mensajes del iframe que montamos nosotros.
  if (!marco || evento.source !== marco.contentWindow) return;

  const datos = evento.data as { canal?: string; tipo?: string; [k: string]: unknown };
  if (datos?.canal !== 'faro') return;

  switch (datos.tipo) {
    case 'listo':
      listoParaRecibir = true;
      if (pendientes) {
        enviarAlMarco(pendientes);
        pendientes = null;
      }
      return;

    case 'layout':
      aplicarLayout(datos as unknown as { interactivo: boolean; ocupaHuincha: boolean });
      return;

    case 'evento':
      reenviarEvento(datos.evento as Record<string, unknown>);
      return;

    case 'abrir':
      chrome.runtime.sendMessage({
        tipo: 'faro:abrir',
        campaignId: datos.campaignId,
        ctaId: datos.ctaId,
      });
      return;

    case 'abrir-panel':
      chrome.runtime.sendMessage({ tipo: 'faro:abrir-panel' });
      return;
  }
});

function aplicarLayout(datos: { interactivo: boolean; ocupaHuincha: boolean }): void {
  if (!marco) return;

  // El iframe solo captura clics cuando hay algo visible; si no, la página del
  // banco seguiría siendo clicable a través de él.
  marco.style.pointerEvents = datos.interactivo ? 'auto' : 'none';

  if (datos.ocupaHuincha) aplicarMargenSuperior();
  else quitarMargenSuperior();
}

function reenviarEvento(crudo: Record<string, unknown>): void {
  if (!crudo || typeof crudo !== 'object') return;
  if (!TIPOS_EVENTO.has(String(crudo.tipo))) return;

  const limpio: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(crudo)) {
    if (CAMPOS_PERMITIDOS.has(clave)) limpio[clave] = valor;
  }

  chrome.runtime.sendMessage({ tipo: 'faro:evento', evento: limpio });
}

function enviarAlMarco(campanas: CampanaMostrable[]): void {
  marco?.contentWindow?.postMessage({ canal: 'faro', tipo: 'render', campanas }, '*');
}

// ── Mensajes del service worker ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener((mensaje) => {
  const msg = mensaje as { tipo?: string; campanas?: CampanaMostrable[] };
  if (msg.tipo !== 'faro:mostrar') return;

  const campanas = msg.campanas ?? [];

  if (campanas.length === 0) {
    // Desmontaje activo: al pausar una campaña, la superficie desaparece de
    // todas las pestañas sin que el ejecutivo tenga que recargar.
    desmontar();
    return;
  }

  montar();
  if (listoParaRecibir) enviarAlMarco(campanas);
  else pendientes = campanas;
});

// Saluda al service worker al cargar la página: dispara la verificación
// oportunista y hace que navegar muestre el estado más reciente casi al
// instante, sin esperar al siguiente ciclo de la alarma.
chrome.runtime.sendMessage({ tipo: 'faro:hola' }).catch(() => {
  // El service worker puede estar arrancando; la alarma cubrirá el caso.
});
