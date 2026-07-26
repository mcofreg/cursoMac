"""Extracción desde mercantil.com — la fuente autoritativa del pipeline.

Aporta los dos datos que ninguna otra fuente pública entrega juntos:
  1. El RUT de la empresa.
  2. El campo "Sitio web", cuya AUSENCIA es la verificación de que la pyme
     no tiene sitio propio. Ésta es la señal central del encargo.

La enumeración de rubros se hace por bola de nieve entre páginas de rubro
(permitidas por robots.txt), nunca por la API interna, que está prohibida.
"""

from __future__ import annotations

import html
import re

from . import net

BASE = "https://www.mercantil.com"

_RUBRO = re.compile(r'href="(/[a-z0-9\-]{4,60}/[0-9]{2,6})"')
_FICHA = re.compile(r"/empresa/[a-z0-9\-]+/[a-z0-9\-]+/[0-9]+/esp")
_TAMANO = re.compile(r"\|(Microempresa|Pequeña Empresa|Mediana Empresa|Gran Empresa)\|", re.I)


def _texto(h: str) -> str:
    """Aplana el HTML a texto delimitado por '|' para leer pares etiqueta/valor."""
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", h, flags=re.S | re.I)
    t = html.unescape(re.sub(r"<[^>]+>", "|", t))
    return re.sub(r"[ \t]+", " ", re.sub(r"\|{2,}", "|", t))


def _campo(t: str, etiqueta: str) -> str:
    m = re.search(r"\|" + etiqueta + r"\|([^|]{1,200})\|", t, re.I)
    return m.group(1).strip() if m else ""


def rubros_de(pagina_html: str) -> set[str]:
    """Rubros enlazados desde una página, para expandir el rastreo."""
    return {r for r in _RUBRO.findall(pagina_html) if not r.startswith("/empresa/")}


def fichas_de(pagina_html: str) -> set[str]:
    """URLs de ficha de empresa listadas en una página de rubro."""
    return set(_FICHA.findall(pagina_html))


def rubro(ruta: str) -> tuple[set[str], set[str]]:
    """Descarga una página de rubro. Devuelve (fichas, rubros vecinos)."""
    h = net.get(BASE + ruta)
    if not h:
        return set(), set()
    return fichas_de(h), rubros_de(h)


def ficha(ruta: str) -> dict | None:
    """Descarga y parsea la ficha de una empresa."""
    h = net.get(BASE + ruta + "/")
    if not h:
        return None
    t = _texto(h)

    nombre = ""
    m = re.search(r"<h1[^>]*>(.*?)</h1>", h, re.S | re.I)
    if m:
        nombre = html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip()
    if not nombre:
        m = re.search(r"<title>([^<|]{3,90})", h, re.I)
        nombre = html.unescape(m.group(1)).split(" - ")[0].strip() if m else ""

    partes = ruta.strip("/").split("/")
    comuna = partes[2].replace("-", " ").title() if len(partes) > 3 else ""
    tam = _TAMANO.search(t)

    return {
        "nombre": nombre,
        "razon_social": _campo(t, "Razón Social"),
        "rut": _campo(t, "Rut"),
        "telefono": _campo(t, "Teléfono"),
        "direccion": re.sub(r"\s*\|\s*", ", ", _campo(t, "Dirección")).strip(", "),
        "sitio_web": _campo(t, "Sitio web"),
        "contacto": _campo(t, "Contactos"),
        "tamano": tam.group(1).title() if tam else "",
        "comuna": comuna,
        "rubros": "; ".join(
            sorted({r.split("/")[1].replace("-", " ") for r in rubros_de(h)})[:4]
        ),
        "fuente_ficha": BASE + ruta,
    }
