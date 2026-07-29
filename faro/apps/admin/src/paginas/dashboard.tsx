import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { api } from '../api.ts';

/**
 * Dashboard.
 *
 * Dos ideas que el diseño intenta imponer sobre los números:
 *
 *  · Se muestran siempre juntos "impresiones" y "alcance único". Confundirlos
 *    es el error más común al presentar estos datos a jefatura.
 *
 *  · La advertencia metodológica sobre el grupo de control viaja pegada a los
 *    datos, para que no se pierda camino a una presentación.
 */

export function Adopcion(): JSX.Element {
  const [datos, setDatos] = useState<any>(null);

  useEffect(() => {
    api.get('/v1/analytics/adopcion').then(setDatos).catch(() => setDatos(null));
  }, []);

  if (!datos) return <div class="cargando">Cargando…</div>;

  const { resumen } = datos;
  const brecha = resumen.total - resumen.activos_7d;
  const autoDeclarados =
    datos.porOrigenPerfil?.find((o: any) => o.clave === 'auto_declarado')?.n ?? 0;

  return (
    <div>
      <h1>Adopción</h1>

      <div class="rejilla cuatro" style="margin-bottom:16px">
        <Metrica valor={resumen.total} etiqueta="Instalados totales" />
        <Metrica valor={resumen.activos_7d} etiqueta="Activos 7 días" nota="con latido reciente" />
        <Metrica valor={resumen.activos_30d} etiqueta="Activos 30 días" />
        <Metrica
          valor={brecha}
          etiqueta="Instalados inactivos"
          nota="la salud del despliegue"
          color={brecha > resumen.total * 0.15 ? 'var(--naranjo)' : undefined}
        />
      </div>

      {brecha > resumen.total * 0.15 && (
        <div class="aviso alerta">
          El {Math.round((brecha / resumen.total) * 100)}% de las instalaciones lleva más de 7 días
          sin dar señales. La brecha entre «instalados» y «activos» es la métrica que dice si el
          despliegue está sano — no el total de instalaciones.
        </div>
      )}

      {autoDeclarados > 0 && (
        <div class="aviso info">
          <strong>{autoDeclarados}</strong> perfiles tienen sucursal auto-declarada en vez de
          verificada contra el directorio. La segmentación de esos dispositivos depende de lo que
          la persona eligió al instalar.
        </div>
      )}

      <div class="rejilla dos">
        <Distribucion titulo="Por sucursal" filas={datos.porSucursal} />
        <div>
          <Distribucion titulo="Por región" filas={datos.porRegion} />
          <Distribucion titulo="Por versión de la extensión" filas={datos.porVersion} />
        </div>
      </div>
    </div>
  );
}

export function EmbudoCampana({ campaignId }: { campaignId: string }): JSX.Element {
  const [datos, setDatos] = useState<any>(null);
  const [corte, setCorte] = useState('sucursal');

  useEffect(() => {
    api
      .get(`/v1/analytics/campaigns/${campaignId}/funnel?cortarPor=${corte}`)
      .then(setDatos)
      .catch(() => setDatos(null));
  }, [campaignId, corte]);

  if (!datos) return <div class="cargando">Cargando métricas…</div>;

  const { target, control, elegibles } = datos;
  const ctr = target.alcance > 0 ? (target.clics_unicos / target.alcance) * 100 : 0;
  const tasaAcuse = target.alcance > 0 ? (target.acuses / target.alcance) * 100 : 0;

  return (
    <div>
      <div class="rejilla cuatro" style="margin-bottom:16px">
        <Metrica valor={elegibles} etiqueta="Elegibles" nota="según la audiencia" />
        <Metrica valor={target.alcance} etiqueta="Alcance único" nota={`${target.impresiones} impresiones`} />
        <Metrica valor={`${ctr.toFixed(1)}%`} etiqueta="CTR" nota={`${target.clics_unicos} clics únicos`} />
        <Metrica
          valor={`${tasaAcuse.toFixed(1)}%`}
          etiqueta="Confirmaron lectura"
          nota="el KPI de contingencia"
          color="var(--verde)"
        />
      </div>

      <div class="tarjeta">
        <h2>Embudo — grupo objetivo</h2>
        <Barra etiqueta="Elegibles" valor={elegibles} total={elegibles} />
        <Barra etiqueta="Entregadas" valor={target.entregados} total={elegibles} />
        <Barra etiqueta="Alcance único" valor={target.alcance} total={elegibles} />
        <Barra etiqueta="Clics únicos" valor={target.clics_unicos} total={elegibles} clase="clic" />
        <Barra etiqueta="Confirmaron lectura" valor={target.acuses} total={elegibles} clase="acuse" />

        {target.suprimidos > 0 && (
          <p class="ayuda" style="margin-top:12px">
            {target.suprimidos} supresiones registradas. Los motivos están abajo: sirven para saber
            si el problema es saturación de frecuencia o que nadie tenía la aplicación en primer plano.
          </p>
        )}
      </div>

      {datos.supresiones?.length > 0 && (
        <div class="tarjeta">
          <h2>Por qué no se mostró</h2>
          <table>
            <tbody>
              {datos.supresiones.map((s: any) => (
                <tr key={s.motivo}>
                  <td>{traducirMotivo(s.motivo)}</td>
                  <td style="text-align:right;font-weight:600">{s.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {control.entregados > 0 && (
        <div class="tarjeta">
          <h2>Grupo de control</h2>
          <div class="rejilla tres">
            <Metrica valor={control.entregados} etiqueta="En control" />
            <Metrica valor={control.impresiones} etiqueta="Impresiones" nota="cero por diseño" />
            <Metrica valor="—" etiqueta="CTR" nota="no aplica" />
          </div>
          {datos.nota && <div class="aviso alerta" style="margin-top:12px">{datos.nota}</div>}
        </div>
      )}

      {datos.cortes?.length > 0 && (
        <div class="tarjeta">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <h2 style="margin:0">Desglose</h2>
            <select style="width:auto" value={corte} onChange={(e) => setCorte((e.target as HTMLSelectElement).value)}>
              <option value="sucursal">Por sucursal</option>
              <option value="region">Por región</option>
              <option value="rol">Por rol</option>
            </select>
          </div>

          <table>
            <thead>
              <tr><th>{corte}</th><th>Alcance</th><th>Clics</th><th>Confirmaron</th><th>Tasa de acuse</th></tr>
            </thead>
            <tbody>
              {datos.cortes.map((fila: any) => {
                const tasa = fila.alcance > 0 ? (fila.acuses / fila.alcance) * 100 : 0;
                return (
                  <tr key={fila.clave}>
                    <td>{fila.clave}</td>
                    <td>{fila.alcance}</td>
                    <td>{fila.clics_unicos}</td>
                    <td>{fila.acuses}</td>
                    <td style={tasa < 50 ? 'color:var(--rojo);font-weight:600' : ''}>{tasa.toFixed(0)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p class="ayuda" style="margin-top:10px">
            Este corte es el entregable operacional: permite decirle a un gerente de zona
            «en estas sucursales el acuse fue bajo, llámalos».
          </p>
        </div>
      )}
    </div>
  );
}

// ── Componentes auxiliares ──────────────────────────────────────────────────

function Metrica({
  valor, etiqueta, nota, color,
}: { valor: number | string; etiqueta: string; nota?: string; color?: string }): JSX.Element {
  return (
    <div class="metrica">
      <div class="metrica__valor" style={color ? `color:${color}` : ''}>{valor}</div>
      <div class="metrica__etiqueta">{etiqueta}</div>
      {nota && <div class="metrica__nota">{nota}</div>}
    </div>
  );
}

function Barra({
  etiqueta, valor, total, clase = '',
}: { etiqueta: string; valor: number; total: number; clase?: string }): JSX.Element {
  const porcentaje = total > 0 ? (valor / total) * 100 : 0;
  return (
    <div class="embudo__fila">
      <div class="embudo__cabeza">
        <span>{etiqueta}</span>
        <span><strong>{valor}</strong> <span style="color:var(--gris-texto)">({porcentaje.toFixed(1)}%)</span></span>
      </div>
      <div class="embudo__barra">
        <div class={`embudo__relleno ${clase}`} style={`width:${Math.min(porcentaje, 100)}%`} />
      </div>
    </div>
  );
}

function Distribucion({ titulo, filas }: { titulo: string; filas: any[] }): JSX.Element {
  const total = filas?.reduce((suma, f) => suma + f.n, 0) ?? 0;

  return (
    <div class="tarjeta">
      <h2>{titulo}</h2>
      {!filas?.length ? (
        <div class="vacio">Sin datos</div>
      ) : (
        <table>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.clave}>
                <td>{fila.clave}</td>
                <td style="text-align:right;font-weight:600">{fila.n}</td>
                <td style="text-align:right;color:var(--gris-texto);width:56px">
                  {total > 0 ? `${Math.round((fila.n / total) * 100)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function traducirMotivo(motivo: string): string {
  const mapa: Record<string, string> = {
    grupo_control: 'Grupo de control (no debe verla)',
    limite_frecuencia: 'Límite de frecuencia alcanzado',
    menor_prioridad: 'Otra campaña de mayor prioridad ocupó la superficie',
    sin_pestana_activa: 'Sin pestaña activa en una aplicación interna',
    origen_no_permitido: 'Aplicación fuera de la lista permitida',
    fuera_de_ventana: 'Fuera de la ventana de vigencia',
    plantilla_no_soportada: 'La extensión no sabe dibujar esa plantilla',
  };
  return mapa[motivo] ?? motivo;
}
