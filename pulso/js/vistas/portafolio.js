/* Portafolio: todos los proyectos de la iniciativa a la vez, en una tabla que
 * se lee de corrido. Una fila por proyecto con su avance, su salud, sus
 * atrasos y el esfuerzo estimado contra el real. */

import {
  h, boton, pastilla, avatar, barra, campo, entrada, lista, modal, tostada, confirmar,
} from '../ui/componentes.js';
import { filaTarea, botonSeguimiento } from '../ui/tarea.js';
import { barraFiltros, aplicar } from '../ui/filtros.js';
import * as store from '../store/store.js';
import { ESTADOS_PROYECTO, CADENCIAS, PLANTILLAS, etiquetaDe, colorDe } from '../store/schema.js';
import { metricasProyecto } from '../domain/metricas.js';
import { formatear, horasHumanas, humano, hoyISO } from '../domain/fechas.js';
import { irA, repintar } from '../router.js';

export const vista = {
  id: 'portafolio',
  titulo: 'Portafolio',
  subtitulo: () => 'Todos los proyectos de la iniciativa, uno al lado del otro',
  acciones: () => [
    boton('Nuevo proyecto', { icono: 'mas', variante: 'primario', onclick: () => abrirProyecto(null) }),
  ],
  pintar,
};

function pintar(contenedor) {
  const hoy = hoyISO();
  const proyectos = store.proyectosVisibles();
  const tareas = aplicar(store.tareasDeIniciativa());

  contenedor.appendChild(barraFiltros({
    mostrar: ['texto', 'equipo', 'responsable'],
    alCambiar: repintar,
  }));

  if (!proyectos.length) {
    contenedor.appendChild(h('div', { class: 'vacio' },
      h('strong', {}, 'Sin proyectos en esta iniciativa'),
      'Crea el primero para empezar a hacerle seguimiento.'));
    return;
  }

  const filas = proyectos.map((p) => ({
    proyecto: p,
    tareas: tareas.filter((t) => t.proyectoId === p.id),
    metricas: metricasProyecto(p, tareas.filter((t) => t.proyectoId === p.id), hoy),
  }));

  const cuerpo = h('tbody', {});
  for (const fila of filas) cuerpo.appendChild(filaProyecto(fila, cuerpo, hoy));

  contenedor.appendChild(h('section', { class: 'tarjeta' },
    h('div', { class: 'tabla-envoltura' },
      h('table', { class: 'tabla tabla--densa' },
        h('thead', {}, h('tr', {},
          h('th', {}, 'Proyecto'),
          h('th', {}, 'Equipo'),
          h('th', {}, 'Responsable'),
          h('th', {}, 'Estado'),
          h('th', { style: { minWidth: '110px' } }, 'Avance'),
          h('th', { class: 'num' }, 'Salud'),
          h('th', { class: 'num' }, 'Tareas'),
          h('th', { class: 'num' }, 'Atrasadas'),
          h('th', {}, 'Vence'),
          h('th', { class: 'num' }, 'Esfuerzo'),
          h('th', {}, 'Fin plan'),
          h('th', {}, ''))),
        cuerpo))));

  contenedor.appendChild(h('p', { class: 'mini tenue mt-8' },
    'Haz clic en una fila para desplegar sus tareas abiertas. "Esfuerzo" muestra las horas '
    + 'reales sobre las estimadas, y bajo ellas el desvío.'));
}

function filaProyecto({ proyecto, tareas, metricas }, cuerpo, hoy) {
  const equipo = store.porId('equipos', proyecto.equipoId);
  const responsable = store.porId('personas', proyecto.responsableId);
  let desplegada = null;

  const fila = h('tr', {
    class: 'clicable',
    onclick: (e) => {
      if (e.target.closest('button')) return;
      if (desplegada) { desplegada.remove(); desplegada = null; return; }
      desplegada = detalleProyecto(tareas);
      fila.after(desplegada);
    },
  },
  h('td', {}, h('div', { class: 'negrita' }, proyecto.nombre),
    proyecto.descripcion ? h('div', { class: 'mini tenue truncar', style: { maxWidth: '210px' } }, proyecto.descripcion) : null),
  h('td', {}, equipo
    ? h('span', { class: 'fila' },
      h('span', { class: 'punto', style: { background: equipo.color } }), equipo.nombre)
    : '—'),
  h('td', {}, h('span', { class: 'fila' }, avatar(responsable, 'sm'),
    h('span', { class: 'pequeno' }, responsable ? responsable.nombre.split(' ')[0] : 'sin dueño'))),
  h('td', {}, pastilla(etiquetaDe(ESTADOS_PROYECTO, proyecto.estado), colorDe(ESTADOS_PROYECTO, proyecto.estado))),
  h('td', {}, barra(metricas.avance, metricas.colorSalud), h('span', { class: 'mini tenue' }, `${metricas.avance}%`)),
  h('td', { class: 'num' }, pastilla(String(metricas.salud), metricas.colorSalud, { punto: true, titulo: 'Índice de salud de 0 a 100' })),
  h('td', { class: 'num' }, `${metricas.abiertas}/${metricas.total}`),
  h('td', { class: 'num' }, metricas.atrasadas
    ? h('span', { class: 'negrita', style: { color: 'var(--rojo)' } }, String(metricas.atrasadas))
    : '0'),
  h('td', {}, metricas.proximoVencimiento
    ? h('span', {
      title: humano(metricas.proximoVencimiento, hoy),
      style: { color: metricas.proximoVencimiento < hoy ? 'var(--rojo)' : 'inherit' },
    }, formatear(metricas.proximoVencimiento))
    : '—'),
  h('td', {
    class: 'num',
    style: { whiteSpace: 'nowrap' },
    title: `Real ${horasHumanas(metricas.esfuerzoReal)} sobre un estimado de ${horasHumanas(metricas.esfuerzoEstimado)}`,
  },
  h('span', {}, `${horasHumanas(metricas.esfuerzoReal)} / ${horasHumanas(metricas.esfuerzoEstimado)}`),
  metricas.desvioPct === null ? null : h('div', {
    class: 'mini',
    style: { color: metricas.desvioPct > 15 ? 'var(--rojo)' : 'var(--texto-tenue)' },
    title: 'Desvío del esfuerzo real respecto del estimado',
  }, `${metricas.desvioPct > 0 ? '+' : ''}${metricas.desvioPct}%`)),
  h('td', {}, proyecto.fechaFinPlan
    ? h('span', {
      title: humano(proyecto.fechaFinPlan, hoy),
      style: { color: metricas.diasParaFin !== null && metricas.diasParaFin < 0 ? 'var(--rojo)' : 'inherit' },
    }, formatear(proyecto.fechaFinPlan))
    : '—'),
  h('td', { class: 'no-imprimir' }, h('div', { class: 'fila' },
    boton('', { icono: 'tablero', sm: true, variante: 'plano', titulo: 'Ver en el tablero',
      onclick: () => { store.fijarFiltro({ proyectoId: proyecto.id }); irA('tablero'); } }),
    boton('', { icono: 'lapiz', sm: true, variante: 'plano', titulo: 'Editar proyecto',
      onclick: () => abrirProyecto(proyecto.id) }))));

  return fila;
}

function detalleProyecto(tareas) {
  const abiertas = tareas.filter((t) => t.estado !== 'hecha')
    .sort((a, b) => (a.fechaCompromiso || '9999').localeCompare(b.fechaCompromiso || '9999'));
  return h('tr', {}, h('td', { colspan: '12', style: { background: 'var(--superficie-2)' } },
    abiertas.length
      ? h('div', { class: 'lista-alertas' },
        abiertas.slice(0, 10).map((t) => filaTarea(t, { accion: botonSeguimiento(t.id) })))
      : h('p', { class: 'tenue pequeno mb-0' }, 'No quedan tareas abiertas en este proyecto.')));
}

/* ----------------------------------------------------- ficha de proyecto */

/** Crea o edita un proyecto. Se usa también desde Ajustes. */
export function abrirProyecto(proyectoId) {
  const existente = proyectoId ? store.porId('proyectos', proyectoId) : null;
  const iniciativa = store.iniciativaActiva();
  if (!iniciativa && !existente) {
    tostada('Primero crea una iniciativa en Ajustes.', 'error');
    return null;
  }
  const proyecto = existente || { ...PLANTILLAS.proyectos(), iniciativaId: iniciativa.id };

  const nombre = entrada('text', proyecto.nombre, { placeholder: 'Nombre del proyecto', maxlength: '120' });
  const descripcion = entrada('text', proyecto.descripcion, { placeholder: 'Para qué es este proyecto' });
  const listaEquipos = lista(
    [{ id: '', etiqueta: 'Sin equipo' },
      ...store.estado.equipos.map((e) => ({ id: e.id, etiqueta: e.nombre }))],
    proyecto.equipoId || '');
  const listaResponsables = lista(
    [{ id: '', etiqueta: 'Sin responsable' },
      ...store.estado.personas.map((p) => ({ id: p.id, etiqueta: p.nombre }))],
    proyecto.responsableId || '');
  const listaEstados = lista(
    ESTADOS_PROYECTO.map((e) => ({ id: e.id, etiqueta: e.etiqueta })), proyecto.estado);
  const listaIniciativas = lista(
    store.estado.iniciativas.map((i) => ({ id: i.id, etiqueta: i.nombre })), proyecto.iniciativaId);
  const listaCadencia = lista(
    CADENCIAS.map((c) => ({ id: c.id, etiqueta: c.etiqueta })), proyecto.cadenciaDefecto);
  const inicio = entrada('date', proyecto.fechaInicio || '');
  const fin = entrada('date', proyecto.fechaFinPlan || '');

  const acciones = [];
  if (existente) {
    acciones.push(boton('Eliminar', {
      variante: 'peligro',
      onclick: async () => {
        const cuantas = store.tareasDeProyecto(existente.id).length;
        const si = await confirmar('Eliminar proyecto',
          `Se eliminará "${existente.nombre}"${cuantas ? ` y sus ${cuantas} tarea(s)` : ''}. No se puede deshacer.`,
          { textoSi: 'Eliminar', peligro: true });
        if (si) {
          await store.eliminar('proyectos', existente.id);
          tostada('Proyecto eliminado');
          control.cerrar();
        }
      },
    }));
    acciones.push(h('span', { class: 'separador' }));
  }
  acciones.push(boton(existente ? 'Guardar' : 'Crear proyecto', {
    variante: 'primario',
    onclick: async () => {
      if (!nombre.value.trim()) {
        tostada('El proyecto necesita un nombre.', 'error');
        return;
      }
      await store.guardar('proyectos', {
        ...proyecto,
        nombre: nombre.value.trim(),
        descripcion: descripcion.value.trim(),
        iniciativaId: listaIniciativas.value || proyecto.iniciativaId,
        equipoId: listaEquipos.value || null,
        responsableId: listaResponsables.value || null,
        estado: listaEstados.value,
        cadenciaDefecto: listaCadencia.value,
        fechaInicio: inicio.value || null,
        fechaFinPlan: fin.value || null,
      });
      tostada(existente ? 'Proyecto actualizado' : 'Proyecto creado', 'ok');
      control.cerrar();
    },
  }));

  const control = modal({
    titulo: existente ? 'Editar proyecto' : 'Nuevo proyecto',
    cuerpo: h('div', {},
      campo('Nombre', nombre),
      campo('Descripción', descripcion),
      h('div', { class: 'rejilla-campos' },
        campo('Iniciativa', listaIniciativas),
        campo('Equipo', listaEquipos),
        campo('Responsable', listaResponsables),
        campo('Estado', listaEstados),
        campo('Fecha de inicio', inicio),
        campo('Fin planificado', fin),
        campo('Cadencia por defecto', listaCadencia,
          'Es la que se propone a las tareas nuevas de este proyecto.'))),
    acciones,
  });
  return control;
}
