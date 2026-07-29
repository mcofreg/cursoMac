import { createHash } from 'node:crypto';
import type { CampanaFirmada, Manifiesto } from '@faro/contracts';
import { consultar, consultarUno } from '../db/pool.ts';
import { config } from '../config.ts';

/**
 * Construcción del manifiesto que consume la extensión.
 *
 * Decisión deliberada: se envía el manifiesto COMPLETO a todos los
 * dispositivos, y la segmentación se evalúa en el cliente. A cambio de que
 * cada extensión conozca todas las campañas activas, se gana un único ETag
 * global — y con eso, que más del 95% de las peticiones sean un 304 de ~200
 * bytes. Es aceptable porque el contenido no es sensible (son avisos
 * operativos, no datos de clientes).
 *
 * Si más adelante hubiera campañas confidenciales, habría que segmentar el
 * ETag por audiencia y servir manifiestos distintos por segmento.
 */

interface FilaCampanaActiva {
  id: string;
  key: string;
  categoria: string;
  prioridad: number;
  version: number;
  contenido: unknown;
  presentacion: unknown;
  audiencia: unknown;
  experimento: unknown;
  inicia_en: string | null;
  termina_en: string | null;
  content_hash: string | null;
  signature: string | null;
}

/** Caché en memoria del manifiesto ya serializado, junto a su ETag. */
let cache: { etag: string; cuerpo: Manifiesto; generadoEn: number } | null = null;

/** Invalida la caché. Toda mutación de campañas debe llamarlo. */
export function invalidarManifiesto(): void {
  cache = null;
}

export async function obtenerManifiesto(): Promise<{ etag: string; cuerpo: Manifiesto }> {
  // TTL corto para que varias instancias converjan sin coordinación explícita.
  if (cache && Date.now() - cache.generadoEn < 5_000) {
    return { etag: cache.etag, cuerpo: cache.cuerpo };
  }

  const killGlobal = await leerKillGlobal();

  const filas = killGlobal ? [] : await consultar<FilaCampanaActiva>(`
    SELECT
      c.id, c.key, c.categoria::text AS categoria, c.prioridad,
      v.version, v.contenido, v.presentacion, v.audiencia, v.experimento,
      c.inicia_en, c.termina_en, v.content_hash, v.signature
    FROM campaigns c
    JOIN campaign_versions v
      ON v.campaign_id = c.id AND v.version = c.version_actual
    WHERE c.estado = 'activa'
      AND c.kill_switch = false
      AND v.signature IS NOT NULL
      AND (c.inicia_en IS NULL OR c.inicia_en <= now())
      AND (c.termina_en IS NULL OR c.termina_en > now())
      -- Una campaña publicada por la ruta de emergencia desaparece sola al
      -- vencer el plazo, sin que nadie tenga que acordarse de retirarla.
      AND (NOT c.es_emergencia OR c.emergencia_expira_en > now())
    ORDER BY c.prioridad ASC, c.creado_en DESC
  `);

  const campanas: CampanaFirmada[] = filas.map((f) => ({
    id: f.id,
    version: f.version,
    key: f.key,
    categoria: f.categoria as CampanaFirmada['categoria'],
    prioridad: f.prioridad,
    contenido: f.contenido as CampanaFirmada['contenido'],
    presentacion: f.presentacion as CampanaFirmada['presentacion'],
    audiencia: f.audiencia as CampanaFirmada['audiencia'],
    experimento: f.experimento as CampanaFirmada['experimento'],
    iniciaEn: f.inicia_en,
    terminaEn: f.termina_en,
    contentHash: f.content_hash!,
    signature: f.signature!,
  }));

  // El ETag se calcula sobre las firmas y versiones, no sobre el JSON completo:
  // así no depende del orden de serialización ni de campos volátiles como la
  // marca de generación, que cambiaría el ETag en cada petición.
  const huella = campanas.map((c) => `${c.id}:${c.version}:${c.contentHash}`).join('|');
  const etag = `"${createHash('sha256').update(`${killGlobal}|${huella}`).digest('hex').slice(0, 32)}"`;

  const cuerpo: Manifiesto = {
    generadoEn: new Date().toISOString(),
    etag,
    killGlobal,
    ttlSegundos: 300,
    campanas,
  };

  cache = { etag, cuerpo, generadoEn: Date.now() };
  return { etag, cuerpo };
}

export async function leerKillGlobal(): Promise<boolean> {
  const fila = await consultarUno<{ valor: boolean }>(
    `SELECT valor::text::boolean AS valor FROM config_global WHERE clave = 'kill_global'`,
  );
  return fila?.valor ?? false;
}

/** ¿Hay alguna contingencia P0 activa? La extensión acelera su polling si la hay. */
export async function hayContingenciaCritica(): Promise<boolean> {
  const fila = await consultarUno<{ existe: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM campaigns
      WHERE estado = 'activa' AND kill_switch = false AND prioridad = 0
        AND (termina_en IS NULL OR termina_en > now())
    ) AS existe
  `);
  return fila?.existe ?? false;
}

export function configuracionCliente(pollRapido: boolean) {
  return {
    ...config.configCliente,
    pollSegundos: pollRapido ? config.configCliente.pollRapidoSegundos : config.configCliente.pollSegundos,
  };
}
