"""Estimaciones fiscales simplificadas (persona moral, régimen general) — SOLO ESTIMACIONES.

- IVA: se calcula sobre flujo de efectivo (lo efectivamente cobrado y pagado en el mes).
- ISR: pago provisional aproximado = ingresos nominales del mes × coeficiente de utilidad × 30 %.
  (El cálculo real es acumulado desde enero y resta pagos provisionales anteriores.)
"""
from __future__ import annotations

from datetime import date, timedelta

import pandas as pd

from .datos import normalizar

TASA_IVA = 0.16
TASA_ISR_PM = 0.30
FORMAS_PAGO = {"01": "Efectivo", "02": "Cheque", "03": "Transferencia", "04": "Tarjeta de crédito",
               "28": "Tarjeta de débito", "99": "Por definir"}
VENTAS_SIN_FACTURA = ("TPV", "DEPOSITO EN EFECTIVO")


def _mes(df: pd.DataFrame, col: str, periodo: pd.Period) -> pd.DataFrame:
    return df[df[col].dt.to_period("M") == periodo] if not df.empty else df


def estimar_impuestos(conc: dict, periodo: pd.Period, coef_utilidad: float) -> dict:
    movs, apps, fac = conc["movimientos"], conc["aplicaciones"], conc["facturas"]
    apps_mes = _mes(apps, "fecha_mov", periodo)
    movs_mes = _mes(movs, "fecha", periodo)

    # IVA trasladado cobrado (facturas emitidas cobradas en el mes)
    em = apps_mes[apps_mes["tipo"] == "emitida"] if not apps_mes.empty else apps_mes
    iva_cobrado_fact = float((em["monto_aplicado"] * em["proporcion_iva"]).sum()) if not em.empty else 0.0
    # Depósitos de ventas sin factura (se asume que incluyen IVA → requieren factura global)
    sin_fac = movs_mes[(movs_mes["estado"] == "Sin factura") & (movs_mes["tipo"] == "abono")
                       & movs_mes["descripcion"].map(lambda d: any(k in normalizar(d) for k in VENTAS_SIN_FACTURA))]
    ventas_sin_fac = float(sin_fac["monto"].sum())
    iva_ventas_sin_fac = ventas_sin_fac * TASA_IVA / (1 + TASA_IVA)

    # IVA acreditable (facturas recibidas pagadas en el mes y que cumplen requisitos básicos)
    rec = apps_mes[apps_mes["tipo"] == "recibida"] if not apps_mes.empty else apps_mes
    iva_acred, iva_no_acred = 0.0, 0.0
    if not rec.empty:
        rec = rec.merge(fac[["uuid", "uso_cfdi", "forma_pago", "total"]], on="uuid", how="left")
        ok = ~((rec["uso_cfdi"] == "S01") | ((rec["forma_pago"] == "01") & (rec["total"] > 2000)))
        iva_acred = float((rec.loc[ok, "monto_aplicado"] * rec.loc[ok, "proporcion_iva"]).sum())
        iva_no_acred = float((rec.loc[~ok, "monto_aplicado"] * rec.loc[~ok, "proporcion_iva"]).sum())
    iva_comisiones = float(-movs_mes[movs_mes["descripcion"].map(lambda d: "IVA COMISION" in normalizar(d))]["monto"].sum())
    iva_acred += iva_comisiones

    iva_trasladado = iva_cobrado_fact + iva_ventas_sin_fac
    iva_neto = iva_trasladado - iva_acred

    # ISR: ingresos nominales del mes (facturado + ventas de mostrador sin IVA)
    emitidas_mes = _mes(fac[fac["tipo"] == "emitida"], "fecha", periodo)
    ingresos = float(emitidas_mes["subtotal"].sum()) + ventas_sin_fac / (1 + TASA_IVA)
    recibidas_mes = _mes(fac[fac["tipo"] == "recibida"], "fecha", periodo)
    gastos_factura = float(recibidas_mes.loc[recibidas_mes["uso_cfdi"] != "S01", "subtotal"].sum())
    isr = ingresos * coef_utilidad * TASA_ISR_PM

    datos_mes = len(movs_mes) > 0
    confianza = "Media" if datos_mes and len(apps_mes) >= 3 else "Baja"
    return {
        "periodo": str(periodo),
        "iva_cobrado_facturas": iva_cobrado_fact,
        "ventas_sin_factura": ventas_sin_fac,
        "iva_ventas_sin_factura": iva_ventas_sin_fac,
        "iva_trasladado": iva_trasladado,
        "iva_acreditable": iva_acred,
        "iva_comisiones": iva_comisiones,
        "iva_no_acreditable": iva_no_acred,
        "iva_neto": iva_neto,
        "ingresos_nominales": ingresos,
        "gastos_con_factura": gastos_factura,
        "coef_utilidad": coef_utilidad,
        "isr_provisional": isr,
        "confianza": confianza,
    }


def revisar_deducciones(conc: dict) -> pd.DataFrame:
    """Señala posibles deducciones y problemas que impedirían deducir."""
    fac, movs = conc["facturas"], conc["movimientos"]
    filas = []
    for _, f in fac[fac["tipo"] == "recibida"].iterrows():
        problemas, accion = [], ""
        if f["uso_cfdi"] == "S01":
            problemas.append("Uso CFDI 'S01 Sin efectos fiscales'")
            accion = "Pide al proveedor cancelar y emitir de nuevo con uso G03 (gastos en general) o G01."
        if f["forma_pago"] == "01" and f["total"] > 2000:
            problemas.append("Pagada en efectivo por más de $2,000")
            accion = "Para gastos mayores a $2,000 paga con transferencia, tarjeta o cheque nominativo."
        if f["metodo_pago"] == "PPD" and f["pagado"] > 0:
            problemas.append("PPD pagada: requiere complemento de pago (REP)")
            accion = accion or "Solicita al proveedor el complemento de pago (REP) para acreditar el IVA."
        if f["estado_pago"] != "Pagada":
            problemas.append("Aún no pagada: se deduce/acredita hasta que la pagues")
        filas.append({
            "Origen": "Factura", "Documento": f["folio"], "Proveedor": f["contraparte"], "Concepto": f["concepto"],
            "Monto (sin IVA)": f["subtotal"],
            "Deducible": "Revisar" if any("S01" in p or "efectivo" in p for p in problemas) else "Sí (estimado)",
            "Observaciones": "; ".join(problemas) or "Cumple requisitos básicos",
            "Acción sugerida": accion or "Ninguna",
        })
    gastos_sin = movs[(movs["estado"] == "Sin factura") & (movs["tipo"] == "cargo")]
    for _, m in gastos_sin.iterrows():
        d = normalizar(m["descripcion"])
        if "RETIRO" in d:
            continue
        filas.append({
            "Origen": "Banco", "Documento": m["id_mov"], "Proveedor": "—", "Concepto": m["descripcion"],
            "Monto (sin IVA)": round(abs(m["monto"]) / (1 + TASA_IVA), 2) if "IVA" not in d else 0.0,
            "Deducible": "Posible", "Observaciones": "Gasto pagado sin CFDI identificado",
            "Acción sugerida": "Descarga o solicita el CFDI para poder deducirlo." if "IVA" not in d
            else "El IVA de comisiones se acredita con el estado de cuenta/CFDI del banco.",
        })
    return pd.DataFrame(filas)


def _siguiente_habil(d: date) -> date:
    while d.weekday() >= 5:  # sábado/domingo (no considera días festivos)
        d += timedelta(days=1)
    return d


MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre",
         "octubre", "noviembre", "diciembre"]


def _mes_anterior(d: date, atras: int = 1) -> str:
    return MESES[(d.month - 1 - atras) % 12]


def proximas_fechas_sat(hoy: date, n: int = 8) -> pd.DataFrame:
    eventos = []
    for k in range(0, 5):
        anio = hoy.year + (hoy.month - 1 + k) // 12
        mes = (hoy.month - 1 + k) % 12 + 1
        base = date(anio, mes, 1)
        nombre = _mes_anterior(base)
        eventos.append((_siguiente_habil(date(anio, mes, 17)), f"Pago provisional de ISR, IVA y retenciones de {nombre}",
                        "Declaración mensual (art. 14 LISR, art. 5-D LIVA). Si el 17 es inhábil, se recorre al siguiente día hábil."))
        fin_mes = (date(anio + (mes == 12), mes % 12 + 1, 1) - timedelta(days=1))
        eventos.append((_siguiente_habil(fin_mes), f"DIOT de {nombre}",
                        "Declaración Informativa de Operaciones con Terceros. Verifica el plazo vigente en sat.gob.mx."))
        eventos.append((_siguiente_habil(date(anio, mes, 3)),
                        f"Contabilidad electrónica (balanza) de {_mes_anterior(base, 2)}",
                        "Personas morales: a más tardar el día 3 del segundo mes posterior (RMF). Verifica en sat.gob.mx."))
        if mes == 3:
            eventos.append((_siguiente_habil(date(anio, 3, 31)), f"Declaración anual de personas morales {anio - 1}",
                            "Art. 76 LISR: dentro de los tres meses siguientes al cierre del ejercicio."))
    df = pd.DataFrame(eventos, columns=["Fecha", "Obligación", "Nota"])
    df = df[df["Fecha"] >= hoy].sort_values("Fecha").head(n).reset_index(drop=True)
    df["Días restantes"] = df["Fecha"].map(lambda d: (d - hoy).days)
    return df
