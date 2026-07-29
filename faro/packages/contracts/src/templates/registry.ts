import { z } from 'zod';
import { formato, severidad, slug, textoPlano, urlSegura } from '../primitives.ts';

/**
 * Catálogo cerrado de plantillas.
 *
 * Esta es la pieza que hace imposible que un administrador inyecte HTML o
 * JavaScript: no existe ningún campo capaz de transportar marcado, y el
 * renderer de la extensión solo sabe dibujar estas formas exactas.
 *
 * Añadir una plantilla nueva exige publicar una versión nueva de la extensión.
 * Es una restricción de Manifest V3 (prohíbe ejecutar código remoto) y también
 * la mejor defensa anti-XSS disponible.
 */

/** Íconos permitidos → resuelven a un SVG empaquetado dentro de la extensión. */
export const icono = z.enum(['alerta', 'info', 'herramientas', 'regalo', 'reloj', 'candado']);
export type Icono = z.infer<typeof icono>;

/**
 * Acción de un botón. `kind` decide qué hace el service worker; el renderer
 * sandboxed nunca navega por su cuenta.
 */
export const accion = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('abrir_url'), url: urlSegura }),
  z.object({ kind: z.literal('abrir_drawer') }),
  z.object({ kind: z.literal('confirmar_lectura') }),
  z.object({ kind: z.literal('cerrar') }),
]);
export type Accion = z.infer<typeof accion>;

export const cta = z.object({
  /** Identificador lógico que viaja en la telemetría. Nunca se registra la URL. */
  id: slug,
  label: textoPlano(1, 24),
  accion,
});
export type Cta = z.infer<typeof cta>;

/** Referencia a una imagen ya subida, re-codificada y servida por el backend. */
export const imagen = z.object({
  assetId: z.string().uuid(),
  url: z.string().url(),
  altText: textoPlano(1, 120),
  ancho: z.number().int().positive(),
  alto: z.number().int().positive(),
});

// ── Plantilla 1: huincha superior ────────────────────────────────────────────

export const contenidoHuincha = z
  .object({
    severidad,
    icono,
    titulo: textoPlano(1, 80),
    /**
     * Admite marcado restringido propio (*negrita*, _cursiva_) que el renderer
     * convierte en NODOS DOM, nunca en HTML. Ver `packages/contracts/src/richtext.ts`.
     */
    cuerpo: textoPlano(0, 240).optional().default(''),
    cta: cta.nullable().default(null),
  })
  .strict();

// ── Plantilla 2: modal a pantalla completa ───────────────────────────────────

export const contenidoModal = z
  .object({
    severidad,
    icono,
    titulo: textoPlano(1, 80),
    cuerpo: textoPlano(0, 600).optional().default(''),
    imagen: imagen.nullable().default(null),
    ctaPrimario: cta.nullable().default(null),
    ctaSecundario: cta.nullable().default(null),
    /** Texto del botón de confirmación de lectura, si la campaña la exige. */
    etiquetaConfirmacion: textoPlano(1, 32).optional().default('Entendido'),
  })
  .strict();

// ── Plantilla 3: drawer lateral tipo chat ────────────────────────────────────

export const burbuja = z
  .object({
    texto: textoPlano(1, 300),
    imagen: imagen.nullable().default(null),
  })
  .strict();

export const contenidoDrawer = z
  .object({
    severidad,
    icono,
    titulo: textoPlano(1, 60),
    subtitulo: textoPlano(0, 80).optional().default(''),
    burbujas: z.array(burbuja).min(1).max(6),
    cta: cta.nullable().default(null),
  })
  .strict();

// ── Registro ─────────────────────────────────────────────────────────────────

export const claveePlantilla = z.enum([
  'huincha_alerta_v1',
  'modal_anuncio_v1',
  'drawer_conversacion_v1',
]);
export type ClavePlantilla = z.infer<typeof claveePlantilla>;

export interface DefinicionPlantilla {
  key: ClavePlantilla;
  nombre: string;
  descripcion: string;
  formato: z.infer<typeof formato>;
  esquema: z.ZodTypeAny;
  /** La extensión ignora plantillas que su versión no sabe dibujar. */
  minVersionExtension: string;
}

export const PLANTILLAS: Record<ClavePlantilla, DefinicionPlantilla> = {
  huincha_alerta_v1: {
    key: 'huincha_alerta_v1',
    nombre: 'Huincha superior',
    descripcion:
      'Franja fija en el tope de la página. Formato por defecto para contingencias.',
    formato: 'huincha',
    esquema: contenidoHuincha,
    minVersionExtension: '0.1.0',
  },
  modal_anuncio_v1: {
    key: 'modal_anuncio_v1',
    nombre: 'Modal a pantalla completa',
    descripcion:
      'Cubre el área de contenido. Para lanzamientos y avisos que exigen confirmación.',
    formato: 'modal',
    esquema: contenidoModal,
    minVersionExtension: '0.1.0',
  },
  drawer_conversacion_v1: {
    key: 'drawer_conversacion_v1',
    nombre: 'Drawer lateral tipo chat',
    descripcion: 'Panel lateral con burbujas en secuencia. Para promociones.',
    formato: 'drawer',
    esquema: contenidoDrawer,
    minVersionExtension: '0.1.0',
  },
};

/** Contenido de campaña: unión discriminada por la plantilla elegida. */
export const contenidoCampana = z.discriminatedUnion('templateKey', [
  z.object({ templateKey: z.literal('huincha_alerta_v1'), campos: contenidoHuincha }),
  z.object({ templateKey: z.literal('modal_anuncio_v1'), campos: contenidoModal }),
  z.object({ templateKey: z.literal('drawer_conversacion_v1'), campos: contenidoDrawer }),
]);
export type ContenidoCampana = z.infer<typeof contenidoCampana>;

export function formatoDePlantilla(key: ClavePlantilla): z.infer<typeof formato> {
  return PLANTILLAS[key].formato;
}
