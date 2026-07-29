import { createPrivateKey, createPublicKey, sign as signNode, verify as verifyNode } from 'node:crypto';
import { hashContenido } from './canonicalize.ts';

/**
 * Firma en el servidor.
 *
 * En producción la clave privada vive en un KMS/HSM y esta función se sustituye
 * por una llamada al servicio de firma — la interfaz es la misma, y por eso el
 * resto del código no necesita saber dónde está la clave.
 *
 * Formato de firma: IEEE P1363 (r‖s), que es lo que espera WebCrypto. Node por
 * defecto emite DER, así que hay que pedirlo explícitamente; olvidarlo produce
 * firmas que Node valida y el navegador rechaza.
 */

export interface Firmante {
  firmar(contenido: unknown): Promise<{ contentHash: string; signature: string }>;
}

export function crearFirmante(privateKeyPem: string): Firmante {
  const clave = createPrivateKey(privateKeyPem);

  return {
    async firmar(contenido: unknown) {
      const contentHash = await hashContenido(contenido);
      const firma = signNode('sha256', Buffer.from(contentHash, 'utf8'), {
        key: clave,
        dsaEncoding: 'ieee-p1363',
      });
      return { contentHash, signature: firma.toString('base64') };
    },
  };
}

/** Verificación en Node — la usan las pruebas y los scripts de diagnóstico. */
export async function verificarEnNode(
  contenido: unknown,
  hashDeclarado: string,
  firmaBase64: string,
  publicKeyPem: string,
): Promise<boolean> {
  const hashReal = await hashContenido(contenido);
  if (hashReal !== hashDeclarado) return false;

  return verifyNode(
    'sha256',
    Buffer.from(hashReal, 'utf8'),
    { key: createPublicKey(publicKeyPem), dsaEncoding: 'ieee-p1363' },
    Buffer.from(firmaBase64, 'base64'),
  );
}

/** Cuerpo base64 de un PEM, que es lo que la extensión embebe. */
export function pemABase64(pem: string): string {
  return pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
}
