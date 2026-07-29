import {
  PLANTILLAS,
  borradorVersion,
  contenidoCampana,
  formatoDePlantilla,
  type BorradorVersion,
  type ClavePlantilla,
  type EstadoCampana,
} from '@faro/contracts';
import { crearFirmante } from '@faro/signing/node';
import { consultar, consultarUno, enTransaccion, type Consultable } from '../db/pool.ts';
import { validarUrlsDeContenido } from '../security/urlAllowlist.ts';
import { invalidarManifiesto } from './manifiesto.ts';
import { config } from '../config.ts';

export class ErrorCampana extends Error {
  readonly codigo: number;

  constructor(codigo: number, mensaje: string) {
    super(mensaje);
    this.codigo = codigo;
  }
}

/**
 * Transiciones de estado permitidas.
 *
 * Tenerlas como dato y no repartidas en condicionales hace que el flujo de
 * gobierno sea legible de un vistazo — que es justo lo que va a pedir un
 * auditor.
 */
const TRANSICIONES: Record<EstadoCampana, EstadoCampana[]> = {
  borrador: ['en_revision', 'archivada'],
  en_revision: ['aprobada', 'borrador', 'archivada'],
  aprobada: ['activa', 'borrador', 'archivada'],
  activa: ['pausada', 'archivada'],
  pausada: ['activa', 'archivada'],
  archivada: [],
};

export function puedeTransicionar(desde: EstadoCampana, hacia: EstadoCampana): boolean {
  return TRANSICIONES[desde].includes(hacia);
}

/** Valida el contenido contra el esquema de su plantilla y las URLs contra la lista blanca. */
export function validarBorrador(entrada: unknown): BorradorVersion {
  const parseado = borradorVersion.parse(entrada);

  // El discriminador ya garantiza que los campos correspondan a la plantilla;
  // esto vuelve a validarlo de forma explícita por si el borrador llegara de
  // una ruta que no pasara por el esquema completo.
  contenidoCampana.parse(parseado.contenido);

  const plantilla = PLANTILLAS[parseado.contenido.templateKey as ClavePlantilla];
  if (!plantilla) throw new ErrorCampana(400, 'Plantilla desconocida');

  const formatoEsperado = formatoDePlantilla(parseado.contenido.templateKey as ClavePlantilla);
  if (parseado.presentacion.formato !== formatoEsperado) {
    throw new ErrorCampana(
      400,
      `La plantilla ${plantilla.key} solo admite el formato "${formatoEsperado}"`,
    );
  }

  const urls = validarUrlsDeContenido(parseado.contenido);
  if (!urls.valida) throw new ErrorCampana(400, urls.motivo ?? 'URL de destino no permitida');

  return parseado;
}

/** Crea una versión nueva. Las versiones son inmutables: editar = crear otra. */
export async function crearVersion(
  campaignId: string,
  borrador: BorradorVersion,
  autorId: string,
): Promise<number> {
  return enTransaccion(async (cliente) => {
    const campana = await consultarUno<{ estado: EstadoCampana; template_key: string }>(
      'SELECT estado, template_key FROM campaigns WHERE id = $1 FOR UPDATE',
      [campaignId],
      cliente,
    );
    if (!campana) throw new ErrorCampana(404, 'Campaña no encontrada');

    if (campana.estado === 'archivada') {
      throw new ErrorCampana(409, 'No se puede editar una campaña archivada');
    }
    if (campana.template_key !== borrador.contenido.templateKey) {
      throw new ErrorCampana(400, 'El contenido no corresponde a la plantilla de la campaña');
    }

    const siguiente = await consultarUno<{ siguiente: number }>(
      'SELECT COALESCE(MAX(version), 0) + 1 AS siguiente FROM campaign_versions WHERE campaign_id = $1',
      [campaignId],
      cliente,
    );
    const version = siguiente!.siguiente;

    await cliente.query(
      `INSERT INTO campaign_versions
         (campaign_id, version, contenido, presentacion, audiencia, experimento, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        campaignId,
        version,
        JSON.stringify(borrador.contenido),
        JSON.stringify(borrador.presentacion),
        JSON.stringify(borrador.audiencia),
        JSON.stringify(borrador.experimento),
        autorId,
      ],
    );

    // Una edición devuelve la campaña a borrador: obliga a que el contenido
    // nuevo vuelva a pasar por aprobación. Sin esto, alguien podría hacer
    // aprobar un texto inocuo y luego cambiarlo.
    await cliente.query(
      `UPDATE campaigns
          SET version_actual = $2, actualizado_por = $3, actualizado_en = now(),
              estado = CASE WHEN estado IN ('en_revision','aprobada') THEN 'borrador'::estado_campana
                            ELSE estado END
        WHERE id = $1`,
      [campaignId, version, autorId],
    );

    invalidarManifiesto();
    return version;
  });
}

export async function enviarARevision(campaignId: string, actorId: string): Promise<void> {
  await cambiarEstado(campaignId, 'en_revision', async (cliente, version) => {
    await cliente.query(
      'UPDATE campaign_versions SET enviado_en = now(), enviado_por = $2 WHERE campaign_id = $1 AND version = $3',
      [campaignId, actorId, version],
    );
  });
}

/**
 * Aprueba una versión.
 *
 * El doble control lo impone la base de datos con
 * `CHECK (aprobado_por <> creado_por)`. Aquí se detecta antes para devolver un
 * 409 legible en vez de un error de restricción — pero si esta comprobación
 * desapareciera, la base seguiría rechazando la operación.
 */
export async function aprobar(campaignId: string, aprobadorId: string, nota: string | null): Promise<void> {
  await enTransaccion(async (cliente) => {
    const fila = await consultarUno<{ estado: EstadoCampana; version: number; creado_por: string }>(
      `SELECT c.estado, v.version, v.creado_por
         FROM campaigns c
         JOIN campaign_versions v ON v.campaign_id = c.id AND v.version = c.version_actual
        WHERE c.id = $1
        FOR UPDATE OF c`,
      [campaignId],
      cliente,
    );
    if (!fila) throw new ErrorCampana(404, 'Campaña no encontrada');

    if (!puedeTransicionar(fila.estado, 'aprobada')) {
      throw new ErrorCampana(409, `No se puede aprobar una campaña en estado "${fila.estado}"`);
    }

    if (fila.creado_por === aprobadorId) {
      throw new ErrorCampana(
        409,
        'Doble control: quien crea una versión no puede aprobarla. ' +
          'Debe aprobarla otra persona con rol approver.',
      );
    }

    await cliente.query(
      `UPDATE campaign_versions
          SET aprobado_en = now(), aprobado_por = $2, nota_aprobacion = $3
        WHERE campaign_id = $1 AND version = $4`,
      [campaignId, aprobadorId, nota, fila.version],
    );
    await cliente.query(`UPDATE campaigns SET estado = 'aprobada', actualizado_en = now() WHERE id = $1`, [
      campaignId,
    ]);
  });
}

/**
 * Publica: firma el contenido y activa la campaña.
 *
 * La firma se calcula aquí, en el momento de publicar, sobre exactamente lo que
 * va a viajar al navegador. Firmar antes (al crear la versión) dejaría una
 * ventana en la que el contenido firmado y el aprobado podrían diferir.
 */
export async function publicar(campaignId: string, actorId: string): Promise<void> {
  if (!config.clavePrivada) {
    throw new ErrorCampana(
      500,
      'No hay clave de firma configurada. Ejecuta: pnpm keys:generate',
    );
  }
  const firmante = crearFirmante(config.clavePrivada);

  await enTransaccion(async (cliente) => {
    const fila = await consultarUno<{
      estado: EstadoCampana;
      version: number;
      aprobado_por: string | null;
      contenido: unknown;
      presentacion: unknown;
      audiencia: unknown;
      experimento: unknown;
    }>(
      `SELECT c.estado, v.version, v.aprobado_por, v.contenido, v.presentacion, v.audiencia, v.experimento
         FROM campaigns c
         JOIN campaign_versions v ON v.campaign_id = c.id AND v.version = c.version_actual
        WHERE c.id = $1
        FOR UPDATE OF c`,
      [campaignId],
      cliente,
    );
    if (!fila) throw new ErrorCampana(404, 'Campaña no encontrada');

    if (fila.estado !== 'aprobada' && fila.estado !== 'pausada') {
      throw new ErrorCampana(
        409,
        `Solo se publica una campaña aprobada o pausada; ésta está en "${fila.estado}"`,
      );
    }
    if (!fila.aprobado_por) {
      throw new ErrorCampana(409, 'La versión no tiene aprobación registrada');
    }

    const payload = {
      contenido: fila.contenido,
      presentacion: fila.presentacion,
      audiencia: fila.audiencia,
      experimento: fila.experimento,
    };
    const { contentHash, signature } = await firmante.firmar(payload);

    await cliente.query(
      'UPDATE campaign_versions SET content_hash = $2, signature = $3, publicado_en = now() WHERE campaign_id = $1 AND version = $4',
      [campaignId, contentHash, signature, fila.version],
    );
    await cliente.query(
      `UPDATE campaigns SET estado = 'activa', kill_switch = false, actualizado_por = $2, actualizado_en = now() WHERE id = $1`,
      [campaignId, actorId],
    );
  });

  invalidarManifiesto();
}

/**
 * Interruptor de emergencia por campaña.
 *
 * No archiva ni borra: marca `kill_switch`, con lo que la campaña sale del
 * manifiesto en el siguiente ciclo (≤60 s) y la extensión desmonta la
 * superficie en todas las pestañas. Es reversible — republicar la reactiva.
 */
export async function pausar(campaignId: string, actorId: string): Promise<void> {
  const filas = await consultar(
    `UPDATE campaigns
        SET estado = CASE WHEN estado = 'activa' THEN 'pausada'::estado_campana ELSE estado END,
            kill_switch = true, actualizado_por = $2, actualizado_en = now()
      WHERE id = $1
      RETURNING id`,
    [campaignId, actorId],
  );
  if (filas.length === 0) throw new ErrorCampana(404, 'Campaña no encontrada');
  invalidarManifiesto();
}

/**
 * Ruta de emergencia para contingencias P0.
 *
 * Un doble control puro sabotearía el caso de uso principal: una contingencia
 * no espera un flujo de aprobación de 30 minutos. Esta ruta permite que un solo
 * aprobador de guardia publique de inmediato, a cambio de tres condiciones que
 * no son negociables: justificación escrita, prioridad 0, y expiración
 * automática a las 4 horas salvo ratificación.
 */
export async function publicarEmergencia(
  campaignId: string,
  aprobadorId: string,
  justificacion: string,
  horasVigencia = 4,
): Promise<void> {
  if (justificacion.trim().length < 20) {
    throw new ErrorCampana(
      400,
      'La justificación de emergencia debe explicar el incidente (mínimo 20 caracteres)',
    );
  }
  if (!config.clavePrivada) {
    throw new ErrorCampana(500, 'No hay clave de firma configurada. Ejecuta: pnpm keys:generate');
  }

  const expira = new Date(Date.now() + horasVigencia * 3_600_000);

  await enTransaccion(async (cliente) => {
    const fila = await consultarUno<{ prioridad: number; version: number }>(
      `SELECT c.prioridad, v.version
         FROM campaigns c
         JOIN campaign_versions v ON v.campaign_id = c.id AND v.version = c.version_actual
        WHERE c.id = $1 FOR UPDATE OF c`,
      [campaignId],
      cliente,
    );
    if (!fila) throw new ErrorCampana(404, 'Campaña no encontrada');
    if (fila.prioridad !== 0) {
      throw new ErrorCampana(400, 'La ruta de emergencia es solo para campañas de prioridad 0');
    }

    await cliente.query(
      `UPDATE campaign_versions
          SET aprobado_en = now(), aprobado_por = $2,
              nota_aprobacion = 'RUTA DE EMERGENCIA: ' || $3
        WHERE campaign_id = $1 AND version = $4`,
      [campaignId, aprobadorId, justificacion, fila.version],
    );
    await cliente.query(
      `UPDATE campaigns
          SET estado = 'aprobada', es_emergencia = true,
              emergencia_expira_en = $2, justificacion_emergencia = $3,
              actualizado_por = $4, actualizado_en = now()
        WHERE id = $1`,
      [campaignId, expira, justificacion, aprobadorId],
    );
  });

  await publicar(campaignId, aprobadorId);
}

async function cambiarEstado(
  campaignId: string,
  nuevo: EstadoCampana,
  extra?: (cliente: Consultable, version: number) => Promise<void>,
): Promise<void> {
  await enTransaccion(async (cliente) => {
    const fila = await consultarUno<{ estado: EstadoCampana; version_actual: number }>(
      'SELECT estado, version_actual FROM campaigns WHERE id = $1 FOR UPDATE',
      [campaignId],
      cliente,
    );
    if (!fila) throw new ErrorCampana(404, 'Campaña no encontrada');

    if (!puedeTransicionar(fila.estado, nuevo)) {
      throw new ErrorCampana(409, `Transición no permitida: ${fila.estado} → ${nuevo}`);
    }
    if (fila.version_actual === 0) {
      throw new ErrorCampana(409, 'La campaña no tiene contenido todavía');
    }

    await cliente.query('UPDATE campaigns SET estado = $2, actualizado_en = now() WHERE id = $1', [
      campaignId,
      nuevo,
    ]);
    if (extra) await extra(cliente, fila.version_actual);
  });

  invalidarManifiesto();
}
