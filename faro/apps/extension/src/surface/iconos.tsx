import type { JSX } from 'preact';

/**
 * Íconos empaquetados en la extensión.
 *
 * El administrador elige de un enum cerrado; nunca sube un SVG. Un SVG es un
 * documento XML que puede contener <script>, así que aceptarlos anularía toda
 * la cadena anti-XSS.
 */

type NombreIcono = 'alerta' | 'info' | 'herramientas' | 'regalo' | 'reloj' | 'candado';

const TRAZOS: Record<NombreIcono, string> = {
  alerta: 'M12 2 1 21h22L12 2Zm0 6v6m0 3v.5',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-14v.5m0 3.5v6',
  herramientas: 'M14 6a4 4 0 1 0 4 4l4 4-4 4-4-4a4 4 0 0 0-4-4L2 6l4-4 4 4Z',
  regalo: 'M20 12v10H4V12M2 7h20v5H2V7Zm10 0v15M12 7S9 2 6.5 4.5 12 7 12 7Zm0 0s3-5 5.5-2.5S12 7 12 7Z',
  reloj: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-16v6l4 2',
  candado: 'M5 11h14v11H5V11Zm3 0V7a4 4 0 1 1 8 0v4',
};

export function Icono({ nombre, tamano = 20 }: { nombre: string; tamano?: number }): JSX.Element {
  const trazo = TRAZOS[nombre as NombreIcono] ?? TRAZOS.info;

  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={trazo} />
    </svg>
  );
}
