import type { CampanaFirmada, MotivoSupresion, PerfilUsuario } from '@faro/contracts';
import { asignar, evaluarAudiencia } from '@faro/segmentation';
import { claveDeHoy, type EstadoLocal, type RegistroCampana } from '../lib/storage.ts';

/**
 * Decide qué campaña se muestra.
 *
 * Todo ocurre en el cliente: los atributos del ejecutivo (sucursal, rol,
 * región) nunca necesitan salir del equipo para decidir qué se le muestra.
 */

export interface Decision {
  campana: CampanaFirmada;
  variante: 'target' | 'control';
  mostrar: boolean;
  motivoSupresion: MotivoSupresion | null;
}

export async function evaluarCampanas(
  campanas: CampanaFirmada[],
  perfil: PerfilUsuario,
  estado: EstadoLocal,
  origenActual: string | null,
  mostradasEnSesion: string[],
): Promise<Decision[]> {
  const ahora = Date.now();
  const decisiones: Decision[] = [];

  for (const campana of campanas) {
    const { incluidoEnRollout, variante } = await asignar(
      estado.installId,
      campana.id,
      campana.experimento,
    );

    // Fuera del rollout: ni siquiera cuenta como entregada. Un despliegue
    // gradual al 10% no debe aparecer en las métricas del 90% restante.
    if (!incluidoEnRollout) continue;

    if (!evaluarAudiencia(campana.audiencia.reglas, perfil)) continue;

    const supresion = motivoDeSupresion(campana, estado, ahora, origenActual, mostradasEnSesion);

    decisiones.push({
      campana,
      variante,
      // El grupo de control no ve nada, pero SÍ registra que la campaña le
      // correspondía. Sin ese registro no habría línea base para comparar.
      mostrar: variante === 'target' && supresion === null,
      motivoSupresion: variante === 'control' ? 'grupo_control' : supresion,
    });
  }

  return decisiones;
}

function motivoDeSupresion(
  campana: CampanaFirmada,
  estado: EstadoLocal,
  ahora: number,
  origenActual: string | null,
  mostradasEnSesion: string[],
): MotivoSupresion | null {
  if (campana.iniciaEn && new Date(campana.iniciaEn).getTime() > ahora) return 'fuera_de_ventana';
  if (campana.terminaEn && new Date(campana.terminaEn).getTime() <= ahora) return 'fuera_de_ventana';

  const permitidos = campana.presentacion.origenesPermitidos;
  if (permitidos.length > 0 && origenActual) {
    // La lista de la campaña restringe dentro de los orígenes que el manifiesto
    // ya permite; nunca los amplía.
    if (!permitidos.some((o) => origenActual.startsWith(o))) return 'origen_no_permitido';
  }

  const registro = estado.registro[campana.id];
  const frecuencia = campana.presentacion.frecuencia;

  // Una campaña que exige acuse y aún no lo tiene ignora los límites: una
  // contingencia crítica no puede desaparecer porque se alcanzó una cuota.
  const insistiendo = frecuencia.insistirHastaAcuse && !registro?.acusadaEn;
  if (insistiendo) return null;

  if (!registro) return null;

  // Una versión nueva reinicia el control de frecuencia: es contenido distinto.
  if (registro.version !== campana.version) return null;

  if (registro.acusadaEn && campana.presentacion.exigeAcuse) return 'limite_frecuencia';

  if (frecuencia.unaVezPorSesion && mostradasEnSesion.includes(campana.id)) {
    return 'limite_frecuencia';
  }

  if (registro.claveDia === claveDeHoy() && registro.mostradasHoy >= frecuencia.maxPorDia) {
    return 'limite_frecuencia';
  }

  if (ahora - registro.ultimaVezEn < frecuencia.intervaloMinimoMin * 60_000) {
    return 'limite_frecuencia';
  }

  if (
    registro.descartadaEn &&
    ahora - registro.descartadaEn < frecuencia.reaparecerTrasDescarteMin * 60_000
  ) {
    return 'limite_frecuencia';
  }

  return null;
}

/**
 * Arbitraje: una sola superficie por tipo, a la vez.
 *
 * Si tres campañas son elegibles, gana la de mayor prioridad y el resto emite
 * `suprimido` con motivo `menor_prioridad`. Nunca hay dos modales encima. Los
 * datos de supresión son valiosos por sí mismos: le muestran al negocio cuándo
 * está sobre-comunicando.
 */
export function arbitrar(decisiones: Decision[]): {
  ganadoras: Decision[];
  perdedoras: Decision[];
} {
  const mostrables = decisiones.filter((d) => d.mostrar);
  const ganadoras: Decision[] = [];
  const perdedoras: Decision[] = [];
  const formatosOcupados = new Set<string>();

  for (const decision of [...mostrables].sort((a, b) => a.campana.prioridad - b.campana.prioridad)) {
    const formato = decision.campana.presentacion.formato;
    if (formatosOcupados.has(formato)) {
      perdedoras.push({ ...decision, mostrar: false, motivoSupresion: 'menor_prioridad' });
      continue;
    }
    formatosOcupados.add(formato);
    ganadoras.push(decision);
  }

  perdedoras.push(...decisiones.filter((d) => !d.mostrar));
  return { ganadoras, perdedoras };
}

export function registroActualizado(
  previo: RegistroCampana | undefined,
  version: number,
  ahora: number,
): RegistroCampana {
  const hoy = claveDeHoy();
  const mismoDia = previo?.claveDia === hoy;
  const mismaVersion = previo?.version === version;

  return {
    version,
    primeraVezEn: previo?.primeraVezEn ?? ahora,
    ultimaVezEn: ahora,
    mostradasHoy: mismoDia && mismaVersion ? (previo?.mostradasHoy ?? 0) + 1 : 1,
    claveDia: hoy,
    descartadaEn: mismaVersion ? (previo?.descartadaEn ?? null) : null,
    acusadaEn: mismaVersion ? (previo?.acusadaEn ?? null) : null,
  };
}
