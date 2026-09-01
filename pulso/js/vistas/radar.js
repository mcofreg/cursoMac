/* Radar: la pantalla de inicio. Responde en diez segundos a "qué se me está
 * cayendo hoy": lo vencido, lo que vence, lo que perdió su seguimiento, lo
 * bloqueado y lo que ni siquiera tiene dueño o fecha. */

import { h, boton, pastilla } from '../ui/componentes.js';
import { filaTarea, botonSeguimiento, abrirTarea } from '../ui/tarea.js';
import { medidor, barraApilada, leyenda, colorEstado } from '../ui/graficos.js';
import { barraFiltros, aplicar, avisoFiltro } from '../ui/filtros.js';
import * as store from '../store/store.js';
import { ESTADOS_TAREA } from '../store/schema.js';
import { clasificar } from '../domain/alertas.js';
import { metricasIniciativa, colorSalud } from '../domain/metricas.js';
import { horasHumanas, hoyISO } from '../domain/fechas.js';
import { irA, repintar } from '../router.js';

export const vista = {
  id: 'radar',
  titulo: 'Radar',
  subtitulo: () => 'Lo que exige atención hoy en todos los equipos',
  acciones: () => [
    boton('Nueva tarea', { icono: 'mas', variante: 'primario', onclick: () => abrirTarea(null) }),
  ],
  pintar,
};

function pintar(contenedor) {
  const hoy = hoyISO();
  const todas = store.tareasDeIniciativa();
  const tareas = aplicar(todas);
  const bandejas = clasificar(tareas, hoy);
  const metricas = metricasIniciativa(store.proyectosVisibles(), tareas, hoy);

  contenedor.appendChild(barraFiltros({
    extra: [avisoFiltro(tareas.length, todas.length)].filter(Boolean),
    alCambiar: repintar,
  }));

  contenedor.appendChild(h('div', { class: 'rejilla rejilla--4 mb-16' },
    kpi('Atrasadas', bandejas.vencidas.length, 'tareas pasadas de fecha', 'rojo', 'vencidas'),
    kpi('Vencen hoy', bandejas.vencenHoy.length, 'compromiso para hoy', 'ambar', 'hoy'),
    kpi('Vencen esta semana', bandejas.vencenSemana.length, 'antes del domingo', 'azul', 'semana'),
    kpi('Seguimiento pendiente', bandejas.seguimientoVencido.length, 'sin revisar según su cadencia', 'ambar', 'seguimiento')));

  contenedor.appendChild(h('div', { class: 'rejilla rejilla--2 mb-16' },
    panelSalud(metricas),
    panelComposicion(metricas)));

  const secciones = [
    ['vencidas', 'Atrasadas', bandejas.vencidas, 'Nada atrasado. Buen momento para adelantar trabajo.'],
    ['hoy', 'Vencen hoy', bandejas.vencenHoy, 'Ninguna tarea compromete hoy.'],
    ['seguimiento', 'Seguimiento pendiente', bandejas.seguimientoVencido, 'Todos los seguimientos están al día.'],
    ['semana', 'Vencen esta semana', bandejas.vencenSemana, 'Nada más vence antes del domingo.'],
    ['bloqueadas', 'Bloqueadas', bandejas.bloqueadas, 'No hay tareas bloqueadas.'],
    ['huerfanas', 'Sin responsable o sin fecha', unir(bandejas.sinResponsable, bandejas.sinFecha),
      'Todas las tareas tienen dueño y fecha.'],
  ];

  const rejilla = h('div', { class: 'rejilla rejilla--2' });
  for (const [ancla, titulo, lista, vacioTexto] of secciones) {
    rejilla.appendChild(seccion(ancla, titulo, lista, vacioTexto));
  }
  contenedor.appendChild(rejilla);
}

function kpi(etiqueta, valor, detalle, color, ancla) {
  return h('div', {
    class: `kpi kpi--${color}${valor ? ' kpi--clic' : ''}`,
    onclick: () => {
      const destino = document.getElementById(`radar-${ancla}`);
      if (destino) destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  },
  h('div', { class: 'kpi__etiqueta' }, etiqueta),
  h('div', { class: 'kpi__valor' }, String(valor)),
  h('div', { class: 'kpi__detalle' }, detalle));
}

function panelSalud(metricas) {
  const iniciativa = store.iniciativaActiva();
  return h('section', { class: 'tarjeta' },
    h('div', { class: 'tarjeta__cab' },
      h('h2', {}, 'Salud de la iniciativa'),
      pastilla(`${metricas.proyectos} proyectos`, '', { linea: true })),
    h('div', { class: 'tarjeta__cuerpo fila fila--sup', style: { gap: '18px' } },
      medidor(metricas.salud, {
        color: `var(--${colorSalud(metricas.salud)})`,
        etiqueta: 'de 100',
      }),
      h('div', { class: 'crecer' },
        h('p', { class: 'pequeno suave' },
          iniciativa ? iniciativa.objetivo || iniciativa.nombre : 'Sin iniciativa seleccionada'),
        h('div', { class: 'fila envolver', style: { gap: '14px' } },
          dato('Avance', `${metricas.avance}%`),
          dato('Atrasadas', String(metricas.atrasadas)),
          dato('Bloqueadas', String(metricas.bloqueadas)),
          dato('Proyectos en riesgo', String(metricas.proyectosEnRiesgo))),
        h('div', { class: 'fila envolver mt-8', style: { gap: '14px' } },
          dato('Esfuerzo estimado', horasHumanas(metricas.esfuerzoEstimado)),
          dato('Esfuerzo real', horasHumanas(metricas.esfuerzoReal)),
          dato('Desvío', metricas.desvioPct === null ? '—' : `${metricas.desvioPct > 0 ? '+' : ''}${metricas.desvioPct}%`)),
        h('div', { class: 'mt-16' },
          boton('Ver informe completo', { icono: 'informe', sm: true, onclick: () => irA('informe') })))));
}

function panelComposicion(metricas) {
  const segmentos = ESTADOS_TAREA.map((e) => ({
    etiqueta: e.etiqueta,
    valor: metricas.porEstado[e.id] || 0,
    color: colorEstado(e.color === 'gris' ? 'gris' : e.color),
  }));
  return h('section', { class: 'tarjeta' },
    h('div', { class: 'tarjeta__cab' },
      h('h2', {}, 'Tareas por estado'),
      pastilla(`${metricas.total} en total`, '', { linea: true })),
    h('div', { class: 'tarjeta__cuerpo' },
      barraApilada(segmentos, { titulo: 'Distribución de tareas por estado' }),
      leyenda(segmentos.filter((s) => s.valor > 0)),
      h('div', { class: 'mt-16 fila envolver', style: { gap: '14px' } },
        dato('Cumplimiento de seguimiento', `${metricas.cumplimientoSeguimiento}%`),
        dato('Atraso promedio', metricas.atrasadas ? `${metricas.atrasoPromedio} días` : '—'),
        dato('Atraso máximo', metricas.atrasoMax ? `${metricas.atrasoMax} días` : '—'))));
}

function dato(etiqueta, valor) {
  return h('div', {},
    h('div', { class: 'mini tenue' }, etiqueta),
    h('div', { class: 'negrita' }, valor));
}

function seccion(ancla, titulo, tareas, textoVacio) {
  const cuerpo = tareas.length
    ? h('div', { class: 'lista-alertas' },
      tareas.slice(0, 12).map((t) => filaTarea(t, { accion: botonSeguimiento(t.id) })))
    : h('p', { class: 'tenue pequeno mb-0' }, textoVacio);

  return h('section', { class: 'tarjeta', id: `radar-${ancla}` },
    h('div', { class: 'tarjeta__cab' },
      h('h2', {}, titulo),
      pastilla(String(tareas.length), tareas.length ? 'rojo' : 'verde')),
    h('div', { class: 'tarjeta__cuerpo' },
      cuerpo,
      tareas.length > 12
        ? h('p', { class: 'mini tenue mt-8 mb-0' }, `y ${tareas.length - 12} más`)
        : null));
}

/** Une dos listas sin repetir tareas. */
function unir(a, b) {
  const vistos = new Set();
  return [...a, ...b].filter((t) => (vistos.has(t.id) ? false : vistos.add(t.id)));
}
