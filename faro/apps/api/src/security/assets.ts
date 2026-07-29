import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../config.ts';

/**
 * Validación de imágenes subidas.
 *
 * Reglas, en orden de importancia:
 *
 *  1. SVG PROHIBIDO. Un SVG es un documento XML que puede contener <script>.
 *     Aceptarlo anularía toda la cadena anti-XSS del resto del sistema.
 *
 *  2. Validación por MAGIC BYTES, no por extensión ni por Content-Type. Ambos
 *     los controla quien sube el archivo.
 *
 *  3. En producción, re-codificación con `sharp` (decodificar → redimensionar →
 *     re-encodear), que destruye payloads poliglotas y metadatos EXIF.
 *     El prototipo valida la estructura y extrae dimensiones sin dependencias
 *     nativas; el punto de extensión está marcado más abajo.
 */

export const MIMES_PERMITIDOS = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type MimePermitido = (typeof MIMES_PERMITIDOS)[number];

export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_DIMENSION = 2000;

export interface ImagenValidada {
  mime: MimePermitido;
  ancho: number;
  alto: number;
  bytes: number;
  sha256: string;
}

export class ErrorImagen extends Error {}

/**
 * Detecta el tipo real leyendo la cabecera del archivo y extrae dimensiones.
 * Si la cabecera no corresponde a ninguno de los tres formatos permitidos, se
 * rechaza — incluyendo cualquier cosa que empiece por `<`, como un SVG o HTML.
 */
export function inspeccionar(datos: Buffer): ImagenValidada {
  if (datos.length === 0) throw new ErrorImagen('El archivo está vacío');
  if (datos.length > MAX_BYTES) {
    throw new ErrorImagen(`La imagen supera ${MAX_BYTES / 1024 / 1024} MB`);
  }

  const dimensiones = leerPng(datos) ?? leerJpeg(datos) ?? leerWebp(datos);

  if (!dimensiones) {
    throw new ErrorImagen(
      'Formato no reconocido. Solo se aceptan PNG, JPEG y WebP. ' +
        'SVG está prohibido porque puede contener scripts.',
    );
  }

  if (dimensiones.ancho > MAX_DIMENSION || dimensiones.alto > MAX_DIMENSION) {
    throw new ErrorImagen(`La imagen excede ${MAX_DIMENSION}px por lado`);
  }

  return {
    ...dimensiones,
    bytes: datos.length,
    sha256: createHash('sha256').update(datos).digest('hex'),
  };
}

function leerPng(datos: Buffer): { mime: MimePermitido; ancho: number; alto: number } | null {
  const FIRMA = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (datos.length < 24) return null;
  if (!FIRMA.every((byte, i) => datos[i] === byte)) return null;

  // El primer chunk de un PNG válido debe ser IHDR, que trae las dimensiones.
  if (datos.subarray(12, 16).toString('ascii') !== 'IHDR') return null;

  return {
    mime: 'image/png',
    ancho: datos.readUInt32BE(16),
    alto: datos.readUInt32BE(20),
  };
}

function leerJpeg(datos: Buffer): { mime: MimePermitido; ancho: number; alto: number } | null {
  if (datos.length < 4) return null;
  if (datos[0] !== 0xff || datos[1] !== 0xd8) return null;

  // Recorre los segmentos hasta encontrar un marcador SOF, que lleva el tamaño.
  let offset = 2;
  while (offset + 9 < datos.length) {
    if (datos[offset] !== 0xff) return null;

    const marcador = datos[offset + 1]!;
    // SOF0..SOF15, excluyendo DHT (c4), JPG (c8) y DAC (cc), que no son SOF.
    const esSof = marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador);

    if (esSof) {
      return {
        mime: 'image/jpeg',
        alto: datos.readUInt16BE(offset + 5),
        ancho: datos.readUInt16BE(offset + 7),
      };
    }

    const longitud = datos.readUInt16BE(offset + 2);
    if (longitud < 2) return null;
    offset += 2 + longitud;
  }

  return null;
}

function leerWebp(datos: Buffer): { mime: MimePermitido; ancho: number; alto: number } | null {
  if (datos.length < 30) return null;
  if (datos.subarray(0, 4).toString('ascii') !== 'RIFF') return null;
  if (datos.subarray(8, 12).toString('ascii') !== 'WEBP') return null;

  const tipo = datos.subarray(12, 16).toString('ascii');

  if (tipo === 'VP8 ') {
    return {
      mime: 'image/webp',
      ancho: datos.readUInt16LE(26) & 0x3fff,
      alto: datos.readUInt16LE(28) & 0x3fff,
    };
  }

  if (tipo === 'VP8L') {
    const bits = datos.readUInt32LE(21);
    return {
      mime: 'image/webp',
      ancho: (bits & 0x3fff) + 1,
      alto: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  if (tipo === 'VP8X') {
    return {
      mime: 'image/webp',
      ancho: (datos.readUIntLE(24, 3) & 0xffffff) + 1,
      alto: (datos.readUIntLE(27, 3) & 0xffffff) + 1,
    };
  }

  return null;
}

/**
 * Punto de extensión para producción.
 *
 * Aquí va la re-codificación con `sharp`:
 *
 *   const salida = await sharp(datos)
 *     .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside',
 *               withoutEnlargement: true })
 *     .toFormat(formatoDestino, { quality: 85 })
 *     .toBuffer();
 *
 * Decodificar y volver a codificar destruye cualquier payload escondido en
 * metadatos o en bytes después del fin de imagen, y elimina el EXIF (que puede
 * traer geolocalización). El prototipo omite la dependencia nativa; la
 * validación estructural de arriba cubre el vector principal.
 */
export function guardar(datos: Buffer, validada: ImagenValidada): { storageKey: string; url: string } {
  const extension = validada.mime.split('/')[1]!.replace('jpeg', 'jpg');
  const storageKey = `${validada.sha256}.${extension}`;

  const directorio = resolve(config.raizProyecto, config.STORAGE_LOCAL_PATH);
  mkdirSync(directorio, { recursive: true });
  writeFileSync(resolve(directorio, storageKey), datos);

  return { storageKey, url: `${config.ASSET_PUBLIC_URL}/${storageKey}` };
}
