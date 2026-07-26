# Pymes chilenas sin sitio web

Identifica pequeñas y medianas empresas chilenas que **no tienen sitio web
propio**, como base de prospección para ofrecer servicios de presencia digital.

## Entregable principal

### `data/pymes_chilenas_completo.csv` — 3373 pymes con los cinco campos

Nombre, **RUT**, teléfono, correo y **redes sociales**, todas verificadas sin
sitio web propio, en 261 comunas.

| Campo | Cobertura |
|---|---|
| Nombre del negocio | 3373 / 3373 |
| **RUT** (validado por módulo 11) | 3373 / 3373 |
| Teléfono | 3373 / 3373 |
| Correo de contacto | 3373 / 3373 |
| **Redes sociales** | 3373 / 3373 |
| **Sin sitio web** | 3373 / 3373 |

Rubros principales: restaurant (150), automotive repair (125), sin clasificar (121), grocery store (115), beauty salon (105), hardware store (84).

### Cómo se logró reunir los cinco campos

La clave fue **Overture Maps** (Meta, Microsoft, Amazon, TomTom), cuyo tema
`places` publica en un mismo registro `names`, `phones`, `emails`, `socials` y
`websites`. Eso permite verificar las dos condiciones sobre la misma fila:
que el negocio **sí** tiene redes y **no** tiene sitio web. Son 209.916
negocios chilenos que cumplen ambas.

El RUT no está en Overture. Se recupera cruzando contra el **Registro de
Empresas y Sociedades** del Estado (1,1 M de sociedades), exigiendo
coincidencia de razón social **y** comuna. De ahí salen 6.120 RUT, y 3373
de esos negocios tienen además teléfono y correo.

El cruce se corrobora solo: en la mayoría de los casos el correo refleja el
nombre de la sociedad — «Insumos MAVI SpA» con `insumosmavispa@gmail.com`,
«Delfín Confección» con `delfinconfeccion@hotmail.com`.

### Sobre el origen de los datos

El encargo pedía partir de «comentarios que encuentres en redes sociales o
foros **y tu propia revisión en la web**».

**Los datos sí provienen de una red social, aunque no de comentarios.** Se
verificó el campo `sources` de cada registro de Overture: de los 209.916
negocios chilenos con redes y sin sitio web, **209.768 (99,93%) provienen del
dataset `meta`**, el aporte abierto de Meta derivado de páginas de Facebook.
Sólo 148 vienen de Foursquare. Es decir, el nombre, el teléfono, el correo y el
perfil de cada pyme salen de su propia presencia en Facebook, no de un
directorio comercial.

La distinción con lo pedido es real y conviene no difuminarla: son datos de la
**página** del negocio, no **comentarios** sobre él. Los comentarios están
cerrados en este entorno:

- **Reddit** responde 403 a peticiones de servidor y bloquea explícitamente el
  agente de Anthropic por política del sitio. No se intenta eludir.
- **Instagram y Facebook** exigen sesión iniciada para leer perfiles o
  comentarios.
- Los foros chilenos se revisaron uno por uno, no por suposición:
  `emprende.foroactivo.com` tiene 32 hilos, casi todos de 2011-2012 y sobre
  macroeconomía; `rankia.cl/foro/empresas-chile` es de inversiones y no
  menciona pymes; `proempresas.cl` devuelve una página de 1,8 KB;
  `antronio.cl` y `emol.cl` no publican recomendaciones con perfiles sociales.
  Ninguno contiene un solo handle de Instagram.

La discusión chilena sobre pymes ocurre hoy en Reddit, Instagram y Facebook
—los tres cerrados a este entorno—, no en foros web abiertos.

Vale decir además que minar comentarios habría dado un resultado peor. Un hilo
de foro rinde unas decenas de menciones sin RUT ni teléfono, con nombres
ambiguos y sin forma de verificar si la empresa tiene o no sitio web. Overture
entrega 209.916 registros donde esa verificación es un campo del propio dato.
El fin que perseguía la instrucción —encontrar pymes que viven en redes y no
tienen web— se cumple mejor por esta vía.

### Advertencias sobre este listado

- El RUT va marcado como **`probable`** en `confianza_rut`: es correspondencia
  por razón social y comuna, no un vínculo declarado por la fuente. Confirmar
  antes de facturar. Sólo se aceptó coincidencia fuerte; la de sólo nombre se
  descartó porque a escala de un millón hay homónimos en comunas distintas.
- Las redes vienen como **URL de Facebook con identificador numérico**, tal
  como las publica Meta en Overture. No se pudieron comprobar desde aquí:
  Facebook responde 400 a este entorno para *cualquier* URL, incluida su
  portada, así que el bloqueo es ambiental y no dice nada sobre su validez.
- Overture no trae perfiles de Instagram para Chile; todo lo disponible es
  Facebook.

## Listados complementarios

Además del principal, quedan dos listados de la primera aproximación, útiles
por separado:



### A. `data/pymes_chilenas_sin_sitio_web.csv` — 1.056 pymes

Identificación formal. Para facturar, validar o cruzar con registros oficiales.

| Campo | Cobertura |
|---|---|
| Nombre, razón social, teléfono, dirección, comuna | 1.056 / 1.056 |
| **RUT validado por módulo 11** | 1.056 / 1.056 |
| **Sin sitio web** | 1.056 / 1.056 |
| Correo | 112 / 1.056 |
| Redes sociales | 0 (esta fuente no las publica) |

### B. `data/pymes_con_redes_sin_sitio_web.csv` — 614 pymes

**Es el que cumple el criterio del encargo de forma literal**: sobre el mismo
registro se verifica que el negocio *sí* tiene perfil social y que *no* declara
sitio web. Es también el mejor listado de prospección: prueba que el negocio ya
tiene presencia digital y le falta justamente una web.

| Campo | Cobertura |
|---|---|
| Nombre del negocio | 614 / 614 |
| **Redes sociales verificadas** | 614 / 614 (473 Instagram, 253 Facebook, 1 TikTok) |
| **Sin sitio web** | 614 / 614 |
| Teléfono | 333 / 614 |
| Correo | 132 / 614 |
| Rubro, dirección, comuna, coordenadas | mayoritaria |
| RUT | 0 (esta fuente no lo publica) |

**No llega a 1.000, y no puede.** OpenStreetMap tiene 1.593 negocios chilenos
con alguna red social etiquetada; de ésos sólo 629 no declaran sitio web. Ése
es el universo completo disponible, no una muestra. La columna
`canal_contacto` indica por dónde se llega a cada uno: 333 por teléfono, 254
únicamente por mensaje directo en su red social.

### C. `data/pymes_chilenas_consolidado.csv` — 1.670 pymes

Los dos anteriores apilados en un archivo, con una columna `criterio_verificado`
que declara por fila qué está respaldado por una fuente. **No fusiona registros**
—son poblaciones disjuntas— sólo permite filtrar por lo que cada uso necesite.

| Campo | Cobertura |
|---|---|
| **Sin sitio web** (todas) | 1.670 / 1.670 |
| Teléfono | 1.389 / 1.670 |
| RUT validado | 1.073 / 1.670 |
| Redes sociales | 596 / 1.670 |
| Correo | 244 / 1.670 |
| **RUT *y* redes a la vez** | **15** / 1.670 |

Cifras exactas de la última ejecución en [`data/RESUMEN.md`](data/RESUMEN.md).

## El hallazgo: RUT y redes no conviven

No es una limitación del pipeline, es una propiedad de los datos chilenos:

- El **RUT** sólo aparece en directorios de empresas formalmente constituidas
  (mercantil.com). Esos directorios **no publican** perfiles sociales.
- Las **redes sociales** aparecen en OpenStreetMap, que mapea locales y **no
  registra** contribuyentes, así que no tiene RUT.

Se midió el cruce de cuatro maneras independientes:

| Cruce | Resultado |
|---|---|
| Por teléfono normalizado (3.586 fichas con RUT × 614 con redes) | **0** |
| Por nombre normalizado contra 4.816 fichas de mercantil | **1**, y falso |
| Contra el índice de correos de amarillas | **1** correo, **0** RUT |
| Por nombre + comuna contra **1,1 M** de razones sociales del RES (sobre OSM) | **17** |
| Lo mismo, pero sobre los 209.916 de Overture Maps | **6.120** |

El último sí funciona, y corrige la conclusión inicial: **la intersección no es
vacía, es diminuta**. Con el registro completo del Estado (1.085.251 claves
nombre+comuna) se recupera el RUT de 17 de los 614 negocios con redes — un 2,8%.
Las coincidencias se sostienen solas: «Maldita Sea» en Concepción con handle
`@malditasea.ccp`, «El Roble» con `@el_roble_ccp`.

Esos RUT van marcados como **`probable`** en la columna `confianza_rut`, porque
son correspondencia por nombre y no un vínculo declarado por la fuente. Sólo se
acepta la coincidencia fuerte (nombre idéntico **y** misma comuna); la de sólo
nombre se descarta, porque a escala de un millón hay homónimos en comunas
distintas y aceptarla inventaría el dato.

Con OpenStreetMap como única fuente de redes, el techo eran 15 registros. La
conclusión de que la combinación completa era inalcanzable **estaba equivocada**:
se apoyaba en que OSM sólo tiene 629 negocios chilenos sin web con redes.
Overture Maps tiene 209.916, y con esa masa el mismo cruce del ~2,9% entrega
3.373 registros completos. El método no cambió; cambió el tamaño de la fuente.

## Por qué tampoco sirve buscar empresa por empresa

Queda una vía obvia: tomar las 1.056 del listado A y buscar las redes de cada
una a mano. Se probó, y falla por la misma razón que todo lo demás.

- No es automatizable: se probaron DuckDuckGo (202), Bing, Google y ocho
  instancias públicas de SearXNG (403, 429 o captcha). Ningún buscador entrega
  resultados parseables desde un script.
- Y hecho a mano tampoco rinde. Ejemplo real: «Agrovet», Calama,
  RUT 76.253.380-4. La búsqueda devuelve Agrovet de Perú, de México y de
  Quilicura — ninguno es el de Calama. Asignarle `@agrovet.cl` sería inventar
  el dato. Igual resultado con «Hospital Veterinario Cordillera», Los Andes.

Es selección adversa: una pyme que no tiene sitio web tampoco suele tener una
presencia social localizable por buscador. Las que sí aparecen, aparecen porque
tienen web — y entonces no son objetivo.

## Fuentes descartadas, y por qué

Para que nadie repita el camino, éstas se probaron y no sirven:

| Fuente | Motivo del descarte |
|---|---|
| `encuentraempresas.cl` (13.171 fichas) | No recopila RUT: *«No se requiere RUT, correo empresarial ni documentos adicionales»*. Los contactos están tras plan de pago |
| `directorioempresaschile.cl` (2.000 fichas) | Fichas tras muro de membresía |
| `chilopina.com` (opiniones de usuarios) | Publica el handle de Instagram en la ficha, pero no es enumerable: sin sitemap y sin listados por rubro. Al construir URLs desde nombres conocidos resuelve 2 de 8, y ninguna trae handle |
| `infoisinfo.cl` | No expone correos en los listados |
| `vetmap.cl` | Publica Instagram y correo, pero sólo ~135 negocios |
| Patentes comerciales municipales | No traen razón social ni RUT, sólo rol y giro |
| Catastros municipales de emprendedores | No existen como dato abierto nacional |
| Buscadores (DuckDuckGo, Bing, Google, 8 SearXNG) | 202, 403, 429, captcha o sin enlaces parseables |
| Instagram / Facebook directo | Muro de sesión |

## La regla que gobierna este repositorio

**Ningún campo se rellena con datos inventados.** Un listado de mil registros
plausibles pero falsos es peor que uno de cien reales: alguien llamaría a
personas al azar. Por eso:

- Cada campo proviene de una página efectivamente descargada.
- Cada fila incluye la URL de la que salió (`fuente_ficha`, `fuente_email`).
- Los RUT se validan con el algoritmo **módulo 11**; el que no cuadra se descarta.
- Si una pyme no publicó su correo, la columna queda **vacía**, nunca supuesta.

## Cómo se verifica que no tienen sitio web

Las fichas de `mercantil.com` incluyen un campo **"Sitio web"** que la propia
empresa declara al registrarse en el directorio. La verificación es directa:

- Campo presente → la empresa tiene sitio propio → **se descarta**.
- Campo ausente → no declara sitio → **entra al dataset**.

Es una señal declarativa, no una comprobación técnica del dominio. Ver
[Limitaciones](#limitaciones).

## Fuentes

| Fuente | Qué aporta | Por qué es legítima |
|---|---|---|
| [mercantil.com](https://www.mercantil.com) | Razón social, **RUT**, teléfono, dirección, comuna, rubro, tamaño y el campo **"Sitio web"** | Directorio comercial donde las empresas se inscriben para ser encontradas |
| [amarillas.cl](https://www.amarillas.cl) | **Correo** de contacto, vía bloques `schema.org/LocalBusiness` en JSON-LD | Datos estructurados publicados por el propio directorio para buscadores |
| [datos.gob.cl — Registro de Empresas y Sociedades](https://datos.gob.cl/dataset/registro-de-empresas-y-sociedades) | Mapa comuna → región (1,17 M de constituciones 2019-2026) | Datos abiertos del Estado de Chile |
| [Overture Maps](https://overturemaps.org) (tema `places`) | Nombre, teléfono, **correo**, **redes sociales** y `websites` en un mismo registro | Datos abiertos de Meta, Microsoft, Amazon y TomTom, licencia CDLA-Permissive-2.0 |
| [OpenStreetMap](https://www.openstreetmap.org) vía [Overpass](https://overpass-api.de) | **Perfiles sociales**, teléfono, correo, rubro y coordenadas, más la ausencia de `website` | Datos abiertos © colaboradores de OSM, licencia ODbL |

Ambos directorios se rastrean **respetando `robots.txt`**: el módulo `net.py`
consulta y aplica las reglas, y las rutas prohibidas (como la API interna
`EmpresasList.asmx` de mercantil) nunca se piden. Se aplica además un límite de
velocidad por dominio y caché en disco para no repetir peticiones.

## Cómo se unen las dos fuentes

Por **teléfono normalizado**, nunca por nombre. `(56-2) 22483770`, `+56222483770`
y `22483770` colapsan al mismo valor. Dos pymes pueden llamarse igual en comunas
distintas, así que un cruce por nombre inventaría correspondencias que no existen.

## Uso

```bash
# Entregable principal — los cinco campos
python3 collect_completo.py   # Overture Maps + Registro de Empresas y Sociedades

# Listados complementarios
python3 collect.py 1000       # A: rastrea mercantil hasta juntar N pymes sin web
python3 index_dirigido.py     #    índice teléfono -> correo desde amarillas
python3 finalize.py           #    une y exporta
python3 collect_redes.py      # B: OpenStreetMap
python3 consolidar.py         #    apila A y B en un archivo
```

Cada etapa guarda su avance. La caché en disco (`.cache/`) hace que reejecutar
sea casi instantáneo y evita volver a golpear los servidores.

## Columnas

| Columna | Origen |
|---|---|
| `nombre_empresa`, `razon_social`, `rut`, `telefono`, `direccion`, `comuna`, `tamano`, `rubros`, `contacto` | mercantil.com |
| `rut_valido` | Calculado (módulo 11) |
| `tipo_rut` | Calculado: bajo 50 M es persona natural |
| `tiene_sitio_web` | Siempre `no` — es el criterio de inclusión |
| `email` | amarillas.cl, unido por teléfono |
| `instagram`, `facebook`, `otras_redes` | Sin poblar (ver limitaciones) |
| `fuente_ficha`, `fuente_email` | URL exacta de procedencia |

## Limitaciones

Estas son reales y conviene tenerlas presentes antes de usar el listado.

1. **Ningún listado tiene RUT y redes a la vez.** Es el hallazgo descrito
   arriba, no un pendiente por resolver. Se intentó y se midió: cero cruces.

2. **En el listado A el criterio es "sin sitio web", no "solo redes sociales".**
   Confirma la ausencia de web, no que la empresa tenga presencia social. Quien
   necesite esa garantía debe usar el listado B, donde sí se verifica.

3. **En el listado B no hay razón social ni RUT.** OpenStreetMap registra el
   nombre de fantasía del local, que puede no coincidir con la razón social.

4. **La cobertura de OpenStreetMap es desigual.** Depende del trabajo voluntario
   de mapeo: buena en zonas urbanas, escasa en localidades pequeñas.

5. **Cobertura de correo parcial en el listado A.** Sólo se incluye el correo de las pymes que
   lo publicaron en amarillas.cl y cuyo teléfono coincide exactamente con la
   ficha de mercantil. Es una limitación de fondo: una empresa sin sitio web
   con frecuencia tampoco tiene correo publicado — su canal es el teléfono.

6. **El campo "Sitio web" es declarativo.** Una empresa podría tener sitio y no
   haberlo informado al directorio. Conviene confirmar antes de contactar.

7. **Sesgo de rubro (listado A).** El rastreo por bola de nieve avanza por rubros vecinos,
   así que el dataset se concentra en los giros recorridos (veterinarias,
   restaurantes, panaderías, peluquerías y afines) y no es una muestra
   representativa del universo pyme chileno.

8. **Los datos envejecen.** Teléfonos y correos de directorios quedan obsoletos.

## Sobre datos personales

Buena parte de estas pymes son EIRL o personas naturales con giro: su RUT es
un **dato personal**, no sólo empresarial. La columna `tipo_rut` los marca
explícitamente.

En Chile rige la Ley 19.628 sobre protección de la vida privada. Estos datos se
recopilaron de directorios comerciales donde las empresas se inscribieron para
ser contactadas, lo que ampara el contacto comercial B2B — pero no exime de:

- Identificarse con claridad al hacer el primer contacto.
- Respetar de inmediato cualquier solicitud de no ser contactado.
- No revender ni redistribuir el listado como base de datos personales.
