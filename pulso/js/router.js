/* Navegación por hash: #/tablero, #/informe, #/tarea/ta_123.
 * No importa ninguna vista, así que las vistas pueden importarlo sin generar
 * una dependencia circular. */

let alRepintar = () => {};
const oyentes = new Set();

export const RUTA_INICIAL = 'radar';

/** Lee la ruta actual de la barra de direcciones. */
export function rutaActual() {
  const bruto = (location.hash || '').replace(/^#\/?/, '');
  if (!bruto) return { vista: RUTA_INICIAL, parametro: null };
  const [vista, parametro] = bruto.split('/');
  return { vista: vista || RUTA_INICIAL, parametro: parametro || null };
}

/** Cambia de pantalla. */
export function irA(vista, parametro) {
  const destino = `#/${vista}${parametro ? `/${parametro}` : ''}`;
  if (location.hash === destino) {
    repintar();
    return;
  }
  location.hash = destino;
}

/** Registra quién debe volver a dibujar la pantalla actual. */
export function fijarRepintado(fn) {
  alRepintar = fn;
}

/** Vuelve a dibujar la pantalla actual conservando la ruta. */
export function repintar() {
  alRepintar();
}

/** Avisa cada vez que cambia la ruta. */
export function alCambiarRuta(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

export function iniciarRouter() {
  window.addEventListener('hashchange', () => {
    for (const fn of oyentes) fn(rutaActual());
  });
}
