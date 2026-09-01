/* Barra de filtros compartida por el tablero, el portafolio y los listados.
 * Los filtros viven en la configuración, así que se conservan al cambiar de
 * pantalla y entre sesiones. */

import { h, boton, lista, pastilla } from './componentes.js';
import * as store from '../store/store.js';

/**
 * @param {{ mostrar?: string[], extra?: Node[], alCambiar?: Function }} opciones
 *        mostrar: cuáles controles pintar. Por defecto todos.
 */
export function barraFiltros(opciones = {}) {
  const {
    mostrar = ['texto', 'equipo', 'proyecto', 'responsable'],
    extra = [],
    alCambiar = () => {},
  } = opciones;

  const filtros = store.config('filtros');
  const proyectos = store.proyectosVisibles();
  const equipos = store.estado.equipos;

  const cambiar = (parcial) => {
    store.fijarFiltro(parcial);
    alCambiar();
  };

  const controles = [];

  if (mostrar.includes('texto')) {
    const buscador = h('input', {
      type: 'search',
      placeholder: 'Buscar tarea…',
      valor: filtros.texto || '',
      'aria-label': 'Buscar tarea por texto',
      style: { minWidth: '190px' },
    });
    let temporizador;
    buscador.addEventListener('input', () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => cambiar({ texto: buscador.value }), 220);
    });
    controles.push(buscador);
  }

  if (mostrar.includes('equipo')) {
    controles.push(lista(
      [{ id: '', etiqueta: 'Todos los equipos' },
        ...equipos.map((e) => ({ id: e.id, etiqueta: e.nombre }))],
      filtros.equipoId,
      {
        'aria-label': 'Filtrar por equipo',
        onchange: (e) => cambiar({ equipoId: e.target.value, proyectoId: '' }),
      },
    ));
  }

  if (mostrar.includes('proyecto')) {
    const visibles = filtros.equipoId
      ? proyectos.filter((p) => p.equipoId === filtros.equipoId)
      : proyectos;
    controles.push(lista(
      [{ id: '', etiqueta: 'Todos los proyectos' },
        ...visibles.map((p) => ({ id: p.id, etiqueta: p.nombre }))],
      filtros.proyectoId,
      {
        'aria-label': 'Filtrar por proyecto',
        onchange: (e) => cambiar({ proyectoId: e.target.value }),
      },
    ));
  }

  if (mostrar.includes('responsable')) {
    controles.push(lista(
      [{ id: '', etiqueta: 'Todos los responsables' },
        ...store.estado.personas.map((p) => ({ id: p.id, etiqueta: p.nombre })),
        { id: '__sin__', etiqueta: 'Sin responsable' }],
      filtros.responsableId,
      {
        'aria-label': 'Filtrar por responsable',
        onchange: (e) => cambiar({ responsableId: e.target.value }),
      },
    ));
  }

  const hayFiltros = Boolean(filtros.texto || filtros.equipoId || filtros.proyectoId || filtros.responsableId);
  if (hayFiltros) {
    controles.push(boton('Limpiar', {
      icono: 'cerrar', sm: true, variante: 'plano',
      onclick: () => cambiar({ texto: '', equipoId: '', proyectoId: '', responsableId: '' }),
    }));
  }

  return h('div', { class: 'barra-filtros no-imprimir' },
    controles,
    extra.length ? h('span', { class: 'separador' }) : null,
    extra);
}

/**
 * Aplica los filtros de la barra. Contempla el valor especial "sin responsable".
 */
export function aplicar(tareas) {
  const filtros = store.config('filtros');
  if (filtros.responsableId === '__sin__') {
    return store.filtrar(tareas, { ...filtros, responsableId: '' })
      .filter((t) => !t.responsableId);
  }
  return store.filtrar(tareas);
}

/** Resumen de los filtros activos, para mostrarlo en el informe impreso. */
export function descripcionFiltros() {
  const filtros = store.config('filtros');
  const partes = [];
  if (filtros.equipoId) partes.push(`equipo ${store.nombreDe('equipos', filtros.equipoId)}`);
  if (filtros.proyectoId) partes.push(`proyecto ${store.nombreDe('proyectos', filtros.proyectoId)}`);
  if (filtros.responsableId === '__sin__') partes.push('sin responsable');
  else if (filtros.responsableId) partes.push(`responsable ${store.nombreDe('personas', filtros.responsableId)}`);
  if (filtros.texto) partes.push(`texto "${filtros.texto}"`);
  return partes.length ? partes.join(' · ') : null;
}

/** Pastilla que avisa cuántas tareas quedaron fuera por los filtros. */
export function avisoFiltro(totalVisible, totalGeneral) {
  if (totalVisible === totalGeneral) return null;
  return pastilla(`${totalVisible} de ${totalGeneral} tareas`, 'acento');
}
