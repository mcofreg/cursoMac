# Pymes chilenas sin sitio web

Pipeline que identifica pequeñas y medianas empresas chilenas que **no tienen
sitio web propio**, con su RUT verificado, razón social, teléfono, comuna y —
cuando la empresa lo publicó — su correo de contacto.

Pensado como base de prospección para ofrecer servicios de presencia digital.

## Resultado

El dataset se genera en `data/pymes_chilenas_sin_sitio_web.csv` (y `.json`).
Las cifras exactas de la última ejecución están en [`data/RESUMEN.md`](data/RESUMEN.md).

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
python3 collect.py 1000     # etapa 1: rastrea mercantil hasta juntar N pymes sin web
python3 index_dirigido.py   # etapa 2: índice teléfono -> correo desde amarillas
python3 finalize.py         # etapa 3: une y exporta CSV + JSON
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

1. **Redes sociales: sin poblar.** Ninguno de los directorios publica el perfil
   social de la empresa (`schema.org/sameAs` viene vacío), e Instagram y Facebook
   bloquean el acceso automatizado sin sesión. Obtenerlas exigiría una búsqueda
   web por empresa. Las columnas quedan creadas pero vacías.

2. **Por lo tanto, el criterio verificado es "sin sitio web", no "solo redes
   sociales".** El dataset confirma la ausencia de web; no confirma que la
   empresa sí tenga presencia social. Son cosas distintas.

3. **Cobertura de correo parcial.** Sólo se incluye el correo de las pymes que
   lo publicaron en amarillas.cl y cuyo teléfono coincide exactamente con la
   ficha de mercantil. Es una limitación de fondo: una empresa sin sitio web
   con frecuencia tampoco tiene correo publicado — su canal es el teléfono.

4. **El campo "Sitio web" es declarativo.** Una empresa podría tener sitio y no
   haberlo informado al directorio. Conviene confirmar antes de contactar.

5. **Sesgo de rubro.** El rastreo por bola de nieve avanza por rubros vecinos,
   así que el dataset se concentra en los giros recorridos (veterinarias,
   restaurantes, panaderías, peluquerías y afines) y no es una muestra
   representativa del universo pyme chileno.

6. **Los datos envejecen.** Teléfonos y correos de directorios quedan obsoletos.

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
