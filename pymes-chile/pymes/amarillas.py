"""Extracción de correos desde amarillas.cl.

Las páginas de listado incrustan bloques JSON-LD schema.org/LocalBusiness con
nombre, teléfono en formato +56 y, cuando la empresa lo publicó, su correo.
Se leen esos bloques en vez de raspar HTML: es dato estructurado y estable.

El teléfono normalizado es la clave con que se une este correo a la ficha de
mercantil. No se une por nombre: dos pymes pueden llamarse igual en comunas
distintas y un cruce por nombre inventaría correspondencias.
"""

from __future__ import annotations

import json
import re

from . import net

BASE = "https://www.amarillas.cl"
_LD = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)


def normalizar_telefono(tel: str) -> str:
    """Reduce un teléfono chileno a sus dígitos significativos, sin prefijo país.

    '(56-2) 22483770', '+56222483770' y '22483770' colapsan al mismo valor,
    que es lo que permite unir ambas fuentes con seguridad.
    """
    d = re.sub(r"\D", "", tel or "")
    if d.startswith("56") and len(d) > 9:
        d = d[2:]
    return d.lstrip("0")


def listado(rubro: str, comuna: str) -> list[dict]:
    """Devuelve los negocios de un listado rubro/comuna con su correo si existe."""
    h = net.get(f"{BASE}/b/{rubro}/{comuna}/")
    if not h:
        return []

    salida = []
    for bloque in _LD.findall(h):
        try:
            d = json.loads(bloque)
        except Exception:
            continue
        if d.get("@type") != "LocalBusiness" or not d.get("name"):
            continue
        salida.append(
            {
                "nombre": d.get("name", "").strip(),
                "comuna": (d.get("address") or "").strip(),
                "telefono": d.get("telephone", ""),
                "tel_norm": normalizar_telefono(d.get("telephone", "")),
                "email": (d.get("email") or "").strip().lower(),
                "fuente_email": d.get("url", ""),
            }
        )
    return salida


def indice_por_telefono(registros: list[dict]) -> dict[str, dict]:
    """Índice teléfono normalizado -> registro, sólo para los que traen correo."""
    idx = {}
    for r in registros:
        if r["tel_norm"] and r["email"]:
            idx.setdefault(r["tel_norm"], r)
    return idx
