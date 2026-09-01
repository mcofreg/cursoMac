/* Aprendizajes: la bitácora de feedback de la iniciativa. Lo que salió bien,
 * lo que hay que mejorar, los riesgos y las lecciones, cada uno con su acción
 * acordada, su responsable y el estado de esa acción. Es lo que convierte un
 * atraso en algo de lo que se aprende y no solo en un número rojo. */

import {
  h, boton, pastilla, avatar, campo, entrada, areaTexto, lista, modal,
  confirmar, tostada, segmentado, copiar,
} from '../ui/componentes.js';
import * as store from '../store/store.js';
import {
  TIPOS_APRENDIZAJE, ESTADOS_ACCION, PLANTILLAS, etiquetaDe, colorDe,
} from '../store/schema.js';
import { formatear, hoyISO } from '../domain/fechas.js';
import { repintar } from '../router.js';

let filtroTipo = 'todos';

export const vista = {
  id: 'aprendizajes',
  titulo: 'Aprendizajes',
  subtitulo: () => 'Qué aprendimos, qué hay que mejorar y qué acordamos hacer',
  acciones: () => [
    boton('Copiar resumen', { icono: 'copiar', onclick: copiarResumen }),
    boton('Nuevo registro', { icono: 'mas', variante: 'primario', onclick: () => abrirAprendizaje(null) }),
  ],
  pintar,
};

function pintar(contenedor) {
  const registros = deLaIniciativa();
  const accionesAbiertas = registros.filter((a) => ['pendiente', 'en_curso'].includes(a.estadoAccion));
  const riesgos = registros.filter((a) => a.tipo === 'riesgo');

  contenedor.appendChild(h('div', { class: 'rejilla rejilla--4 mb-16' },
    kpi('Registros', registros.length, 'en esta iniciativa', 'azul'),
    kpi('Riesgos', riesgos.length, 'identificados', riesgos.length ? 'ambar' : 'verde'),
    kpi('Acciones abiertas', accionesAbiertas.length, 'acordadas y sin cerrar',
      accionesAbiertas.length ? 'rojo' : 'verde'),
    kpi('A mejorar', registros.filter((a) => a.tipo === 'mejorar').length,
      'puntos de mejora detectados', 'ambar')));

  contenedor.appendChild(h('div', { class: 'barra-filtros no-imprimir' },
    segmentado(
      [{ id: 'todos', etiqueta: 'Todos' },
        ...TIPOS_APRENDIZAJE.map((t) => ({ id: t.id, etiqueta: t.etiqueta }))],
      filtroTipo,
      (id) => { filtroTipo = id; repintar(); },
    )));

  const visibles = registros
    .filter((a) => filtroTipo === 'todos' || a.tipo === filtroTipo)
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  if (!visibles.length) {
    contenedor.appendChild(h('div', { class: 'vacio' },
      h('strong', {}, 'Sin registros todavía'),
      'Después de cada hito o cada atraso, deja aquí lo que se aprendió y qué se acordó hacer.'));
    return;
  }

  contenedor.appendChild(h('div', { class: 'rejilla rejilla--2' },
    visibles.map(tarjeta)));
}

function kpi(etiqueta, valor, detalle, color) {
  return h('div', { class: `kpi kpi--${color}` },
    h('div', { class: 'kpi__etiqueta' }, etiqueta),
    h('div', { class: 'kpi__valor' }, String(valor)),
    h('div', { class: 'kpi__detalle' }, detalle));
}

/** Registros de la iniciativa activa: los suyos y los de sus proyectos y tareas. */
function deLaIniciativa() {
  const iniciativa = store.iniciativaActiva();
  if (!iniciativa) return store.estado.aprendizajes;
  const idsProyecto = new Set(store.proyectosVisibles().map((p) => p.id));
  const idsTarea = new Set(store.tareasDeIniciativa().map((t) => t.id));
  return store.estado.aprendizajes.filter((a) => {
    if (a.ambito === 'iniciativa') return a.refId === iniciativa.id;
    if (a.ambito === 'proyecto') return idsProyecto.has(a.refId);
    if (a.ambito === 'tarea') return idsTarea.has(a.refId);
    return true;
  });
}

function tarjeta(registro) {
  const autor = store.porId('personas', registro.autorId);
  const responsable = store.porId('personas', registro.responsableAccionId);
  return h('article', { class: 'tarjeta' },
    h('div', { class: 'tarjeta__cab' },
      pastilla(etiquetaDe(TIPOS_APRENDIZAJE, registro.tipo), colorDe(TIPOS_APRENDIZAJE, registro.tipo), { punto: true }),
      h('span', { class: 'crecer mini tenue truncar' }, nombreDelAmbito(registro)),
      h('span', { class: 'mini tenue' }, formatear(registro.fecha)),
      boton('', {
        icono: 'lapiz', sm: true, variante: 'plano', titulo: 'Editar',
        onclick: () => abrirAprendizaje(registro.id),
      })),
    h('div', { class: 'tarjeta__cuerpo' },
      h('p', {}, registro.texto),
      registro.accionAcordada
        ? h('div', { class: 'mt-8', style: { borderTop: '1px solid var(--borde)', paddingTop: '10px' } },
          h('div', { class: 'mini tenue' }, 'Acción acordada'),
          h('p', { class: 'pequeno mb-8' }, registro.accionAcordada),
          h('div', { class: 'fila envolver' },
            pastilla(etiquetaDe(ESTADOS_ACCION, registro.estadoAccion),
              colorDe(ESTADOS_ACCION, registro.estadoAccion), { punto: true }),
            responsable ? h('span', { class: 'fila mini' }, avatar(responsable, 'sm'), responsable.nombre) : null))
        : null,
      h('div', { class: 'mini tenue mt-8' },
        autor ? `Registrado por ${autor.nombre}` : 'Sin autor')));
}

function nombreDelAmbito(registro) {
  if (registro.ambito === 'iniciativa') return store.nombreDe('iniciativas', registro.refId, 'Iniciativa');
  if (registro.ambito === 'proyecto') return store.nombreDe('proyectos', registro.refId, 'Proyecto');
  const tarea = store.porId('tareas', registro.refId);
  return tarea ? tarea.titulo : 'Tarea';
}

/* ---------------------------------------------------------------- ficha */

export function abrirAprendizaje(registroId, previos = {}) {
  const existente = registroId ? store.porId('aprendizajes', registroId) : null;
  const iniciativa = store.iniciativaActiva();
  const registro = existente || {
    ...PLANTILLAS.aprendizajes(),
    fecha: hoyISO(),
    ambito: 'proyecto',
    refId: (store.proyectosVisibles()[0] || {}).id || (iniciativa || {}).id || null,
    ...previos,
  };

  const listaTipos = lista(TIPOS_APRENDIZAJE.map((t) => ({ id: t.id, etiqueta: t.etiqueta })), registro.tipo);
  const listaAmbitos = lista([
    { id: 'iniciativa', etiqueta: 'Toda la iniciativa' },
    { id: 'proyecto', etiqueta: 'Un proyecto' },
    { id: 'tarea', etiqueta: 'Una tarea' },
  ], registro.ambito);
  const listaRef = lista([], registro.refId);
  const fecha = entrada('date', registro.fecha || hoyISO());
  const texto = areaTexto(registro.texto, { placeholder: 'Qué pasó y qué aprendimos de eso' });
  const accion = areaTexto(registro.accionAcordada, { placeholder: 'Qué vamos a hacer distinto a partir de ahora' });
  const listaAutores = lista(
    [{ id: '', etiqueta: 'Sin autor' },
      ...store.estado.personas.map((p) => ({ id: p.id, etiqueta: p.nombre }))],
    registro.autorId || '');
  const listaResponsables = lista(
    [{ id: '', etiqueta: 'Sin responsable' },
      ...store.estado.personas.map((p) => ({ id: p.id, etiqueta: p.nombre }))],
    registro.responsableAccionId || '');
  const listaEstadoAccion = lista(
    ESTADOS_ACCION.map((e) => ({ id: e.id, etiqueta: e.etiqueta })), registro.estadoAccion);

  /** Rellena el segundo desplegable según el ámbito elegido. */
  const refrescarRef = (seleccion) => {
    const opciones = listaAmbitos.value === 'iniciativa'
      ? store.estado.iniciativas.map((i) => ({ id: i.id, etiqueta: i.nombre }))
      : listaAmbitos.value === 'proyecto'
        ? store.proyectosVisibles().map((p) => ({ id: p.id, etiqueta: p.nombre }))
        : store.tareasDeIniciativa().map((t) => ({ id: t.id, etiqueta: t.titulo }));
    listaRef.innerHTML = '';
    for (const o of opciones) {
      const op = document.createElement('option');
      op.value = o.id;
      op.textContent = o.etiqueta;
      if (o.id === seleccion) op.selected = true;
      listaRef.appendChild(op);
    }
  };
  listaAmbitos.addEventListener('change', () => refrescarRef(null));
  refrescarRef(registro.refId);

  const acciones = [];
  if (existente) {
    acciones.push(boton('Eliminar', {
      variante: 'peligro',
      onclick: async () => {
        const si = await confirmar('Eliminar registro',
          'Se eliminará este aprendizaje de la bitácora.', { textoSi: 'Eliminar', peligro: true });
        if (si) {
          await store.eliminar('aprendizajes', existente.id);
          tostada('Registro eliminado');
          control.cerrar();
        }
      },
    }));
    acciones.push(h('span', { class: 'separador' }));
  }
  acciones.push(boton(existente ? 'Guardar' : 'Registrar', {
    variante: 'primario',
    onclick: async () => {
      if (!texto.value.trim()) {
        tostada('Escribe qué se aprendió.', 'error');
        return;
      }
      await store.guardar('aprendizajes', {
        ...registro,
        tipo: listaTipos.value,
        ambito: listaAmbitos.value,
        refId: listaRef.value || null,
        fecha: fecha.value || hoyISO(),
        texto: texto.value.trim(),
        autorId: listaAutores.value || null,
        accionAcordada: accion.value.trim(),
        responsableAccionId: listaResponsables.value || null,
        estadoAccion: accion.value.trim() ? listaEstadoAccion.value : 'sin_accion',
      });
      tostada(existente ? 'Registro actualizado' : 'Aprendizaje registrado', 'ok');
      control.cerrar();
    },
  }));

  const control = modal({
    titulo: existente ? 'Editar aprendizaje' : 'Nuevo aprendizaje',
    cuerpo: h('div', {},
      h('div', { class: 'rejilla-campos' },
        campo('Tipo', listaTipos),
        campo('Fecha', fecha),
        campo('Se refiere a', listaAmbitos),
        campo('Cuál', listaRef)),
      campo('Qué aprendimos', texto),
      campo('Autor', listaAutores),
      campo('Acción acordada', accion, 'Opcional. Si la dejas vacía no se hace seguimiento de una acción.'),
      h('div', { class: 'rejilla-campos' },
        campo('Responsable de la acción', listaResponsables),
        campo('Estado de la acción', listaEstadoAccion))),
    acciones,
  });
  return control;
}

/** Texto plano de la bitácora, listo para pegar en un correo. */
function copiarResumen() {
  const registros = deLaIniciativa().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  if (!registros.length) {
    tostada('No hay registros que copiar.', 'error');
    return;
  }
  const iniciativa = store.iniciativaActiva();
  const lineas = [`Aprendizajes — ${iniciativa ? iniciativa.nombre : 'iniciativa'} (${formatear(hoyISO(), { anio: true })})`, ''];
  for (const tipo of TIPOS_APRENDIZAJE) {
    const suyos = registros.filter((r) => r.tipo === tipo.id);
    if (!suyos.length) continue;
    lineas.push(`${tipo.etiqueta.toUpperCase()}`);
    for (const r of suyos) {
      lineas.push(`- [${formatear(r.fecha)}] ${nombreDelAmbito(r)}: ${r.texto}`);
      if (r.accionAcordada) {
        lineas.push(`  Acción: ${r.accionAcordada} (${etiquetaDe(ESTADOS_ACCION, r.estadoAccion)}`
          + `${r.responsableAccionId ? `, ${store.nombreDe('personas', r.responsableAccionId)}` : ''})`);
      }
    }
    lineas.push('');
  }
  copiar(lineas.join('\n'), 'Resumen de aprendizajes copiado');
}
