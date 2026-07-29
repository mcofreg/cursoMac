import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  PLANTILLAS,
  audiencia as esquemaAudiencia,
  categoria,
  formatoDePlantilla,
  prioridad as esquemaPrioridad,
  reglaAudiencia,
  slug,
  textoPlano,
  type ClavePlantilla,
} from '@faro/contracts';
import { reglasASql } from '@faro/segmentation';
import { consultar, consultarUno, pool } from '../db/pool.ts';
import { cargarSesion, cerrarSesion, crearSesion, requiereRol } from '../auth/rbac.ts';
import { buscarUsuarioDevPorEmail, USUARIOS_DEV } from '../auth/usuarios-dev.ts';
import { auditar } from '../audit.ts';
import {
  ErrorCampana,
  aprobar,
  crearVersion,
  enviarARevision,
  pausar,
  publicar,
  publicarEmergencia,
  validarBorrador,
} from '../services/campanas.ts';
import { invalidarManifiesto, leerKillGlobal } from '../services/manifiesto.ts';
import { ErrorImagen, guardar, inspeccionar } from '../security/assets.ts';
import { config } from '../config.ts';

export async function rutasAdmin(app: FastifyInstance): Promise<void> {
  // Traduce los errores de dominio a respuestas HTTP legibles.
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ErrorCampana) return reply.code(error.codigo).send({ error: error.message });
    if (error instanceof ErrorImagen) return reply.code(400).send({ error: error.message });
    if (error instanceof z.ZodError) {
      return reply.code(400).send({ error: 'Datos inválidos', detalle: error.issues.slice(0, 5) });
    }
    app.log.error(error);

    // Los errores no previstos se devuelven como 500 con un mensaje genérico:
    // filtrar el mensaje interno al cliente puede revelar detalles del esquema
    // o de la infraestructura.
    const conEstado = error as { statusCode?: number; message?: string };
    const estado = conEstado.statusCode ?? 500;

    return reply.code(estado).send({
      error: estado < 500 ? (conEstado.message ?? 'Solicitud inválida') : 'Error interno',
    });
  });

  // ── Autenticación del panel ──────────────────────────────────────────────

  app.get('/v1/admin/usuarios-dev', async (_request, reply) => {
    if (config.AUTH_MODE !== 'dev') return reply.code(404).send({ error: 'No disponible' });
    return {
      usuarios: USUARIOS_DEV.filter((u) => u.rolAdmin !== null).map((u) => ({
        email: u.email,
        nombre: u.nombre,
        rolAdmin: u.rolAdmin,
      })),
    };
  });

  app.post('/v1/admin/login', async (request, reply) => {
    if (config.AUTH_MODE !== 'dev') {
      // En producción esta ruta redirige al IdP corporativo (OIDC + PKCE).
      return reply.code(501).send({ error: 'Modo OIDC no configurado en este entorno' });
    }

    const { email } = z.object({ email: z.string().email() }).parse(request.body);
    const usuarioDev = buscarUsuarioDevPorEmail(email);
    if (!usuarioDev?.rolAdmin) {
      return reply.code(401).send({ error: 'El usuario no tiene acceso al panel' });
    }

    const usuario = await consultarUno<{ id: string; email: string; nombre: string; rol: string }>(
      `INSERT INTO admin_users (idp_subject, email, nombre, rol)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (idp_subject) DO UPDATE SET nombre = EXCLUDED.nombre
       RETURNING id, email, nombre, rol::text AS rol`,
      [usuarioDev.sub, usuarioDev.email, usuarioDev.nombre, usuarioDev.rolAdmin],
    );

    const csrfToken = await crearSesion(usuario!.id, reply);
    return { usuario, csrfToken };
  });

  app.post('/v1/admin/logout', async (request, reply) => {
    await cerrarSesion(request, reply);
    return { ok: true };
  });

  app.get('/v1/admin/yo', async (request, reply) => {
    const sesion = await cargarSesion(request);
    if (!sesion) return reply.code(401).send({ error: 'Sin sesión' });
    return { usuario: sesion.usuario, csrfToken: sesion.csrfToken };
  });

  // ── Plantillas ───────────────────────────────────────────────────────────

  app.get('/v1/admin/templates', { preHandler: requiereRol('viewer') }, async () => ({
    templates: Object.values(PLANTILLAS).map((p) => ({
      key: p.key,
      nombre: p.nombre,
      descripcion: p.descripcion,
      formato: p.formato,
    })),
  }));

  // ── Campañas ─────────────────────────────────────────────────────────────

  app.get('/v1/admin/campaigns', { preHandler: requiereRol('viewer') }, async (request) => {
    const filtros = z
      .object({ estado: z.string().optional(), categoria: z.string().optional() })
      .parse(request.query);

    const condiciones: string[] = [];
    const parametros: unknown[] = [];
    if (filtros.estado) {
      parametros.push(filtros.estado);
      condiciones.push(`c.estado = $${parametros.length}::estado_campana`);
    }
    if (filtros.categoria) {
      parametros.push(filtros.categoria);
      condiciones.push(`c.categoria = $${parametros.length}::categoria_campana`);
    }
    const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    return {
      campaigns: await consultar(
        `SELECT c.id, c.key, c.nombre, c.categoria::text AS categoria, c.estado::text AS estado,
                c.prioridad, c.template_key, c.version_actual, c.inicia_en, c.termina_en,
                c.kill_switch, c.es_emergencia, c.emergencia_expira_en,
                c.creado_en, c.actualizado_en,
                autor.nombre AS creado_por_nombre,
                v.aprobado_en, aprobador.nombre AS aprobado_por_nombre
           FROM campaigns c
           LEFT JOIN admin_users autor ON autor.id = c.creado_por
           LEFT JOIN campaign_versions v ON v.campaign_id = c.id AND v.version = c.version_actual
           LEFT JOIN admin_users aprobador ON aprobador.id = v.aprobado_por
           ${where}
          ORDER BY c.prioridad ASC, c.actualizado_en DESC
          LIMIT 200`,
        parametros,
      ),
    };
  });

  app.get('/v1/admin/campaigns/:id', { preHandler: requiereRol('viewer') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const campana = await consultarUno(
      `SELECT c.*, c.estado::text AS estado, c.categoria::text AS categoria
         FROM campaigns c WHERE c.id = $1`,
      [id],
    );
    if (!campana) return reply.code(404).send({ error: 'Campaña no encontrada' });

    const versiones = await consultar(
      `SELECT v.version, v.contenido, v.presentacion, v.audiencia, v.experimento,
              v.content_hash, v.signature IS NOT NULL AS firmada,
              v.creado_en, v.enviado_en, v.aprobado_en, v.publicado_en, v.nota_aprobacion,
              autor.nombre AS creado_por_nombre, autor.id AS creado_por,
              aprobador.nombre AS aprobado_por_nombre
         FROM campaign_versions v
         LEFT JOIN admin_users autor ON autor.id = v.creado_por
         LEFT JOIN admin_users aprobador ON aprobador.id = v.aprobado_por
        WHERE v.campaign_id = $1
        ORDER BY v.version DESC`,
      [id],
    );

    return { campaign: campana, versions: versiones };
  });

  app.post('/v1/admin/campaigns', { preHandler: requiereRol('editor') }, async (request, reply) => {
    const cuerpo = z
      .object({
        key: slug,
        nombre: textoPlano(1, 120),
        categoria,
        prioridad: esquemaPrioridad,
        templateKey: z.enum(['huincha_alerta_v1', 'modal_anuncio_v1', 'drawer_conversacion_v1']),
        iniciaEn: z.string().datetime({ offset: true }).nullable().default(null),
        terminaEn: z.string().datetime({ offset: true }).nullable().default(null),
      })
      .parse(request.body);

    const existente = await consultarUno('SELECT id FROM campaigns WHERE key = $1', [cuerpo.key]);
    if (existente) return reply.code(409).send({ error: `Ya existe una campaña con la clave "${cuerpo.key}"` });

    const campana = await consultarUno<{ id: string }>(
      `INSERT INTO campaigns (key, nombre, categoria, prioridad, template_key, inicia_en, termina_en, creado_por, actualizado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) RETURNING id`,
      [
        cuerpo.key,
        cuerpo.nombre,
        cuerpo.categoria,
        cuerpo.prioridad,
        cuerpo.templateKey,
        cuerpo.iniciaEn,
        cuerpo.terminaEn,
        request.sesion!.usuario.id,
      ],
    );

    await auditar(request, { accion: 'crear_campana', entidad: 'campaign', entidadId: campana!.id, despues: cuerpo });
    return reply.code(201).send({ id: campana!.id });
  });

  app.post('/v1/admin/campaigns/:id/versions', { preHandler: requiereRol('editor') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const borrador = validarBorrador(request.body);
    const version = await crearVersion(id, borrador, request.sesion!.usuario.id);

    await auditar(request, {
      accion: 'crear_version',
      entidad: 'campaign',
      entidadId: id,
      despues: { version, formato: borrador.presentacion.formato },
    });
    return reply.code(201).send({ version });
  });

  // ── Flujo de aprobación ──────────────────────────────────────────────────

  app.post('/v1/admin/campaigns/:id/submit', { preHandler: requiereRol('editor') }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await enviarARevision(id, request.sesion!.usuario.id);
    await auditar(request, { accion: 'enviar_a_revision', entidad: 'campaign', entidadId: id });
    return { ok: true };
  });

  app.post('/v1/admin/campaigns/:id/approve', { preHandler: requiereRol('approver') }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { nota } = z.object({ nota: z.string().max(500).nullable().default(null) }).parse(request.body ?? {});

    await aprobar(id, request.sesion!.usuario.id, nota);
    await auditar(request, { accion: 'aprobar', entidad: 'campaign', entidadId: id, despues: { nota } });
    return { ok: true };
  });

  app.post('/v1/admin/campaigns/:id/publish', { preHandler: requiereRol('approver') }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await publicar(id, request.sesion!.usuario.id);
    await auditar(request, { accion: 'publicar', entidad: 'campaign', entidadId: id });
    return { ok: true };
  });

  /**
   * Ruta de emergencia. Un solo aprobador, justificación obligatoria, y la
   * campaña expira sola a las 4 horas salvo ratificación.
   */
  app.post('/v1/admin/campaigns/:id/emergency', { preHandler: requiereRol('approver') }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { justificacion, horasVigencia } = z
      .object({
        justificacion: z.string().min(20).max(1000),
        horasVigencia: z.number().int().min(1).max(24).default(4),
      })
      .parse(request.body);

    await publicarEmergencia(id, request.sesion!.usuario.id, justificacion, horasVigencia);
    await auditar(request, {
      accion: 'publicar_emergencia',
      entidad: 'campaign',
      entidadId: id,
      despues: { justificacion, horasVigencia },
    });
    return { ok: true };
  });

  /** Interruptor por campaña: efecto en ≤60 s, sin desplegar nada. */
  app.post('/v1/admin/campaigns/:id/pause', { preHandler: requiereRol('editor') }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await pausar(id, request.sesion!.usuario.id);
    await auditar(request, { accion: 'pausar', entidad: 'campaign', entidadId: id });
    return { ok: true };
  });

  // ── Interruptor global ───────────────────────────────────────────────────

  app.get('/v1/admin/config', { preHandler: requiereRol('viewer') }, async () => ({
    killGlobal: await leerKillGlobal(),
    origenesInyeccion: config.origenesInyeccion,
    ctaAllowlist: config.ctaAllowlist,
    soloMetricasAgregadas: config.AGGREGATE_METRICS_ONLY,
    retencionDias: config.EVENT_RETENTION_DAYS,
  }));

  app.put('/v1/admin/config/kill-global', { preHandler: requiereRol('admin') }, async (request) => {
    const { activo } = z.object({ activo: z.boolean() }).parse(request.body);

    await pool.query(
      `UPDATE config_global SET valor = $1::jsonb, actualizado_por = $2, actualizado_en = now()
        WHERE clave = 'kill_global'`,
      [JSON.stringify(activo), request.sesion!.usuario.id],
    );
    invalidarManifiesto();

    await auditar(request, {
      accion: activo ? 'activar_kill_global' : 'desactivar_kill_global',
      entidad: 'config',
      entidadId: 'kill_global',
      despues: { activo },
    });
    return { killGlobal: activo };
  });

  // ── Audiencias ───────────────────────────────────────────────────────────

  app.get('/v1/admin/audiences', { preHandler: requiereRol('viewer') }, async () => ({
    audiences: await consultar('SELECT id, nombre, reglas, creado_en FROM audiences ORDER BY nombre'),
  }));

  app.post('/v1/admin/audiences', { preHandler: requiereRol('editor') }, async (request, reply) => {
    const cuerpo = z
      .object({ nombre: textoPlano(1, 120), reglas: reglaAudiencia.nullable() })
      .parse(request.body);

    const fila = await consultarUno<{ id: string }>(
      'INSERT INTO audiences (nombre, reglas, creado_por) VALUES ($1, $2, $3) RETURNING id',
      [cuerpo.nombre, JSON.stringify(cuerpo.reglas), request.sesion!.usuario.id],
    );
    await auditar(request, { accion: 'crear_audiencia', entidad: 'audience', entidadId: fila!.id, despues: cuerpo });
    return reply.code(201).send({ id: fila!.id });
  });

  /**
   * Alcance estimado.
   *
   * Usa el MISMO evaluador que la extensión, traducido a SQL. Si divergieran,
   * este número mentiría y nadie se daría cuenta hasta después de publicar.
   */
  app.post('/v1/admin/audiences/preview', { preHandler: requiereRol('viewer') }, async (request) => {
    const { reglas } = z.object({ reglas: reglaAudiencia.nullable() }).parse(request.body);
    const { sql, parametros } = reglasASql(reglas);

    const activos = `
      FROM install_profiles p
      JOIN installs i ON i.install_id = p.install_id
      WHERE i.revocado_en IS NULL
        AND i.ultimo_visto > now() - interval '7 days'
        AND ${sql}`;

    const [total, porRegion, porSucursal, porRol] = await Promise.all([
      consultarUno<{ n: number }>(`SELECT COUNT(*)::int AS n ${activos}`, parametros),
      consultar(`SELECT COALESCE(p.region,'(sin dato)') AS clave, COUNT(*)::int AS n ${activos} GROUP BY 1 ORDER BY 2 DESC`, parametros),
      consultar(`SELECT COALESCE(p.sucursal,'(sin dato)') AS clave, COUNT(*)::int AS n ${activos} GROUP BY 1 ORDER BY 2 DESC LIMIT 20`, parametros),
      consultar(`SELECT COALESCE(p.rol,'(sin dato)') AS clave, COUNT(*)::int AS n ${activos} GROUP BY 1 ORDER BY 2 DESC`, parametros),
    ]);

    const parqueActivo = await consultarUno<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM installs WHERE revocado_en IS NULL AND ultimo_visto > now() - interval '7 days'`,
    );

    return {
      alcanzables: total?.n ?? 0,
      parqueActivo: parqueActivo?.n ?? 0,
      porRegion,
      porSucursal,
      porRol,
    };
  });

  // ── Imágenes ─────────────────────────────────────────────────────────────

  app.post('/v1/admin/assets', { preHandler: requiereRol('editor') }, async (request, reply) => {
    const archivo = await request.file();
    if (!archivo) return reply.code(400).send({ error: 'No se recibió ningún archivo' });

    const datos = await archivo.toBuffer();
    const altText = (archivo.fields?.altText as { value?: string } | undefined)?.value ?? 'Imagen de campaña';

    // Valida por magic bytes, no por extensión ni Content-Type: ambos los
    // controla quien sube el archivo. SVG queda fuera por construcción.
    const validada = inspeccionar(datos);
    const { storageKey, url } = guardar(datos, validada);

    const fila = await consultarUno<{ id: string }>(
      `INSERT INTO assets (storage_key, sha256, mime, bytes, ancho, alto, alt_text, subido_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [storageKey, validada.sha256, validada.mime, validada.bytes, validada.ancho, validada.alto, altText, request.sesion!.usuario.id],
    );

    const id =
      fila?.id ??
      (await consultarUno<{ id: string }>('SELECT id FROM assets WHERE sha256 = $1', [validada.sha256]))!.id;

    await auditar(request, {
      accion: 'subir_imagen',
      entidad: 'asset',
      entidadId: id,
      despues: { mime: validada.mime, bytes: validada.bytes, ancho: validada.ancho, alto: validada.alto },
    });

    return reply.code(201).send({
      assetId: id,
      url,
      altText,
      ancho: validada.ancho,
      alto: validada.alto,
    });
  });

  // ── Auditoría ────────────────────────────────────────────────────────────

  app.get('/v1/admin/audit', { preHandler: requiereRol('approver') }, async (request) => {
    const { entidad, limite } = z
      .object({ entidad: z.string().optional(), limite: z.coerce.number().int().max(200).default(100) })
      .parse(request.query);

    const filtro = entidad ? 'WHERE entidad = $2' : '';
    const parametros: unknown[] = entidad ? [limite, entidad] : [limite];

    return {
      entradas: await consultar(
        `SELECT id, actor_email, accion, entidad, entidad_id, antes, despues, ip, creado_en
           FROM audit_log ${filtro} ORDER BY creado_en DESC LIMIT $1`,
        parametros,
      ),
    };
  });
}

/** Valida que el formato declarado corresponda a la plantilla. Reutilizado por el seed. */
export function formatoValido(templateKey: ClavePlantilla, formato: string): boolean {
  return formatoDePlantilla(templateKey) === formato;
}

export { esquemaAudiencia };
