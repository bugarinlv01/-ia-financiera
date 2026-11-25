"""Carga de datos: estado de cuenta (CSV), facturas CFDI (XML) y contratos (PDF/texto)."""
from __future__ import annotations

import io
import re
import unicodedata
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import timedelta
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parent.parent
DIR_EJEMPLO = RAIZ / "data" / "ejemplo"


def normalizar(texto: str) -> str:
    """Mayúsculas sin acentos ni signos, para comparar textos."""
    texto = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]+", " ", texto.upper())).strip()


# ---------------------------------------------------------------- Estado de cuenta
_ALIAS = {
    "fecha": ["fecha", "fecha operacion", "fecha_operacion", "date"],
    "descripcion": ["descripcion", "concepto", "detalle", "description"],
    "referencia": ["referencia", "ref", "folio"],
    "cargo": ["cargo", "cargos", "retiro", "retiros", "debito"],
    "abono": ["abono", "abonos", "deposito", "depositos", "credito"],
    "saldo": ["saldo", "balance"],
    "monto": ["monto", "importe", "amount"],
}


def _num(serie: pd.Series) -> pd.Series:
    return pd.to_numeric(
        serie.astype(str).str.replace(r"[\$,\s]", "", regex=True).replace({"": None, "nan": None, "None": None}),
        errors="coerce",
    ).fillna(0.0)


def leer_estado_cuenta(fuente) -> pd.DataFrame:
    """Lee un CSV bancario con columnas flexibles (cargo/abono o monto con signo)."""
    crudo = pd.read_csv(fuente, dtype=str, encoding="utf-8-sig")
    cols = {normalizar(c).lower(): c for c in crudo.columns}
    mapeo = {}
    for destino, alias in _ALIAS.items():
        for a in alias:
            if a in cols:
                mapeo[cols[a]] = destino
                break
    df = crudo.rename(columns=mapeo)
    if "fecha" not in df or "descripcion" not in df:
        raise ValueError("El CSV debe tener al menos columnas 'fecha' y 'descripcion' (o 'concepto').")
    if "cargo" not in df and "abono" not in df:
        if "monto" not in df:
            raise ValueError("El CSV debe tener columnas 'cargo'/'abono' o una columna 'monto' con signo.")
        monto = _num(df["monto"])
        df["cargo"] = (-monto).clip(lower=0)
        df["abono"] = monto.clip(lower=0)
    for c in ("cargo", "abono"):
        df[c] = _num(df[c]) if c in df else 0.0
    df["fecha"] = pd.to_datetime(df["fecha"], dayfirst=False, errors="coerce")
    if df["fecha"].isna().any():
        df["fecha"] = pd.to_datetime(crudo[[k for k, v in mapeo.items() if v == "fecha"][0]], dayfirst=True, errors="coerce")
    df = df.dropna(subset=["fecha"])
    if "referencia" not in df:
        df["referencia"] = ""
    df["referencia"] = df["referencia"].fillna("")
    df["saldo"] = _num(df["saldo"]) if "saldo" in df else float("nan")
    df = df.sort_values("fecha", kind="stable").reset_index(drop=True)
    df["id_mov"] = [f"M{i + 1:03d}" for i in range(len(df))]
    df["monto"] = df["abono"] - df["cargo"]
    df["tipo"] = df["monto"].apply(lambda x: "abono" if x > 0 else "cargo")
    return df[["id_mov", "fecha", "descripcion", "referencia", "cargo", "abono", "monto", "tipo", "saldo"]]


# ---------------------------------------------------------------- CFDI
@dataclass
class Factura:
    uuid: str
    serie_folio: str
    fecha: pd.Timestamp
    emisor_rfc: str
    emisor_nombre: str
    receptor_rfc: str
    receptor_nombre: str
    subtotal: float
    iva: float
    total: float
    metodo_pago: str
    forma_pago: str
    uso_cfdi: str
    condiciones: str
    concepto: str
    tipo_comprobante: str
    archivo: str = ""
    extra: dict = field(default_factory=dict)


def _local(tag: str) -> str:
    return tag.split("}")[-1]


def leer_cfdi(contenido: bytes | str, archivo: str = "") -> Factura:
    raiz = ET.fromstring(contenido.encode() if isinstance(contenido, str) else contenido)
    if _local(raiz.tag) != "Comprobante":
        raise ValueError(f"{archivo}: no parece un CFDI (falta nodo Comprobante)")
    a = raiz.attrib
    emisor = receptor = {}
    conceptos, iva, uuid = [], 0.0, ""
    for nodo in raiz:
        n = _local(nodo.tag)
        if n == "Emisor":
            emisor = nodo.attrib
        elif n == "Receptor":
            receptor = nodo.attrib
        elif n == "Conceptos":
            conceptos = [c.attrib.get("Descripcion", "") for c in nodo]
        elif n == "Impuestos":
            iva = float(nodo.attrib.get("TotalImpuestosTrasladados", 0) or 0)
        elif n == "Complemento":
            for c in nodo.iter():
                if _local(c.tag) == "TimbreFiscalDigital":
                    uuid = c.attrib.get("UUID", "")
    serie_folio = "-".join(x for x in (a.get("Serie", ""), a.get("Folio", "")) if x)
    return Factura(
        uuid=uuid or f"SIN-UUID-{archivo}",
        serie_folio=serie_folio or archivo,
        fecha=pd.to_datetime(a.get("Fecha", "")[:10], errors="coerce"),
        emisor_rfc=emisor.get("Rfc", "").upper(),
        emisor_nombre=emisor.get("Nombre", ""),
        receptor_rfc=receptor.get("Rfc", "").upper(),
        receptor_nombre=receptor.get("Nombre", ""),
        subtotal=float(a.get("SubTotal", 0) or 0),
        iva=iva,
        total=float(a.get("Total", 0) or 0),
        metodo_pago=a.get("MetodoPago", ""),
        forma_pago=a.get("FormaPago", ""),
        uso_cfdi=receptor.get("UsoCFDI", ""),
        condiciones=a.get("CondicionesDePago", ""),
        concepto="; ".join(conceptos),
        tipo_comprobante=a.get("TipoDeComprobante", "I"),
        archivo=archivo,
    )


def condiciones_pago(texto: str, fecha: pd.Timestamp) -> dict:
    """Interpreta 'Neto 30 días. 2% de descuento por pronto pago dentro de 10 días'."""
    t = normalizar(texto).lower()
    dias = 0
    m = re.search(r"neto\s*(\d+)", t) or re.search(r"(\d+)\s*dias", t)
    if m:
        dias = int(m.group(1))
    desc_pct, desc_dias = 0.0, 0
    pct = re.search(r"(\d+(?:[.,]\d+)?)\s*%", texto or "")
    if pct and "descuento" in t:
        desc_pct = float(pct.group(1).replace(",", ".")) / 100
        md = re.search(r"dentro de\s*(\d+)\s*dias", t) or re.search(r"(\d+)\s*dias", t[t.find("descuento"):])
        desc_dias = int(md.group(1)) if md else 0
    return {
        "dias_credito": dias,
        "vencimiento": fecha + timedelta(days=dias),
        "descuento_pct": desc_pct,
        "fecha_limite_descuento": fecha + timedelta(days=desc_dias) if desc_pct else pd.NaT,
    }


def facturas_a_df(facturas: list[Factura], rfc_empresa: str) -> pd.DataFrame:
    filas = []
    rfc_empresa = rfc_empresa.upper().strip()
    for f in facturas:
        if f.emisor_rfc == rfc_empresa:
            tipo, cp_rfc, cp_nombre = "emitida", f.receptor_rfc, f.receptor_nombre
        elif f.receptor_rfc == rfc_empresa:
            tipo, cp_rfc, cp_nombre = "recibida", f.emisor_rfc, f.emisor_nombre
        else:
            tipo, cp_rfc, cp_nombre = "ajena", f.emisor_rfc, f.emisor_nombre
        cond = condiciones_pago(f.condiciones, f.fecha)
        filas.append({
            "uuid": f.uuid, "folio": f.serie_folio, "fecha": f.fecha, "tipo": tipo,
            "rfc_contraparte": cp_rfc, "contraparte": cp_nombre, "concepto": f.concepto,
            "subtotal": f.subtotal, "iva": f.iva, "total": f.total,
            "metodo_pago": f.metodo_pago, "forma_pago": f.forma_pago, "uso_cfdi": f.uso_cfdi,
            "condiciones": f.condiciones, "vencimiento": cond["vencimiento"],
            "descuento_pct": cond["descuento_pct"], "fecha_limite_descuento": cond["fecha_limite_descuento"],
            "archivo": f.archivo,
        })
    df = pd.DataFrame(filas)
    if not df.empty:
        df = df.sort_values("fecha").reset_index(drop=True)
    return df


def detectar_rfc_empresa(facturas: list[Factura]) -> str:
    """El RFC que más aparece (como emisor o receptor) es casi siempre el del usuario."""
    conteo: dict[str, int] = {}
    for f in facturas:
        for r in (f.emisor_rfc, f.receptor_rfc):
            conteo[r] = conteo.get(r, 0) + 1
    return max(conteo, key=conteo.get) if conteo else ""


# ---------------------------------------------------------------- Contratos
def leer_contrato(nombre: str, contenido: bytes) -> str:
    """Extrae texto de PDF o TXT (para el análisis básico y el chat)."""
    if nombre.lower().endswith(".pdf"):
        from pypdf import PdfReader

        lector = PdfReader(io.BytesIO(contenido))
        return "\n".join((p.extract_text() or "") for p in lector.pages)
    for enc in ("utf-8", "latin-1"):
        try:
            return contenido.decode(enc)
        except UnicodeDecodeError:
            continue
    return contenido.decode("utf-8", "ignore")


# ---------------------------------------------------------------- Datos de ejemplo
def cargar_ejemplo() -> dict:
    banco = leer_estado_cuenta(DIR_EJEMPLO / "estado_cuenta.csv")
    facturas = [leer_cfdi(p.read_bytes(), p.name) for p in sorted((DIR_EJEMPLO / "facturas").glob("*.xml"))]
    ruta_contrato = DIR_EJEMPLO / "contrato_arrendamiento.txt"
    return {
        "banco": banco,
        "facturas": facturas,
        "contrato_nombre": ruta_contrato.name,
        "contrato_bytes": ruta_contrato.read_bytes(),
        "empresa": "Taller Gráfico Altamira, S.A. de C.V. (ficticia)",
    }
