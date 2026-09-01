/* Estado de la aplicación en memoria.
 * Es la única puerta de entrada para leer y escribir datos: las vistas nunca
 * hablan con IndexedDB directamente. Cada mutación persiste y avisa a quien
 * esté suscrito para que se vuelva a pintar. */

import * as db from './db.js';
import { TIPOS, PLANTILLAS, normalizar, nuevoId } from './schema.js';
import { hoyISO } from '../domain/fechas.js';
import { primerSeguimiento, reprogramar } from '../domain/cadencia.js';

export const estado = {
  equipos: [], personas: [], iniciativas: [], proyectos: [],
  tareas: [], seguimientos: [], aprendizajes: [],
  config: db.leerConfig(),
  listo: false,
};

const suscriptores = new Set();

/** Se registra una función que se llamará tras cada cambio. Devuelve la baja. */
export function suscribir(fn) {
  suscriptores.add(fn);
  return () => suscriptores.delete(fn);
}

function emitir() {
  for (const fn of suscriptores) {
    try { fn(estado); } catch (e) { console.error('Error al repintar', e); }
  }
}

/** Carga todo desde el navegador. Se llama una vez al arrancar. */
export async function inicializar() {
  const datos = await db.leerBase();
  for (const tipo of TIPOS) estado[tipo] = datos[tipo] || [];
  estado.config = db.leerConfig();
  if (!estado.config.iniciativaActiva && estado.iniciativas.length) {
    estado.config.iniciativaActiva = estado.iniciativas[0].id;
    db.guardarConfig(estado.config);
  }
  estado.listo = true;
  emitir();
  return estado;
}

/* --------------------------------------------------------- configuración */

export function config(clave) {
  return clave ? estado.config[clave] : estado.config;
}

export function fijarConfig(parcial) {
  estado.config = { ...estado.config, ...parcial };
  db.guardarConfig(estado.config);
  emitir();
}

export function fijarFiltro(parcial) {
  fijarConfig({ filtros: { ...estado.config.filtros, ...parcial } });
}

/* ----------------------------------------------------------------- CRUD */

/** Crea o actualiza. Devuelve el objeto guardado ya normalizado. */
export async function guardar(tipo, objeto, { silencioso = false } = {}) {
  const completo = normalizar(tipo, objeto);
  const lista = estado[tipo];
  const i = lista.findIndex((x) => x.id === completo.id);
  if (i >= 0) lista[i] = completo; else lista.push(completo);
  await db.guardar(tipo, completo);
  if (!silencioso) emitir();
  return completo;
}

export async function guardarVarios(tipo, objetos) {
  const completos = objetos.map((o) => normalizar(tipo, o));
  for (const c of completos) {
    const i = estado[tipo].findIndex((x) => x.id === c.id);
    if (i >= 0) estado[tipo][i] = c; else estado[tipo].push(c);
  }
  await db.guardarVarios(tipo, completos);
  emitir();
  return completos;
}

/** Actualiza solo algunos campos de un registro existente. */
export async function actualizar(tipo, id, parcial) {
  const actual = porId(tipo, id);
  if (!actual) return null;
  return guardar(tipo, { ...actual, ...parcial });
}

/** Elimina en cascada: un proyecto se lleva sus tareas, y una tarea sus seguimientos. */
export async function eliminar(tipo, id) {
  if (tipo === 'iniciativas') {
    for (const p of estado.proyectos.filter((p) => p.iniciativaId === id)) await eliminar('proyectos', p.id);
  }
  if (tipo === 'proyectos') {
    for (const t of estado.tareas.filter((t) => t.proyectoId === id)) await eliminar('tareas', t.id);
  }
  if (tipo === 'tareas') {
    for (const s of estado.seguimientos.filter((s) => s.tareaId === id)) {
      estado.seguimientos = estado.seguimientos.filter((x) => x.id !== s.id);
      await db.borrar('seguimientos', s.id);
    }
  }
  estado[tipo] = estado[tipo].filter((x) => x.id !== id);
  await db.borrar(tipo, id);
  emitir();
}

/* ------------------------------------------------------------ selectores */

export function porId(tipo, id) {
  if (!id) return null;
  return estado[tipo].find((x) => x.id === id) || null;
}

export function nombreDe(tipo, id, porDefecto = '—') {
  const x = porId(tipo, id);
  return x ? (x.nombre || x.titulo || porDefecto) : porDefecto;
}

export function iniciativaActiva() {
  return porId('iniciativas', estado.config.iniciativaActiva) || estado.iniciativas[0] || null;
}

/** Proyectos de la iniciativa activa (o todos si no hay ninguna seleccionada). */
export function proyectosVisibles() {
  const ini = iniciativaActiva();
  if (!ini) return estado.proyectos;
  return estado.proyectos.filter((p) => p.iniciativaId === ini.id);
}

/** Todas las tareas de la iniciativa activa, sin aplicar los filtros de pantalla. */
export function tareasDeIniciativa() {
  const ids = new Set(proyectosVisibles().map((p) => p.id));
  return estado.tareas.filter((t) => ids.has(t.proyectoId));
}

export function tareasDeProyecto(proyectoId) {
  return estado.tareas.filter((t) => t.proyectoId === proyectoId);
}

export function seguimientosDeTarea(tareaId) {
  return estado.seguimientos
    .filter((s) => s.tareaId === tareaId)
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
}

export function personasDeEquipo(equipoId) {
  return estado.personas.filter((p) => (p.equipoIds || []).includes(equipoId));
}

export function equipoDeTarea(tarea) {
  const proyecto = porId('proyectos', tarea.proyectoId);
  return proyecto ? porId('equipos', proyecto.equipoId) : null;
}

/** Aplica los filtros de la barra superior a una lista de tareas. */
export function filtrar(tareas, filtros = estado.config.filtros) {
  const texto = (filtros.texto || '').trim().toLowerCase();
  return tareas.filter((t) => {
    if (filtros.proyectoId && t.proyectoId !== filtros.proyectoId) return false;
    if (filtros.responsableId && t.responsableId !== filtros.responsableId) return false;
    if (filtros.equipoId) {
      const proyecto = porId('proyectos', t.proyectoId);
      if (!proyecto || proyecto.equipoId !== filtros.equipoId) return false;
    }
    if (texto) {
      const heno = `${t.titulo} ${t.descripcion} ${(t.etiquetas || []).join(' ')}`.toLowerCase();
      if (!heno.includes(texto)) return false;
    }
    return true;
  });
}

/* --------------------------------------------------- acciones de negocio */

/** Crea una tarea dejando ya agendado su primer seguimiento. */
export async function crearTarea(campos) {
  const base = { ...PLANTILLAS.tareas(), ...campos };
  if (!base.proximoSeguimiento) base.proximoSeguimiento = primerSeguimiento(base);
  base.orden = campos.orden ?? Date.now();
  return guardar('tareas', base);
}

/**
 * Mueve una tarea de columna. Al cerrarla deja la fecha real de cierre y el
 * avance en 100; al reabrirla las limpia para que el semáforo vuelva a mandar.
 */
export async function moverTarea(tareaId, nuevoEstado, orden) {
  const tarea = porId('tareas', tareaId);
  if (!tarea) return null;
  const cambios = { estado: nuevoEstado };
  if (orden !== undefined) cambios.orden = orden;
  if (nuevoEstado === 'hecha' && tarea.estado !== 'hecha') {
    cambios.fechaCierreReal = hoyISO();
    cambios.avance = 100;
    cambios.proximoSeguimiento = null;
  }
  if (nuevoEstado !== 'hecha' && tarea.estado === 'hecha') {
    cambios.fechaCierreReal = null;
    if (tarea.avance >= 100) cambios.avance = 60;
    cambios.proximoSeguimiento = primerSeguimiento({ ...tarea, ...cambios });
  }
  return actualizar('tareas', tareaId, cambios);
}

/**
 * Registra un seguimiento: guarda la bitácora, actualiza la tarea con el
 * avance y las horas, y agenda el próximo según la cadencia.
 */
export async function registrarSeguimiento(tareaId, datos) {
  const tarea = porId('tareas', tareaId);
  if (!tarea) return null;
  const fecha = datos.fecha || hoyISO();

  await guardar('seguimientos', {
    ...PLANTILLAS.seguimientos(),
    id: nuevoId('sg'),
    tareaId,
    fecha,
    autorId: datos.autorId || tarea.responsableId || null,
    avance: Number(datos.avance) || 0,
    semaforo: datos.semaforo || 'verde',
    comentario: datos.comentario || '',
    horasImputadas: Number(datos.horasImputadas) || 0,
  }, { silencioso: true });

  const cambios = {
    ...reprogramar(tarea, fecha),
    avance: Number(datos.avance) || tarea.avance,
    esfuerzoRealH: Math.round(((Number(tarea.esfuerzoRealH) || 0) + (Number(datos.horasImputadas) || 0)) * 10) / 10,
  };
  if (datos.nuevoEstado && datos.nuevoEstado !== tarea.estado) {
    await moverTarea(tareaId, datos.nuevoEstado);
  }
  if (datos.nuevaFechaCompromiso) cambios.fechaCompromiso = datos.nuevaFechaCompromiso;
  return actualizar('tareas', tareaId, cambios);
}

/** Reagenda el seguimiento de una tarea desde hoy, sin registrar avance. */
export async function posponerSeguimiento(tareaId) {
  const tarea = porId('tareas', tareaId);
  if (!tarea) return null;
  return actualizar('tareas', tareaId, {
    proximoSeguimiento: reprogramar(tarea, hoyISO()).proximoSeguimiento,
  });
}

/* -------------------------------------------------------------- respaldo */

/** Reemplaza toda la base con los datos de un respaldo ya validado. */
export async function reemplazarBase(datos) {
  await db.reemplazarTodo(datos);
  for (const tipo of TIPOS) estado[tipo] = (datos[tipo] || []).map((o) => normalizar(tipo, o));
  if (!estado.iniciativas.find((i) => i.id === estado.config.iniciativaActiva)) {
    fijarConfig({ iniciativaActiva: estado.iniciativas[0] ? estado.iniciativas[0].id : null });
  }
  emitir();
}

export async function vaciarBase() {
  await db.limpiarTodo();
  for (const tipo of TIPOS) estado[tipo] = [];
  fijarConfig({ iniciativaActiva: null, semillaCargada: false });
  emitir();
}

export { db };
