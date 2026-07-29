import { z } from 'zod';

/**
 * Gramática de segmentación.
 *
 * Deliberadamente limitada: sin expresiones arbitrarias, sin regex, sin código.
 * El evaluador (`@faro/segmentation`) es un intérprete sin capacidad de cómputo
 * — otra superficie de ataque cerrada, y una regla que un auditor puede leer
 * completa en un minuto.
 */

export const atributoPerfil = z.enum([
  'rol',
  'sucursal',
  'region',
  'area',
  'tags',
  'origenPerfil',
]);
export type AtributoPerfil = z.infer<typeof atributoPerfil>;

export const operador = z.enum([
  'eq',
  'neq',
  'in',
  'not_in',
  'contains',
  'starts_with',
  'exists',
]);
export type Operador = z.infer<typeof operador>;

const valorSimple = z.string().max(80);

export const condicion = z.union([
  z
    .object({
      attr: atributoPerfil,
      op: z.enum(['eq', 'neq', 'contains', 'starts_with']),
      value: valorSimple,
    })
    .strict(),
  z
    .object({
      attr: atributoPerfil,
      op: z.enum(['in', 'not_in']),
      values: z.array(valorSimple).min(1).max(500),
    })
    .strict(),
  z.object({ attr: atributoPerfil, op: z.literal('exists') }).strict(),
]);
export type Condicion = z.infer<typeof condicion>;

/** Árbol de reglas. Profundidad acotada para evitar payloads patológicos. */
export type ReglaAudiencia =
  | Condicion
  | { all: ReglaAudiencia[] }
  | { any: ReglaAudiencia[] }
  | { not: ReglaAudiencia };

export const reglaAudiencia: z.ZodType<ReglaAudiencia> = z.lazy(() =>
  z.union([
    condicion,
    z.object({ all: z.array(reglaAudiencia).min(1).max(20) }).strict(),
    z.object({ any: z.array(reglaAudiencia).min(1).max(20) }).strict(),
    z.object({ not: reglaAudiencia }).strict(),
  ]),
);

/** Audiencia vacía = todo el parque. */
export const audiencia = z
  .object({
    reglas: reglaAudiencia.nullable().default(null),
  })
  .strict();
export type Audiencia = z.infer<typeof audiencia>;

/** Perfil del ejecutivo contra el que se evalúan las reglas. */
export const perfilUsuario = z
  .object({
    rol: z.string().max(64).nullable(),
    sucursal: z.string().max(64).nullable(),
    region: z.string().max(64).nullable(),
    area: z.string().max(64).nullable(),
    tags: z.array(z.string().max(64)).default([]),
    /** 'verificado' viene del directorio; 'auto_declarado' lo eligió la persona. */
    origenPerfil: z.enum(['verificado', 'auto_declarado']).default('auto_declarado'),
  })
  .strict();
export type PerfilUsuario = z.infer<typeof perfilUsuario>;

/**
 * Configuración experimental.
 *
 * `controlPct` en 0 es lo correcto para contingencias: retener información de
 * seguridad operacional a una parte de la red solo para medir es difícil de
 * justificar. Los grupos de control se reservan para promociones.
 */
export const experimento = z
  .object({
    controlPct: z.number().min(0).max(50).default(0),
    rolloutPct: z.number().min(0).max(100).default(100),
    /** Permite re-aleatorizar sin cambiar identificadores. */
    salt: z.string().min(1).max(64).default('v1'),
  })
  .strict();
export type Experimento = z.infer<typeof experimento>;
