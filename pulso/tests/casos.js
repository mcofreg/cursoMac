/* Pruebas de la lógica de dominio de Pulso.
 * Sin dependencias: se ejecutan igual en el navegador (test.html) y en Node
 * (node tests/run.mjs). Solo se prueban funciones puras. */

import * as F from '../js/domain/fechas.js';
import * as C from '../js/domain/cadencia.js';
import * as A from '../js/domain/alertas.js';
import * as M from '../js/domain/metricas.js';
import { CADENCIAS, ESTADOS_TAREA, PLANTILLAS, normalizar } from '../js/store/schema.js';

/** Construye una tarea de prueba sobre la plantilla real del modelo. */
function tarea(campos = {}) {
  return normalizar('tareas', { ...PLANTILLAS.tareas(), ...campos });
}

const HOY = '2026-03-04'; // miércoles

export const suites = [
  {
    nombre: 'fechas',
    casos: [
      ['aISO y deISO son inversas', (t) => t.igual(F.aISO(F.deISO('2026-03-04')), '2026-03-04')],
      ['deISO rechaza basura', (t) => t.igual(F.deISO('no es fecha'), null)],
      ['diffDias cuenta días completos', (t) => t.igual(F.diffDias('2026-03-01', '2026-03-10'), 9)],
      ['diffDias es negativo hacia atrás', (t) => t.igual(F.diffDias('2026-03-10', '2026-03-01'), -9)],
      ['diffDias cruza el cambio de hora sin perder un día', (t) => t.igual(F.diffDias('2026-03-01', '2026-04-01'), 31)],
      ['sumarDias cruza el fin de mes', (t) => t.igual(F.sumarDias('2026-02-27', 3), '2026-03-02')],
      ['sumarMeses recorta al último día del mes', (t) => t.igual(F.sumarMeses('2026-01-31', 1), '2026-02-28')],
      ['sumarMeses mantiene el día cuando cabe', (t) => t.igual(F.sumarMeses('2026-03-15', 2), '2026-05-15')],
      ['inicioSemana devuelve el lunes', (t) => t.igual(F.inicioSemana('2026-03-04'), '2026-03-02')],
      ['inicioSemana desde domingo devuelve el lunes anterior', (t) => t.igual(F.inicioSemana('2026-03-08'), '2026-03-02')],
      ['finSemana devuelve el domingo', (t) => t.igual(F.finSemana('2026-03-04'), '2026-03-08')],
      ['esFinDeSemana reconoce el sábado', (t) => t.igual(F.esFinDeSemana('2026-03-07'), true)],
      ['siguienteHabil salta el fin de semana', (t) => t.igual(F.siguienteHabil('2026-03-06'), '2026-03-09')],
      ['diasHabiles excluye sábado y domingo', (t) => t.igual(F.diasHabiles('2026-03-02', '2026-03-09'), 5)],
      ['humano nombra el día de hoy', (t) => t.igual(F.humano(HOY, HOY), 'hoy')],
      ['humano cuenta los días pasados', (t) => t.igual(F.humano('2026-03-01', HOY), 'hace 3 días')],
      ['horasHumanas pasa a días sobre 8 horas', (t) => t.igual(F.horasHumanas(20), '2,5 d')],
      ['horasHumanas deja las horas bajo la jornada', (t) => t.igual(F.horasHumanas(6), '6 h')],
      ['extremos encuentra mínimo y máximo', (t) => t.igual(
        JSON.stringify(F.extremos(['2026-05-01', null, '2026-01-09', '2026-03-03'])),
        JSON.stringify({ min: '2026-01-09', max: '2026-05-01' }))],
      ['rango devuelve los días inclusive', (t) => t.igual(F.rango('2026-03-01', '2026-03-04').length, 4)],
    ],
  },

  {
    nombre: 'cadencias',
    casos: [
      ['el catálogo cubre las cinco cadencias pedidas', (t) => {
        const ids = CADENCIAS.map((c) => c.id);
        ['diaria', 'semanal', 'bisemanal', 'quincenal', 'mensual'].forEach((c) => t.cierto(ids.includes(c), c));
      }],
      ['diaria avanza un día hábil', (t) => t.igual(C.proximoSeguimiento('diaria', '2026-03-04'), '2026-03-05')],
      ['diaria desde viernes salta al lunes', (t) => t.igual(C.proximoSeguimiento('diaria', '2026-03-06'), '2026-03-09')],
      ['semanal suma siete días', (t) => t.igual(C.proximoSeguimiento('semanal', '2026-03-02'), '2026-03-09')],
      ['bisemanal suma catorce días', (t) => t.igual(C.proximoSeguimiento('bisemanal', '2026-03-02'), '2026-03-16')],
      ['quincenal desde el día 3 cae en el 15 hábil', (t) => t.igual(C.proximoSeguimiento('quincenal', '2026-03-03'), '2026-03-16')],
      ['quincenal desde el día 20 cae en el 1 del mes siguiente', (t) => t.igual(C.proximoSeguimiento('quincenal', '2026-03-20'), '2026-04-01')],
      ['mensual salta un mes y evita el fin de semana', (t) => t.igual(C.proximoSeguimiento('mensual', '2026-01-31'), '2026-03-02')],
      ['sin seguimiento no agenda nada', (t) => t.igual(C.proximoSeguimiento('ninguna', '2026-03-02'), null)],
      ['sin fecha de partida no agenda nada', (t) => t.igual(C.proximoSeguimiento('semanal', null), null)],
      ['reprogramar deja el último y agenda el próximo', (t) => {
        const r = C.reprogramar(tarea({ cadencia: 'semanal' }), '2026-03-02');
        t.igual(r.ultimoSeguimiento, '2026-03-02');
        t.igual(r.proximoSeguimiento, '2026-03-09');
      }],
      ['un seguimiento con fecha pasada está vencido', (t) => t.igual(
        C.seguimientoVencido(tarea({ proximoSeguimiento: '2026-03-01' }), HOY), true)],
      ['una tarea hecha nunca tiene el seguimiento vencido', (t) => t.igual(
        C.seguimientoVencido(tarea({ estado: 'hecha', proximoSeguimiento: '2026-03-01' }), HOY), false)],
      ['diasSinSeguimiento cuenta el retraso', (t) => t.igual(
        C.diasSinSeguimiento(tarea({ proximoSeguimiento: '2026-02-28' }), HOY), 4)],
      ['primerSeguimiento parte del inicio futuro de la tarea', (t) => t.igual(
        C.primerSeguimiento(tarea({ cadencia: 'semanal', fechaInicio: '2026-03-09' }), HOY), '2026-03-16')],
    ],
  },

  {
    nombre: 'alertas y semáforos',
    casos: [
      ['una tarea vencida es roja', (t) => t.igual(A.semaforo(tarea({ fechaCompromiso: '2026-03-01' }), HOY), 'rojo')],
      ['la que vence hoy es ámbar', (t) => t.igual(A.semaforo(tarea({ fechaCompromiso: HOY }), HOY), 'ambar')],
      ['la que vence en tres días es ámbar', (t) => t.igual(A.semaforo(tarea({ fechaCompromiso: '2026-03-07' }), HOY), 'ambar')],
      ['la que vence en cuatro días es verde', (t) => t.igual(A.semaforo(tarea({ fechaCompromiso: '2026-03-08' }), HOY), 'verde')],
      ['sin fecha no tiene semáforo de plazo', (t) => t.igual(A.semaforo(tarea({}), HOY), 'sin_fecha')],
      ['cerrada antes del compromiso queda en plazo', (t) => t.igual(
        A.semaforo(tarea({ estado: 'hecha', fechaCompromiso: '2026-03-05', fechaCierreReal: '2026-03-03' }), HOY), 'cerrada_ok')],
      ['cerrada después del compromiso queda como tardía', (t) => t.igual(
        A.semaforo(tarea({ estado: 'hecha', fechaCompromiso: '2026-03-01', fechaCierreReal: '2026-03-04' }), HOY), 'cerrada_atraso')],
      ['diasAtraso mide desde el compromiso', (t) => t.igual(
        A.diasAtraso(tarea({ fechaCompromiso: '2026-02-25' }), HOY), 7)],
      ['una tarea en plazo no acumula atraso', (t) => t.igual(
        A.diasAtraso(tarea({ fechaCompromiso: '2026-03-20' }), HOY), 0)],
      ['holgura cuenta los días que faltan', (t) => t.igual(
        A.holgura(tarea({ fechaCompromiso: '2026-03-09' }), HOY), 5)],
      ['clasificar reparte cada tarea en su bandeja', (t) => {
        const tareas = [
          tarea({ id: 'v', fechaCompromiso: '2026-02-20', responsableId: 'p1' }),
          tarea({ id: 'h', fechaCompromiso: HOY, responsableId: 'p1' }),
          tarea({ id: 's', fechaCompromiso: '2026-03-06', responsableId: 'p1' }),
          tarea({ id: 'l', fechaCompromiso: '2026-03-30', responsableId: 'p1' }),
          tarea({ id: 'b', estado: 'bloqueada', fechaCompromiso: '2026-03-30', responsableId: 'p1' }),
          tarea({ id: 'n', fechaCompromiso: '2026-03-30' }),
          tarea({ id: 'x', responsableId: 'p1' }),
          tarea({ id: 'c', estado: 'hecha', fechaCompromiso: '2026-02-01', fechaCierreReal: '2026-02-10' }),
        ];
        const b = A.clasificar(tareas, HOY);
        t.igual(b.vencidas.map((x) => x.id).join(), 'v');
        t.igual(b.vencenHoy.map((x) => x.id).join(), 'h');
        t.igual(b.vencenSemana.map((x) => x.id).join(), 's');
        t.igual(b.bloqueadas.map((x) => x.id).join(), 'b');
        t.igual(b.sinResponsable.map((x) => x.id).join(), 'n');
        t.igual(b.sinFecha.map((x) => x.id).join(), 'x');
      }],
      ['las tareas hechas no generan alertas', (t) => {
        const b = A.clasificar([tarea({ estado: 'hecha', fechaCompromiso: '2026-01-01' })], HOY);
        t.igual(b.vencidas.length, 0);
      }],
      ['las vencidas se ordenan de mayor a menor atraso', (t) => {
        const b = A.clasificar([
          tarea({ id: 'a', fechaCompromiso: '2026-03-03' }),
          tarea({ id: 'b', fechaCompromiso: '2026-01-03' }),
        ], HOY);
        t.igual(b.vencidas.map((x) => x.id).join(), 'b,a');
      }],
      ['contarUrgencias suma vencidas, de hoy, bloqueadas y sin seguimiento', (t) => {
        const n = A.contarUrgencias([
          tarea({ fechaCompromiso: '2026-02-20' }),
          tarea({ fechaCompromiso: HOY }),
          tarea({ estado: 'bloqueada', fechaCompromiso: '2026-04-01' }),
        ], HOY);
        t.igual(n, 3);
      }],
      ['textoAviso resume en una línea', (t) => t.cierto(
        A.textoAviso([tarea({ fechaCompromiso: '2026-02-20' })], HOY).includes('1 atrasada'))],
    ],
  },

  {
    nombre: 'métricas',
    casos: [
      ['una tarea hecha avanza 100', (t) => t.igual(M.avanceTarea(tarea({ estado: 'hecha', avance: 10 })), 100)],
      ['el avance declarado manda sobre el del estado', (t) => t.igual(M.avanceTarea(tarea({ estado: 'en_curso', avance: 65 })), 65)],
      ['sin avance declarado se usa el del estado', (t) => t.igual(
        M.avanceTarea(tarea({ estado: 'en_revision', avance: 0 })),
        ESTADOS_TAREA.find((e) => e.id === 'en_revision').avance)],
      ['resumirTareas cuenta estados, atrasos y esfuerzo', (t) => {
        const r = M.resumirTareas([
          tarea({ estado: 'hecha', fechaCompromiso: '2026-02-01', fechaCierreReal: '2026-02-01', esfuerzoEstimadoH: 10, esfuerzoRealH: 12 }),
          tarea({ estado: 'en_curso', fechaCompromiso: '2026-02-25', esfuerzoEstimadoH: 10, esfuerzoRealH: 8 }),
          tarea({ estado: 'bloqueada', fechaCompromiso: '2026-03-20', esfuerzoEstimadoH: 0, esfuerzoRealH: 0 }),
        ], HOY);
        t.igual(r.total, 3);
        t.igual(r.hechas, 1);
        t.igual(r.abiertas, 2);
        t.igual(r.atrasadas, 1);
        t.igual(r.bloqueadas, 1);
        t.igual(r.atrasoPromedio, 7);
        t.igual(r.esfuerzoEstimado, 20);
        t.igual(r.esfuerzoReal, 20);
        t.igual(r.desvioPct, 0);
      }],
      ['sin estimación el desvío no se inventa', (t) => t.igual(
        M.resumirTareas([tarea({ esfuerzoRealH: 5 })], HOY).desvioPct, null)],
      ['un conjunto sano da salud 100', (t) => t.igual(
        M.salud(M.resumirTareas([tarea({ fechaCompromiso: '2026-04-01', esfuerzoEstimadoH: 5, esfuerzoRealH: 4 })], HOY)), 100)],
      ['los atrasos bajan la salud', (t) => {
        const mala = M.salud(M.resumirTareas([tarea({ fechaCompromiso: '2026-01-01' })], HOY));
        t.cierto(mala < 60, `esperaba salud baja, llegó ${mala}`);
      }],
      ['sin tareas la salud es 100', (t) => t.igual(M.salud(M.resumirTareas([], HOY)), 100)],
      ['colorSalud usa los umbrales 80 y 55', (t) => {
        t.igual(M.colorSalud(80), 'verde');
        t.igual(M.colorSalud(60), 'ambar');
        t.igual(M.colorSalud(30), 'rojo');
      }],
      ['metricasProyecto anuncia el próximo vencimiento abierto', (t) => {
        const m = M.metricasProyecto({ id: 'p1', fechaFinPlan: '2026-03-31' }, [
          tarea({ proyectoId: 'p1', estado: 'hecha', fechaCompromiso: '2026-03-05' }),
          tarea({ proyectoId: 'p1', fechaCompromiso: '2026-03-12' }),
          tarea({ proyectoId: 'p1', fechaCompromiso: '2026-03-20' }),
        ], HOY);
        t.igual(m.proximoVencimiento, '2026-03-12');
        t.igual(m.diasParaFin, 27);
      }],
      ['metricasIniciativa agrega los proyectos', (t) => {
        const proyectos = [{ id: 'p1' }, { id: 'p2' }];
        const tareas = [
          tarea({ proyectoId: 'p1', fechaCompromiso: '2026-01-01' }),
          tarea({ proyectoId: 'p2', fechaCompromiso: '2026-05-01' }),
        ];
        const m = M.metricasIniciativa(proyectos, tareas, HOY);
        t.igual(m.proyectos, 2);
        t.igual(m.total, 2);
        t.igual(m.porProyecto.length, 2);
        t.igual(m.proyectosEnRiesgo, 1);
      }],
      ['cierresPorSemana ubica el cierre en su semana', (t) => {
        const serie = M.cierresPorSemana([tarea({ fechaCierreReal: '2026-03-03' })], 4, HOY);
        t.igual(serie.length, 4);
        t.igual(serie[3].cerradas, 1);
      }],
      ['cargaPorPersona ordena por tareas abiertas', (t) => {
        const personas = [{ id: 'a', nombre: 'Ana' }, { id: 'b', nombre: 'Beto' }];
        const tareas = [
          tarea({ responsableId: 'b', fechaCompromiso: '2026-01-01', esfuerzoEstimadoH: 4 }),
          tarea({ responsableId: 'b', fechaCompromiso: '2026-05-01', esfuerzoEstimadoH: 4 }),
          tarea({ responsableId: 'a', estado: 'hecha' }),
        ];
        const carga = M.cargaPorPersona(tareas, personas, HOY);
        t.igual(carga[0].persona.id, 'b');
        t.igual(carga[0].abiertas, 2);
        t.igual(carga[0].atrasadas, 1);
        t.igual(carga[0].horasAbiertas, 8);
      }],
      ['atrasosPorEquipo ignora equipos sin tareas', (t) => {
        const equipos = [{ id: 'e1' }, { id: 'e2' }];
        const proyectos = [{ id: 'p1', equipoId: 'e1' }];
        const tareas = [tarea({ proyectoId: 'p1', fechaCompromiso: '2026-02-22' })];
        const filas = M.atrasosPorEquipo(equipos, proyectos, tareas, HOY);
        t.igual(filas.length, 1);
        t.igual(filas[0].atrasadas, 1);
        t.igual(filas[0].diasPromedio, 10);
      }],
      ['topAtrasos ordena y recorta', (t) => {
        const tareas = [
          tarea({ id: 'a', fechaCompromiso: '2026-03-01' }),
          tarea({ id: 'b', fechaCompromiso: '2026-01-01' }),
          tarea({ id: 'c', fechaCompromiso: '2026-02-01' }),
        ];
        const top = M.topAtrasos(tareas, 2, HOY);
        t.igual(top.length, 2);
        t.igual(top[0].tarea.id, 'b');
      }],
    ],
  },
];

/** Ejecuta todas las suites y devuelve el detalle. */
export function ejecutar() {
  const resultados = [];
  let ok = 0;
  let fallos = 0;

  for (const suite of suites) {
    const casos = [];
    for (const [nombre, fn] of suite.casos) {
      const errores = [];
      const t = {
        igual(actual, esperado, mensaje) {
          if (actual !== esperado) {
            errores.push(`${mensaje ? mensaje + ': ' : ''}se esperaba ${JSON.stringify(esperado)} y llegó ${JSON.stringify(actual)}`);
          }
        },
        cierto(condicion, mensaje) {
          if (!condicion) errores.push(mensaje || 'se esperaba verdadero');
        },
      };
      try {
        fn(t);
      } catch (e) {
        errores.push(`excepción: ${e && e.message ? e.message : e}`);
      }
      if (errores.length) fallos++; else ok++;
      casos.push({ nombre, errores });
    }
    resultados.push({ nombre: suite.nombre, casos });
  }

  return { resultados, ok, fallos, total: ok + fallos };
}
