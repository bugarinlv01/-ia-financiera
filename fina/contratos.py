"""Análisis básico de contratos SIN IA (respaldo cuando no hay API key).

Usa palabras clave por cláusula; es mucho menos preciso que el análisis con Claude.
"""
from __future__ import annotations

import re

from .datos import normalizar

_ORD = r"(PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|SEPTIMA|OCTAVA|NOVENA|DECIMA(?: PRIMERA| SEGUNDA| TERCERA| CUARTA| QUINTA)?|VIGESIMA)"
_MESES = {"enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
          "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12}

CLAVES_PENA = ["PENA CONVENCIONAL", "MORATORIO", "PENALIZACION", "MULTA", "RESCISION", "INDEMNIZACION"]
CLAVES_PLAZO = ["VIGENCIA", "RENOVAR", "RENOVACION", "VENCIMIENTO", "DIAS NATURALES", "PLAZO"]
CLAVES_OBLIG = ["SE OBLIGA", "DEBERA", "CORRERAN POR CUENTA", "PAGARA", "NO PODRA"]
CLAVES_REVISION = {
    "RENUNCIA": "Renuncia a derechos: puede dejarte sin protecciones legales.",
    "AUTOMATICAMENTE": "Renovación automática: si no avisas a tiempo quedas obligado otro periodo.",
    "JURISDICCION": "Jurisdicción en otra ciudad: defenderte sería más caro.",
    "SIN NECESIDAD DE DECLARACION JUDICIAL": "Rescisión sin juicio: la otra parte puede terminar el contrato de inmediato.",
    "SIN OBLIGACION": "Pierdes inversiones/mejoras sin compensación.",
    "CINCO POR CIENTO MENSUAL": "Interés moratorio de 5% mensual (60% anual): muy alto, podría ser reducible.",
}


def _clausulas(texto: str) -> list[tuple[str, str, str]]:
    """Divide en cláusulas: cada una inicia en una línea que empieza con un ordinal ('PRIMERA.', 'DÉCIMA PRIMERA.')."""
    res: list[list] = []
    for linea in texto.splitlines():
        n = normalizar(linea)
        m = re.match(rf"^{_ORD}\b", n)
        if m and "." in linea[:40]:
            res.append([m.group(1).title(), n, linea.strip()])
        elif res and n:
            res[-1][1] += " " + n
            res[-1][2] += " " + linea.strip()
    return [tuple(x) for x in res]


def _fechas(texto: str) -> list[str]:
    encontradas = []
    for d, mes, a in re.findall(r"(\d{1,2}) de (" + "|".join(_MESES) + r") de (\d{4})", texto.lower()):
        encontradas.append(f"{a}-{_MESES[mes]:02d}-{int(d):02d}")
    return encontradas


def analisis_basico(texto: str) -> dict:
    claus = _clausulas(texto)
    pen, venc, oblig, rev = [], [], [], []
    for nombre, cuerpo, original in claus:
        nombre = original.split(".")[0].title()
        resumen = original[:240] + ("…" if len(original) > 240 else "")
        if any(k in cuerpo for k in CLAVES_PENA):
            monto = re.search(r"(\d+ [A-Z]+ POR CIENTO(?: MENSUAL| ANUAL)?|\d+ [A-Z]+ MESES DE RENTA|\d+ [A-Z]+ MENSUALIDADES)", cuerpo)
            pen.append({"clausula": nombre, "descripcion": resumen,
                        "monto_o_porcentaje": monto.group(1).capitalize() if monto else "Ver cláusula", "riesgo": "medio"})
        if any(k in cuerpo for k in CLAVES_PLAZO):
            venc.append({"fecha": ", ".join(_fechas(cuerpo.lower())) or "Ver cláusula",
                         "descripcion": resumen, "clausula": nombre})
        if any(k in cuerpo for k in CLAVES_OBLIG):
            oblig.append({"parte": "Ver cláusula", "obligacion": resumen, "plazo": "Ver cláusula", "clausula": nombre})
        for k, motivo in CLAVES_REVISION.items():
            if k in cuerpo:
                rev.append({"clausula": nombre, "motivo": motivo, "riesgo": "alto" if k in ("RENUNCIA", "AUTOMATICAMENTE") else "medio"})
    fechas = _fechas(texto)
    return {
        "resumen": "Análisis básico por palabras clave (sin IA). Configura tu API key de Anthropic para un análisis completo.",
        "partes": [],
        "vigencia": {"inicio": fechas[0] if fechas else "No identificado", "fin": fechas[1] if len(fechas) > 1 else "No identificado",
                     "renovacion_automatica": "AUTOMATICAMENTE" in normalizar(texto), "aviso_no_renovacion": "Revisar cláusula de vigencia"},
        "vencimientos": venc, "penalizaciones": pen, "obligaciones": oblig, "revision_profesional": rev,
        "recomendaciones": [{"titulo": f"Revisar cláusula {r['clausula']}", "porque": r["motivo"],
                             "accion": "Consulta con un abogado antes de renovar o firmar."} for r in rev],
        "confianza": "baja",
    }
