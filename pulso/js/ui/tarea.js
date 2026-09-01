/* Todo lo que se ve y se edita de una tarea: la tarjeta del tablero, la fila
 * compacta de los listados, la ficha completa y el registro rápido de
 * seguimiento. Se comparte entre todas las vistas para que una tarea se vea y
 * se edite igual en cualquier parte de la aplicación. */

import {
  h, boton, pastilla, avatar, barra, campo, entrada, areaTexto, lista, modal,
  confirmar, tostada, icono, vaciar,
} from './componentes.js';
import * as store from '../store/store.js';
import {
  ESTADOS_TAREA, PRIORIDADES, CADENCIAS, SEMAFOROS, etiquetaDe, colorDe,
} from '../store/schema.js';
import { semaforo, colorSemaforo, diasAtraso, holgura } from '../domain/alertas.js';
import { seguimientoVencido, diasSinSeguimiento, primerSeguimiento } from '../domain/cadencia.js';
import { formatear, humano, horasHumanas, hoyISO } from '../domain/fechas.js';

const opciones = (catalogo) => catalogo.map((c) => ({ id: c.id, etiqueta: c.etiqueta }));

/* ---------------------------------------------------------- presentación */

/** Texto corto del plazo: "vence en 3 días", "12 días de atraso", "sin fecha". */
export function textoPlazo(tarea, hoy = hoyISO()) {
  if (tarea.estado === 'hecha') {
    return tarea.fechaCierreReal ? `cerrada el ${formatear(tarea.fechaCierreReal)}` : 'cerrada';
  }
  if (!tarea.fechaCompromiso) return 'sin fecha de compromiso';
  const atraso = diasAtraso(tarea, hoy);
  if (atraso > 0) return `${atraso} día${atraso > 1 ? 's' : ''} de atraso`;
  const falta = holgura(tarea, hoy);
  if (falta === 0) return 'vence hoy';
  return `vence ${humano(tarea.fechaCompromiso, hoy)}`;
}

/** Tarjeta del tablero. */
export function tarjetaTarea(tarea, { arrastrable = true, mostrarProyecto = true } = {}) {
  const color = colorSemaforo(semaforo(tarea));
  const persona = store.porId('personas', tarea.responsableId);
  const proyecto = store.porId('proyectos', tarea.proyectoId);
  const cadencia = CADENCIAS.find((c) => c.id === tarea.cadencia);
  const atrasoSeguimiento = seguimientoVencido(tarea) ? diasSinSeguimiento(tarea) : 0;

  const tarjeta = h('article', {
    class: `tarea tarea--${color}`,
    draggable: arrastrable ? 'true' : null,
    tabindex: '0',
    role: 'button',
    'aria-label': `${tarea.titulo}. ${textoPlazo(tarea)}`,
    dataset: { tarea: tarea.id },
    onclick: () => abrirTarea(tarea.id),
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirTarea(tarea.id); } },
  },
  mostrarProyecto && proyecto ? h('div', { class: 'tarea__proyecto truncar' }, proyecto.nombre) : null,
  h('div', { class: 'tarea__titulo' }, tarea.titulo),
  h('div', { class: 'tarea__meta' },
    tarea.fechaCompromiso
      ? pastilla(formatear(tarea.fechaCompromiso), color === 'gris' ? '' : color, { punto: true, titulo: textoPlazo(tarea) })
      : pastilla('sin fecha', '', { linea: true }),
    tarea.prioridad === 'critica' || tarea.prioridad === 'alta'
      ? pastilla(etiquetaDe(PRIORIDADES, tarea.prioridad), colorDe(PRIORIDADES, tarea.prioridad), { linea: true })
      : null,
    cadencia && tarea.cadencia !== 'ninguna'
      ? pastilla(cadencia.corta, atrasoSeguimiento ? 'rojo' : '', { titulo: atrasoSeguimiento ? `Seguimiento ${cadencia.etiqueta.toLowerCase()} atrasado ${atrasoSeguimiento} día(s)` : `Seguimiento ${cadencia.etiqueta.toLowerCase()}` })
      : null,
    tarea.esfuerzoEstimadoH ? h('span', { class: 'mini tenue' }, horasHumanas(tarea.esfuerzoEstimadoH)) : null),
  tarea.avance > 0 && tarea.estado !== 'hecha' ? h('div', { class: 'mt-8' }, barra(tarea.avance)) : null,
  h('div', { class: 'tarea__pie' },
    avatar(persona, 'sm'),
    h('span', { class: 'separador' }),
    (tarea.etiquetas || []).slice(0, 2).map((e) => h('span', { class: 'mini tenue' }, `#${e}`))));

  if (arrastrable) {
    tarjeta.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', tarea.id);
      e.dataTransfer.effectAllowed = 'move';
      tarjeta.classList.add('arrastrando');
    });
    tarjeta.addEventListener('dragend', () => tarjeta.classList.remove('arrastrando'));
  }
  return tarjeta;
}

/** Fila compacta para las bandejas de alerta y los listados. */
export function filaTarea(tarea, { accion } = {}) {
  const color = colorSemaforo(semaforo(tarea));
  const persona = store.porId('personas', tarea.responsableId);
  const proyecto = store.porId('proyectos', tarea.proyectoId);
  return h('div', { class: 'fila-alerta' },
    h('span', { class: `punto punto--${color}`, title: textoPlazo(tarea) }),
    avatar(persona, 'sm'),
    h('div', { class: 'fila-alerta__texto' },
      h('div', {
        class: 'fila-alerta__titulo truncar',
        role: 'button',
        tabindex: '0',
        onclick: () => abrirTarea(tarea.id),
        onkeydown: (e) => { if (e.key === 'Enter') abrirTarea(tarea.id); },
      }, tarea.titulo),
      h('div', { class: 'fila-alerta__sub truncar' },
        [proyecto ? proyecto.nombre : 'sin proyecto',
          persona ? persona.nombre : 'sin responsable',
          textoPlazo(tarea)].join(' · '))),
    accion || null);
}

/* ----------------------------------------------------------- ficha completa */

/**
 * Abre la ficha de una tarea. Sin id crea una nueva con los valores de `previos`.
 */
export function abrirTarea(tareaId, previos = {}) {
  const existente = tareaId ? store.porId('tareas', tareaId) : null;
  const proyectos = store.proyectosVisibles();
  const proyectoPorDefecto = previos.proyectoId
    || (store.config('filtros').proyectoId || (proyectos[0] ? proyectos[0].id : null));

  const tarea = existente || {
    titulo: '', descripcion: '', proyectoId: proyectoPorDefecto,
    responsableId: null, estado: 'pendiente', prioridad: 'media',
    fechaInicio: hoyISO(), fechaCompromiso: null, esfuerzoEstimadoH: null,
    esfuerzoRealH: 0, cadencia: 'semanal', avance: 0, etiquetas: [],
    motivoBloqueo: '', ...previos,
  };

  const campos = {};
  const nuevo = !existente;

  const listaProyectos = lista(
    proyectos.map((p) => ({ id: p.id, etiqueta: p.nombre })),
    tarea.proyectoId,
  );
  const listaPersonas = lista(
    [{ id: '', etiqueta: 'Sin responsable' },
      ...store.estado.personas.map((p) => ({ id: p.id, etiqueta: p.nombre }))],
    tarea.responsableId || '',
  );
  const listaEstados = lista(opciones(ESTADOS_TAREA), tarea.estado);
  const listaPrioridad = lista(opciones(PRIORIDADES), tarea.prioridad);
  const listaCadencia = lista(opciones(CADENCIAS), tarea.cadencia);

  campos.titulo = entrada('text', tarea.titulo, { placeholder: 'Qué hay que hacer', maxlength: '160' });
  campos.descripcion = areaTexto(tarea.descripcion, { placeholder: 'Contexto, criterios de aceptación, enlaces…' });
  campos.fechaInicio = entrada('date', tarea.fechaInicio || '');
  campos.fechaCompromiso = entrada('date', tarea.fechaCompromiso || '');
  campos.esfuerzoEstimadoH = entrada('number', tarea.esfuerzoEstimadoH ?? '', { min: '0', step: '0.5' });
  campos.esfuerzoRealH = entrada('number', tarea.esfuerzoRealH ?? 0, { min: '0', step: '0.5' });
  campos.avance = entrada('number', tarea.avance ?? 0, { min: '0', max: '100', step: '5' });
  campos.etiquetas = entrada('text', (tarea.etiquetas || []).join(', '), { placeholder: 'infra, riesgo' });
  campos.motivoBloqueo = areaTexto(tarea.motivoBloqueo, { placeholder: 'Qué lo tiene detenido y de quién depende' });

  const bloqueoCampo = campo('Motivo del bloqueo', campos.motivoBloqueo);
  const refrescarBloqueo = () => bloqueoCampo.classList.toggle('oculto', listaEstados.value !== 'bloqueada');
  listaEstados.addEventListener('change', refrescarBloqueo);
  refrescarBloqueo();

  const historial = existente ? bloqueHistorial(existente) : null;

  const cuerpo = h('div', {},
    campo('Título', campos.titulo),
    campo('Descripción', campos.descripcion),
    h('div', { class: 'rejilla-campos' },
      campo('Proyecto', listaProyectos),
      campo('Responsable', listaPersonas),
      campo('Estado', listaEstados),
      campo('Prioridad', listaPrioridad),
      campo('Fecha de inicio', campos.fechaInicio),
      campo('Fecha de compromiso', campos.fechaCompromiso),
      campo('Esfuerzo estimado (horas)', campos.esfuerzoEstimadoH),
      campo('Esfuerzo real (horas)', campos.esfuerzoRealH),
      campo('Cadencia de seguimiento', listaCadencia, 'Define cada cuánto toca revisar el tema.'),
      campo('Avance (%)', campos.avance)),
    bloqueoCampo,
    campo('Etiquetas', campos.etiquetas, 'Separadas por coma.'),
    historial);

  const guardar = async () => {
    const titulo = campos.titulo.value.trim();
    if (!titulo) {
      tostada('La tarea necesita un título.', 'error');
      campos.titulo.focus();
      return;
    }
    if (!listaProyectos.value) {
      tostada('Primero crea un proyecto en Ajustes.', 'error');
      return;
    }
    const datos = {
      ...(existente || {}),
      titulo,
      descripcion: campos.descripcion.value.trim(),
      proyectoId: listaProyectos.value,
      responsableId: listaPersonas.value || null,
      prioridad: listaPrioridad.value,
      fechaInicio: campos.fechaInicio.value || null,
      fechaCompromiso: campos.fechaCompromiso.value || null,
      esfuerzoEstimadoH: campos.esfuerzoEstimadoH.value === '' ? null : Number(campos.esfuerzoEstimadoH.value),
      esfuerzoRealH: Number(campos.esfuerzoRealH.value) || 0,
      cadencia: listaCadencia.value,
      avance: Math.max(0, Math.min(100, Number(campos.avance.value) || 0)),
      etiquetas: campos.etiquetas.value.split(',').map((e) => e.trim()).filter(Boolean),
      motivoBloqueo: listaEstados.value === 'bloqueada' ? campos.motivoBloqueo.value.trim() : '',
    };

    if (nuevo) {
      const creada = await store.crearTarea({ ...datos, estado: 'pendiente' });
      if (listaEstados.value !== 'pendiente') await store.moverTarea(creada.id, listaEstados.value);
      tostada('Tarea creada', 'ok');
    } else {
      // Si cambió la cadencia y no había nada agendado, se agenda de nuevo.
      if (datos.cadencia !== existente.cadencia) {
        datos.proximoSeguimiento = primerSeguimiento(datos);
      }
      await store.guardar('tareas', datos);
      if (listaEstados.value !== existente.estado) await store.moverTarea(existente.id, listaEstados.value);
      tostada('Cambios guardados', 'ok');
    }
    control.cerrar();
  };

  const acciones = [];
  if (existente) {
    acciones.push(boton('Eliminar', {
      variante: 'peligro',
      onclick: async () => {
        const si = await confirmar('Eliminar tarea',
          `Se eliminará "${existente.titulo}" y su historial de seguimientos. No se puede deshacer.`,
          { textoSi: 'Eliminar', peligro: true });
        if (si) {
          await store.eliminar('tareas', existente.id);
          tostada('Tarea eliminada');
          control.cerrar();
        }
      },
    }));
    acciones.push(h('span', { class: 'separador' }));
    acciones.push(boton('Registrar seguimiento', {
      icono: 'reloj',
      onclick: () => { control.cerrar(); abrirSeguimiento(existente.id); },
    }));
  }
  acciones.push(boton(nuevo ? 'Crear tarea' : 'Guardar', { variante: 'primario', onclick: guardar }));

  const control = modal({
    titulo: nuevo ? 'Nueva tarea' : 'Ficha de la tarea',
    cuerpo,
    acciones,
    ancho: Boolean(existente),
  });
  return control;
}

function bloqueHistorial(tarea) {
  const seguimientos = store.seguimientosDeTarea(tarea.id);
  const contenido = seguimientos.length
    ? h('div', { class: 'lista-alertas' }, seguimientos.map((s) => {
      const autor = store.porId('personas', s.autorId);
      return h('div', { class: 'fila-alerta' },
        h('span', { class: `punto punto--${colorSemaforo(s.semaforo)}` }),
        h('div', { class: 'fila-alerta__texto' },
          h('div', { class: 'pequeno' }, s.comentario || 'Sin comentario'),
          h('div', { class: 'fila-alerta__sub' },
            `${formatear(s.fecha, { diaSemana: true })} · ${autor ? autor.nombre : 'sin autor'} · avance ${s.avance}%`
            + (s.horasImputadas ? ` · ${horasHumanas(s.horasImputadas)}` : ''))));
    }))
    : h('p', { class: 'tenue pequeno mb-0' }, 'Todavía no hay seguimientos registrados.');

  return h('details', { class: 'mt-16' },
    h('summary', { class: 'negrita pequeno', style: { cursor: 'pointer' } },
      `Historial de seguimientos (${seguimientos.length})`),
    h('div', { class: 'mt-8' },
      h('div', { class: 'pequeno tenue mb-8' },
        tarea.proximoSeguimiento
          ? `Próximo seguimiento: ${formatear(tarea.proximoSeguimiento, { diaSemana: true })} (${humano(tarea.proximoSeguimiento)})`
          : 'Esta tarea no tiene seguimiento agendado.'),
      contenido));
}

/* ------------------------------------------------------ registro rápido */

/** Modal corto para dejar el avance del día y reagendar la cadencia. */
export function abrirSeguimiento(tareaId) {
  const tarea = store.porId('tareas', tareaId);
  if (!tarea) return null;
  const proyecto = store.porId('proyectos', tarea.proyectoId);

  const avance = entrada('range', tarea.avance || 0, { min: '0', max: '100', step: '5' });
  const salidaAvance = h('output', { class: 'negrita' }, `${tarea.avance || 0}%`);
  avance.addEventListener('input', () => { salidaAvance.textContent = `${avance.value}%`; });

  const horas = entrada('number', '', { min: '0', step: '0.5', placeholder: '0' });
  const comentario = areaTexto('', { placeholder: '¿Cómo va? ¿Hay algo que lo esté frenando?' });
  const listaSemaforo = lista(
    SEMAFOROS.filter((s) => ['verde', 'ambar', 'rojo'].includes(s.id))
      .map((s) => ({ id: s.id, etiqueta: s.etiqueta })),
    semaforo(tarea) === 'rojo' ? 'rojo' : (semaforo(tarea) === 'ambar' ? 'ambar' : 'verde'),
  );
  const listaEstados = lista(opciones(ESTADOS_TAREA), tarea.estado);
  const nuevaFecha = entrada('date', tarea.fechaCompromiso || '');

  const cuerpo = h('div', {},
    h('p', { class: 'suave pequeno' },
      `${proyecto ? proyecto.nombre + ' · ' : ''}${tarea.titulo}`),
    campo(h('span', {}, 'Avance ', salidaAvance), avance),
    h('div', { class: 'rejilla-campos' },
      campo('Estado', listaEstados),
      campo('Cómo lo ves', listaSemaforo),
      campo('Horas dedicadas desde el último seguimiento', horas),
      campo('Fecha de compromiso', nuevaFecha, 'Cámbiala si el compromiso se movió.')),
    campo('Comentario', comentario),
    h('p', { class: 'campo__ayuda' },
      `Al guardar se agenda el próximo seguimiento según la cadencia ${etiquetaDe(CADENCIAS, tarea.cadencia).toLowerCase()}.`));

  const control = modal({
    titulo: 'Registrar seguimiento',
    cuerpo,
    acciones: [
      boton('Posponer a la próxima fecha', {
        onclick: async () => {
          await store.posponerSeguimiento(tarea.id);
          tostada('Seguimiento reagendado');
          control.cerrar();
        },
      }),
      boton('Guardar seguimiento', {
        variante: 'primario',
        onclick: async () => {
          await store.registrarSeguimiento(tarea.id, {
            avance: Number(avance.value),
            horasImputadas: Number(horas.value) || 0,
            comentario: comentario.value.trim(),
            semaforo: listaSemaforo.value,
            nuevoEstado: listaEstados.value,
            nuevaFechaCompromiso: nuevaFecha.value || null,
          });
          tostada('Seguimiento registrado', 'ok');
          control.cerrar();
        },
      }),
    ],
  });
  return control;
}

/** Botón compacto de "registrar seguimiento" para las filas de listado. */
export function botonSeguimiento(tareaId) {
  return boton('', {
    icono: 'reloj', sm: true, variante: 'plano', titulo: 'Registrar seguimiento',
    onclick: (e) => { e.stopPropagation(); abrirSeguimiento(tareaId); },
  });
}

export { icono, vaciar };
