import { textoLlano } from '@faro/contracts';

/**
 * Panel lateral: historial de comunicaciones.
 *
 * Es una superficie nativa de Chrome, así que no depende de que el ejecutivo
 * tenga abierta una aplicación interna. Sirve como registro de lo que se
 * comunicó, para cuando alguien pregunta "¿qué decía la alerta de la mañana?".
 *
 * Todo se construye con `createElement` y `textContent`: ni un `innerHTML` en
 * todo el archivo.
 */

interface CampanaVista {
  id: string;
  version: number;
  prioridad: number;
  contenido: { templateKey: string; campos: Record<string, unknown> };
}

interface RegistroVista {
  ultimaVezEn: number;
  acusadaEn: number | null;
}

const lista = document.getElementById('lista')!;
const contexto = document.getElementById('contexto')!;

function crear(etiqueta: string, clase: string, texto?: string): HTMLElement {
  const elemento = document.createElement(etiqueta);
  if (clase) elemento.className = clase;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

function extraerTexto(campos: Record<string, unknown>): { titulo: string; cuerpo: string } {
  const titulo = String(campos.titulo ?? '');

  if (typeof campos.cuerpo === 'string' && campos.cuerpo) {
    return { titulo, cuerpo: textoLlano(campos.cuerpo) };
  }

  // El drawer no tiene "cuerpo": su contenido son burbujas.
  if (Array.isArray(campos.burbujas)) {
    const burbujas = campos.burbujas as { texto: string }[];
    return { titulo, cuerpo: burbujas.map((b) => textoLlano(b.texto)).join(' ') };
  }

  return { titulo, cuerpo: '' };
}

async function pintar(): Promise<void> {
  const respuesta = await chrome.runtime.sendMessage({ tipo: 'faro:estado' });

  lista.replaceChildren();

  if (!respuesta?.sesion) {
    contexto.textContent = 'Sin sesión iniciada';
    lista.appendChild(crear('div', 'vacio', 'Inicia sesión desde el ícono de la extensión.'));
    return;
  }

  const usuario = respuesta.sesion.usuario as { nombre: string; sucursal: string | null };
  contexto.textContent = usuario.sucursal
    ? `${usuario.nombre} · sucursal ${usuario.sucursal}`
    : `${usuario.nombre} · sin sucursal asignada`;

  const campanas = (respuesta.campanas ?? []) as CampanaVista[];
  const registro = (respuesta.registro ?? {}) as Record<string, RegistroVista>;

  if (campanas.length === 0) {
    lista.appendChild(crear('div', 'vacio', 'No hay comunicaciones activas en este momento.'));
    return;
  }

  for (const campana of [...campanas].sort((a, b) => a.prioridad - b.prioridad)) {
    const campos = campana.contenido.campos;
    const severidad = String(campos.severidad ?? 'info');
    const { titulo, cuerpo } = extraerTexto(campos);

    const tarjeta = crear('div', `tarjeta ${severidad}`);
    tarjeta.appendChild(crear('div', 'titulo', titulo));
    if (cuerpo) tarjeta.appendChild(crear('div', 'cuerpo', cuerpo));

    const meta = crear('div', 'meta');
    meta.appendChild(crear('span', `insignia ${severidad}`, severidad));

    const visto = registro[campana.id];
    if (visto?.acusadaEn) {
      meta.appendChild(crear('span', '', `confirmada ${hora(visto.acusadaEn)}`));
    } else if (visto?.ultimaVezEn) {
      meta.appendChild(crear('span', '', `vista ${hora(visto.ultimaVezEn)}`));
    } else {
      meta.appendChild(crear('span', '', 'sin ver'));
    }

    tarjeta.appendChild(meta);
    lista.appendChild(tarjeta);
  }
}

function hora(marca: number): string {
  return new Date(marca).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

document.getElementById('sincronizar')!.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ tipo: 'faro:sincronizar' });
  await pintar();
});

pintar();
