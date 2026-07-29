/**
 * Constantes de compilación.
 *
 * `CLAVE_PUBLICA_FIRMA` se inyecta en el build desde keys/signing-public.b64.
 * Va embebida en el binario de la extensión a propósito: si viniera del
 * servidor, quien comprometiera el servidor podría sustituirla y toda la
 * verificación de firma dejaría de servir para nada.
 */

declare const __API_BASE__: string;
declare const __VERSION__: string;
declare const __CLAVE_PUBLICA__: string;

export const API_BASE = __API_BASE__;
export const VERSION_EXTENSION = __VERSION__;
export const CLAVE_PUBLICA_FIRMA = __CLAVE_PUBLICA__;

/** Alto de la huincha, en píxeles. El content script empuja la página con esto. */
export const ALTO_HUINCHA = 44;
