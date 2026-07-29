import type { FastifyRequest } from 'fastify';
import { type Consultable, pool } from './db/pool.ts';

/**
 * Bitácora de auditoría.
 *
 * Es append-only: un trigger de base de datos rechaza UPDATE y DELETE. Registra
 * los cambios de estado de campañas, las publicaciones, las pausas, los cambios
 * de rol — y todo acceso a datos de nivel individual, que es lo que exige el
 * compromiso de privacidad frente a los trabajadores.
 */

export interface EntradaAuditoria {
  accion: string;
  entidad: string;
  entidadId?: string | null;
  antes?: unknown;
  despues?: unknown;
}

export async function auditar(
  request: FastifyRequest,
  entrada: EntradaAuditoria,
  cliente: Consultable = pool,
): Promise<void> {
  const sesion = request.sesion;

  await cliente.query(
    `INSERT INTO audit_log
       (actor_id, actor_email, accion, entidad, entidad_id, antes, despues, ip, user_agent, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      sesion?.usuario.id ?? null,
      sesion?.usuario.email ?? null,
      entrada.accion,
      entrada.entidad,
      entrada.entidadId ?? null,
      entrada.antes === undefined ? null : JSON.stringify(entrada.antes),
      entrada.despues === undefined ? null : JSON.stringify(entrada.despues),
      request.ip,
      String(request.headers['user-agent'] ?? '').slice(0, 500),
      request.id,
    ],
  );
}

/**
 * Registra el acceso a métricas de nivel individual.
 *
 * Separado de `auditar` porque es el caso que Legal va a querer poder consultar
 * por sí solo: "quién miró datos identificables de trabajadores, y cuándo".
 */
export async function auditarAccesoIndividual(
  request: FastifyRequest,
  detalle: { campaignId?: string; filtro?: unknown },
): Promise<void> {
  await auditar(request, {
    accion: 'consulta_datos_individuales',
    entidad: 'analytics',
    entidadId: detalle.campaignId ?? null,
    despues: detalle.filtro,
  });
}
