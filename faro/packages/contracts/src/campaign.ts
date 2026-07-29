import { z } from 'zod';
import { audiencia, experimento } from './audience.ts';
import {
  categoria,
  estadoCampana,
  formato,
  marcaDeTiempo,
  prioridad,
  slug,
  textoPlano,
} from './primitives.ts';
import { contenidoCampana } from './templates/registry.ts';

/** Cómo y cuántas veces se muestra una campaña. */
export const presentacion = z
  .object({
    formato,
    /** Si false, la superficie no ofrece botón de cierre. */
    descartable: z.boolean().default(true),
    /** Exige confirmación explícita de lectura. El KPI de contingencia. */
    exigeAcuse: z.boolean().default(false),
    frecuencia: z
      .object({
        maxPorDia: z.number().int().min(1).max(50).default(3),
        intervaloMinimoMin: z.number().int().min(0).max(1440).default(60),
        unaVezPorSesion: z.boolean().default(false),
        /** Si se descarta, cuánto esperar antes de volver a mostrarla. */
        reaparecerTrasDescarteMin: z.number().int().min(0).max(10080).default(240),
        /** Ignora los límites anteriores hasta que la persona confirme lectura. */
        insistirHastaAcuse: z.boolean().default(false),
      })
      .strict()
      .default({}),
    /**
     * Restringe la campaña a un subconjunto de los orígenes ya permitidos por
     * el manifiesto. Nunca los amplía: es una lista blanca dentro de otra.
     */
    origenesPermitidos: z.array(z.string().max(200)).max(50).default([]),
  })
  .strict();
export type Presentacion = z.infer<typeof presentacion>;

/** Campaña tal como la ve el panel de administración. */
export const campana = z.object({
  id: z.string().uuid(),
  key: slug,
  nombre: textoPlano(1, 120),
  categoria,
  estado: estadoCampana,
  prioridad,
  versionActual: z.number().int().min(0),
  iniciaEn: marcaDeTiempo.nullable(),
  terminaEn: marcaDeTiempo.nullable(),
  killSwitch: z.boolean(),
  esEmergencia: z.boolean(),
  emergenciaExpiraEn: marcaDeTiempo.nullable(),
  creadoEn: marcaDeTiempo,
  actualizadoEn: marcaDeTiempo,
});
export type Campana = z.infer<typeof campana>;

/** Cuerpo con el que el panel crea o edita el contenido de una versión. */
export const borradorVersion = z
  .object({
    contenido: contenidoCampana,
    presentacion,
    audiencia,
    experimento,
  })
  .strict();
export type BorradorVersion = z.infer<typeof borradorVersion>;

// ── Manifiesto que consume la extensión ──────────────────────────────────────

/**
 * Campaña ya firmada, tal como viaja al navegador.
 *
 * La firma cubre `contentHash`, que se calcula sobre la serialización canónica
 * de contenido + presentación + audiencia + experimento. Una campaña sin firma
 * válida se descarta: quien comprometa la API o intercepte el proxy corporativo
 * no puede inyectar contenido.
 */
export const campanaFirmada = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  key: slug,
  categoria,
  prioridad,
  contenido: contenidoCampana,
  presentacion,
  audiencia,
  experimento,
  iniciaEn: marcaDeTiempo.nullable(),
  terminaEn: marcaDeTiempo.nullable(),
  contentHash: z.string().length(64),
  signature: z.string().min(1).max(512),
});
export type CampanaFirmada = z.infer<typeof campanaFirmada>;

export const manifiesto = z.object({
  generadoEn: marcaDeTiempo,
  etag: z.string(),
  /**
   * Interruptor global. El botón rojo para "la extensión está rompiendo el CRM":
   * la extensión desmonta todo y solo mantiene los latidos.
   */
  killGlobal: z.boolean(),
  /** Segundos de validez de la caché local si la sincronización falla. */
  ttlSegundos: z.number().int().positive(),
  campanas: z.array(campanaFirmada),
});
export type Manifiesto = z.infer<typeof manifiesto>;

/** Configuración operacional que el servidor puede ajustar sin desplegar. */
export const configuracionCliente = z.object({
  pollSegundos: z.number().int().min(30).max(3600),
  /** Con una contingencia P0 activa, el polling baja a este valor. */
  pollRapidoSegundos: z.number().int().min(30).max(600),
  latidoSegundos: z.number().int().min(60),
  flushEventosSegundos: z.number().int().min(30),
  maxLote: z.number().int().min(1).max(50),
});
export type ConfiguracionCliente = z.infer<typeof configuracionCliente>;

export const sesionDispositivo = z.object({
  deviceToken: z.string(),
  expiraEn: marcaDeTiempo,
  usuario: z.object({
    email: z.string().email(),
    nombre: z.string(),
    rol: z.string().nullable(),
    sucursal: z.string().nullable(),
    region: z.string().nullable(),
    area: z.string().nullable(),
    tags: z.array(z.string()),
    origenPerfil: z.enum(['verificado', 'auto_declarado']),
    /** Si true, la extensión pide auto-declarar sucursal antes de operar. */
    requiereCompletarPerfil: z.boolean(),
  }),
  config: configuracionCliente,
});
export type SesionDispositivo = z.infer<typeof sesionDispositivo>;
