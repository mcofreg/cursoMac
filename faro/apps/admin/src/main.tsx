import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { api, puede, type Usuario } from './api.ts';
import { Editor } from './paginas/editor.tsx';
import { Adopcion, EmbudoCampana } from './paginas/dashboard.tsx';
import './estilos.css';

type Vista =
  | { nombre: 'campanas' }
  | { nombre: 'editor'; id: string | null }
  | { nombre: 'metricas'; id: string }
  | { nombre: 'adopcion' }
  | { nombre: 'auditoria' };

function App(): JSX.Element {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState<Vista>({ nombre: 'campanas' });

  useEffect(() => {
    api
      .get<{ usuario: Usuario; csrfToken: string }>('/v1/admin/yo')
      .then((datos) => {
        api.fijarCsrf(datos.csrfToken);
        setUsuario(datos.usuario);
      })
      .catch(() => setUsuario(null))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <div class="cargando">Cargando…</div>;
  if (!usuario) return <Login alEntrar={(u, csrf) => { api.fijarCsrf(csrf); setUsuario(u); }} />;

  return (
    <>
      <header class="cabecera">
        <span class="marca">Faro</span>

        <nav class="nav">
          <button
            class={vista.nombre === 'campanas' || vista.nombre === 'editor' ? 'activo' : ''}
            onClick={() => setVista({ nombre: 'campanas' })}
          >
            Campañas
          </button>
          <button class={vista.nombre === 'adopcion' ? 'activo' : ''} onClick={() => setVista({ nombre: 'adopcion' })}>
            Adopción
          </button>
          {puede(usuario, 'approver') && (
            <button class={vista.nombre === 'auditoria' ? 'activo' : ''} onClick={() => setVista({ nombre: 'auditoria' })}>
              Auditoría
            </button>
          )}
        </nav>

        <div class="usuario">
          <span>{usuario.nombre} · {usuario.rol}</span>
          <button
            class="boton secundario pequeno"
            onClick={async () => {
              await api.post('/v1/admin/logout');
              location.reload();
            }}
          >
            Salir
          </button>
        </div>
      </header>

      <main class="contenido">
        {vista.nombre === 'campanas' && (
          <ListaCampanas
            usuario={usuario}
            alAbrir={(id) => setVista({ nombre: 'editor', id })}
            alVerMetricas={(id) => setVista({ nombre: 'metricas', id })}
          />
        )}

        {vista.nombre === 'editor' && (
          <Editor
            usuario={usuario}
            campaignId={vista.id}
            alVolver={() => setVista({ nombre: 'campanas' })}
            alCrear={(id) => setVista({ nombre: 'editor', id })}
          />
        )}

        {vista.nombre === 'metricas' && (
          <div>
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
              <button class="boton secundario pequeno" onClick={() => setVista({ nombre: 'campanas' })}>← Volver</button>
              <h1 style="margin:0">Métricas de la campaña</h1>
            </div>
            <EmbudoCampana campaignId={vista.id} />
          </div>
        )}

        {vista.nombre === 'adopcion' && <Adopcion />}
        {vista.nombre === 'auditoria' && <Auditoria />}
      </main>
    </>
  );
}

// ── Login ───────────────────────────────────────────────────────────────────

function Login({ alEntrar }: { alEntrar: (u: Usuario, csrf: string) => void }): JSX.Element {
  const [usuarios, setUsuarios] = useState<{ email: string; nombre: string; rolAdmin: string }[]>([]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<{ usuarios: typeof usuarios }>('/v1/admin/usuarios-dev')
      .then((datos) => {
        setUsuarios(datos.usuarios);
        setEmail(datos.usuarios[0]?.email ?? '');
      })
      .catch(() => setError('No se pudo conectar con la API. ¿Está corriendo en el puerto 3000?'));
  }, []);

  async function entrar() {
    setError('');
    try {
      const datos = await api.post<{ usuario: Usuario; csrfToken: string }>('/v1/admin/login', { email });
      alEntrar(datos.usuario, datos.csrfToken);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div style="max-width:400px;margin:80px auto;padding:0 20px">
      <div class="tarjeta">
        <h1>Faro</h1>
        <p style="color:var(--gris-texto);margin-top:0">
          Administración de comunicaciones de canales digitales
        </p>

        {error && <div class="aviso error">{error}</div>}

        <div class="aviso info">
          Entorno de desarrollo: el inicio de sesión simula el SSO corporativo. En producción,
          esta pantalla redirige al proveedor de identidad del banco.
        </div>

        <div class="campo">
          <label>Usuario</label>
          <select value={email} onChange={(e) => setEmail((e.target as HTMLSelectElement).value)}>
            {usuarios.map((u) => (
              <option value={u.email} key={u.email}>{u.nombre} — {u.rolAdmin}</option>
            ))}
          </select>
        </div>

        <button class="boton" style="width:100%" onClick={entrar} disabled={!email}>
          Entrar
        </button>

        <p class="ayuda" style="margin-top:14px">
          Para probar el doble control necesitas dos usuarios: <strong>Carla Fuentes</strong> crea
          la campaña y <strong>Rodrigo Pizarro</strong> la aprueba.
        </p>
      </div>
    </div>
  );
}

// ── Lista de campañas ───────────────────────────────────────────────────────

function ListaCampanas({
  usuario, alAbrir, alVerMetricas,
}: {
  usuario: Usuario;
  alAbrir: (id: string | null) => void;
  alVerMetricas: (id: string) => void;
}): JSX.Element {
  const [campanas, setCampanas] = useState<any[]>([]);
  const [killGlobal, setKillGlobal] = useState(false);
  const [cargando, setCargando] = useState(true);

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setCargando(true);
    const [lista, config] = await Promise.all([
      api.get<{ campaigns: any[] }>('/v1/admin/campaigns'),
      api.get<{ killGlobal: boolean }>('/v1/admin/config'),
    ]);
    setCampanas(lista.campaigns);
    setKillGlobal(config.killGlobal);
    setCargando(false);
  }

  async function alternarKillGlobal() {
    const activar = !killGlobal;
    if (
      activar &&
      !confirm(
        'INTERRUPTOR GLOBAL\n\n' +
          'Desmonta TODAS las comunicaciones en TODOS los equipos en menos de 60 segundos.\n' +
          'Se usa cuando la extensión está causando problemas en una aplicación interna.\n\n' +
          '¿Continuar?',
      )
    ) {
      return;
    }
    await api.put('/v1/admin/config/kill-global', { activo: activar });
    await cargar();
  }

  if (cargando) return <div class="cargando">Cargando…</div>;

  return (
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h1 style="margin:0">Campañas</h1>
        <div class="acciones">
          {puede(usuario, 'admin') && (
            <button class={`boton ${killGlobal ? 'exito' : 'peligro'}`} onClick={alternarKillGlobal}>
              {killGlobal ? 'Reactivar la plataforma' : 'Interruptor global'}
            </button>
          )}
          {puede(usuario, 'editor') && (
            <button class="boton" onClick={() => alAbrir(null)}>Nueva campaña</button>
          )}
        </div>
      </div>

      {killGlobal && (
        <div class="aviso error">
          <strong>Interruptor global activado.</strong> Ninguna comunicación se está mostrando en
          ningún equipo. Las extensiones siguen reportando latidos, pero no renderizan nada.
        </div>
      )}

      {campanas.length === 0 ? (
        <div class="tarjeta"><div class="vacio">Todavía no hay campañas.</div></div>
      ) : (
        <div class="tarjeta">
          <table>
            <thead>
              <tr>
                <th>Campaña</th><th>Categoría</th><th>Prioridad</th><th>Estado</th>
                <th>Creada por</th><th>Aprobada por</th><th></th>
              </tr>
            </thead>
            <tbody>
              {campanas.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.nombre}</strong>
                    <div class="mono" style="color:var(--gris-texto)">{c.key}</div>
                  </td>
                  <td>{c.categoria}</td>
                  <td><span class={`insignia p${c.prioridad}`}>P{c.prioridad}</span></td>
                  <td>
                    <span class={`insignia ${c.estado}`}>{c.estado.replace('_', ' ')}</span>
                    {c.es_emergencia && (
                      <div style="font-size:11px;color:var(--rojo);margin-top:3px">
                        emergencia · expira {new Date(c.emergencia_expira_en).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </td>
                  <td>{c.creado_por_nombre ?? '—'}</td>
                  <td>{c.aprobado_por_nombre ?? '—'}</td>
                  <td>
                    <div class="acciones">
                      <button class="boton secundario pequeno" onClick={() => alAbrir(c.id)}>Abrir</button>
                      <button class="boton secundario pequeno" onClick={() => alVerMetricas(c.id)}>Métricas</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Auditoría ───────────────────────────────────────────────────────────────

function Auditoria(): JSX.Element {
  const [entradas, setEntradas] = useState<any[]>([]);

  useEffect(() => {
    api.get<{ entradas: any[] }>('/v1/admin/audit?limite=100').then((d) => setEntradas(d.entradas));
  }, []);

  return (
    <div>
      <h1>Auditoría</h1>
      <div class="aviso info">
        Registro append-only: la base de datos rechaza modificaciones y borrados. Incluye todo
        acceso a datos de nivel individual, que es lo que exige el compromiso de privacidad
        frente a los trabajadores.
      </div>

      <div class="tarjeta">
        <table>
          <thead>
            <tr><th>Cuándo</th><th>Quién</th><th>Acción</th><th>Entidad</th><th>IP</th></tr>
          </thead>
          <tbody>
            {entradas.map((e) => (
              <tr key={e.id}>
                <td class="mono">{new Date(e.creado_en).toLocaleString('es-CL')}</td>
                <td>{e.actor_email ?? '—'}</td>
                <td><strong>{e.accion}</strong></td>
                <td class="mono">{e.entidad}</td>
                <td class="mono">{e.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const raiz = document.getElementById('raiz');
if (raiz) render(<App />, raiz);
