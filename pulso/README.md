# Pulso — seguimiento de actividades multiequipo

Herramienta para llevar el control de lo que hacen varios equipos de desarrollo dentro de una
misma iniciativa: quién lleva cada tema, qué está por vencer, qué está atrasado, cada cuánto
hay que revisarlo, cuánto esfuerzo se estimó frente al real y qué se aprendió en el camino.
Es un tablero tipo Trello, pero con lo que a Trello le falta para dirigir un portafolio:
cadencias de seguimiento, semáforos por plazo, índice de salud, cronograma e informe general.

**No tiene servidor ni cuenta de usuario.** Es una página web que corre completa en tu navegador
y guarda los datos en tu propio equipo. Se publica copiando una carpeta.

---

## Cómo abrirlo

Los módulos de JavaScript no cargan desde `file://`, así que hace falta servir la carpeta.
Cualquier servidor estático sirve; con Python, que viene en casi todos los equipos:

```bash
cd pulso
python3 -m http.server 8000
```

Y luego abre <http://localhost:8000/>. La primera vez se cargan datos de ejemplo —tres equipos,
ocho personas, una iniciativa con cuatro proyectos y sus tareas— para que la herramienta no
aparezca vacía. Puedes borrarlos o volver a cargarlos desde **Ajustes → Tus datos**.

### Publicarlo en GitHub Pages

1. En el repositorio, **Settings → Pages**.
2. En *Source* elige *Deploy from a branch*, la rama donde está este código y la carpeta `/ (root)`.
3. Guarda y espera un par de minutos.
4. Entra a `https://<tu-usuario>.github.io/<repositorio>/pulso/`.

No hay nada que compilar ni instalar: es HTML, CSS y JavaScript sin dependencias.

---

## Las pantallas

| Pantalla | Para qué sirve |
|---|---|
| **Radar** | La pantalla de inicio: lo vencido, lo que vence hoy y esta semana, los seguimientos abandonados, lo bloqueado y lo que no tiene dueño ni fecha. Con el índice de salud de la iniciativa. |
| **Tablero** | Kanban con arrastrar y soltar. Se puede agrupar en carriles por proyecto, equipo o responsable; soltar una tarjeta en otro carril también le cambia el proyecto o el responsable. |
| **Seguimientos** | La agenda de conversaciones: qué toca revisar hoy, qué quedó pendiente y qué viene, según la cadencia de cada tarea. Se registra el avance en un formulario corto. |
| **Portafolio** | Todos los proyectos a la vez, con avance, salud, atrasos, esfuerzo real contra estimado y próximo vencimiento. |
| **Cronograma** | Carta Gantt de proyectos y tareas, con la línea de hoy y marca en lo atrasado. |
| **Aprendizajes** | Bitácora de feedback: qué salió bien, qué hay que mejorar, riesgos y lecciones, cada uno con su acción acordada, responsable y estado. |
| **Informe** | El estado completo de la iniciativa en una página, para imprimir a PDF, copiar como texto a un correo o exportar a CSV. |
| **Importar roadmap** | Se sube la foto de un roadmap y se obtiene una propuesta editable de actividades. Ver más abajo. |
| **Ajustes** | Iniciativas, equipos, personas, proyectos, avisos del navegador, tema y respaldo de los datos. |

---

## Las reglas del sistema

**Jerarquía.** Iniciativa → Proyecto → Tarea → Seguimiento. Los equipos y las personas cruzan
todo. El informe general resume una iniciativa completa.

**Semáforo por plazo.** Se calcula solo, a partir de la fecha de compromiso:

| Color | Cuándo |
|---|---|
| Verde | Faltan más de 3 días |
| Ámbar | Vence hoy o dentro de 3 días |
| Rojo | Ya pasó la fecha y la tarea sigue abierta |
| Gris | Cerrada, o sin fecha de compromiso |

**Cadencias de seguimiento.** Cada tarea define cada cuánto hay que revisarla. Al registrar un
seguimiento se agenda solo el siguiente:

| Cadencia | Próximo seguimiento |
|---|---|
| Diaria | El siguiente día hábil |
| Semanal | A los 7 días |
| Bisemanal | A los 14 días |
| Quincenal | El próximo día 1 o 15 |
| Mensual | El mismo día del mes siguiente |

Si la fecha calculada cae sábado o domingo, se corre al lunes. "Bisemanal" se entiende como
*cada 14 días*; si en tu organización significa *dos veces por semana*, usa "Diaria" en lo
crítico o cambia `proximoSeguimiento` en `js/domain/cadencia.js`.

**Índice de salud (0 a 100).** Parte de 100 y descuenta por: cuántas tareas van atrasadas,
cuán atrasadas van, cuántas están bloqueadas, el sobrecosto de esfuerzo y los seguimientos
abandonados. Sobre 80 es verde, entre 55 y 79 ámbar, bajo 55 rojo.

**Esfuerzo.** Se registra en horas. Cuando supera una jornada, la aplicación lo muestra en días
de 8 horas ("2,5 d"). El desvío compara el esfuerzo real con el estimado.

---

## Tus datos

Todo vive en **IndexedDB**, dentro de tu navegador y de tu equipo. No sale nada a Internet.
Si el navegador no permite IndexedDB (ventana privada, permisos bloqueados), la aplicación
guarda en `localStorage` sin que tengas que hacer nada, y lo avisa en Ajustes.

Esto tiene una consecuencia importante: **si borras los datos del sitio, se pierden.** Desde
**Ajustes → Tus datos** puedes:

- **Exportar respaldo**: descarga un archivo JSON con todo. Es la forma de respaldar, de pasar
  la información a otro computador y de compartirla con alguien más del equipo.
- **Importar respaldo**: reemplaza por completo lo que hay. Se muestra un resumen del archivo
  antes de confirmar.
- **Exportar CSV** (desde el Informe): las tareas en una planilla, para Excel o Sheets.

Como no hay servidor, dos personas no pueden editar a la vez: se trabaja con el archivo JSON
como si fuera un documento. Si más adelante necesitas edición simultánea, hay que agregar un
backend; el código está separado para eso (ver más abajo).

---

## Avisos del navegador

Se encienden en **Ajustes → Avisos de vencimiento**. Pulso revisa los vencimientos al abrirse y
luego cada media hora, y manda como máximo un aviso al día. Como no hay servidor, el aviso solo
puede salir **mientras la pestaña esté abierta**: si quieres que te avise, deja Pulso anclado en
una pestaña. Las alertas dentro de la aplicación (el panel Radar y la insignia del menú)
funcionan siempre.

---

## Importar un roadmap con inteligencia artificial

La pantalla está completa y funciona de punta a punta: eliges el proyecto de destino y la
ventana de fechas, subes la foto o la captura, revisas la propuesta en una tabla editable
agrupada por fase y solo al confirmar se crean las tareas.

**Lo que hoy está simulado es la lectura de la imagen.** El extractor activo no mira tu imagen
—no sale de tu navegador— sino que propone una estructura de fases de ejemplo ajustada a las
fechas y al equipo que elegiste. Sirve para usar y probar toda la pantalla.

### Conectar el modelo de verdad

El código de la llamada real ya está escrito en `js/ia/promptRoadmap.js`: el prompt en
castellano, el esquema estricto de salida y el manejo de errores. Para encenderlo:

1. Consigue una clave de API de Anthropic en <https://console.anthropic.com/>.
2. En `js/vistas/roadmap.js`, importa `usarClaude` desde `../ia/extractorRoadmap.js` y llámalo
   con la clave antes de extraer. Lo más limpio es agregar un campo de clave en Ajustes que la
   guarde en `localStorage` y llame a `usarClaude(clave)` al arrancar.
3. Nada más cambia: la pantalla de revisión, la edición y la creación de tareas ya están hechas
   contra el mismo contrato `extraerTareas(imagen, contexto)`.

**Antes de hacerlo, ten presente esto:** como Pulso no tiene servidor, la llamada saldría
directamente desde el navegador y la clave quedaría al alcance de cualquiera que abra las
herramientas de desarrollo o mire el tráfico de red. Para uso personal puede ser aceptable;
si la aplicación la va a usar más gente, pon delante un proxy mínimo que guarde la clave y
reenvíe la petición.

---

## Pruebas

La lógica de negocio —fechas, cadencias, semáforos y métricas— son funciones puras y están
cubiertas por 65 pruebas que corren en los dos lados sin instalar nada:

```bash
node tests/run.mjs          # en la terminal
```

o abriendo <http://localhost:8000/tests/test.html> en el navegador.

---

## Cómo está organizado el código

```
pulso/
  index.html              única página; todo lo demás se dibuja por JavaScript
  css/
    tokens.css            paleta y tipografía, con modo claro y oscuro
    app.css               diseño de la aplicación
    print.css             hoja de impresión del informe
  js/
    main.js               marco de la aplicación y carga de pantallas bajo demanda
    router.js             navegación por dirección (#/tablero, #/informe…)
    notificaciones.js     avisos del navegador
    store/
      schema.js           el modelo: entidades, catálogos y valores por defecto
      db.js               IndexedDB, con respaldo automático a localStorage
      store.js            estado en memoria, acciones de negocio y avisos a las vistas
      seed.js             datos de ejemplo
      backup.js           exportar e importar JSON, exportar CSV
    domain/               lógica pura y testeable
      fechas.js  cadencia.js  alertas.js  metricas.js
    ui/                   piezas reutilizables
      componentes.js  filtros.js  graficos.js  tarea.js
    ia/
      extractorRoadmap.js   contrato único y extractor simulado
      promptRoadmap.js      prompt, esquema y llamada real (preparada)
    vistas/               una pantalla por archivo
  tests/                  pruebas de dominio, en navegador y en Node
```

Dos reglas que conviene mantener si sigues trabajando en esto:

1. **Las vistas nunca hablan con la base de datos.** Todo pasa por `store.js`. Eso es lo que
   permitiría cambiar IndexedDB por una API sin tocar ninguna pantalla.
2. **La lógica de negocio vive en `domain/` y no toca el DOM.** Por eso se puede probar en Node
   y por eso las reglas (semáforos, cadencias, salud) están en un solo lugar.

## Límites conocidos

- Un solo usuario a la vez: no hay edición simultánea ni historial de quién cambió qué.
- Los avisos del navegador necesitan la pestaña abierta.
- La lectura del roadmap con IA está preparada pero no conectada.
- Los datos viven en el navegador: sin respaldo exportado, se pierden al borrar los datos del sitio.
