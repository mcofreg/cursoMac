"""Validación de RUT chileno (algoritmo módulo 11).

El RUT sólo se acepta en el dataset final si pasa esta verificación. Un RUT con
dígito verificador incorrecto es un dato inventado o mal transcrito, y se descarta.
"""

import re

_LIMPIA = re.compile(r"[^0-9kK]")


def normalizar(rut: str) -> str | None:
    """Devuelve el RUT como 'NNNNNNNN-D' o None si no tiene forma de RUT."""
    if not rut:
        return None
    s = _LIMPIA.sub("", rut).upper()
    if not 7 <= len(s) <= 9:
        return None
    cuerpo, dv = s[:-1], s[-1]
    if not cuerpo.isdigit():
        return None
    return f"{int(cuerpo)}-{dv}"


def digito_verificador(cuerpo: int) -> str:
    """Calcula el dígito verificador por módulo 11."""
    suma, factor = 0, 2
    for d in reversed(str(cuerpo)):
        suma += int(d) * factor
        factor = 2 if factor == 7 else factor + 1
    resto = 11 - (suma % 11)
    return {11: "0", 10: "K"}.get(resto, str(resto))


def es_valido(rut: str) -> bool:
    """True sólo si el dígito verificador cuadra con el cuerpo del RUT."""
    n = normalizar(rut)
    if not n:
        return False
    cuerpo, dv = n.split("-")
    return digito_verificador(int(cuerpo)) == dv


def formatear(rut: str) -> str | None:
    """Formato con puntos, como se usa en documentos chilenos: 12.345.678-9."""
    n = normalizar(rut)
    if not n:
        return None
    cuerpo, dv = n.split("-")
    return f"{int(cuerpo):,}".replace(",", ".") + f"-{dv}"


def es_persona_natural(rut: str) -> bool:
    """RUT bajo 50.000.000 corresponde a persona natural (EIRL, microempresario).

    Sobre 50 millones el RUT es de persona jurídica. Distinguirlos importa
    porque el RUT de una persona natural es dato personal, no sólo empresarial.
    """
    n = normalizar(rut)
    return bool(n) and int(n.split("-")[0]) < 50_000_000
