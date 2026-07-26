"""Overture Maps: la fuente que reúne los cinco campos en un mismo registro.

El tema `places` de Overture (Meta, Microsoft, Amazon y TomTom) publica para
cada negocio: nombre, `phones`, `emails`, `socials` y `websites`. La ausencia
de `websites` verifica que la pyme no tiene sitio propio, y `socials` verifica
que sí tiene presencia en redes — las dos condiciones sobre el mismo registro.

El RUT no viene en Overture; se recupera cruzando contra el Registro de
Empresas y Sociedades del Estado de Chile (ver `res.py`).

Licencia CDLA-Permissive-2.0. Se lee por HTTPS anónimo empujando el predicado
espacial al parquet, sin descargar el dataset completo (~14 GB).
"""

from __future__ import annotations

import re

BASE = "https://overturemaps-us-west-2.s3.amazonaws.com/"
BBOX = "bbox.xmin BETWEEN -76 AND -66 AND bbox.ymin BETWEEN -56 AND -17"

CONSULTA = """
SELECT names.primary AS nombre,
       coalesce(taxonomy.primary, basic_category, categories.primary) AS rubro,
       phones, emails, socials,
       addresses[1].locality AS comuna,
       addresses[1].region   AS region,
       addresses[1].freeform AS direccion,
       confidence, id
FROM read_parquet('{url}')
WHERE {bbox}
  AND addresses[1].country = 'CL'
  AND len(socials) > 0
  AND (websites IS NULL OR len(websites) = 0)
  AND names.primary IS NOT NULL
  AND coalesce(operating_status, 'open') <> 'closed'
"""


def _lista(v) -> list[str]:
    """Overture entrega arrays; duckdb los devuelve como lista o como texto."""
    if not v:
        return []
    if isinstance(v, (list, tuple)):
        return [str(x) for x in v if x]
    s = str(v).strip("[]")
    return [x.strip().strip("'\"") for x in s.split(",") if x.strip()]


def normalizar_telefono(tel: str) -> str:
    d = re.sub(r"\D", "", tel or "")
    if d.startswith("56") and len(d) > 9:
        d = d[2:]
    return d.lstrip("0")


def clasificar_redes(socials: list[str]) -> dict[str, str]:
    """Reparte las URLs de redes por plataforma."""
    out = {"instagram": "", "facebook": "", "tiktok": "", "otras_redes": []}
    for s in socials:
        low = s.lower()
        if "instagram." in low and not out["instagram"]:
            out["instagram"] = s
        elif "facebook." in low and not out["facebook"]:
            out["facebook"] = s
        elif "tiktok." in low and not out["tiktok"]:
            out["tiktok"] = s
        else:
            out["otras_redes"].append(s)
    out["otras_redes"] = "; ".join(out["otras_redes"][:3])
    return out


def a_registro(fila: tuple) -> dict:
    """Convierte una fila cruda de la consulta en el registro final."""
    nombre, rubro, phones, emails, socials, comuna, region, direccion, conf, oid = fila
    tels, mails = _lista(phones), _lista(emails)
    redes = clasificar_redes(_lista(socials))
    return {
        "nombre_empresa": (nombre or "").strip(),
        "rubro": (rubro or "").replace("_", " "),
        "telefono": tels[0] if tels else "",
        "tel_norm": normalizar_telefono(tels[0]) if tels else "",
        "email": mails[0].lower() if mails else "",
        **redes,
        "comuna": (comuna or "").strip(),
        "region": (region or "").strip(),
        "direccion": (direccion or "").strip(),
        "tiene_sitio_web": "no",
        "confianza_overture": round(float(conf), 3) if conf is not None else "",
        "fuente": f"https://explore.overturemaps.org/#{oid}",
    }
