import { describe, expect, it } from 'vitest';
import { CLAVES_EVENTO_PERMITIDAS, eventoCliente, loteEventos } from '../events.ts';

/**
 * Prueba de contrato de privacidad.
 *
 * Esta suite existe para que un cambio futuro no pueda ampliar silenciosamente
 * lo que la extensión reporta. Si alguien agrega un campo al esquema de eventos
 * que pueda contener una URL, el título de una página o texto libre, estas
 * pruebas fallan y el cambio no llega a producción sin una conversación.
 */

const eventoValido = {
  eventId: '11111111-1111-4111-8111-111111111111',
  tipo: 'impresion' as const,
  campaignId: '22222222-2222-4222-8222-222222222222',
  campaignVersion: 1,
  variante: 'target' as const,
  formato: 'huincha' as const,
  ctaId: 'ver_detalle',
  dwellMs: 4200,
  motivoSupresion: null,
  codigoError: null,
  ocurridoEn: '2026-07-29T12:00:00.000Z',
  sessionId: '33333333-3333-4333-8333-333333333333',
  seq: 7,
};

describe('contrato de privacidad del esquema de eventos', () => {
  it('acepta un evento bien formado', () => {
    expect(() => eventoCliente.parse(eventoValido)).not.toThrow();
  });

  it('RECHAZA cualquier campo no declarado', () => {
    // Este es el control central: aunque alguien lograra adjuntar la URL de la
    // página al evento, el esquema estricto lo rechaza antes de que salga.
    const conUrl = { ...eventoValido, pageUrl: 'https://intranet.banco.cl/cliente/12345' };
    expect(() => eventoCliente.parse(conUrl)).toThrow();

    const conTitulo = { ...eventoValido, documentTitle: 'Ficha de cliente' };
    expect(() => eventoCliente.parse(conTitulo)).toThrow();

    const conReferrer = { ...eventoValido, referrer: 'https://crm.banco.cl' };
    expect(() => eventoCliente.parse(conReferrer)).toThrow();
  });

  it('el lote también rechaza campos no declarados', () => {
    const lote = {
      installId: '44444444-4444-4444-8444-444444444444',
      enviadoEn: '2026-07-29T12:00:05.000Z',
      extensionVersion: '0.1.0',
      eventos: [eventoValido],
      origenNavegado: 'https://intranet.banco.cl',
    };
    expect(() => loteEventos.parse(lote)).toThrow();
  });

  it('ningún campo del esquema tiene nombre asociado a navegación', () => {
    const prohibidos = [
      'url',
      'href',
      'link',
      'page',
      'referrer',
      'origin',
      'host',
      'domain',
      'path',
      'title',
      'query',
      'search',
    ];

    for (const clave of CLAVES_EVENTO_PERMITIDAS) {
      const normalizada = clave.toLowerCase();
      for (const prohibido of prohibidos) {
        expect(
          normalizada.includes(prohibido),
          `El campo "${clave}" sugiere que transporta datos de navegación. ` +
            'Si es intencional, hay que pasar por revisión de privacidad primero.',
        ).toBe(false);
      }
    }
  });

  it('la lista blanca de claves coincide exactamente con el esquema', () => {
    const clavesDelEsquema = Object.keys(eventoCliente.shape).sort();
    const listaBlanca = [...CLAVES_EVENTO_PERMITIDAS].sort();
    // Si divergieran, el puente del content script filtraría campos válidos o
    // dejaría pasar campos nuevos sin revisar.
    expect(listaBlanca).toEqual(clavesDelEsquema);
  });

  it('acota el tiempo visible a 10 minutos', () => {
    expect(() => eventoCliente.parse({ ...eventoValido, dwellMs: 600_001 })).toThrow();
  });

  it('el código de error es un catálogo cerrado, no texto libre', () => {
    // Los stack traces arrastran URLs; por eso el error es un enum.
    expect(() =>
      eventoCliente.parse({ ...eventoValido, codigoError: 'Error at https://crm.banco.cl/app.js:42' }),
    ).toThrow();
    expect(() =>
      eventoCliente.parse({ ...eventoValido, tipo: 'error', codigoError: 'fallo_render' }),
    ).not.toThrow();
  });
});
