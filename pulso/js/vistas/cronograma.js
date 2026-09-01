/* Cronograma: carta Gantt de la iniciativa. Cada proyecto es una barra y sus
 * tareas cuelgan debajo, con la línea de hoy y un punto rojo en lo atrasado. */

import { h, boton, pastilla, segmentado } from '../ui/componentes.js';
import { gantt, colorSerie, leyenda } from '../ui/graficos.js';
import { barraFiltros, aplicar } from '../ui/filtros.js';
import * as store from '../store/store.js';
import { estaAtrasada, diasAtraso } from '../domain/alertas.js';
import { avanceTarea, metricasProyecto } from '../domain/metricas.js';
import {
  hoyISO, sumarDias, inicioMes, finMes, sumarMeses, deISO, formatear,
  nombreMes, extremos, diffDias,
} from '../domain/fechas.js';
import { repintar } from '../router.js';

const ZOOMS = [
  { id: 'mes', etiqueta: 'Mes', antes: 10, despues: 35 },
  { id: 'trimestre', etiqueta: 'Trimestre', antes: 25, despues: 80 },
  { id: 'semestre', etiqueta: 'Semestre', antes: 45, despues: 165 },
  { id: 'todo', etiqueta: 'Todo', antes: null, despues: null },
];

let zoomActual = 'trimestre';
let mostrarTareas = true;

export const vista = {
  id: 'cronograma',
  titulo: 'Cronograma',
  subtitulo: () => 'Proyectos y tareas en el tiempo, con la línea de hoy',
  acciones: () => [],
  pintar,
};

function pintar(contenedor) {
  const hoy = hoyISO();
  const proyectos = store.proyectosVisibles();
  const tareas = aplicar(store.tareasDeIniciativa());

  contenedor.appendChild(barraFiltros({
    mostrar: ['texto', 'equipo', 'proyecto', 'responsable'],
    extra: [
      segmentado(ZOOMS, zoomActual, (id) => { zoomActual = id; repintar(); }),
      boton(mostrarTareas ? 'Ocultar tareas' : 'Mostrar tareas', {
        sm: true,
        onclick: () => { mostrarTareas = !mostrarTareas; repintar(); },
      }),
    ],
    alCambiar: repintar,
  }));

  if (!proyectos.length) {
    contenedor.appendChild(h('div', { class: 'vacio' },
      h('strong', {}, 'Sin proyectos que mostrar'),
      'El cronograma se arma con las fechas de los proyectos y sus tareas.'));
    return;
  }

  const { desde, hasta } = calcularVentana(proyectos, tareas, hoy);
  const filas = [];
  const items = [];

  proyectos.forEach((proyecto, i) => {
    const suyas = tareas.filter((t) => t.proyectoId === proyecto.id);
    const metricas = metricasProyecto(proyecto, suyas, hoy);
    const color = colorSerie(i);
    items.push({ etiqueta: proyecto.nombre, color });

    const extremosProyecto = extremos([
      proyecto.fechaInicio, proyecto.fechaFinPlan,
      ...suyas.map((t) => t.fechaInicio), ...suyas.map((t) => t.fechaCompromiso),
    ]);
    filas.push({
      etiqueta: proyecto.nombre,
      desde: proyecto.fechaInicio || extremosProyecto.min,
      hasta: proyecto.fechaFinPlan || extremosProyecto.max,
      color,
      avance: metricas.avance,
      atrasada: metricas.atrasadas > 0,
      detalle: `${metricas.avance}% de avance · ${metricas.abiertas} tareas abiertas`
        + (metricas.atrasadas ? ` · ${metricas.atrasadas} atrasadas` : '')
        + (proyecto.fechaFinPlan ? `<br>Fin planificado: ${formatear(proyecto.fechaFinPlan, { anio: true })}` : ''),
    });

    if (!mostrarTareas) return;
    for (const tarea of suyas.sort(porFecha)) {
      const inicio = tarea.fechaInicio || tarea.fechaCompromiso;
      const fin = tarea.fechaCompromiso || tarea.fechaInicio;
      if (!inicio || !fin) continue;
      if (fin < desde || inicio > hasta) continue; // fuera de la ventana visible
      filas.push({
        etiqueta: tarea.titulo,
        desde: inicio,
        hasta: fin,
        color,
        sangria: true,
        avance: avanceTarea(tarea),
        atrasada: estaAtrasada(tarea, hoy),
        detalle: `${store.nombreDe('personas', tarea.responsableId, 'sin responsable')}`
          + `<br>${formatear(inicio)} → ${formatear(fin)}`
          + (estaAtrasada(tarea, hoy) ? `<br><strong>${diasAtraso(tarea, hoy)} días de atraso</strong>` : ''),
      });
    }
  });

  contenedor.appendChild(h('section', { class: 'tarjeta' },
    h('div', { class: 'tarjeta__cab' },
      h('h2', {}, 'Línea de tiempo'),
      pastilla(`${formatear(desde, { anio: true })} → ${formatear(hasta, { anio: true })}`, '', { linea: true })),
    h('div', { class: 'tarjeta__cuerpo' },
      gantt(filas, { desde, hasta, hoy, marcas: marcasDeMes(desde, hasta) }),
      leyenda(items),
      h('p', { class: 'mini tenue mt-8 mb-0' },
        'La parte sólida de cada barra es el avance. El punto rojo al final marca lo que ya '
        + 'pasó su fecha de compromiso.'))));
}

function porFecha(a, b) {
  return (a.fechaInicio || a.fechaCompromiso || '9999')
    .localeCompare(b.fechaInicio || b.fechaCompromiso || '9999');
}

/** Ventana de tiempo visible según el zoom elegido. */
function calcularVentana(proyectos, tareas, hoy) {
  const zoom = ZOOMS.find((z) => z.id === zoomActual) || ZOOMS[1];
  if (zoom.antes === null) {
    const todas = extremos([
      ...proyectos.map((p) => p.fechaInicio), ...proyectos.map((p) => p.fechaFinPlan),
      ...tareas.map((t) => t.fechaInicio), ...tareas.map((t) => t.fechaCompromiso), hoy,
    ]);
    return {
      desde: inicioMes(todas.min || sumarDias(hoy, -30)),
      hasta: finMes(todas.max || sumarDias(hoy, 60)),
    };
  }
  return { desde: sumarDias(hoy, -zoom.antes), hasta: sumarDias(hoy, zoom.despues) };
}

/** Etiquetas de mes para la escala superior. */
function marcasDeMes(desde, hasta) {
  const marcas = [];
  let cursor = inicioMes(desde);
  const limite = diffDias(desde, hasta);
  let guarda = 0;
  while (guarda++ < 60) {
    if (diffDias(desde, cursor) > limite) break;
    if (diffDias(desde, cursor) >= 0) {
      const fecha = deISO(cursor);
      marcas.push({ fecha: cursor, etiqueta: `${nombreMes(fecha.getMonth())} ${String(fecha.getFullYear()).slice(2)}` });
    }
    cursor = sumarMeses(cursor, 1);
  }
  return marcas;
}
