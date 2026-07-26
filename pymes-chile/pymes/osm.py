"""Extracción desde OpenStreetMap vía Overpass API.

Ésta es la única fuente pública encontrada que permite verificar las DOS
condiciones del encargo a la vez, sobre el mismo registro:

  - que el negocio SÍ tenga redes sociales  (etiquetas contact:instagram,
    contact:facebook, contact:tiktok, contact:whatsapp)
  - que NO tenga sitio web propio           (ausencia de website / contact:website)

Lo que no aporta es el RUT: OpenStreetMap mapea locales, no contribuyentes.
Ver README para por qué RUT y redes sociales no pueden combinarse a escala.

Datos © colaboradores de OpenStreetMap, bajo licencia ODbL.
"""

from __future__ import annotations

import json
import re
import urllib.request

OVERPASS = "https://overpass-api.de/api/interpreter"

# Chile es una franja angosta: una caja envolvente arrastra medio Bolivia y
# Argentina (se midió: ~60% de los resultados eran extranjeros). Se filtra por
# el área administrativa real del país.
AREA_CHILE = 'area["ISO3166-1"="CL"][admin_level=2]->.cl;'

CLAVES_RED = [
    "contact:instagram", "contact:facebook", "contact:tiktok", "contact:whatsapp",
    "instagram", "facebook", "contact:twitter", "contact:youtube",
]
CLAVES_WEB = ["website", "contact:website", "url", "website:menu"]
CLAVES_TEL = ["phone", "contact:phone", "contact:mobile", "mobile"]
CLAVES_MAIL = ["email", "contact:email"]


def consultar(claves: list[str] = CLAVES_RED, timeout: int = 280) -> list[dict]:
    """Pide a Overpass todos los elementos chilenos que tengan alguna red social."""
    partes = "".join(f'  nwr["{k}"](area.cl);\n' for k in claves)
    q = f"[out:json][timeout:{timeout}];\n{AREA_CHILE}\n(\n{partes});\nout tags center;"
    # Overpass rechaza con 406 el User-Agent por defecto de urllib.
    req = urllib.request.Request(
        OVERPASS,
        data=q.encode(),
        method="POST",
        headers={"User-Agent": "pymes-chile/1.0 (listado de pymes sin sitio web)"},
    )
    with urllib.request.urlopen(req, timeout=timeout + 20) as r:
        return json.loads(r.read().decode())["elements"]


def consultar_todo(claves: list[str] = CLAVES_RED, intentos: int = 3) -> list[dict]:
    """Consulta clave por clave y fusiona por (tipo, id).

    Pedir todas las etiquetas en una sola consulta hace caer a Overpass con 504;
    de a una responde bien y el resultado es el mismo tras deduplicar.
    """
    import time

    unicos: dict[tuple, dict] = {}
    for k in claves:
        for intento in range(intentos):
            try:
                for e in consultar([k], timeout=200):
                    unicos[(e["type"], e["id"])] = e
                print(f"  {k:22} acumulado: {len(unicos)}", flush=True)
                break
            except Exception as exc:
                if intento == intentos - 1:
                    print(f"  {k:22} sin resultado ({exc})", flush=True)
                else:
                    time.sleep(5 * (intento + 1))
    return list(unicos.values())


def _primero(tags: dict, claves: list[str]) -> str:
    for k in claves:
        if tags.get(k):
            return str(tags[k]).strip()
    return ""


def normalizar_telefono(tel: str) -> str:
    d = re.sub(r"\D", "", tel or "")
    if d.startswith("56") and len(d) > 9:
        d = d[2:]
    return d.lstrip("0")


def _perfil(valor: str, dominio: str) -> str:
    """Normaliza a URL completa: acepta '@handle', 'handle' o la URL entera."""
    if not valor:
        return ""
    v = valor.strip().split()[0].rstrip("/,")
    if v.startswith("http"):
        return v
    return f"https://{dominio}/{v.lstrip('@')}"


def _es_chileno(tel: str, tags: dict) -> bool:
    """Descarta lo que quedó mal geolocalizado o mal etiquetado en OSM."""
    if tags.get("addr:country", "CL").upper() not in ("CL", "CHILE"):
        return False
    t = (tel or "").strip().replace(" ", "")
    if t.startswith("+") and not t.startswith("+56"):
        return False
    return True


def sin_sitio_web(elementos: list[dict]) -> list[dict]:
    """Filtra a los que tienen red social y NO declaran sitio web propio."""
    salida = []
    for e in elementos:
        t = e.get("tags", {})
        if _primero(t, CLAVES_WEB):
            continue  # tiene web: no es objetivo
        if not any(t.get(k) for k in CLAVES_RED):
            continue
        tel = _primero(t, CLAVES_TEL)
        if not _es_chileno(tel, t):
            continue
        rubro = t.get("shop") or t.get("amenity") or t.get("craft") or t.get("office") or ""
        salida.append(
            {
                "nombre_empresa": t.get("name", "").strip(),
                "rubro": rubro.replace("_", " "),
                "telefono": tel,
                "tel_norm": normalizar_telefono(tel),
                "email": _primero(t, CLAVES_MAIL).lower(),
                "instagram": _perfil(t.get("contact:instagram", ""), "instagram.com"),
                "facebook": _perfil(t.get("contact:facebook", ""), "facebook.com"),
                "tiktok": _perfil(t.get("contact:tiktok", ""), "tiktok.com"),
                "whatsapp": t.get("contact:whatsapp", ""),
                "direccion": " ".join(
                    x for x in [t.get("addr:street", ""), t.get("addr:housenumber", "")] if x
                ).strip(),
                "comuna": t.get("addr:city", "") or t.get("addr:suburb", ""),
                "region": t.get("addr:state", ""),
                "lat": e.get("lat") or (e.get("center") or {}).get("lat", ""),
                "lon": e.get("lon") or (e.get("center") or {}).get("lon", ""),
                "tiene_sitio_web": "no",
                "fuente": f"https://www.openstreetmap.org/{e['type']}/{e['id']}",
            }
        )
    return salida
