import { describe, expect, it } from 'vitest';
import type { PerfilUsuario, ReglaAudiencia } from '@faro/contracts';
import { evaluarAudiencia } from '../evaluate.ts';
import { asignar, bucket } from '../bucket.ts';

const ejecutivo: PerfilUsuario = {
  rol: 'EJEC_COMERCIAL',
  sucursal: 'S001',
  region: 'RM',
  area: 'COMERCIAL',
  tags: ['piloto_hipotecario'],
  origenPerfil: 'verificado',
};

describe('evaluación de audiencia', () => {
  it('sin reglas alcanza a todo el parque', () => {
    expect(evaluarAudiencia(null, ejecutivo)).toBe(true);
  });

  it('evalúa una regla compuesta como la del plan', () => {
    const reglas: ReglaAudiencia = {
      all: [
        { attr: 'rol', op: 'in', values: ['EJEC_COMERCIAL', 'EJEC_CAJA'] },
        { attr: 'region', op: 'in', values: ['RM', 'V'] },
        {
          any: [
            { attr: 'sucursal', op: 'in', values: ['S001', 'S014'] },
            { attr: 'tags', op: 'contains', value: 'piloto' },
          ],
        },
        { not: { attr: 'area', op: 'eq', value: 'BACKOFFICE' } },
      ],
    };
    expect(evaluarAudiencia(reglas, ejecutivo)).toBe(true);
    expect(evaluarAudiencia(reglas, { ...ejecutivo, region: 'VIII' })).toBe(false);
    expect(evaluarAudiencia(reglas, { ...ejecutivo, area: 'BACKOFFICE' })).toBe(false);
  });

  it('busca dentro de los tags con in y contains', () => {
    expect(evaluarAudiencia({ attr: 'tags', op: 'in', values: ['piloto_hipotecario'] }, ejecutivo)).toBe(true);
    expect(evaluarAudiencia({ attr: 'tags', op: 'contains', value: 'hipotec' }, ejecutivo)).toBe(true);
    expect(evaluarAudiencia({ attr: 'tags', op: 'not_in', values: ['piloto_hipotecario'] }, ejecutivo)).toBe(false);
  });

  it('un atributo ausente no satisface comparaciones positivas', () => {
    const sinSucursal = { ...ejecutivo, sucursal: null };
    expect(evaluarAudiencia({ attr: 'sucursal', op: 'in', values: ['S001'] }, sinSucursal)).toBe(false);
    // …pero sí las negativas: "no está en S001" es cierto si no tiene sucursal.
    expect(evaluarAudiencia({ attr: 'sucursal', op: 'not_in', values: ['S001'] }, sinSucursal)).toBe(true);
    expect(evaluarAudiencia({ attr: 'sucursal', op: 'exists' }, sinSucursal)).toBe(false);
  });

  it('permite segmentar por origen del perfil', () => {
    // Útil cuando el SSO no entrega sucursal y hay que excluir auto-declarados
    // de una campaña sensible.
    expect(evaluarAudiencia({ attr: 'origenPerfil', op: 'eq', value: 'verificado' }, ejecutivo)).toBe(true);
  });
});

describe('asignación determinística a variante y rollout', () => {
  const idsSinteticos = Array.from(
    { length: 10_000 },
    (_, i) => `00000000-0000-4000-8000-${i.toString().padStart(12, '0')}`,
  );
  const campana = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  it('es estable: el mismo dispositivo cae siempre en el mismo cubo', async () => {
    const a = await bucket(idsSinteticos[0]!, campana, 'v1', 'variant');
    const b = await bucket(idsSinteticos[0]!, campana, 'v1', 'variant');
    expect(a).toBe(b);
  });

  it('reparte 50/50 dentro de ±1,5%', async () => {
    const asignaciones = await Promise.all(
      idsSinteticos.map((id) => asignar(id, campana, { controlPct: 50, rolloutPct: 100, salt: 'v1' })),
    );
    const control = asignaciones.filter((a) => a.variante === 'control').length;
    const proporcion = control / idsSinteticos.length;
    expect(proporcion).toBeGreaterThan(0.485);
    expect(proporcion).toBeLessThan(0.515);
  });

  it('reparte distinto entre campañas: nadie es siempre el control', async () => {
    const otraCampana = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const muestra = idsSinteticos.slice(0, 2000);

    const enA = await Promise.all(
      muestra.map((id) => asignar(id, campana, { controlPct: 50, rolloutPct: 100, salt: 'v1' })),
    );
    const enB = await Promise.all(
      muestra.map((id) => asignar(id, otraCampana, { controlPct: 50, rolloutPct: 100, salt: 'v1' })),
    );

    const coincidencias = enA.filter((a, i) => a.variante === enB[i]!.variante).length;
    // Si estuvieran correlacionadas, coincidirían casi siempre. Independientes
    // ⇒ ~50%.
    expect(coincidencias / muestra.length).toBeGreaterThan(0.45);
    expect(coincidencias / muestra.length).toBeLessThan(0.55);
  });

  it('rollout y variante son independientes entre sí', async () => {
    const muestra = idsSinteticos.slice(0, 4000);
    const asignaciones = await Promise.all(
      muestra.map((id) => asignar(id, campana, { controlPct: 50, rolloutPct: 50, salt: 'v1' })),
    );
    const dentro = asignaciones.filter((a) => a.incluidoEnRollout);
    const controlDentro = dentro.filter((a) => a.variante === 'control').length;
    // Si compartieran hash, esta proporción sería 0 o 1 en vez de ~0,5, y el
    // experimento mediría el sesgo en lugar del efecto.
    expect(controlDentro / dentro.length).toBeGreaterThan(0.45);
    expect(controlDentro / dentro.length).toBeLessThan(0.55);
  });

  it('ampliar el rollout conserva a quienes ya estaban dentro', async () => {
    const muestra = idsSinteticos.slice(0, 3000);
    const al10 = await Promise.all(
      muestra.map((id) => asignar(id, campana, { controlPct: 0, rolloutPct: 10, salt: 'v1' })),
    );
    const al25 = await Promise.all(
      muestra.map((id) => asignar(id, campana, { controlPct: 0, rolloutPct: 25, salt: 'v1' })),
    );

    // Nadie pierde la campaña al ampliar el despliegue.
    for (let i = 0; i < muestra.length; i++) {
      if (al10[i]!.incluidoEnRollout) expect(al25[i]!.incluidoEnRollout).toBe(true);
    }
  });

  it('el salt permite re-aleatorizar sin cambiar identificadores', async () => {
    const muestra = idsSinteticos.slice(0, 2000);
    const conV1 = await Promise.all(
      muestra.map((id) => asignar(id, campana, { controlPct: 50, rolloutPct: 100, salt: 'v1' })),
    );
    const conV2 = await Promise.all(
      muestra.map((id) => asignar(id, campana, { controlPct: 50, rolloutPct: 100, salt: 'v2' })),
    );
    const coincidencias = conV1.filter((a, i) => a.variante === conV2[i]!.variante).length;
    expect(coincidencias / muestra.length).toBeLessThan(0.6);
  });
});
