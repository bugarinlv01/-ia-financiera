"""Conciliación bancaria con fuzzy matching (monto, fecha, RFC/nombre y concepto).

Soporta:
- 1 movimiento ↔ 1 factura
- pagos agrupados: 1 movimiento ↔ varias facturas de la misma contraparte
- pagos parciales: varios movimientos ↔ 1 factura (se lleva el saldo pendiente)
"""
from __future__ import annotations

from itertools import combinations

import pandas as pd
from rapidfuzz import fuzz

from .datos import normalizar

PESOS = {"monto": 0.45, "contraparte": 0.30, "fecha": 0.15, "concepto": 0.10}
UMBRAL = 0.60
_PALABRAS_RUIDO = {"SA", "DE", "CV", "SC", "AC", "S", "A", "C", "V", "RL", "SAPI"}

# Movimientos que normalmente no llevan factura de proveedor/cliente: se explica el motivo.
MOTIVOS_SIN_FACTURA = [
    ("NOMINA", "Pago de nómina: se respalda con CFDI de nómina, no con factura de proveedor."),
    ("SAT", "Pago de impuestos: se respalda con el acuse/línea de captura del SAT."),
    ("COMISION", "Comisión bancaria: el CFDI viene en el estado de cuenta o se descarga del portal del banco."),
    ("TPV", "Ventas con tarjeta en mostrador: deben incluirse en una factura global a público en general."),
    ("DEPOSITO EN EFECTIVO", "Depósito en efectivo sin origen identificado: aclara de dónde viene (venta, préstamo, aportación)."),
    ("RETIRO", "Retiro de efectivo: documenta en qué se usó para poder deducirlo."),
    ("ELECTRICO", "Servicio de luz: descarga el CFDI del portal del proveedor para poder deducirlo."),
    ("TELECOM", "Servicio de internet/teléfono: solicita o descarga el CFDI para deducirlo."),
]


def _nombre_clave(nombre: str) -> str:
    return " ".join(p for p in normalizar(nombre).split() if p not in _PALABRAS_RUIDO)


def score_contraparte(desc: str, ref: str, rfc: str, nombre: str, folio: str) -> float:
    d = normalizar(f"{desc} {ref}")
    if rfc and rfc in d.replace(" ", ""):
        return 1.0
    folio_n = normalizar(folio).replace(" ", "")
    if folio_n and folio_n in d.replace(" ", ""):
        return 0.95
    return fuzz.token_set_ratio(_nombre_clave(nombre), d) / 100 * 0.9


def score_fecha(f_mov: pd.Timestamp, f_fac: pd.Timestamp, vencimiento: pd.Timestamp) -> float:
    dias = (f_mov - f_fac).days
    if dias < -5:
        return 0.0
    if dias <= 0:
        return 0.8
    limite = max((vencimiento - f_fac).days, 0) + 30
    if dias <= limite:
        return 1.0 - 0.4 * dias / max(limite, 1)
    return max(0.0, 0.6 - (dias - limite) / 90)


def score_monto(monto_mov: float, objetivo: float) -> float:
    if objetivo <= 0:
        return 0.0
    dif = abs(monto_mov - objetivo) / objetivo
    if abs(monto_mov - objetivo) <= 1.0:
        return 1.0
    return max(0.0, 1.0 - dif * 10)  # 10 % de diferencia → 0


def score_concepto(desc: str, concepto: str) -> float:
    return fuzz.partial_token_set_ratio(normalizar(concepto), normalizar(desc)) / 100


NO_REQUIEREN_FACTURA = ("NOMINA", "SAT")


def _requiere_factura(desc: str) -> bool:
    d = normalizar(desc).split()
    return not any(k in d for k in NO_REQUIEREN_FACTURA)


def _motivo_sin_factura(desc: str) -> str:
    d = normalizar(desc)
    for clave, motivo in MOTIVOS_SIN_FACTURA:
        if clave in d:
            return motivo
    return "No se encontró factura que coincida. Pide el CFDI a tu cliente/proveedor o revisa si es un movimiento personal."


def conciliar(banco: pd.DataFrame, facturas: pd.DataFrame) -> dict:
    """Devuelve dict con 'movimientos' (resultado por movimiento), 'aplicaciones' y 'facturas' (con saldo)."""
    fac = facturas[facturas["tipo"].isin(["emitida", "recibida"])].copy()
    fac["pagado"] = 0.0
    fac["saldo_pendiente"] = fac["total"]
    aplicaciones = []
    resultados = []

    for _, m in banco.iterrows():
        monto = abs(m["monto"])
        tipo_fac = "emitida" if m["tipo"] == "abono" else "recibida"
        abiertas = fac[(fac["tipo"] == tipo_fac) & (fac["saldo_pendiente"] > 0.5) & (fac["fecha"] <= m["fecha"] + pd.Timedelta(days=5))]
        candidatos = []  # (score, [(idx, monto_aplicado)], tipo_match, detalle)

        cp_scores = {}
        for idx, f in abiertas.iterrows():
            cp = score_contraparte(m["descripcion"], m["referencia"], f["rfc_contraparte"], f["contraparte"], f["folio"])
            fe = score_fecha(m["fecha"], f["fecha"], f["vencimiento"])
            co = score_concepto(m["descripcion"], f["concepto"])
            cp_scores[idx] = (cp, fe, co)
            # 1 a 1 (contra el saldo pendiente)
            mo = score_monto(monto, f["saldo_pendiente"])
            s = PESOS["monto"] * mo + PESOS["contraparte"] * cp + PESOS["fecha"] * fe + PESOS["concepto"] * co
            if mo > 0:
                tipo = "Pago total" if f["pagado"] == 0 else "Liquidación de saldo"
                candidatos.append((s, [(idx, min(monto, f["saldo_pendiente"]))], tipo,
                                   {"monto": mo, "contraparte": cp, "fecha": fe, "concepto": co}))
            # Parcial: el depósito es menor al saldo y la contraparte es clara
            if monto < f["saldo_pendiente"] - 1 and cp >= 0.75:
                proporcion = monto / f["saldo_pendiente"]
                mo_p = 0.75 if 0.2 <= proporcion <= 0.8 else 0.6
                s_p = PESOS["monto"] * mo_p + PESOS["contraparte"] * cp + PESOS["fecha"] * fe + PESOS["concepto"] * co
                candidatos.append((s_p * 0.95, [(idx, monto)], "Pago parcial",
                                   {"monto": mo_p, "contraparte": cp, "fecha": fe, "concepto": co}))

        # Agrupado: 2-3 facturas de la misma contraparte cuya suma coincide
        por_cp: dict[str, list] = {}
        for idx in abiertas.index:
            por_cp.setdefault(abiertas.at[idx, "rfc_contraparte"], []).append(idx)
        for rfc, idxs in por_cp.items():
            if len(idxs) < 2:
                continue
            for r in (2, 3):
                for combo in combinations(idxs[:8], r):
                    suma = sum(fac.at[i, "saldo_pendiente"] for i in combo)
                    mo = score_monto(monto, suma)
                    if mo < 0.9:
                        continue
                    cp = max(cp_scores[i][0] for i in combo)
                    fe = min(cp_scores[i][1] for i in combo)
                    co = max(cp_scores[i][2] for i in combo)
                    s = PESOS["monto"] * mo + PESOS["contraparte"] * cp + PESOS["fecha"] * fe + PESOS["concepto"] * co
                    candidatos.append((s * 0.98, [(i, fac.at[i, "saldo_pendiente"]) for i in combo],
                                       f"Pago agrupado ({r} facturas)",
                                       {"monto": mo, "contraparte": cp, "fecha": fe, "concepto": co}))

        mejor = max(candidatos, key=lambda c: c[0]) if candidatos else None
        if mejor and mejor[0] >= UMBRAL:
            s, apps, tipo_match, det = mejor
            folios = []
            for idx, aplicado in apps:
                fac.at[idx, "pagado"] += aplicado
                fac.at[idx, "saldo_pendiente"] = max(0.0, fac.at[idx, "total"] - fac.at[idx, "pagado"])
                folios.append(fac.at[idx, "folio"])
                aplicaciones.append({
                    "id_mov": m["id_mov"], "fecha_mov": m["fecha"], "uuid": fac.at[idx, "uuid"],
                    "folio": fac.at[idx, "folio"], "monto_aplicado": round(aplicado, 2),
                    "proporcion_iva": fac.at[idx, "iva"] / fac.at[idx, "total"] if fac.at[idx, "total"] else 0,
                    "tipo": tipo_fac,
                })
            resultados.append({
                "id_mov": m["id_mov"], "estado": "Conciliado", "tipo_match": tipo_match,
                "facturas": ", ".join(folios), "contraparte": fac.at[apps[0][0], "contraparte"],
                "confianza": round(s * 100), "detalle": det, "motivo": "",
            })
        else:
            sugerida = ""
            if mejor:
                sugerida = ", ".join(fac.at[i, "folio"] for i, _ in mejor[1])
            resultados.append({
                "id_mov": m["id_mov"],
                "estado": "Sin factura" if _requiere_factura(m["descripcion"]) else "No requiere factura", "tipo_match": "—",
                "facturas": "", "contraparte": "", "confianza": round(mejor[0] * 100) if mejor else 0,
                "detalle": {}, "motivo": _motivo_sin_factura(m["descripcion"])
                + (f" (Posible coincidencia débil con {sugerida}.)" if sugerida else ""),
            })

    res = pd.DataFrame(resultados)
    movs = banco.merge(res, on="id_mov", how="left")
    fac["estado_pago"] = fac.apply(
        lambda r: "Pagada" if r["saldo_pendiente"] <= 0.5 else ("Parcial" if r["pagado"] > 0 else "Pendiente"), axis=1)
    return {"movimientos": movs, "aplicaciones": pd.DataFrame(aplicaciones), "facturas": fac}


def resumen(conc: dict) -> dict:
    movs = conc["movimientos"]
    aplica = movs[movs["estado"] != "No requiere factura"]
    total = len(aplica)
    ok = int((aplica["estado"] == "Conciliado").sum())
    return {
        "total_movimientos": len(movs),
        "requieren_factura": total,
        "conciliados": ok,
        "sin_factura": total - ok,
        "no_requieren": len(movs) - total,
        "pct_conciliado": round(100 * ok / total, 1) if total else 0.0,
        "monto_sin_factura": float(aplica.loc[aplica["estado"] != "Conciliado", "monto"].abs().sum()),
        "confianza_promedio": float(movs.loc[movs["estado"] == "Conciliado", "confianza"].mean() or 0),
    }
