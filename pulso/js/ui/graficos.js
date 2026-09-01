/* Gráficos en SVG, sin librerías.
 *
 * Reglas que se respetan en todos ellos:
 * - Las series categóricas usan --serie-1..6, con pasos propios para el modo
 *   claro y para el oscuro (validados por banda de luminosidad, croma,
 *   separación para daltonismo y contraste). El color se asigna por entidad y
 *   en orden fijo: nunca se recicla ni se reordena al filtrar.
 * - Los estados y los semáforos usan la paleta de estado (verde/ámbar/rojo),
 *   reservada para eso y acompañada siempre de texto, nunca solo de color.
 * - Los textos usan los tokens de tipografía, jamás el color de la serie.
 * - Toda marca tiene etiqueta directa o descripción accesible, y cada gráfico
 *   viene acompañado de su tabla en el informe.
 */

const NS = 'http://www.w3.org/2000/svg';

export const SERIES = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-3)',
  'var(--serie-4)', 'var(--serie-5)', 'var(--serie-6)'];

/** Color de serie por posición fija de la entidad. */
export function colorSerie(indice) {
  return SERIES[indice % SERIES.length];
}

export function colorEstado(nombre) {
  return `var(--${nombre})`;
}

function el(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElementNS(NS, etiqueta);
  for (const [k, v] of Object.entries(atributos)) {
    if (v === null || v === undefined) continue;
    nodo.setAttribute(k, v);
  }
  for (const hijo of hijos.flat()) {
    if (hijo === null || hijo === undefined) continue;
    nodo.appendChild(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return nodo;
}

function lienzo(ancho, alto, titulo) {
  const svg = el('svg', {
    viewBox: `0 0 ${ancho} ${alto}`,
    width: '100%',
    role: 'img',
    'aria-label': titulo || '',
    style: `display:block;max-width:100%;height:auto;font-family:var(--fuente)`,
  });
  return svg;
}

function texto(x, y, contenido, atributos = {}) {
  return el('text', {
    x, y,
    fill: atributos.fill || 'var(--texto-suave)',
    'font-size': atributos.tamano || 11,
    'font-weight': atributos.peso || 500,
    'text-anchor': atributos.anclaje || 'start',
    'dominant-baseline': atributos.base || 'middle',
    ...(atributos.extra || {}),
  }, contenido);
}

/* ------------------------------------------------------------ tooltip */

let globoActivo = null;

function globo() {
  if (globoActivo) return globoActivo;
  globoActivo = document.createElement('div');
  Object.assign(globoActivo.style, {
    position: 'fixed', zIndex: '300', pointerEvents: 'none', opacity: '0',
    background: 'var(--superficie)', color: 'var(--texto)',
    border: '1px solid var(--borde-fuerte)', borderRadius: '8px',
    padding: '6px 9px', fontSize: '12px', boxShadow: 'var(--sombra-2)',
    maxWidth: '260px', transition: 'opacity .1s',
  });
  document.body.appendChild(globoActivo);
  return globoActivo;
}

/** Muestra el globo al pasar el puntero sobre una marca. */
function conGlobo(nodo, contenido) {
  nodo.style.cursor = 'default';
  const mostrar = (e) => {
    const g = globo();
    g.innerHTML = contenido;
    g.style.opacity = '1';
    const x = Math.min(e.clientX + 12, window.innerWidth - g.offsetWidth - 8);
    g.style.left = `${x}px`;
    g.style.top = `${Math.max(8, e.clientY - g.offsetHeight - 10)}px`;
  };
  nodo.addEventListener('mouseenter', mostrar);
  nodo.addEventListener('mousemove', mostrar);
  nodo.addEventListener('mouseleave', () => { if (globoActivo) globoActivo.style.opacity = '0'; });
  return nodo;
}

/* -------------------------------------------------------------- barras */

/**
 * Barras horizontales con etiqueta directa del valor.
 * @param {{etiqueta:string, valor:number, color?:string, detalle?:string}[]} datos
 */
export function barrasHorizontales(datos, opciones = {}) {
  const {
    ancho = 640, altoBarra = 26, separacion = 8,
    anchoEtiqueta = 190, sufijo = '', titulo = '', color = 'var(--acento)',
  } = opciones;
  const alto = Math.max(1, datos.length) * (altoBarra + separacion) + 6;
  const maximo = Math.max(1, ...datos.map((d) => d.valor));
  const x0 = anchoEtiqueta;
  const anchoUtil = ancho - x0 - 56;
  const svg = lienzo(ancho, alto, titulo);

  datos.forEach((d, i) => {
    const y = i * (altoBarra + separacion) + 3;
    const largo = Math.max(d.valor > 0 ? 3 : 0, (d.valor / maximo) * anchoUtil);
    const grupo = el('g', {});
    grupo.appendChild(texto(x0 - 10, y + altoBarra / 2, recortar(d.etiqueta, 30),
      { anclaje: 'end', fill: 'var(--texto)', peso: 550 }));
    grupo.appendChild(el('rect', {
      x: x0, y: y + 3, width: anchoUtil, height: altoBarra - 6,
      rx: 4, fill: 'var(--superficie-3)',
    }));
    grupo.appendChild(el('rect', {
      x: x0, y: y + 3, width: largo, height: altoBarra - 6,
      rx: 4, fill: d.color || color,
    }));
    grupo.appendChild(texto(x0 + largo + 8, y + altoBarra / 2, `${formatoNumero(d.valor)}${sufijo}`,
      { fill: 'var(--texto)', peso: 650 }));
    conGlobo(grupo, `<strong>${escapar(d.etiqueta)}</strong><br>${formatoNumero(d.valor)}${escapar(sufijo)}`
      + (d.detalle ? `<br><span style="color:var(--texto-suave)">${escapar(d.detalle)}</span>` : ''));
    svg.appendChild(grupo);
  });

  return envolver(svg);
}

/**
 * Barras verticales para una serie temporal discreta (por ejemplo, cierres por semana).
 * @param {{etiqueta:string, valor:number, detalle?:string}[]} datos
 */
export function barrasVerticales(datos, opciones = {}) {
  const { ancho = 640, alto = 190, color = 'var(--acento)', titulo = '', sufijo = '' } = opciones;
  const margen = { arriba: 16, abajo: 30, izq: 30, der: 8 };
  const anchoUtil = ancho - margen.izq - margen.der;
  const altoUtil = alto - margen.arriba - margen.abajo;
  const maximo = Math.max(1, ...datos.map((d) => d.valor));
  const paso = anchoUtil / Math.max(1, datos.length);
  const anchoBarra = Math.max(6, Math.min(46, paso - 10));
  const svg = lienzo(ancho, alto, titulo);

  // Rejilla discreta y recesiva: solo tres referencias.
  for (let i = 0; i <= 2; i++) {
    const valor = Math.round((maximo / 2) * i);
    const y = margen.arriba + altoUtil - (valor / maximo) * altoUtil;
    svg.appendChild(el('line', {
      x1: margen.izq, x2: ancho - margen.der, y1: y, y2: y,
      stroke: 'var(--borde)', 'stroke-width': 1,
    }));
    svg.appendChild(texto(margen.izq - 8, y, String(valor), { anclaje: 'end', fill: 'var(--texto-tenue)', tamano: 10 }));
  }

  datos.forEach((d, i) => {
    const x = margen.izq + i * paso + (paso - anchoBarra) / 2;
    const altura = Math.max(d.valor > 0 ? 3 : 0, (d.valor / maximo) * altoUtil);
    const y = margen.arriba + altoUtil - altura;
    const grupo = el('g', {});
    grupo.appendChild(el('rect', { x, y, width: anchoBarra, height: altura, rx: 4, fill: color }));
    if (d.valor > 0) {
      grupo.appendChild(texto(x + anchoBarra / 2, y - 8, formatoNumero(d.valor),
        { anclaje: 'middle', fill: 'var(--texto)', peso: 650, tamano: 10.5 }));
    }
    grupo.appendChild(texto(x + anchoBarra / 2, alto - 10, d.etiqueta,
      { anclaje: 'middle', fill: 'var(--texto-tenue)', tamano: 10 }));
    conGlobo(grupo, `<strong>${escapar(d.etiqueta)}</strong><br>${formatoNumero(d.valor)}${escapar(sufijo)}`
      + (d.detalle ? `<br><span style="color:var(--texto-suave)">${escapar(d.detalle)}</span>` : ''));
    svg.appendChild(grupo);
  });

  return envolver(svg);
}

/**
 * Barra apilada de una sola fila para una composición (tareas por estado).
 * Deja 2 px de superficie entre segmentos y lleva leyenda con los valores.
 * @param {{etiqueta:string, valor:number, color:string}[]} segmentos
 */
export function barraApilada(segmentos, opciones = {}) {
  const { ancho = 640, alto = 30 } = opciones;
  const total = segmentos.reduce((s, x) => s + x.valor, 0);
  const svg = lienzo(ancho, alto, opciones.titulo || '');
  if (!total) {
    svg.appendChild(el('rect', { x: 0, y: 0, width: ancho, height: alto, rx: 6, fill: 'var(--superficie-3)' }));
    return envolver(svg);
  }
  let x = 0;
  for (const segmento of segmentos) {
    if (!segmento.valor) continue;
    const w = (segmento.valor / total) * ancho;
    const grupo = el('g', {});
    grupo.appendChild(el('rect', {
      x, y: 0, width: Math.max(2, w - 2), height: alto, rx: 4, fill: segmento.color,
    }));
    if (w > 34) {
      grupo.appendChild(texto(x + (w - 2) / 2, alto / 2, String(segmento.valor),
        { anclaje: 'middle', fill: 'var(--superficie)', peso: 700, tamano: 11.5 }));
    }
    conGlobo(grupo, `<strong>${escapar(segmento.etiqueta)}</strong><br>${segmento.valor} de ${total} · ${Math.round((segmento.valor / total) * 100)}%`);
    svg.appendChild(grupo);
    x += w;
  }
  return envolver(svg);
}

/** Leyenda en HTML: muestra de color + nombre + valor. Nunca color a secas. */
export function leyenda(items) {
  const div = document.createElement('div');
  div.className = 'leyenda';
  for (const item of items) {
    const fila = document.createElement('span');
    const muestra = document.createElement('span');
    muestra.className = 'muestra';
    muestra.style.background = item.color;
    fila.appendChild(muestra);
    fila.appendChild(document.createTextNode(
      item.valor === undefined ? item.etiqueta : `${item.etiqueta} · ${item.valor}`));
    div.appendChild(fila);
  }
  return div;
}

/**
 * Medidor circular para un único valor acotado de 0 a 100 (índice de salud).
 * No es un gráfico de torta: es un indicador de un solo número, con el número
 * escrito al centro.
 */
export function medidor(valor, opciones = {}) {
  const { tamano = 118, color = 'var(--verde)', etiqueta = '' } = opciones;
  const radio = tamano / 2 - 9;
  const centro = tamano / 2;
  const circunferencia = 2 * Math.PI * radio;
  const proporcion = Math.max(0, Math.min(100, valor)) / 100;
  const svg = lienzo(tamano, tamano, `${etiqueta}: ${valor} de 100`);
  svg.appendChild(el('circle', {
    cx: centro, cy: centro, r: radio, fill: 'none',
    stroke: 'var(--superficie-3)', 'stroke-width': 9,
  }));
  svg.appendChild(el('circle', {
    cx: centro, cy: centro, r: radio, fill: 'none',
    stroke: color, 'stroke-width': 9, 'stroke-linecap': 'round',
    'stroke-dasharray': `${circunferencia * proporcion} ${circunferencia}`,
    transform: `rotate(-90 ${centro} ${centro})`,
  }));
  svg.appendChild(texto(centro, centro - 3, String(Math.round(valor)),
    { anclaje: 'middle', fill: 'var(--texto)', peso: 700, tamano: 25 }));
  if (etiqueta) {
    svg.appendChild(texto(centro, centro + 17, etiqueta,
      { anclaje: 'middle', fill: 'var(--texto-tenue)', tamano: 10 }));
  }
  return envolver(svg);
}

/**
 * Carta Gantt sencilla.
 * @param {{etiqueta:string, desde:string, hasta:string, color?:string, avance?:number,
 *          atrasada?:boolean, detalle?:string, sangria?:boolean}[]} filas
 */
export function gantt(filas, opciones = {}) {
  const {
    desde, hasta, hoy, ancho = 900, altoFila = 26,
    anchoEtiqueta = 230, marcas = [],
  } = opciones;
  const alto = filas.length * altoFila + 34;
  const x0 = anchoEtiqueta;
  const anchoUtil = ancho - x0 - 16;
  const total = Math.max(1, dias(desde, hasta));
  const posicion = (fecha) => x0 + (Math.max(0, Math.min(total, dias(desde, fecha))) / total) * anchoUtil;
  const svg = lienzo(ancho, alto, 'Carta Gantt de la iniciativa');
  svg.classList.add('gantt');

  // Escala de tiempo arriba.
  for (const marca of marcas) {
    const x = posicion(marca.fecha);
    svg.appendChild(el('line', {
      x1: x, x2: x, y1: 22, y2: alto - 6, stroke: 'var(--borde)', 'stroke-width': 1,
    }));
    svg.appendChild(texto(x + 4, 12, marca.etiqueta, { fill: 'var(--texto-tenue)', tamano: 10 }));
  }

  filas.forEach((fila, i) => {
    const y = 24 + i * altoFila;
    const grupo = el('g', { class: 'gantt__fila' });
    grupo.appendChild(el('rect', {
      class: 'fondo', x: 0, y, width: ancho, height: altoFila, fill: 'transparent',
    }));
    grupo.appendChild(texto(fila.sangria ? 18 : 4, y + altoFila / 2, recortar(fila.etiqueta, fila.sangria ? 34 : 30), {
      fill: fila.sangria ? 'var(--texto-suave)' : 'var(--texto)',
      peso: fila.sangria ? 500 : 650,
      tamano: fila.sangria ? 10.5 : 11.5,
    }));

    if (fila.desde && fila.hasta) {
      const xa = posicion(fila.desde);
      const xb = Math.max(xa + 4, posicion(fila.hasta));
      const color = fila.color || 'var(--acento)';
      grupo.appendChild(el('rect', {
        x: xa, y: y + 6, width: xb - xa, height: altoFila - 12, rx: 4,
        fill: color, 'fill-opacity': fila.sangria ? 0.35 : 0.25,
        stroke: color, 'stroke-width': 1,
      }));
      if (fila.avance) {
        grupo.appendChild(el('rect', {
          x: xa, y: y + 6, width: (xb - xa) * (Math.min(100, fila.avance) / 100),
          height: altoFila - 12, rx: 4, fill: color,
        }));
      }
      if (fila.atrasada) {
        grupo.appendChild(el('circle', {
          cx: xb + 7, cy: y + altoFila / 2, r: 3.5, fill: 'var(--rojo)',
          stroke: 'var(--superficie)', 'stroke-width': 2,
        }));
      }
      conGlobo(grupo, `<strong>${escapar(fila.etiqueta)}</strong><br>${escapar(fila.detalle || '')}`);
    }
    svg.appendChild(grupo);
  });

  // Línea de hoy, por encima de todo.
  if (hoy) {
    const x = posicion(hoy);
    svg.appendChild(el('line', {
      x1: x, x2: x, y1: 18, y2: alto - 4,
      stroke: 'var(--rojo)', 'stroke-width': 1.6, 'stroke-dasharray': '3 3',
    }));
    svg.appendChild(texto(x + 5, 12, 'hoy', { fill: 'var(--rojo)', tamano: 10, peso: 650 }));
  }

  return envolver(svg, true);
}

/* ------------------------------------------------------------ utilidad */

function envolver(svg, desplazable = false) {
  const caja = document.createElement('div');
  caja.className = 'grafico';
  if (desplazable) svg.style.minWidth = '720px';
  caja.appendChild(svg);
  return caja;
}

function dias(a, b) {
  const fa = new Date(a);
  const fb = new Date(b);
  return Math.round((fb - fa) / 86400000);
}

function recortar(texto, largo) {
  const t = String(texto || '');
  return t.length > largo ? `${t.slice(0, largo - 1)}…` : t;
}

function formatoNumero(n) {
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

function escapar(t) {
  return String(t || '').replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
