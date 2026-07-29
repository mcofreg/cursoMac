/**
 * Validación de URLs en el cliente.
 *
 * Duplica deliberadamente la validación del servidor. No es redundancia ociosa:
 * cubre el caso de que el contenido llegara por otra vía, y hace que el control
 * siga en pie aunque el backend estuviera comprometido.
 *
 * En producción esta lista se genera en el build desde la configuración
 * corporativa, igual que los orígenes de inyección del manifiesto.
 */

const HOSTS_PERMITIDOS = ['localhost', '127.0.0.1', 'intranet.banco.cl', 'crm.banco.cl', 'banco.cl'];

export interface Validacion {
  valida: boolean;
  motivo?: string;
}

export function validarDestino(url: string): Validacion {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valida: false, motivo: 'url_malformada' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { valida: false, motivo: 'esquema_no_permitido' };
  }

  if (parsed.username || parsed.password) {
    return { valida: false, motivo: 'credenciales_embebidas' };
  }

  const host = parsed.hostname.toLowerCase();
  // La comparación de sufijo incluye el punto a propósito: sin él, "banco.cl"
  // también autorizaría "malicioso-banco.cl", que es justo el ataque que esta
  // función existe para impedir.
  const permitido = HOSTS_PERMITIDOS.some((h) => host === h || host.endsWith(`.${h}`));

  return permitido ? { valida: true } : { valida: false, motivo: 'host_no_permitido' };
}
