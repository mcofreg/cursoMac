import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import estaticos from '@fastify/static';
import { config } from './config.ts';
import { pool } from './db/pool.ts';
import { rutasDispositivo } from './routes/dispositivo.ts';
import { rutasAdmin } from './routes/admin.ts';
import { mantenimientoDiario, rutasAnalytics } from './routes/analytics.ts';
import { MAX_BYTES } from './security/assets.ts';

export async function construirServidor() {
  const app = Fastify({
    logger: { level: config.NODE_ENV === 'test' ? 'silent' : 'info' },
    bodyLimit: 1024 * 512,
    trustProxy: true,
  });

  await app.register(helmet, {
    // Las respuestas de esta API son JSON e imágenes; nada de esto se ejecuta
    // como documento, pero la CSP estricta cierra el caso de que un navegador
    // decida renderizar algo por su cuenta.
    contentSecurityPolicy: {
      directives: { defaultSrc: ["'none'"], imgSrc: ["'self'"], frameAncestors: ["'none'"] },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(cors, {
    origin: (origen, cb) => {
      // Sin origen: peticiones del service worker de la extensión.
      if (!origen) return cb(null, true);
      if (origen === config.ADMIN_PUBLIC_URL) return cb(null, true);
      if (origen.startsWith('chrome-extension://')) return cb(null, true);
      if (config.NODE_ENV === 'development' && origen.startsWith('http://localhost')) {
        return cb(null, true);
      }
      cb(new Error('Origen no permitido'), false);
    },
    credentials: true,
    allowedHeaders: ['content-type', 'authorization', 'x-csrf-token', 'if-none-match'],
    exposedHeaders: ['etag'],
  });

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: MAX_BYTES, files: 1 } });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    // Por dispositivo cuando hay token; por IP en el resto.
    keyGenerator: (request) => {
      const auth = request.headers.authorization;
      return auth ? `bearer:${auth.slice(-24)}` : request.ip;
    },
  });

  // Imágenes de campaña, servidas con cabeceras defensivas.
  const directorioUploads = resolve(config.raizProyecto, config.STORAGE_LOCAL_PATH);
  mkdirSync(directorioUploads, { recursive: true });
  await app.register(estaticos, {
    root: directorioUploads,
    prefix: '/assets/',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  });

  app.get('/salud', async () => {
    await pool.query('SELECT 1');
    return { ok: true, modoAuth: config.AUTH_MODE, entorno: config.NODE_ENV };
  });

  await app.register(rutasDispositivo);
  await app.register(async (instancia) => {
    await rutasAdmin(instancia);
    await rutasAnalytics(instancia);
  });

  return app;
}

async function main(): Promise<void> {
  const app = await construirServidor();

  await mantenimientoDiario();
  const mantenimiento = setInterval(() => {
    mantenimientoDiario().catch((error) => app.log.error(error, 'Falló el mantenimiento diario'));
  }, 6 * 3_600_000);

  const cerrar = async () => {
    clearInterval(mantenimiento);
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);

  await app.listen({ port: config.API_PORT, host: config.API_HOST });
  app.log.info(`Faro API en ${config.API_PUBLIC_URL} (auth: ${config.AUTH_MODE})`);
}

// Solo arranca si se ejecuta directamente; los tests importan construirServidor.
if (process.argv[1]?.endsWith('server.ts')) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
