/**
 * Serialización canónica.
 *
 * Firmar `JSON.stringify(objeto)` es una trampa clásica: el orden de las claves
 * depende del orden de inserción, así que el mismo contenido lógico produce dos
 * bytes distintos y la verificación falla de forma intermitente — el peor tipo
 * de bug, porque solo aparece en producción y no se reproduce.
 *
 * Esta implementación ordena las claves recursivamente y rechaza los valores
 * que no tienen una representación JSON estable.
 */

export function canonicalizar(valor: unknown): string {
  return serializar(valor);
}

function serializar(valor: unknown): string {
  if (valor === null) return 'null';

  const tipo = typeof valor;

  if (tipo === 'number') {
    if (!Number.isFinite(valor as number)) {
      throw new Error('No se puede canonicalizar un número no finito');
    }
    // Number.prototype.toString ya da la representación más corta que
    // round-trippea; JSON.stringify coincide con ella para finitos.
    return JSON.stringify(valor);
  }

  if (tipo === 'boolean' || tipo === 'string') return JSON.stringify(valor);

  if (tipo === 'undefined' || tipo === 'function' || tipo === 'symbol') {
    throw new Error(`No se puede canonicalizar un valor de tipo ${tipo}`);
  }

  if (Array.isArray(valor)) {
    return `[${valor.map(serializar).join(',')}]`;
  }

  if (tipo === 'object') {
    const objeto = valor as Record<string, unknown>;
    const claves = Object.keys(objeto)
      .filter((k) => objeto[k] !== undefined)
      .sort();
    const partes = claves.map((k) => `${JSON.stringify(k)}:${serializar(objeto[k])}`);
    return `{${partes.join(',')}}`;
  }

  throw new Error(`Tipo no soportado: ${tipo}`);
}

/** SHA-256 hexadecimal de la forma canónica. Es lo que se firma. */
export async function hashContenido(valor: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizar(valor));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
