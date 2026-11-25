"""Construye las recomendaciones (cada una con porqué y acción) y el contexto de datos para el chat."""
from __future__ import annotations

import hashlib
import json

import pandas as pd

from .datos import normalizar


def _id(*partes) -> str:
    return hashlib.sha1("|".join(map(str, partes)).encode()).hexdigest()[:10]


def _reco(modulo, titulo, porque, accion, confianza="Media", prioridad=2, clave=None) -> dict:
    return {"id": _id(modulo, clave or titulo), "modulo": modulo, "titulo": titulo, "porque": porque,
            "accion": accion, "confianza": confianza, "prioridad": prioridad}


def recos_conciliacion(conc: dict) -> list[dict]:
    movs = conc["movimientos"]
    sin = movs[movs["estado"] == "Sin factura"]
    out = []
    tpv = sin[sin["descripcion"].map(lambda d: "TPV" in normalizar(d))]
    for periodo, g in tpv.groupby(tpv["fecha"].dt.to_period("M")):
        out.append(_reco("Banca", f"Emitir factura global de ventas de mostrador de {periodo}",
                         f"Hay {len(g)} depósitos de terminal (TPV) por ${g['monto'].sum():,.2f} sin factura. "
                         "El SAT espera que las ventas a público en general se amparen con una factura global "
                         "(una factura que junta todas las ventas sin RFC del periodo, como el ticket de cierre del día).",
                         "Genera la factura global a RFC XAXX010101000 por estos depósitos y súbela a la app.",
                         "Alta", 1, clave=f"tpv{periodo}"))
    agrupables = {"ELECTRICO": "servicio de luz", "TELECOM": "internet/teléfono", "COMISION": "comisiones bancarias"}
    for clave, nombre in agrupables.items():
        g = sin[sin["descripcion"].map(lambda d: clave in normalizar(d))]
        if g.empty:
            continue
        out.append(_reco("Banca", f"Conseguir CFDI de {nombre}: {len(g)} cargos por ${g['monto'].abs().sum():,.2f}",
                         g["motivo"].iloc[0] + " Sin CFDI no puedes deducir el gasto ni acreditar su IVA.",
                         "Descarga las facturas del portal del proveedor o del banco y cárgalas a la app.",
                         "Alta", 2, clave=f"grp{clave}"))
    for _, m in sin.iterrows():
        d = normalizar(m["descripcion"])
        if "TPV" in d or any(k in d for k in agrupables):
            continue
        if "EFECTIVO" in d and m["monto"] > 0:
            titulo, accion, prio = (f"Aclarar depósito en efectivo de ${m['monto']:,.2f} ({m['fecha']:%d/%m})",
                                    "Indica si fue venta (requiere factura), préstamo o aportación de socios, y guarda el comprobante.", 1)
        elif "RETIRO" in d:
            titulo, accion, prio = (f"Documentar retiro de efectivo de ${abs(m['monto']):,.2f} ({m['fecha']:%d/%m})",
                                    "Anota en qué se usó y conserva los comprobantes; si fue gasto del negocio, pide factura.", 2)
        else:
            titulo, accion, prio = (f"Conseguir CFDI de: {m['descripcion'].title()} (${abs(m['monto']):,.2f})",
                                    "Descarga la factura del portal del proveedor o solicítala y cárgala a la app.", 2)
        out.append(_reco("Banca", titulo, m["motivo"], accion, "Alta", prio, clave=m["id_mov"]))
    dudosos = movs[(movs["estado"] == "Conciliado") & (movs["confianza"] < 80)]
    for _, m in dudosos.iterrows():
        out.append(_reco("Banca", f"Confirmar conciliación de {m['descripcion'].title()} con {m['facturas']}",
                         f"La coincidencia tiene {m['confianza']}% de confianza ({m['tipo_match'].lower()}).",
                         f"Confirma que el movimiento del {m['fecha']:%d/%m} corresponde a {m['facturas']}.",
                         "Media", 2, clave=f"dud{m['id_mov']}"))
    return out


def recos_flujo(sugerencias: pd.DataFrame, alertas: list[dict], facturas: pd.DataFrame, fecha_corte) -> list[dict]:
    out = []
    for _, s in sugerencias.iterrows():
        out.append(_reco("Banca", f"Pagar {s['folio']} a {s['proveedor'].title()} el {s['fecha_sugerida']:%d/%m/%Y} "
                                  f"por ${s['monto_sugerido']:,.2f}",
                         f"{s['estrategia']}: {s['porque']}",
                         "Si estás de acuerdo, programa tú mismo el pago en tu banca en esa fecha (Fina no ejecuta pagos).",
                         "Media (proyección)", 1, clave=f"pago{s['uuid']}"))
    if any(a["nivel"] == "error" for a in alertas) or any(a["nivel"] == "warning" for a in alertas):
        cxc = facturas[(facturas["tipo"] == "emitida") & (facturas["saldo_pendiente"] > 0.5)].sort_values("vencimiento")
        if not cxc.empty:
            lista = "; ".join(f"{r['folio']} {r['contraparte'].title()} ${r['saldo_pendiente']:,.0f} (vence {r['vencimiento']:%d/%m})"
                              for _, r in cxc.head(4).iterrows())
            out.append(_reco("Banca", "Acelerar cobranza para cubrir el bache de liquidez",
                             f"{alertas[0]['texto']} Tienes por cobrar: {lista}.",
                             "Envía recordatorio de pago a estos clientes esta semana y ofrece pago anticipado.",
                             "Media (proyección)", 1, clave="cobranza"))
    return out


def recos_fiscal(imp: dict, deducciones: pd.DataFrame, fecha_pago) -> list[dict]:
    out = []
    total = max(imp["iva_neto"], 0) + imp["isr_provisional"]
    out.append(_reco("Fiscal", f"Apartar ${total:,.2f} para impuestos de {imp['periodo']} (estimación)",
                     f"Estimación (confianza {imp['confianza'].lower()}): IVA ${imp['iva_neto']:,.2f} + ISR provisional "
                     f"${imp['isr_provisional']:,.2f}, con coeficiente de utilidad {imp['coef_utilidad']:.2%}. "
                     "Separarlo evita usar dinero que ya es del SAT.",
                     f"Aparta este monto antes del {fecha_pago:%d/%m/%Y} y valida la cifra con tu contador (Fina no presenta declaraciones).",
                     imp["confianza"], 1, clave=f"imp{imp['periodo']}"))
    for _, d in deducciones[deducciones["Acción sugerida"].ne("Ninguna") & deducciones["Origen"].eq("Factura")].iterrows():
        if "Aún no pagada" in d["Observaciones"] and d["Deducible"] != "Revisar" and "REP" not in d["Observaciones"]:
            continue
        out.append(_reco("Fiscal", f"Corregir factura {d['Documento']} de {d['Proveedor'].title()}",
                         f"{d['Observaciones']}. Sin corregirlo podrías perder la deducción de ${d['Monto (sin IVA)']:,.2f}.",
                         d["Acción sugerida"], "Alta", 1, clave=f"ded{d['Documento']}"))
    return out


def recos_contrato(analisis: dict | None, nombre: str, hoy) -> list[dict]:
    if not analisis:
        return []
    out = []
    v = analisis.get("vigencia", {})
    if v.get("renovacion_automatica"):
        out.append(_reco("Contratos", f"Decidir si renuevas el contrato «{nombre}»",
                         f"Se renueva automáticamente (fin: {v.get('fin')}). Aviso de no renovación: {v.get('aviso_no_renovacion')}. "
                         "Si el plazo para avisar ya pasó, podrías quedar obligado otro periodo.",
                         "Revisa con un abogado si aún puedes no renovar o renegociar condiciones antes del vencimiento.",
                         "Alta", 1, clave=f"renov{nombre}"))
    for i, r in enumerate(analisis.get("recomendaciones", [])):
        out.append(_reco("Contratos", r["titulo"], r["porque"], r["accion"], analisis.get("confianza", "media").title(), 2,
                         clave=f"{nombre}{i}{r['titulo']}{r['porque']}"))
    return out


def contexto_chat(empresa: str, rfc: str, conc: dict, res_conc: dict, horizontes: pd.DataFrame, alertas: list,
                  sugerencias: pd.DataFrame, imp: dict, fechas_sat: pd.DataFrame, analisis: dict | None,
                  texto_contrato: str, decisiones: dict, colchon: float) -> str:
    movs, fac = conc["movimientos"], conc["facturas"]

    def tabla(df: pd.DataFrame, cols: list[str]) -> str:
        return df[cols].to_csv(index=False, date_format="%Y-%m-%d", float_format="%.2f") if not df.empty else "(sin datos)\n"

    partes = [
        f"Empresa: {empresa} · RFC: {rfc}",
        f"Periodo del estado de cuenta: {movs['fecha'].min():%Y-%m-%d} a {movs['fecha'].max():%Y-%m-%d}. "
        f"Saldo al corte: ${movs['saldo'].iloc[-1]:,.2f}. Colchón mínimo definido por el usuario: ${colchon:,.0f}.",
        "## Conciliación (resumen)\n" + json.dumps(res_conc, ensure_ascii=False, default=str),
        "## Movimientos bancarios con resultado de conciliación\n" + tabla(
            movs, ["id_mov", "fecha", "descripcion", "monto", "saldo", "estado", "tipo_match", "facturas", "confianza", "motivo"]),
        "## Facturas CFDI (con estado de pago)\n" + tabla(
            fac, ["folio", "fecha", "tipo", "contraparte", "concepto", "subtotal", "iva", "total", "metodo_pago",
                  "uso_cfdi", "condiciones", "vencimiento", "pagado", "saldo_pendiente", "estado_pago"]),
        "## Proyección de flujo de efectivo (ESTIMACIÓN)\n" + tabla(horizontes, list(horizontes.columns)),
        "Alertas: " + ("; ".join(a["texto"] for a in alertas) or "ninguna"),
        "## Sugerencias de pago a proveedores (ESTIMACIÓN)\n" + tabla(
            sugerencias, ["folio", "proveedor", "saldo", "vencimiento", "fecha_sugerida", "monto_sugerido", "estrategia", "porque"]),
        "## Impuestos estimados del mes seleccionado (ESTIMACIÓN, persona moral régimen general)\n"
        + json.dumps({k: (round(v, 2) if isinstance(v, float) else v) for k, v in imp.items()}, ensure_ascii=False),
        "## Próximas fechas SAT\n" + fechas_sat.to_csv(index=False),
    ]
    if analisis:
        partes.append("## Análisis del contrato\n" + json.dumps(analisis, ensure_ascii=False))
    if texto_contrato:
        partes.append("## Texto del contrato\n" + texto_contrato)
    if decisiones:
        partes.append("## Decisiones del usuario sobre recomendaciones\n" + json.dumps(decisiones, ensure_ascii=False, default=str))
    return "\n\n".join(partes)
