import { describe, expect, it } from 'vitest';
import { contenidoCampana, contenidoHuincha } from '../templates/registry.ts';
import { parsearTextoEnriquecido, textoLlano } from '../richtext.ts';
import { urlSegura } from '../primitives.ts';

describe('plantillas: el contenido no puede transportar marcado', () => {
  it('acepta un título con caracteres que parecen HTML — como texto', () => {
    // No se rechaza: se le quita todo significado. El renderer usa textContent,
    // así que esto llega al DOM como texto visible, que es exactamente lo que
    // queremos demostrarle a Seguridad.
    const resultado = contenidoHuincha.parse({
      severidad: 'critica',
      icono: 'alerta',
      titulo: '<img src=x onerror=alert(1)>',
      cuerpo: '',
      cta: null,
    });
    expect(resultado.titulo).toBe('<img src=x onerror=alert(1)>');
  });

  it('rechaza campos no declarados en el contenido', () => {
    expect(() =>
      contenidoHuincha.parse({
        severidad: 'info',
        icono: 'info',
        titulo: 'Aviso',
        html: '<script>alert(1)</script>',
      }),
    ).toThrow();
  });

  it('rechaza títulos que exceden el límite', () => {
    expect(() =>
      contenidoHuincha.parse({
        severidad: 'info',
        icono: 'info',
        titulo: 'x'.repeat(81),
      }),
    ).toThrow();
  });

  it('rechaza overrides de dirección de texto', () => {
    // U+202E invierte la dirección: permite que un texto se vea distinto de lo
    // que es, engañando al aprobador que lo revisa.
    expect(() =>
      contenidoHuincha.parse({
        severidad: 'info',
        icono: 'info',
        titulo: `Aviso normal‮otxet odacifsid`,
      }),
    ).toThrow();
  });

  it('valida el contenido según la plantilla declarada', () => {
    expect(() =>
      contenidoCampana.parse({
        templateKey: 'huincha_alerta_v1',
        campos: {
          severidad: 'critica',
          icono: 'alerta',
          titulo: 'App móvil con intermitencia',
          cuerpo: 'Equipos trabajando en la solución.',
          cta: {
            id: 'ver_detalle',
            label: 'Ver detalle',
            accion: { kind: 'abrir_url', url: 'https://intranet.banco.cl/estado' },
          },
        },
      }),
    ).not.toThrow();
  });
});

describe('urlSegura', () => {
  it('rechaza esquemas peligrosos', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'blob:https://banco.cl/abc',
      'file:///etc/passwd',
    ]) {
      expect(urlSegura.safeParse(url).success, url).toBe(false);
    }
  });

  it('rechaza credenciales embebidas', () => {
    expect(urlSegura.safeParse('https://user:pass@banco.cl/').success).toBe(false);
  });

  it('acepta https corporativo', () => {
    expect(urlSegura.safeParse('https://intranet.banco.cl/estado?id=4').success).toBe(true);
  });
});

describe('marcado restringido', () => {
  it('produce segmentos, nunca HTML', () => {
    const parrafos = parsearTextoEnriquecido('Hola *mundo* y _chao_');
    expect(parrafos).toHaveLength(1);
    expect(parrafos[0]).toEqual([
      { texto: 'Hola ', negrita: false, cursiva: false },
      { texto: 'mundo', negrita: true, cursiva: false },
      { texto: ' y ', negrita: false, cursiva: false },
      { texto: 'chao', negrita: false, cursiva: true },
    ]);
  });

  it('trata un marcador sin cierre como texto literal', () => {
    const parrafos = parsearTextoEnriquecido('2 * 3 = 6');
    expect(textoLlano('2 * 3 = 6')).toBe('2 * 3 = 6');
    expect(parrafos[0]!.every((s) => !s.negrita)).toBe(true);
  });

  it('separa párrafos por salto de línea', () => {
    expect(parsearTextoEnriquecido('uno\ndos')).toHaveLength(2);
  });
});
