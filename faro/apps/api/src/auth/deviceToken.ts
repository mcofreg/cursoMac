import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { config } from '../config.ts';

/**
 * JWT de dispositivo (HS256).
 *
 * En producción esto se emite con RS256/EdDSA desde el mismo lugar que
 * gestiona las claves; para el prototipo un HMAC con el secreto de sesión es
 * suficiente y no agrega dependencias. La forma del token es la misma, así que
 * el cambio no toca a los consumidores.
 */

export interface ClaimsDispositivo {
  sub: string; // installId
  eid: string | null; // employeeId
  email: string;
  exp: number;
  jti: string;
}

function base64Url(entrada: Buffer | string): string {
  return Buffer.from(entrada)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function firmar(mensaje: string): string {
  return base64Url(createHmac('sha256', config.SESSION_SECRET).update(mensaje).digest());
}

export function emitirToken(claims: Omit<ClaimsDispositivo, 'exp' | 'jti'>): {
  token: string;
  expiraEn: string;
} {
  const expiraMs = Date.now() + config.DEVICE_TOKEN_TTL_HOURS * 3_600_000;
  const payload: ClaimsDispositivo = {
    ...claims,
    exp: Math.floor(expiraMs / 1000),
    jti: randomUUID(),
  };

  const cabecera = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const cuerpo = base64Url(JSON.stringify(payload));
  const mensaje = `${cabecera}.${cuerpo}`;

  return {
    token: `${mensaje}.${firmar(mensaje)}`,
    expiraEn: new Date(expiraMs).toISOString(),
  };
}

export function verificarToken(token: string): ClaimsDispositivo | null {
  const partes = token.split('.');
  if (partes.length !== 3) return null;

  const [cabecera, cuerpo, firma] = partes as [string, string, string];
  const esperada = firmar(`${cabecera}.${cuerpo}`);

  // Comparación en tiempo constante: una comparación normal filtra información
  // sobre el prefijo correcto a través del tiempo de respuesta.
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const claims = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as ClaimsDispositivo;
    if (claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}
