/* Semáforos y bandejas de alerta.
 * Responde a "qué está por vencer, qué está atrasado y qué no tiene dueño". */

import { UMBRAL_AMBAR } from '../store/schema.js';
import { diffDias, hoyISO, finSemana } from './fechas.js';
import { seguimientoVencido, seguimientoHoy, diasSinSeguimiento } from './cadencia.js';

/**
 * Color de una tarea según su fecha de compromiso.
 * @returns {'verde'|'ambar'|'rojo'|'cerrada_ok'|'cerrada_atraso'|'sin_fecha'}
 */
export function semaforo(tarea, hoy = hoyISO()) {
  if (!tarea) return 'sin_fecha';
  if (tarea.estado === 'hecha') {
    if (!tarea.fechaCompromiso) return 'cerrada_ok';
    const cierre = tarea.fechaCierreReal || hoy;
    return diffDias(tarea.fechaCompromiso, cierre) > 0 ? 'cerrada_atraso' : 'cerrada_ok';
  }
  if (!tarea.fechaCompromiso) return 'sin_fecha';
  const holgura = diffDias(hoy, tarea.fechaCompromiso);
  if (holgura < 0) return 'rojo';
  if (holgura <= UMBRAL_AMBAR) return 'ambar';
  return 'verde';
}

/** Color simple para pintar bordes y puntos: verde | ambar | rojo | gris. */
export function colorSemaforo(id) {
  if (id === 'verde' || id === 'ambar' || id === 'rojo') return id;
  return 'gris';
}

/**
 * Días de atraso respecto del compromiso.
 * Positivo = atrasada. Para tareas cerradas mide el atraso con que se cerró.
 */
export function diasAtraso(tarea, hoy = hoyISO()) {
  if (!tarea || !tarea.fechaCompromiso) return 0;
  const referencia = tarea.estado === 'hecha' ? (tarea.fechaCierreReal || hoy) : hoy;
  const d = diffDias(tarea.fechaCompromiso, referencia);
  return d > 0 ? d : 0;
}

/** true si la tarea sigue abierta y su compromiso ya pasó. */
export function estaAtrasada(tarea, hoy = hoyISO()) {
  return tarea.estado !== 'hecha' && diasAtraso(tarea, hoy) > 0;
}

/** Días que faltan para el compromiso (negativo si ya venció, null si no tiene fecha). */
export function holgura(tarea, hoy = hoyISO()) {
  if (!tarea || !tarea.fechaCompromiso) return null;
  return diffDias(hoy, tarea.fechaCompromiso);
}

/**
 * Reparte las tareas en las bandejas del panel Radar.
 * Una tarea puede aparecer en más de una bandeja (por ejemplo vencida y bloqueada).
 */
export function clasificar(tareas, hoy = hoyISO()) {
  const finDeSemana = finSemana(hoy);
  const bandejas = {
    vencidas: [], vencenHoy: [], vencenSemana: [],
    seguimientoVencido: [], seguimientoHoy: [],
    bloqueadas: [], sinResponsable: [], sinFecha: [],
  };

  for (const t of tareas) {
    if (t.estado === 'hecha') continue;
    const h = holgura(t, hoy);

    if (h !== null && h < 0) bandejas.vencidas.push(t);
    else if (h === 0) bandejas.vencenHoy.push(t);
    else if (h !== null && diffDias(t.fechaCompromiso, finDeSemana) >= 0) bandejas.vencenSemana.push(t);

    if (seguimientoVencido(t, hoy)) bandejas.seguimientoVencido.push(t);
    else if (seguimientoHoy(t, hoy)) bandejas.seguimientoHoy.push(t);

    if (t.estado === 'bloqueada') bandejas.bloqueadas.push(t);
    if (!t.responsableId) bandejas.sinResponsable.push(t);
    if (!t.fechaCompromiso) bandejas.sinFecha.push(t);
  }

  bandejas.vencidas.sort((a, b) => diasAtraso(b, hoy) - diasAtraso(a, hoy));
  bandejas.vencenHoy.sort(porPrioridad);
  bandejas.vencenSemana.sort((a, b) => (a.fechaCompromiso || '').localeCompare(b.fechaCompromiso || ''));
  bandejas.seguimientoVencido.sort((a, b) => diasSinSeguimiento(b, hoy) - diasSinSeguimiento(a, hoy));

  return bandejas;
}

function porPrioridad(a, b) {
  const orden = { critica: 0, alta: 1, media: 2, baja: 3 };
  return (orden[a.prioridad] ?? 9) - (orden[b.prioridad] ?? 9);
}

/**
 * Cuántas cosas exigen atención ahora mismo. Alimenta la insignia del menú
 * y el aviso del navegador.
 */
export function contarUrgencias(tareas, hoy = hoyISO()) {
  const b = clasificar(tareas, hoy);
  return b.vencidas.length + b.vencenHoy.length + b.seguimientoVencido.length + b.bloqueadas.length;
}

/** Texto corto listo para una notificación del navegador. */
export function textoAviso(tareas, hoy = hoyISO()) {
  const b = clasificar(tareas, hoy);
  const partes = [];
  if (b.vencidas.length) partes.push(`${b.vencidas.length} atrasada${b.vencidas.length > 1 ? 's' : ''}`);
  if (b.vencenHoy.length) partes.push(`${b.vencenHoy.length} vence${b.vencenHoy.length > 1 ? 'n' : ''} hoy`);
  if (b.seguimientoVencido.length) partes.push(`${b.seguimientoVencido.length} sin seguimiento al día`);
  if (b.bloqueadas.length) partes.push(`${b.bloqueadas.length} bloqueada${b.bloqueadas.length > 1 ? 's' : ''}`);
  return partes.join(' · ');
}
