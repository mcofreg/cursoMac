/* Avisos del navegador por vencimientos y atrasos.
 *
 * Importante: sin servidor, el navegador solo puede avisar mientras la página
 * esté abierta (aunque sea en una pestaña de fondo). Por eso el aviso se
 * revisa al abrir Pulso y luego cada media hora, y se manda como máximo uno
 * por día para no volverse ruido. */

import { contarUrgencias, textoAviso } from './domain/alertas.js';
import { hoyISO } from './domain/fechas.js';
import * as store from './store/store.js';

const CADA_MEDIA_HORA = 30 * 60 * 1000;
let temporizador = null;

export function soportaNotificaciones() {
  return typeof Notification !== 'undefined';
}

export function permiso() {
  return soportaNotificaciones() ? Notification.permission : 'unsupported';
}

/** Pide permiso al usuario. Devuelve true si quedó concedido. */
export async function pedirPermiso() {
  if (!soportaNotificaciones()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const respuesta = await Notification.requestPermission();
  return respuesta === 'granted';
}

/** Enciende o apaga los avisos y guarda la preferencia. */
export async function activar(encender) {
  if (encender) {
    const concedido = await pedirPermiso();
    if (!concedido) return false;
  }
  store.fijarConfig({
    notificaciones: { ...store.config('notificaciones'), activadas: Boolean(encender) },
  });
  iniciarNotificaciones();
  return Boolean(encender);
}

/** Arranca (o reinicia) la revisión periódica. */
export function iniciarNotificaciones() {
  if (temporizador) clearInterval(temporizador);
  const configuracion = store.config('notificaciones');
  if (!configuracion.activadas || permiso() !== 'granted') return;
  revisar();
  temporizador = setInterval(revisar, CADA_MEDIA_HORA);
}

/**
 * Manda un aviso si hay algo urgente y todavía no se avisó hoy.
 * @param {boolean} forzar salta el control de "una vez al día" (botón de prueba)
 */
export function revisar(forzar = false) {
  if (permiso() !== 'granted') return null;
  const configuracion = store.config('notificaciones');
  if (!forzar && !configuracion.activadas) return null;
  const hoy = hoyISO();
  if (!forzar && configuracion.ultimoAviso === hoy) return null;

  const tareas = store.tareasDeIniciativa();
  const cuantas = contarUrgencias(tareas);
  if (!cuantas && !forzar) return null;

  const iniciativa = store.iniciativaActiva();
  const detalle = textoAviso(tareas) || 'Todo al día por ahora.';
  const aviso = new Notification(`Pulso · ${iniciativa ? iniciativa.nombre : 'seguimiento'}`, {
    body: detalle,
    tag: 'pulso-vencimientos',
    icon: iconoDeAviso(),
  });
  aviso.onclick = () => {
    window.focus();
    location.hash = '#/radar';
    aviso.close();
  };

  store.fijarConfig({ notificaciones: { ...configuracion, ultimoAviso: hoy } });
  return detalle;
}

function iconoDeAviso() {
  return 'data:image/svg+xml,'
    + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
      + '<rect width="32" height="32" rx="8" fill="#4f46e5"/>'
      + '<path d="M5 18h5l3-8 4 14 3-9 2 3h5" fill="none" stroke="white" stroke-width="2.4" '
      + 'stroke-linecap="round" stroke-linejoin="round"/></svg>');
}
