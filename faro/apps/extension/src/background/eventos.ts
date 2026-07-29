import type { EventoCliente, TipoEvento } from '@faro/contracts';
import { CLAVES_EVENTO_PERMITIDAS } from '@faro/contracts';
import { escribirEstado, leerEstado } from '../lib/storage.ts';
import { API_BASE, VERSION_EXTENSION } from '../lib/config.ts';

/**
 * Cola de eventos con reintento.
 *
 * Si el ejecutivo pierde la red —cosa habitual en sucursales— los eventos se
 * acumulan y se envían al reconectar. Nada se pierde, y nada se cuenta dos
 * veces: cada evento lleva un identificador generado en el cliente y el
 * servidor descarta los repetidos.
 */

const MAX_COLA = 2000;
const UMBRAL_ENVIO = 25;

/** Backoff exponencial: 30 s, 2 min, 8 min, 30 min, 2 h. */
const BACKOFF_MS = [30_000, 120_000, 480_000, 1_800_000, 7_200_000];

/** Eventos de bajo valor: se descartan primero si la cola se llena. */
const DESCARTABLES: TipoEvento[] = ['latido', 'entregado'];

export interface DatosEvento {
  tipo: TipoEvento;
  campaignId?: string | null;
  campaignVersion?: number | null;
  variante?: 'target' | 'control' | null;
  formato?: 'huincha' | 'modal' | 'drawer' | null;
  ctaId?: string | null;
  dwellMs?: number | null;
  motivoSupresion?: EventoCliente['motivoSupresion'];
  codigoError?: EventoCliente['codigoError'];
  sessionId: string;
}

/**
 * Filtra el objeto contra la lista blanca de claves antes de encolarlo.
 *
 * Esta es la segunda de las cuatro capas que impiden que la extensión reporte
 * navegación: aunque algo lograra adjuntar `location.href` al evento en el
 * renderer, aquí se elimina antes de que llegue siquiera a la cola.
 */
export function sanearEvento(entrada: Record<string, unknown>): Record<string, unknown> {
  const limpio: Record<string, unknown> = {};
  for (const clave of CLAVES_EVENTO_PERMITIDAS) {
    if (clave in entrada) limpio[clave] = entrada[clave];
  }
  return limpio;
}

export async function encolar(datos: DatosEvento): Promise<void> {
  const estado = await leerEstado();
  const seq = estado.seq + 1;

  const evento = sanearEvento({
    eventId: crypto.randomUUID(),
    tipo: datos.tipo,
    campaignId: datos.campaignId ?? null,
    campaignVersion: datos.campaignVersion ?? null,
    variante: datos.variante ?? null,
    formato: datos.formato ?? null,
    ctaId: datos.ctaId ?? null,
    dwellMs: datos.dwellMs ?? null,
    motivoSupresion: datos.motivoSupresion ?? null,
    codigoError: datos.codigoError ?? null,
    ocurridoEn: new Date().toISOString(),
    sessionId: datos.sessionId,
    seq,
  });

  let cola = [...estado.colaEventos, evento];

  if (cola.length > MAX_COLA) {
    // Se sacrifican latidos y entregas antes que impresiones y clics: si algo
    // se va a perder, que no sean las métricas que le importan al negocio.
    const valiosos = cola.filter((e) => !DESCARTABLES.includes((e as EventoCliente).tipo));
    cola = valiosos.slice(-MAX_COLA);
  }

  await escribirEstado({ colaEventos: cola, seq });

  if (cola.length >= UMBRAL_ENVIO) await enviarCola();
}

export async function enviarCola(): Promise<void> {
  const estado = await leerEstado();
  if (estado.colaEventos.length === 0 || !estado.sesion) return;

  const proximoIntento = await chrome.storage.session.get('proximoIntentoEnvio');
  const espera = (proximoIntento.proximoIntentoEnvio as number) ?? 0;
  if (Date.now() < espera) return;

  const lote = estado.colaEventos.slice(0, estado.config.maxLote);

  try {
    const respuesta = await fetch(`${API_BASE}/v1/events/batch`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${estado.sesion.deviceToken}`,
      },
      body: JSON.stringify({
        installId: estado.installId,
        enviadoEn: new Date().toISOString(),
        extensionVersion: VERSION_EXTENSION,
        eventos: lote,
      }),
    });

    if (respuesta.ok) {
      const restantes = estado.colaEventos.slice(lote.length);
      await escribirEstado({ colaEventos: restantes });
      await chrome.storage.session.set({ intentosEnvio: 0, proximoIntentoEnvio: 0 });

      // Si quedaron eventos, sigue vaciando de inmediato.
      if (restantes.length > 0) await enviarCola();
      return;
    }

    // Un 400 significa payload malformado: reintentar no lo va a arreglar y
    // bloquearía la cola para siempre. Se descarta el lote y se sigue.
    if (respuesta.status === 400) {
      await escribirEstado({ colaEventos: estado.colaEventos.slice(lote.length) });
      return;
    }

    await programarReintento();
  } catch {
    await programarReintento();
  }
}

async function programarReintento(): Promise<void> {
  const guardado = await chrome.storage.session.get('intentosEnvio');
  const intentos = ((guardado.intentosEnvio as number) ?? 0) + 1;
  const base = BACKOFF_MS[Math.min(intentos - 1, BACKOFF_MS.length - 1)]!;
  // Jitter: evita que todo el parque reintente en el mismo instante tras una
  // caída de red, que convertiría la recuperación en una avalancha.
  const espera = base + Math.random() * base * 0.3;

  await chrome.storage.session.set({
    intentosEnvio: intentos,
    proximoIntentoEnvio: Date.now() + espera,
  });
}
