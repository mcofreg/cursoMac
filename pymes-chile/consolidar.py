#!/usr/bin/env python3
"""Une ambos listados en un archivo único, declarando qué se verificó en cada fila.

No fusiona registros: son poblaciones disjuntas (cero cruces medidos). Sólo los
apila con una columna que dice, por fila, qué campos están respaldados por una
fuente. Así se puede filtrar por lo que cada uso necesite.
"""
import csv, json
from pymes import pipeline

A = json.loads((pipeline.DATOS / "pymes_chilenas_sin_sitio_web.json").read_text(encoding="utf-8"))
B = json.loads((pipeline.DATOS / "pymes_con_redes_sin_sitio_web.json").read_text(encoding="utf-8"))

COLS = ["nombre_empresa", "razon_social", "rut", "telefono", "email",
        "instagram", "facebook", "tiktok", "comuna", "direccion", "rubro",
        "tiene_sitio_web", "criterio_verificado", "origen", "fuente"]

filas = []
for a in A:
    filas.append({**{c: "" for c in COLS},
        "nombre_empresa": a["nombre_empresa"], "razon_social": a["razon_social"],
        "rut": a["rut"], "telefono": a["telefono"], "email": a["email"],
        "comuna": a["comuna"], "direccion": a["direccion"], "rubro": a["rubros"],
        "tiene_sitio_web": "no", "criterio_verificado": "sin sitio web + RUT validado",
        "origen": "mercantil.com", "fuente": a["fuente_ficha"]})
for b in B:
    filas.append({**{c: "" for c in COLS},
        "nombre_empresa": b["nombre_empresa"], "telefono": b["telefono"],
        "email": b["email"], "instagram": b["instagram"], "facebook": b["facebook"],
        "tiktok": b["tiktok"], "comuna": b["comuna"], "direccion": b["direccion"],
        "rubro": b["rubro"], "tiene_sitio_web": "no",
        "criterio_verificado": "sin sitio web + redes sociales confirmadas",
        "origen": "OpenStreetMap", "fuente": b["fuente"]})

ruta = pipeline.DATOS / "pymes_chilenas_consolidado.csv"
with ruta.open("w", newline="", encoding="utf-8-sig") as fh:
    w = csv.DictWriter(fh, fieldnames=COLS, extrasaction="ignore")
    w.writeheader(); w.writerows(filas)

c = lambda k: sum(1 for f in filas if f[k])
print(f"{len(filas)} pymes chilenas, todas verificadas sin sitio web")
print(f"  con RUT validado ........ {c('rut')}")
print(f"  con telefono ............ {c('telefono')}")
print(f"  con correo .............. {c('email')}")
print(f"  con redes sociales ...... {sum(1 for f in filas if f['instagram'] or f['facebook'] or f['tiktok'])}")
print(f"-> {ruta}")
