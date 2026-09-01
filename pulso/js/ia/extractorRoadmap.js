/* Extractor de tareas a partir de la imagen de un roadmap.
 *
 * Define un único contrato y deja detrás un proveedor intercambiable:
 *
 *   extraerTareas(imagen, contexto) -> Promise<{ tareas, avisos, fuente }>
 *
 * El proveedor activo hoy es el SIMULADO: no manda nada a ninguna parte y
 * devuelve un conjunto de actividades coherente con el contexto, para poder
 * usar y probar toda la pantalla de importación. Cuando quieras conectar el
 * modelo real, llama a `usarClaude(clave)` — el resto de la aplicación no
 * cambia en nada porque el contrato es el mismo. */

import { extraerConClaude } from './promptRoadmap.js';
import { hoyISO, sumarDias, diffDias, aISO, deISO } from '../domain/fechas.js';

/** @type {{nombre:string, extraer:Function}} */
let proveedor = { nombre: 'simulado', extraer: extraerSimulado };

export function nombreProveedor() {
  return proveedor.nombre;
}

export function esSimulado() {
  return proveedor.nombre === 'simulado';
}

/** Conecta el modelo real. La clave nunca sale de esta pestaña. */
export function usarClaude(claveApi, modelo) {
  if (!claveApi) throw new Error('Se necesita una clave de API para conectar el modelo.');
  proveedor = {
    nombre: 'claude',
    extraer: (imagen, contexto, señal) => extraerConClaude(
      { datos: imagen.base64, tipoMime: imagen.tipoMime },
      contexto,
      { claveApi, modelo, señal },
    ),
  };
}

/** Vuelve al extractor simulado. */
export function usarSimulado() {
  proveedor = { nombre: 'simulado', extraer: extraerSimulado };
}

/**
 * Punto de entrada único.
 * @param {{nombre:string, tipoMime:string, base64:string, tamano:number}} imagen
 * @param {object} contexto  iniciativa, proyecto, equipos, personas, fechas, notas
 * @param {AbortSignal} [señal]
 */
export async function extraerTareas(imagen, contexto = {}, señal) {
  if (!imagen || !imagen.base64) throw new Error('No hay ninguna imagen que leer.');
  const resultado = await proveedor.extraer(imagen, contexto, señal);
  return {
    tareas: (resultado.tareas || []).map((t) => normalizarPropuesta(t, contexto)),
    avisos: resultado.avisos || [],
    fuente: proveedor.nombre,
  };
}

/** Deja cada propuesta con la forma que espera la pantalla de revisión. */
function normalizarPropuesta(propuesta, contexto) {
  const cadencias = ['ninguna', 'diaria', 'semanal', 'bisemanal', 'quincenal', 'mensual'];
  const prioridades = ['baja', 'media', 'alta', 'critica'];
  return {
    titulo: String(propuesta.titulo || '').trim() || 'Actividad sin nombre',
    descripcion: String(propuesta.descripcion || '').trim(),
    fase: String(propuesta.fase || '').trim(),
    fechaInicio: fechaValida(propuesta.fechaInicio),
    fechaCompromiso: fechaValida(propuesta.fechaCompromiso),
    responsable: String(propuesta.responsable || '').trim(),
    equipo: String(propuesta.equipo || '').trim(),
    esfuerzoEstimadoH: Number(propuesta.esfuerzoEstimadoH) > 0 ? Number(propuesta.esfuerzoEstimadoH) : null,
    prioridad: prioridades.includes(propuesta.prioridad) ? propuesta.prioridad : 'media',
    cadencia: cadencias.includes(propuesta.cadencia)
      ? propuesta.cadencia
      : (contexto.cadenciaDefecto || 'semanal'),
    confianza: ['alta', 'media', 'baja'].includes(propuesta.confianza) ? propuesta.confianza : 'media',
    incluir: true,
  };
}

function fechaValida(valor) {
  const fecha = deISO(valor);
  return fecha ? aISO(fecha) : null;
}

/* ------------------------------------------------------- extractor simulado */

/**
 * Devuelve una propuesta plausible y estable: la misma imagen produce siempre
 * el mismo resultado, así se puede revisar y ajustar la pantalla sin sorpresas.
 * Reparte las actividades entre el inicio y el fin del roadmap, y les asigna
 * responsables del equipo indicado.
 */
async function extraerSimulado(imagen, contexto) {
  await esperar(900); // El modelo real demora; la pantalla debe mostrar que trabaja.

  const semilla = sembrar(`${imagen.nombre}|${imagen.tamano}|${contexto.proyecto || ''}`);
  const azar = generador(semilla);

  const inicio = contexto.fechaInicio || hoyISO();
  const fin = contexto.fechaFin || sumarDias(inicio, 120);
  const largo = Math.max(30, diffDias(inicio, fin) || 120);
  const personas = contexto.personas && contexto.personas.length ? contexto.personas : [''];

  const fases = [
    {
      nombre: 'Descubrimiento',
      porcion: [0, 0.22],
      actividades: [
        ['Levantamiento del alcance y los supuestos', 'alta', 24],
        ['Definición de los criterios de éxito', 'media', 12],
        ['Identificación de dependencias externas', 'alta', 16],
      ],
    },
    {
      nombre: 'Construcción',
      porcion: [0.2, 0.72],
      actividades: [
        ['Diseño de la solución técnica', 'alta', 40],
        ['Desarrollo del primer entregable', 'critica', 80],
        ['Integración con los sistemas existentes', 'alta', 56],
        ['Pruebas automatizadas y de regresión', 'media', 32],
      ],
    },
    {
      nombre: 'Puesta en marcha',
      porcion: [0.7, 1],
      actividades: [
        ['Plan de despliegue y vuelta atrás', 'alta', 24],
        ['Capacitación y traspaso a soporte', 'media', 16],
        ['Marcha blanca y seguimiento post salida', 'critica', 40],
      ],
    },
  ];

  const tareas = [];
  let i = 0;
  for (const fase of fases) {
    const desdeFase = Math.round(largo * fase.porcion[0]);
    const hastaFase = Math.round(largo * fase.porcion[1]);
    const paso = Math.max(5, Math.round((hastaFase - desdeFase) / fase.actividades.length));

    fase.actividades.forEach(([titulo, prioridad, horas], j) => {
      const arranque = desdeFase + j * paso;
      const duracion = Math.max(4, Math.round(paso * (0.8 + azar() * 0.6)));
      tareas.push({
        titulo,
        descripcion: `Leída del roadmap en la fase "${fase.nombre}".`,
        fase: fase.nombre,
        fechaInicio: sumarDias(inicio, arranque),
        fechaCompromiso: sumarDias(inicio, Math.min(largo, arranque + duracion)),
        responsable: personas[i % personas.length],
        equipo: contexto.equipo || '',
        esfuerzoEstimadoH: Math.round(horas * (0.85 + azar() * 0.4)),
        prioridad,
        cadencia: duracion <= 10 ? 'diaria' : duracion <= 25 ? 'semanal' : 'bisemanal',
        confianza: azar() > 0.85 ? 'baja' : 'alta',
      });
      i++;
    });
  }

  return {
    tareas,
    avisos: [
      'Resultado del extractor simulado: la imagen no se envió a ningún servicio y las '
      + 'actividades son una propuesta de ejemplo. Revísalas y ajústalas antes de crearlas.',
      'Para leer de verdad la imagen hay que conectar el modelo con visión; las '
      + 'instrucciones están en el archivo README de Pulso.',
    ],
  };
}

function esperar(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

/** Hash sencillo y estable de un texto, para que la simulación sea reproducible. */
function sembrar(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Generador pseudoaleatorio determinista (mulberry32). */
function generador(semilla) {
  let a = semilla;
  return function siguiente() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
