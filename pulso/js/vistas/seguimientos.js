/* Seguimientos: la agenda de conversaciones. Cada tarea tiene una cadencia
 * (diaria, semanal, bisemanal, quincenal o mensual) y aquí se ve qué toca
 * revisar hoy, qué quedó pendiente y qué viene después. */

import { h, boton, pastilla, avatar } from '../ui/componentes.js';
import { abrirTarea, abrirSeguimiento, textoPlazo } from '../ui/tarea.js';
import { barraFiltros, aplicar } from '../ui/filtros.js';
import * as store from '../store/store.js';
import { CADENCIAS, etiquetaDe } from '../store/schema.js';
import { colorSemaforo, semaforo } from '../domain/alertas.js';
import { diasSinSeguimiento } from '../domain/cadencia.js';
import { hoyISO, formatear, humano, diffDias, finSemana, horasHumanas } from '../domain/fechas.js';
import { repintar } from '../router.js';

export const vista = {
  id: 'seguimientos',
  titulo: 'Seguimientos',
  subtitulo: () => 'Qué toca revisar y con quién, según la cadencia de cada tarea',
  acciones: () => [],
  pintar,
};

function pintar(contenedor) {
  const hoy = hoyISO();
  const tareas = aplicar(store.tareasDeIniciativa()).filter((t) => t.estado !== 'hecha');

  contenedor.appendChild(barraFiltros({ alCambiar: repintar }));

  const grupos = repartir(tareas, hoy);
  const conCadencia = tareas.filter((t) => t.cadencia && t.cadencia !== 'ninguna').length;
  const alDia = conCadencia - grupos.atrasados.length;

  contenedor.appendChild(h('div', { class: 'rejilla rejilla--4 mb-16' },
    kpi('Pendientes', grupos.atrasados.length, 'seguimientos que ya vencieron', 'rojo'),
    kpi('Para hoy', grupos.hoy.length, 'según la cadencia', 'ambar'),
    kpi('Esta semana', grupos.semana.length, 'antes del domingo', 'azul'),
    kpi('Cumplimiento', conCadencia ? `${Math.round((alDia / conCadencia) * 100)}%` : '—',
      `${alDia} de ${conCadencia} tareas al día`, 'verde')));

  const secciones = [
    ['Pendientes', grupos.atrasados, 'No hay seguimientos atrasados.', 'rojo'],
    ['Toca hoy', grupos.hoy, 'Hoy no hay seguimientos agendados.', 'ambar'],
    ['Esta semana', grupos.semana, 'Nada más agendado antes del domingo.', 'azul'],
    ['Más adelante', grupos.despues, 'No hay seguimientos futuros agendados.', ''],
    ['Sin cadencia', grupos.sinCadencia,
      'Todas las tareas abiertas tienen una cadencia definida.', ''],
  ];

  for (const [titulo, lista, textoVacio, color] of secciones) {
    contenedor.appendChild(seccion(titulo, lista, textoVacio, color, hoy));
  }

  contenedor.appendChild(bitacora());
}

function kpi(etiqueta, valor, detalle, color) {
  return h('div', { class: `kpi kpi--${color}` },
    h('div', { class: 'kpi__etiqueta' }, etiqueta),
    h('div', { class: 'kpi__valor' }, String(valor)),
    h('div', { class: 'kpi__detalle' }, detalle));
}

/** Reparte las tareas abiertas según cuándo les toca el próximo seguimiento. */
function repartir(tareas, hoy) {
  const domingo = finSemana(hoy);
  const grupos = { atrasados: [], hoy: [], semana: [], despues: [], sinCadencia: [] };
  for (const tarea of tareas) {
    if (!tarea.cadencia || tarea.cadencia === 'ninguna' || !tarea.proximoSeguimiento) {
      grupos.sinCadencia.push(tarea);
      continue;
    }
    const dias = diffDias(hoy, tarea.proximoSeguimiento);
    if (dias < 0) grupos.atrasados.push(tarea);
    else if (dias === 0) grupos.hoy.push(tarea);
    else if (diffDias(tarea.proximoSeguimiento, domingo) >= 0) grupos.semana.push(tarea);
    else grupos.despues.push(tarea);
  }
  grupos.atrasados.sort((a, b) => diasSinSeguimiento(b, hoy) - diasSinSeguimiento(a, hoy));
  grupos.semana.sort(porProximo);
  grupos.despues.sort(porProximo);
  return grupos;
}

function porProximo(a, b) {
  return (a.proximoSeguimiento || '9999').localeCompare(b.proximoSeguimiento || '9999');
}

function seccion(titulo, tareas, textoVacio, color, hoy) {
  const cuerpo = tareas.length
    ? h('div', { class: 'tabla-envoltura' },
      h('table', { class: 'tabla tabla--densa' },
        h('thead', {}, h('tr', {},
          h('th', {}, 'Tarea'),
          h('th', {}, 'Responsable'),
          h('th', {}, 'Cadencia'),
          h('th', {}, 'Último'),
          h('th', {}, 'Próximo'),
          h('th', {}, 'Plazo de la tarea'),
          h('th', { class: 'no-imprimir' }, ''))),
        h('tbody', {}, tareas.map((t) => fila(t, hoy)))))
    : h('div', { class: 'tarjeta__cuerpo' }, h('p', { class: 'tenue pequeno mb-0' }, textoVacio));

  return h('section', { class: 'tarjeta mb-16' },
    h('div', { class: 'tarjeta__cab' },
      h('h2', {}, titulo),
      pastilla(String(tareas.length), tareas.length ? color : 'verde')),
    cuerpo);
}

function fila(tarea, hoy) {
  const persona = store.porId('personas', tarea.responsableId);
  const proyecto = store.porId('proyectos', tarea.proyectoId);
  const atraso = diasSinSeguimiento(tarea, hoy);
  return h('tr', { class: 'clicable' },
    h('td', { onclick: () => abrirTarea(tarea.id) },
      h('div', { class: 'negrita' }, tarea.titulo),
      h('div', { class: 'mini tenue' }, proyecto ? proyecto.nombre : 'sin proyecto')),
    h('td', {}, h('span', { class: 'fila' }, avatar(persona, 'sm'),
      h('span', { class: 'pequeno' }, persona ? persona.nombre : 'sin dueño'))),
    h('td', {}, pastilla(etiquetaDe(CADENCIAS, tarea.cadencia), '', { linea: true })),
    h('td', {}, tarea.ultimoSeguimiento
      ? h('span', { title: formatear(tarea.ultimoSeguimiento, { anio: true }) }, humano(tarea.ultimoSeguimiento, hoy))
      : h('span', { class: 'tenue' }, 'nunca')),
    h('td', {}, tarea.proximoSeguimiento
      ? h('span', { style: { color: atraso ? 'var(--rojo)' : 'inherit' } },
        `${formatear(tarea.proximoSeguimiento)}${atraso ? ` · ${atraso} d de atraso` : ''}`)
      : '—'),
    h('td', {}, h('span', { class: 'fila' },
      h('span', { class: `punto punto--${colorSemaforo(semaforo(tarea, hoy))}` }),
      h('span', { class: 'pequeno' }, textoPlazo(tarea, hoy)))),
    h('td', { class: 'no-imprimir' },
      boton('Registrar', { icono: 'reloj', sm: true, onclick: () => abrirSeguimiento(tarea.id) })));
}

/** Últimos seguimientos registrados en toda la iniciativa. */
function bitacora() {
  const idsTarea = new Set(store.tareasDeIniciativa().map((t) => t.id));
  const recientes = store.estado.seguimientos
    .filter((s) => idsTarea.has(s.tareaId))
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
    .slice(0, 15);

  return h('section', { class: 'tarjeta' },
    h('div', { class: 'tarjeta__cab' },
      h('h2', {}, 'Últimos seguimientos registrados'),
      pastilla(String(recientes.length), '', { linea: true })),
    h('div', { class: 'tarjeta__cuerpo' },
      recientes.length
        ? h('div', { class: 'lista-alertas' }, recientes.map((s) => {
          const tarea = store.porId('tareas', s.tareaId);
          const autor = store.porId('personas', s.autorId);
          return h('div', { class: 'fila-alerta' },
            h('span', { class: `punto punto--${colorSemaforo(s.semaforo)}` }),
            avatar(autor, 'sm'),
            h('div', { class: 'fila-alerta__texto' },
              h('div', {
                class: 'fila-alerta__titulo',
                onclick: () => tarea && abrirTarea(tarea.id),
              }, tarea ? tarea.titulo : 'tarea eliminada'),
              h('div', { class: 'fila-alerta__sub' },
                `${formatear(s.fecha, { diaSemana: true })} · avance ${s.avance}%`
                + (s.horasImputadas ? ` · ${horasHumanas(s.horasImputadas)}` : '')
                + (s.comentario ? ` · ${s.comentario}` : ''))));
        }))
        : h('p', { class: 'tenue pequeno mb-0' },
          'Todavía no se ha registrado ningún seguimiento. Usa el botón "Registrar" de cada tarea.')));
}
