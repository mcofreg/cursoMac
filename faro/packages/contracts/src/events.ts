import { z } from 'zod';
import { formato, slug } from './primitives.ts';

/**
 * Esquema de telemetría.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO ES LA GARANTÍA DE PRIVACIDAD DE LA PLATAFORMA.
 *
 * No existe ningún campo capaz de transportar una URL, un título de página,
 * un dominio ni contenido del DOM. El esquema es `.strict()`, así que Zod
 * ELIMINA cualquier clave no declarada antes de que el evento salga del
 * navegador — y la API rechaza el lote completo si aparece una.
 *
 * `packages/contracts/src/__tests__/privacidad.test.ts` falla el build si
 * alguien agrega aquí un campo que pueda contener una URL.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const tipoEvento = z.enum([
  /** La extensión está viva. Alimenta la base instalada. */
  'latido',
  /** El service worker descargó, verificó y evaluó la campaña. */
  'entregado',
  /** Elegible pero no mostrada. Ver `motivoSupresion`. */
  'suprimido',
  /** Se renderizó y estuvo visible el tiempo mínimo. */
  'impresion',
  /** Fin del período visible; acarrea `dwellMs`. */
  'fin_vista',
  /** Activación de un botón de acción. */
  'clic',
  /** Confirmación explícita de lectura. El KPI de contingencia. */
  'acuse',
  /** Cierre explícito por parte del ejecutivo. */
  'descarte',
  /** El drawer minimizado se volvió a abrir. */
  'expansion',
  /** Falla del cliente (firma inválida, plantilla desconocida, render). */
  'error',
]);
export type TipoEvento = z.infer<typeof tipoEvento>;

export const motivoSupresion = z.enum([
  'grupo_control',
  'limite_frecuencia',
  'menor_prioridad',
  'sin_pestana_activa',
  'origen_no_permitido',
  'fuera_de_ventana',
  'plantilla_no_soportada',
]);
export type MotivoSupresion = z.infer<typeof motivoSupresion>;

export const variante = z.enum(['target', 'control']);
export type Variante = z.infer<typeof variante>;

/**
 * Un evento tal como lo emite la extensión.
 *
 * `.strict()` no es decorativo: es el filtro que impide que un campo nuevo
 * — introducido por descuido en algún punto de la cadena — llegue al servidor.
 */
export const eventoCliente = z
  .object({
    /** UUID generado en el cliente. Clave de idempotencia de la ingesta. */
    eventId: z.string().uuid(),
    tipo: tipoEvento,

    campaignId: z.string().uuid().nullable().default(null),
    campaignVersion: z.number().int().positive().nullable().default(null),
    variante: variante.nullable().default(null),
    formato: formato.nullable().default(null),

    /** Identificador LÓGICO del botón. Jamás la URL de destino. */
    ctaId: slug.nullable().default(null),

    /** Tiempo visible acumulado. Acotado a 10 minutos: más que eso es una
     *  pestaña olvidada, no atención. */
    dwellMs: z.number().int().min(0).max(600_000).nullable().default(null),

    motivoSupresion: motivoSupresion.nullable().default(null),

    /** Código de error del cliente, de un catálogo cerrado. Nunca texto libre
     *  ni stack traces, que podrían arrastrar URLs. */
    codigoError: z
      .enum([
        'firma_invalida',
        'manifiesto_malformado',
        'plantilla_desconocida',
        'fallo_render',
        'fallo_red',
      ])
      .nullable()
      .default(null),

    /** Reloj del cliente. El servidor guarda además su propia hora de recepción. */
    ocurridoEn: z.string().datetime({ offset: true }),

    /** Sesión de navegador. Permite deduplicar "una vez por sesión". */
    sessionId: z.string().uuid(),

    /** Contador monótono por instalación: detecta pérdida de eventos. */
    seq: z.number().int().min(0),
  })
  .strict();

export type EventoCliente = z.infer<typeof eventoCliente>;

export const loteEventos = z
  .object({
    installId: z.string().uuid(),
    enviadoEn: z.string().datetime({ offset: true }),
    extensionVersion: z.string().max(20),
    eventos: z.array(eventoCliente).min(1).max(50),
  })
  .strict();

export type LoteEventos = z.infer<typeof loteEventos>;

export const respuestaIngesta = z.object({
  aceptados: z.number().int(),
  duplicados: z.number().int(),
  rechazados: z.array(z.object({ eventId: z.string(), motivo: z.string() })),
});

/**
 * Lista blanca explícita de claves permitidas en un evento.
 *
 * El puente entre el iframe sandboxed y el content script la usa para filtrar
 * antes de que el mensaje cruce, de modo que ni siquiera un renderer
 * comprometido pueda adjuntar `location.href` al evento.
 */
export const CLAVES_EVENTO_PERMITIDAS = [
  'eventId',
  'tipo',
  'campaignId',
  'campaignVersion',
  'variante',
  'formato',
  'ctaId',
  'dwellMs',
  'motivoSupresion',
  'codigoError',
  'ocurridoEn',
  'sessionId',
  'seq',
] as const;
