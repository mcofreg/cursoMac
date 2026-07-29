import type { ConfiguracionCliente, Manifiesto } from '@faro/contracts';

/**
 * Acceso tipado a chrome.storage.
 *
 * El service worker de MV3 muere tras ~30 s de inactividad, así que NADA puede
 * vivir en memoria entre invocaciones. Todo estado pasa por aquí.
 *
 *  · `local`   persiste entre reinicios del navegador.
 *  · `session` se limpia al cerrar Chrome — lo correcto para el "una vez por
 *              sesión" del control de frecuencia.
 */

export interface RegistroCampana {
  version: number;
  primeraVezEn: number;
  ultimaVezEn: number;
  mostradasHoy: number;
  claveDia: string;
  descartadaEn: number | null;
  acusadaEn: number | null;
}

export interface Sesion {
  deviceToken: string;
  expiraEn: string;
  usuario: {
    email: string;
    nombre: string;
    rol: string | null;
    sucursal: string | null;
    region: string | null;
    area: string | null;
    tags: string[];
    origenPerfil: 'verificado' | 'auto_declarado';
    requiereCompletarPerfil: boolean;
  };
}

export interface EstadoLocal {
  installId: string;
  sesion: Sesion | null;
  manifiesto: Manifiesto | null;
  etag: string | null;
  manifiestoDescargadoEn: number;
  config: ConfiguracionCliente;
  /** Control de frecuencia, por campaña. */
  registro: Record<string, RegistroCampana>;
  colaEventos: unknown[];
  seq: number;
  fallosSincronizacion: number;
}

const PREDETERMINADO: Omit<EstadoLocal, 'installId'> = {
  sesion: null,
  manifiesto: null,
  etag: null,
  manifiestoDescargadoEn: 0,
  config: {
    pollSegundos: 60,
    pollRapidoSegundos: 30,
    latidoSegundos: 21_600,
    flushEventosSegundos: 300,
    maxLote: 50,
  },
  registro: {},
  colaEventos: [],
  seq: 0,
  fallosSincronizacion: 0,
};

export async function leerEstado(): Promise<EstadoLocal> {
  const guardado = (await chrome.storage.local.get(null)) as Partial<EstadoLocal>;

  let installId = guardado.installId;
  if (!installId) {
    installId = crypto.randomUUID();
    await chrome.storage.local.set({ installId });
  }

  return { ...PREDETERMINADO, ...guardado, installId };
}

export async function escribirEstado(parcial: Partial<EstadoLocal>): Promise<void> {
  await chrome.storage.local.set(parcial);
}

/** Estado de sesión: se pierde al cerrar Chrome, que es lo que queremos. */
export async function leerSesionNavegador<T>(clave: string, predeterminado: T): Promise<T> {
  const resultado = await chrome.storage.session.get(clave);
  return (resultado[clave] as T) ?? predeterminado;
}

export async function escribirSesionNavegador(clave: string, valor: unknown): Promise<void> {
  await chrome.storage.session.set({ [clave]: valor });
}

export function claveDeHoy(): string {
  return new Date().toISOString().slice(0, 10);
}
