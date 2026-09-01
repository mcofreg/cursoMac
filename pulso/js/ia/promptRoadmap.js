/* Instrucciones y contrato de datos para que un modelo con visión lea la foto
 * de un roadmap y devuelva tareas de seguimiento.
 *
 * ESTE MÓDULO ESTÁ PREPARADO PERO NO CONECTADO. Hoy la pantalla de importación
 * usa el extractor simulado de extractorRoadmap.js. Para conectarlo de verdad
 * hay que llamar a `extraerConClaude` con una clave de API; los pasos están en
 * pulso/README.md.
 *
 * Advertencia importante antes de encenderlo: Pulso no tiene servidor, así que
 * la llamada saldría directamente desde el navegador y la clave quedaría al
 * alcance de cualquiera que abra las herramientas de desarrollo o mire el
 * tráfico. Para uso personal puede ser aceptable; para uso compartido conviene
 * poner delante un pequeño proxy que guarde la clave. */

export const MODELO = 'claude-opus-5';
export const VERSION_API = '2023-06-01';
export const URL_API = 'https://api.anthropic.com/v1/messages';

/** Nombre de la herramienta con la que el modelo entrega el resultado. */
export const HERRAMIENTA = 'registrar_tareas_del_roadmap';

/**
 * Esquema de la respuesta. Se usa como `input_schema` de una herramienta en
 * modo estricto, así que la salida llega siempre validada contra esta forma.
 * Sin `minimum`, `maxLength` ni otras restricciones: no están soportadas.
 */
export const ESQUEMA_SALIDA = {
  type: 'object',
  additionalProperties: false,
  required: ['tareas'],
  properties: {
    tareas: {
      type: 'array',
      description: 'Cada hito, entregable o actividad que aparece en la imagen.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titulo'],
        properties: {
          titulo: { type: 'string', description: 'Nombre de la actividad tal como se lee en la imagen, en castellano.' },
          descripcion: { type: 'string', description: 'Detalle adicional visible en la imagen. Vacío si no hay.' },
          fase: { type: 'string', description: 'Fase, hito, trimestre o carril al que pertenece según la imagen.' },
          fechaInicio: { type: 'string', format: 'date', description: 'Inicio en formato AAAA-MM-DD. Vacío si la imagen no lo indica.' },
          fechaCompromiso: { type: 'string', format: 'date', description: 'Fecha de término comprometida, AAAA-MM-DD.' },
          responsable: { type: 'string', description: 'Nombre del responsable si aparece en la imagen. Vacío si no aparece.' },
          equipo: { type: 'string', description: 'Equipo al que se asigna, si la imagen lo indica.' },
          esfuerzoEstimadoH: { type: 'number', description: 'Horas estimadas. 0 si no hay información para estimarlo.' },
          prioridad: { type: 'string', enum: ['baja', 'media', 'alta', 'critica'] },
          cadencia: {
            type: 'string',
            enum: ['ninguna', 'diaria', 'semanal', 'bisemanal', 'quincenal', 'mensual'],
            description: 'Cada cuánto conviene revisar el avance, según el largo y el riesgo de la actividad.',
          },
          confianza: {
            type: 'string',
            enum: ['alta', 'media', 'baja'],
            description: 'Qué tan legible estaba esta actividad en la imagen.',
          },
        },
      },
    },
    avisos: {
      type: 'array',
      description: 'Zonas ilegibles, fechas ambiguas o supuestos que tuviste que hacer.',
      items: { type: 'string' },
    },
  },
};

export const PROMPT_SISTEMA = `Eres un asistente de una oficina de proyectos de software.
Recibes la foto o la captura de un roadmap y la conviertes en actividades de seguimiento.

Reglas:
- Transcribe solo lo que se ve en la imagen. No inventes actividades que no estén.
- Si una fecha aparece como trimestre o mes ("Q2", "marzo"), conviértela a una fecha
  concreta usando el primer día del periodo para el inicio y el último para el término,
  y anótalo en los avisos.
- Si algo está ilegible, incluye la actividad con el texto que alcances a leer, marca
  su confianza como baja y explícalo en los avisos.
- Propón una cadencia de seguimiento coherente con la duración: diaria para lo crítico y
  corto, semanal para lo que dura semanas, bisemanal o mensual para lo que dura meses.
- Escribe todo en castellano, sin traducir los nombres propios de productos o sistemas.
- Entrega el resultado llamando a la herramienta ${HERRAMIENTA}. No respondas con texto suelto.`;

/** Texto que acompaña a la imagen, con el contexto de dónde se van a crear las tareas. */
export function construirInstruccion(contexto = {}) {
  const partes = ['Esta imagen es el roadmap que hay que convertir en actividades de seguimiento.'];
  if (contexto.iniciativa) partes.push(`Iniciativa: ${contexto.iniciativa}.`);
  if (contexto.proyecto) partes.push(`Proyecto donde se cargarán: ${contexto.proyecto}.`);
  if (contexto.equipos && contexto.equipos.length) {
    partes.push(`Equipos disponibles: ${contexto.equipos.join(', ')}.`);
  }
  if (contexto.personas && contexto.personas.length) {
    partes.push(`Personas del equipo: ${contexto.personas.join(', ')}. `
      + 'Usa exactamente estos nombres cuando la imagen indique un responsable.');
  }
  if (contexto.fechaInicio) partes.push(`El roadmap parte el ${contexto.fechaInicio}.`);
  if (contexto.fechaFin) partes.push(`La fecha objetivo de término es el ${contexto.fechaFin}.`);
  if (contexto.notas) partes.push(`Notas de quien sube la imagen: ${contexto.notas}`);
  partes.push(`Hoy es ${contexto.hoy || new Date().toISOString().slice(0, 10)}.`);
  return partes.join(' ');
}

/**
 * Llama a la API de Claude con la imagen y devuelve el objeto ya validado
 * contra ESQUEMA_SALIDA.
 *
 * @param {{datos:string, tipoMime:string}} imagen  base64 sin el prefijo "data:"
 * @param {object} contexto  ver construirInstruccion
 * @param {{claveApi:string, modelo?:string, señal?:AbortSignal}} opciones
 * @returns {Promise<{tareas:Array, avisos:string[]}>}
 */
export async function extraerConClaude(imagen, contexto, opciones) {
  if (!opciones || !opciones.claveApi) {
    throw new Error('Falta la clave de API de Anthropic.');
  }

  const cuerpo = {
    model: opciones.modelo || MODELO,
    max_tokens: 16000,
    system: PROMPT_SISTEMA,
    // Ante una negativa del clasificador de seguridad, el servidor reintenta
    // solo con otro modelo en vez de devolver la respuesta vacía.
    fallbacks: 'default',
    tools: [{
      name: HERRAMIENTA,
      description: 'Registra las actividades de seguimiento leídas en la imagen del roadmap.',
      input_schema: ESQUEMA_SALIDA,
      strict: true,
    }],
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: imagen.tipoMime, data: imagen.datos },
        },
        { type: 'text', text: construirInstruccion(contexto) },
      ],
    }],
  };

  const respuesta = await fetch(URL_API, {
    method: 'POST',
    signal: opciones.señal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': opciones.claveApi,
      'anthropic-version': VERSION_API,
      'anthropic-beta': 'server-side-fallback-2026-07-01',
      // Sin servidor propio, el navegador necesita este permiso explícito.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(cuerpo),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '');
    throw new Error(`La API respondió ${respuesta.status}. ${recortarError(detalle)}`);
  }

  const mensaje = await respuesta.json();

  if (mensaje.stop_reason === 'refusal') {
    throw new Error('El modelo declinó procesar esta imagen. Prueba con otra captura del roadmap.');
  }
  if (mensaje.stop_reason === 'max_tokens') {
    throw new Error('La respuesta quedó cortada por longitud. Sube el roadmap por partes.');
  }

  const bloque = (mensaje.content || []).find((b) => b.type === 'tool_use' && b.name === HERRAMIENTA);
  if (!bloque) {
    const texto = (mensaje.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ');
    throw new Error(`El modelo no devolvió actividades. ${texto.slice(0, 200)}`);
  }

  return {
    tareas: Array.isArray(bloque.input.tareas) ? bloque.input.tareas : [],
    avisos: Array.isArray(bloque.input.avisos) ? bloque.input.avisos : [],
  };
}

function recortarError(texto) {
  try {
    const objeto = JSON.parse(texto);
    return (objeto.error && objeto.error.message) ? objeto.error.message : texto.slice(0, 200);
  } catch {
    return texto.slice(0, 200);
  }
}
