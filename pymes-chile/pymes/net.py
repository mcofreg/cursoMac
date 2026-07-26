"""Cliente HTTP cortés, con caché en disco y respeto por robots.txt.

Decisiones deliberadas:
  - Caché en disco: reejecutar el pipeline no vuelve a golpear los servidores.
  - Límite de velocidad por dominio, con un pequeño pool de hilos.
  - Se consulta robots.txt de verdad; las rutas prohibidas no se piden nunca.
"""

from __future__ import annotations

import hashlib
import pathlib
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

CACHE = pathlib.Path(__file__).resolve().parent.parent / ".cache"
CACHE.mkdir(exist_ok=True)

_espera = threading.Lock()
_ultimo: dict[str, float] = {}
_robots: dict[str, urllib.robotparser.RobotFileParser] = {}
_robots_lock = threading.Lock()

RETARDO = 0.4  # segundos mínimos entre peticiones al mismo dominio


def _permitido(url: str) -> bool:
    host = urllib.parse.urlsplit(url).netloc
    with _robots_lock:
        rp = _robots.get(host)
        if rp is None:
            rp = urllib.robotparser.RobotFileParser()
            rp.set_url(f"https://{host}/robots.txt")
            try:
                rp.read()
            except Exception:
                rp = None  # sin robots.txt legible: se asume permitido
            _robots[host] = rp
    return True if rp is None else rp.can_fetch(UA, url)


def _frenar(host: str) -> None:
    with _espera:
        ahora = time.time()
        delta = ahora - _ultimo.get(host, 0.0)
        if delta < RETARDO:
            time.sleep(RETARDO - delta)
        _ultimo[host] = time.time()


def get(url: str, *, intentos: int = 3, usar_cache: bool = True) -> str | None:
    """Descarga una URL y devuelve el HTML, o None si falla o está prohibida."""
    if not _permitido(url):
        return None

    clave = CACHE / (hashlib.sha256(url.encode()).hexdigest()[:24] + ".html")
    if usar_cache and clave.exists():
        return clave.read_text(encoding="utf-8", errors="ignore")

    host = urllib.parse.urlsplit(url).netloc
    for intento in range(intentos):
        _frenar(host)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=35) as r:
                html = r.read().decode("utf-8", errors="ignore")
            clave.write_text(html, encoding="utf-8")
            return html
        except urllib.error.HTTPError as e:
            if e.code in (404, 410):
                return None
            time.sleep(2 ** intento)
        except Exception:
            time.sleep(2 ** intento)
    return None
