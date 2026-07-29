import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { api, ErrorApi, puede, type Usuario } from '../api.ts';
import { VistaPrevia } from '../vista-previa.tsx';

/**
 * Editor de campañas.
 *
 * El operador llena CAMPOS TIPADOS; no existe un editor de HTML por ninguna
 * parte, y esa ausencia es deliberada. La vista previa usa el mismo parser que
 * el renderer real, así que lo que ve aquí es lo que verá el ejecutivo.
 */

const PLANTILLAS = {
  huincha_alerta_v1: { nombre: 'Huincha superior', formato: 'huincha' },
  modal_anuncio_v1: { nombre: 'Modal a pantalla completa', formato: 'modal' },
  drawer_conversacion_v1: { nombre: 'Drawer lateral tipo chat', formato: 'drawer' },
} as const;

type ClavePlantilla = keyof typeof PLANTILLAS;

interface Props {
  usuario: Usuario;
  campaignId: string | null;
  alVolver: () => void;
  /** Tras crear, el contenedor cambia la vista a la campaña recién creada, para
   *  que aparezcan las acciones de gobierno (enviar a revisión, aprobar…). */
  alCrear: (id: string) => void;
}

export function Editor({ usuario, campaignId, alVolver, alCrear }: Props): JSX.Element {
  const [campana, setCampana] = useState<any>(null);
  const [versiones, setVersiones] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState<{ tipo: string; texto: string } | null>(null);

  // Metadatos
  const [clave, setClave] = useState('');
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('contingencia');
  const [prioridad, setPrioridad] = useState(0);
  const [plantilla, setPlantilla] = useState<ClavePlantilla>('huincha_alerta_v1');

  // Contenido
  const [severidad, setSeveridad] = useState('critica');
  const [icono, setIcono] = useState('alerta');
  const [titulo, setTitulo] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [subtitulo, setSubtitulo] = useState('');
  const [burbujas, setBurbujas] = useState<string[]>(['']);
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');

  // Presentación
  const [descartable, setDescartable] = useState(true);
  const [exigeAcuse, setExigeAcuse] = useState(true);

  // Audiencia y experimento
  const [atributo, setAtributo] = useState('');
  const [valores, setValores] = useState('');
  const [controlPct, setControlPct] = useState(0);
  const [rolloutPct, setRolloutPct] = useState(100);
  const [alcance, setAlcance] = useState<{ alcanzables: number; parqueActivo: number } | null>(null);

  const formato = PLANTILLAS[plantilla].formato;
  const esNueva = campaignId === null;

  useEffect(() => {
    if (esNueva) {
      setCampana(null);
      setCargando(false);
      return;
    }
    cargar();
  }, [campaignId]);

  async function cargar() {
    setCargando(true);
    try {
      const datos = await api.get<any>(`/v1/admin/campaigns/${campaignId}`);
      setCampana(datos.campaign);
      setVersiones(datos.versions);

      setClave(datos.campaign.key);
      setNombre(datos.campaign.nombre);
      setCategoria(datos.campaign.categoria);
      setPrioridad(datos.campaign.prioridad);
      setPlantilla(datos.campaign.template_key);

      const ultima = datos.versions[0];
      if (ultima) {
        const campos = ultima.contenido.campos;
        setSeveridad(campos.severidad ?? 'info');
        setIcono(campos.icono ?? 'info');
        setTitulo(campos.titulo ?? '');
        setCuerpo(campos.cuerpo ?? '');
        setSubtitulo(campos.subtitulo ?? '');
        if (Array.isArray(campos.burbujas)) setBurbujas(campos.burbujas.map((b: any) => b.texto));

        const cta = campos.cta ?? campos.ctaPrimario;
        if (cta) {
          setCtaLabel(cta.label);
          if (cta.accion?.kind === 'abrir_url') setCtaUrl(cta.accion.url);
        }

        setDescartable(ultima.presentacion.descartable);
        setExigeAcuse(ultima.presentacion.exigeAcuse);
        setControlPct(ultima.experimento.controlPct);
        setRolloutPct(ultima.experimento.rolloutPct);

        const reglas = ultima.audiencia?.reglas;
        if (reglas?.attr) {
          setAtributo(reglas.attr);
          setValores((reglas.values ?? [reglas.value]).join(', '));
        }
      }
    } catch (error) {
      setMensaje({ tipo: 'error', texto: (error as Error).message });
    }
    setCargando(false);
  }

  function construirReglas() {
    if (!atributo || !valores.trim()) return null;
    const lista = valores.split(',').map((v) => v.trim()).filter(Boolean);
    return lista.length === 1
      ? { attr: atributo, op: 'eq', value: lista[0] }
      : { attr: atributo, op: 'in', values: lista };
  }

  function construirCta() {
    if (!ctaLabel.trim() || !ctaUrl.trim()) return null;
    return { id: 'accion_principal', label: ctaLabel.trim(), accion: { kind: 'abrir_url', url: ctaUrl.trim() } };
  }

  function construirCampos() {
    const cta = construirCta();
    const base = { severidad, icono };

    if (plantilla === 'huincha_alerta_v1') return { ...base, titulo, cuerpo, cta };
    if (plantilla === 'modal_anuncio_v1') {
      return {
        ...base, titulo, cuerpo, imagen: null,
        ctaPrimario: cta, ctaSecundario: null, etiquetaConfirmacion: 'Entendido',
      };
    }
    return {
      ...base, titulo, subtitulo,
      burbujas: burbujas.filter((b) => b.trim()).map((texto) => ({ texto, imagen: null })),
      cta,
    };
  }

  async function estimarAlcance() {
    try {
      setAlcance(await api.post('/v1/admin/audiences/preview', { reglas: construirReglas() }));
    } catch (error) {
      setMensaje({ tipo: 'error', texto: (error as Error).message });
    }
  }

  async function guardar() {
    setMensaje(null);
    try {
      let id = campaignId;

      if (esNueva) {
        const creada = await api.post<{ id: string }>('/v1/admin/campaigns', {
          key: clave, nombre, categoria, prioridad, templateKey: plantilla,
          iniciaEn: null, terminaEn: null,
        });
        id = creada.id;
      }

      await api.post(`/v1/admin/campaigns/${id}/versions`, {
        contenido: { templateKey: plantilla, campos: construirCampos() },
        presentacion: {
          formato, descartable, exigeAcuse,
          frecuencia: {
            maxPorDia: prioridad === 0 ? 20 : 3,
            intervaloMinimoMin: prioridad === 0 ? 0 : 60,
            unaVezPorSesion: prioridad > 1,
            reaparecerTrasDescarteMin: prioridad === 0 ? 5 : 240,
            insistirHastaAcuse: prioridad === 0 && exigeAcuse,
          },
          origenesPermitidos: [],
        },
        audiencia: { reglas: construirReglas() },
        experimento: { controlPct, rolloutPct, salt: 'v1' },
      });

      setMensaje({ tipo: 'exito', texto: 'Guardado. La campaña vuelve a estado borrador y debe pasar por aprobación.' });
      if (esNueva && id) alCrear(id);
      else await cargar();
    } catch (error) {
      const err = error as ErrorApi;
      setMensaje({
        tipo: 'error',
        texto: err.detalle ? `${err.message}: ${JSON.stringify(err.detalle)}` : err.message,
      });
    }
  }

  async function accion(ruta: string, cuerpoPeticion?: unknown) {
    setMensaje(null);
    try {
      await api.post(`/v1/admin/campaigns/${campaignId}/${ruta}`, cuerpoPeticion);
      await cargar();
      setMensaje({ tipo: 'exito', texto: 'Listo.' });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: (error as Error).message });
    }
  }

  if (cargando) return <div class="cargando">Cargando…</div>;

  const estado = campana?.estado ?? 'borrador';
  const ultimaVersion = versiones[0];
  const esAutorDeLaVersion = ultimaVersion?.creado_por === usuario.id;

  return (
    <div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <button class="boton secundario pequeno" onClick={alVolver}>← Volver</button>
        <h1 style="margin:0;flex:1">
          {campana?.nombre ?? (esNueva ? 'Nueva campaña' : 'Cargando…')}
        </h1>
        {campana && <span class={`insignia ${estado}`}>{estado.replace('_', ' ')}</span>}
      </div>

      {mensaje && <div class={`aviso ${mensaje.tipo}`}>{mensaje.texto}</div>}

      {/* ── Flujo de gobierno ────────────────────────────────────────────── */}
      {campana && (
        <div class="tarjeta">
          <h2>Publicación</h2>

          {estado === 'en_revision' && esAutorDeLaVersion && (
            <div class="aviso alerta">
              Tú creaste esta versión, así que no puedes aprobarla. El doble control lo impone
              la base de datos, no la aplicación: debe aprobarla otra persona con rol
              <strong> approver</strong>.
            </div>
          )}

          <div class="acciones">
            {estado === 'borrador' && puede(usuario, 'editor') && (
              <button class="boton" onClick={() => accion('submit')}>Enviar a revisión</button>
            )}

            {estado === 'en_revision' && puede(usuario, 'approver') && (
              <button class="boton exito" disabled={esAutorDeLaVersion} onClick={() => accion('approve', { nota: null })}>
                Aprobar
              </button>
            )}

            {(estado === 'aprobada' || estado === 'pausada') && puede(usuario, 'approver') && (
              <button class="boton" onClick={() => accion('publish')}>
                {estado === 'pausada' ? 'Reactivar' : 'Publicar'}
              </button>
            )}

            {estado === 'activa' && puede(usuario, 'editor') && (
              <button class="boton peligro" onClick={() => accion('pause')}>
                Detener ahora
              </button>
            )}

            {prioridad === 0 && estado !== 'activa' && puede(usuario, 'approver') && (
              <button
                class="boton peligro"
                onClick={() => {
                  const justificacion = prompt(
                    'Ruta de emergencia para contingencias P0.\n\n' +
                      'Publica de inmediato con un solo aprobador. La campaña expira sola en 4 horas.\n\n' +
                      'Describe el incidente (mínimo 20 caracteres):',
                  );
                  if (justificacion) accion('emergency', { justificacion, horasVigencia: 4 });
                }}
              >
                Publicar por emergencia
              </button>
            )}
          </div>

          {estado === 'activa' && (
            <p class="ayuda" style="margin-top:10px">
              «Detener ahora» saca la campaña de circulación en menos de 60 segundos y desmonta
              la superficie en todas las pestañas, sin desplegar nada.
            </p>
          )}
        </div>
      )}

      <div class="rejilla dos">
        <div>
          {/* ── Identificación ──────────────────────────────────────────── */}
          <div class="tarjeta">
            <h2>Identificación</h2>

            <div class="campo">
              <label>Nombre</label>
              <input type="text" value={nombre} onInput={(e) => setNombre((e.target as HTMLInputElement).value)} />
            </div>

            {esNueva && (
              <div class="campo">
                <label>Clave</label>
                <input
                  type="text" class="mono" value={clave} placeholder="contingencia-app-movil"
                  onInput={(e) => setClave((e.target as HTMLInputElement).value)}
                />
                <div class="ayuda">Identificador único. Solo minúsculas, números y guiones.</div>
              </div>
            )}

            <div class="rejilla dos" style="gap:12px">
              <div class="campo">
                <label>Categoría</label>
                <select value={categoria} onChange={(e) => setCategoria((e.target as HTMLSelectElement).value)}>
                  <option value="contingencia">Contingencia</option>
                  <option value="lanzamiento">Lanzamiento</option>
                  <option value="promocion">Promoción</option>
                  <option value="operativo">Operativo</option>
                </select>
              </div>

              <div class="campo">
                <label>Prioridad</label>
                <select value={String(prioridad)} onChange={(e) => setPrioridad(Number((e.target as HTMLSelectElement).value))}>
                  <option value="0">P0 — contingencia crítica</option>
                  <option value="1">P1 — alta</option>
                  <option value="2">P2 — normal</option>
                  <option value="3">P3 — promocional</option>
                </select>
              </div>
            </div>

            {esNueva && (
              <div class="campo">
                <label>Formato</label>
                <select value={plantilla} onChange={(e) => setPlantilla((e.target as HTMLSelectElement).value as ClavePlantilla)}>
                  {Object.entries(PLANTILLAS).map(([key, p]) => (
                    <option value={key} key={key}>{p.nombre}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* ── Contenido ───────────────────────────────────────────────── */}
          <div class="tarjeta">
            <h2>Contenido</h2>
            <div class="aviso info">
              Solo campos de texto: no hay editor de HTML, y es a propósito. Lo que escribas se
              muestra como texto literal, así que no es posible inyectar código en las
              aplicaciones internas.
            </div>

            <div class="rejilla dos" style="gap:12px">
              <div class="campo">
                <label>Severidad</label>
                <select value={severidad} onChange={(e) => setSeveridad((e.target as HTMLSelectElement).value)}>
                  <option value="info">Informativa</option>
                  <option value="advertencia">Advertencia</option>
                  <option value="critica">Crítica</option>
                </select>
              </div>
              <div class="campo">
                <label>Ícono</label>
                <select value={icono} onChange={(e) => setIcono((e.target as HTMLSelectElement).value)}>
                  <option value="alerta">Alerta</option>
                  <option value="info">Información</option>
                  <option value="herramientas">Herramientas</option>
                  <option value="regalo">Novedad</option>
                  <option value="reloj">Reloj</option>
                  <option value="candado">Seguridad</option>
                </select>
              </div>
            </div>

            <div class="campo">
              <label>Título</label>
              <input type="text" maxLength={80} value={titulo} onInput={(e) => setTitulo((e.target as HTMLInputElement).value)} />
              <div class="contador">{titulo.length}/80</div>
            </div>

            {plantilla === 'drawer_conversacion_v1' ? (
              <>
                <div class="campo">
                  <label>Subtítulo</label>
                  <input type="text" maxLength={80} value={subtitulo} onInput={(e) => setSubtitulo((e.target as HTMLInputElement).value)} />
                </div>
                <div class="campo">
                  <label>Mensajes</label>
                  {burbujas.map((burbuja, i) => (
                    <div key={i} style="display:flex;gap:6px;margin-bottom:6px">
                      <textarea
                        style="min-height:52px"
                        value={burbuja}
                        onInput={(e) => {
                          const copia = [...burbujas];
                          copia[i] = (e.target as HTMLTextAreaElement).value;
                          setBurbujas(copia);
                        }}
                      />
                      {burbujas.length > 1 && (
                        <button class="boton secundario pequeno" onClick={() => setBurbujas(burbujas.filter((_, j) => j !== i))}>×</button>
                      )}
                    </div>
                  ))}
                  {burbujas.length < 6 && (
                    <button class="boton secundario pequeno" onClick={() => setBurbujas([...burbujas, ''])}>
                      + Agregar mensaje
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div class="campo">
                <label>Cuerpo</label>
                <textarea
                  maxLength={plantilla === 'modal_anuncio_v1' ? 600 : 240}
                  value={cuerpo}
                  onInput={(e) => setCuerpo((e.target as HTMLTextAreaElement).value)}
                />
                <div class="ayuda">
                  Puedes usar <span class="mono">*negrita*</span> y <span class="mono">_cursiva_</span>.
                </div>
              </div>
            )}

            <div class="rejilla dos" style="gap:12px">
              <div class="campo">
                <label>Texto del botón</label>
                <input type="text" maxLength={24} value={ctaLabel} onInput={(e) => setCtaLabel((e.target as HTMLInputElement).value)} />
              </div>
              <div class="campo">
                <label>Enlace de destino</label>
                <input type="url" value={ctaUrl} placeholder="https://intranet.banco.cl/…" onInput={(e) => setCtaUrl((e.target as HTMLInputElement).value)} />
                <div class="ayuda">Debe ser un dominio corporativo autorizado.</div>
              </div>
            </div>

            <div class="acciones" style="margin-top:6px">
              <label style="display:flex;align-items:center;gap:6px;font-weight:400">
                <input type="checkbox" checked={descartable} onChange={(e) => setDescartable((e.target as HTMLInputElement).checked)} />
                Se puede cerrar
              </label>
              <label style="display:flex;align-items:center;gap:6px;font-weight:400">
                <input type="checkbox" checked={exigeAcuse} onChange={(e) => setExigeAcuse((e.target as HTMLInputElement).checked)} />
                Exige confirmación de lectura
              </label>
            </div>
          </div>
        </div>

        <div>
          {/* ── Vista previa ────────────────────────────────────────────── */}
          <div class="tarjeta">
            <h2>Vista previa</h2>
            <VistaPrevia
              formato={formato}
              campos={{
                severidad, icono, titulo, cuerpo, subtitulo,
                burbujas: burbujas.filter((b) => b.trim()).map((texto) => ({ texto })),
                cta: ctaLabel ? { label: ctaLabel } : null,
                ctaPrimario: ctaLabel ? { label: ctaLabel } : null,
                etiquetaConfirmacion: 'Entendido',
              }}
              exigeAcuse={exigeAcuse}
            />
          </div>

          {/* ── Audiencia ───────────────────────────────────────────────── */}
          <div class="tarjeta">
            <h2>Audiencia</h2>

            <div class="rejilla dos" style="gap:12px">
              <div class="campo">
                <label>Atributo</label>
                <select value={atributo} onChange={(e) => setAtributo((e.target as HTMLSelectElement).value)}>
                  <option value="">Toda la red</option>
                  <option value="region">Región</option>
                  <option value="sucursal">Sucursal</option>
                  <option value="rol">Rol</option>
                  <option value="area">Área</option>
                  <option value="tags">Etiqueta</option>
                </select>
              </div>
              <div class="campo">
                <label>Valores</label>
                <input
                  type="text" value={valores} placeholder="RM, V"
                  disabled={!atributo}
                  onInput={(e) => setValores((e.target as HTMLInputElement).value)}
                />
                <div class="ayuda">Separados por coma.</div>
              </div>
            </div>

            <button class="boton secundario pequeno" onClick={estimarAlcance}>Estimar alcance</button>

            {alcance && (
              <div class="aviso info" style="margin-top:10px">
                <strong>{alcance.alcanzables}</strong> de {alcance.parqueActivo} dispositivos activos
                {alcance.parqueActivo > 0 && ` (${Math.round((alcance.alcanzables / alcance.parqueActivo) * 100)}%)`}.
                <div style="font-size:12px;margin-top:4px;opacity:.85">
                  Calculado con el mismo evaluador que usa la extensión.
                </div>
              </div>
            )}

            <div class="rejilla dos" style="gap:12px;margin-top:12px">
              <div class="campo">
                <label>Grupo de control (%)</label>
                <input
                  type="number" min={0} max={50} value={controlPct}
                  onInput={(e) => setControlPct(Number((e.target as HTMLInputElement).value))}
                />
              </div>
              <div class="campo">
                <label>Despliegue (%)</label>
                <input
                  type="number" min={1} max={100} value={rolloutPct}
                  onInput={(e) => setRolloutPct(Number((e.target as HTMLInputElement).value))}
                />
              </div>
            </div>

            {categoria === 'contingencia' && controlPct > 0 && (
              <div class="aviso alerta">
                Estás reteniendo información de contingencia al {controlPct}% de la red solo para
                medir. En una contingencia eso es difícil de justificar: lo recomendable es control
                en 0% y reservar los grupos de control para promociones y lanzamientos.
              </div>
            )}
          </div>
        </div>
      </div>

      <div class="acciones" style="margin-bottom:30px">
        <button class="boton" onClick={guardar} disabled={!nombre || !titulo || (esNueva && !clave)}>
          {esNueva ? 'Crear campaña' : 'Guardar versión nueva'}
        </button>
        <button class="boton secundario" onClick={alVolver}>Cancelar</button>
      </div>

      {/* ── Historial ────────────────────────────────────────────────────── */}
      {versiones.length > 0 && (
        <div class="tarjeta">
          <h2>Historial de versiones</h2>
          <table>
            <thead>
              <tr><th>Versión</th><th>Creada por</th><th>Aprobada por</th><th>Firmada</th><th>Publicada</th></tr>
            </thead>
            <tbody>
              {versiones.map((v) => (
                <tr key={v.version}>
                  <td>v{v.version}</td>
                  <td>{v.creado_por_nombre ?? '—'}</td>
                  <td>{v.aprobado_por_nombre ?? '—'}</td>
                  <td>{v.firmada ? '✓' : '—'}</td>
                  <td>{v.publicado_en ? new Date(v.publicado_en).toLocaleString('es-CL') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p class="ayuda" style="margin-top:10px">
            Las versiones son inmutables: editar crea una nueva. Así el contenido que se firmó y
            se mostró queda siempre reproducible en una auditoría.
          </p>
        </div>
      )}
    </div>
  );
}
