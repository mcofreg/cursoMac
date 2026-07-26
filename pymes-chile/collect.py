#!/usr/bin/env python3
"""Etapa 1: recolectar pymes sin sitio web desde mercantil.com.

Guarda avance en cada tanda: si el proceso se corta, no se pierde nada y la
caché en disco evita volver a pedir las páginas ya vistas.
"""
import json, sys
from pymes import pipeline

objetivo = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
destino = pipeline.DATOS / "crudo_mercantil.json"

def guardar(filas):
    destino.write_text(json.dumps(filas, ensure_ascii=False, indent=1), encoding="utf-8")

rec = pipeline.Recolector(objetivo=objetivo, hilos=6, al_avanzar=guardar)
filas = rec.recolectar()
guardar(filas)
print(f"\nLISTO: {len(filas)} pymes sin sitio web | descartes: {rec.descartes}")
print(f"rubros recorridos: {len(rec.rubros_vistos)} | fichas vistas: {len(rec.fichas_vistas)}")
