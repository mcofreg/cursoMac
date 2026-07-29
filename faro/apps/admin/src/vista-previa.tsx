import type { JSX } from 'preact';
import { parsearTextoEnriquecido } from '@faro/contracts';

/**
 * Vista previa de los tres formatos.
 *
 * Reproduce el aspecto que tendrá la superficie en el navegador del ejecutivo,
 * usando el mismo parser de texto que el renderer real. Igual que allá, aquí
 * tampoco hay `innerHTML`: si el operador escribe algo que parece HTML, lo verá
 * como texto tanto en la vista previa como en producción — que es exactamente
 * lo que debe aprender antes de publicar.
 */

interface Campos {
  severidad?: string;
  icono?: string;
  titulo?: string;
  cuerpo?: string;
  subtitulo?: string;
  burbujas?: { texto: string }[];
  cta?: { label: string } | null;
  ctaPrimario?: { label: string } | null;
  etiquetaConfirmacion?: string;
}

const COLORES: Record<string, { fondo: string; borde: string; texto: string }> = {
  info: { fondo: '#e8f1fb', borde: '#1565c0', texto: '#0d3c6e' },
  advertencia: { fondo: '#fff4e5', borde: '#ef6c00', texto: '#7a3e00' },
  critica: { fondo: '#fdecea', borde: '#c62828', texto: '#7f1d1d' },
};

function Texto({ valor }: { valor: string }): JSX.Element {
  return (
    <>
      {parsearTextoEnriquecido(valor).map((parrafo, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {parrafo.map((s, j) =>
            s.negrita ? <strong key={j}>{s.texto}</strong> : s.cursiva ? <em key={j}>{s.texto}</em> : <span key={j}>{s.texto}</span>,
          )}
        </span>
      ))}
    </>
  );
}

export function VistaPrevia({
  formato,
  campos,
  exigeAcuse,
}: {
  formato: string;
  campos: Campos;
  exigeAcuse: boolean;
}): JSX.Element {
  const color = COLORES[campos.severidad ?? 'info'] ?? COLORES.info!;

  return (
    <div class="previsualizacion">
      <div class="previsualizacion__navegador">
        <div class="previsualizacion__barra">
          <span class="previsualizacion__punto" />
          <span class="previsualizacion__punto" />
          <span class="previsualizacion__punto" />
          <span style="font-size:10px;color:#64748b;margin-left:8px">intranet.banco.cl</span>
        </div>

        <div style="position:relative;height:206px;overflow:hidden">
          {formato === 'huincha' && (
            <div
              style={`position:absolute;top:0;left:0;right:0;height:34px;display:flex;align-items:center;
                      gap:8px;padding:0 10px;font-size:11px;background:${color.fondo};
                      color:${color.texto};border-bottom:2px solid ${color.borde}`}
            >
              <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                <strong>{campos.titulo || 'Título de la comunicación'}</strong>
                {campos.cuerpo && (
                  <span style="opacity:.8;margin-left:6px">
                    <Texto valor={campos.cuerpo} />
                  </span>
                )}
              </span>
              {campos.cta?.label && (
                <span style={`background:${color.borde};color:#fff;padding:3px 8px;border-radius:4px;font-weight:600`}>
                  {campos.cta.label}
                </span>
              )}
              {exigeAcuse && (
                <span style={`border:1px solid ${color.borde};padding:2px 7px;border-radius:4px`}>Entendido</span>
              )}
              <span style="opacity:.5">×</span>
            </div>
          )}

          <div class="previsualizacion__pagina" style={formato === 'huincha' ? 'margin-top:34px' : ''}>
            Contenido de la aplicación interna
          </div>

          {formato === 'modal' && (
            <div style="position:absolute;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:14px">
              <div style="background:#fff;border-radius:8px;width:100%;max-width:250px;overflow:hidden">
                <div style={`height:3px;background:${color.borde}`} />
                <div style="padding:12px">
                  <div style={`font-weight:650;font-size:12px;color:${color.borde};margin-bottom:5px`}>
                    {campos.titulo || 'Título del anuncio'}
                  </div>
                  <div style="font-size:10px;color:#475569;line-height:1.45;margin-bottom:9px">
                    {campos.cuerpo ? <Texto valor={campos.cuerpo} /> : 'Cuerpo del mensaje'}
                  </div>
                  <div style="display:flex;gap:5px;justify-content:flex-end">
                    {campos.ctaPrimario?.label && (
                      <span style={`background:${color.borde};color:#fff;padding:3px 9px;border-radius:4px;font-size:10px;font-weight:600`}>
                        {campos.ctaPrimario.label}
                      </span>
                    )}
                    <span style="border:1px solid #cbd5e1;padding:3px 9px;border-radius:4px;font-size:10px;color:#475569">
                      {exigeAcuse ? campos.etiquetaConfirmacion || 'Entendido' : 'Cerrar'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {formato === 'drawer' && (
            <div style="position:absolute;top:0;right:0;bottom:0;width:150px;background:#fff;box-shadow:-3px 0 10px rgba(0,0,0,.13);display:flex;flex-direction:column">
              <div style={`background:${color.borde};color:#fff;padding:8px 10px`}>
                <div style="font-size:11px;font-weight:650">{campos.titulo || 'Título'}</div>
                {campos.subtitulo && <div style="font-size:9px;opacity:.85">{campos.subtitulo}</div>}
              </div>
              <div style="flex:1;padding:9px;background:#f8fafc;display:flex;flex-direction:column;gap:6px;overflow:hidden">
                {(campos.burbujas ?? [{ texto: 'Primer mensaje' }]).slice(0, 3).map((burbuja, i) => (
                  <div key={i} style="background:#fff;border:1px solid #e2e8f0;border-radius:9px 9px 9px 3px;padding:6px 8px;font-size:9px;line-height:1.4;color:#1e293b">
                    <Texto valor={burbuja.texto} />
                  </div>
                ))}
              </div>
              {campos.cta?.label && (
                <div style="padding:8px;border-top:1px solid #e2e8f0">
                  <div style={`background:${color.borde};color:#fff;text-align:center;padding:5px;border-radius:5px;font-size:10px;font-weight:600`}>
                    {campos.cta.label}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
