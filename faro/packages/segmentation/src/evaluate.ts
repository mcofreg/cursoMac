import type { Condicion, PerfilUsuario, ReglaAudiencia } from '@faro/contracts';

/**
 * Intérprete del lenguaje de segmentación.
 *
 * Este módulo es isomorfo a propósito: el MISMO código decide la elegibilidad
 * dentro de la extensión y estima el alcance en el panel de administración.
 * Si las dos implementaciones divergieran, el "alcance estimado" que ve el
 * operador mentiría — y nadie se daría cuenta hasta después de publicar.
 */

function valorDe(perfil: PerfilUsuario, attr: Condicion['attr']): string | string[] | null {
  switch (attr) {
    case 'rol':
      return perfil.rol;
    case 'sucursal':
      return perfil.sucursal;
    case 'region':
      return perfil.region;
    case 'area':
      return perfil.area;
    case 'tags':
      return perfil.tags;
    case 'origenPerfil':
      return perfil.origenPerfil;
  }
}

function evaluarCondicion(condicion: Condicion, perfil: PerfilUsuario): boolean {
  const valor = valorDe(perfil, condicion.attr);

  if (condicion.op === 'exists') {
    if (Array.isArray(valor)) return valor.length > 0;
    return valor !== null && valor !== '';
  }

  // Un atributo ausente no satisface ninguna comparación positiva, y satisface
  // las negativas: "no está en backoffice" es cierto si no tiene área asignada.
  if (valor === null) {
    return condicion.op === 'neq' || condicion.op === 'not_in';
  }

  const lista = Array.isArray(valor) ? valor : [valor];

  switch (condicion.op) {
    case 'eq':
      return lista.includes(condicion.value);
    case 'neq':
      return !lista.includes(condicion.value);
    case 'contains':
      return lista.some((v) => v.includes(condicion.value));
    case 'starts_with':
      return lista.some((v) => v.startsWith(condicion.value));
    case 'in':
      return lista.some((v) => condicion.values.includes(v));
    case 'not_in':
      return !lista.some((v) => condicion.values.includes(v));
  }
}

/** Una audiencia sin reglas alcanza a todo el parque. */
export function evaluarAudiencia(
  reglas: ReglaAudiencia | null | undefined,
  perfil: PerfilUsuario,
): boolean {
  if (reglas == null) return true;

  if ('all' in reglas) return reglas.all.every((r) => evaluarAudiencia(r, perfil));
  if ('any' in reglas) return reglas.any.some((r) => evaluarAudiencia(r, perfil));
  if ('not' in reglas) return !evaluarAudiencia(reglas.not, perfil);

  return evaluarCondicion(reglas, perfil);
}

/**
 * Traduce las reglas a SQL para estimar alcance sobre `install_profiles`.
 *
 * Devuelve la expresión y sus parámetros posicionales. Los valores nunca se
 * interpolan en el texto: la gramática es cerrada, pero la parametrización es
 * lo que garantiza que un nombre de sucursal no pueda convertirse en SQL.
 */
export function reglasASql(
  reglas: ReglaAudiencia | null | undefined,
  parametros: unknown[] = [],
): { sql: string; parametros: unknown[] } {
  if (reglas == null) return { sql: 'TRUE', parametros };

  if ('all' in reglas) {
    const partes = reglas.all.map((r) => reglasASql(r, parametros).sql);
    return { sql: `(${partes.join(' AND ')})`, parametros };
  }
  if ('any' in reglas) {
    const partes = reglas.any.map((r) => reglasASql(r, parametros).sql);
    return { sql: `(${partes.join(' OR ')})`, parametros };
  }
  if ('not' in reglas) {
    return { sql: `(NOT ${reglasASql(reglas.not, parametros).sql})`, parametros };
  }

  const columna = COLUMNA_POR_ATRIBUTO[reglas.attr];
  const esArreglo = reglas.attr === 'tags';

  const push = (valor: unknown) => {
    parametros.push(valor);
    return `$${parametros.length}`;
  };

  switch (reglas.op) {
    case 'exists':
      return {
        sql: esArreglo
          ? `(${columna} IS NOT NULL AND array_length(${columna}, 1) > 0)`
          : `(${columna} IS NOT NULL AND ${columna} <> '')`,
        parametros,
      };
    case 'eq':
      return {
        sql: esArreglo ? `(${push(reglas.value)} = ANY(${columna}))` : `(${columna} = ${push(reglas.value)})`,
        parametros,
      };
    case 'neq':
      return {
        sql: esArreglo
          ? `(NOT (${push(reglas.value)} = ANY(COALESCE(${columna}, '{}'))))`
          : `(${columna} IS DISTINCT FROM ${push(reglas.value)})`,
        parametros,
      };
    case 'contains':
      return {
        sql: esArreglo
          ? `(EXISTS (SELECT 1 FROM unnest(COALESCE(${columna}, '{}')) t WHERE t LIKE '%' || ${push(reglas.value)} || '%'))`
          : `(${columna} LIKE '%' || ${push(reglas.value)} || '%')`,
        parametros,
      };
    case 'starts_with':
      return {
        sql: esArreglo
          ? `(EXISTS (SELECT 1 FROM unnest(COALESCE(${columna}, '{}')) t WHERE t LIKE ${push(reglas.value)} || '%'))`
          : `(${columna} LIKE ${push(reglas.value)} || '%')`,
        parametros,
      };
    case 'in':
      return {
        sql: esArreglo
          ? `(COALESCE(${columna}, '{}') && ${push(reglas.values)}::text[])`
          : `(${columna} = ANY(${push(reglas.values)}::text[]))`,
        parametros,
      };
    case 'not_in':
      return {
        sql: esArreglo
          ? `(NOT (COALESCE(${columna}, '{}') && ${push(reglas.values)}::text[]))`
          : `(${columna} IS NULL OR NOT (${columna} = ANY(${push(reglas.values)}::text[])))`,
        parametros,
      };
  }
}

const COLUMNA_POR_ATRIBUTO: Record<Condicion['attr'], string> = {
  rol: 'p.rol',
  sucursal: 'p.sucursal',
  region: 'p.region',
  area: 'p.area',
  tags: 'p.tags',
  origenPerfil: 'p.origen_perfil',
};
