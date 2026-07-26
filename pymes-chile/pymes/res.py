"""Registro de Empresas y Sociedades: recuperación del RUT por razón social.

Fuente: datos.gob.cl, 1,1 millones de sociedades constituidas con su RUT,
razón social y comuna. Se usa para recuperar el RUT de negocios que ninguna
otra fuente identifica tributariamente.

Sólo se acepta la coincidencia FUERTE: razón social normalizada idéntica al
nombre del negocio Y misma comuna. La coincidencia por sólo nombre se descarta
— a escala de un millón hay homónimos en comunas distintas, y aceptarla
inventaría el dato.

Aun así el RUT queda marcado como `probable`: es correspondencia por nombre, no
un vínculo declarado por la fuente. Debe confirmarse antes de facturar.
"""

from __future__ import annotations

import csv
import pathlib
import re
import unicodedata

from . import rut as rutmod

# Sufijos societarios y palabras genéricas que no distinguen a una empresa de
# otra; quitarlas permite que «Panadería El Roble SpA» calce con «El Roble».
_RUIDO = re.compile(
    r"\b(spa|s\.p\.a|ltda|limitada|eirl|e\.i\.r\.l|s\.a|sa|y compania|compania|"
    r"cia|sociedad|comercial|comercializadora|servicios|empresa)\b"
)


def normalizar(s: str) -> str:
    s = unicodedata.normalize("NFKD", (s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", _RUIDO.sub(" ", s)).strip()


def construir_indice(directorio: pathlib.Path) -> dict[tuple[str, str], str]:
    """Arma el índice (razón social normalizada, comuna) -> RUT formateado."""
    idx: dict[tuple[str, str], str] = {}
    for f in sorted(directorio.glob("res_*.csv")):
        with f.open(encoding="utf-8", errors="ignore") as fh:
            for row in csv.reader(fh, delimiter=";"):
                if len(row) < 14 or not row[1].strip():
                    continue
                r, nombre = row[1].strip(), normalizar(row[2])
                # Nombres muy cortos generan falsos positivos en masa.
                if len(nombre) >= 6 and rutmod.es_valido(r):
                    idx.setdefault((nombre, normalizar(row[8])), rutmod.formatear(r))
    return idx


def asignar_rut(registros: list[dict], idx: dict[tuple[str, str], str]) -> int:
    """Asigna el RUT donde hay coincidencia fuerte. Devuelve cuántos se asignaron."""
    n = 0
    for reg in registros:
        comuna = normalizar(reg.get("comuna", ""))
        clave = (normalizar(reg["nombre_empresa"]), comuna)
        if comuna and clave in idx:
            reg["rut"] = idx[clave]
            reg["confianza_rut"] = "probable (razon social + comuna, Registro de Empresas y Sociedades)"
            n += 1
        else:
            reg.setdefault("rut", "")
            reg.setdefault("confianza_rut", "")
    return n
