/**
 * Migrador.
 *
 * Aplica los .sql de ./migrations en orden y registra cuáles ya corrieron.
 * Deliberadamente simple: sin generación de código ni introspección, para que
 * lo que se aplica en la base sea exactamente lo que un DBA leyó y aprobó.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pool } from './pool.ts';

const directorio = resolve(import.meta.dirname, 'migrations');

async function asegurarTablaDeControl(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      nombre     text PRIMARY KEY,
      aplicada_en timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function reset(): Promise<void> {
  console.log('Eliminando y recreando el esquema public…');
  await pool.query('DROP SCHEMA public CASCADE');
  await pool.query('CREATE SCHEMA public');
}

async function migrar(): Promise<void> {
  if (process.argv.includes('--reset')) await reset();

  await asegurarTablaDeControl();

  const aplicadas = new Set(
    (await pool.query<{ nombre: string }>('SELECT nombre FROM schema_migrations')).rows.map(
      (f) => f.nombre,
    ),
  );

  const archivos = readdirSync(directorio)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let cuenta = 0;
  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) continue;

    const sql = readFileSync(resolve(directorio, archivo), 'utf8');
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query(sql);
      await cliente.query('INSERT INTO schema_migrations (nombre) VALUES ($1)', [archivo]);
      await cliente.query('COMMIT');
      console.log(`  ✓ ${archivo}`);
      cuenta++;
    } catch (error) {
      await cliente.query('ROLLBACK');
      console.error(`  ✗ ${archivo}`);
      throw error;
    } finally {
      cliente.release();
    }
  }

  console.log(cuenta === 0 ? 'Sin migraciones pendientes.' : `${cuenta} migración(es) aplicada(s).`);
}

migrar()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
