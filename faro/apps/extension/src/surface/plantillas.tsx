import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Icono } from './iconos.tsx';
import { TextoEnriquecido } from './texto.tsx';

/**
 * Las tres plantillas.
 *
 * Todas reciben campos tipados y los dibujan con Preact, que escapa el texto
 * por defecto. No hay `dangerouslySetInnerHTML` en ningún punto — y un test del
 * build falla si aparece.
 */

export interface CampanaMostrable {
  id: string;
  version: number;
  prioridad: number;
  contenido: { templateKey: string; campos: Record<string, unknown> };
  presentacion: {
    formato: 'huincha' | 'modal' | 'drawer';
    descartable: boolean;
    exigeAcuse: boolean;
  };
  variante: 'target' | 'control';
}

export interface Acciones {
  alClic: (campana: CampanaMostrable, ctaId: string) => void;
  alAcusar: (campana: CampanaMostrable) => void;
  alDescartar: (campana: CampanaMostrable) => void;
  alExpandir: (campana: CampanaMostrable) => void;
}

interface Cta {
  id: string;
  label: string;
  accion: { kind: string; url?: string };
}

/**
 * Cuenta el tiempo visible y emite la impresión.
 *
 * Una impresión exige ≥1 s continuo con la pestaña en primer plano. Esto es lo
 * que distingue "se renderizó" de "lo miró", y es la razón de que el alcance
 * reportado sea creíble: una pestaña en segundo plano no genera impresiones.
 */
export function useVisibilidad(
  campana: CampanaMostrable,
  alImprimir: (c: CampanaMostrable) => void,
  alTerminar: (c: CampanaMostrable, dwellMs: number) => void,
): void {
  const acumulado = useRef(0);
  const desde = useRef<number | null>(null);
  const yaImpreso = useRef(false);

  useEffect(() => {
    const iniciar = () => {
      if (desde.current === null) desde.current = Date.now();
    };
    const detener = () => {
      if (desde.current !== null) {
        acumulado.current += Date.now() - desde.current;
        desde.current = null;
      }
    };

    if (document.visibilityState === 'visible') iniciar();

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') iniciar();
      else detener();
    };
    document.addEventListener('visibilitychange', alCambiarVisibilidad);

    const temporizador = setTimeout(() => {
      if (document.visibilityState === 'visible' && !yaImpreso.current) {
        yaImpreso.current = true;
        alImprimir(campana);
      }
    }, 1000);

    return () => {
      clearTimeout(temporizador);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      detener();
      if (yaImpreso.current && acumulado.current > 0) {
        alTerminar(campana, Math.min(acumulado.current, 600_000));
      }
    };
  }, [campana.id, campana.version]);
}

// ── Huincha superior ─────────────────────────────────────────────────────────

export function Huincha({
  campana,
  acciones,
}: {
  campana: CampanaMostrable;
  acciones: Acciones;
}): JSX.Element {
  const campos = campana.contenido.campos as {
    severidad: string;
    icono: string;
    titulo: string;
    cuerpo: string;
    cta: Cta | null;
  };

  return (
    <div class={`huincha ${campos.severidad}`} role="status" aria-live="polite">
      <span class="huincha__icono">
        <Icono nombre={campos.icono} />
      </span>

      <span class="huincha__texto">
        <span class="huincha__titulo">{campos.titulo}</span>
        {campos.cuerpo && (
          <span class="huincha__cuerpo">
            <TextoEnriquecido texto={campos.cuerpo} />
          </span>
        )}
      </span>

      <span class="huincha__acciones">
        {campos.cta && (
          <button
            class={`boton ${campos.severidad}`}
            onClick={() => acciones.alClic(campana, campos.cta!.id)}
          >
            {campos.cta.label}
          </button>
        )}

        {campana.presentacion.exigeAcuse && (
          <button class="boton boton--fantasma" onClick={() => acciones.alAcusar(campana)}>
            Entendido
          </button>
        )}

        {campana.presentacion.descartable && (
          <button class="cerrar" aria-label="Cerrar" onClick={() => acciones.alDescartar(campana)}>
            ×
          </button>
        )}
      </span>
    </div>
  );
}

// ── Modal a pantalla completa ────────────────────────────────────────────────

export function Modal({
  campana,
  acciones,
}: {
  campana: CampanaMostrable;
  acciones: Acciones;
}): JSX.Element {
  const campos = campana.contenido.campos as {
    severidad: string;
    icono: string;
    titulo: string;
    cuerpo: string;
    imagen: { url: string; altText: string } | null;
    ctaPrimario: Cta | null;
    ctaSecundario: Cta | null;
    etiquetaConfirmacion: string;
  };

  const tarjeta = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Escape cierra, salvo que la campaña exija confirmación de lectura: una
    // contingencia crítica no se despacha con una tecla.
    const alPresionar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape' && campana.presentacion.descartable) {
        acciones.alDescartar(campana);
      }
    };
    document.addEventListener('keydown', alPresionar);
    tarjeta.current?.focus();
    return () => document.removeEventListener('keydown', alPresionar);
  }, [campana.id]);

  return (
    <div class="velo" role="dialog" aria-modal="true" aria-labelledby={`titulo-${campana.id}`}>
      <div class="modal" ref={tarjeta} tabIndex={-1}>
        <div class={`modal__barra ${campos.severidad}`} />
        <div class="modal__cuerpo">
          <div class={`modal__encabezado ${campos.severidad}`}>
            <Icono nombre={campos.icono} tamano={24} />
            <h2 class="modal__titulo" id={`titulo-${campana.id}`}>
              {campos.titulo}
            </h2>
          </div>

          {campos.imagen && (
            <img class="modal__imagen" src={campos.imagen.url} alt={campos.imagen.altText} />
          )}

          {campos.cuerpo && (
            <p class="modal__texto">
              <TextoEnriquecido texto={campos.cuerpo} />
            </p>
          )}

          <div class="modal__acciones">
            {campos.ctaSecundario && (
              <button
                class="boton boton--fantasma"
                onClick={() => acciones.alClic(campana, campos.ctaSecundario!.id)}
              >
                {campos.ctaSecundario.label}
              </button>
            )}

            {campos.ctaPrimario && (
              <button
                class={`boton ${campos.severidad}`}
                onClick={() => acciones.alClic(campana, campos.ctaPrimario!.id)}
              >
                {campos.ctaPrimario.label}
              </button>
            )}

            {campana.presentacion.exigeAcuse ? (
              <button class={`boton ${campos.severidad}`} onClick={() => acciones.alAcusar(campana)}>
                {campos.etiquetaConfirmacion}
              </button>
            ) : (
              campana.presentacion.descartable && (
                <button class="boton boton--fantasma" onClick={() => acciones.alDescartar(campana)}>
                  Cerrar
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Drawer lateral tipo chat ─────────────────────────────────────────────────

export function Drawer({
  campana,
  acciones,
}: {
  campana: CampanaMostrable;
  acciones: Acciones;
}): JSX.Element {
  const campos = campana.contenido.campos as {
    severidad: string;
    icono: string;
    titulo: string;
    subtitulo: string;
    burbujas: { texto: string; imagen: { url: string; altText: string } | null }[];
    cta: Cta | null;
  };

  const [minimizado, setMinimizado] = useState(false);

  // Al cerrarlo queda como burbuja flotante en vez de desaparecer: sigue
  // accesible sin volver a interrumpir al ejecutivo.
  if (minimizado) {
    return (
      <button
        class={`flotante ${campos.severidad}`}
        aria-label={`Abrir: ${campos.titulo}`}
        onClick={() => {
          setMinimizado(false);
          acciones.alExpandir(campana);
        }}
      >
        <Icono nombre={campos.icono} tamano={24} />
      </button>
    );
  }

  return (
    <aside class="drawer" role="complementary" aria-label={campos.titulo}>
      <div class={`drawer__encabezado ${campos.severidad}`}>
        <Icono nombre={campos.icono} tamano={22} />
        <div style="flex:1">
          <h2 class="drawer__titulo">{campos.titulo}</h2>
          {campos.subtitulo && <p class="drawer__subtitulo">{campos.subtitulo}</p>}
        </div>
        <button class="cerrar" aria-label="Minimizar" onClick={() => setMinimizado(true)}>
          ×
        </button>
      </div>

      <div class="drawer__conversacion">
        {campos.burbujas.map((burbuja, i) => (
          <div class="burbuja" key={i} style={`animation-delay:${i * 120}ms`}>
            <TextoEnriquecido texto={burbuja.texto} />
            {burbuja.imagen && <img src={burbuja.imagen.url} alt={burbuja.imagen.altText} />}
          </div>
        ))}
      </div>

      {(campos.cta || campana.presentacion.descartable) && (
        <div class="drawer__pie">
          {campos.cta && (
            <button
              class={`boton ${campos.severidad}`}
              onClick={() => acciones.alClic(campana, campos.cta!.id)}
            >
              {campos.cta.label}
            </button>
          )}
          {campana.presentacion.descartable && (
            <button class="boton boton--fantasma" onClick={() => acciones.alDescartar(campana)}>
              No mostrar más
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
