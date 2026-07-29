import { z } from 'zod';

/**
 * Tipos primitivos compartidos por toda la plataforma.
 *
 * Regla que atraviesa este archivo: ningún campo que llegue desde el panel de
 * administración puede transportar marcado. Los textos son texto plano y se
 * validan aquí, una sola vez, para la extensión, la API y el panel.
 */

/**
 * Caracteres de control (salvo salto de línea y tabulación) y marcas de
 * dirección de texto. Los overrides bidi permiten que un texto se *vea*
 * distinto de lo que realmente es: el ataque clásico contra la revisión humana
 * en un flujo de aprobación como el nuestro.
 *
 * Se construye desde puntos de código para que el archivo fuente no contenga
 * caracteres invisibles.
 */
const RANGOS_PROHIBIDOS: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f],
  [0x7f, 0x9f],
  [0x200e, 0x200f], // marcas de dirección
  [0x202a, 0x202e], // embedding / override bidi
  [0x2066, 0x2069], // isolates bidi
];

function tieneCaracterProhibido(valor: string): boolean {
  for (const caracter of valor) {
    const punto = caracter.codePointAt(0);
    if (punto === undefined) continue;
    for (const [desde, hasta] of RANGOS_PROHIBIDOS) {
      if (punto >= desde && punto <= hasta) return true;
    }
  }
  return false;
}

/**
 * Texto plano. No sanitiza marcado — se lo deja sin ningún significado: el
 * renderer usa `textContent`, así que un `<script>` aquí llega al DOM como
 * texto visible. Esta validación existe para bloquear caracteres de control y
 * ataques de dirección de texto, no para "limpiar HTML".
 */
export const textoPlano = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !tieneCaracterProhibido(v), {
      message: 'El texto contiene caracteres de control o de dirección no permitidos',
    });

/** Identificador legible usado en claves de campaña, plantillas y CTAs. */
export const slug = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Solo minúsculas, dígitos, guion y guion bajo');

export const uuid = z.string().uuid();

/** ISO 8601 con zona horaria. */
export const marcaDeTiempo = z.string().datetime({ offset: true });

/**
 * URL de destino de un botón de acción.
 *
 * La validación de esquema vive aquí; la validación del *host contra la lista
 * blanca corporativa* vive en el servidor (`security/urlAllowlist.ts`), porque
 * la lista es configuración de despliegue y no del contrato.
 */
export const urlSegura = z
  .string()
  .url()
  .max(2048)
  .refine((v) => {
    let u: URL;
    try {
      u = new URL(v);
    } catch {
      return false;
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    // Credenciales embebidas: vector clásico de suplantación visual.
    if (u.username || u.password) return false;
    return true;
  }, 'Solo se permiten URLs http(s) sin credenciales embebidas');

export const severidad = z.enum(['info', 'advertencia', 'critica']);
export type Severidad = z.infer<typeof severidad>;

export const formato = z.enum(['huincha', 'modal', 'drawer']);
export type Formato = z.infer<typeof formato>;

export const categoria = z.enum(['contingencia', 'lanzamiento', 'promocion', 'operativo']);
export type Categoria = z.infer<typeof categoria>;

/** 0 es la máxima urgencia. El arbitraje de superficie usa este orden. */
export const prioridad = z.number().int().min(0).max(3);

export const estadoCampana = z.enum([
  'borrador',
  'en_revision',
  'aprobada',
  'activa',
  'pausada',
  'archivada',
]);
export type EstadoCampana = z.infer<typeof estadoCampana>;

export const rolAdmin = z.enum(['viewer', 'editor', 'approver', 'admin']);
export type RolAdmin = z.infer<typeof rolAdmin>;

/** Jerarquía de roles: cada rol incluye las capacidades de los anteriores. */
export const JERARQUIA_ROLES: Record<RolAdmin, number> = {
  viewer: 0,
  editor: 1,
  approver: 2,
  admin: 3,
};
