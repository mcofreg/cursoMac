/* Datos de ejemplo.
 * Se cargan la primera vez que se abre Pulso para que la herramienta se vea
 * viva desde el primer segundo. Todas las fechas son relativas a hoy, así que
 * el ejemplo siempre tiene tareas atrasadas, otras por vencer y otras cerradas.
 * Se puede recargar o borrar desde Ajustes. */

import { PLANTILLAS, COLORES, nuevoId } from './schema.js';
import { hoyISO, sumarDias } from '../domain/fechas.js';
import { primerSeguimiento, proximoSeguimiento } from '../domain/cadencia.js';

const d = (n) => sumarDias(hoyISO(), n);

export function construirSemilla() {
  const equipos = [
    { id: 'eq_plataforma', nombre: 'Plataforma', color: COLORES[0], descripcion: 'Infraestructura, despliegue y servicios comunes' },
    { id: 'eq_canales',    nombre: 'Canales digitales', color: COLORES[1], descripcion: 'Web pública, app móvil y micro-frontends' },
    { id: 'eq_datos',      nombre: 'Datos', color: COLORES[2], descripcion: 'Ingesta, modelo analítico y reportería' },
  ].map((e) => ({ ...PLANTILLAS.equipos(), ...e }));

  const personas = [
    { id: 'pe_mauricio', nombre: 'Mauricio Cofré', email: 'mcofreg@gmail.com', equipoIds: ['eq_plataforma', 'eq_canales', 'eq_datos'] },
    { id: 'pe_camila',   nombre: 'Camila Rojas',   equipoIds: ['eq_plataforma'] },
    { id: 'pe_diego',    nombre: 'Diego Fuentes',  equipoIds: ['eq_plataforma'] },
    { id: 'pe_valentina',nombre: 'Valentina Soto', equipoIds: ['eq_canales'] },
    { id: 'pe_ignacio',  nombre: 'Ignacio Pérez',  equipoIds: ['eq_canales'] },
    { id: 'pe_paula',    nombre: 'Paula Muñoz',    equipoIds: ['eq_datos'] },
    { id: 'pe_rodrigo',  nombre: 'Rodrigo Lagos',  equipoIds: ['eq_datos'] },
    { id: 'pe_javiera',  nombre: 'Javiera Núñez',  equipoIds: ['eq_canales', 'eq_datos'] },
  ].map((p, i) => ({ ...PLANTILLAS.personas(), ...p, color: COLORES[i % COLORES.length] }));

  const iniciativas = [{
    ...PLANTILLAS.iniciativas(),
    id: 'in_omnicanal',
    nombre: 'Modernización omnicanal',
    objetivo: 'Unificar la experiencia web y móvil sobre una plataforma común, con datos '
      + 'confiables y despliegues sin ventana de indisponibilidad.',
    duenoId: 'pe_mauricio',
    fechaInicio: d(-95),
    fechaFin: d(115),
    estado: 'en_curso',
  }];

  const proyectos = [
    {
      id: 'pr_pipeline', nombre: 'Pipeline de despliegue continuo', equipoId: 'eq_plataforma',
      responsableId: 'pe_camila', descripcion: 'Construcción, pruebas y despliegue automatizado con vuelta atrás en un clic.',
      fechaInicio: d(-90), fechaFinPlan: d(20), estado: 'en_curso', cadenciaDefecto: 'semanal',
    },
    {
      id: 'pr_portal', nombre: 'Nuevo portal de clientes', equipoId: 'eq_canales',
      responsableId: 'pe_valentina', descripcion: 'Rediseño del portal con micro-frontends y autenticación única.',
      fechaInicio: d(-70), fechaFinPlan: d(45), estado: 'en_riesgo', cadenciaDefecto: 'semanal',
    },
    {
      id: 'pr_datos', nombre: 'Modelo analítico único', equipoId: 'eq_datos',
      responsableId: 'pe_paula', descripcion: 'Ingesta diaria, capa semántica y tablero de indicadores del negocio.',
      fechaInicio: d(-55), fechaFinPlan: d(70), estado: 'en_curso', cadenciaDefecto: 'bisemanal',
    },
    {
      id: 'pr_app', nombre: 'App móvil v2', equipoId: 'eq_canales',
      responsableId: 'pe_ignacio', descripcion: 'Nueva versión con notificaciones y modo sin conexión.',
      fechaInicio: d(-20), fechaFinPlan: d(105), estado: 'planificado', cadenciaDefecto: 'mensual',
    },
  ].map((p) => ({ ...PLANTILLAS.proyectos(), ...p, iniciativaId: 'in_omnicanal' }));

  /* [proyecto, título, responsable, estado, inicio, compromiso, estimado, real, cadencia, prioridad, etiquetas] */
  const filas = [
    ['pr_pipeline', 'Definir estrategia de ramas y versionado', 'pe_camila', 'hecha', -88, -74, 16, 14, 'semanal', 'alta', ['proceso']],
    ['pr_pipeline', 'Automatizar la construcción de imágenes', 'pe_diego', 'hecha', -72, -55, 24, 30, 'semanal', 'alta', ['ci']],
    ['pr_pipeline', 'Suite de pruebas de humo en preproducción', 'pe_diego', 'hecha', -54, -38, 20, 18, 'semanal', 'media', ['calidad']],
    ['pr_pipeline', 'Despliegue azul-verde en producción', 'pe_camila', 'en_curso', -30, -4, 32, 26, 'diaria', 'critica', ['riesgo', 'infra']],
    ['pr_pipeline', 'Vuelta atrás automática ante fallo de salud', 'pe_diego', 'en_curso', -18, 6, 16, 5, 'semanal', 'alta', ['infra']],
    ['pr_pipeline', 'Firmar artefactos y validar procedencia', 'pe_camila', 'pendiente', 2, 18, 12, 0, 'semanal', 'media', ['seguridad']],
    ['pr_pipeline', 'Manual de operación y traspaso a soporte', null, 'pendiente', 8, 20, 8, 0, 'mensual', 'baja', ['documentación']],

    ['pr_portal', 'Levantamiento de la experiencia actual', 'pe_valentina', 'hecha', -68, -58, 24, 22, 'semanal', 'media', ['descubrimiento']],
    ['pr_portal', 'Sistema de diseño y librería de componentes', 'pe_javiera', 'hecha', -57, -35, 40, 52, 'semanal', 'alta', ['diseño']],
    ['pr_portal', 'Autenticación única con el proveedor corporativo', 'pe_ignacio', 'bloqueada', -40, -12, 28, 20, 'diaria', 'critica', ['seguridad', 'dependencia']],
    ['pr_portal', 'Contenedor de micro-frontends', 'pe_valentina', 'en_curso', -34, -1, 36, 34, 'semanal', 'alta', ['arquitectura']],
    ['pr_portal', 'Migrar el módulo de pagos', 'pe_ignacio', 'en_curso', -20, 4, 30, 12, 'semanal', 'alta', ['pagos']],
    ['pr_portal', 'Accesibilidad AA en las pantallas críticas', 'pe_javiera', 'en_revision', -14, 0, 18, 16, 'semanal', 'media', ['accesibilidad']],
    ['pr_portal', 'Pruebas de carga del portal', null, 'pendiente', 6, 22, 16, 0, 'semanal', 'media', ['calidad']],
    ['pr_portal', 'Plan de corte y convivencia con el portal viejo', 'pe_valentina', 'pendiente', 15, 40, 20, 0, 'quincenal', 'alta', ['corte']],

    ['pr_datos', 'Inventario de fuentes y dueños de datos', 'pe_paula', 'hecha', -53, -42, 20, 19, 'bisemanal', 'media', ['gobierno']],
    ['pr_datos', 'Ingesta diaria incremental', 'pe_rodrigo', 'hecha', -40, -22, 32, 38, 'bisemanal', 'alta', ['ingesta']],
    ['pr_datos', 'Capa semántica de negocio', 'pe_paula', 'en_curso', -24, 8, 40, 24, 'bisemanal', 'alta', ['modelo']],
    ['pr_datos', 'Reglas de calidad y alertas de datos', 'pe_rodrigo', 'en_curso', -12, -2, 24, 18, 'semanal', 'alta', ['calidad']],
    ['pr_datos', 'Tablero de indicadores de la iniciativa', 'pe_javiera', 'pendiente', 5, 25, 28, 0, 'bisemanal', 'media', ['reportería']],
    ['pr_datos', 'Documentar el diccionario de datos', null, 'pendiente', 20, 55, 16, 0, 'mensual', 'baja', ['documentación']],
    ['pr_datos', 'Retención y borrado de datos personales', 'pe_paula', 'pendiente', 25, 60, 20, 0, 'mensual', 'media', ['cumplimiento']],

    ['pr_app', 'Definir alcance funcional de la v2', 'pe_ignacio', 'en_curso', -18, 1, 16, 10, 'semanal', 'alta', ['alcance']],
    ['pr_app', 'Prototipo navegable', 'pe_javiera', 'pendiente', 4, 24, 24, 0, 'semanal', 'media', ['diseño']],
    ['pr_app', 'Notificaciones push', 'pe_ignacio', 'pendiente', 26, 55, 32, 0, 'mensual', 'media', ['móvil']],
    ['pr_app', 'Modo sin conexión y sincronización', null, 'pendiente', 40, 80, 48, 0, 'mensual', 'alta', ['móvil', 'riesgo']],
    ['pr_app', 'Publicación en las tiendas', 'pe_ignacio', 'pendiente', 85, 100, 12, 0, 'mensual', 'baja', ['lanzamiento']],
  ];

  const tareas = filas.map(([proyectoId, titulo, responsableId, estadoTarea, ini, fin, est, real, cadencia, prioridad, etiquetas], i) => {
    const tarea = {
      ...PLANTILLAS.tareas(),
      id: `ta_semilla_${i}`,
      proyectoId,
      titulo,
      responsableId,
      estado: estadoTarea,
      prioridad,
      fechaInicio: d(ini),
      fechaCompromiso: d(fin),
      fechaCierreReal: estadoTarea === 'hecha' ? d(fin + (i % 3 === 0 ? 2 : -1)) : null,
      esfuerzoEstimadoH: est,
      esfuerzoRealH: real,
      cadencia,
      etiquetas,
      avance: avancePorEstado(estadoTarea, i),
      motivoBloqueo: estadoTarea === 'bloqueada'
        ? 'El proveedor corporativo no ha habilitado el ambiente de pruebas de identidad.'
        : '',
      origen: 'manual',
      orden: i * 100,
      creadaEn: new Date().toISOString(),
    };
    if (estadoTarea !== 'hecha') {
      if (ini < 0) {
        // El último seguimiento cae entre 1 y 9 días atrás: según la cadencia,
        // algunas quedan al día y otras con el seguimiento vencido. Así el
        // panel Radar tiene siempre casos reales que mostrar.
        tarea.ultimoSeguimiento = d(-((i % 9) + 1));
        tarea.proximoSeguimiento = proximoSeguimiento(cadencia, tarea.ultimoSeguimiento);
      } else {
        tarea.proximoSeguimiento = primerSeguimiento(tarea);
      }
    }
    return tarea;
  });

  const seguimientos = [];
  for (const tarea of tareas) {
    if (!tarea.ultimoSeguimiento) continue;
    seguimientos.push({
      ...PLANTILLAS.seguimientos(),
      id: nuevoId('sg'),
      tareaId: tarea.id,
      fecha: tarea.ultimoSeguimiento,
      autorId: tarea.responsableId,
      avance: tarea.avance,
      semaforo: tarea.estado === 'bloqueada' ? 'rojo' : 'ambar',
      comentario: tarea.estado === 'bloqueada'
        ? 'Sigue detenido a la espera del tercero. Se escaló a la gerencia del proveedor.'
        : 'Avance conforme a lo planificado; sin cambios en el alcance.',
      horasImputadas: 0,
    });
  }

  const aprendizajes = [
    ['proyecto', 'pr_pipeline', -40, 'bien', 'Automatizar las pruebas de humo bajó los incidentes de despliegue de 4 a 0 por mes.', 'pe_camila', '', null, 'sin_accion'],
    ['proyecto', 'pr_pipeline', -20, 'mejorar', 'Subestimamos el tiempo de la construcción de imágenes: 30 horas reales contra 24 estimadas.', 'pe_diego', 'Estimar con un 25% de holgura las tareas de infraestructura nuevas.', 'pe_camila', 'hecha'],
    ['proyecto', 'pr_portal', -25, 'riesgo', 'La autenticación única depende de un tercero sin compromiso de fecha; bloquea la salida del portal.', 'pe_ignacio', 'Escalar semanalmente y preparar un plan B con autenticación propia.', 'pe_valentina', 'en_curso'],
    ['proyecto', 'pr_portal', -12, 'aprendizaje', 'Partir por el sistema de diseño costó 52 horas contra 40 estimadas, pero después cada pantalla tomó la mitad del tiempo.', 'pe_javiera', '', null, 'sin_accion'],
    ['proyecto', 'pr_datos', -18, 'mejorar', 'Las reglas de calidad llegaron después de la ingesta y hubo que reprocesar dos semanas de datos.', 'pe_rodrigo', 'Definir las reglas de calidad junto con la ingesta, no después.', 'pe_paula', 'pendiente'],
    ['iniciativa', 'in_omnicanal', -8, 'aprendizaje', 'Los seguimientos diarios solo aportan en las tareas críticas; en el resto generan ruido y se dejan de hacer.', 'pe_mauricio', 'Reservar la cadencia diaria para lo crítico y bloqueado.', 'pe_mauricio', 'hecha'],
    ['iniciativa', 'in_omnicanal', -3, 'riesgo', 'Tres tareas críticas dependen de las mismas dos personas del equipo de Plataforma.', 'pe_mauricio', 'Sumar una persona al equipo de Plataforma o correr la fecha del portal.', 'pe_mauricio', 'pendiente'],
  ].map(([ambito, refId, dia, tipo, texto, autorId, accionAcordada, responsableAccionId, estadoAccion]) => ({
    ...PLANTILLAS.aprendizajes(),
    id: nuevoId('ap'),
    ambito, refId, fecha: d(dia), tipo, texto, autorId,
    accionAcordada, responsableAccionId, estadoAccion,
  }));

  return { equipos, personas, iniciativas, proyectos, tareas, seguimientos, aprendizajes };
}

function avancePorEstado(estado, i) {
  if (estado === 'hecha') return 100;
  if (estado === 'en_revision') return 85;
  if (estado === 'en_curso') return 35 + (i % 4) * 10;
  if (estado === 'bloqueada') return 45;
  return 0;
}
