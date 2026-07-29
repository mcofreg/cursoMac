import { config as cargarEnv } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const raizProyecto = resolve(import.meta.dirname, '../../..');
cargarEnv({ path: resolve(raizProyecto, '.env'), quiet: true });

const listaCsv = (valor: string) =>
  valor
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().default('postgresql://faro:faro@localhost:5432/faro'),

  API_PORT: z.coerce.number().int().default(3000),
  API_HOST: z.string().default('0.0.0.0'),
  API_PUBLIC_URL: z.string().default('http://localhost:3000'),
  ADMIN_PUBLIC_URL: z.string().default('http://localhost:5173'),

  AUTH_MODE: z.enum(['dev', 'oidc']).default('dev'),
  OIDC_ISSUER: z.string().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),

  SESSION_SECRET: z.string().min(16).default('desarrollo-inseguro-cambiar-en-produccion'),
  DEVICE_TOKEN_TTL_HOURS: z.coerce.number().int().default(24),

  SIGNING_PRIVATE_KEY_PATH: z.string().default('./keys/signing-private.pem'),
  SIGNING_PUBLIC_KEY_PATH: z.string().default('./keys/signing-public.pem'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./uploads'),
  ASSET_PUBLIC_URL: z.string().default('http://localhost:3000/assets'),

  CTA_URL_ALLOWLIST: z.string().default('localhost'),
  INJECTION_ORIGINS: z.string().default('http://localhost:8080'),

  AGGREGATE_METRICS_ONLY: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  EVENT_RETENTION_DAYS: z.coerce.number().int().default(90),
});

const crudo = esquema.parse(process.env);

function leerClave(ruta: string): string | null {
  const absoluta = resolve(raizProyecto, ruta);
  return existsSync(absoluta) ? readFileSync(absoluta, 'utf8') : null;
}

const clavePrivada = leerClave(crudo.SIGNING_PRIVATE_KEY_PATH);
const clavePublica = leerClave(crudo.SIGNING_PUBLIC_KEY_PATH);

if (crudo.NODE_ENV === 'production') {
  if (!clavePrivada) throw new Error('Falta la clave de firma en producción');
  if (crudo.SESSION_SECRET.startsWith('desarrollo-')) {
    throw new Error('SESSION_SECRET no puede quedar en el valor de desarrollo');
  }
  if (crudo.AUTH_MODE === 'dev') {
    throw new Error('AUTH_MODE=dev no está permitido en producción');
  }
}

export const config = {
  ...crudo,
  raizProyecto,
  clavePrivada,
  clavePublica,
  /** Dominios permitidos como destino de un botón de acción. */
  ctaAllowlist: listaCsv(crudo.CTA_URL_ALLOWLIST),
  /** Orígenes donde la extensión puede inyectar. */
  origenesInyeccion: listaCsv(crudo.INJECTION_ORIGINS),

  /** Configuración operacional que se envía a cada extensión. */
  configCliente: {
    pollSegundos: 60,
    pollRapidoSegundos: 30,
    latidoSegundos: 21_600,
    flushEventosSegundos: 300,
    maxLote: 50,
  },
} as const;

export type Config = typeof config;
