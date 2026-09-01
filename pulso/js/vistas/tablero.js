/* Tablero tipo Trello, con columnas por estado y carriles opcionales por
 * proyecto, equipo o responsable. Arrastrar una tarjeta cambia su estado; si
 * además se suelta en otro carril, cambia también su proyecto o su
 * responsable, según cómo esté agrupado el tablero. */

import { h, boton, pastilla, segmentado, tostada } from '../ui/componentes.js';
import { tarjetaTarea, abrirTarea } from '../ui/tarea.js';
import { barraFiltros, aplicar, avisoFiltro } from '../ui/filtros.js';
import * as store from '../store/store.js';
import { ESTADOS_TAREA } from '../store/schema.js';
import { estaAtrasada } from '../domain/alertas.js';
import { repintar } from '../router.js';

const AGRUPACIONES = [
  { id: 'ninguna', etiqueta: 'Sin carriles' },
  { id: 'proyecto', etiqueta: 'Por proyecto' },
  { id: 'equipo', etiqueta: 'Por equipo' },
  { id: 'responsable', etiqueta: 'Por responsable' },
];

export const vista = {
  id: 'tablero',
  titulo: 'Tablero',
  subtitulo: () => 'Arrastra las tarjetas para cambiar su estado',
  acciones: () => [
    boton('Nueva tarea', { icono: 'mas', variante: 'primario', onclick: () => abrirTarea(null) }),
  ],
  pintar,
};

function pintar(contenedor) {
  const agrupacion = store.config('agrupacion') || 'proyecto';
  const todas = store.tareasDeIniciativa();
  const tareas = aplicar(todas);

  contenedor.appendChild(barraFiltros({
    extra: [
      avisoFiltro(tareas.length, todas.length),
      segmentado(AGRUPACIONES, agrupacion, (id) => {
        store.fijarConfig({ agrupacion: id });
        repintar();
      }),
    ].filter(Boolean),
    alCambiar: repintar,
  }));

  if (!store.proyectosVisibles().length) {
    contenedor.appendChild(h('div', { class: 'vacio' },
      h('strong', {}, 'Todavía no hay proyectos'),
      'Crea el primero en Ajustes y después agrega sus tareas.'));
    return;
  }

  const tableros = [];
  for (const carril of construirCarriles(agrupacion, tareas)) {
    if (agrupacion !== 'ninguna') {
      contenedor.appendChild(h('div', { class: 'carril__cab' },
        carril.color ? h('span', { class: 'punto', style: { background: carril.color } }) : null,
        h('span', {}, carril.etiqueta),
        pastilla(`${carril.tareas.length}`, '', { linea: true }),
        carril.atrasadas ? pastilla(`${carril.atrasadas} atrasadas`, 'rojo') : null));
    }
    const tablero = construirTablero(carril, agrupacion);
    tableros.push(tablero);
    contenedor.appendChild(tablero);
  }
  sincronizarDesplazamiento(tableros);
}

/** Los carriles se desplazan juntos: las columnas quedan siempre alineadas. */
function sincronizarDesplazamiento(tableros) {
  if (tableros.length < 2) return;
  let enCurso = false;
  for (const tablero of tableros) {
    tablero.addEventListener('scroll', () => {
      if (enCurso) return;
      enCurso = true;
      for (const otro of tableros) {
        if (otro !== tablero) otro.scrollLeft = tablero.scrollLeft;
      }
      requestAnimationFrame(() => { enCurso = false; });
    });
  }
}

/** Arma los carriles según la agrupación elegida. */
function construirCarriles(agrupacion, tareas) {
  if (agrupacion === 'ninguna') {
    return [{ clave: null, etiqueta: 'Todas', tareas, atrasadas: contarAtrasadas(tareas) }];
  }

  let grupos = [];
  if (agrupacion === 'proyecto') {
    grupos = store.proyectosVisibles().map((p) => ({
      clave: p.id,
      etiqueta: p.nombre,
      color: (store.porId('equipos', p.equipoId) || {}).color,
      tareas: tareas.filter((t) => t.proyectoId === p.id),
    }));
  } else if (agrupacion === 'equipo') {
    grupos = store.estado.equipos.map((e) => {
      const idsProyecto = new Set(store.proyectosVisibles().filter((p) => p.equipoId === e.id).map((p) => p.id));
      return {
        clave: e.id,
        etiqueta: e.nombre,
        color: e.color,
        tareas: tareas.filter((t) => idsProyecto.has(t.proyectoId)),
      };
    });
  } else {
    grupos = store.estado.personas.map((p) => ({
      clave: p.id,
      etiqueta: p.nombre,
      color: p.color,
      tareas: tareas.filter((t) => t.responsableId === p.id),
    }));
    grupos.push({
      clave: '',
      etiqueta: 'Sin responsable',
      tareas: tareas.filter((t) => !t.responsableId),
    });
  }

  return grupos
    .filter((g) => g.tareas.length || agrupacion === 'proyecto')
    .map((g) => ({ ...g, atrasadas: contarAtrasadas(g.tareas) }));
}

function contarAtrasadas(tareas) {
  return tareas.filter((t) => estaAtrasada(t)).length;
}

function construirTablero(carril, agrupacion) {
  const tablero = h('div', { class: 'tablero' });

  for (const estado of ESTADOS_TAREA) {
    const deColumna = carril.tareas
      .filter((t) => t.estado === estado.id)
      .sort((a, b) => (a.orden || 0) - (b.orden || 0));

    const listaColumna = h('div', { class: 'columna__lista' },
      deColumna.map((t) => tarjetaTarea(t, { mostrarProyecto: agrupacion !== 'proyecto' })));

    const columna = h('section', {
      class: 'columna',
      'aria-label': `${estado.etiqueta} — ${deColumna.length} ${deColumna.length === 1 ? 'tarea' : 'tareas'}`,
    },
    h('header', { class: 'columna__cab' },
      h('span', { class: `punto punto--${estado.color === 'azul' ? 'gris' : estado.color}` }),
      h('span', { class: 'crecer' }, estado.etiqueta),
      h('span', { class: 'cuenta' }, String(deColumna.length)),
      boton('', {
        icono: 'mas', sm: true, variante: 'plano', titulo: `Nueva tarea en ${estado.etiqueta}`,
        onclick: () => abrirTarea(null, valoresDelCarril(carril, agrupacion, estado.id)),
      })),
    listaColumna);

    conectarSoltar(columna, listaColumna, estado.id, carril, agrupacion);
    tablero.appendChild(columna);
  }

  return tablero;
}

/** Valores heredados al crear una tarea desde una columna concreta. */
function valoresDelCarril(carril, agrupacion, estado) {
  const previos = { estado };
  if (agrupacion === 'proyecto' && carril.clave) previos.proyectoId = carril.clave;
  if (agrupacion === 'responsable' && carril.clave) previos.responsableId = carril.clave;
  if (agrupacion === 'equipo' && carril.clave) {
    const primero = store.proyectosVisibles().find((p) => p.equipoId === carril.clave);
    if (primero) previos.proyectoId = primero.id;
  }
  return previos;
}

/** Deja la columna lista para recibir tarjetas arrastradas. */
function conectarSoltar(columna, listaColumna, estado, carril, agrupacion) {
  columna.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    columna.classList.add('recibiendo');
  });
  columna.addEventListener('dragleave', (e) => {
    if (!columna.contains(e.relatedTarget)) columna.classList.remove('recibiendo');
  });
  columna.addEventListener('drop', async (e) => {
    e.preventDefault();
    columna.classList.remove('recibiendo');
    const id = e.dataTransfer.getData('text/plain');
    const tarea = store.porId('tareas', id);
    if (!tarea) return;

    const cambios = {};
    if (agrupacion === 'proyecto' && carril.clave && tarea.proyectoId !== carril.clave) {
      cambios.proyectoId = carril.clave;
    }
    if (agrupacion === 'responsable' && tarea.responsableId !== (carril.clave || null)) {
      cambios.responsableId = carril.clave || null;
    }
    if (Object.keys(cambios).length) await store.actualizar('tareas', id, cambios);

    await store.moverTarea(id, estado, ordenAlSoltar(listaColumna, e.clientY));

    if (cambios.proyectoId) tostada(`Movida a ${store.nombreDe('proyectos', cambios.proyectoId)}`);
    else if ('responsableId' in cambios) {
      tostada(cambios.responsableId
        ? `Asignada a ${store.nombreDe('personas', cambios.responsableId)}`
        : 'Sin responsable');
    }
  });
}

/**
 * Calcula el nuevo valor de orden a partir de dónde se soltó la tarjeta:
 * el punto medio entre la tarjeta de arriba y la de abajo.
 */
function ordenAlSoltar(listaColumna, y) {
  const tarjetas = [...listaColumna.querySelectorAll('.tarea')]
    .map((el) => ({ el, tarea: store.porId('tareas', el.dataset.tarea) }))
    .filter((x) => x.tarea);
  if (!tarjetas.length) return Date.now();

  let anterior = null;
  let siguiente = null;
  for (const item of tarjetas) {
    const caja = item.el.getBoundingClientRect();
    if (y > caja.top + caja.height / 2) anterior = item.tarea;
    else { siguiente = item.tarea; break; }
  }
  const a = anterior ? (anterior.orden || 0) : null;
  const b = siguiente ? (siguiente.orden || 0) : null;
  if (a === null && b === null) return Date.now();
  if (a === null) return b - 100;
  if (b === null) return a + 100;
  return (a + b) / 2;
}
