#!/usr/bin/env python3
"""Genera el listado de pymes chilenas CON redes sociales y SIN sitio web.

A diferencia de collect.py (que prioriza el RUT), aquí la verificación es la
que pide el encargo de forma literal: se comprueba sobre el mismo registro que
el negocio tiene perfil social y que no declara sitio web propio.
"""
import csv, json
from pymes import osm, pipeline

print("Consultando OpenStreetMap (Overpass)...")
els = osm.consultar_todo()
print(f"  {len(els)} negocios chilenos con alguna red social")

filas = osm.sin_sitio_web(els)
print(f"  {len(filas)} sin sitio web propio")

# Sirve como prospecto todo el que tenga nombre y ALGÚN canal de contacto.
# El perfil social cuenta como canal: es justamente el caso del encargo, un
# negocio al que sólo se llega por mensaje directo.
def canal(f):
    if f["telefono"]: return "telefono"
    if f["email"]: return "correo"
    if f["whatsapp"]: return "whatsapp"
    return "red social"

filas = [f for f in filas if f["nombre_empresa"]]
for f in filas:
    f["canal_contacto"] = canal(f)
vistos, unicas = set(), []
for f in filas:
    clave = f["tel_norm"] or f["email"] or f["nombre_empresa"].lower()
    if clave in vistos:
        continue
    vistos.add(clave)
    unicas.append(f)

cols = ["nombre_empresa", "rubro", "canal_contacto", "telefono", "email", "instagram", "facebook",
        "tiktok", "whatsapp", "direccion", "comuna", "region", "lat", "lon",
        "tiene_sitio_web", "fuente"]
ruta = pipeline.DATOS / "pymes_con_redes_sin_sitio_web.csv"
with ruta.open("w", newline="", encoding="utf-8-sig") as fh:
    w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
    w.writeheader(); w.writerows(unicas)
(pipeline.DATOS / "pymes_con_redes_sin_sitio_web.json").write_text(
    json.dumps(unicas, ensure_ascii=False, indent=1), encoding="utf-8")

con = lambda k: sum(1 for f in unicas if f[k])
import collections
print(f"\n{len(unicas)} pymes sin sitio web y con redes sociales")
print(f"  canal: {dict(collections.Counter(f['canal_contacto'] for f in unicas))}")
print(f"  telefono ..{con('telefono')}   correo ..{con('email')}")
print(f"  instagram ..{con('instagram')}   facebook ..{con('facebook')}   tiktok ..{con('tiktok')}")
print(f"-> {ruta}")
