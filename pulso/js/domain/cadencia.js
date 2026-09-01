/* Cálculo de las cadencias de seguimiento.
 * Una cadencia responde a la pregunta "cada cuánto reviso este tema con quien lo lleva".
 * A partir de la fecha del último seguimiento entrega la fecha del próximo. */

import { CADENCIAS } from '../store/schema.js';
import {
  sumarDias, sumarMeses, deISO, aISO, diffDias, hoyISO, siguienteHabil, esFinDeSemana,
} from './fechas.js';

export { CADENCIAS };

/**
 * Fecha del próximo seguimiento.
 * @param {string} cadencia  id de CADENCIAS
 * @param {string} desde     fecha ISO del último seguimiento (o de inicio)
 * @returns {string|null}    fecha ISO, o null si la cadencia no agenda nada
 */
export function proximoSeguimiento(cadencia, desde) {
  if (!desde) return null;
  switch (cadencia) {
    case 'diaria':
      // "Diaria" se entiende como día hábil: no agenda sábados ni domingos.
      return siguienteHabil(desde);
    case 'semanal':
      return corregirFinDeSemana(sumarDias(desde, 7));
    case 'bisemanal':
      return corregirFinDeSemana(sumarDias(desde, 14));
    case 'quincenal':
      return proximoDia1o15(desde);
    case 'mensual':
      return corregirFinDeSemana(sumarMeses(desde, 1));
    case 'ninguna':
    default:
      return null;
  }
}

/** Si la fecha cae en fin de semana, la adelanta al lunes siguiente. */
function corregirFinDeSemana(iso) {
  if (!iso || !esFinDeSemana(iso)) return iso;
  return siguienteHabil(iso);
}

/** Siguiente día 1 o 15 estrictamente posterior a `desde`. */
function proximoDia1o15(desde) {
  const d = deISO(desde);
  if (!d) return null;
  const dia = d.getDate();
  let destino;
  if (dia < 15) destino = new Date(d.getFullYear(), d.getMonth(), 15);
  else destino = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return corregirFinDeSemana(aISO(destino));
}

/**
 * Reprograma una tarea tras registrar un seguimiento: deja constancia del
 * último y agenda el siguiente. Devuelve solo los campos que cambian.
 */
export function reprogramar(tarea, fechaSeguimiento = hoyISO()) {
  return {
    ultimoSeguimiento: fechaSeguimiento,
    proximoSeguimiento: proximoSeguimiento(tarea.cadencia, fechaSeguimiento),
  };
}

/** true si la tarea tiene un seguimiento agendado que ya pasó. */
export function seguimientoVencido(tarea, hoy = hoyISO()) {
  if (!tarea || tarea.estado === 'hecha') return false;
  if (!tarea.proximoSeguimiento) return false;
  return diffDias(hoy, tarea.proximoSeguimiento) < 0;
}

/** true si el seguimiento toca hoy. */
export function seguimientoHoy(tarea, hoy = hoyISO()) {
  if (!tarea || tarea.estado === 'hecha' || !tarea.proximoSeguimiento) return false;
  return diffDias(hoy, tarea.proximoSeguimiento) === 0;
}

/** Días de retraso del seguimiento (0 si está al día). */
export function diasSinSeguimiento(tarea, hoy = hoyISO()) {
  if (!tarea || !tarea.proximoSeguimiento) return 0;
  const d = diffDias(hoy, tarea.proximoSeguimiento);
  return d < 0 ? -d : 0;
}

/**
 * Agenda inicial de una tarea recién creada: el primer seguimiento se cuenta
 * desde su fecha de inicio, o desde hoy si no la tiene.
 */
export function primerSeguimiento(tarea, hoy = hoyISO()) {
  const base = tarea.fechaInicio && diffDias(hoy, tarea.fechaInicio) > 0 ? tarea.fechaInicio : hoy;
  return proximoSeguimiento(tarea.cadencia, base);
}
