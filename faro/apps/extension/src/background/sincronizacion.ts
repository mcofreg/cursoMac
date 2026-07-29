import { manifiesto as esquemaManifiesto, type CampanaFirmada } from '@faro/contracts';
import { importarClavePublica, verificarCampana } from '@faro/signing';
import { API_BASE, CLAVE_PUBLICA_FIRMA, VERSION_EXTENSION } from '../lib/config.ts';
import { escribirEstado, leerEstado } from '../lib/storage.ts';
import { encolar } from './eventos.ts';

/**
 * Sincronización con el backend.
 *
 * Polling con ETag, no push. La Push API en service workers depende de
 * endpoints de FCM que el filtrado de egress corporativo suele bloquear, y
 * añade un modo de falla silenciosa difícil de diagnosticar. El polling
 * atraviesa el proxy como cualquier HTTPS y se depura mirando logs de acceso.
 * Ganar 55 segundos no compensa ese riesgo operacional.
 *
 * Más del 95% de las peticiones terminan en un 304 de ~200 bytes.
 */

const MAX_FALLOS_ANTES_DE_CALLAR = 5;

export interface ResultadoSync {
  cambio: boolean;
  killGlobal: boolean;
  campanas: CampanaFirmada[];
}

export async function sincronizar(forzar = false): Promise<ResultadoSync> {
  const estado = await leerEstado();

  if (!estado.sesion) {
    return { cambio: false, killGlobal: false, campanas: [] };
  }

  // Verificación oportunista: si la caché es reciente, no se molesta al
  // servidor. Es lo que hace que abrir una página muestre el estado más
  // reciente casi al instante sin multiplicar el tráfico.
  const edad = Date.now() - estado.manifiestoDescargadoEn;
  if (!forzar && edad < 20_000 && estado.manifiesto) {
    return {
      cambio: false,
      killGlobal: estado.manifiesto.killGlobal,
      campanas: estado.manifiesto.campanas,
    };
  }

  try {
    const cabeceras: Record<string, string> = {
      authorization: `Bearer ${estado.sesion.deviceToken}`,
    };
    if (estado.etag) cabeceras['if-none-match'] = estado.etag;

    const respuesta = await fetch(`${API_BASE}/v1/campaigns/manifest`, { headers: cabeceras });

    if (respuesta.status === 304) {
      await escribirEstado({ manifiestoDescargadoEn: Date.now(), fallosSincronizacion: 0 });
      return {
        cambio: false,
        killGlobal: estado.manifiesto?.killGlobal ?? false,
        campanas: estado.manifiesto?.campanas ?? [],
      };
    }

    if (respuesta.status === 401) {
      // La sesión caducó: se limpia y la extensión pide iniciar sesión otra vez.
      await escribirEstado({ sesion: null, manifiesto: null, etag: null });
      return { cambio: true, killGlobal: false, campanas: [] };
    }

    if (!respuesta.ok) return await registrarFallo(estado.fallosSincronizacion);

    const crudo = await respuesta.json();
    const parseado = esquemaManifiesto.safeParse(crudo);
    if (!parseado.success) {
      await encolar({ tipo: 'error', codigoError: 'manifiesto_malformado', sessionId: crypto.randomUUID() });
      return await registrarFallo(estado.fallosSincronizacion);
    }

    const verificadas = await verificarFirmas(parseado.data.campanas);

    await escribirEstado({
      manifiesto: { ...parseado.data, campanas: verificadas },
      etag: respuesta.headers.get('etag') ?? parseado.data.etag,
      manifiestoDescargadoEn: Date.now(),
      fallosSincronizacion: 0,
    });

    return {
      cambio: true,
      killGlobal: parseado.data.killGlobal,
      campanas: verificadas,
    };
  } catch {
    await encolar({ tipo: 'error', codigoError: 'fallo_red', sessionId: crypto.randomUUID() });
    return await registrarFallo(estado.fallosSincronizacion);
  }
}

/**
 * Verifica la firma de cada campaña y descarta las que no pasen.
 *
 * Es el último control de la cadena: aunque alguien comprometiera la API o
 * interceptara el proxy corporativo, no puede inyectar contenido en las páginas
 * del banco sin la clave privada, que vive fuera del servidor de aplicación.
 */
async function verificarFirmas(campanas: CampanaFirmada[]): Promise<CampanaFirmada[]> {
  let clave: CryptoKey;
  try {
    clave = await importarClavePublica(CLAVE_PUBLICA_FIRMA);
  } catch {
    // Sin clave pública utilizable no se muestra nada. Fail-closed.
    await encolar({ tipo: 'error', codigoError: 'firma_invalida', sessionId: crypto.randomUUID() });
    return [];
  }

  const validas: CampanaFirmada[] = [];

  for (const campana of campanas) {
    const payload = {
      contenido: campana.contenido,
      presentacion: campana.presentacion,
      audiencia: campana.audiencia,
      experimento: campana.experimento,
    };

    const ok = await verificarCampana(payload, campana.contentHash, campana.signature, clave);
    if (ok) {
      validas.push(campana);
    } else {
      await encolar({
        tipo: 'error',
        campaignId: campana.id,
        campaignVersion: campana.version,
        codigoError: 'firma_invalida',
        sessionId: crypto.randomUUID(),
      });
    }
  }

  return validas;
}

/**
 * Fail-closed tras fallos repetidos.
 *
 * Un backend caído produce silencio, nunca contenido erróneo o desactualizado.
 * Es preferible que el ejecutivo no vea nada a que vea una alerta que ya se
 * resolvió hace horas.
 */
async function registrarFallo(fallosPrevios: number): Promise<ResultadoSync> {
  const fallos = fallosPrevios + 1;
  await escribirEstado({ fallosSincronizacion: fallos });

  if (fallos >= MAX_FALLOS_ANTES_DE_CALLAR) {
    await escribirEstado({ manifiesto: null, etag: null });
    return { cambio: true, killGlobal: false, campanas: [] };
  }

  const estado = await leerEstado();
  return {
    cambio: false,
    killGlobal: estado.manifiesto?.killGlobal ?? false,
    campanas: estado.manifiesto?.campanas ?? [],
  };
}

export async function enviarLatido(): Promise<void> {
  const estado = await leerEstado();
  if (!estado.sesion) return;

  try {
    const respuesta = await fetch(`${API_BASE}/v1/devices/heartbeat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${estado.sesion.deviceToken}`,
      },
      body: JSON.stringify({ extensionVersion: VERSION_EXTENSION }),
    });

    if (!respuesta.ok) return;

    const datos = (await respuesta.json()) as {
      deviceToken: string | null;
      expiraEn: string | null;
      config: typeof estado.config;
    };

    // El token se renueva antes de expirar, para que una extensión de uso
    // diario nunca tropiece con una sesión caducada.
    if (datos.deviceToken && datos.expiraEn) {
      await escribirEstado({
        sesion: { ...estado.sesion, deviceToken: datos.deviceToken, expiraEn: datos.expiraEn },
      });
    }
    if (datos.config) await escribirEstado({ config: datos.config });
  } catch {
    // Un latido perdido no es grave: el siguiente llega en horas.
  }
}
