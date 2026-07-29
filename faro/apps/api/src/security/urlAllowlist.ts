import { config } from '../config.ts';

/**
 * Validación de URLs de destino contra la lista blanca corporativa.
 *
 * Se aplica DOS veces por diseño: al guardar la campaña (aquí) y otra vez en el
 * service worker antes de navegar. La doble validación no es redundancia
 * ociosa — cubre el caso de que la lista blanca cambie entre la publicación y
 * el clic, y el de un payload que llegara por otra vía.
 */

export interface ResultadoValidacion {
  valida: boolean;
  motivo?: string;
}

const ESQUEMAS_PERMITIDOS = new Set(['http:', 'https:']);

export function validarUrlDestino(
  url: string,
  allowlist: readonly string[] = config.ctaAllowlist,
): ResultadoValidacion {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valida: false, motivo: 'URL malformada' };
  }

  if (!ESQUEMAS_PERMITIDOS.has(parsed.protocol)) {
    return { valida: false, motivo: `Esquema no permitido: ${parsed.protocol}` };
  }

  // En producción solo https. En desarrollo se permite http para localhost.
  if (parsed.protocol === 'http:' && config.NODE_ENV === 'production') {
    return { valida: false, motivo: 'En producción solo se permite https' };
  }

  if (parsed.username || parsed.password) {
    return { valida: false, motivo: 'La URL no puede llevar credenciales embebidas' };
  }

  if (!hostPermitido(parsed.hostname, allowlist)) {
    return {
      valida: false,
      motivo: `El dominio "${parsed.hostname}" no está en la lista blanca corporativa`,
    };
  }

  return { valida: true };
}

/**
 * Un host está permitido si coincide exactamente con una entrada o es un
 * subdominio suyo.
 *
 * La comparación por sufijo se hace con el punto incluido: sin él,
 * "banco.cl" también autorizaría "malicioso-banco.cl", que es precisamente el
 * ataque que esta función existe para impedir.
 */
export function hostPermitido(hostname: string, allowlist: readonly string[]): boolean {
  const host = hostname.toLowerCase();

  return allowlist.some((entrada) => {
    const permitido = entrada.toLowerCase().replace(/^\*\./, '');
    return host === permitido || host.endsWith(`.${permitido}`);
  });
}

/** Recorre el contenido de una campaña y valida toda URL de destino que encuentre. */
export function validarUrlsDeContenido(contenido: unknown): ResultadoValidacion {
  const urls = extraerUrls(contenido);

  for (const url of urls) {
    const resultado = validarUrlDestino(url);
    if (!resultado.valida) return resultado;
  }

  return { valida: true };
}

function extraerUrls(valor: unknown, encontradas: string[] = []): string[] {
  if (valor === null || typeof valor !== 'object') return encontradas;

  if (Array.isArray(valor)) {
    for (const item of valor) extraerUrls(item, encontradas);
    return encontradas;
  }

  const objeto = valor as Record<string, unknown>;

  // Solo las acciones 'abrir_url' llevan destino navegable. Las URLs de imagen
  // las genera el propio backend al subir el archivo, así que no pasan por aquí.
  if (objeto.kind === 'abrir_url' && typeof objeto.url === 'string') {
    encontradas.push(objeto.url);
  }

  for (const item of Object.values(objeto)) extraerUrls(item, encontradas);
  return encontradas;
}
