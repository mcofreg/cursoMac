/**
 * Asignación determinística a variante y rollout.
 *
 * Propiedades que este diseño garantiza y que hay que preservar en cualquier
 * cambio futuro:
 *
 *  · Determinista y sin estado. El mismo dispositivo cae siempre en el mismo
 *    grupo, sin guardar la asignación en ninguna parte y sin consultar al
 *    servidor. Nada de parpadeo entre sesiones.
 *
 *  · Independiente entre campañas. Incluir `campaignId` evita que los mismos
 *    ejecutivos queden siempre en el control — sesgo por acumulación.
 *
 *  · Dimensiones separadas para rollout y variante. Si compartieran el hash,
 *    "estar en el 10% del rollout" quedaría correlacionado con "estar en el
 *    control", y el experimento mediría el sesgo en vez del efecto.
 *
 *  · Monótono al ampliar. Subir el rollout de 10% a 25% CONSERVA a los del 10%
 *    original: nadie pierde una campaña que ya estaba viendo.
 *
 * El backend reproduce este cálculo para el análisis. Si las dos
 * implementaciones divergieran, todo el análisis A/B quedaría inválido — por
 * eso vive en un único módulo isomorfo, y no duplicado a cada lado.
 */

export type Dimension = 'variant' | 'rollout';

const RESOLUCION = 10_000;

/**
 * Devuelve un entero en [0, 9999) — resolución de 0,01%.
 * Usa WebCrypto, disponible tanto en el service worker como en Node 20+.
 */
export async function bucket(
  installId: string,
  campaignId: string,
  salt: string,
  dimension: Dimension,
): Promise<number> {
  const entrada = `${installId}:${campaignId}:${salt}:${dimension}`;
  const bytes = new TextEncoder().encode(entrada);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  // Los primeros 4 bytes bastan: 2^32 posibilidades sobre 10.000 cubos deja un
  // sesgo por módulo de ~2e-6, tres órdenes de magnitud bajo el ruido muestral.
  return new DataView(digest).getUint32(0) % RESOLUCION;
}

export interface ResultadoAsignacion {
  incluidoEnRollout: boolean;
  variante: 'target' | 'control';
}

export async function asignar(
  installId: string,
  campaignId: string,
  experimento: { controlPct: number; rolloutPct: number; salt: string },
): Promise<ResultadoAsignacion> {
  const [cuboRollout, cuboVariante] = await Promise.all([
    bucket(installId, campaignId, experimento.salt, 'rollout'),
    bucket(installId, campaignId, experimento.salt, 'variant'),
  ]);

  return {
    incluidoEnRollout: cuboRollout < experimento.rolloutPct * 100,
    variante: cuboVariante < experimento.controlPct * 100 ? 'control' : 'target',
  };
}
