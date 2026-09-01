/* Piezas de interfaz reutilizables: creación de elementos, avatares,
 * pastillas, barras, modales y avisos. Todas devuelven nodos del DOM. */

import { COLORES, SEMAFOROS, colorDe } from '../store/schema.js';

/**
 * Crea un elemento.
 *   h('div', { class: 'fila', onclick: fn }, 'texto', otroNodo)
 * Acepta hijos anidados en arreglos y descarta null, undefined y false.
 */
export function h(etiqueta, props = {}, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(props || {})) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (clave === 'class' || clave === 'className') el.className = valor;
    else if (clave === 'style' && typeof valor === 'object') Object.assign(el.style, valor);
    else if (clave === 'dataset') Object.assign(el.dataset, valor);
    else if (clave === 'html') el.innerHTML = valor;
    else if (clave.startsWith('on') && typeof valor === 'function') {
      el.addEventListener(clave.slice(2), valor);
    } else if (clave === 'valor') el.value = valor;
    else if (valor === true) el.setAttribute(clave, '');
    else el.setAttribute(clave, valor);
  }
  agregar(el, hijos);
  return el;
}

/** Agrega hijos de cualquier forma (nodo, texto, arreglo, nulo). */
export function agregar(padre, hijos) {
  for (const hijo of hijos.flat(4)) {
    if (hijo === null || hijo === undefined || hijo === false || hijo === '') continue;
    padre.appendChild(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return padre;
}

export function vaciar(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/* ------------------------------------------------------------- iconos */

const RUTAS = {
  radar: 'M3 12h4l3-8 4 16 3-9 2 3h4',
  tablero: 'M4 4h5v16H4zM10.5 4h5v10h-5zM17 4h3v7h-3z',
  portafolio: 'M4 6h16M4 12h16M4 18h10',
  cronograma: 'M4 7h9M4 12h14M4 17h6M20 4v16',
  seguimientos: 'M12 7v5l3 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9z',
  aprendizajes: 'M12 3 3 8l9 5 9-5-9-5zM5 11v5c0 1.5 3.5 3 7 3s7-1.5 7-3v-5',
  informe: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  roadmap: 'M4 17V7l5 3 6-4 5 3v10M9 10v10M15 6v10',
  ajustes: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.9 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4 13.6H4a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 5.1 7L5 6.9a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H10a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  mas: 'M12 5v14M5 12h14',
  cerrar: 'M6 6l12 12M18 6L6 18',
  menu: 'M4 7h16M4 12h16M4 17h16',
  buscar: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  reloj: 'M12 7v5l3 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9z',
  alerta: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  imprimir: 'M6 9V3h12v6M6 18H4v-6h16v6h-2M8 14h8v7H8z',
  copiar: 'M9 9h10v12H9zM5 15H3V3h12v2',
  descargar: 'M12 3v12M7 11l5 5 5-5M4 21h16',
  subir: 'M12 21V9M7 13l5-5 5 5M4 3h16',
  basura: 'M4 7h16M9 7V5h6v2M7 7l1 14h8l1-14',
  lapiz: 'M4 20h4L20 8l-4-4L4 16z',
  visto: 'M4 12l5 5L20 6',
};

/** Icono de línea de 16px por defecto, del catálogo de arriba. */
export function icono(nombre, tamano = 16) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', tamano);
  svg.setAttribute('height', tamano);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const ruta = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  ruta.setAttribute('d', RUTAS[nombre] || RUTAS.radar);
  svg.appendChild(ruta);
  return svg;
}

/* ------------------------------------------------------------- básicos */

export function boton(texto, opciones = {}) {
  const { icono: nombreIcono, variante = '', onclick, titulo, tipo = 'button', sm, deshabilitado } = opciones;
  const clases = ['btn'];
  if (variante) clases.push(`btn--${variante}`);
  if (sm) clases.push('btn--sm');
  return h('button', {
    class: clases.join(' '), type: tipo, onclick, title: titulo,
    disabled: deshabilitado || undefined,
    'aria-label': texto ? undefined : titulo,
  }, nombreIcono ? icono(nombreIcono, sm ? 13 : 15) : null, texto || null);
}

export function pastilla(texto, color = '', opciones = {}) {
  return h('span', {
    class: `pastilla${color ? ` pastilla--${color}` : ''}${opciones.linea ? ' pastilla--linea' : ''}`,
    title: opciones.titulo,
  }, opciones.punto ? h('span', { class: `punto punto--${color}` }) : null, texto);
}

export function punto(color, titulo) {
  return h('span', { class: `punto punto--${color}`, title: titulo });
}

/** Pastilla del semáforo de una tarea. */
export function pastillaSemaforo(idSemaforo, texto) {
  const definicion = SEMAFOROS.find((s) => s.id === idSemaforo);
  return pastilla(texto || (definicion ? definicion.etiqueta : idSemaforo),
    colorDe(SEMAFOROS, idSemaforo), { punto: true });
}

export function iniciales(nombre) {
  if (!nombre) return '?';
  const partes = String(nombre).trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  const primera = partes[0][0] || '';
  const segunda = partes.length > 1 ? (partes[1][0] || '') : '';
  return (primera + segunda).toUpperCase() || '?';
}

export function colorPersona(persona) {
  if (persona && persona.color) return persona.color;
  return COLORES[0];
}

/** Círculo con las iniciales; si no hay persona muestra el hueco "sin dueño". */
export function avatar(persona, tamano = '') {
  const clase = `avatar${tamano ? ` avatar--${tamano}` : ''}`;
  if (!persona) return h('span', { class: `${clase} avatar--vacio`, title: 'Sin responsable' }, '?');
  return h('span', {
    class: clase,
    style: { background: colorPersona(persona) },
    title: persona.nombre,
  }, iniciales(persona.nombre));
}

export function barra(porcentaje, color = '') {
  const pct = Math.max(0, Math.min(100, Math.round(porcentaje || 0)));
  return h('div', { class: `barra-progreso${color ? ` ${color}` : ''}`, title: `${pct}%` },
    h('span', { style: { width: `${pct}%` } }));
}

export function vacio(titulo, detalle) {
  return h('div', { class: 'vacio' }, h('strong', {}, titulo), detalle || null);
}

/* --------------------------------------------------------- formularios */

export function campo(etiqueta, control, ayuda) {
  const id = control.id || `c_${Math.random().toString(36).slice(2, 8)}`;
  control.id = id;
  return h('div', { class: 'campo' },
    etiqueta ? h('label', { for: id }, etiqueta) : null,
    control,
    ayuda ? h('p', { class: 'campo__ayuda' }, ayuda) : null);
}

export function entrada(tipo, valor, props = {}) {
  return h('input', { type: tipo, valor: valor ?? '', ...props });
}

export function areaTexto(valor, props = {}) {
  const el = h('textarea', props);
  el.value = valor || '';
  return el;
}

/**
 * Lista desplegable.
 * @param {Array<{id:string,etiqueta:string}>} opciones
 */
export function lista(opciones, valor, props = {}) {
  const el = h('select', props);
  for (const o of opciones) {
    const op = h('option', { value: o.id }, o.etiqueta);
    if (String(o.id) === String(valor ?? '')) op.selected = true;
    el.appendChild(op);
  }
  return el;
}

/** Control de pestañas o modos: [{id, etiqueta}]. */
export function segmentado(opciones, valor, alCambiar) {
  return h('div', { class: 'segmentado', role: 'tablist' },
    opciones.map((o) => h('button', {
      class: o.id === valor ? 'activo' : '',
      role: 'tab',
      'aria-selected': o.id === valor ? 'true' : 'false',
      onclick: () => alCambiar(o.id),
    }, o.etiqueta)));
}

/* -------------------------------------------------------------- modales */

let pilaModales = [];

/**
 * Abre un modal. Devuelve un objeto con cerrar().
 * @param {{titulo:string, cuerpo:Node, acciones?:Node[], ancho?:boolean}} opciones
 */
export function modal({ titulo, cuerpo, acciones = [], ancho = false, alCerrar }) {
  const velo = h('div', { class: 'velo', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo });
  const caja = h('div', { class: `modal${ancho ? ' modal--ancho' : ''}` });

  const cerrar = () => {
    velo.remove();
    pilaModales = pilaModales.filter((m) => m !== control);
    document.removeEventListener('keydown', alTeclado);
    if (alCerrar) alCerrar();
  };
  const control = { cerrar, velo, caja };

  function alTeclado(e) {
    if (e.key === 'Escape' && pilaModales[pilaModales.length - 1] === control) {
      e.stopPropagation();
      cerrar();
    }
  }

  caja.appendChild(h('div', { class: 'modal__cab' },
    h('h2', {}, titulo),
    boton('', { icono: 'cerrar', variante: 'plano', sm: true, titulo: 'Cerrar', onclick: cerrar })));
  caja.appendChild(h('div', { class: 'modal__cuerpo' }, cuerpo));
  if (acciones.length) caja.appendChild(h('div', { class: 'modal__pie' }, acciones));

  velo.appendChild(caja);
  velo.addEventListener('mousedown', (e) => { if (e.target === velo) cerrar(); });
  document.addEventListener('keydown', alTeclado);
  document.body.appendChild(velo);
  pilaModales.push(control);

  const primero = caja.querySelector('input, select, textarea, button.btn--primario');
  if (primero) setTimeout(() => primero.focus(), 30);

  return control;
}

/** Confirmación con dos botones. Devuelve una promesa con true o false. */
export function confirmar(titulo, mensaje, { textoSi = 'Confirmar', peligro = false } = {}) {
  return new Promise((resolver) => {
    let respondido = false;
    const responder = (valor) => { respondido = true; control.cerrar(); resolver(valor); };
    const control = modal({
      titulo,
      cuerpo: h('p', { class: 'mb-0' }, mensaje),
      acciones: [
        boton('Cancelar', { onclick: () => responder(false) }),
        boton(textoSi, { variante: peligro ? 'peligro' : 'primario', onclick: () => responder(true) }),
      ],
      alCerrar: () => { if (!respondido) resolver(false); },
    });
  });
}

/* -------------------------------------------------------------- avisos */

export function tostada(mensaje, tipo = '') {
  const contenedor = document.getElementById('tostadas');
  if (!contenedor) return;
  const el = h('div', { class: `tostada${tipo ? ` tostada--${tipo}` : ''}` }, mensaje);
  contenedor.appendChild(el);
  setTimeout(() => el.remove(), tipo === 'error' ? 5200 : 3000);
}

/** Copia texto al portapapeles y avisa. Cae a un método antiguo si hace falta. */
export async function copiar(texto, mensaje = 'Copiado al portapapeles') {
  try {
    await navigator.clipboard.writeText(texto);
    tostada(mensaje, 'ok');
    return true;
  } catch {
    const area = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    area.value = texto;
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand && document.execCommand('copy');
    area.remove();
    tostada(ok ? mensaje : 'No se pudo copiar; selecciona el texto a mano.', ok ? 'ok' : 'error');
    return ok;
  }
}
