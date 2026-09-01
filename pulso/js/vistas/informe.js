/* Informe general de la iniciativa: una sola página con el estado completo,
 * pensada para imprimirse o guardarse como PDF y para pegar su resumen en un
 * correo. Cada gráfico viene acompañado de su tabla, así que el informe se
 * puede leer igual en blanco y negro. */

import { h, boton, pastilla, avatar, barra, tostada, copiar } from '../ui/componentes.js';
import {
  barrasHorizontales, barrasVerticales, barraApilada, leyenda, medidor,
  colorEstado, colorSerie,
} from '../ui/graficos.js';
import { descripcionFiltros } from '../ui/filtros.js';
import { abrirTarea } from '../ui/tarea.js';
import * as store from '../store/store.js';
import { descargarCSV } from '../store/backup.js';
import {
  ESTADOS_TAREA, ESTADOS_PROYECTO, TIPOS_APRENDIZAJE, ESTADOS_ACCION, CADENCIAS,
  etiquetaDe, colorDe,
} from '../store/schema.js';
import {
  metricasIniciativa, metricasProyecto, colorSalud, cierresPorSemana,
  cargaPorPersona, atrasosPorEquipo, topAtrasos,
} from '../domain/metricas.js';
import { diasAtraso, estaAtrasada } from '../domain/alertas.js';
import { formatear, horasHumanas, hoyISO, humano } from '../domain/fechas.js';

export const vista = {
  id: 'informe',
  titulo: 'Informe de la iniciativa',
  subtitulo: () => 'Estado completo para revisar con el comité',
  acciones: () => [
    boton('Exportar CSV', { icono: 'descargar', onclick: exportarCSV }),
    boton('Copiar resumen', { icono: 'copiar', onclick: copiarResumen }),
    boton('Imprimir o guardar en PDF', { icono: 'imprimir', variante: 'primario', onclick: () => window.print() }),
  ],
  pintar,
};

function pintar(contenedor) {
  const hoy = hoyISO();
  const iniciativa = store.iniciativaActiva();
  const proyectos = store.proyectosVisibles();
  const tareas = store.tareasDeIniciativa();

  if (!iniciativa) {
    contenedor.appendChild(h('div', { class: 'vacio' },
      h('strong', {}, 'No hay ninguna iniciativa seleccionada'),
      'Crea una en Ajustes para poder emitir el informe.'));
    return;
  }

  const metricas = metricasIniciativa(proyectos, tareas, hoy);
  const dueno = store.porId('personas', iniciativa.duenoId);
  const filtros = descripcionFiltros();

  contenedor.appendChild(h('header', { class: 'seccion-informe mb-24' },
    h('h1', { style: { fontSize: '24px' } }, iniciativa.nombre),
    iniciativa.objetivo ? h('p', { class: 'suave', style: { maxWidth: '70ch' } }, iniciativa.objetivo) : null,
    h('div', { class: 'fila envolver mini tenue', style: { gap: '16px' } },
      h('span', {}, `Emitido el ${formatear(hoy, { diaSemana: true, anio: true })}`),
      dueno ? h('span', {}, `Responsable: ${dueno.nombre}`) : null,
      iniciativa.fechaInicio ? h('span', {}, `Inicio: ${formatear(iniciativa.fechaInicio, { anio: true })}`) : null,
      iniciativa.fechaFin ? h('span', {}, `Fin previsto: ${formatear(iniciativa.fechaFin, { anio: true })} (${humano(iniciativa.fechaFin, hoy)})`) : null,
      h('span', {}, `${proyectos.length} proyectos · ${store.estado.equipos.length} equipos`)),
    filtros ? h('p', { class: 'mini' }, `Nota: el informe se emitió con filtros activos — ${filtros}.`) : null));

  contenedor.appendChild(bloqueResumen(metricas));
  contenedor.appendChild(bloqueProyectos(proyectos, tareas, hoy));
  contenedor.appendChild(bloqueRitmo(tareas, hoy));
  contenedor.appendChild(bloqueAtrasos(tareas, proyectos, hoy));
  contenedor.appendChild(bloqueCarga(tareas, hoy));
  contenedor.appendChild(bloqueAprendizajes());
  contenedor.appendChild(h('p', { class: 'mini tenue mt-24' },
    'Informe generado por Pulso a partir de los datos guardados en este navegador. '
    + 'Las horas se muestran en jornadas de 8 horas cuando superan un día.'));
}

/* ------------------------------------------------------------- secciones */

function bloqueResumen(metricas) {
  const segmentos = ESTADOS_TAREA.map((e) => ({
    etiqueta: e.etiqueta,
    valor: metricas.porEstado[e.id] || 0,
    color: colorEstado(e.color === 'azul' ? 'azul' : e.color),
  }));

  return seccion('Resumen ejecutivo',
    h('div', {},
      h('div', { class: 'fila fila--sup envolver mb-16', style: { gap: '22px' } },
        h('div', { class: 'fila', style: { gap: '14px' } },
          medidor(metricas.salud, { color: `var(--${colorSalud(metricas.salud)})`, etiqueta: 'salud' }),
          h('div', {},
            h('div', { class: 'mini tenue' }, 'Índice de salud'),
            h('div', { class: 'negrita' }, textoSalud(metricas.salud)),
            h('p', { class: 'mini tenue', style: { maxWidth: '30ch' } },
              'Combina cuántas tareas van atrasadas, cuánto, cuántas están bloqueadas, '
              + 'el desvío de esfuerzo y el cumplimiento de los seguimientos.'))),
        h('div', { class: 'rejilla rejilla--4 crecer' },
          dato('Avance', `${metricas.avance}%`, `${metricas.hechas} de ${metricas.total} tareas cerradas`),
          dato('Atrasadas', String(metricas.atrasadas),
            metricas.atrasadas ? `${metricas.atrasoPromedio} días en promedio` : 'ninguna fuera de plazo'),
          dato('Esfuerzo real', horasHumanas(metricas.esfuerzoReal),
            `sobre ${horasHumanas(metricas.esfuerzoEstimado)} estimados`),
          dato('Desvío de esfuerzo',
            metricas.desvioPct === null ? '—' : `${metricas.desvioPct > 0 ? '+' : ''}${metricas.desvioPct}%`,
            metricas.desvioPct === null ? 'sin estimaciones' : (metricas.desvioPct > 0 ? 'por sobre lo estimado' : 'por debajo de lo estimado')))),
      h('h3', { class: 'mb-8' }, 'Tareas por estado'),
      barraApilada(segmentos, { titulo: 'Tareas por estado' }),
      leyenda(segmentos.filter((s) => s.valor > 0)),
      h('div', { class: 'rejilla rejilla--4 mt-16' },
        dato('Proyectos en riesgo', `${metricas.proyectosEnRiesgo} de ${metricas.proyectos}`, 'salud bajo 80'),
        dato('Bloqueadas', String(metricas.bloqueadas), 'esperando a un tercero o a otra tarea'),
        dato('Cumplimiento de seguimiento', `${metricas.cumplimientoSeguimiento}%`, 'tareas revisadas dentro de su cadencia'),
        dato('Atraso máximo', metricas.atrasoMax ? `${metricas.atrasoMax} días` : '—', 'la tarea más rezagada'))));
}

function textoSalud(indice) {
  if (indice >= 80) return 'En marcha';
  if (indice >= 55) return 'Con señales de alerta';
  return 'En problemas';
}

function bloqueProyectos(proyectos, tareas, hoy) {
  const filas = proyectos.map((p) => ({
    proyecto: p,
    metricas: metricasProyecto(p, tareas.filter((t) => t.proyectoId === p.id), hoy),
  }));

  return seccion('Estado por proyecto',
    h('div', { class: 'tabla-envoltura' },
      h('table', { class: 'tabla tabla--densa' },
        h('thead', {}, h('tr', {},
          h('th', {}, 'Proyecto'),
          h('th', {}, 'Equipo'),
          h('th', {}, 'Responsable'),
          h('th', {}, 'Estado'),
          h('th', { class: 'num' }, 'Salud'),
          h('th', { style: { minWidth: '110px' } }, 'Avance'),
          h('th', { class: 'num' }, 'Abiertas'),
          h('th', { class: 'num' }, 'Atrasadas'),
          h('th', { class: 'num' }, 'Esfuerzo'),
          h('th', {}, 'Fin plan'))),
        h('tbody', {}, filas.map(({ proyecto, metricas }) => h('tr', {},
          h('td', { class: 'negrita' }, proyecto.nombre),
          h('td', {}, store.nombreDe('equipos', proyecto.equipoId)),
          h('td', {}, store.nombreDe('personas', proyecto.responsableId, 'sin dueño')),
          h('td', {}, pastilla(etiquetaDe(ESTADOS_PROYECTO, proyecto.estado), colorDe(ESTADOS_PROYECTO, proyecto.estado))),
          h('td', { class: 'num' }, pastilla(String(metricas.salud), metricas.colorSalud, { punto: true })),
          h('td', {}, barra(metricas.avance, metricas.colorSalud), h('span', { class: 'mini tenue' }, `${metricas.avance}%`)),
          h('td', { class: 'num' }, String(metricas.abiertas)),
          h('td', { class: 'num', style: { color: metricas.atrasadas ? 'var(--rojo)' : 'inherit' } }, String(metricas.atrasadas)),
          h('td', { class: 'num', style: { whiteSpace: 'nowrap' } },
            `${horasHumanas(metricas.esfuerzoReal)} / ${horasHumanas(metricas.esfuerzoEstimado)}`),
          h('td', {}, proyecto.fechaFinPlan ? formatear(proyecto.fechaFinPlan, { anio: true }) : '—')))))));
}

function bloqueRitmo(tareas, hoy) {
  const serie = cierresPorSemana(tareas, 10, hoy);
  const datos = serie.map((s) => ({
    etiqueta: formatear(s.inicio),
    valor: s.cerradas,
    detalle: `Semana del ${formatear(s.inicio, { anio: true })} al ${formatear(s.fin, { anio: true })}`,
  }));
  const total = serie.reduce((s, x) => s + x.cerradas, 0);

  return seccion('Ritmo de cierre',
    h('div', {},
      h('p', { class: 'pequeno suave' },
        `${total} tareas cerradas en las últimas 10 semanas, un promedio de `
        + `${Math.round((total / 10) * 10) / 10} por semana.`),
      barrasVerticales(datos, {
        titulo: 'Tareas cerradas por semana', sufijo: ' tareas', sufijoSingular: ' tarea',
      }),
      h('p', { class: 'mini tenue' }, 'Cada barra es la semana que comienza el lunes indicado.')));
}

function bloqueAtrasos(tareas, proyectos, hoy) {
  const porEquipo = atrasosPorEquipo(store.estado.equipos, proyectos, tareas, hoy);
  const top = topAtrasos(tareas, 8, hoy);

  const grafico = porEquipo.length
    ? barrasHorizontales(
      porEquipo.map((x, i) => ({
        etiqueta: x.equipo.nombre,
        valor: x.atrasadas,
        color: colorSerie(i),
        detalle: `${x.atrasadas} de ${x.total} tareas · ${x.diasPromedio} días de atraso promedio`,
      })),
      { titulo: 'Tareas atrasadas por equipo', sufijo: ' tareas', sufijoSingular: ' tarea' },
    )
    : h('p', { class: 'tenue pequeno' }, 'Ningún equipo tiene tareas atrasadas.');

  const tabla = h('div', { class: 'tabla-envoltura mt-8' },
    h('table', { class: 'tabla tabla--densa' },
      h('thead', {}, h('tr', {},
        h('th', {}, 'Equipo'), h('th', { class: 'num' }, 'Tareas'),
        h('th', { class: 'num' }, 'Atrasadas'), h('th', { class: 'num' }, 'Atraso promedio'))),
      h('tbody', {}, porEquipo.map((x) => h('tr', {},
        h('td', {}, x.equipo.nombre),
        h('td', { class: 'num' }, String(x.total)),
        h('td', { class: 'num' }, String(x.atrasadas)),
        h('td', { class: 'num' }, x.diasPromedio ? `${x.diasPromedio} días` : '—'))))));

  const listaTop = top.length
    ? h('div', { class: 'tabla-envoltura' },
      h('table', { class: 'tabla tabla--densa' },
        h('thead', {}, h('tr', {},
          h('th', {}, 'Tarea'), h('th', {}, 'Proyecto'), h('th', {}, 'Responsable'),
          h('th', {}, 'Compromiso'), h('th', { class: 'num' }, 'Atraso'))),
        h('tbody', {}, top.map(({ tarea, dias }) => h('tr', { class: 'clicable', onclick: () => abrirTarea(tarea.id) },
          h('td', { class: 'negrita' }, tarea.titulo),
          h('td', {}, store.nombreDe('proyectos', tarea.proyectoId)),
          h('td', {}, store.nombreDe('personas', tarea.responsableId, 'sin dueño')),
          h('td', {}, formatear(tarea.fechaCompromiso, { anio: true })),
          h('td', { class: 'num negrita', style: { color: 'var(--rojo)' } }, `${dias} d`))))))
    : h('p', { class: 'tenue pequeno mb-0' }, 'No hay tareas fuera de plazo.');

  return seccion('Atrasos',
    h('div', {},
      h('div', { class: 'rejilla rejilla--2' },
        h('div', {}, h('h3', { class: 'mb-8' }, 'Por equipo'), grafico, tabla),
        h('div', {}, h('h3', { class: 'mb-8' }, 'Las más rezagadas'), listaTop))));
}

function bloqueCarga(tareas, hoy) {
  const carga = cargaPorPersona(tareas, store.estado.personas, hoy).filter((c) => c.total > 0);
  if (!carga.length) return h('div');

  return seccion('Carga por persona',
    h('div', { class: 'tabla-envoltura' },
      h('table', { class: 'tabla tabla--densa' },
        h('thead', {}, h('tr', {},
          h('th', {}, 'Persona'), h('th', {}, 'Equipos'),
          h('th', { class: 'num' }, 'Abiertas'), h('th', { class: 'num' }, 'Atrasadas'),
          h('th', { class: 'num' }, 'Esfuerzo comprometido'))),
        h('tbody', {}, carga.map((c) => h('tr', {},
          h('td', {}, h('span', { class: 'fila' }, avatar(c.persona, 'sm'), c.persona.nombre)),
          h('td', { class: 'mini tenue' },
            (c.persona.equipoIds || []).map((id) => store.nombreDe('equipos', id)).join(', ') || '—'),
          h('td', { class: 'num' }, String(c.abiertas)),
          h('td', { class: 'num', style: { color: c.atrasadas ? 'var(--rojo)' : 'inherit' } }, String(c.atrasadas)),
          h('td', { class: 'num' }, horasHumanas(c.horasAbiertas))))))));
}

function bloqueAprendizajes() {
  const iniciativa = store.iniciativaActiva();
  const idsProyecto = new Set(store.proyectosVisibles().map((p) => p.id));
  const idsTarea = new Set(store.tareasDeIniciativa().map((t) => t.id));
  const registros = store.estado.aprendizajes.filter((a) => (
    (a.ambito === 'iniciativa' && a.refId === (iniciativa || {}).id)
    || (a.ambito === 'proyecto' && idsProyecto.has(a.refId))
    || (a.ambito === 'tarea' && idsTarea.has(a.refId))
  )).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  if (!registros.length) {
    return seccion('Aprendizajes y riesgos',
      h('p', { class: 'tenue pequeno mb-0' },
        'Todavía no hay registros en la bitácora de aprendizajes.'));
  }

  const acciones = registros.filter((r) => r.accionAcordada
    && ['pendiente', 'en_curso'].includes(r.estadoAccion));

  return seccion('Aprendizajes y riesgos',
    h('div', {},
      h('div', { class: 'lista-alertas mb-16' }, registros.slice(0, 12).map((r) => h('div', { class: 'fila-alerta' },
        pastilla(etiquetaDe(TIPOS_APRENDIZAJE, r.tipo), colorDe(TIPOS_APRENDIZAJE, r.tipo), { punto: true }),
        h('div', { class: 'fila-alerta__texto' },
          h('div', { class: 'pequeno' }, r.texto),
          h('div', { class: 'fila-alerta__sub' },
            `${formatear(r.fecha, { anio: true })} · ${store.nombreDe('personas', r.autorId, 'sin autor')}`))))),
      acciones.length
        ? h('div', {},
          h('h3', { class: 'mb-8' }, 'Acciones acordadas abiertas'),
          h('div', { class: 'tabla-envoltura' },
            h('table', { class: 'tabla tabla--densa' },
              h('thead', {}, h('tr', {},
                h('th', {}, 'Acción'), h('th', {}, 'Responsable'), h('th', {}, 'Estado'))),
              h('tbody', {}, acciones.map((r) => h('tr', {},
                h('td', {}, r.accionAcordada),
                h('td', {}, store.nombreDe('personas', r.responsableAccionId, 'sin responsable')),
                h('td', {}, pastilla(etiquetaDe(ESTADOS_ACCION, r.estadoAccion),
                  colorDe(ESTADOS_ACCION, r.estadoAccion)))))))))
        : null));
}

function seccion(titulo, contenido) {
  return h('section', { class: 'tarjeta mb-16 seccion-informe' },
    h('div', { class: 'tarjeta__cab' }, h('h2', {}, titulo)),
    h('div', { class: 'tarjeta__cuerpo' }, contenido));
}

function dato(etiqueta, valor, detalle) {
  return h('div', {},
    h('div', { class: 'kpi__etiqueta' }, etiqueta),
    h('div', { style: { fontSize: '21px', fontWeight: '700', letterSpacing: '-.02em' } }, valor),
    detalle ? h('div', { class: 'mini tenue' }, detalle) : null);
}

/* ------------------------------------------------------- salidas de texto */

/** Resumen en texto plano, para pegar en un correo o en el chat del equipo. */
function copiarResumen() {
  const hoy = hoyISO();
  const iniciativa = store.iniciativaActiva();
  if (!iniciativa) {
    tostada('No hay iniciativa seleccionada.', 'error');
    return;
  }
  const proyectos = store.proyectosVisibles();
  const tareas = store.tareasDeIniciativa();
  const m = metricasIniciativa(proyectos, tareas, hoy);

  const lineas = [
    `${iniciativa.nombre} — estado al ${formatear(hoy, { anio: true })}`,
    '',
    `Salud ${m.salud}/100 (${textoSalud(m.salud)}) · avance ${m.avance}% · `
      + `${m.hechas} de ${m.total} tareas cerradas`,
    `Atrasadas: ${m.atrasadas}${m.atrasadas ? ` (promedio ${m.atrasoPromedio} días, máximo ${m.atrasoMax})` : ''}`
      + ` · bloqueadas: ${m.bloqueadas}`,
    `Esfuerzo: ${horasHumanas(m.esfuerzoReal)} reales sobre ${horasHumanas(m.esfuerzoEstimado)} estimados`
      + `${m.desvioPct === null ? '' : ` (${m.desvioPct > 0 ? '+' : ''}${m.desvioPct}%)`}`,
    `Cumplimiento de seguimiento: ${m.cumplimientoSeguimiento}%`,
    '',
    'POR PROYECTO',
  ];

  for (const { proyecto, metricas } of m.porProyecto) {
    lineas.push(`- ${proyecto.nombre} (${store.nombreDe('equipos', proyecto.equipoId)}, `
      + `${store.nombreDe('personas', proyecto.responsableId, 'sin dueño')}): `
      + `salud ${metricas.salud}, avance ${metricas.avance}%, `
      + `${metricas.abiertas} abiertas, ${metricas.atrasadas} atrasadas`
      + `${proyecto.fechaFinPlan ? `, fin plan ${formatear(proyecto.fechaFinPlan, { anio: true })}` : ''}`);
  }

  const top = topAtrasos(tareas, 5, hoy);
  if (top.length) {
    lineas.push('', 'LO MÁS ATRASADO');
    for (const { tarea, dias } of top) {
      lineas.push(`- ${tarea.titulo} (${store.nombreDe('personas', tarea.responsableId, 'sin dueño')}): `
        + `${dias} días de atraso`);
    }
  }

  const bloqueadas = tareas.filter((t) => t.estado === 'bloqueada');
  if (bloqueadas.length) {
    lineas.push('', 'BLOQUEADAS');
    for (const t of bloqueadas) {
      lineas.push(`- ${t.titulo}: ${t.motivoBloqueo || 'sin motivo registrado'}`);
    }
  }

  copiar(lineas.join('\n'), 'Resumen del informe copiado');
}

/** Exporta a CSV todas las tareas de la iniciativa. */
function exportarCSV() {
  const hoy = hoyISO();
  const tareas = store.tareasDeIniciativa();
  if (!tareas.length) {
    tostada('No hay tareas que exportar.', 'error');
    return;
  }
  descargarCSV(tareas, (t) => {
    const proyecto = store.porId('proyectos', t.proyectoId);
    return [
      proyecto ? proyecto.nombre : '',
      proyecto ? store.nombreDe('equipos', proyecto.equipoId, '') : '',
      t.titulo,
      store.nombreDe('personas', t.responsableId, ''),
      etiquetaDe(ESTADOS_TAREA, t.estado),
      t.prioridad,
      t.fechaInicio || '',
      t.fechaCompromiso || '',
      t.fechaCierreReal || '',
      t.esfuerzoEstimadoH ?? '',
      t.esfuerzoRealH ?? '',
      etiquetaDe(CADENCIAS, t.cadencia),
      t.proximoSeguimiento || '',
      estaAtrasada(t, hoy) ? diasAtraso(t, hoy) : 0,
      (t.etiquetas || []).join(' '),
    ];
  });
  tostada('CSV descargado', 'ok');
}
