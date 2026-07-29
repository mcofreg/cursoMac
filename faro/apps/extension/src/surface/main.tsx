import { render } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import {
  Drawer,
  Huincha,
  Modal,
  useVisibilidad,
  type Acciones,
  type CampanaMostrable,
} from './plantillas.tsx';
import './estilos.css';

/**
 * Renderer.
 *
 * Corre dentro de un iframe SANDBOXED, en un origen opaco: no tiene acceso a
 * `chrome.*` ni al DOM de la aplicación del banco. Se comunica exclusivamente
 * por `postMessage` con el content script, que valida cada mensaje contra una
 * lista blanca de campos.
 *
 * Si una plantilla tuviera un bug de seguridad, el radio de explosión termina
 * aquí: este código no puede leer el token de sesión del CRM, ni el formulario
 * que el ejecutivo tiene abierto, ni navegar por su cuenta.
 */

function enviarAlPadre(mensaje: Record<string, unknown>): void {
  parent.postMessage({ canal: 'faro', ...mensaje }, '*');
}

function emitirEvento(campana: CampanaMostrable, tipo: string, extra: Record<string, unknown> = {}): void {
  enviarAlPadre({
    tipo: 'evento',
    evento: {
      tipo,
      campaignId: campana.id,
      campaignVersion: campana.version,
      variante: campana.variante,
      formato: campana.presentacion.formato,
      ...extra,
    },
  });
}

function Superficie({ campana, acciones }: { campana: CampanaMostrable; acciones: Acciones }): JSX.Element | null {
  useVisibilidad(
    campana,
    (c) => emitirEvento(c, 'impresion'),
    (c, dwellMs) => emitirEvento(c, 'fin_vista', { dwellMs }),
  );

  switch (campana.presentacion.formato) {
    case 'huincha':
      return <Huincha campana={campana} acciones={acciones} />;
    case 'modal':
      return <Modal campana={campana} acciones={acciones} />;
    case 'drawer':
      return <Drawer campana={campana} acciones={acciones} />;
    default:
      // Plantilla que esta versión de la extensión no sabe dibujar: no se
      // inventa nada, se reporta y se ignora.
      emitirEvento(campana, 'error');
      return null;
  }
}

function App(): JSX.Element {
  const [campanas, setCampanas] = useState<CampanaMostrable[]>([]);
  const [ocultas, setOcultas] = useState<string[]>([]);

  useEffect(() => {
    const alRecibir = (evento: MessageEvent) => {
      const datos = evento.data as { canal?: string; tipo?: string; campanas?: CampanaMostrable[] };
      if (datos?.canal !== 'faro' || datos.tipo !== 'render') return;

      const nuevas = datos.campanas ?? [];
      setCampanas(nuevas);
      // Al llegar contenido nuevo se limpia lo oculto: si una campaña vuelve
      // tras una pausa, tiene que poder mostrarse otra vez.
      setOcultas((previas) => previas.filter((id) => nuevas.some((c) => c.id === id)));
    };

    window.addEventListener('message', alRecibir);
    enviarAlPadre({ tipo: 'listo' });
    return () => window.removeEventListener('message', alRecibir);
  }, []);

  const visibles = campanas.filter((c) => !ocultas.includes(c.id));

  // Le dice al content script si debe capturar clics y si hay que empujar la
  // página. Sin esto, un iframe a pantalla completa bloquearía la aplicación
  // del banco aunque estuviera vacío.
  useEffect(() => {
    enviarAlPadre({
      tipo: 'layout',
      interactivo: visibles.length > 0,
      ocupaHuincha: visibles.some((c) => c.presentacion.formato === 'huincha'),
    });
  }, [visibles.map((c) => c.id).join(','), visibles.length]);

  const acciones: Acciones = {
    alClic: useCallback((campana, ctaId) => {
      emitirEvento(campana, 'clic', { ctaId });
      // La navegación la ejecuta el service worker tras revalidar la URL: este
      // renderer es incapaz de navegar por su cuenta.
      enviarAlPadre({ tipo: 'abrir', campaignId: campana.id, ctaId });
    }, []),

    alAcusar: useCallback((campana) => {
      emitirEvento(campana, 'acuse');
      setOcultas((previas) => [...previas, campana.id]);
    }, []),

    alDescartar: useCallback((campana) => {
      emitirEvento(campana, 'descarte');
      setOcultas((previas) => [...previas, campana.id]);
    }, []),

    alExpandir: useCallback((campana) => {
      emitirEvento(campana, 'expansion');
    }, []),
  };

  return (
    <>
      {visibles.map((campana) => (
        <Superficie key={`${campana.id}:${campana.version}`} campana={campana} acciones={acciones} />
      ))}
    </>
  );
}

const raiz = document.getElementById('raiz');
if (raiz) render(<App />, raiz);
