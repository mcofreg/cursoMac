/* Persistencia local. Los datos viven en IndexedDB, en el navegador del usuario;
 * nada sale del equipo. Si IndexedDB no está disponible (ventana privada, un
 * navegador antiguo, permisos bloqueados) se cae de forma transparente a
 * localStorage, que basta de sobra para el volumen de un portafolio. */

import { TIPOS, VERSION_DATOS, CONFIG_POR_DEFECTO } from './schema.js';

const NOMBRE_DB = 'pulso';
const CLAVE_CONFIG = 'pulso.config';
const PREFIJO_RESPALDO = 'pulso.datos.';

let promesaDB = null;
let usandoRespaldo = false;

/** true si se está trabajando sobre localStorage en vez de IndexedDB. */
export function enModoRespaldo() {
  return usandoRespaldo;
}

function abrirIndexedDB() {
  return new Promise((resolver, rechazar) => {
    if (!globalThis.indexedDB) {
      rechazar(new Error('IndexedDB no disponible'));
      return;
    }
    const solicitud = indexedDB.open(NOMBRE_DB, VERSION_DATOS);
    solicitud.onupgradeneeded = () => {
      const db = solicitud.result;
      for (const tipo of TIPOS) {
        if (!db.objectStoreNames.contains(tipo)) db.createObjectStore(tipo, { keyPath: 'id' });
      }
    };
    solicitud.onsuccess = () => resolver(solicitud.result);
    solicitud.onerror = () => rechazar(solicitud.error || new Error('No se pudo abrir la base'));
    solicitud.onblocked = () => rechazar(new Error('Base bloqueada por otra pestaña'));
  });
}

async function db() {
  if (!promesaDB) {
    promesaDB = abrirIndexedDB().catch((e) => {
      usandoRespaldo = true;
      console.warn('Pulso guardará en localStorage:', e.message);
      return null;
    });
  }
  return promesaDB;
}

function transaccion(base, tipo, modo) {
  return base.transaction(tipo, modo).objectStore(tipo);
}

function envolver(solicitud) {
  return new Promise((resolver, rechazar) => {
    solicitud.onsuccess = () => resolver(solicitud.result);
    solicitud.onerror = () => rechazar(solicitud.error);
  });
}

/* ------------------------------------------------------- respaldo simple */

function respaldoLeer(tipo) {
  try {
    return JSON.parse(localStorage.getItem(PREFIJO_RESPALDO + tipo) || '[]');
  } catch { return []; }
}

function respaldoEscribir(tipo, lista) {
  try {
    localStorage.setItem(PREFIJO_RESPALDO + tipo, JSON.stringify(lista));
  } catch (e) {
    console.error('No se pudo guardar en localStorage', e);
    throw new Error('No hay espacio para guardar los datos en este navegador.');
  }
}

/* ------------------------------------------------------------- operaciones */

export async function leerTodo(tipo) {
  const base = await db();
  if (!base) return respaldoLeer(tipo);
  return envolver(transaccion(base, tipo, 'readonly').getAll());
}

/** Lee todos los almacenes de una vez: { equipos: [...], tareas: [...] } */
export async function leerBase() {
  const salida = {};
  for (const tipo of TIPOS) salida[tipo] = await leerTodo(tipo);
  return salida;
}

export async function guardar(tipo, objeto) {
  const base = await db();
  if (!base) {
    const lista = respaldoLeer(tipo);
    const i = lista.findIndex((x) => x.id === objeto.id);
    if (i >= 0) lista[i] = objeto; else lista.push(objeto);
    respaldoEscribir(tipo, lista);
    return objeto;
  }
  await envolver(transaccion(base, tipo, 'readwrite').put(objeto));
  return objeto;
}

export async function guardarVarios(tipo, objetos) {
  if (!objetos.length) return;
  const base = await db();
  if (!base) {
    const lista = respaldoLeer(tipo);
    for (const objeto of objetos) {
      const i = lista.findIndex((x) => x.id === objeto.id);
      if (i >= 0) lista[i] = objeto; else lista.push(objeto);
    }
    respaldoEscribir(tipo, lista);
    return;
  }
  const tx = base.transaction(tipo, 'readwrite');
  const almacen = tx.objectStore(tipo);
  for (const objeto of objetos) almacen.put(objeto);
  await new Promise((resolver, rechazar) => {
    tx.oncomplete = resolver;
    tx.onerror = () => rechazar(tx.error);
  });
}

export async function borrar(tipo, id) {
  const base = await db();
  if (!base) {
    respaldoEscribir(tipo, respaldoLeer(tipo).filter((x) => x.id !== id));
    return;
  }
  await envolver(transaccion(base, tipo, 'readwrite').delete(id));
}

export async function limpiar(tipo) {
  const base = await db();
  if (!base) {
    respaldoEscribir(tipo, []);
    return;
  }
  await envolver(transaccion(base, tipo, 'readwrite').clear());
}

/** Borra todos los almacenes. */
export async function limpiarTodo() {
  for (const tipo of TIPOS) await limpiar(tipo);
}

/** Reemplaza el contenido completo de la base (se usa al importar un respaldo). */
export async function reemplazarTodo(datos) {
  for (const tipo of TIPOS) {
    await limpiar(tipo);
    if (Array.isArray(datos[tipo]) && datos[tipo].length) await guardarVarios(tipo, datos[tipo]);
  }
}

/* ---------------------------------------------------------- configuración */
/* La configuración es pequeña y se lee en el arranque: va en localStorage. */

export function leerConfig() {
  try {
    const guardada = JSON.parse(localStorage.getItem(CLAVE_CONFIG) || '{}');
    return {
      ...CONFIG_POR_DEFECTO,
      ...guardada,
      notificaciones: { ...CONFIG_POR_DEFECTO.notificaciones, ...(guardada.notificaciones || {}) },
      filtros: { ...CONFIG_POR_DEFECTO.filtros, ...(guardada.filtros || {}) },
    };
  } catch {
    return { ...CONFIG_POR_DEFECTO };
  }
}

export function guardarConfig(config) {
  try {
    localStorage.setItem(CLAVE_CONFIG, JSON.stringify(config));
  } catch (e) {
    console.warn('No se pudo guardar la configuración', e);
  }
}
