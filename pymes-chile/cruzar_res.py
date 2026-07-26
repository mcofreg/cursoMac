#!/usr/bin/env python3
"""Recupera el RUT de los negocios con redes cruzándolos contra el registro oficial.

Se cruza el nombre del local (OpenStreetMap) contra la razón social del Registro
de Empresas y Sociedades, 1,1 millones de sociedades con RUT validado.

Sólo se acepta la coincidencia FUERTE: nombre normalizado idéntico Y misma
comuna. La coincidencia por nombre solo se descarta, porque a esa escala hay
homónimos en comunas distintas y aceptarla inventaría el dato.

Aun así el RUT queda marcado como 'probable': es una correspondencia por nombre,
no un vínculo declarado por la fuente. Confirmar antes de usarlo para facturar.
"""
import csv, json, pathlib, re, unicodedata
from pymes import pipeline, rut as rutmod

RAW = pathlib.Path("/tmp/claude-0/-home-user-cursoMac/63c72e81-013a-53b5-b14f-fc4d317b9d5c/scratchpad/raw")

def norm(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"\b(spa|s\.p\.a|ltda|limitada|eirl|e\.i\.r\.l|s\.a|sa|y compania|"
               r"compania|cia|sociedad|comercial(izadora)?|servicios|empresa)\b", " ", s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()

def indice_res():
    idx = {}
    for f in sorted(RAW.glob("res_*.csv")):
        with f.open(encoding="utf-8", errors="ignore") as fh:
            for row in csv.reader(fh, delimiter=";"):
                if len(row) < 14 or not row[1].strip():
                    continue
                r, n = row[1].strip(), norm(row[2])
                if len(n) >= 6 and rutmod.es_valido(r):
                    idx.setdefault((n, norm(row[8])), rutmod.formatear(r))
    return idx

def main():
    idx = indice_res()
    print(f"registro oficial indexado: {len(idx)} claves nombre+comuna")
    B = json.loads((pipeline.DATOS / "pymes_con_redes_sin_sitio_web.json").read_text(encoding="utf-8"))
    n = 0
    for b in B:
        clave = (norm(b["nombre_empresa"]), norm(b.get("comuna", "")))
        if clave[1] and clave in idx:
            b["rut"] = idx[clave]
            b["confianza_rut"] = "probable (nombre+comuna contra Registro de Empresas y Sociedades)"
            n += 1
        else:
            b.setdefault("rut", ""); b.setdefault("confianza_rut", "")
    (pipeline.DATOS / "pymes_con_redes_sin_sitio_web.json").write_text(
        json.dumps(B, ensure_ascii=False, indent=1), encoding="utf-8")

    cols = ["nombre_empresa", "rubro", "rut", "confianza_rut", "canal_contacto",
            "telefono", "email", "instagram", "facebook", "tiktok", "whatsapp",
            "direccion", "comuna", "region", "lat", "lon", "tiene_sitio_web", "fuente"]
    ruta = pipeline.DATOS / "pymes_con_redes_sin_sitio_web.csv"
    with ruta.open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
        w.writeheader(); w.writerows(B)
    print(f"RUT recuperados (coincidencia fuerte): {n} de {len(B)}")

if __name__ == "__main__":
    main()
