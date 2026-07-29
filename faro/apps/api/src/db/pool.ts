import pg from 'pg';
import { config } from '../config.ts';

/**
 * Pool de conexiones.
 *
 * `timestamptz` se devuelve como string ISO en vez de Date: evita que la zona
 * horaria del proceso reinterprete silenciosamente los instantes al serializar
 * a JSON, que es una fuente clásica de métricas desplazadas en un día.
 */
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (valor) => new Date(valor).toISOString());
pg.types.setTypeParser(pg.types.builtins.DATE, (valor) => valor);
// bigint: los COUNT(*) vuelven como string para no perder precisión; aquí los
// volúmenes están muy por debajo de 2^53, así que se convierten a número.
pg.types.setTypeParser(pg.types.builtins.INT8, (valor) => Number(valor));

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export type Consultable = Pick<pg.PoolClient, 'query'>;

export async function consultar<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  parametros: unknown[] = [],
  cliente: Consultable = pool,
): Promise<T[]> {
  const resultado = await cliente.query<T>(sql, parametros);
  return resultado.rows;
}

export async function consultarUno<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  parametros: unknown[] = [],
  cliente: Consultable = pool,
): Promise<T | null> {
  const filas = await consultar<T>(sql, parametros, cliente);
  return filas[0] ?? null;
}

/** Ejecuta `fn` dentro de una transacción, con rollback ante cualquier error. */
export async function enTransaccion<T>(fn: (cliente: pg.PoolClient) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}
