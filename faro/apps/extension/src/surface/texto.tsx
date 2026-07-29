import type { JSX } from 'preact';
import { parsearTextoEnriquecido } from '@faro/contracts';

/**
 * Renderiza texto con marcado restringido.
 *
 * El parser devuelve segmentos (texto + negrita/cursiva) y aquí se convierten
 * en elementos de Preact, que escapa todo por defecto. En ningún punto de la
 * cadena existe una cadena de HTML: no hay `innerHTML`, no hay
 * `dangerouslySetInnerHTML`, no hay parser de Markdown de terceros.
 *
 * Un `<script>` escrito por un administrador en el título llega hasta aquí y se
 * dibuja como texto visible.
 */
export function TextoEnriquecido({ texto }: { texto: string }): JSX.Element {
  const parrafos = parsearTextoEnriquecido(texto);

  return (
    <>
      {parrafos.map((parrafo, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {parrafo.map((segmento, j) => {
            if (segmento.negrita) return <strong key={j}>{segmento.texto}</strong>;
            if (segmento.cursiva) return <em key={j}>{segmento.texto}</em>;
            return <span key={j}>{segmento.texto}</span>;
          })}
        </span>
      ))}
    </>
  );
}
