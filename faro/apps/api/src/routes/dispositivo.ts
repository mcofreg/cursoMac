import type { FastifyInstance, FastifyRequest } from 'fastify';
import { loteEventos } from '@faro/contracts';
import { z } from 'zod';
import { consultar, consultarUno, pool } from '../db/pool.ts';
import { emitirToken, verificarToken, type ClaimsDispositivo } from '../auth/deviceToken.ts';
import { buscarUsuarioDev, buscarUsuarioDevPorEmail, USUARIOS_DEV } from '../auth/usuarios-dev.ts';
import {
  configuracionCliente,
  hayContingenciaCritica,
  obtenerManifiesto,
} from '../services/manifiesto.ts';
import { config } from '../config.ts';

/**
 * Rutas que consume la extensión.
 *
 * Ninguna de ellas acepta ni devuelve información de navegación. El esquema de
 * eventos es estricto y la ingesta rechaza el lote completo si aparece un campo
 * no declarado — esa es la garantía técnica que respalda el compromiso de
 * privacidad con los trabajadores.
 */

async function exigirDispositivo(request: FastifyRequest): Promise<ClaimsDispositivo | null> {
  const cabecera = request.headers.authorization;
  if (!cabecera?.startsWith('Bearer ')) return null;
  return verificarToken(cabecera.slice(7));
}

export async function rutasDispositivo(app: FastifyInstance): Promise<void> {
  // ── Inicio de sesión ──────────────────────────────────────────────────────
  //
  // En producción esto recibe el `code` del flujo OIDC Authorization Code +
  // PKCE que la extensión inicia con chrome.identity.launchWebAuthFlow. En modo
  // dev se acepta el email de un usuario de prueba: la forma del token y de los
  // claims es idéntica, así que el resto del sistema no distingue.

  app.get('/v1/auth/usuarios-dev', async (_request, reply) => {
    if (config.AUTH_MODE !== 'dev') return reply.code(404).send({ error: 'No disponible' });
    return {
      usuarios: USUARIOS_DEV.map((u) => ({
        sub: u.sub,
        email: u.email,
        nombre: u.nombre,
        rol: u.rol,
        sucursal: u.sucursal,
        region: u.region,
        rolAdmin: u.rolAdmin,
      })),
    };
  });

  app.post('/v1/auth/session', async (request, reply) => {
    const cuerpo = z
      .object({
        installId: z.string().uuid(),
        extensionVersion: z.string().max(20),
        chromeVersion: z.string().max(40).optional(),
        so: z.string().max(40).optional(),
        // Modo dev
        email: z.string().email().optional(),
        // Modo OIDC
        code: z.string().optional(),
        codeVerifier: z.string().optional(),
      })
      .parse(request.body);

    let usuario;
    if (config.AUTH_MODE === 'dev') {
      if (!cuerpo.email) return reply.code(400).send({ error: 'Falta el email del usuario de prueba' });
      usuario = buscarUsuarioDevPorEmail(cuerpo.email);
      if (!usuario) return reply.code(401).send({ error: 'Usuario de prueba no encontrado' });
    } else {
      // Punto de integración con el IdP corporativo: canjear `code` +
      // `codeVerifier` por el id_token y leer sus claims. La forma del objeto
      // `usuario` es la misma, así que nada más cambia.
      return reply.code(501).send({ error: 'Modo OIDC no configurado en este entorno' });
    }

    await pool.query(
      `INSERT INTO installs (install_id, extension_version, chrome_version, so)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (install_id) DO UPDATE
         SET ultimo_visto = now(), extension_version = EXCLUDED.extension_version,
             chrome_version = EXCLUDED.chrome_version, so = EXCLUDED.so`,
      [cuerpo.installId, cuerpo.extensionVersion, cuerpo.chromeVersion ?? null, cuerpo.so ?? null],
    );

    // Si el IdP no entrega atributos laborales, el perfil queda incompleto y la
    // extensión le pedirá auto-declarar su sucursal. El origen del dato queda
    // registrado para que el dashboard pueda distinguirlo.
    const tieneAtributos = Boolean(usuario.sucursal && usuario.rol);

    await pool.query(
      `INSERT INTO install_profiles
         (install_id, employee_id, email, rol, sucursal, region, area, tags, origen_perfil)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (install_id) DO UPDATE
         SET employee_id = EXCLUDED.employee_id, email = EXCLUDED.email,
             rol = COALESCE(EXCLUDED.rol, install_profiles.rol),
             sucursal = COALESCE(EXCLUDED.sucursal, install_profiles.sucursal),
             region = COALESCE(EXCLUDED.region, install_profiles.region),
             area = COALESCE(EXCLUDED.area, install_profiles.area),
             tags = EXCLUDED.tags,
             origen_perfil = CASE WHEN $9 = 'verificado' THEN 'verificado'::origen_perfil
                                  ELSE install_profiles.origen_perfil END,
             actualizado_en = now()`,
      [
        cuerpo.installId,
        usuario.employeeId,
        usuario.email,
        usuario.rol,
        usuario.sucursal,
        usuario.region,
        usuario.area,
        usuario.tags,
        tieneAtributos ? 'verificado' : 'auto_declarado',
      ],
    );

    const perfil = await consultarUno<{
      rol: string | null;
      sucursal: string | null;
      region: string | null;
      area: string | null;
      tags: string[];
      origen_perfil: 'verificado' | 'auto_declarado';
    }>('SELECT rol, sucursal, region, area, tags, origen_perfil FROM install_profiles WHERE install_id = $1', [
      cuerpo.installId,
    ]);

    const { token, expiraEn } = emitirToken({
      sub: cuerpo.installId,
      eid: usuario.employeeId,
      email: usuario.email,
    });

    return {
      deviceToken: token,
      expiraEn,
      usuario: {
        email: usuario.email,
        nombre: usuario.nombre,
        rol: perfil?.rol ?? null,
        sucursal: perfil?.sucursal ?? null,
        region: perfil?.region ?? null,
        area: perfil?.area ?? null,
        tags: perfil?.tags ?? [],
        origenPerfil: perfil?.origen_perfil ?? 'auto_declarado',
        requiereCompletarPerfil: !perfil?.sucursal,
      },
      config: configuracionCliente(await hayContingenciaCritica()),
    };
  });

  /** Auto-declaración de sucursal, cuando el SSO no entrega los atributos. */
  app.post('/v1/devices/perfil', async (request, reply) => {
    const claims = await exigirDispositivo(request);
    if (!claims) return reply.code(401).send({ error: 'Token de dispositivo inválido' });

    const cuerpo = z
      .object({
        sucursal: z.string().min(1).max(64),
        rol: z.string().min(1).max(64),
        region: z.string().max(64).optional(),
      })
      .parse(request.body);

    const antes = await consultarUno('SELECT * FROM install_profiles WHERE install_id = $1', [claims.sub]);

    await pool.query(
      `UPDATE install_profiles
          SET sucursal = $2, rol = $3, region = COALESCE($4, region),
              origen_perfil = 'auto_declarado', actualizado_en = now()
        WHERE install_id = $1`,
      [claims.sub, cuerpo.sucursal, cuerpo.rol, cuerpo.region ?? null],
    );

    // El historial de perfil permite explicar por qué una persona empezó o dejó
    // de recibir una campaña, sin tener que adivinar.
    await pool.query(
      'INSERT INTO install_profile_history (install_id, antes, despues) VALUES ($1, $2, $3)',
      [claims.sub, JSON.stringify(antes), JSON.stringify(cuerpo)],
    );

    return { ok: true };
  });

  // ── Latido: alimenta la base instalada ───────────────────────────────────
  app.post('/v1/devices/heartbeat', async (request, reply) => {
    const claims = await exigirDispositivo(request);
    if (!claims) return reply.code(401).send({ error: 'Token de dispositivo inválido' });

    const cuerpo = z
      .object({
        extensionVersion: z.string().max(20),
        chromeVersion: z.string().max(40).optional(),
      })
      .parse(request.body);

    await pool.query(
      `UPDATE installs SET ultimo_visto = now(), extension_version = $2,
              chrome_version = COALESCE($3, chrome_version)
        WHERE install_id = $1`,
      [claims.sub, cuerpo.extensionVersion, cuerpo.chromeVersion ?? null],
    );

    // Renueva el token si le quedan menos de 6 horas, para que una extensión
    // que se usa a diario nunca vea una sesión expirada.
    const quedanHoras = (claims.exp * 1000 - Date.now()) / 3_600_000;
    const renovado = quedanHoras < 6 ? emitirToken({ sub: claims.sub, eid: claims.eid, email: claims.email }) : null;

    return {
      deviceToken: renovado?.token ?? null,
      expiraEn: renovado?.expiraEn ?? null,
      config: configuracionCliente(await hayContingenciaCritica()),
    };
  });

  // ── Manifiesto con ETag ──────────────────────────────────────────────────
  app.get('/v1/campaigns/manifest', async (request, reply) => {
    const claims = await exigirDispositivo(request);
    if (!claims) return reply.code(401).send({ error: 'Token de dispositivo inválido' });

    const { etag, cuerpo } = await obtenerManifiesto();

    // Más del 95% de las peticiones terminan aquí: ~200 bytes en vez del
    // manifiesto completo. Es lo que hace viable un polling de 60 segundos.
    if (request.headers['if-none-match'] === etag) {
      return reply.code(304).header('etag', etag).send();
    }

    return reply
      .header('etag', etag)
      .header('cache-control', 'no-cache')
      .send(cuerpo);
  });

  // ── Ingesta de eventos ───────────────────────────────────────────────────
  app.post('/v1/events/batch', async (request, reply) => {
    const claims = await exigirDispositivo(request);
    if (!claims) return reply.code(401).send({ error: 'Token de dispositivo inválido' });

    // `.strict()` en el esquema: si llegara un campo no declarado —una URL, un
    // título de página— el lote completo se rechaza aquí.
    const parseado = loteEventos.safeParse(request.body);
    if (!parseado.success) {
      return reply.code(400).send({
        error: 'Lote inválido',
        detalle: parseado.error.issues.slice(0, 5),
      });
    }
    const lote = parseado.data;

    if (lote.installId !== claims.sub) {
      return reply.code(403).send({ error: 'El lote no corresponde a este dispositivo' });
    }

    const perfil = await consultarUno<{
      employee_id: string | null;
      sucursal: string | null;
      region: string | null;
      rol: string | null;
    }>('SELECT employee_id, sucursal, region, rol FROM install_profiles WHERE install_id = $1', [
      lote.installId,
    ]);

    let aceptados = 0;
    let duplicados = 0;
    const rechazados: { eventId: string; motivo: string }[] = [];

    for (const evento of lote.eventos) {
      // Un reloj de cliente muy desviado corrompe las series temporales. Se
      // acota en vez de rechazar: perder el evento sería peor que fecharlo mal.
      const ocurrido = new Date(evento.ocurridoEn);
      const desviacionHoras = Math.abs(Date.now() - ocurrido.getTime()) / 3_600_000;
      if (desviacionHoras > 48) {
        rechazados.push({ eventId: evento.eventId, motivo: 'reloj_desviado' });
        continue;
      }

      // Reserva el identificador en la tabla de deduplicación. Si ya estaba, el
      // evento es un reenvío de la cola offline y no se vuelve a contar.
      //
      // La deduplicación NO puede apoyarse en la clave primaria de `events`:
      // esa tabla está particionada por `recibido_en`, así que la clave incluye
      // una marca de tiempo que cambia en cada intento. Ver migración 004.
      const reservado = await consultar<{ event_id: string }>(
        'INSERT INTO event_dedup (event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id',
        [evento.eventId],
      );

      if (reservado.length === 0) {
        duplicados++;
        continue;
      }

      await consultar(
        `INSERT INTO events (
           event_id, install_id, employee_id, sucursal, region, rol,
           campaign_id, campaign_version, variante, tipo, formato,
           cta_id, dwell_ms, motivo_supresion, codigo_error,
           ocurrido_en, session_id, seq, extension_version
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          evento.eventId,
          lote.installId,
          perfil?.employee_id ?? null,
          perfil?.sucursal ?? null,
          perfil?.region ?? null,
          perfil?.rol ?? null,
          evento.campaignId,
          evento.campaignVersion,
          evento.variante,
          evento.tipo,
          evento.formato,
          evento.ctaId,
          evento.dwellMs,
          evento.motivoSupresion,
          evento.codigoError,
          evento.ocurridoEn,
          evento.sessionId,
          evento.seq,
          lote.extensionVersion,
        ],
      );

      aceptados++;
    }

    await pool.query('UPDATE installs SET ultimo_visto = now() WHERE install_id = $1', [lote.installId]);

    return reply.code(202).send({ aceptados, duplicados, rechazados });
  });
}
