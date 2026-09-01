/* Respaldo y restauración.
 * Como los datos viven solo en este navegador, exportar un archivo JSON es la
 * forma de guardarlos fuera, de moverlos a otro equipo y de compartirlos con
 * otra persona del equipo. */

import { TIPOS, VERSION_DATOS, normalizar } from './schema.js';
import { estado } from './store.js';
import { hoyISO } from '../domain/fechas.js';

/** Arma el objeto de respaldo con todo lo que hay en memoria. */
export function construirRespaldo() {
  const datos = { formato: 'pulso', version: VERSION_DATOS, exportadoEn: new Date().toISOString() };
  for (const tipo of TIPOS) datos[tipo] = estado[tipo];
  datos.config = { ...estado.config };
  return datos;
}

/** Descarga el respaldo como archivo. */
export function descargarRespaldo() {
  const datos = construirRespaldo();
  const texto = JSON.stringify(datos, null, 2);
  const blob = new Blob([texto], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `pulso-${hoyISO()}.json`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return datos;
}

/**
 * Valida y normaliza un respaldo leído de un archivo.
 * @throws {Error} con un mensaje en castellano si el archivo no sirve.
 */
export function validarRespaldo(objeto) {
  if (!objeto || typeof objeto !== 'object') {
    throw new Error('El archivo no contiene datos de Pulso.');
  }
  if (objeto.formato && objeto.formato !== 'pulso') {
    throw new Error('El archivo es de otra herramienta, no de Pulso.');
  }
  const conocidos = TIPOS.filter((t) => Array.isArray(objeto[t]));
  if (!conocidos.length) {
    throw new Error('El archivo no trae ninguna lista reconocible (equipos, proyectos, tareas…).');
  }
  if (Number(objeto.version) > VERSION_DATOS) {
    throw new Error(`El respaldo es de una versión más nueva de Pulso (${objeto.version}). Actualiza la aplicación antes de importarlo.`);
  }

  const datos = {};
  for (const tipo of TIPOS) {
    datos[tipo] = (Array.isArray(objeto[tipo]) ? objeto[tipo] : [])
      .filter((x) => x && typeof x === 'object' && x.id)
      .map((x) => normalizar(tipo, x));
  }

  const idsProyecto = new Set(datos.proyectos.map((p) => p.id));
  const huerfanas = datos.tareas.filter((t) => t.proyectoId && !idsProyecto.has(t.proyectoId)).length;

  return {
    datos,
    resumen: TIPOS.map((tipo) => ({ tipo, cantidad: datos[tipo].length })),
    avisos: huerfanas
      ? [`${huerfanas} tarea(s) apuntan a un proyecto que no viene en el archivo; quedarán sin proyecto.`]
      : [],
  };
}

/** Lee un archivo elegido por el usuario y lo valida. */
export function leerArchivo(archivo) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => {
      try {
        resolver(validarRespaldo(JSON.parse(String(lector.result))));
      } catch (e) {
        rechazar(e instanceof SyntaxError ? new Error('El archivo no es un JSON válido.') : e);
      }
    };
    lector.onerror = () => rechazar(new Error('No se pudo leer el archivo.'));
    lector.readAsText(archivo);
  });
}

/** Exporta las tareas a CSV, para abrirlas en una planilla. */
export function descargarCSV(tareas, resolver) {
  const cabeceras = ['Proyecto', 'Equipo', 'Tarea', 'Responsable', 'Estado', 'Prioridad',
    'Inicio', 'Compromiso', 'Cierre real', 'Estimado (h)', 'Real (h)', 'Cadencia',
    'Próximo seguimiento', 'Días de atraso', 'Etiquetas'];
  const filas = tareas.map((t) => resolver(t));
  const texto = [cabeceras, ...filas]
    .map((fila) => fila.map(celdaCSV).join(';'))
    .join('\r\n');
  // El BOM hace que Excel abra el archivo en UTF-8 sin romper los acentos.
  const blob = new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `pulso-tareas-${hoyISO()}.csv`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function celdaCSV(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}
