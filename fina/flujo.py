"""Proyección de flujo de efectivo (30/60/90 días) y sugerencia de fechas de pago a proveedores."""
from __future__ import annotations

import re

import pandas as pd

from .datos import normalizar

_MESES = {"ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC",
          "QUINCENA", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"}


def _clave(desc: str) -> str:
    palabras = [p for p in re.sub(r"\d+", " ", normalizar(desc)).split() if p not in _MESES]
    return " ".join(palabras[:5])


def detectar_recurrentes(movs: pd.DataFrame) -> pd.DataFrame:
    """Detecta gastos/ingresos que se repiten (renta, nómina, luz, ventas TPV...)."""
    base = movs[~((movs["tipo"] == "abono") & (movs["estado"] == "Conciliado"))].copy()
    base["clave"] = base["descripcion"].map(_clave)
    meses_hist = max(1, movs["fecha"].dt.to_period("M").nunique())
    filas = []
    for clave, g in base.groupby("clave"):
        n_meses = g["fecha"].dt.to_period("M").nunique()
        if n_meses < 2:
            continue
        por_mes = len(g) / n_meses
        monto = g.sort_values("fecha")["monto"].tail(4).mean()
        if por_mes >= 3:
            frecuencia, dias = "semanal", []
        elif por_mes >= 1.5:
            d = g["fecha"].dt.day
            frecuencia, dias = "quincenal", [int(d[d <= 15].median() if (d <= 15).any() else 15),
                                             int(d[d > 15].median() if (d > 15).any() else 30)]
        else:
            frecuencia, dias = "mensual", [int(g["fecha"].dt.day.median())]
        filas.append({"concepto": g["descripcion"].iloc[-1], "clave": clave, "frecuencia": frecuencia,
                      "dias": dias, "monto_promedio": round(monto, 2), "ultima_fecha": g["fecha"].max(),
                      "ocurrencias": len(g), "cobertura_meses": f"{n_meses}/{meses_hist}"})
    return pd.DataFrame(filas)


def _fecha_dia(anio: int, mes: int, dia: int) -> pd.Timestamp:
    ultimo = pd.Timestamp(anio, mes, 1) + pd.offsets.MonthEnd(0)
    return pd.Timestamp(anio, mes, min(dia, ultimo.day))


def eventos_proyectados(movs: pd.DataFrame, facturas: pd.DataFrame, fecha_corte: pd.Timestamp,
                        horizonte: int = 90, ventas_estimadas: bool = True) -> pd.DataFrame:
    fin = fecha_corte + pd.Timedelta(days=horizonte)
    ev = []
    for _, r in detectar_recurrentes(movs).iterrows():
        if r["frecuencia"] == "semanal":
            f = r["ultima_fecha"] + pd.Timedelta(days=7)
            while f <= fin:
                if f > fecha_corte:
                    ev.append((f, r["concepto"], r["monto_promedio"], "Recurrente (semanal)", "Media"))
                f += pd.Timedelta(days=7)
        else:
            mes = fecha_corte.replace(day=1)
            while mes <= fin:
                for d in r["dias"]:
                    f = _fecha_dia(mes.year, mes.month, d)
                    if fecha_corte < f <= fin and f > r["ultima_fecha"] + pd.Timedelta(days=5):
                        ev.append((f, r["concepto"], r["monto_promedio"], f"Recurrente ({r['frecuencia']})", "Media"))
                mes += pd.offsets.MonthBegin(1)
    # Cuentas por cobrar
    for _, f in facturas[(facturas["tipo"] == "emitida") & (facturas["saldo_pendiente"] > 0.5)].iterrows():
        fecha, conf = f["vencimiento"], "Alta"
        if fecha <= fecha_corte:
            fecha, conf = fecha_corte + pd.Timedelta(days=7), "Baja (vencida)"
        ev.append((fecha, f"Cobro {f['folio']} · {f['contraparte']}", f["saldo_pendiente"], "Cuenta por cobrar", conf))
    # Ventas facturadas futuras (aún sin factura): promedio histórico de cobros a clientes, a partir del día 31
    if ventas_estimadas:
        cobros = movs[(movs["tipo"] == "abono") & (movs["estado"] == "Conciliado")]
        meses = max(1, movs["fecha"].dt.to_period("M").nunique())
        semanal = cobros["monto"].sum() / meses * 12 / 52
        f = fecha_corte + pd.Timedelta(days=35)
        while f <= fin and semanal > 0:
            ev.append((f, "Cobros estimados a clientes (promedio histórico)", round(semanal, 2),
                       "Venta estimada", "Baja"))
            f += pd.Timedelta(days=7)
    df = pd.DataFrame(ev, columns=["fecha", "concepto", "monto", "tipo", "confianza"])
    return df[df["fecha"] <= fin].sort_values("fecha").reset_index(drop=True)


def cuentas_por_pagar(facturas: pd.DataFrame) -> pd.DataFrame:
    return facturas[(facturas["tipo"] == "recibida") & (facturas["saldo_pendiente"] > 0.5)].copy()


def serie_diaria(saldo_inicial: float, eventos: pd.DataFrame, fecha_corte: pd.Timestamp, horizonte: int = 90) -> pd.DataFrame:
    dias = pd.date_range(fecha_corte, fecha_corte + pd.Timedelta(days=horizonte), freq="D")
    neto = eventos.groupby("fecha")["monto"].sum() if not eventos.empty else pd.Series(dtype=float)
    entradas = eventos[eventos["monto"] > 0].groupby("fecha")["monto"].sum() if not eventos.empty else pd.Series(dtype=float)
    salidas = eventos[eventos["monto"] < 0].groupby("fecha")["monto"].sum() if not eventos.empty else pd.Series(dtype=float)
    s = pd.DataFrame(index=dias)
    s["entradas"] = entradas.reindex(dias, fill_value=0.0)
    s["salidas"] = salidas.reindex(dias, fill_value=0.0)
    s["neto"] = neto.reindex(dias, fill_value=0.0)
    s["saldo"] = saldo_inicial + s["neto"].cumsum()
    s.index.name = "fecha"
    return s.reset_index()


def _min_desde(serie: pd.DataFrame, fecha: pd.Timestamp, monto: float) -> float:
    tramo = serie[serie["fecha"] >= fecha]["saldo"]
    return float(tramo.min() - monto) if not tramo.empty else float("inf")


def planear_pagos(saldo_inicial: float, eventos_base: pd.DataFrame, cxp: pd.DataFrame,
                  fecha_corte: pd.Timestamp, colchon: float, horizonte: int = 90):
    """Sugiere fecha de pago por factura de proveedor. Devuelve (sugerencias, eventos_con_pagos)."""
    eventos = eventos_base.copy()
    sugerencias = []
    for _, f in cxp.sort_values("vencimiento").iterrows():
        serie = serie_diaria(saldo_inicial, eventos, fecha_corte, horizonte)
        monto = f["saldo_pendiente"]
        venc = max(f["vencimiento"], fecha_corte + pd.Timedelta(days=1))
        opciones = []
        lim = f["fecha_limite_descuento"]
        if f["descuento_pct"] > 0 and pd.notna(lim) and lim > fecha_corte:
            m_desc = round(monto * (1 - f["descuento_pct"]), 2)
            dias_antes = max((f["vencimiento"] - lim).days, 1)
            tasa_anual = f["descuento_pct"] / (1 - f["descuento_pct"]) * 365 / dias_antes
            opciones.append(("descuento", lim, m_desc,
                             f"Pagar el {lim:%d/%m} con {f['descuento_pct']:.0%} de descuento ahorra "
                             f"${monto - m_desc:,.2f} (equivale a ~{tasa_anual:.0%} anual, mejor que casi cualquier inversión)."))
        opciones.append(("vencimiento", venc, monto, f"Pagar en la fecha de vencimiento ({venc:%d/%m}) cuida tu liquidez sin generar atraso."))
        elegido = None
        for tipo, fecha, m, razon in opciones:
            if _min_desde(serie, fecha, m) >= colchon:
                elegido = (tipo, fecha, m, razon)
                break
        if elegido is None:
            # Buscar la primera fecha (hasta 30 días después del vencimiento) en que el pago no rompe el colchón
            for d in pd.date_range(fecha_corte + pd.Timedelta(days=1), venc + pd.Timedelta(days=30)):
                if _min_desde(serie, d, monto) >= colchon:
                    if d <= venc:
                        elegido = ("liquidez", d, monto, f"Es la fecha más temprana en que pagar no deja tu saldo por debajo del colchón de ${colchon:,.0f}.")
                    else:
                        elegido = ("negociar", d, monto,
                                   f"Pagar al vencimiento ({venc:%d/%m}) dejaría tu saldo por debajo del colchón. "
                                   f"Propón al proveedor pagar el {d:%d/%m} ({(d - venc).days} días de prórroga) antes de que venza.")
                    break
        if elegido is None:
            elegido = ("riesgo", venc, monto, "Aun pagando al vencimiento tu saldo proyectado queda bajo el colchón: "
                                              "prioriza cobranza o negocia un plan de pagos con el proveedor.")
        tipo, fecha, m, razon = elegido
        if tipo != "descuento" and opciones[0][0] == "descuento":
            razon += " No conviene tomar el descuento por pronto pago porque te quedarías sin liquidez suficiente."
        eventos = pd.concat([eventos, pd.DataFrame([{
            "fecha": fecha, "concepto": f"Pago {f['folio']} · {f['contraparte']}", "monto": -m,
            "tipo": "Pago a proveedor (sugerido)", "confianza": "Alta"}])], ignore_index=True).sort_values("fecha")
        sugerencias.append({
            "uuid": f["uuid"], "folio": f["folio"], "proveedor": f["contraparte"], "saldo": monto,
            "vencimiento": f["vencimiento"], "fecha_sugerida": fecha, "monto_sugerido": m,
            "estrategia": {"descuento": "Pronto pago", "vencimiento": "Al vencimiento", "liquidez": "Según liquidez",
                           "negociar": "Negociar prórroga", "riesgo": "Riesgo de liquidez"}[tipo],
            "porque": razon,
        })
    return pd.DataFrame(sugerencias), eventos.reset_index(drop=True)


def resumen_horizontes(serie: pd.DataFrame, fecha_corte: pd.Timestamp) -> pd.DataFrame:
    filas = []
    for h in (30, 60, 90):
        t = serie[serie["fecha"] <= fecha_corte + pd.Timedelta(days=h)]
        i_min = t["saldo"].idxmin()
        filas.append({"Horizonte": f"{h} días", "Entradas": t["entradas"].sum(), "Salidas": -t["salidas"].sum(),
                      "Saldo final": t["saldo"].iloc[-1], "Saldo mínimo": t.at[i_min, "saldo"],
                      "Fecha saldo mínimo": t.at[i_min, "fecha"]})
    return pd.DataFrame(filas)


def alertas_liquidez(serie: pd.DataFrame, colchon: float) -> list[dict]:
    alertas = []
    neg = serie[serie["saldo"] < 0]
    if not neg.empty:
        peor = neg.loc[neg["saldo"].idxmin()]
        alertas.append({"nivel": "error",
                        "texto": f"Faltante de liquidez proyectado a partir del {neg['fecha'].iloc[0]:%d/%m/%Y}. "
                                 f"El punto más bajo sería ${peor['saldo']:,.2f} el {peor['fecha']:%d/%m/%Y}."})
    bajo = serie[(serie["saldo"] >= 0) & (serie["saldo"] < colchon)]
    if not bajo.empty:
        alertas.append({"nivel": "warning",
                        "texto": f"Tu saldo proyectado baja del colchón mínimo (${colchon:,.0f}) en {len(bajo)} día(s), "
                                 f"el primero el {bajo['fecha'].iloc[0]:%d/%m/%Y}."})
    return alertas
