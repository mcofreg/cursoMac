#!/usr/bin/env python3
"""Índice de correos dirigido a las comunas y rubros realmente presentes.

Un índice genérico desperdicia peticiones en comunas que el dataset no toca.
Éste ataca exactamente la intersección, que es donde puede haber coincidencia.
"""
import json, re, unicodedata, collections
from concurrent.futures import ThreadPoolExecutor
from pymes import amarillas, pipeline

def slug(t):
    t = unicodedata.normalize("NFKD", str(t).lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")

RUBROS = ["veterinarias", "restaurantes", "panaderias", "peluquerias",
          "pastelerias", "ferreterias", "comida-rapida", "cafeterias"]

filas = json.loads((pipeline.DATOS / "crudo_mercantil.json").read_text(encoding="utf-8"))
mapa = json.loads((pipeline.DATOS / "comuna_region.json").read_text(encoding="utf-8"))
comunas = collections.Counter(slug(f["comuna"]) for f in filas)

combos = []
for c, _ in comunas.most_common():
    reg = mapa.get(c)
    if not reg:
        continue
    suf = "rm" if reg == "13" else reg
    combos += [(r, f"{c}-{suf}") for r in RUBROS]

print(f"{len(combos)} listados dirigidos ({len(comunas)} comunas)...")
registros = []
with ThreadPoolExecutor(max_workers=6) as ex:
    for i, res in enumerate(ex.map(lambda rc: amarillas.listado(*rc), combos), 1):
        registros += res
        if i % 200 == 0:
            print(f"  {i}/{len(combos)} | {len(registros)} negocios | "
                  f"{sum(1 for r in registros if r['email'])} correos", flush=True)

# se fusiona con el índice general ya construido
idx = amarillas.indice_por_telefono(registros)
prev = json.loads((pipeline.DATOS / "indice_correos.json").read_text(encoding="utf-8"))
prev.update(idx)
(pipeline.DATOS / "indice_correos.json").write_text(
    json.dumps(prev, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"índice total: {len(prev)} teléfonos con correo")
