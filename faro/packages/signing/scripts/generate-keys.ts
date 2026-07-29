/**
 * Genera el par de claves ECDSA P-256 para firmar el contenido de campañas.
 *
 *   pnpm keys:generate
 *
 * La privada queda en ./keys (ignorada por git); la pública se embebe en la
 * extensión. En producción la privada nunca se genera así: vive en el KMS/HSM
 * del banco y solo se exporta la pública.
 */
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = resolve(process.cwd());
const directorio = resolve(raiz, 'keys');
const rutaPrivada = resolve(directorio, 'signing-private.pem');
const rutaPublica = resolve(directorio, 'signing-public.pem');
const rutaPublicaBase64 = resolve(directorio, 'signing-public.b64');

if (existsSync(rutaPrivada) && !process.argv.includes('--force')) {
  console.log(`Ya existe ${rutaPrivada}. Usa --force para regenerar.`);
  console.log('Regenerar invalida todas las campañas ya firmadas.');
  process.exit(0);
}

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

mkdirSync(directorio, { recursive: true });
writeFileSync(rutaPrivada, privateKey, { mode: 0o600 });
writeFileSync(rutaPublica, publicKey, { mode: 0o644 });

const base64 = publicKey.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
writeFileSync(rutaPublicaBase64, base64, { mode: 0o644 });

console.log('Par de claves ECDSA P-256 generado:');
console.log(`  privada  ${rutaPrivada}  (modo 600, ignorada por git)`);
console.log(`  pública  ${rutaPublica}`);
console.log(`  pública en base64 (para la extensión): ${rutaPublicaBase64}`);
