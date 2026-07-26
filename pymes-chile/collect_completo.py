#!/usr/bin/env python3
"""Genera el listado completo: nombre + RUT + teléfono + correo + redes, sin sitio web.

Es el entregable principal. Combina Overture Maps (que verifica redes sociales
y ausencia de sitio web sobre el mismo registro, y aporta teléfono y correo)
con el Registro de Empresas y Sociedades del Estado (que aporta el RUT).
"""
import csv, json, pathlib, sys, time
import duckdb
from pymes import overture, res, pipeline

RAW = pathlib.Path("/tmp/claude-0/-home-user-cursoMac/63c72e81-013a-53b5-b14f-fc4d317b9d5c/scratchpad/raw")
COLS = ["nombre_empresa", "rut", "confianza_rut", "telefono", "email",
        "instagram", "facebook", "tiktok", "otras_redes", "rubro",
        "comuna", "region", "direccion", "tiene_sitio_web",
        "confianza_overture", "fuente"]

def extraer():
    crudo = pipeline.DATOS / "overture_crudo.json"
    if crudo.exists():
        print("Reusando extracción de Overture ya descargada.")
        return json.loads(crudo.read_text(encoding="utf-8"))
    con = duckdb.connect(); con.execute("INSTALL httpfs; LOAD httpfs;")
    partes = [overture.BASE + l.strip() for l in open("parts_u.txt") if l.strip()]
    filas, t0 = [], time.time()
    for i, u in enumerate(partes, 1):
        try:
            filas += con.execute(overture.CONSULTA.format(url=u, bbox=overture.BBOX)).fetchall()
        except Exception as e:
            print(f"  parte {i}: {str(e)[:70]}")
        print(f"  {i}/{len(partes)} acumulado={len(filas)} ({time.time()-t0:.0f}s)", flush=True)
    crudo.write_text(json.dumps(filas, ensure_ascii=False, default=str), encoding="utf-8")
    return filas

def main():
    filas = extraer()
    print(f"\n{len(filas)} negocios chilenos con redes sociales y sin sitio web")

    regs = [overture.a_registro(f) for f in filas]
    regs = [r for r in regs if r["nombre_empresa"] and r["comuna"]]

    print("Indexando el Registro de Empresas y Sociedades...")
    idx = res.construir_indice(RAW)
    n = res.asignar_rut(regs, idx)
    print(f"RUT recuperados por coincidencia fuerte: {n}")

    # El entregable exige los cinco campos juntos, y el teléfono debe ser chileno:
    # un prefijo extranjero delata un registro mal geolocalizado en la fuente.
    def chileno(tel):
        t = (tel or "").replace(" ", "")
        return t.startswith("+56") or not t.startswith("+")

    completos = [r for r in regs if r["rut"] and r["telefono"] and r["email"]
                 and (r["instagram"] or r["facebook"] or r["tiktok"])
                 and chileno(r["telefono"])]
    vistos, unicos = set(), []
    for r in completos:
        if r["rut"] in vistos:
            continue
        vistos.add(r["rut"]); unicos.append(r)

    ruta = pipeline.DATOS / "pymes_chilenas_completo.csv"
    with ruta.open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=COLS, extrasaction="ignore")
        w.writeheader(); w.writerows(unicos)
    (pipeline.DATOS / "pymes_chilenas_completo.json").write_text(
        json.dumps(unicos, ensure_ascii=False, indent=1), encoding="utf-8")

    c = lambda k: sum(1 for f in unicos if f[k])
    print(f"\n{len(unicos)} pymes con los CINCO campos y sin sitio web")
    print(f"  RUT {c('rut')} | telefono {c('telefono')} | correo {c('email')}")
    print(f"  instagram {c('instagram')} | facebook {c('facebook')} | tiktok {c('tiktok')}")
    print(f"  comunas distintas: {len({f['comuna'] for f in unicos})}")
    print(f"-> {ruta}")

if __name__ == "__main__":
    main()
