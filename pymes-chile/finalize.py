#!/usr/bin/env python3
"""Etapa 3: unir correos, excluir no-pymes y exportar el dataset final."""
import collections, json
from pymes import pipeline

filas = json.loads((pipeline.DATOS / "crudo_mercantil.json").read_text(encoding="utf-8"))
idx = json.loads((pipeline.DATOS / "indice_correos.json").read_text(encoding="utf-8"))

# El encargo pide pymes: se excluye lo que el propio directorio marca como grande.
grandes = [f for f in filas if f.get("tamano") == "Gran Empresa"]
filas = [f for f in filas if f.get("tamano") != "Gran Empresa"]

n = pipeline.unir_correos(filas, idx)
ruta = pipeline.exportar(filas)

con = lambda k: sum(1 for f in filas if f.get(k))
comunas = collections.Counter(f["comuna"] for f in filas)
tam = collections.Counter(f["tamano"] or "sin clasificar" for f in filas)
tipo = collections.Counter(f["tipo_rut"] for f in filas)

resumen = f"""# Resumen de la última ejecución

**{len(filas)} pymes chilenas verificadas sin sitio web propio.**

| Campo | Cobertura |
|---|---|
| Nombre de la empresa | {con('nombre_empresa')} / {len(filas)} |
| Razón social | {con('razon_social')} / {len(filas)} |
| RUT validado por módulo 11 | {con('rut')} / {len(filas)} |
| Teléfono | {con('telefono')} / {len(filas)} |
| Dirección | {con('direccion')} / {len(filas)} |
| Correo de contacto | {n} / {len(filas)} |
| Redes sociales | 0 / {len(filas)} (no disponible, ver README) |
| **Sin sitio web (criterio de inclusión)** | **{len(filas)} / {len(filas)}** |

- Comunas distintas cubiertas: **{len(comunas)}**
- Excluidas por estar marcadas como Gran Empresa: {len(grandes)}

## Tipo de RUT

{chr(10).join(f'- {k}: {v}' for k, v in tipo.most_common())}

RUT bajo 50.000.000 corresponde a persona natural (EIRL, microempresario):
en esos casos el RUT es dato personal, no sólo empresarial.

## Tamaño declarado

{chr(10).join(f'- {k}: {v}' for k, v in tam.most_common())}

## Comunas con más registros

{chr(10).join(f'- {k}: {v}' for k, v in comunas.most_common(15))}
"""
(pipeline.DATOS / "RESUMEN.md").write_text(resumen, encoding="utf-8")
print(resumen[:900])
print(f"-> {ruta}")
