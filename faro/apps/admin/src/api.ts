/**
 * Cliente de la API.
 *
 * Guarda el token CSRF en memoria y lo adjunta a toda mutación. La sesión vive
 * en una cookie httpOnly, así que el JavaScript del panel nunca la ve — es lo
 * que impide que un XSS en el panel se lleve la sesión.
 */

let csrfToken: string | null = null;

export class ErrorApi extends Error {
  readonly estado: number;
  readonly detalle: unknown;

  constructor(estado: number, mensaje: string, detalle?: unknown) {
    super(mensaje);
    this.estado = estado;
    this.detalle = detalle;
  }
}

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const esMutacion = opciones.method && opciones.method !== 'GET';

  const cabeceras: Record<string, string> = { ...(opciones.headers as Record<string, string>) };
  if (opciones.body && !(opciones.body instanceof FormData)) {
    cabeceras['content-type'] = 'application/json';
  }
  if (esMutacion && csrfToken) cabeceras['x-csrf-token'] = csrfToken;

  const respuesta = await fetch(ruta, { ...opciones, headers: cabeceras, credentials: 'include' });

  if (!respuesta.ok) {
    let cuerpo: { error?: string; detalle?: unknown } = {};
    try {
      cuerpo = await respuesta.json();
    } catch {
      // Respuesta sin cuerpo JSON.
    }
    throw new ErrorApi(respuesta.status, cuerpo.error ?? `Error ${respuesta.status}`, cuerpo.detalle);
  }

  if (respuesta.status === 204) return undefined as T;
  return (await respuesta.json()) as T;
}

export const api = {
  get: <T>(ruta: string) => pedir<T>(ruta),
  post: <T>(ruta: string, cuerpo?: unknown) =>
    pedir<T>(ruta, { method: 'POST', body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) }),
  put: <T>(ruta: string, cuerpo?: unknown) =>
    pedir<T>(ruta, { method: 'PUT', body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) }),
  subir: <T>(ruta: string, datos: FormData) => pedir<T>(ruta, { method: 'POST', body: datos }),

  fijarCsrf(token: string) {
    csrfToken = token;
  },
};

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: 'viewer' | 'editor' | 'approver' | 'admin';
}

const JERARQUIA = { viewer: 0, editor: 1, approver: 2, admin: 3 } as const;

export function puede(usuario: Usuario | null, rolMinimo: keyof typeof JERARQUIA): boolean {
  if (!usuario) return false;
  return JERARQUIA[usuario.rol] >= JERARQUIA[rolMinimo];
}
