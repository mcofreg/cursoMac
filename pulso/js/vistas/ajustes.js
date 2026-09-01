/* Ajustes: quién es quién (iniciativas, equipos, personas y proyectos), los
 * avisos del navegador, la apariencia y, sobre todo, el respaldo de los datos.
 * Como todo vive en este navegador, exportar el JSON es la única forma de
 * llevarse la información a otro equipo o de compartirla con el resto. */

import {
  h, boton, pastilla, avatar, campo, entrada, lista, modal, confirmar,
  tostada, segmentado,
} from '../ui/componentes.js';
import { abrirProyecto } from './portafolio.js';
import * as store from '../store/store.js';
import { ESTADOS_PROYECTO, PLANTILLAS, COLORES, etiquetaDe, colorDe } from '../store/schema.js';
import { descargarRespaldo, leerArchivo } from '../store/backup.js';
import { enModoRespaldo } from '../store/db.js';
import { construirSemilla } from '../store/seed.js';
import { formatear, hoyISO } from '../domain/fechas.js';
import { permiso, soportaNotificaciones, activar, revisar } from '../notificaciones.js';
import { repintar } from '../router.js';

export const vista = {
  id: 'ajustes',
  titulo: 'Ajustes',
  subtitulo: () => 'Equipos, personas, proyectos, avisos y respaldo de los datos',
  acciones: () => [],
  pintar,
};

function pintar(contenedor) {
  contenedor.appendChild(h('div', { class: 'rejilla rejilla--2' },
    panelIniciativas(),
    panelEquipos(),
    panelPersonas(),
    panelProyectos()));
  contenedor.appendChild(h('div', { class: 'rejilla rejilla--2 mt-16' },
    panelAvisos(),
    panelApariencia()));
  contenedor.appendChild(h('div', { class: 'mt-16' }, panelDatos()));
}

function panel(titulo, accion, cuerpo, pie) {
  return h('section', { class: 'tarjeta' },
    h('div', { class: 'tarjeta__cab' }, h('h2', { class: 'crecer' }, titulo), accion || null),
    h('div', { class: 'tarjeta__cuerpo' }, cuerpo, pie || null));
}

function filaSimple(contenido, acciones) {
  return h('div', { class: 'fila-alerta' },
    h('div', { class: 'fila-alerta__texto' }, contenido),
    acciones);
}

/* --------------------------------------------------------- iniciativas */

function panelIniciativas() {
  const activa = store.config('iniciativaActiva');
  const filas = store.estado.iniciativas.map((iniciativa) => filaSimple(
    h('div', {},
      h('div', { class: 'fila' },
        h('span', { class: 'negrita' }, iniciativa.nombre),
        iniciativa.id === activa ? pastilla('activa', 'acento') : null),
      h('div', { class: 'fila-alerta__sub truncar' },
        [iniciativa.fechaInicio ? `desde ${formatear(iniciativa.fechaInicio, { anio: true })}` : null,
          iniciativa.fechaFin ? `hasta ${formatear(iniciativa.fechaFin, { anio: true })}` : null,
          `${store.estado.proyectos.filter((p) => p.iniciativaId === iniciativa.id).length} proyectos`,
        ].filter(Boolean).join(' · '))),
    h('div', { class: 'fila' },
      boton('', { icono: 'lapiz', sm: true, variante: 'plano', titulo: 'Editar',
        onclick: () => abrirIniciativa(iniciativa.id) }),
      boton('', { icono: 'basura', sm: true, variante: 'plano', titulo: 'Eliminar',
        onclick: () => eliminarIniciativa(iniciativa) })),
  ));

  return panel('Iniciativas',
    boton('Nueva', { icono: 'mas', sm: true, onclick: () => abrirIniciativa(null) }),
    filas.length
      ? h('div', { class: 'lista-alertas' }, filas)
      : h('p', { class: 'tenue pequeno mb-0' },
        'Una iniciativa agrupa varios proyectos y es lo que resume el informe general.'));
}

function abrirIniciativa(iniciativaId) {
  const existente = iniciativaId ? store.porId('iniciativas', iniciativaId) : null;
  const iniciativa = existente || PLANTILLAS.iniciativas();

  const nombre = entrada('text', iniciativa.nombre, { placeholder: 'Nombre de la iniciativa' });
  const objetivo = entrada('text', iniciativa.objetivo, { placeholder: 'Qué se busca lograr' });
  const dueno = lista([{ id: '', etiqueta: 'Sin responsable' },
    ...store.estado.personas.map((p) => ({ id: p.id, etiqueta: p.nombre }))], iniciativa.duenoId || '');
  const inicio = entrada('date', iniciativa.fechaInicio || hoyISO());
  const fin = entrada('date', iniciativa.fechaFin || '');

  const control = modal({
    titulo: existente ? 'Editar iniciativa' : 'Nueva iniciativa',
    cuerpo: h('div', {},
      campo('Nombre', nombre),
      campo('Objetivo', objetivo),
      campo('Responsable', dueno),
      h('div', { class: 'rejilla-campos' },
        campo('Inicio', inicio),
        campo('Fin previsto', fin))),
    acciones: [boton(existente ? 'Guardar' : 'Crear', {
      variante: 'primario',
      onclick: async () => {
        if (!nombre.value.trim()) { tostada('Ponle un nombre.', 'error'); return; }
        const guardada = await store.guardar('iniciativas', {
          ...iniciativa,
          nombre: nombre.value.trim(),
          objetivo: objetivo.value.trim(),
          duenoId: dueno.value || null,
          fechaInicio: inicio.value || null,
          fechaFin: fin.value || null,
        });
        if (!store.config('iniciativaActiva')) store.fijarConfig({ iniciativaActiva: guardada.id });
        tostada(existente ? 'Iniciativa actualizada' : 'Iniciativa creada', 'ok');
        control.cerrar();
      },
    })],
  });
}

async function eliminarIniciativa(iniciativa) {
  const proyectos = store.estado.proyectos.filter((p) => p.iniciativaId === iniciativa.id).length;
  const si = await confirmar('Eliminar iniciativa',
    `Se eliminará "${iniciativa.nombre}"${proyectos ? ` junto con sus ${proyectos} proyecto(s) y todas sus tareas` : ''}. No se puede deshacer.`,
    { textoSi: 'Eliminar', peligro: true });
  if (!si) return;
  await store.eliminar('iniciativas', iniciativa.id);
  if (store.config('iniciativaActiva') === iniciativa.id) {
    store.fijarConfig({ iniciativaActiva: (store.estado.iniciativas[0] || {}).id || null });
  }
  tostada('Iniciativa eliminada');
}

/* -------------------------------------------------------------- equipos */

function panelEquipos() {
  const filas = store.estado.equipos.map((equipo) => filaSimple(
    h('div', {},
      h('div', { class: 'fila' },
        h('span', { class: 'punto', style: { background: equipo.color } }),
        h('span', { class: 'negrita' }, equipo.nombre)),
      h('div', { class: 'fila-alerta__sub truncar' },
        `${store.personasDeEquipo(equipo.id).length} personas · `
        + `${store.estado.proyectos.filter((p) => p.equipoId === equipo.id).length} proyectos`
        + (equipo.descripcion ? ` · ${equipo.descripcion}` : ''))),
    h('div', { class: 'fila' },
      boton('', { icono: 'lapiz', sm: true, variante: 'plano', titulo: 'Editar',
        onclick: () => abrirEquipo(equipo.id) }),
      boton('', { icono: 'basura', sm: true, variante: 'plano', titulo: 'Eliminar',
        onclick: async () => {
          const si = await confirmar('Eliminar equipo',
            `Se eliminará "${equipo.nombre}". Sus proyectos quedarán sin equipo asignado.`,
            { textoSi: 'Eliminar', peligro: true });
          if (si) { await store.eliminar('equipos', equipo.id); tostada('Equipo eliminado'); }
        } })),
  ));

  return panel('Equipos',
    boton('Nuevo', { icono: 'mas', sm: true, onclick: () => abrirEquipo(null) }),
    filas.length
      ? h('div', { class: 'lista-alertas' }, filas)
      : h('p', { class: 'tenue pequeno mb-0' }, 'Todavía no hay equipos.'));
}

function abrirEquipo(equipoId) {
  const existente = equipoId ? store.porId('equipos', equipoId) : null;
  const equipo = existente || {
    ...PLANTILLAS.equipos(),
    color: COLORES[store.estado.equipos.length % COLORES.length],
  };
  const nombre = entrada('text', equipo.nombre, { placeholder: 'Plataforma, Canales, Datos…' });
  const descripcion = entrada('text', equipo.descripcion, { placeholder: 'De qué se hace cargo' });
  const color = selectorColor(equipo.color);

  const control = modal({
    titulo: existente ? 'Editar equipo' : 'Nuevo equipo',
    cuerpo: h('div', {},
      campo('Nombre', nombre),
      campo('Descripción', descripcion),
      campo('Color', color.nodo, 'Se usa en el tablero y en el cronograma para reconocerlo.')),
    acciones: [boton(existente ? 'Guardar' : 'Crear', {
      variante: 'primario',
      onclick: async () => {
        if (!nombre.value.trim()) { tostada('Ponle un nombre.', 'error'); return; }
        await store.guardar('equipos', {
          ...equipo,
          nombre: nombre.value.trim(),
          descripcion: descripcion.value.trim(),
          color: color.valor(),
        });
        tostada(existente ? 'Equipo actualizado' : 'Equipo creado', 'ok');
        control.cerrar();
      },
    })],
  });
}

/** Paleta de colores en botones, más clara que un desplegable. */
function selectorColor(inicial) {
  let elegido = inicial || COLORES[0];
  const nodo = h('div', { class: 'fila envolver' });
  const botones = COLORES.map((c) => {
    const b = h('button', {
      type: 'button',
      'aria-label': `Color ${c}`,
      style: {
        width: '28px', height: '28px', borderRadius: '50%', cursor: 'pointer',
        background: c, border: '2px solid transparent',
      },
      onclick: () => { elegido = c; refrescar(); },
    });
    return b;
  });
  function refrescar() {
    botones.forEach((b, i) => {
      b.style.borderColor = COLORES[i] === elegido ? 'var(--texto)' : 'transparent';
    });
  }
  botones.forEach((b) => nodo.appendChild(b));
  refrescar();
  return { nodo, valor: () => elegido };
}

/* ------------------------------------------------------------- personas */

function panelPersonas() {
  const filas = store.estado.personas.map((persona) => filaSimple(
    h('div', { class: 'fila' },
      avatar(persona, 'sm'),
      h('div', { class: 'crecer' },
        h('div', { class: 'negrita' }, persona.nombre),
        h('div', { class: 'fila-alerta__sub truncar' },
          [(persona.equipoIds || []).map((id) => store.nombreDe('equipos', id)).join(', ') || 'sin equipo',
            persona.email].filter(Boolean).join(' · ')))),
    h('div', { class: 'fila' },
      boton('', { icono: 'lapiz', sm: true, variante: 'plano', titulo: 'Editar',
        onclick: () => abrirPersona(persona.id) }),
      boton('', { icono: 'basura', sm: true, variante: 'plano', titulo: 'Eliminar',
        onclick: async () => {
          const asignadas = store.estado.tareas.filter((t) => t.responsableId === persona.id).length;
          const si = await confirmar('Eliminar persona',
            `Se eliminará a ${persona.nombre}.`
            + (asignadas ? ` Sus ${asignadas} tarea(s) quedarán sin responsable.` : ''),
            { textoSi: 'Eliminar', peligro: true });
          if (si) { await store.eliminar('personas', persona.id); tostada('Persona eliminada'); }
        } })),
  ));

  return panel('Personas',
    boton('Nueva', { icono: 'mas', sm: true, onclick: () => abrirPersona(null) }),
    filas.length
      ? h('div', { class: 'lista-alertas' }, filas)
      : h('p', { class: 'tenue pequeno mb-0' }, 'Agrega a quienes llevan los temas.'));
}

function abrirPersona(personaId) {
  const existente = personaId ? store.porId('personas', personaId) : null;
  const persona = existente || {
    ...PLANTILLAS.personas(),
    color: COLORES[store.estado.personas.length % COLORES.length],
  };
  const nombre = entrada('text', persona.nombre, { placeholder: 'Nombre y apellido' });
  const email = entrada('email', persona.email, { placeholder: 'opcional' });
  const color = selectorColor(persona.color);

  const casillas = store.estado.equipos.map((equipo) => {
    const casilla = h('input', { type: 'checkbox', id: `eq_${equipo.id}` });
    casilla.checked = (persona.equipoIds || []).includes(equipo.id);
    casilla.dataset.equipo = equipo.id;
    return h('label', { class: 'fila', style: { marginBottom: '6px', cursor: 'pointer' } },
      casilla, h('span', { class: 'punto', style: { background: equipo.color } }), equipo.nombre);
  });

  const control = modal({
    titulo: existente ? 'Editar persona' : 'Nueva persona',
    cuerpo: h('div', {},
      campo('Nombre', nombre),
      campo('Correo', email),
      campo('Equipos', h('div', {}, casillas.length ? casillas
        : h('p', { class: 'tenue pequeno mb-0' }, 'Todavía no hay equipos creados.'))),
      campo('Color del avatar', color.nodo)),
    acciones: [boton(existente ? 'Guardar' : 'Crear', {
      variante: 'primario',
      onclick: async () => {
        if (!nombre.value.trim()) { tostada('Ponle un nombre.', 'error'); return; }
        const equipoIds = [...control.caja.querySelectorAll('input[type=checkbox][data-equipo]')]
          .filter((c) => c.checked).map((c) => c.dataset.equipo);
        await store.guardar('personas', {
          ...persona,
          nombre: nombre.value.trim(),
          email: email.value.trim(),
          equipoIds,
          color: color.valor(),
        });
        tostada(existente ? 'Persona actualizada' : 'Persona creada', 'ok');
        control.cerrar();
      },
    })],
  });
}

/* ------------------------------------------------------------ proyectos */

function panelProyectos() {
  const filas = store.estado.proyectos.map((proyecto) => filaSimple(
    h('div', {},
      h('div', { class: 'fila' },
        h('span', { class: 'negrita' }, proyecto.nombre),
        pastilla(etiquetaDe(ESTADOS_PROYECTO, proyecto.estado), colorDe(ESTADOS_PROYECTO, proyecto.estado))),
      h('div', { class: 'fila-alerta__sub truncar' },
        [store.nombreDe('iniciativas', proyecto.iniciativaId, 'sin iniciativa'),
          store.nombreDe('equipos', proyecto.equipoId, 'sin equipo'),
          `${store.tareasDeProyecto(proyecto.id).length} tareas`].join(' · '))),
    boton('', { icono: 'lapiz', sm: true, variante: 'plano', titulo: 'Editar',
      onclick: () => abrirProyecto(proyecto.id) }),
  ));

  return panel('Proyectos',
    boton('Nuevo', { icono: 'mas', sm: true, onclick: () => abrirProyecto(null) }),
    filas.length
      ? h('div', { class: 'lista-alertas' }, filas)
      : h('p', { class: 'tenue pequeno mb-0' }, 'Todavía no hay proyectos.'));
}

/* --------------------------------------------------------------- avisos */

function panelAvisos() {
  const estado = permiso();
  const configuracion = store.config('notificaciones');
  const cuerpo = h('div', {});

  if (!soportaNotificaciones()) {
    cuerpo.appendChild(h('p', { class: 'pequeno suave' },
      'Este navegador no admite avisos del sistema. Las alertas siguen apareciendo dentro de '
      + 'Pulso, en el panel Radar y en la insignia del menú.'));
    return panel('Avisos de vencimiento', null, cuerpo);
  }

  const encendido = configuracion.activadas && estado === 'granted';
  cuerpo.appendChild(h('div', { class: 'fila mb-8' },
    pastilla(encendido ? 'Encendidos' : 'Apagados', encendido ? 'verde' : '', { punto: true }),
    estado === 'denied' ? pastilla('bloqueados por el navegador', 'rojo') : null));

  cuerpo.appendChild(h('p', { class: 'pequeno suave' },
    'Pulso revisa los vencimientos al abrirse y luego cada media hora, y manda como máximo un '
    + 'aviso al día para no volverse ruido. Como no hay servidor detrás, el aviso solo puede '
    + 'salir mientras la pestaña esté abierta: deja Pulso anclado en una pestaña para que te avise.'));

  if (estado === 'denied') {
    cuerpo.appendChild(h('p', { class: 'pequeno mb-0' },
      'Los avisos están bloqueados para este sitio. Habilítalos desde el candado de la barra de '
      + 'direcciones y vuelve a intentarlo.'));
    return panel('Avisos de vencimiento', null, cuerpo);
  }

  cuerpo.appendChild(h('div', { class: 'fila mt-16' },
    boton(encendido ? 'Apagar los avisos' : 'Encender los avisos', {
      icono: 'alerta',
      variante: encendido ? '' : 'primario',
      onclick: async () => {
        const ok = await activar(!encendido);
        if (!encendido && !ok) tostada('El navegador no dio permiso para avisar.', 'error');
        repintar();
      },
    }),
    encendido
      ? boton('Probar', {
        sm: true,
        onclick: () => {
          const texto = revisar(true);
          tostada(texto ? 'Aviso enviado' : 'No se pudo enviar el aviso', texto ? 'ok' : 'error');
        },
      })
      : null));

  if (configuracion.ultimoAviso) {
    cuerpo.appendChild(h('p', { class: 'mini tenue mt-8 mb-0' },
      `Último aviso enviado el ${formatear(configuracion.ultimoAviso, { anio: true })}.`));
  }

  return panel('Avisos de vencimiento', null, cuerpo);
}

/* ----------------------------------------------------------- apariencia */

function panelApariencia() {
  return panel('Apariencia', null, h('div', {},
    h('p', { class: 'pequeno suave' }, 'Elige el tema o deja que siga al del sistema.'),
    segmentado(
      [{ id: 'sistema', etiqueta: 'Del sistema' },
        { id: 'claro', etiqueta: 'Claro' },
        { id: 'oscuro', etiqueta: 'Oscuro' }],
      store.config('tema'),
      (id) => {
        store.fijarConfig({ tema: id });
        if (id === 'sistema') delete document.documentElement.dataset.tema;
        else document.documentElement.dataset.tema = id;
        repintar();
      },
    )));
}

/* ---------------------------------------------------------------- datos */

function panelDatos() {
  const totales = ['equipos', 'personas', 'iniciativas', 'proyectos', 'tareas', 'seguimientos', 'aprendizajes']
    .map((tipo) => `${store.estado[tipo].length} ${tipo}`).join(' · ');

  const entradaArchivo = h('input', {
    type: 'file', accept: 'application/json,.json', class: 'oculto',
    onchange: (e) => { if (e.target.files[0]) importar(e.target.files[0]); },
  });

  return h('section', { class: 'tarjeta' },
    h('div', { class: 'tarjeta__cab' }, h('h2', {}, 'Tus datos')),
    h('div', { class: 'tarjeta__cuerpo' },
      h('p', { class: 'pequeno suave' },
        'Todo lo que ves vive únicamente en este navegador y en este equipo: no hay servidor ni '
        + 'cuenta de usuario. Exporta el archivo JSON para respaldarlo, llevarlo a otro computador '
        + 'o pasárselo a alguien más del equipo.'),
      h('div', { class: 'fila envolver mb-16' },
        h('span', { class: 'pequeno suave' }, totales),
        pastilla(enModoRespaldo() ? 'Guardando en localStorage' : 'Guardando en IndexedDB', 'azul',
          { titulo: enModoRespaldo()
            ? 'IndexedDB no está disponible en este navegador; se está usando el almacenamiento simple.'
            : 'Almacenamiento estándar del navegador.' })),
      h('div', { class: 'fila envolver' },
        boton('Exportar respaldo', { icono: 'descargar', variante: 'primario',
          onclick: () => { descargarRespaldo(); tostada('Respaldo descargado', 'ok'); } }),
        boton('Importar respaldo', { icono: 'subir', onclick: () => entradaArchivo.click() }),
        boton('Cargar datos de ejemplo', { icono: 'roadmap', onclick: cargarEjemplo }),
        h('span', { class: 'separador' }),
        boton('Borrar todo', { icono: 'basura', variante: 'peligro', onclick: borrarTodo })),
      entradaArchivo,
      h('p', { class: 'mini tenue mt-16 mb-0' },
        'Importar reemplaza por completo lo que hay ahora. Exporta antes si no quieres perderlo.')));
}

async function importar(archivo) {
  let resultado;
  try {
    resultado = await leerArchivo(archivo);
  } catch (e) {
    tostada(e.message, 'error');
    return;
  }

  const detalle = h('ul', { class: 'pequeno', style: { paddingLeft: '18px' } },
    resultado.resumen.filter((r) => r.cantidad).map((r) => h('li', {}, `${r.cantidad} ${r.tipo}`)));

  const control = modal({
    titulo: 'Importar respaldo',
    cuerpo: h('div', {},
      h('p', {}, `El archivo ${archivo.name} contiene:`),
      detalle,
      resultado.avisos.length
        ? h('div', { class: 'mt-8' }, resultado.avisos.map((a) => pastilla(a, 'ambar')))
        : null,
      h('p', { class: 'mt-16 mb-0 negrita' },
        'Esto reemplazará por completo los datos actuales de este navegador.')),
    acciones: [
      boton('Cancelar', { onclick: () => control.cerrar() }),
      boton('Reemplazar mis datos', {
        variante: 'peligro',
        onclick: async () => {
          await store.reemplazarBase(resultado.datos);
          store.fijarConfig({ semillaCargada: true });
          tostada('Respaldo importado', 'ok');
          control.cerrar();
        },
      }),
    ],
  });
}

async function cargarEjemplo() {
  const si = await confirmar('Cargar datos de ejemplo',
    'Se agregarán tres equipos, ocho personas, una iniciativa con cuatro proyectos y sus tareas. '
    + 'Lo que ya tienes no se borra, pero si el ejemplo ya estaba cargado se sobrescribe.',
    { textoSi: 'Cargar' });
  if (!si) return;
  const semilla = construirSemilla();
  for (const [tipo, elementos] of Object.entries(semilla)) await store.guardarVarios(tipo, elementos);
  store.fijarConfig({ semillaCargada: true, iniciativaActiva: semilla.iniciativas[0].id });
  tostada('Datos de ejemplo cargados', 'ok');
}

async function borrarTodo() {
  const si = await confirmar('Borrar todos los datos',
    'Se eliminarán equipos, personas, iniciativas, proyectos, tareas, seguimientos y aprendizajes '
    + 'de este navegador. No se puede deshacer: exporta un respaldo antes si tienes dudas.',
    { textoSi: 'Borrar todo', peligro: true });
  if (!si) return;
  await store.vaciarBase();
  tostada('Datos borrados');
}
