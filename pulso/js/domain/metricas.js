/* Indicadores de proyecto e iniciativa: avance, atrasos, esfuerzo y salud. */

import { ESTADOS_TAREA } from '../store/schema.js';
import { hoyISO, inicioSemana, sumarDias, diffDias } from './fechas.js';
import { diasAtraso, estaAtrasada } from './alertas.js';
import { seguimientoVencido } from './cadencia.js';

/** Avance de una tarea: 100 si está hecha, si no el avance declarado. */
export function avanceTarea(tarea) {
  if (tarea.estado === 'hecha') return 100;
  const declarado = Number(tarea.avance);
  if (Number.isFinite(declarado) && declarado > 0) return Math.min(100, declarado);
  const estado = ESTADOS_TAREA.find((e) => e.id === tarea.estado);
  return estado ? estado.avance : 0;
}

/**
 * Indicadores de un conjunto de tareas (sirve para un proyecto, un equipo o
 * una persona: quien llama decide qué tareas le pasa).
 */
export function resumirTareas(tareas, hoy = hoyISO()) {
  const total = tareas.length;
  const porEstado = {};
  for (const e of ESTADOS_TAREA) porEstado[e.id] = 0;

  let hechas = 0, atrasadas = 0, bloqueadas = 0, seguimientoAlDia = 0;
  let sumaAtraso = 0, atrasoMax = 0;
  let estimado = 0, real = 0, sumaAvance = 0;

  for (const t of tareas) {
    porEstado[t.estado] = (porEstado[t.estado] || 0) + 1;
    if (t.estado === 'hecha') hechas++;
    if (t.estado === 'bloqueada') bloqueadas++;
    if (estaAtrasada(t, hoy)) {
      atrasadas++;
      const d = diasAtraso(t, hoy);
      sumaAtraso += d;
      if (d > atrasoMax) atrasoMax = d;
    }
    if (t.estado !== 'hecha' && !seguimientoVencido(t, hoy)) seguimientoAlDia++;
    estimado += Number(t.esfuerzoEstimadoH) || 0;
    real += Number(t.esfuerzoRealH) || 0;
    sumaAvance += avanceTarea(t);
  }

  const abiertas = total - hechas;
  const desvioPct = estimado > 0 ? Math.round(((real - estimado) / estimado) * 100) : null;

  return {
    total, abiertas, hechas, porEstado,
    atrasadas, bloqueadas,
    atrasoPromedio: atrasadas ? Math.round((sumaAtraso / atrasadas) * 10) / 10 : 0,
    atrasoMax,
    esfuerzoEstimado: redondea(estimado),
    esfuerzoReal: redondea(real),
    desvioPct,
    avance: total ? Math.round(sumaAvance / total) : 0,
    cumplimientoSeguimiento: abiertas ? Math.round((seguimientoAlDia / abiertas) * 100) : 100,
  };
}

/**
 * Índice de salud 0-100. Parte de 100 y descuenta por atrasos, bloqueos,
 * sobrecosto de esfuerzo y seguimientos abandonados.
 */
export function salud(resumen) {
  if (!resumen.total) return 100;
  let puntos = 100;
  puntos -= (resumen.atrasadas / resumen.total) * 45;
  puntos -= (resumen.bloqueadas / resumen.total) * 20;
  if (resumen.desvioPct !== null && resumen.desvioPct > 0) {
    puntos -= Math.min(20, resumen.desvioPct * 0.3);
  }
  puntos -= ((100 - resumen.cumplimientoSeguimiento) / 100) * 15;
  return Math.max(0, Math.min(100, Math.round(puntos)));
}

/** Traduce el índice de salud a un color de semáforo. */
export function colorSalud(indice) {
  if (indice >= 75) return 'verde';
  if (indice >= 50) return 'ambar';
  return 'rojo';
}

/** Indicadores de un proyecto, con sus propias tareas ya filtradas. */
export function metricasProyecto(proyecto, tareas, hoy = hoyISO()) {
  const resumen = resumirTareas(tareas, hoy);
  const indice = salud(resumen);
  const proximo = tareas
    .filter((t) => t.estado !== 'hecha' && t.fechaCompromiso)
    .map((t) => t.fechaCompromiso)
    .sort()[0] || null;
  return {
    ...resumen,
    proyectoId: proyecto ? proyecto.id : null,
    salud: indice,
    colorSalud: colorSalud(indice),
    proximoVencimiento: proximo,
    diasParaFin: proyecto && proyecto.fechaFinPlan ? diffDias(hoy, proyecto.fechaFinPlan) : null,
  };
}

/** Indicadores agregados de la iniciativa completa. */
export function metricasIniciativa(proyectos, tareas, hoy = hoyISO()) {
  const resumen = resumirTareas(tareas, hoy);
  const indice = salud(resumen);
  const porProyecto = proyectos.map((p) => ({
    proyecto: p,
    metricas: metricasProyecto(p, tareas.filter((t) => t.proyectoId === p.id), hoy),
  }));
  return {
    ...resumen,
    salud: indice,
    colorSalud: colorSalud(indice),
    proyectos: proyectos.length,
    proyectosEnRiesgo: porProyecto.filter((x) => x.metricas.colorSalud !== 'verde').length,
    porProyecto,
  };
}

/** Cierres por semana de las últimas `semanas` semanas: [{ semana, etiqueta, cerradas }]. */
export function cierresPorSemana(tareas, semanas = 8, hoy = hoyISO()) {
  const serie = [];
  const lunesActual = inicioSemana(hoy);
  for (let i = semanas - 1; i >= 0; i--) {
    const inicio = sumarDias(lunesActual, -7 * i);
    const fin = sumarDias(inicio, 6);
    const cerradas = tareas.filter((t) => t.fechaCierreReal
      && t.fechaCierreReal >= inicio && t.fechaCierreReal <= fin).length;
    serie.push({ inicio, fin, cerradas });
  }
  return serie;
}

/** Carga por persona: tareas abiertas, atrasadas y horas comprometidas. */
export function cargaPorPersona(tareas, personas, hoy = hoyISO()) {
  return personas.map((persona) => {
    const suyas = tareas.filter((t) => t.responsableId === persona.id);
    const abiertas = suyas.filter((t) => t.estado !== 'hecha');
    return {
      persona,
      total: suyas.length,
      abiertas: abiertas.length,
      atrasadas: abiertas.filter((t) => estaAtrasada(t, hoy)).length,
      horasAbiertas: redondea(abiertas.reduce((s, t) => s + (Number(t.esfuerzoEstimadoH) || 0), 0)),
    };
  }).sort((a, b) => b.abiertas - a.abiertas);
}

/** Atrasos agrupados por equipo, para el informe. */
export function atrasosPorEquipo(equipos, proyectos, tareas, hoy = hoyISO()) {
  return equipos.map((equipo) => {
    const idsProyecto = proyectos.filter((p) => p.equipoId === equipo.id).map((p) => p.id);
    const suyas = tareas.filter((t) => idsProyecto.includes(t.proyectoId));
    const atrasadas = suyas.filter((t) => estaAtrasada(t, hoy));
    return {
      equipo,
      total: suyas.length,
      atrasadas: atrasadas.length,
      diasPromedio: atrasadas.length
        ? Math.round((atrasadas.reduce((s, t) => s + diasAtraso(t, hoy), 0) / atrasadas.length) * 10) / 10
        : 0,
    };
  }).filter((x) => x.total > 0);
}

/** Las N tareas con más días de atraso. */
export function topAtrasos(tareas, n = 8, hoy = hoyISO()) {
  return tareas
    .filter((t) => estaAtrasada(t, hoy))
    .map((t) => ({ tarea: t, dias: diasAtraso(t, hoy) }))
    .sort((a, b) => b.dias - a.dias)
    .slice(0, n);
}

function redondea(n) {
  return Math.round(n * 10) / 10;
}
