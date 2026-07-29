import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { reglasASql } from '@faro/segmentation';
import { consultar, consultarUno, pool } from '../db/pool.ts';
import { requiereRol } from '../auth/rbac.ts';
import { auditarAccesoIndividual } from '../audit.ts';
import { config } from '../config.ts';

/**
 * Analítica.
 *
 * Definiciones operacionales, que importan más que las consultas:
 *
 *  · Instalado activo   dispositivo con latido en los últimos 7 días.
 *  · Elegible           perfil que satisface la audiencia, sobre activos 7d.
 *  · Entregado          el service worker descargó, verificó y evaluó.
 *  · Alcance            dispositivos únicos con al menos una impresión.
 *  · Impresión          renderizada, ≥50% visible, pestaña en primer plano, ≥1s.
 *  · Acuse              confirmación explícita de lectura. El KPI de contingencia.
 *
 * Las métricas "únicas" usan COUNT(DISTINCT install_id) y se reportan siempre
 * junto al total: confundir impresiones con alcance es el error más común al
 * presentar estos números.
 */

export async function rutasAnalytics(app: FastifyInstance): Promise<void> {
  // ── Adopción / base instalada ────────────────────────────────────────────

  app.get('/v1/analytics/adopcion', { preHandler: requiereRol('viewer') }, async () => {
    const resumen = await consultarUno<{
      total: number;
      activos_7d: number;
      activos_30d: number;
      revocados: number;
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE revocado_en IS NULL)::int                                        AS total,
        COUNT(*) FILTER (WHERE revocado_en IS NULL AND ultimo_visto > now() - interval '7 days')::int  AS activos_7d,
        COUNT(*) FILTER (WHERE revocado_en IS NULL AND ultimo_visto > now() - interval '30 days')::int AS activos_30d,
        COUNT(*) FILTER (WHERE revocado_en IS NOT NULL)::int                                    AS revocados
      FROM installs
    `);

    const [porSucursal, porRegion, porVersion, porOrigenPerfil] = await Promise.all([
      consultar(`
        SELECT COALESCE(p.sucursal, '(sin dato)') AS clave, COUNT(*)::int AS n
          FROM installs i LEFT JOIN install_profiles p ON p.install_id = i.install_id
         WHERE i.revocado_en IS NULL AND i.ultimo_visto > now() - interval '7 days'
         GROUP BY 1 ORDER BY 2 DESC LIMIT 30`),
      consultar(`
        SELECT COALESCE(p.region, '(sin dato)') AS clave, COUNT(*)::int AS n
          FROM installs i LEFT JOIN install_profiles p ON p.install_id = i.install_id
         WHERE i.revocado_en IS NULL AND i.ultimo_visto > now() - interval '7 days'
         GROUP BY 1 ORDER BY 2 DESC`),
      consultar(`
        SELECT COALESCE(extension_version, '(desconocida)') AS clave, COUNT(*)::int AS n
          FROM installs WHERE revocado_en IS NULL AND ultimo_visto > now() - interval '7 days'
         GROUP BY 1 ORDER BY 2 DESC`),
      // La brecha entre 'verificado' y 'auto_declarado' es la señal de cuánto
      // hay que confiar en la segmentación.
      consultar(`
        SELECT p.origen_perfil::text AS clave, COUNT(*)::int AS n
          FROM installs i JOIN install_profiles p ON p.install_id = i.install_id
         WHERE i.revocado_en IS NULL AND i.ultimo_visto > now() - interval '7 days'
         GROUP BY 1`),
    ]);

    return { resumen, porSucursal, porRegion, porVersion, porOrigenPerfil };
  });

  // ── Embudo de una campaña ────────────────────────────────────────────────

  app.get('/v1/analytics/campaigns/:id/funnel', { preHandler: requiereRol('viewer') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { cortarPor } = z
      .object({ cortarPor: z.enum(['sucursal', 'region', 'rol']).optional() })
      .parse(request.query);

    const campana = await consultarUno<{ version_actual: number; audiencia: unknown; nombre: string }>(
      `SELECT c.version_actual, c.nombre, v.audiencia
         FROM campaigns c
         LEFT JOIN campaign_versions v ON v.campaign_id = c.id AND v.version = c.version_actual
        WHERE c.id = $1`,
      [id],
    );
    if (!campana) return reply.code(404).send({ error: 'Campaña no encontrada' });

    // Denominador: elegibles según la MISMA gramática que evalúa la extensión.
    const reglas = (campana.audiencia as { reglas?: unknown } | null)?.reglas ?? null;
    const { sql: sqlAudiencia, parametros } = reglasASql(reglas as never);

    const elegibles = await consultarUno<{ n: number }>(
      `SELECT COUNT(*)::int AS n
         FROM install_profiles p
         JOIN installs i ON i.install_id = p.install_id
        WHERE i.revocado_en IS NULL
          AND i.ultimo_visto > now() - interval '7 days'
          AND ${sqlAudiencia}`,
      parametros,
    );

    const porVariante = await consultar<{
      variante: string;
      entregados: number;
      impresiones: number;
      alcance: number;
      clics: number;
      clics_unicos: number;
      acuses: number;
      descartes: number;
      suprimidos: number;
      dwell_p50: number | null;
    }>(
      `SELECT
         COALESCE(variante, 'target')                                  AS variante,
         COUNT(DISTINCT install_id) FILTER (WHERE tipo = 'entregado')::int AS entregados,
         COUNT(*)                   FILTER (WHERE tipo = 'impresion')::int AS impresiones,
         COUNT(DISTINCT install_id) FILTER (WHERE tipo = 'impresion')::int AS alcance,
         COUNT(*)                   FILTER (WHERE tipo = 'clic')::int      AS clics,
         COUNT(DISTINCT install_id) FILTER (WHERE tipo = 'clic')::int      AS clics_unicos,
         COUNT(DISTINCT install_id) FILTER (WHERE tipo = 'acuse')::int     AS acuses,
         COUNT(DISTINCT install_id) FILTER (WHERE tipo = 'descarte')::int  AS descartes,
         COUNT(DISTINCT install_id) FILTER (WHERE tipo = 'suprimido')::int AS suprimidos,
         PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY dwell_ms)
           FILTER (WHERE tipo = 'fin_vista' AND dwell_ms IS NOT NULL)::int AS dwell_p50
       FROM events WHERE campaign_id = $1 GROUP BY 1`,
      [id],
    );

    // Los motivos de supresión son diagnóstico, no ruido: dicen si el problema
    // es saturación de frecuencia o que nadie tenía Chrome en primer plano.
    const supresiones = await consultar(
      `SELECT COALESCE(motivo_supresion, '(sin motivo)') AS motivo, COUNT(*)::int AS n
         FROM events WHERE campaign_id = $1 AND tipo = 'suprimido' GROUP BY 1 ORDER BY 2 DESC`,
      [id],
    );

    let cortes: unknown[] = [];
    if (cortarPor) {
      const columna = { sucursal: 'sucursal', region: 'region', rol: 'rol' }[cortarPor];
      cortes = await consultar(
        `SELECT COALESCE(${columna}, '(sin dato)') AS clave,
                COUNT(DISTINCT install_id) FILTER (WHERE tipo = 'impresion')::int AS alcance,
                COUNT(DISTINCT install_id) FILTER (WHERE tipo = 'clic')::int      AS clics_unicos,
                COUNT(DISTINCT install_id) FILTER (WHERE tipo = 'acuse')::int     AS acuses
           FROM events WHERE campaign_id = $1 AND COALESCE(variante,'target') = 'target'
          GROUP BY 1 ORDER BY 2 DESC LIMIT 50`,
        [id],
      );
    }

    const target = porVariante.find((v) => v.variante === 'target');
    const control = porVariante.find((v) => v.variante === 'control');

    return {
      campana: { id, nombre: campana.nombre, version: campana.version_actual },
      elegibles: elegibles?.n ?? 0,
      target: target ?? vacio('target'),
      control: control ?? vacio('control'),
      ctr: target && target.alcance > 0 ? target.clics_unicos / target.alcance : 0,
      tasaAcuse: target && target.alcance > 0 ? target.acuses / target.alcance : 0,
      supresiones,
      cortes,
      /**
       * Advertencia metodológica que viaja con los datos, para que no se pierda
       * al llegar a una presentación: el CTR del grupo de control no existe,
       * porque por diseño no ve nada. El control sirve para medir
       * incrementalidad sobre un KPI externo (llamadas a mesa de ayuda,
       * tickets), no para comparar métricas internas.
       */
      nota: control && control.entregados > 0
        ? 'El grupo de control no registra impresiones por diseño. Las métricas internas (CTR, acuse, tiempo visible) no son comparables entre target y control; para medir incrementalidad hay que cruzar con un KPI externo.'
        : null,
    };
  });

  // ── Serie temporal ───────────────────────────────────────────────────────

  app.get('/v1/analytics/campaigns/:id/timeseries', { preHandler: requiereRol('viewer') }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    return {
      puntos: await consultar(
        `SELECT date_trunc('hour', recibido_en) AS hora,
                COUNT(DISTINCT install_id) FILTER (WHERE tipo = 'impresion')::int AS alcance,
                COUNT(*) FILTER (WHERE tipo = 'clic')::int  AS clics,
                COUNT(*) FILTER (WHERE tipo = 'acuse')::int AS acuses
           FROM events
          WHERE campaign_id = $1 AND recibido_en > now() - interval '7 days'
          GROUP BY 1 ORDER BY 1`,
        [id],
      ),
    };
  });

  // ── Datos de nivel individual ────────────────────────────────────────────

  /**
   * Acceso restringido a rol `approver` y con cada consulta auditada.
   *
   * Además puede desactivarse por completo con AGGREGATE_METRICS_ONLY, sin
   * tocar código: es el interruptor que permite cumplir si Legal veta el
   * seguimiento individual.
   */
  app.get('/v1/analytics/campaigns/:id/interacciones', { preHandler: requiereRol('approver') }, async (request, reply) => {
    if (config.AGGREGATE_METRICS_ONLY) {
      return reply.code(403).send({
        error: 'La plataforma está configurada para exponer solo métricas agregadas',
      });
    }

    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { limite } = z.object({ limite: z.coerce.number().int().max(500).default(100) }).parse(request.query);

    await auditarAccesoIndividual(request, { campaignId: id, filtro: { limite } });

    return {
      interacciones: await consultar(
        `SELECT employee_id, sucursal, region, rol, tipo::text AS tipo, cta_id,
                dwell_ms, variante, ocurrido_en
           FROM events
          WHERE campaign_id = $1 AND tipo IN ('impresion','clic','acuse','descarte')
          ORDER BY recibido_en DESC LIMIT $2`,
        [id, limite],
      ),
    };
  });

  /**
   * Asignaciones target/control para cruzar con KPIs externos.
   *
   * El identificador va con hash: quien analice la incrementalidad no necesita
   * saber de quién se trata, solo poder unir dos tablas por la misma clave.
   */
  app.get('/v1/analytics/campaigns/:id/asignaciones.csv', { preHandler: requiereRol('approver') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await auditarAccesoIndividual(request, { campaignId: id, filtro: { export: 'asignaciones' } });

    const filas = await consultar<{ hash: string; sucursal: string | null; variante: string }>(
      `SELECT DISTINCT encode(digest(employee_id, 'sha256'), 'hex') AS hash,
              sucursal, COALESCE(variante, 'target') AS variante
         FROM events WHERE campaign_id = $1 AND employee_id IS NOT NULL`,
      [id],
    );

    const csv = ['employee_hash,sucursal,variante']
      .concat(filas.map((f) => `${f.hash},${f.sucursal ?? ''},${f.variante}`))
      .join('\n');

    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="asignaciones-${id}.csv"`)
      .send(csv);
  });

  // ── Recálculo de agregados ───────────────────────────────────────────────

  app.post('/v1/analytics/rollups', { preHandler: requiereRol('admin') }, async () => {
    const filas = await consultarUno<{ recalcular_metricas: number }>(
      `SELECT recalcular_metricas(now() - interval '26 hours', now() + interval '1 hour')`,
    );
    return { filasAgregadas: filas?.recalcular_metricas ?? 0 };
  });
}

function vacio(variante: string) {
  return {
    variante,
    entregados: 0,
    impresiones: 0,
    alcance: 0,
    clics: 0,
    clics_unicos: 0,
    acuses: 0,
    descartes: 0,
    suprimidos: 0,
    dwell_p50: null,
  };
}

/** Mantiene las particiones al día y purga lo que excede la retención. */
export async function mantenimientoDiario(): Promise<void> {
  await pool.query('SELECT asegurar_particiones_eventos(7)');
  await pool.query('SELECT purgar_eventos_antiguos($1)', [config.EVENT_RETENTION_DAYS]);
  await pool.query('SELECT purgar_dedup(14)');
}
