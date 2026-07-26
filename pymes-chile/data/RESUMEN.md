# Resumen de la última ejecución

## Entregable principal — 3373 pymes con los cinco campos
`pymes_chilenas_completo.csv`

| Campo | Cobertura |
|---|---|
| Nombre | 3373 / 3373 |
| **RUT validado (módulo 11)** | 3373 / 3373 |
| Teléfono | 3373 / 3373 |
| Correo | 3373 / 3373 |
| **Redes sociales** | 3373 / 3373 |
| **Sin sitio web** | 3373 / 3373 |

- Comunas distintas: **261**
- Regiones: 1
- RUT únicos: 3373

### Rubros
- restaurant: 150
- automotive repair: 125
- sin clasificar: 121
- grocery store: 115
- beauty salon: 105
- hardware store: 84
- shopping: 71
- professional service: 68
- auto parts store: 66
- bakery: 60
- eyewear store: 59
- dental clinic: 55

### Comunas con más registros
- Santiago: 189
- Temuco: 112
- Concepción: 112
- Puerto Montt: 103
- Viña del Mar: 93
- Antofagasta: 76
- La Serena: 74
- Talca: 73
- Punta Arenas: 72
- Chillán: 69
- Maipú: 66
- Providencia: 66

## Embudo de construcción

| Etapa | Registros |
|---|---|
| Negocios chilenos en Overture Maps con redes y sin sitio web | 209.916 |
| De ésos, con RUT recuperado del Registro de Empresas y Sociedades | 6.120 |
| De ésos, con teléfono y correo además (entregable final) | **3373** |

## Listados complementarios

- `pymes_chilenas_sin_sitio_web.csv` — 1056 pymes con RUT publicado por el
  directorio (confianza mayor que la del cruce por nombre), sin redes.
- `pymes_con_redes_sin_sitio_web.csv` — 614 pymes de OpenStreetMap, con
  coordenadas y perfiles de Instagram.
- `pymes_chilenas_consolidado.csv` — los dos anteriores apilados.
