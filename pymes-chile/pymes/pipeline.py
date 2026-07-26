"""Orquestación: rastrear, filtrar, unir y exportar.

Regla que gobierna todo el archivo: un campo se escribe sólo si viene de una
fuente descargada. No hay valores por defecto, ni inferencias, ni relleno.
Si una pyme no publicó su correo, la columna queda vacía — nunca inventada.
"""

from __future__ import annotations

import csv
import json
import pathlib
import re
import threading
from concurrent.futures import ThreadPoolExecutor

from . import amarillas, mercantil, rut as rut_mod

DATOS = pathlib.Path(__file__).resolve().parent.parent / "data"
DATOS.mkdir(exist_ok=True)

# Rubros semilla: giros de cara al consumidor, donde la pyme sin web es común.
SEMILLAS = [
    "/clinicas-veterinarias/1896",
    "/panaderias/1211",
    "/peluquerias/1231",
    "/restaurantes/1279",
    "/ferreterias/985",
    "/gimnasios/2469",
    "/floristerias/1017",
    "/pastelerias/1215",
    "/jardines-infantiles/2547",
    "/lavanderias/1132",
]

COLUMNAS = [
    "nombre_empresa", "razon_social", "rut", "rut_valido", "tipo_rut",
    "telefono", "email", "comuna", "direccion", "tamano", "rubros",
    "tiene_sitio_web", "instagram", "facebook", "otras_redes",
    "contacto", "fuente_ficha", "fuente_email", "fuente_redes",
]


class Recolector:
    """Rastrea mercantil por bola de nieve hasta juntar N pymes sin sitio web."""

    def __init__(self, objetivo: int = 1000, hilos: int = 6, al_avanzar=None):
        self.objetivo = objetivo
        self.hilos = hilos
        self.al_avanzar = al_avanzar  # callback para guardado incremental
        self.lock = threading.Lock()
        self.resultados: dict[str, dict] = {}   # rut -> registro
        self.descartes = {"con_web": 0, "rut_invalido": 0, "sin_telefono": 0}
        self.fichas_vistas: set[str] = set()
        self.rubros_vistos: set[str] = set()

    # -- filtrado ---------------------------------------------------------
    def _aceptar(self, f: dict) -> bool:
        """Aplica los criterios del encargo. Devuelve True si el registro entra."""
        if f.get("sitio_web"):
            self.descartes["con_web"] += 1
            return False
        if not rut_mod.es_valido(f.get("rut", "")):
            self.descartes["rut_invalido"] += 1
            return False
        if not f.get("telefono"):
            self.descartes["sin_telefono"] += 1
            return False
        return True

    def _guardar(self, f: dict) -> None:
        r = rut_mod.normalizar(f["rut"])
        with self.lock:
            if r in self.resultados:
                return
            self.resultados[r] = {
                "nombre_empresa": f["nombre"],
                "razon_social": f["razon_social"],
                "rut": rut_mod.formatear(f["rut"]),
                "rut_valido": "si",
                "tipo_rut": "persona natural" if rut_mod.es_persona_natural(r) else "persona juridica",
                "telefono": f["telefono"],
                "tel_norm": amarillas.normalizar_telefono(f["telefono"]),
                "email": "",
                "comuna": f["comuna"],
                "direccion": f["direccion"],
                "tamano": f["tamano"],
                "rubros": f["rubros"],
                "tiene_sitio_web": "no",
                "instagram": "", "facebook": "", "otras_redes": "",
                "contacto": f["contacto"],
                "fuente_ficha": f["fuente_ficha"],
                "fuente_email": "", "fuente_redes": "",
            }

    # -- rastreo ----------------------------------------------------------
    def _procesar_ficha(self, ruta: str) -> None:
        f = mercantil.ficha(ruta)
        if f and self._aceptar(f):
            self._guardar(f)

    def recolectar(self, verbose: bool = True) -> list[dict]:
        pendientes = list(SEMILLAS)
        while pendientes and len(self.resultados) < self.objetivo:
            ruta = pendientes.pop(0)
            if ruta in self.rubros_vistos:
                continue
            self.rubros_vistos.add(ruta)

            fichas, vecinos = mercantil.rubro(ruta)
            nuevas = [f for f in fichas if f not in self.fichas_vistas]
            self.fichas_vistas.update(nuevas)
            for v in vecinos:
                if v not in self.rubros_vistos and v not in pendientes:
                    pendientes.append(v)

            if not nuevas:
                continue

            # Se procesa en tandas cortas para poder informar avance y cortar en
            # cuanto se alcanza el objetivo, sin esperar a agotar un rubro entero.
            for i in range(0, len(nuevas), 150):
                if len(self.resultados) >= self.objetivo:
                    break
                tanda = nuevas[i : i + 150]
                with ThreadPoolExecutor(max_workers=self.hilos) as ex:
                    list(ex.map(self._procesar_ficha, tanda))
                if verbose:
                    print(f"  [{len(self.resultados):>4}/{self.objetivo}] {ruta} "
                          f"+{len(tanda)} fichas | cola={len(pendientes)}", flush=True)
                if self.al_avanzar:
                    self.al_avanzar(list(self.resultados.values()))

        return list(self.resultados.values())


# -- enriquecimiento ------------------------------------------------------
_B = re.compile(r'href="(/b/[a-z0-9\-]+/[a-z0-9\-]+/)"')


def indice_correos(semillas: list[str], max_paginas: int = 120) -> dict[str, dict]:
    """Recorre listados de amarillas.cl y arma el índice teléfono -> correo."""
    from . import net

    vistos, cola, registros = set(), list(semillas), []
    while cola and len(vistos) < max_paginas:
        ruta = cola.pop(0)
        if ruta in vistos:
            continue
        vistos.add(ruta)
        h = net.get(amarillas.BASE + ruta)
        if not h:
            continue
        registros += amarillas.listado(*ruta.strip("/").split("/")[1:3])
        for v in _B.findall(h):
            if v not in vistos and v not in cola:
                cola.append(v)
    return amarillas.indice_por_telefono(registros)


def unir_correos(filas: list[dict], idx: dict[str, dict]) -> int:
    """Añade el correo cuando el teléfono coincide exactamente. Devuelve cuántos."""
    n = 0
    for f in filas:
        hit = idx.get(f.get("tel_norm", ""))
        if hit and hit["email"]:
            f["email"] = hit["email"]
            f["fuente_email"] = hit["fuente_email"]
            n += 1
    return n


# -- salida ---------------------------------------------------------------
def exportar(filas: list[dict], nombre: str = "pymes_chilenas_sin_sitio_web") -> pathlib.Path:
    csv_path = DATOS / f"{nombre}.csv"
    with csv_path.open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNAS, extrasaction="ignore")
        w.writeheader()
        w.writerows(filas)
    (DATOS / f"{nombre}.json").write_text(
        json.dumps(filas, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    return csv_path
