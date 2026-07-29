import { readFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, beforeAll } from 'vitest';
import { canonicalizar, hashContenido } from '../canonicalize.ts';
import { crearFirmante, pemABase64, verificarEnNode } from '../sign.node.ts';
import { importarClavePublica, limpiarCacheDeClave, verificarCampana } from '../verify.web.ts';

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const contenido = {
  templateKey: 'huincha_alerta_v1',
  campos: {
    severidad: 'critica',
    icono: 'alerta',
    titulo: 'App móvil con intermitencia',
    cuerpo: 'Equipos trabajando en la solución.',
    cta: null,
  },
};

describe('canonicalización', () => {
  it('es independiente del orden de inserción de las claves', () => {
    const a = { alfa: 1, beta: { x: 'uno', y: [1, 2] } };
    const b = { beta: { y: [1, 2], x: 'uno' }, alfa: 1 };
    expect(canonicalizar(a)).toBe(canonicalizar(b));
  });

  it('conserva el orden de los arreglos, que sí es significativo', () => {
    expect(canonicalizar([1, 2])).not.toBe(canonicalizar([2, 1]));
  });

  it('omite las claves con valor undefined en vez de romperse', () => {
    expect(canonicalizar({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('rechaza valores sin representación JSON estable', () => {
    expect(() => canonicalizar({ a: NaN })).toThrow();
    expect(() => canonicalizar({ a: () => 1 })).toThrow();
  });

  it('produce un hash hexadecimal de 64 caracteres', async () => {
    const hash = await hashContenido(contenido);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('firma y verificación entre Node y WebCrypto', () => {
  let clavePublica: CryptoKey;

  beforeAll(async () => {
    limpiarCacheDeClave();
    clavePublica = await importarClavePublica(pemABase64(publicKey));
  });

  it('una firma emitida en el servidor se verifica en el navegador', async () => {
    // Esta es la prueba que importa: Node emite DER por defecto y WebCrypto
    // espera IEEE P1363. Si alguien quita `dsaEncoding`, Node sigue validando
    // su propia firma y solo el navegador la rechaza — en producción.
    const firmante = crearFirmante(privateKey);
    const { contentHash, signature } = await firmante.firmar(contenido);

    expect(await verificarCampana(contenido, contentHash, signature, clavePublica)).toBe(true);
  });

  it('rechaza contenido alterado aunque el hash y la firma vengan intactos', async () => {
    const firmante = crearFirmante(privateKey);
    const { contentHash, signature } = await firmante.firmar(contenido);

    const alterado = {
      ...contenido,
      campos: { ...contenido.campos, titulo: 'Promoción: crédito al 0%' },
    };

    // El verificador recalcula el hash en lugar de confiar en el recibido.
    expect(await verificarCampana(alterado, contentHash, signature, clavePublica)).toBe(false);
  });

  it('rechaza una firma de otra clave', async () => {
    const otra = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const { contentHash, signature } = await crearFirmante(otra.privateKey).firmar(contenido);

    expect(await verificarCampana(contenido, contentHash, signature, clavePublica)).toBe(false);
  });

  it('rechaza una firma corrupta sin lanzar excepción (fail-closed)', async () => {
    const resultado = await verificarCampana(contenido, 'x'.repeat(64), 'no-es-base64!!', clavePublica);
    expect(resultado).toBe(false);
  });

  it('verificarEnNode coincide con la verificación del navegador', async () => {
    const { contentHash, signature } = await crearFirmante(privateKey).firmar(contenido);
    expect(await verificarEnNode(contenido, contentHash, signature, publicKey)).toBe(true);
  });
});
