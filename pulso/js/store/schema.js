/* Catálogo de entidades, valores permitidos y objetos por defecto.
 * Es la única fuente de verdad del modelo: las vistas y las pruebas leen de aquí. */

export const VERSION_DATOS = 1;

/** Nombres de los almacenes de IndexedDB, en orden de dependencia. */
export const TIPOS = [
  'equipos', 'personas', 'iniciativas', 'proyectos',
  'tareas', 'seguimientos', 'aprendizajes',
];

/* ------------------------------------------------------------- catálogos */

export const ESTADOS_TAREA = [
  { id: 'pendiente',  etiqueta: 'Por hacer',   color: 'gris',  avance: 0 },
  { id: 'en_curso',   etiqueta: 'En curso',    color: 'azul',  avance: 40 },
  { id: 'bloqueada',  etiqueta: 'Bloqueada',   color: 'rojo',  avance: 40 },
  { id: 'en_revision',etiqueta: 'En revisión', color: 'ambar', avance: 80 },
  { id: 'hecha',      etiqueta: 'Hecha',       color: 'verde', avance: 100 },
];

export const PRIORIDADES = [
  { id: 'baja',    etiqueta: 'Baja',    peso: 1, color: 'gris' },
  { id: 'media',   etiqueta: 'Media',   peso: 2, color: 'azul' },
  { id: 'alta',    etiqueta: 'Alta',    peso: 3, color: 'ambar' },
  { id: 'critica', etiqueta: 'Crítica', peso: 4, color: 'rojo' },
];

export const CADENCIAS = [
  { id: 'ninguna',   etiqueta: 'Sin seguimiento', corta: '—' },
  { id: 'diaria',    etiqueta: 'Diaria',          corta: 'D' },
  { id: 'semanal',   etiqueta: 'Semanal',         corta: 'S' },
  { id: 'bisemanal', etiqueta: 'Bisemanal (cada 14 días)', corta: '2S' },
  { id: 'quincenal', etiqueta: 'Quincenal (días 1 y 15)',  corta: 'Q' },
  { id: 'mensual',   etiqueta: 'Mensual',         corta: 'M' },
];

export const ESTADOS_PROYECTO = [
  { id: 'planificado', etiqueta: 'Planificado', color: 'gris' },
  { id: 'en_curso',    etiqueta: 'En curso',    color: 'azul' },
  { id: 'en_riesgo',   etiqueta: 'En riesgo',   color: 'ambar' },
  { id: 'pausado',     etiqueta: 'Pausado',     color: 'gris' },
  { id: 'cerrado',     etiqueta: 'Cerrado',     color: 'verde' },
];

export const TIPOS_APRENDIZAJE = [
  { id: 'aprendizaje', etiqueta: 'Aprendizaje',   color: 'acento' },
  { id: 'bien',        etiqueta: 'Salió bien',    color: 'verde' },
  { id: 'mejorar',     etiqueta: 'A mejorar',     color: 'ambar' },
  { id: 'riesgo',      etiqueta: 'Riesgo',        color: 'rojo' },
];

export const ESTADOS_ACCION = [
  { id: 'sin_accion', etiqueta: 'Sin acción',  color: 'gris' },
  { id: 'pendiente',  etiqueta: 'Pendiente',   color: 'ambar' },
  { id: 'en_curso',   etiqueta: 'En curso',    color: 'azul' },
  { id: 'hecha',      etiqueta: 'Hecha',       color: 'verde' },
  { id: 'descartada', etiqueta: 'Descartada',  color: 'gris' },
];

export const SEMAFOROS = [
  { id: 'verde',          etiqueta: 'En plazo',        color: 'verde' },
  { id: 'ambar',          etiqueta: 'Por vencer',      color: 'ambar' },
  { id: 'rojo',           etiqueta: 'Vencida',         color: 'rojo' },
  { id: 'cerrada_ok',     etiqueta: 'Cerrada en plazo',color: 'verde' },
  { id: 'cerrada_atraso', etiqueta: 'Cerrada tarde',   color: 'gris' },
  { id: 'sin_fecha',      etiqueta: 'Sin fecha',       color: 'gris' },
];

/** Días de holgura a partir de los cuales una tarea deja de ser ámbar. */
export const UMBRAL_AMBAR = 3;

/** Colores de avatar y de equipo, en el mismo orden que las series de gráficos. */
export const COLORES = [
  '#4f46e5', '#0d9488', '#c2410c', '#7c3aed',
  '#b45309', '#0369a1', '#be185d', '#15803d',
];

/* -------------------------------------------------------------- utilidad */

export function etiquetaDe(catalogo, id, porDefecto = '—') {
  const item = catalogo.find((c) => c.id === id);
  return item ? item.etiqueta : porDefecto;
}

export function colorDe(catalogo, id, porDefecto = 'gris') {
  const item = catalogo.find((c) => c.id === id);
  return item ? item.color : porDefecto;
}

export function nuevoId(prefijo = 'id') {
  const azar = (globalThis.crypto && globalThis.crypto.randomUUID)
    ? globalThis.crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefijo}_${Date.now().toString(36)}${azar}`;
}

/* --------------------------------------------------- objetos por defecto */

export const PLANTILLAS = {
  equipos: () => ({ id: nuevoId('eq'), nombre: '', descripcion: '', color: COLORES[0] }),

  personas: () => ({ id: nuevoId('pe'), nombre: '', email: '', equipoIds: [], color: COLORES[0] }),

  iniciativas: () => ({
    id: nuevoId('in'), nombre: '', objetivo: '', duenoId: null,
    fechaInicio: null, fechaFin: null, estado: 'en_curso',
  }),

  proyectos: () => ({
    id: nuevoId('pr'), iniciativaId: null, equipoId: null, nombre: '', descripcion: '',
    responsableId: null, fechaInicio: null, fechaFinPlan: null,
    estado: 'en_curso', cadenciaDefecto: 'semanal',
  }),

  tareas: () => ({
    id: nuevoId('ta'), proyectoId: null, titulo: '', descripcion: '',
    responsableId: null, estado: 'pendiente', prioridad: 'media',
    fechaInicio: null, fechaCompromiso: null, fechaCierreReal: null,
    esfuerzoEstimadoH: null, esfuerzoRealH: 0,
    cadencia: 'semanal', proximoSeguimiento: null, ultimoSeguimiento: null,
    avance: 0, motivoBloqueo: '', etiquetas: [], dependeDe: [],
    origen: 'manual', orden: Date.now(), creadaEn: new Date().toISOString(),
  }),

  seguimientos: () => ({
    id: nuevoId('sg'), tareaId: null, fecha: null, autorId: null,
    avance: 0, semaforo: 'verde', comentario: '', horasImputadas: 0,
  }),

  aprendizajes: () => ({
    id: nuevoId('ap'), ambito: 'proyecto', refId: null, fecha: null,
    tipo: 'aprendizaje', texto: '', autorId: null,
    accionAcordada: '', responsableAccionId: null, estadoAccion: 'sin_accion',
  }),
};

/** Completa un objeto con los campos que le falten según su plantilla. */
export function normalizar(tipo, objeto) {
  const base = PLANTILLAS[tipo] ? PLANTILLAS[tipo]() : {};
  const salida = { ...base, ...objeto };
  if (!salida.id) salida.id = base.id;
  return salida;
}

/** Configuración de la aplicación (se guarda aparte, en localStorage). */
export const CONFIG_POR_DEFECTO = {
  version: VERSION_DATOS,
  iniciativaActiva: null,
  tema: 'sistema',
  semillaCargada: false,
  notificaciones: { activadas: false, ultimoAviso: null },
  filtros: { equipoId: '', proyectoId: '', responsableId: '', texto: '', soloAlerta: '' },
  agrupacion: 'proyecto',
};
