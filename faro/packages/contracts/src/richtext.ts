/**
 * Marcado restringido propio.
 *
 * El negocio pide negritas. La tentación es usar una librería de Markdown —
 * pero todas emiten HTML, y ahí es donde entra el XSS. Este parser produce una
 * lista de segmentos que el renderer convierte en NODOS DOM con `textContent`.
 * En ningún punto de la cadena existe una cadena de HTML.
 *
 * Sintaxis: *negrita*, _cursiva_. Nada más — deliberadamente.
 */

export type SegmentoTexto = {
  texto: string;
  negrita: boolean;
  cursiva: boolean;
};

/** Un párrafo es una lista de segmentos; el texto se separa por saltos de línea. */
export type ParrafoTexto = SegmentoTexto[];

const MARCADORES: Record<string, keyof Omit<SegmentoTexto, 'texto'>> = {
  '*': 'negrita',
  _: 'cursiva',
};

/**
 * Convierte texto plano con marcado restringido en párrafos de segmentos.
 * Un marcador sin cierre se trata como texto literal, no como error.
 */
export function parsearTextoEnriquecido(entrada: string): ParrafoTexto[] {
  return entrada.split('\n').map(parsearLinea);
}

function parsearLinea(linea: string): ParrafoTexto {
  const segmentos: SegmentoTexto[] = [];
  const activo = { negrita: false, cursiva: false };
  let buffer = '';

  const volcar = () => {
    if (buffer.length === 0) return;
    segmentos.push({ texto: buffer, negrita: activo.negrita, cursiva: activo.cursiva });
    buffer = '';
  };

  for (let i = 0; i < linea.length; i++) {
    const caracter = linea[i]!;
    const propiedad = MARCADORES[caracter];

    if (propiedad === undefined) {
      buffer += caracter;
      continue;
    }

    if (activo[propiedad]) {
      // Cierre.
      volcar();
      activo[propiedad] = false;
      continue;
    }

    // Apertura: solo si existe un cierre más adelante en la misma línea.
    if (linea.indexOf(caracter, i + 1) === -1) {
      buffer += caracter;
      continue;
    }

    volcar();
    activo[propiedad] = true;
  }

  volcar();
  return segmentos.length > 0 ? segmentos : [{ texto: '', negrita: false, cursiva: false }];
}

/** Texto sin marcado, para previsualizaciones y para el panel lateral. */
export function textoLlano(entrada: string): string {
  return parsearTextoEnriquecido(entrada)
    .map((parrafo) => parrafo.map((s) => s.texto).join(''))
    .join('\n');
}
