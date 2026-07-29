# Faro

Comunicaciones de canales digitales hacia la red de sucursales.

Cuando el sitio web o la app tienen una contingencia, los ejecutivos que atienden
clientes en sucursal son los últimos en enterarse: se enteran cuando el cliente
se los dice. Faro convierte el navegador corporativo en un canal de comunicación
interna, administrado de forma centralizada y con medición real de alcance e
interacción.

Consta de tres piezas:

| Pieza | Qué hace |
|---|---|
| **Extensión Chrome (MV3)** | Muestra las comunicaciones en tres formatos y reporta la interacción |
| **API** | Segmenta la audiencia, firma el contenido y recibe la telemetría |
| **Panel de administración** | Crear, aprobar y publicar campañas; dashboard de métricas |

---

## Arrancar en cinco minutos

Requisitos: Node 20+, pnpm, y PostgreSQL 16 (o Docker).

```bash
cd faro
cp .env.example .env

pnpm install
pnpm keys:generate      # par de claves ECDSA para firmar el contenido
pnpm db:up              # levanta PostgreSQL (Docker o el del sistema)
pnpm db:migrate
pnpm db:seed            # 240 instalaciones sintéticas y 3 campañas de ejemplo
```

Después, en tres terminales:

```bash
pnpm dev:api                                  # API en :3000
pnpm dev:admin                                # panel en :5173
python3 -m http.server 8080 -d sitio-prueba   # aplicación interna simulada
```

Y la extensión:

```bash
pnpm build:ext
# chrome://extensions → Modo desarrollador → Cargar descomprimida
# → faro/apps/extension/dist
```

---

## Guion de la demo

El recorrido completo toma unos cinco minutos y muestra las seis capacidades
que pide el negocio.

**1. Crear la alerta.** En `localhost:5173`, entra como **Carla Fuentes**
(operador de canales). Nueva campaña → formato *huincha superior*, prioridad
*P0 contingencia crítica*, severidad *crítica*.

Título: `App móvil con intermitencia`
Cuerpo: `Algunos clientes no logran iniciar sesión. *Equipos trabajando en la solución.*`
Botón: `Ver estado` → `http://localhost:8080/estado.html`
Audiencia: región = `RM` → **Estimar alcance**

La vista previa muestra exactamente lo que verá el ejecutivo. Escribe
`<script>alert(1)</script>` en el título para comprobar que aparece como texto:
el panel no tiene editor de HTML, y eso es deliberado.

**2. Doble control.** Enviar a revisión. El panel avisa que Carla no puede
aprobar su propia campaña: la restricción la impone la base de datos, no la
aplicación. Cierra sesión y entra como **Rodrigo Pizarro** (aprobador) →
Aprobar → Publicar.

**3. La huincha aparece.** En la pestaña con `localhost:8080`, la franja roja
baja desde arriba en menos de un minuto — o de inmediato si recargas. La página
se empuja hacia abajo para que la huincha no tape nada. Llega también una
notificación del sistema operativo.

**4. Interacción.** Clic en «Ver estado» → se abre el destino. Clic en
«Entendido» → la huincha desaparece y el margen se revierte sin dejar rastro.

**5. Los datos.** Vuelve al panel → **Métricas**. Aparecen elegibles, alcance
único, CTR y tasa de confirmación de lectura, con desglose por sucursal.

**6. El interruptor.** «Detener ahora» saca la campaña de circulación en menos
de 60 segundos: la huincha desaparece de todas las pestañas sin recargar y sin
desplegar nada.

### Usuarios de prueba

| Panel de administración | Rol |
|---|---|
| `operador.canales@banco.cl` — Carla Fuentes | editor |
| `jefe.canales@banco.cl` — Rodrigo Pizarro | approver |
| `admin.faro@banco.cl` — Soledad Ramírez | admin |
| `r.vega@banco.cl` — Rodrigo Vega | viewer |

| Extensión | Sucursal |
|---|---|
| `m.tapia@banco.cl` | S001 — Casa Matriz, RM |
| `j.riquelme@banco.cl` | S014 — Providencia, RM |
| `p.soto@banco.cl` | S092 — Valparaíso, V |
| `ana.morales@banco.cl` | sin sucursal — debe auto-declararla |

Ana Morales existe a propósito: reproduce el caso —muy probable— de que el SSO
corporativo no exponga sucursal ni rol, y la persona tenga que declararlos.

---

## Qué hay que saber antes de comprometerse

**La huincha no va sobre el navegador.** Chrome prohíbe que una extensión pinte
encima de la barra de direcciones; es su defensa contra la suplantación de URL.
La huincha se inyecta en el tope del área de contenido y empuja la página. El
efecto visual es casi el mismo, pero conviene decirlo antes y no después.

**Si el ejecutivo no está en Chrome, no ve nada.** Si trabaja en Citrix, un
emulador de terminal o una aplicación de escritorio, la extensión no alcanza.
El único paliativo es la notificación del sistema operativo, que sí aparece
sobre cualquier ventana mientras Chrome esté corriendo. **Medir qué porcentaje
de la jornada transcurre efectivamente en Chrome es el primer paso del
proyecto**, antes de construir nada más.

**El modal cubre la pestaña, no la pantalla.** Se puede hacer no descartable
hasta que la persona confirme lectura, y eso resuelve el caso de uso.

---

## Seguridad

El riesgo central es evidente: una extensión que inyecta contenido remoto en
páginas internas del banco es, mal diseñada, una herramienta de XSS con permiso
institucional. El diseño lo cierra por construcción.

**El administrador nunca escribe HTML.** Llena campos tipados —título, cuerpo,
severidad, botón— definidos en `packages/contracts`. Las plantillas están
compiladas dentro de la extensión (Manifest V3 prohíbe ejecutar código remoto de
todos modos). El renderer usa Preact, que escapa todo, y el build falla si
aparece `innerHTML`, `eval` o equivalentes en el código.

**Doble aislamiento.** El content script no renderiza: monta un Shadow DOM
*cerrado* y dentro un iframe `sandbox` que corre en origen opaco. Sirve para dos
cosas: contener cualquier fallo del renderer —no puede leer el token de sesión
del CRM ni el formulario abierto— y traer su propia CSP, sin la cual el
`img-src` de una aplicación interna bloquearía las imágenes de campaña.

**Contenido firmado.** El backend firma cada campaña con ECDSA P-256; la clave
pública va embebida en la extensión. Quien comprometa la API o intercepte el
proxy corporativo no puede inyectar contenido. Firma inválida ⇒ no se muestra
nada.

**Doble control en la base de datos.** `CHECK (aprobado_por <> creado_por)` en
`campaign_versions`: quien crea una versión no puede aprobarla, y no hay ruta de
API que pueda saltárselo. Para contingencias P0 existe una ruta de emergencia
—un aprobador de guardia, justificación escrita obligatoria y expiración
automática a las 4 horas— porque un doble control puro haría inservible el caso
de uso principal.

**Cuatro niveles de interruptor:** por campaña, global, por origen, y el
bloqueo por política de TI.

---

## Privacidad

Saber *quiénes* hicieron clic implica tratar datos personales de trabajadores.
Con la Ley 21.719 vigente desde diciembre de 2026, esto se diseña ahora.

**Lo que la extensión no puede ver.** No pide el permiso `tabs`, así que Chrome
le censura la URL y el título de toda pestaña cuyo origen no esté declarado en
`host_permissions`. La navegación general del ejecutivo —su banca personal, su
correo, cualquier sitio fuera de la lista— es invisible.

**El matiz, que conviene enunciar bien.** Para los orígenes que sí están
declarados, Chrome entrega la URL: tener `host_permissions` sobre un dominio
implica poder leer la dirección de sus pestañas. Verificado en Chromium real por
`scripts/verificar-extension.mjs`.

Que esas direcciones no se registren ni se transmitan no lo garantiza el
manifiesto, sino el diseño, en cuatro capas:

1. el content script no tiene acceso a red — todo pasa por el service worker;
2. el puente entre el renderer y el content script filtra contra una lista
   blanca de campos;
3. el esquema de eventos es `.strict()` y **no tiene ningún campo capaz de
   llevar una URL** (`packages/contracts/src/events.ts`);
4. la ingesta rechaza el lote completo si aparece un campo no declarado.

Un test de contrato falla el build si alguien agrega al esquema un campo cuyo
nombre sugiera datos de navegación.

**Además:** identificador corporativo de empleado, nunca RUT. Retención de 90
días para datos con identificación individual; después, solo agregados. Acceso a
nivel individual restringido al rol aprobador y auditado. Pantalla de
transparencia en el primer arranque. Y `AGGREGATE_METRICS_ONLY=true` desactiva
por completo las consultas individuales sin tocar código, por si Legal lo exige.

---

## Cómo se mide cada cosa

| Métrica | Definición operacional |
|---|---|
| **Instalados** | Se reportan tres cifras: totales, activos 7 días y activos 30 días. La brecha entre totales y activos es la métrica de salud real del despliegue |
| **Alcance** | Dispositivos únicos con al menos una impresión. Una impresión exige ≥50% visible, pestaña en primer plano, ≥1 s continuo — eso distingue «se renderizó» de «lo miró» |
| **Clics** | Con identificador lógico del botón, jamás la URL. CTR = clics únicos / alcance |
| **Acuse de recibo** | «El 86% de la red confirmó haber leído la alerta». El KPI que convierte esto de herramienta de comunicación a control operacional |
| **Supresiones** | Elegible pero no mostrada, con motivo. Dice si el problema es saturación de frecuencia o que nadie tenía Chrome en primer plano |

**Sobre el grupo de control:** el control no ve nada por diseño, así que sus
métricas internas (CTR, acuse) no existen y **no son comparables** con las del
grupo objetivo. El control sirve para medir incrementalidad sobre un KPI
*externo* —llamadas a mesa de ayuda, tickets de «el sitio no funciona»—, y la
plataforma exporta las asignaciones para ese cruce.

Para contingencias, la recomendación es control en **0%**: retener información de
seguridad operacional a una parte de la red solo para medir es difícil de
justificar. Los grupos de control se reservan para promociones y lanzamientos.

---

## Verificación

```bash
pnpm test                            # contratos, firma, segmentación, privacidad
bash scripts/verificar-e2e.sh        # flujo completo de la API
node scripts/verificar-extension.mjs # la extensión en un Chromium real
node scripts/verificar-admin.mjs     # el panel en un navegador real
```

Los dos últimos cargan la extensión sin empaquetar en Chromium y comprueban, en
un navegador de verdad, que la huincha se inyecta, que el Shadow DOM es cerrado,
que un título con carga XSS se dibuja como texto, que la página se empuja y se
restaura, y que el flujo de aprobación bloquea la autoaprobación.

---

## Estructura

```
faro/
├── packages/
│   ├── contracts/      esquemas Zod — fuente única de verdad
│   ├── segmentation/   evaluador de audiencia + hash determinístico (isomorfo)
│   └── signing/        canonicalización, firma (Node), verificación (WebCrypto)
├── apps/
│   ├── extension/      Chrome MV3 — service worker, content script, renderer
│   ├── api/            Fastify + PostgreSQL
│   └── admin/          panel de administración
├── scripts/            arranque y verificación
└── sitio-prueba/       aplicación interna simulada
```

`packages/segmentation` es isomorfo a propósito: el mismo código decide la
elegibilidad en la extensión y estima el alcance en el panel. Si divergieran, el
«alcance estimado» que ve el operador mentiría y nadie se daría cuenta hasta
después de publicar.

---

## Del prototipo a producción

Lo que falta, en orden:

1. **Medir la exposición a Chrome** en dos sucursales reales. Es lo que decide
   si el proyecto tiene sentido.
2. **Probar contra las aplicaciones internas de verdad** — ¿su CSP bloquea el
   iframe? ¿se rompe algún layout? ¿hay conflicto de `z-index`?
3. **SSO corporativo real**: cambiar `AUTH_MODE=oidc` y configurar el emisor. El
   flujo (Authorization Code + PKCE) ya está diseñado para eso.
4. **Re-codificación de imágenes con `sharp`** — el punto de extensión está
   marcado en `apps/api/src/security/assets.ts`. El prototipo valida por magic
   bytes y prohíbe SVG, pero no re-codifica.
5. **Clave de firma en KMS/HSM**, no en disco.
6. **Publicación no listada en Chrome Web Store** y dos canales (canary y
   producción).
7. Alta disponibilidad, `pg_cron` para los agregados, observabilidad.

Involucrar a Seguridad, Legal y TI de puesto de trabajo desde la primera semana:
las aprobaciones son el camino crítico, no el código.
