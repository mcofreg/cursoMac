/* Arranque de Pulso: arma el marco de la aplicación (menú lateral, cabecera y
 * zona de contenido), carga los datos guardados en el navegador y dibuja la
 * pantalla que pida la dirección. Las vistas se cargan bajo demanda. */

import { h, icono, boton, vaciar, lista, tostada } from './ui/componentes.js';
import * as store from './store/store.js';
import { construirSemilla } from './store/seed.js';
import { contarUrgencias } from './domain/alertas.js';
import { rutaActual, irA, iniciarRouter, alCambiarRuta, fijarRepintado } from './router.js';
import { iniciarNotificaciones } from './notificaciones.js';

/** Catálogo de pantallas. El módulo se carga la primera vez que se visita. */
const VISTAS = [
  { id: 'radar', etiqueta: 'Radar', icono: 'radar', grupo: 'Seguimiento', cargar: () => import('./vistas/radar.js') },
  { id: 'tablero', etiqueta: 'Tablero', icono: 'tablero', grupo: 'Seguimiento', cargar: () => import('./vistas/tablero.js') },
  { id: 'seguimientos', etiqueta: 'Seguimientos', icono: 'seguimientos', grupo: 'Seguimiento', cargar: () => import('./vistas/seguimientos.js') },
  { id: 'portafolio', etiqueta: 'Portafolio', icono: 'portafolio', grupo: 'Iniciativa', cargar: () => import('./vistas/portafolio.js') },
  { id: 'cronograma', etiqueta: 'Cronograma', icono: 'cronograma', grupo: 'Iniciativa', cargar: () => import('./vistas/cronograma.js') },
  { id: 'aprendizajes', etiqueta: 'Aprendizajes', icono: 'aprendizajes', grupo: 'Iniciativa', cargar: () => import('./vistas/aprendizajes.js') },
  { id: 'informe', etiqueta: 'Informe', icono: 'informe', grupo: 'Iniciativa', cargar: () => import('./vistas/informe.js') },
  { id: 'roadmap', etiqueta: 'Importar roadmap', icono: 'roadmap', grupo: 'Herramientas', cargar: () => import('./vistas/roadmap.js') },
  { id: 'ajustes', etiqueta: 'Ajustes', icono: 'ajustes', grupo: 'Herramientas', cargar: () => import('./vistas/ajustes.js') },
];

const modulos = new Map();
let contenidoEl = null;
let cabeceraEl = null;
let lateralEl = null;
let pintando = false;

async function arrancar() {
  aplicarTema(store.config('tema'));
  construirMarco();
  await store.inicializar();
  await cargarSemillaSiCorresponde();

  fijarRepintado(pintarVistaActual);
  alCambiarRuta(pintarVistaActual);
  iniciarRouter();
  store.suscribir(() => { pintarLateral(); pintarVistaActual(); });

  await pintarVistaActual();
  iniciarNotificaciones();
}

/** La primera visita carga el ejemplo para que la herramienta no aparezca vacía. */
async function cargarSemillaSiCorresponde() {
  if (store.config('semillaCargada')) return;
  if (store.estado.iniciativas.length || store.estado.tareas.length) {
    store.fijarConfig({ semillaCargada: true });
    return;
  }
  const semilla = construirSemilla();
  for (const [tipo, lista] of Object.entries(semilla)) await store.guardarVarios(tipo, lista);
  store.fijarConfig({ semillaCargada: true, iniciativaActiva: semilla.iniciativas[0].id });
}

/* ------------------------------------------------------------- estructura */

function construirMarco() {
  const app = document.getElementById('app');
  vaciar(app);

  lateralEl = h('nav', { class: 'lateral', 'aria-label': 'Navegación principal' });
  cabeceraEl = h('header', { class: 'cabecera' });
  contenidoEl = h('main', { class: 'vista', id: 'contenido' });

  app.appendChild(lateralEl);
  app.appendChild(h('div', { class: 'principal' }, cabeceraEl, contenidoEl));
  pintarLateral();

  document.addEventListener('click', (e) => {
    if (document.body.classList.contains('menu-abierto')
      && !e.target.closest('.lateral') && !e.target.closest('.abrir-menu')) {
      document.body.classList.remove('menu-abierto');
    }
  });
}

function pintarLateral() {
  if (!lateralEl) return;
  vaciar(lateralEl);
  const actual = rutaActual().vista;
  const urgencias = store.estado.listo ? contarUrgencias(store.tareasDeIniciativa()) : 0;

  lateralEl.appendChild(h('div', { class: 'lateral__marca' },
    marca(),
    h('div', {}, 'Pulso', h('small', {}, 'seguimiento multiequipo'))));

  lateralEl.appendChild(h('div', { class: 'lateral__grupo' }, selectorIniciativa()));

  let grupoActual = null;
  const contenedor = h('div', { class: 'lateral__grupo' });
  for (const definicion of VISTAS) {
    if (definicion.grupo !== grupoActual) {
      grupoActual = definicion.grupo;
      contenedor.appendChild(h('div', { class: 'lateral__titulo' }, grupoActual));
    }
    contenedor.appendChild(h('a', {
      class: `nav-item${definicion.id === actual ? ' activo' : ''}`,
      href: `#/${definicion.id}`,
      'aria-current': definicion.id === actual ? 'page' : null,
      onclick: () => document.body.classList.remove('menu-abierto'),
    },
    icono(definicion.icono),
    h('span', { class: 'crecer' }, definicion.etiqueta),
    definicion.id === 'radar' && urgencias
      ? h('span', { class: 'insignia' }, String(urgencias))
      : null));
  }
  lateralEl.appendChild(contenedor);

  lateralEl.appendChild(h('div', { class: 'lateral__pie' },
    h('div', { class: 'fila' },
      boton('', {
        icono: 'ajustes', sm: true, variante: 'plano',
        titulo: 'Cambiar entre modo claro y oscuro',
        onclick: alternarTema,
      }),
      h('span', {}, 'Datos guardados en este navegador'))));
}

function marca() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '26');
  svg.setAttribute('height', '26');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.innerHTML = '<rect width="32" height="32" rx="8" fill="#4f46e5"/>'
    + '<path d="M5 18h5l3-8 4 14 3-9 2 3h5" fill="none" stroke="white" stroke-width="2.4" '
    + 'stroke-linecap="round" stroke-linejoin="round"/>';
  return svg;
}

function selectorIniciativa() {
  const iniciativas = store.estado.iniciativas;
  if (!iniciativas.length) {
    return h('a', { class: 'nav-item', href: '#/ajustes' }, icono('mas'), 'Crear una iniciativa');
  }
  const selector = lista(
    iniciativas.map((i) => ({ id: i.id, etiqueta: i.nombre })),
    store.config('iniciativaActiva'),
    {
      'aria-label': 'Iniciativa activa',
      onchange: (e) => store.fijarConfig({ iniciativaActiva: e.target.value }),
    },
  );
  selector.style.background = 'rgba(255,255,255,.06)';
  selector.style.color = '#fff';
  selector.style.borderColor = 'rgba(255,255,255,.14)';
  return h('div', {},
    h('div', { class: 'lateral__titulo' }, 'Trabajando en'),
    selector);
}

/* ---------------------------------------------------------------- pintado */

async function pintarVistaActual() {
  if (!contenidoEl || pintando) return;
  pintando = true;
  try {
    const { vista: id, parametro } = rutaActual();
    const definicion = VISTAS.find((v) => v.id === id) || VISTAS[0];

    if (!modulos.has(definicion.id)) {
      try {
        modulos.set(definicion.id, await definicion.cargar());
      } catch (e) {
        console.error(e);
        vaciar(contenidoEl).appendChild(h('div', { class: 'vacio' },
          h('strong', {}, 'No se pudo cargar esta pantalla'),
          String(e.message || e)));
        return;
      }
    }
    const modulo = modulos.get(definicion.id);
    const vista = modulo.vista;

    pintarCabecera(vista);
    vaciar(contenidoEl);
    contenidoEl.scrollTop = 0;
    await vista.pintar(contenidoEl, parametro);
    pintarLateralSiCambio(definicion.id);
  } finally {
    pintando = false;
  }
}

let ultimaVistaEnLateral = null;
function pintarLateralSiCambio(id) {
  if (ultimaVistaEnLateral !== id) {
    ultimaVistaEnLateral = id;
    pintarLateral();
  }
}

function pintarCabecera(vista) {
  vaciar(cabeceraEl);
  cabeceraEl.appendChild(boton('', {
    icono: 'menu', variante: 'plano', titulo: 'Abrir el menú',
    onclick: () => document.body.classList.toggle('menu-abierto'),
  }));
  cabeceraEl.lastChild.classList.add('abrir-menu');

  const subtitulo = typeof vista.subtitulo === 'function' ? vista.subtitulo() : vista.subtitulo;
  cabeceraEl.appendChild(h('div', { class: 'cabecera__titulo' },
    h('h1', {}, vista.titulo),
    subtitulo ? h('p', {}, subtitulo) : null));

  const acciones = typeof vista.acciones === 'function' ? vista.acciones() : (vista.acciones || []);
  for (const accion of acciones) if (accion) cabeceraEl.appendChild(accion);
}

/* ------------------------------------------------------------------ tema */

function aplicarTema(tema) {
  if (tema === 'claro' || tema === 'oscuro') document.documentElement.dataset.tema = tema;
  else delete document.documentElement.dataset.tema;
}

function alternarTema() {
  const actual = store.config('tema');
  const siguiente = actual === 'oscuro' ? 'claro' : (actual === 'claro' ? 'sistema' : 'oscuro');
  store.fijarConfig({ tema: siguiente });
  aplicarTema(siguiente);
  tostada(`Tema: ${siguiente}`);
}

export { aplicarTema, irA };

arrancar().catch((e) => {
  console.error(e);
  document.getElementById('app').innerHTML =
    `<div style="padding:32px"><h1>No se pudo iniciar Pulso</h1><p>${e.message}</p>
     <p class="tenue">Revisa la consola del navegador para ver el detalle.</p></div>`;
});
