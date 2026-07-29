import { hashContenido } from './canonicalize.ts';

/**
 * Verificación de firma en el navegador (WebCrypto).
 *
 * Este es el último control de la cadena de seguridad: aunque alguien
 * comprometiera la API o interceptara el proxy corporativo, no puede inyectar
 * contenido en las páginas del banco sin la clave privada, que vive fuera del
 * servidor de aplicación.
 *
 * Todo fallo es fail-closed. Una firma inválida no muestra nada.
 */

let clavePublicaCacheada: CryptoKey | null = null;

export function base64UrlADatos(entrada: string): Uint8Array {
  const base64 = entrada.replace(/-/g, '+').replace(/_/g, '/');
  const relleno = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const binario = atob(base64 + relleno);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/**
 * Importa la clave pública en formato SPKI base64 (el cuerpo de un PEM, sin
 * cabeceras). Se cachea porque `importKey` se llama en cada sincronización.
 */
export async function importarClavePublica(spkiBase64: string): Promise<CryptoKey> {
  if (clavePublicaCacheada) return clavePublicaCacheada;

  const limpia = spkiBase64.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const bytes = base64UrlADatos(limpia);

  clavePublicaCacheada = await crypto.subtle.importKey(
    'spki',
    bytes as unknown as BufferSource,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  return clavePublicaCacheada;
}

/**
 * Verifica que `firma` corresponda al hash del `contenido` canonicalizado.
 *
 * Recalcula el hash en vez de confiar en el que viene del servidor: si solo
 * verificáramos la firma sobre el hash recibido, un atacante podría cambiar el
 * contenido y dejar intacto el par hash+firma.
 */
export async function verificarCampana(
  contenido: unknown,
  hashDeclarado: string,
  firmaBase64: string,
  clavePublica: CryptoKey,
): Promise<boolean> {
  try {
    const hashReal = await hashContenido(contenido);
    if (hashReal !== hashDeclarado) return false;

    const firma = base64UrlADatos(firmaBase64);
    const mensaje = new TextEncoder().encode(hashReal);

    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      clavePublica,
      firma as unknown as BufferSource,
      mensaje as unknown as BufferSource,
    );
  } catch {
    return false;
  }
}

/** Solo para pruebas: descarta la clave cacheada. */
export function limpiarCacheDeClave(): void {
  clavePublicaCacheada = null;
}
