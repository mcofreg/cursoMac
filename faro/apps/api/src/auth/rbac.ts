import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { JERARQUIA_ROLES, type RolAdmin } from '@faro/contracts';
import { consultarUno, pool } from '../db/pool.ts';
import { config } from '../config.ts';

/**
 * Sesiones del panel y control de acceso por rol.
 *
 * La sesión vive en una cookie httpOnly respaldada por la base, no en un JWT
 * en el cliente: cerrar sesión y revocar accesos tiene que surtir efecto de
 * inmediato, y con un JWT autocontenido no lo tiene.
 */

export interface UsuarioAdmin {
  id: string;
  email: string;
  nombre: string;
  rol: RolAdmin;
}

export interface SesionAdmin {
  usuario: UsuarioAdmin;
  csrfToken: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    sesion?: SesionAdmin;
  }
}

const NOMBRE_COOKIE = 'faro_sesion';
const DURACION_MS = 8 * 3_600_000;

export async function crearSesion(userId: string, reply: FastifyReply): Promise<string> {
  const id = randomUUID();
  const csrfToken = randomBytes(24).toString('base64url');
  const expira = new Date(Date.now() + DURACION_MS);

  await pool.query(
    'INSERT INTO admin_sessions (id, user_id, csrf_token, expira_en) VALUES ($1, $2, $3, $4)',
    [id, userId, csrfToken, expira],
  );
  await pool.query('UPDATE admin_users SET ultimo_login = now() WHERE id = $1', [userId]);

  reply.setCookie(NOMBRE_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.NODE_ENV === 'production',
    path: '/',
    maxAge: DURACION_MS / 1000,
  });

  return csrfToken;
}

export async function cerrarSesion(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const id = request.cookies[NOMBRE_COOKIE];
  if (id) await pool.query('DELETE FROM admin_sessions WHERE id = $1', [id]);
  reply.clearCookie(NOMBRE_COOKIE, { path: '/' });
}

export async function cargarSesion(request: FastifyRequest): Promise<SesionAdmin | null> {
  const id = request.cookies[NOMBRE_COOKIE];
  if (!id) return null;

  const fila = await consultarUno<{
    csrf_token: string;
    user_id: string;
    email: string;
    nombre: string;
    rol: RolAdmin;
    activo: boolean;
  }>(
    `SELECT s.csrf_token, u.id AS user_id, u.email, u.nombre, u.rol, u.activo
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expira_en > now()`,
    [id],
  );

  if (!fila || !fila.activo) return null;

  return {
    csrfToken: fila.csrf_token,
    usuario: { id: fila.user_id, email: fila.email, nombre: fila.nombre, rol: fila.rol },
  };
}

export class ErrorAutorizacion extends Error {
  readonly codigo: number;

  constructor(codigo: number, mensaje: string) {
    super(mensaje);
    this.codigo = codigo;
  }
}

/**
 * Exige sesión válida, rol mínimo y — en mutaciones — token CSRF.
 *
 * El CSRF se verifica aquí y no en un plugin aparte para que sea imposible
 * registrar una ruta mutante sin protección: si usa `requiereRol`, la tiene.
 */
export function requiereRol(rolMinimo: RolAdmin) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const sesion = await cargarSesion(request);

    if (!sesion) {
      reply.code(401).send({ error: 'Sesión no válida o expirada' });
      return;
    }

    if (JERARQUIA_ROLES[sesion.usuario.rol] < JERARQUIA_ROLES[rolMinimo]) {
      reply.code(403).send({
        error: `Se requiere rol ${rolMinimo}; el usuario tiene ${sesion.usuario.rol}`,
      });
      return;
    }

    const esMutacion = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (esMutacion) {
      const enviado = request.headers['x-csrf-token'];
      if (enviado !== sesion.csrfToken) {
        reply.code(403).send({ error: 'Token CSRF ausente o inválido' });
        return;
      }
    }

    request.sesion = sesion;
  };
}
