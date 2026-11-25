"""IA Financiera · Fina, tu copiloto financiero para pymes en México (prototipo)."""
from __future__ import annotations

import hashlib
from datetime import date, datetime

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from fina import conciliacion, contratos, fiscal, flujo, llm, recomendaciones
from fina.datos import (cargar_ejemplo, detectar_rfc_empresa, facturas_a_df, leer_cfdi, leer_contrato,
                        leer_estado_cuenta)

st.set_page_config(page_title="IA Financiera · Fina", page_icon="💼", layout="wide")

AVISO = ("⚠️ **Todo lo que muestra Fina son estimaciones** con fines informativos y **no sustituye la asesoría "
         "de un contador o abogado**. Fina **nunca ejecuta pagos, presenta declaraciones ni acepta contratos**: "
         "solo recomienda y tú decides.")

st.markdown("""
<style>
.block-container {padding-top: 1.5rem;}
div[data-testid="stMetricValue"] {font-size: 1.5rem;}
.fina-badge {display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.8rem;font-weight:600;}
.ok {background:#dcfce7;color:#166534;} .edit {background:#fef3c7;color:#92400e;} .pend {background:#e0e7ff;color:#3730a3;}
</style>""", unsafe_allow_html=True)


def dinero(x: float) -> str:
    return f"${x:,.2f}"


def aviso():
    st.info(AVISO)


# ------------------------------------------------------------------ Estado de sesión
ss = st.session_state
ss.setdefault("decisiones", {})
ss.setdefault("chat", [])
ss.setdefault("analisis_contrato", {})


def api_key() -> str | None:
    try:
        return st.secrets["ANTHROPIC_API_KEY"]
    except (KeyError, FileNotFoundError, Exception):
        return None


cliente = llm.crear_cliente(api_key())

# ------------------------------------------------------------------ Barra lateral: datos
with st.sidebar:
    st.title("💼 IA Financiera")
    st.caption("Fina · copiloto financiero para pymes")
    fuente = st.radio("Datos", ["Datos de ejemplo (demo)", "Mis archivos"],
                      help="La demo usa una pyme ficticia con 3 meses de movimientos, 20 facturas y 1 contrato.")
    up_csv = up_xml = up_contrato = None
    if fuente == "Mis archivos":
        up_csv = st.file_uploader("Estado de cuenta (CSV)", type=["csv"],
                                  help="Columnas: fecha, descripcion, referencia, cargo, abono, saldo (o 'monto' con signo).")
        up_xml = st.file_uploader("Facturas CFDI (XML)", type=["xml"], accept_multiple_files=True)
        up_contrato = st.file_uploader("Contrato (PDF o TXT)", type=["pdf", "txt"])
        st.caption("🔒 Tus archivos solo se procesan en esta sesión y no se guardan en disco.")
    st.divider()
    colchon = st.number_input("Colchón mínimo de efectivo ($)", min_value=0, value=10000, step=1000,
                              help="Saldo que no quieres que baje tu cuenta. Fina lo usa para sugerir fechas de pago.")
    coef = st.number_input("Coeficiente de utilidad (ISR)", min_value=0.0, max_value=1.0, value=0.15, step=0.01,
                           format="%.4f", help="Viene en tu última declaración anual. Si no lo conoces, pídeselo a tu contador.")
    ventas_est = st.toggle("Incluir ventas futuras estimadas", value=True,
                           help="Agrega cobros semanales con base en el promedio histórico (confianza baja) a partir del día 35.")
    st.divider()
    if cliente:
        st.success("Claude conectado", icon="✅")
    else:
        st.warning("Sin API key de Anthropic: el chat y el análisis con IA están desactivados. "
                   "Agrega ANTHROPIC_API_KEY en .streamlit/secrets.toml.", icon="🔑")


@st.cache_data(show_spinner=False)
def _procesar_xml(archivos: tuple[tuple[str, bytes], ...]):
    facturas, errores = [], []
    for nombre, contenido in archivos:
        try:
            facturas.append(leer_cfdi(contenido, nombre))
        except Exception as e:  # XML inválido
            errores.append(f"{nombre}: {e}")
    return facturas, errores


def cargar_datos():
    if fuente == "Datos de ejemplo (demo)":
        return cargar_ejemplo(), []
    if not up_csv or not up_xml:
        return None, []
    banco = leer_estado_cuenta(up_csv)
    facturas, errores = _procesar_xml(tuple((f.name, f.getvalue()) for f in up_xml))
    d = {"banco": banco, "facturas": facturas, "empresa": "Mi empresa",
         "contrato_nombre": up_contrato.name if up_contrato else None,
         "contrato_bytes": up_contrato.getvalue() if up_contrato else None}
    return d, errores


try:
    datos, errores_xml = cargar_datos()
except ValueError as e:
    st.error(f"No pude leer el estado de cuenta: {e}")
    st.stop()

if datos is None:
    st.title("Hola, soy Fina 👋")
    aviso()
    st.write("Para empezar, sube en la barra lateral tu **estado de cuenta (CSV)** y tus **facturas CFDI (XML)**, "
             "o cambia a **Datos de ejemplo** para ver la demo.")
    st.stop()

for e in errores_xml:
    st.warning(f"Factura no leída: {e}")

with st.sidebar:
    rfc_det = detectar_rfc_empresa(datos["facturas"])
    rfc = st.text_input("RFC de tu empresa", value=rfc_det, help="Detectado automáticamente de tus facturas.").upper().strip()
    st.caption(f"Empresa: {datos['empresa']}")


# ------------------------------------------------------------------ Cálculos
@st.cache_data(show_spinner="Conciliando movimientos…")
def calcular(banco: pd.DataFrame, facturas_df: pd.DataFrame):
    conc = conciliacion.conciliar(banco, facturas_df)
    return conc, conciliacion.resumen(conc)


fac_df = facturas_a_df(datos["facturas"], rfc)
if fac_df.empty:
    st.error("No hay facturas válidas para conciliar.")
    st.stop()
conc, res_conc = calcular(datos["banco"], fac_df)
movs = conc["movimientos"]
fecha_corte = movs["fecha"].max()
saldo_actual = float(movs["saldo"].iloc[-1]) if movs["saldo"].notna().all() else float(movs["monto"].sum())

eventos = flujo.eventos_proyectados(movs, conc["facturas"], fecha_corte, 90, ventas_est)
sugerencias, eventos_plan = flujo.planear_pagos(saldo_actual, eventos, flujo.cuentas_por_pagar(conc["facturas"]),
                                                fecha_corte, colchon, 90)
serie = flujo.serie_diaria(saldo_actual, eventos_plan, fecha_corte, 90)
horizontes = flujo.resumen_horizontes(serie, fecha_corte)
alertas = flujo.alertas_liquidez(serie, colchon)

periodos = sorted(movs["fecha"].dt.to_period("M").unique())
hoy = date.today()
fechas_sat = fiscal.proximas_fechas_sat(hoy)
deducciones = fiscal.revisar_deducciones(conc)

texto_contrato, nombre_contrato, clave_contrato = "", None, None
if datos.get("contrato_bytes"):
    nombre_contrato = datos["contrato_nombre"]
    texto_contrato = leer_contrato(nombre_contrato, datos["contrato_bytes"])
    clave_contrato = hashlib.sha1(datos["contrato_bytes"]).hexdigest()
    if clave_contrato not in ss.analisis_contrato:
        ss.analisis_contrato[clave_contrato] = {"fuente": "básico", "datos": contratos.analisis_basico(texto_contrato)}
analisis = ss.analisis_contrato.get(clave_contrato, {}).get("datos") if clave_contrato else None


# ------------------------------------------------------------------ Componente de recomendación
def tarjeta(r: dict, ctx: str = ""):
    dec = ss.decisiones.get(r["id"])
    with st.container(border=True):
        c1, c2 = st.columns([5, 1])
        c1.markdown(f"**{r['titulo']}**")
        if dec:
            clase = "ok" if dec["estado"] == "Aprobada" else "edit"
            c2.markdown(f"<span class='fina-badge {clase}'>{dec['estado']}</span>", unsafe_allow_html=True)
        else:
            c2.markdown("<span class='fina-badge pend'>Pendiente</span>", unsafe_allow_html=True)
        st.markdown(f"**¿Por qué?** {r['porque']}")
        st.markdown(f"**Acción sugerida:** {r['accion']}")
        st.caption(f"Módulo: {r['modulo']} · Confianza: {r['confianza']}")
        if dec and dec.get("nota"):
            st.caption(f"✏️ Tu corrección: {dec['nota']}")
        k = f"{ctx}_{r['id']}"
        b1, b2, _ = st.columns([1, 1, 4])
        if b1.button("✅ Aprobar", key=f"ap_{k}", width="stretch"):
            ss.decisiones[r["id"]] = {"estado": "Aprobada", "titulo": r["titulo"], "nota": "",
                                      "fecha": datetime.now().strftime("%Y-%m-%d %H:%M")}
            st.rerun()
        if b2.button("✏️ Corregir", key=f"co_{k}", width="stretch"):
            ss[f"editando_{k}"] = True
        if ss.get(f"editando_{k}"):
            with st.form(f"form_{k}"):
                nota = st.text_area("¿Qué hay que corregir? (Fina lo tomará en cuenta en el chat)")
                if st.form_submit_button("Guardar corrección"):
                    ss.decisiones[r["id"]] = {"estado": "Corregida", "titulo": r["titulo"], "nota": nota,
                                              "fecha": datetime.now().strftime("%Y-%m-%d %H:%M")}
                    ss[f"editando_{k}"] = False
                    st.rerun()


# ------------------------------------------------------------------ Pestañas
st.title("💼 IA Financiera · Fina")
st.caption(f"{datos['empresa']} · RFC {rfc} · datos al {fecha_corte:%d/%m/%Y}")

t_res, t_banca, t_fiscal, t_contr, t_recos, t_chat = st.tabs(
    ["📊 Resumen", "🏦 Banca", "🧾 Fiscal", "📄 Contratos", "✅ Recomendaciones", "💬 Chat con Fina"])

# Periodo fiscal (por defecto el último mes completo)
per_default = periodos[-2] if len(periodos) > 1 else periodos[-1]

# ================================================================== FISCAL (se calcula antes para el resumen)
with t_fiscal:
    aviso()
    periodo = st.selectbox("Mes a estimar", periodos, index=periodos.index(per_default),
                           format_func=lambda p: f"{fiscal.MESES[p.month - 1].title()} {p.year}")
imp = fiscal.estimar_impuestos(conc, periodo, coef)
fecha_pago_imp = fiscal._siguiente_habil(date(periodo.year + (periodo.month == 12), periodo.month % 12 + 1, 17))

recos = (recomendaciones.recos_flujo(sugerencias, alertas, conc["facturas"], fecha_corte)
         + recomendaciones.recos_fiscal(imp, deducciones, fecha_pago_imp)
         + recomendaciones.recos_conciliacion(conc)
         + recomendaciones.recos_contrato(analisis, nombre_contrato, hoy))
recos = list({r["id"]: r for r in recos}.values())  # sin duplicados

# ================================================================== RESUMEN
with t_res:
    aviso()
    c = st.columns(5)
    c[0].metric("Saldo en banco", dinero(saldo_actual), help=f"Al {fecha_corte:%d/%m/%Y}")
    c[1].metric("Movimientos conciliados", f"{res_conc['pct_conciliado']}%",
                help="De los movimientos que requieren factura (excluye nómina e impuestos).")
    c[2].metric("Movimientos sin factura", res_conc["sin_factura"], help=dinero(res_conc["monto_sin_factura"]))
    min90 = horizontes.iloc[2]
    c[3].metric("Saldo mínimo proyectado (90 d)", dinero(min90["Saldo mínimo"]), help=f"{min90['Fecha saldo mínimo']:%d/%m/%Y} · estimación")
    c[4].metric(f"Impuestos estimados {imp['periodo']}", dinero(max(imp['iva_neto'], 0) + imp["isr_provisional"]),
                help="IVA + ISR provisional · estimación")
    for a in alertas:
        (st.error if a["nivel"] == "error" else st.warning)(f"**Alerta de liquidez:** {a['texto']}")

    izq, der = st.columns([3, 2])
    with izq:
        st.subheader("Saldo proyectado (estimación)")
        fig = go.Figure()
        hist = movs.groupby("fecha")["saldo"].last().reset_index()
        fig.add_trace(go.Scatter(x=hist["fecha"], y=hist["saldo"], name="Histórico", line=dict(color="#2563eb")))
        fig.add_trace(go.Scatter(x=serie["fecha"], y=serie["saldo"], name="Proyección", line=dict(color="#7c3aed", dash="dash")))
        fig.add_hline(y=colchon, line_dash="dot", line_color="#f59e0b", annotation_text="Colchón mínimo")
        fig.add_hline(y=0, line_color="#dc2626", line_width=1)
        fig.update_layout(height=340, margin=dict(l=0, r=0, t=10, b=0), legend=dict(orientation="h"), yaxis_tickformat="$,.0f")
        st.plotly_chart(fig, width="stretch")
    with der:
        st.subheader("Próximas fechas SAT")
        for _, f in fechas_sat.head(4).iterrows():
            st.markdown(f"📅 **{f['Fecha']:%d/%m/%Y}** ({f['Días restantes']} días) — {f['Obligación']}")
        st.subheader("Lo más importante")
        pendientes = [r for r in recos if r["id"] not in ss.decisiones]
        for r in sorted(pendientes, key=lambda r: r["prioridad"])[:4]:
            st.markdown(f"• {r['titulo']}")
        st.caption(f"{len(pendientes)} recomendaciones pendientes de revisar en la pestaña Recomendaciones.")

# ================================================================== BANCA
with t_banca:
    aviso()
    sub1, sub2 = st.tabs(["Conciliación bancaria", "Flujo de efectivo y pagos"])
    with sub1:
        c = st.columns(4)
        c[0].metric("Movimientos", res_conc["total_movimientos"])
        c[1].metric("Conciliados", res_conc["conciliados"], f"{res_conc['pct_conciliado']}%")
        c[2].metric("Sin factura", res_conc["sin_factura"])
        c[3].metric("Confianza promedio", f"{res_conc['confianza_promedio']:.0f}%")
        st.caption("La confianza combina monto (45%), RFC/nombre de la contraparte (30%), fecha (15%) y concepto (10%). "
                   "Se detectan pagos parciales (varios depósitos para una factura) y agrupados (un depósito para varias facturas).")
        filtro = st.multiselect("Filtrar por estado", ["Conciliado", "Sin factura", "No requiere factura"],
                                default=["Conciliado", "Sin factura", "No requiere factura"])
        vista = movs[movs["estado"].isin(filtro)][["fecha", "descripcion", "cargo", "abono", "estado", "tipo_match",
                                                   "facturas", "confianza", "motivo"]]

        def _color(fila):
            col = {"Conciliado": "#dcfce7", "Sin factura": "#fee2e2", "No requiere factura": "#f1f5f9"}[fila["estado"]]
            return [f"background-color: {col}" if c == "estado" else "" for c in fila.index]

        st.dataframe(vista.style.apply(_color, axis=1), width="stretch", hide_index=True, height=420,
                     column_config={
                         "fecha": st.column_config.DateColumn("Fecha", format="DD/MM/YYYY"),
                         "descripcion": "Descripción", "cargo": st.column_config.NumberColumn("Cargo", format="dollar"),
                         "abono": st.column_config.NumberColumn("Abono", format="dollar"), "estado": "Estado",
                         "tipo_match": "Tipo", "facturas": "Factura(s)",
                         "confianza": st.column_config.ProgressColumn("Confianza", format="%d%%", min_value=0, max_value=100),
                         "motivo": "Observación"})
        st.subheader("Facturas y su estado de pago")
        st.dataframe(conc["facturas"][["folio", "fecha", "tipo", "contraparte", "concepto", "total", "pagado",
                                       "saldo_pendiente", "estado_pago", "vencimiento"]],
                     width="stretch", hide_index=True,
                     column_config={"fecha": st.column_config.DateColumn("Fecha", format="DD/MM/YYYY"),
                                    "vencimiento": st.column_config.DateColumn("Vencimiento", format="DD/MM/YYYY"),
                                    "total": st.column_config.NumberColumn("Total", format="dollar"),
                                    "pagado": st.column_config.NumberColumn("Pagado", format="dollar"),
                                    "saldo_pendiente": st.column_config.NumberColumn("Pendiente", format="dollar")})
        st.download_button("⬇️ Descargar conciliación (CSV)", movs.drop(columns=["detalle"]).to_csv(index=False).encode("utf-8-sig"),
                           "conciliacion.csv", "text/csv")
    with sub2:
        st.markdown("**Proyección de flujo de efectivo — estimación** (confianza media: basada en historial de "
                    f"{len(periodos)} meses, facturas pendientes y gastos recurrentes).")
        for a in alertas:
            (st.error if a["nivel"] == "error" else st.warning)(a["texto"])
        if not alertas:
            st.success("No se proyecta faltante de liquidez en los próximos 90 días.")
        st.dataframe(horizontes, width="stretch", hide_index=True,
                     column_config={k: st.column_config.NumberColumn(k, format="dollar")
                                    for k in ["Entradas", "Salidas", "Saldo final", "Saldo mínimo"]}
                     | {"Fecha saldo mínimo": st.column_config.DateColumn("Fecha saldo mínimo", format="DD/MM/YYYY")})
        st.subheader("Sugerencias de fechas de pago a proveedores")
        st.caption("Considera tu liquidez proyectada, el colchón mínimo y los descuentos por pronto pago. "
                   "Fina no ejecuta pagos: tú los programas en tu banca.")
        if sugerencias.empty:
            st.info("No hay facturas de proveedores pendientes de pago.")
        for r in recomendaciones.recos_flujo(sugerencias, [], conc["facturas"], fecha_corte):
            tarjeta(r, "banca")
        with st.expander("Ver movimientos proyectados (incluye recurrentes detectados)"):
            st.dataframe(eventos_plan, width="stretch", hide_index=True,
                         column_config={"fecha": st.column_config.DateColumn("Fecha", format="DD/MM/YYYY"),
                                        "monto": st.column_config.NumberColumn("Monto", format="dollar")})
            st.dataframe(flujo.detectar_recurrentes(movs).drop(columns=["clave"]), width="stretch", hide_index=True)

# ================================================================== FISCAL (contenido)
with t_fiscal:
    st.markdown(f"### Estimación de impuestos de {fiscal.MESES[periodo.month - 1]} {periodo.year} "
                f"· confianza **{imp['confianza'].lower()}**")
    st.caption("Supuestos: persona moral en régimen general; IVA sobre flujo de efectivo (lo cobrado y pagado en el mes); "
               "ISR provisional ≈ ingresos del mes × coeficiente de utilidad × 30%. El cálculo oficial es acumulado desde "
               "enero y resta pagos previos: valida con tu contador.")
    c = st.columns(3)
    c[0].metric("IVA a pagar (estimado)", dinero(imp["iva_neto"]),
                help="IVA trasladado cobrado − IVA acreditable pagado. Negativo = saldo a favor.")
    c[1].metric("ISR provisional (estimado)", dinero(imp["isr_provisional"]))
    c[2].metric("Fecha límite", f"{fecha_pago_imp:%d/%m/%Y}")
    detalle = pd.DataFrame([
        ("IVA cobrado en facturas", imp["iva_cobrado_facturas"]),
        ("IVA de ventas de mostrador sin factura (supuesto)", imp["iva_ventas_sin_factura"]),
        ("= IVA trasladado", imp["iva_trasladado"]),
        ("IVA acreditable (facturas pagadas + comisiones)", -imp["iva_acreditable"]),
        ("IVA no acreditable por requisitos (informativo)", imp["iva_no_acreditable"]),
        ("= IVA a cargo estimado", imp["iva_neto"]),
        ("Ingresos nominales del mes (sin IVA)", imp["ingresos_nominales"]),
        ("Gastos con factura del mes (sin IVA, informativo)", imp["gastos_con_factura"]),
        (f"× coeficiente de utilidad {imp['coef_utilidad']:.4f} × 30%", imp["isr_provisional"]),
    ], columns=["Concepto", "Monto"])
    st.dataframe(detalle, hide_index=True, width="stretch",
                 column_config={"Monto": st.column_config.NumberColumn(format="dollar")})
    if imp["ventas_sin_factura"] > 0:
        st.warning(f"Hay {dinero(imp['ventas_sin_factura'])} en depósitos de ventas sin factura este mes. Fina asume que "
                   "incluyen IVA; emite tu factura global para que cuadren tus ingresos con el SAT.")
    st.subheader("Posibles deducciones y pendientes")
    st.dataframe(deducciones, hide_index=True, width="stretch",
                 column_config={"Monto (sin IVA)": st.column_config.NumberColumn(format="dollar")})
    st.subheader("Próximas fechas del SAT")
    st.dataframe(fechas_sat, hide_index=True, width="stretch",
                 column_config={"Fecha": st.column_config.DateColumn(format="DD/MM/YYYY")})
    st.caption("Fuente: calendario de obligaciones del SAT (sat.gob.mx). No considera días festivos ni prórrogas; "
               "confirma siempre en el portal del SAT.")
    st.subheader("Recomendaciones fiscales")
    for r in [r for r in recos if r["modulo"] == "Fiscal"]:
        tarjeta(r, "fiscal")

# ================================================================== CONTRATOS
with t_contr:
    aviso()
    if not nombre_contrato:
        st.info("Sube un contrato (PDF o TXT) en la barra lateral para analizarlo.")
    else:
        fuente_an = ss.analisis_contrato[clave_contrato]["fuente"]
        st.markdown(f"**Contrato:** {nombre_contrato}")
        c1, c2 = st.columns([1, 3])
        if cliente:
            if c1.button("🤖 Analizar con Fina (Claude)", type="primary", width="stretch"):
                with st.spinner("Fina está leyendo el contrato… puede tardar un minuto."):
                    try:
                        res = llm.analizar_contrato(cliente, nombre_contrato, datos["contrato_bytes"], texto_contrato,
                                                    hoy.isoformat(), f"{datos['empresa']} (RFC {rfc})")
                        ss.analisis_contrato[clave_contrato] = {"fuente": "Claude", "datos": res}
                        st.rerun()
                    except (RuntimeError, ValueError) as e:
                        st.error(str(e))
        else:
            c1.button("🤖 Analizar con Fina (Claude)", disabled=True, width="stretch",
                      help="Configura ANTHROPIC_API_KEY para usar IA.")
        c2.caption("Análisis actual: " + ("**con IA (Claude)**" if fuente_an == "Claude" else
                                          "**básico por palabras clave** (menos preciso; usa el botón para el análisis con IA)"))
        a = analisis
        st.markdown(f"**Resumen:** {a['resumen']}")
        v = a["vigencia"]
        c = st.columns(4)
        c[0].metric("Inicio", v["inicio"])
        c[1].metric("Fin", v["fin"])
        c[2].metric("Renovación automática", "Sí" if v["renovacion_automatica"] else "No")
        c[3].metric("Confianza del análisis", a["confianza"].title())
        st.caption(f"Aviso de no renovación: {v['aviso_no_renovacion']}")
        icon = {"alto": "🔴", "medio": "🟠", "bajo": "🟢"}
        col1, col2 = st.columns(2)
        with col1:
            st.subheader("💸 Penalizaciones")
            for p in a["penalizaciones"]:
                st.markdown(f"{icon.get(p['riesgo'], '⚪')} **Cláusula {p['clausula']}** — {p['descripcion']} "
                            f"(_{p['monto_o_porcentaje']}_)")
            st.subheader("📅 Vencimientos y plazos")
            for x in a["vencimientos"]:
                st.markdown(f"• **{x['fecha']}** — {x['descripcion']} (cl. {x['clausula']})")
        with col2:
            st.subheader("📌 Obligaciones")
            for o in a["obligaciones"]:
                st.markdown(f"• **{o['parte']}**: {o['obligacion']} — _plazo: {o['plazo']}_ (cl. {o['clausula']})")
            st.subheader("⚖️ Requieren revisión profesional")
            for r in a["revision_profesional"]:
                st.markdown(f"{icon.get(r['riesgo'], '⚪')} **Cláusula {r['clausula']}** — {r['motivo']}")
            st.warning("Las cláusulas marcadas deben revisarse con un **abogado** antes de firmar, renovar o reclamar.")
        st.subheader("Recomendaciones sobre el contrato")
        for r in [r for r in recos if r["modulo"] == "Contratos"]:
            tarjeta(r, "contr")
        with st.expander("Ver texto del contrato"):
            st.text(texto_contrato)

# ================================================================== RECOMENDACIONES
with t_recos:
    aviso()
    aprobadas = sum(1 for r in recos if ss.decisiones.get(r["id"], {}).get("estado") == "Aprobada")
    corregidas = sum(1 for r in recos if ss.decisiones.get(r["id"], {}).get("estado") == "Corregida")
    c = st.columns(3)
    c[0].metric("Pendientes", len(recos) - aprobadas - corregidas)
    c[1].metric("Aprobadas", aprobadas)
    c[2].metric("Corregidas", corregidas)
    st.caption("Aprobar una recomendación solo registra tu decisión: Fina no ejecuta pagos ni presenta trámites.")
    mods = st.multiselect("Módulo", ["Banca", "Fiscal", "Contratos"], default=["Banca", "Fiscal", "Contratos"])
    solo_pend = st.checkbox("Solo pendientes", value=False)
    for r in sorted(recos, key=lambda r: (r["prioridad"], r["modulo"])):
        if r["modulo"] in mods and not (solo_pend and r["id"] in ss.decisiones):
            tarjeta(r, "recos")
    if ss.decisiones:
        log = pd.DataFrame([{"id": k, **v} for k, v in ss.decisiones.items()])
        st.download_button("⬇️ Descargar bitácora de decisiones (CSV)", log.to_csv(index=False).encode("utf-8-sig"),
                           "decisiones_fina.csv", "text/csv")

# ================================================================== CHAT
with t_chat:
    aviso()
    st.markdown("Pregúntale a Fina sobre **tus datos cargados** en lenguaje sencillo.")
    if not cliente:
        st.warning("Para chatear con Fina agrega tu `ANTHROPIC_API_KEY` en `.streamlit/secrets.toml` y reinicia la app.")
    else:
        sugeridas = ["¿Cómo está mi liquidez el próximo mes?", "¿Qué movimientos no tienen factura y qué hago?",
                     "¿Cuánto debo apartar para impuestos?", "¿Me conviene el descuento de Papelera del Bajío?"]
        cols = st.columns(len(sugeridas))
        pregunta_boton = None
        for col, s in zip(cols, sugeridas):
            if col.button(s, width="stretch"):
                pregunta_boton = s
        contenedor = st.container(height=480)
        for m in ss.chat:
            contenedor.chat_message(m["role"], avatar="💼" if m["role"] == "assistant" else None).markdown(m["content"])
        pregunta = st.chat_input("Escribe tu pregunta…") or pregunta_boton
        if pregunta:
            ss.chat.append({"role": "user", "content": pregunta})
            contenedor.chat_message("user").markdown(pregunta)
            ctx = recomendaciones.contexto_chat(datos["empresa"], rfc, conc, res_conc, horizontes, alertas, sugerencias,
                                                imp, fechas_sat, analisis, texto_contrato, ss.decisiones, colchon)
            with contenedor.chat_message("assistant", avatar="💼"):
                respuesta = st.write_stream(llm.chat_stream(cliente, ctx, ss.chat))
            ss.chat.append({"role": "assistant", "content": respuesta})
        if ss.chat and st.button("🗑️ Borrar conversación"):
            ss.chat = []
            st.rerun()

st.divider()
st.caption("IA Financiera es un prototipo. Las cifras son estimaciones y no constituyen asesoría fiscal, contable ni legal. "
           "Consulta a un contador público o abogado antes de tomar decisiones. Fuentes oficiales: SAT, Banxico, INEGI.")
