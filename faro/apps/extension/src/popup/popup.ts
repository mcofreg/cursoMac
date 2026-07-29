import { API_BASE } from '../lib/config.ts';
import { leerEstado } from '../lib/storage.ts';

/**
 * Popup.
 *
 * Muestra el estado de la extensión y permite iniciar sesión. En producción el
 * botón lanza `chrome.identity.launchWebAuthFlow` contra el IdP corporativo
 * (Authorization Code + PKCE); en modo de desarrollo se elige de una lista de
 * usuarios de prueba. El resto del sistema no distingue entre ambos casos.
 */

const $ = (id: string) => document.getElementById(id)!;

async function refrescar(): Promise<void> {
  const estado = await leerEstado();

  const sinSesion = $('sin-sesion');
  const conSesion = $('con-sesion');

  if (!estado.sesion) {
    sinSesion.classList.remove('oculto');
    conSesion.classList.add('oculto');
    await cargarUsuarios();
    return;
  }

  sinSesion.classList.add('oculto');
  conSesion.classList.remove('oculto');

  const usuario = estado.sesion.usuario;
  $('v-nombre').textContent = usuario.nombre;
  $('v-sucursal').textContent = usuario.sucursal ?? 'sin asignar';
  $('v-rol').textContent = usuario.rol ?? 'sin asignar';
  $('v-campanas').textContent = String(estado.manifiesto?.campanas.length ?? 0);
  $('v-cola').textContent = String(estado.colaEventos.length);

  $('v-sync').textContent = estado.manifiestoDescargadoEn
    ? new Date(estado.manifiestoDescargadoEn).toLocaleTimeString('es-CL', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'nunca';

  // El aviso solo aparece cuando el perfil viene incompleto del IdP — el caso
  // realista de que el SSO corporativo no exponga sucursal ni rol.
  $('aviso-perfil').classList.toggle('oculto', !usuario.requiereCompletarPerfil);
}

async function cargarUsuarios(): Promise<void> {
  const select = $('usuario') as HTMLSelectElement;
  if (select.options.length > 0) return;

  try {
    const respuesta = await fetch(`${API_BASE}/v1/auth/usuarios-dev`);
    if (!respuesta.ok) {
      $('estado').textContent = 'El servidor no está disponible';
      return;
    }

    const { usuarios } = (await respuesta.json()) as {
      usuarios: { email: string; nombre: string; sucursal: string | null }[];
    };

    for (const usuario of usuarios) {
      const opcion = document.createElement('option');
      opcion.value = usuario.email;
      opcion.textContent = usuario.sucursal
        ? `${usuario.nombre} — ${usuario.sucursal}`
        : `${usuario.nombre} — sin sucursal`;
      select.appendChild(opcion);
    }
  } catch {
    $('estado').textContent = 'No se pudo conectar con el servidor';
  }
}

$('entrar').addEventListener('click', async () => {
  const email = ($('usuario') as HTMLSelectElement).value;
  if (!email) return;

  $('estado').textContent = 'Iniciando sesión…';
  const respuesta = await chrome.runtime.sendMessage({ tipo: 'faro:login', email });

  $('estado').textContent = respuesta?.ok ? '' : 'No se pudo iniciar sesión';
  await refrescar();
});

$('sincronizar').addEventListener('click', async () => {
  $('estado').textContent = 'Sincronizando…';
  await chrome.runtime.sendMessage({ tipo: 'faro:sincronizar' });
  $('estado').textContent = '';
  await refrescar();
});

$('panel').addEventListener('click', async () => {
  const ventana = await chrome.windows.getCurrent();
  if (ventana.id !== undefined) await chrome.sidePanel.open({ windowId: ventana.id });
  window.close();
});

$('salir').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ tipo: 'faro:logout' });
  await refrescar();
});

refrescar();
