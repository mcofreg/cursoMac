/* Importar roadmap: se sube la foto o la captura de un roadmap y la pantalla
 * devuelve una propuesta de actividades editable. Nada se crea hasta que se
 * revisa y se confirma.
 *
 * El extractor está detrás de un único contrato (js/ia/extractorRoadmap.js).
 * Hoy responde el proveedor simulado, que no envía la imagen a ninguna parte;
 * conectar el modelo con visión no cambia esta pantalla. */

import {
  h, boton, pastilla, campo, entrada, areaTexto, lista, tostada, vaciar,
} from '../ui/componentes.js';
import * as store from '../store/store.js';
import { CADENCIAS, PRIORIDADES } from '../store/schema.js';
import { extraerTareas, esSimulado, nombreProveedor } from '../ia/extractorRoadmap.js';
import { hoyISO, sumarDias } from '../domain/fechas.js';
import { irA } from '../router.js';

const TIPOS_ACEPTADOS = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const TAMANO_MAXIMO = 8 * 1024 * 1024;

/** Estado de la pantalla; vive mientras dure la visita. */
let imagen = null;
let propuestas = null;
let avisos = [];
let cargando = false;

export const vista = {
  id: 'roadmap',
  titulo: 'Importar roadmap',
  subtitulo: () => 'Sube una foto del roadmap y revisa las actividades propuestas',
  acciones: () => [],
  pintar,
};

function pintar(contenedor) {
  contenedor.appendChild(avisoProveedor());

  const proyectos = store.proyectosVisibles();
  if (!proyectos.length) {
    contenedor.appendChild(h('div', { class: 'vacio' },
      h('strong', {}, 'Primero necesitas un proyecto'),
      'Las actividades del roadmap se cargan dentro de un proyecto. Crea uno en el Portafolio.'));
    return;
  }

  const zona = h('div', { class: 'rejilla rejilla--2' });
  const panelDestino = h('section', { class: 'tarjeta' });
  const panelImagen = h('section', { class: 'tarjeta' });
  zona.appendChild(panelDestino);
  zona.appendChild(panelImagen);
  contenedor.appendChild(zona);

  const resultados = h('div', { class: 'mt-16' });
  contenedor.appendChild(resultados);

  const controles = construirDestino(panelDestino, proyectos);
  construirCargador(panelImagen, controles, resultados);

  if (propuestas) pintarPropuestas(resultados, controles);
}

function avisoProveedor() {
  if (!esSimulado()) {
    return h('div', { class: 'tarjeta mb-16' },
      h('div', { class: 'tarjeta__cuerpo fila' },
        pastilla(`Modelo conectado: ${nombreProveedor()}`, 'verde', { punto: true }),
        h('span', { class: 'pequeno suave' },
          'La imagen se enviará al modelo para su lectura.')));
  }
  return h('div', { class: 'tarjeta mb-16' },
    h('div', { class: 'tarjeta__cuerpo' },
      h('div', { class: 'fila mb-8' },
        pastilla('Lector simulado', 'ambar', { punto: true }),
        h('span', { class: 'negrita' }, 'La lectura con inteligencia artificial todavía no está conectada')),
      h('p', { class: 'pequeno suave mb-0' },
        'La pantalla completa funciona: subes la imagen, revisas la propuesta, la editas y creas '
        + 'las tareas. Lo único simulado es la lectura: en vez de mirar tu imagen, el extractor '
        + 'propone una estructura de fases de ejemplo ajustada a las fechas y al equipo que elijas. '
        + 'Tu imagen no sale de este navegador. Para conectar el modelo con visión de verdad, sigue '
        + 'las instrucciones del archivo README de Pulso.')));
}

/* --------------------------------------------------------------- destino */

function construirDestino(panel, proyectos) {
  const iniciativa = store.iniciativaActiva();
  const filtros = store.config('filtros');
  const proyectoPorDefecto = proyectos.find((p) => p.id === filtros.proyectoId) || proyectos[0];

  const listaProyectos = lista(
    proyectos.map((p) => ({ id: p.id, etiqueta: p.nombre })), proyectoPorDefecto.id);
  const inicio = entrada('date', proyectoPorDefecto.fechaInicio || hoyISO());
  const fin = entrada('date', proyectoPorDefecto.fechaFinPlan || sumarDias(hoyISO(), 120));
  const notas = areaTexto('', {
    placeholder: 'Por ejemplo: "las fechas del roadmap son trimestres, usa el último día de cada uno".',
  });

  listaProyectos.addEventListener('change', () => {
    const proyecto = store.porId('proyectos', listaProyectos.value);
    if (proyecto) {
      if (proyecto.fechaInicio) inicio.value = proyecto.fechaInicio;
      if (proyecto.fechaFinPlan) fin.value = proyecto.fechaFinPlan;
    }
  });

  panel.appendChild(h('div', { class: 'tarjeta__cab' }, h('h2', {}, '1. Dónde se van a crear')));
  panel.appendChild(h('div', { class: 'tarjeta__cuerpo' },
    campo('Iniciativa', h('input', {
      type: 'text', valor: iniciativa ? iniciativa.nombre : '—', disabled: true,
    })),
    campo('Proyecto', listaProyectos),
    h('div', { class: 'rejilla-campos' },
      campo('El roadmap parte el', inicio),
      campo('Y termina el', fin)),
    campo('Notas para la lectura', notas,
      'Cualquier cosa que ayude a interpretar la imagen: convenciones de fecha, siglas, prioridades.')));

  return {
    proyectoId: () => listaProyectos.value,
    contexto: () => {
      const proyecto = store.porId('proyectos', listaProyectos.value);
      const equipo = proyecto ? store.porId('equipos', proyecto.equipoId) : null;
      const personas = equipo
        ? store.personasDeEquipo(equipo.id)
        : store.estado.personas;
      return {
        iniciativa: iniciativa ? iniciativa.nombre : '',
        proyecto: proyecto ? proyecto.nombre : '',
        equipo: equipo ? equipo.nombre : '',
        equipos: store.estado.equipos.map((e) => e.nombre),
        personas: personas.map((p) => p.nombre),
        cadenciaDefecto: proyecto ? proyecto.cadenciaDefecto : 'semanal',
        fechaInicio: inicio.value || hoyISO(),
        fechaFin: fin.value || sumarDias(hoyISO(), 120),
        notas: notas.value.trim(),
        hoy: hoyISO(),
      };
    },
  };
}

/* ---------------------------------------------------------------- imagen */

function construirCargador(panel, controles, resultados) {
  const entradaArchivo = h('input', {
    type: 'file',
    accept: TIPOS_ACEPTADOS.join(','),
    class: 'oculto',
    onchange: (e) => { if (e.target.files[0]) recibir(e.target.files[0]); },
  });

  const previsualizacion = h('div', { class: 'mb-8' });
  const soltar = h('div', {
    class: 'vacio',
    style: { cursor: 'pointer', padding: '28px 18px' },
    onclick: () => entradaArchivo.click(),
    onkeydown: (e) => { if (e.key === 'Enter') entradaArchivo.click(); },
    tabindex: '0',
    role: 'button',
  },
  h('strong', {}, 'Arrastra aquí la imagen del roadmap'),
  'o haz clic para elegir un archivo · PNG, JPG, WEBP o GIF, hasta 8 MB');

  soltar.addEventListener('dragover', (e) => {
    e.preventDefault();
    soltar.style.borderColor = 'var(--acento)';
  });
  soltar.addEventListener('dragleave', () => { soltar.style.borderColor = ''; });
  soltar.addEventListener('drop', (e) => {
    e.preventDefault();
    soltar.style.borderColor = '';
    const archivo = e.dataTransfer.files[0];
    if (archivo) recibir(archivo);
  });

  const botonExtraer = boton('Leer el roadmap', {
    icono: 'roadmap', variante: 'primario', deshabilitado: true,
    onclick: () => extraer(),
  });
  const estado = h('span', { class: 'pequeno tenue' });

  panel.appendChild(h('div', { class: 'tarjeta__cab' }, h('h2', {}, '2. La imagen del roadmap')));
  panel.appendChild(h('div', { class: 'tarjeta__cuerpo' },
    previsualizacion, soltar, entradaArchivo,
    h('div', { class: 'fila mt-16' }, botonExtraer, estado)));

  if (imagen) mostrarPrevisualizacion();

  function recibir(archivo) {
    if (!TIPOS_ACEPTADOS.includes(archivo.type)) {
      tostada('Ese archivo no es una imagen reconocida (PNG, JPG, WEBP o GIF).', 'error');
      return;
    }
    if (archivo.size > TAMANO_MAXIMO) {
      tostada('La imagen pesa más de 8 MB. Reduce su tamaño y vuelve a intentarlo.', 'error');
      return;
    }
    const lector = new FileReader();
    lector.onload = () => {
      const url = String(lector.result);
      imagen = {
        nombre: archivo.name,
        tipoMime: archivo.type,
        tamano: archivo.size,
        url,
        base64: url.slice(url.indexOf(',') + 1),
      };
      propuestas = null;
      avisos = [];
      vaciar(resultados);
      mostrarPrevisualizacion();
    };
    lector.onerror = () => tostada('No se pudo leer el archivo.', 'error');
    lector.readAsDataURL(archivo);
  }

  function mostrarPrevisualizacion() {
    vaciar(previsualizacion);
    previsualizacion.appendChild(h('img', {
      src: imagen.url,
      alt: `Vista previa de ${imagen.nombre}`,
      style: {
        width: '100%', maxHeight: '260px', objectFit: 'contain',
        borderRadius: 'var(--r-sm)', border: '1px solid var(--borde)',
        background: 'var(--superficie-2)',
      },
    }));
    previsualizacion.appendChild(h('p', { class: 'mini tenue mt-8 mb-0' },
      `${imagen.nombre} · ${Math.round(imagen.tamano / 1024)} KB`));
    soltar.classList.add('oculto');
    botonExtraer.disabled = false;
  }

  async function extraer() {
    if (!imagen || cargando) return;
    cargando = true;
    botonExtraer.disabled = true;
    estado.textContent = 'Leyendo la imagen…';
    try {
      const resultado = await extraerTareas(imagen, controles.contexto());
      propuestas = resultado.tareas;
      avisos = resultado.avisos;
      estado.textContent = `${propuestas.length} actividades propuestas`;
      pintarPropuestas(resultados, controles);
      resultados.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      console.error(e);
      estado.textContent = '';
      tostada(e.message || 'No se pudo leer la imagen.', 'error');
    } finally {
      cargando = false;
      botonExtraer.disabled = false;
    }
  }
}

/* ----------------------------------------------------------- propuestas */

function pintarPropuestas(contenedor, controles) {
  vaciar(contenedor);
  if (!propuestas || !propuestas.length) return;

  const personas = store.estado.personas;
  const filas = [];

  const cuerpo = h('tbody', {});
  let faseActual = null;
  propuestas.forEach((propuesta, indice) => {
    if (propuesta.fase && propuesta.fase !== faseActual) {
      faseActual = propuesta.fase;
      cuerpo.appendChild(h('tr', {}, h('td', {
        colspan: '8',
        style: { background: 'var(--superficie-3)', fontWeight: '650', fontSize: '12px' },
      }, faseActual)));
    }
    filas.push(construirFila(propuesta, indice, personas, cuerpo, actualizarContador));
  });

  const contador = h('span', { class: 'pequeno suave' });
  const botonCrear = boton('Crear las actividades', {
    icono: 'visto', variante: 'primario',
    onclick: () => crear(controles),
  });

  function actualizarContador() {
    const cuantas = filas.filter((f) => f.incluida()).length;
    contador.textContent = `${cuantas} de ${propuestas.length} seleccionadas`;
    botonCrear.disabled = cuantas === 0;
  }

  contenedor.appendChild(h('section', { class: 'tarjeta' },
    h('div', { class: 'tarjeta__cab' },
      h('h2', {}, '3. Revisa antes de crear'),
      contador,
      boton('Seleccionar todas', {
        sm: true,
        onclick: () => { filas.forEach((f) => f.marcar(true)); actualizarContador(); },
      }),
      boton('Ninguna', {
        sm: true,
        onclick: () => { filas.forEach((f) => f.marcar(false)); actualizarContador(); },
      })),
    avisos.length
      ? h('div', {
        class: 'tarjeta__cuerpo',
        style: { borderBottom: '1px solid var(--borde)', background: 'var(--superficie-2)' },
      }, h('div', { class: 'mini negrita mb-8' }, 'Avisos de la lectura'),
      h('ul', { class: 'pequeno suave', style: { margin: '0', paddingLeft: '18px' } },
        avisos.map((a) => h('li', {}, a))))
      : null,
    h('div', { class: 'tabla-envoltura' },
      h('table', { class: 'tabla tabla--densa' },
        h('thead', {}, h('tr', {},
          h('th', { style: { width: '34px' } }, ''),
          h('th', {}, 'Actividad'),
          h('th', {}, 'Responsable'),
          h('th', {}, 'Inicio'),
          h('th', {}, 'Compromiso'),
          h('th', { class: 'num' }, 'Horas'),
          h('th', {}, 'Cadencia'),
          h('th', {}, 'Prioridad'))),
        cuerpo)),
    h('div', { class: 'modal__pie' },
      h('span', { class: 'pequeno tenue crecer' },
        'Las tareas creadas quedan marcadas como provenientes del roadmap, para poder revisarlas después.'),
      botonCrear)));

  actualizarContador();
}

function construirFila(propuesta, indice, personas, cuerpo, alCambiar) {
  const marca = h('input', { type: 'checkbox', 'aria-label': `Incluir ${propuesta.titulo}` });
  marca.checked = propuesta.incluir;
  marca.addEventListener('change', () => { propuesta.incluir = marca.checked; alCambiar(); });

  const titulo = entrada('text', propuesta.titulo, { 'aria-label': 'Título de la actividad' });
  titulo.addEventListener('input', () => { propuesta.titulo = titulo.value; });

  const coincidencia = personas.find((p) => p.nombre.toLowerCase() === (propuesta.responsable || '').toLowerCase());
  const responsable = lista(
    [{ id: '', etiqueta: 'Sin responsable' },
      ...personas.map((p) => ({ id: p.id, etiqueta: p.nombre }))],
    coincidencia ? coincidencia.id : '',
  );
  responsable.addEventListener('change', () => { propuesta.responsableId = responsable.value; });
  propuesta.responsableId = coincidencia ? coincidencia.id : '';

  const inicio = entrada('date', propuesta.fechaInicio || '');
  inicio.addEventListener('change', () => { propuesta.fechaInicio = inicio.value || null; });

  const compromiso = entrada('date', propuesta.fechaCompromiso || '');
  compromiso.addEventListener('change', () => { propuesta.fechaCompromiso = compromiso.value || null; });

  const horas = entrada('number', propuesta.esfuerzoEstimadoH ?? '', { min: '0', step: '0.5' });
  horas.addEventListener('change', () => {
    propuesta.esfuerzoEstimadoH = horas.value === '' ? null : Number(horas.value);
  });

  const cadencia = lista(CADENCIAS.map((c) => ({ id: c.id, etiqueta: c.etiqueta })), propuesta.cadencia);
  cadencia.addEventListener('change', () => { propuesta.cadencia = cadencia.value; });

  const prioridad = lista(PRIORIDADES.map((p) => ({ id: p.id, etiqueta: p.etiqueta })), propuesta.prioridad);
  prioridad.addEventListener('change', () => { propuesta.prioridad = prioridad.value; });

  cuerpo.appendChild(h('tr', {},
    h('td', {}, marca),
    h('td', { style: { minWidth: '260px' } },
      titulo,
      propuesta.confianza === 'baja'
        ? h('div', { class: 'mt-8' }, pastilla('Lectura poco clara, revísala', 'ambar', { punto: true }))
        : null),
    h('td', { style: { minWidth: '150px' } }, responsable),
    h('td', {}, inicio),
    h('td', {}, compromiso),
    h('td', { style: { maxWidth: '86px' } }, horas),
    h('td', { style: { minWidth: '130px' } }, cadencia),
    h('td', { style: { minWidth: '110px' } }, prioridad)));

  return {
    incluida: () => marca.checked,
    marcar: (valor) => { marca.checked = valor; propuesta.incluir = valor; },
  };
}

async function crear(controles) {
  const proyectoId = controles.proyectoId();
  const elegidas = propuestas.filter((p) => p.incluir && p.titulo.trim());
  if (!elegidas.length) {
    tostada('No hay ninguna actividad seleccionada.', 'error');
    return;
  }

  let orden = Date.now();
  for (const propuesta of elegidas) {
    await store.crearTarea({
      proyectoId,
      titulo: propuesta.titulo.trim(),
      descripcion: [propuesta.descripcion, propuesta.fase ? `Fase: ${propuesta.fase}` : '']
        .filter(Boolean).join('\n'),
      responsableId: propuesta.responsableId || null,
      prioridad: propuesta.prioridad,
      fechaInicio: propuesta.fechaInicio,
      fechaCompromiso: propuesta.fechaCompromiso,
      esfuerzoEstimadoH: propuesta.esfuerzoEstimadoH,
      cadencia: propuesta.cadencia,
      etiquetas: propuesta.fase ? [normalizarEtiqueta(propuesta.fase)] : [],
      origen: 'roadmap-ia',
      orden: orden++,
    });
  }

  tostada(`${elegidas.length} actividades creadas en ${store.nombreDe('proyectos', proyectoId)}`, 'ok');
  propuestas = null;
  avisos = [];
  imagen = null;
  irA('tablero');
}

function normalizarEtiqueta(texto) {
  return String(texto).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
