"""Genera los datos de ejemplo FICTICIOS de "Taller Gráfico Altamira, S.A. de C.V.".

Todo (empresa, RFC, clientes, proveedores, UUID) es inventado para el demo.
Uso:  python scripts/generar_datos_ejemplo.py
"""
from __future__ import annotations

import csv
import uuid
from datetime import date, timedelta
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "data" / "ejemplo"

EMPRESA = ("TGA190214QX5", "TALLER GRAFICO ALTAMIRA SA DE CV")

CLIENTES = {
    "HRV": ("HRV150520AB3", "HOTEL REAL DEL VALLE SA DE CV"),
    "RSN": ("RSN170811CD4", "RESTAURANTES SABOR NORTENO SA DE CV"),
    "CMA": ("CMA120903EF5", "COLEGIO MONTESSORI ARBOLEDA AC"),
    "ICA": ("ICA180122GH6", "INMOBILIARIA CUMBRES ALTAS SA DE CV"),
    "CDS": ("CDS160707JK7", "CLINICA DENTAL SONRISA PLENA SC"),
}
PROVEEDORES = {
    "PBA": ("PBA100415LM8", "PAPELERA DEL BAJIO SA DE CV"),
    "TSG": ("TSG130228NP9", "TINTAS Y SUMINISTROS GRAFICOS SA DE CV"),
    "APN": ("APN090610QR1", "ARRENDADORA PLAZA NORTE SA DE CV"),
    "MIR": ("MIR110519ST2", "MANTENIMIENTO INDUSTRIAL RUIZ SA DE CV"),
    "SCN": ("SCN200301UV3", "SOFTWARE CONTABLE NUBE SA DE CV"),
}

# (clave, tipo, serie-folio, fecha, contraparte, concepto, clave_prod, subtotal, metodo, forma, condiciones, uso)
FACTURAS = [
    # ---- Emitidas (ingresos) ----
    ("E01", "emitida", "A-1001", "2026-09-03", "HRV", "Impresion de folletos y menus de temporada", "82121500", 40000, "PUE", "03", "Contado", "G03"),
    ("E02", "emitida", "A-1002", "2026-09-10", "RSN", "Menus laminados para sucursales", "82121500", 15000, "PPD", "99", "Neto 30 dias", "G03"),
    ("E03", "emitida", "A-1003", "2026-09-17", "CMA", "Cuadernos personalizados con logotipo", "14111500", 25000, "PPD", "99", "Neto 15 dias", "G03"),
    ("E04", "emitida", "A-1004", "2026-09-24", "ICA", "Lonas para espectaculares de preventa", "82121500", 32000, "PPD", "99", "Neto 30 dias", "G03"),
    ("E05", "emitida", "A-1005", "2026-10-01", "CDS", "Tarjetas de presentacion y recetarios", "82121500", 6500, "PPD", "99", "Neto 30 dias", "G03"),
    ("E06", "emitida", "A-1006", "2026-10-08", "CDS", "Carnets de citas impresos", "82121500", 4000, "PPD", "99", "Neto 30 dias", "G03"),
    ("E07", "emitida", "A-1007", "2026-10-13", "HRV", "Senaletica interior para habitaciones", "55121700", 22000, "PPD", "99", "Neto 15 dias", "G03"),
    ("E08", "emitida", "A-1008", "2026-10-27", "CMA", "Diplomas y constancias de fin de curso", "82121500", 12000, "PUE", "03", "Contado", "G03"),
    ("E09", "emitida", "A-1009", "2026-11-12", "RSN", "Volantes promocionales", "82121500", 9000, "PPD", "99", "Neto 30 dias", "G03"),
    ("E10", "emitida", "A-1010", "2026-11-17", "HRV", "Catalogo corporativo 2027", "82121500", 48000, "PPD", "99", "Neto 30 dias", "G03"),
    ("E11", "emitida", "A-1011", "2026-11-20", "ICA", "Folletos de nuevo desarrollo", "82121500", 18000, "PPD", "99", "Neto 15 dias", "G03"),
    # ---- Recibidas (gastos) ----
    ("R01", "recibida", "PB-5521", "2026-09-04", "PBA", "Papel couche 150 g", "14111500", 18000, "PUE", "03", "Contado", "G01"),
    ("R02", "recibida", "AR-0901", "2026-09-01", "APN", "Renta de local comercial septiembre 2026", "80131500", 14000, "PUE", "03", "Contado", "G03"),
    ("R03", "recibida", "MI-0342", "2026-09-22", "MIR", "Mantenimiento preventivo a prensa offset", "73152100", 7000, "PUE", "03", "Contado", "S01"),
    ("R04", "recibida", "TS-2210", "2026-09-29", "TSG", "Tintas CMYK y barniz", "12171700", 9500, "PPD", "99", "Neto 15 dias", "G01"),
    ("R05", "recibida", "AR-1001", "2026-10-01", "APN", "Renta de local comercial octubre 2026", "80131500", 14000, "PUE", "03", "Contado", "G03"),
    ("R06", "recibida", "SC-7781", "2026-10-15", "SCN", "Suscripcion anual sistema contable", "43231500", 9000, "PUE", "04", "Contado", "G03"),
    ("R07", "recibida", "AR-1101", "2026-11-01", "APN", "Renta de local comercial noviembre 2026", "80131500", 14000, "PUE", "03", "Contado", "G03"),
    ("R08", "recibida", "PB-5790", "2026-11-16", "PBA", "Papel bond y couche para temporada navidena", "14111500", 26000, "PPD", "99",
     "Neto 30 dias. 2% de descuento por pronto pago dentro de 10 dias", "G01"),
    ("R09", "recibida", "TS-2388", "2026-11-18", "TSG", "Tintas especiales y placas", "12171700", 12000, "PPD", "99", "Neto 15 dias", "G01"),
]


def total(subtotal: float) -> float:
    return round(subtotal * 1.16, 2)


def xml_factura(f) -> str:
    clave, tipo, sf, fecha, cp, concepto, prod, sub, metodo, forma, cond, uso = f
    serie, folio = sf.split("-")
    iva = round(sub * 0.16, 2)
    tot = round(sub + iva, 2)
    if tipo == "emitida":
        em, rc = EMPRESA, CLIENTES[cp]
    else:
        em, rc = PROVEEDORES[cp], EMPRESA
    uid = str(uuid.uuid5(uuid.NAMESPACE_URL, f"ia-financiera-demo/{clave}")).upper()
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!-- CFDI DE EJEMPLO FICTICIO - SIN VALIDEZ FISCAL - SOLO PARA DEMO -->
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="{serie}" Folio="{folio}" Fecha="{fecha}T10:30:00" FormaPago="{forma}" CondicionesDePago="{cond}" SubTotal="{sub:.2f}" Moneda="MXN" Total="{tot:.2f}" TipoDeComprobante="I" Exportacion="01" MetodoPago="{metodo}" LugarExpedicion="76000">
  <cfdi:Emisor Rfc="{em[0]}" Nombre="{em[1]}" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="{rc[0]}" Nombre="{rc[1]}" DomicilioFiscalReceptor="76000" RegimenFiscalReceptor="601" UsoCFDI="{uso}"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="{prod}" Cantidad="1" ClaveUnidad="E48" Descripcion="{concepto}" ValorUnitario="{sub:.2f}" Importe="{sub:.2f}" ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="{sub:.2f}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="{iva:.2f}"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="{iva:.2f}">
    <cfdi:Traslados>
      <cfdi:Traslado Base="{sub:.2f}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="{iva:.2f}"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="{uid}" FechaTimbrado="{fecha}T10:31:00" RfcProvCertif="AAA010101AAA" SelloCFD="DEMO" NoCertificadoSAT="00000000000000000000" SelloSAT="DEMO"/>
  </cfdi:Complemento>
</cfdi:Comprobante>
"""


def movimientos() -> list[tuple[str, str, str, float, float]]:
    """(fecha, descripcion, referencia, cargo, abono)."""
    T = {f[0]: total(f[7]) for f in FACTURAS}
    m = [
        # --- Septiembre ---
        ("2026-09-01", "SPEI ENVIADO ARRENDADORA PLAZA NORTE RENTA SEP", "AR0901", T["R02"], 0),
        ("2026-09-04", "SPEI ENVIADO PAPELERA DEL BAJIO RFC PBA100415LM8", "PB5521", T["R01"], 0),
        ("2026-09-05", "DEPOSITO TPV VENTAS MOSTRADOR", "TPV0905", 0, 6380.00),
        ("2026-09-08", "SPEI RECIBIDO HOTEL REAL DEL VALLE RFC HRV150520AB3 FOLLETOS", "A1001", 0, T["E01"]),
        ("2026-09-08", "DOMICILIACION SERVICIO ELECTRICO", "LUZ0908", 3180.00, 0),
        ("2026-09-10", "CARGO TELECOM CONECTA INTERNET", "TEL0910", 1160.00, 0),
        ("2026-09-12", "DEPOSITO TPV VENTAS MOSTRADOR", "TPV0912", 0, 7540.00),
        ("2026-09-15", "PAGO NOMINA QUINCENA 17", "NOM0915", 26000.00, 0),
        ("2026-09-17", "PAGO REFERENCIADO SAT IMPUESTOS FEDERALES", "SAT0917", 9850.00, 0),
        ("2026-09-19", "DEPOSITO TPV VENTAS MOSTRADOR", "TPV0919", 0, 5220.00),
        ("2026-09-22", "SPEI ENVIADO MANTENIMIENTO IND RUIZ", "MI0342", T["R03"], 0),
        ("2026-09-26", "DEPOSITO TPV VENTAS MOSTRADOR", "TPV0926", 0, 8120.00),
        ("2026-09-29", "SPEI RECIBIDO COLEGIO MONTESSORI ARBOLEDA CUADERNOS", "A1003", 0, T["E03"]),
        ("2026-09-30", "PAGO NOMINA QUINCENA 18", "NOM0930", 26000.00, 0),
        ("2026-09-30", "COMISION MANEJO DE CUENTA", "COM09", 250.00, 0),
        ("2026-09-30", "IVA COMISION MANEJO DE CUENTA", "COM09", 40.00, 0),
        # --- Octubre ---
        ("2026-10-01", "SPEI ENVIADO ARRENDADORA PLAZA NORTE RENTA OCT", "AR1001", T["R05"], 0),
        ("2026-10-03", "DEPOSITO TPV VENTAS MOSTRADOR", "TPV1003", 0, 6960.00),
        ("2026-10-08", "DOMICILIACION SERVICIO ELECTRICO", "LUZ1008", 3420.00, 0),
        ("2026-10-09", "SPEI RECIBIDO REST SABOR NORTENO PAGO PARCIAL", "A1002", 0, 8700.00),
        ("2026-10-10", "CARGO TELECOM CONECTA INTERNET", "TEL1010", 1160.00, 0),
        ("2026-10-10", "DEPOSITO TPV VENTAS MOSTRADOR", "TPV1010", 0, 5800.00),
        ("2026-10-14", "SPEI ENVIADO TINTAS Y SUMINISTROS GRAFICOS RFC TSG130228NP9", "TS2210", T["R04"], 0),
        ("2026-10-15", "PAGO NOMINA QUINCENA 19", "NOM1015", 26000.00, 0),
        ("2026-10-15", "PAGO TARJETA SOFTWARE CONTABLE NUBE", "SC7781", T["R06"], 0),
        ("2026-10-16", "SPEI RECIBIDO INMOBILIARIA CUMBRES ALTAS", "A1004", 0, T["E04"]),
        ("2026-10-17", "DEPOSITO TPV VENTAS MOSTRADOR", "TPV1017", 0, 4930.00),
        ("2026-10-19", "PAGO REFERENCIADO SAT IMPUESTOS FEDERALES", "SAT1019", 11240.00, 0),
        ("2026-10-21", "RETIRO CAJERO AUTOMATICO", "ATM1021", 5000.00, 0),
        ("2026-10-24", "DEPOSITO TPV VENTAS MOSTRADOR", "TPV1024", 0, 7250.00),
        ("2026-10-27", "SPEI RECIBIDO HOTEL REAL DEL VALLE SENALETICA", "A1007", 0, T["E07"]),
        ("2026-10-29", "SPEI RECIBIDO COLEGIO MONTESSORI ARBOLEDA RFC CMA120903EF5", "A1008", 0, T["E08"]),
        ("2026-10-30", "PAGO NOMINA QUINCENA 20", "NOM1030", 26000.00, 0),
        ("2026-10-31", "COMISION MANEJO DE CUENTA", "COM10", 250.00, 0),
        ("2026-10-31", "IVA COMISION MANEJO DE CUENTA", "COM10", 40.00, 0),
        # --- Noviembre (hasta el 24) ---
        ("2026-11-02", "SPEI ENVIADO ARRENDADORA PLAZA NORTE RENTA NOV", "AR1101", T["R07"], 0),
        ("2026-11-03", "SPEI RECIBIDO SABOR NORTENO RSN170811CD4 RESTO FACT 1002", "A1002", 0, 8700.00),
        ("2026-11-04", "SPEI RECIBIDO CLINICA DENTAL SONRISA PLENA FACTS 1005 1006", "A1005", 0, round(T["E05"] + T["E06"], 2)),
        ("2026-11-07", "DEPOSITO TPV VENTAS MOSTRADOR", "TPV1107", 0, 6110.00),
        ("2026-11-09", "DOMICILIACION SERVICIO ELECTRICO", "LUZ1109", 3510.00, 0),
        ("2026-11-10", "CARGO TELECOM CONECTA INTERNET", "TEL1110", 1160.00, 0),
        ("2026-11-12", "DEPOSITO EN EFECTIVO SUCURSAL", "EFE1112", 0, 3500.00),
        ("2026-11-14", "DEPOSITO TPV VENTAS MOSTRADOR", "TPV1114", 0, 5480.00),
        ("2026-11-16", "PAGO NOMINA QUINCENA 21", "NOM1116", 26000.00, 0),
        ("2026-11-17", "PAGO REFERENCIADO SAT IMPUESTOS FEDERALES", "SAT1117", 10630.00, 0),
        ("2026-11-21", "DEPOSITO TPV VENTAS MOSTRADOR", "TPV1121", 0, 6740.00),
        ("2026-11-24", "COMPRA POS PAPELERIA OFFICE CENTRO", "POS1124", 1870.00, 0),
    ]
    return m


CONTRATO = """CONTRATO DE ARRENDAMIENTO DE LOCAL COMERCIAL
(DOCUMENTO FICTICIO PARA DEMOSTRACIÓN — SIN VALIDEZ LEGAL)

Que celebran por una parte ARRENDADORA PLAZA NORTE, S.A. DE C.V. (en lo sucesivo "LA ARRENDADORA"), representada por su apoderado legal, y por la otra TALLER GRÁFICO ALTAMIRA, S.A. DE C.V. (en lo sucesivo "LA ARRENDATARIA"), al tenor de las siguientes declaraciones y cláusulas.

CLÁUSULAS

PRIMERA. OBJETO. LA ARRENDADORA otorga en arrendamiento a LA ARRENDATARIA el local comercial número 14 de la Plaza Norte, ubicado en Av. de las Industrias 455, Querétaro, Qro., con una superficie de 180 m², para ser destinado exclusivamente a taller de impresión y venta de artículos de papelería.

SEGUNDA. VIGENCIA. El presente contrato tendrá una vigencia de doce meses, del 1 de enero de 2026 al 31 de diciembre de 2026. El contrato se renovará automáticamente por periodos iguales, salvo que alguna de las partes notifique por escrito su voluntad de no renovarlo con al menos 60 (sesenta) días naturales de anticipación a la fecha de terminación.

TERCERA. RENTA. LA ARRENDATARIA pagará una renta mensual de $14,000.00 (catorce mil pesos 00/100 M.N.) más el Impuesto al Valor Agregado, dentro de los primeros 5 (cinco) días naturales de cada mes, mediante transferencia electrónica a la cuenta que designe LA ARRENDADORA, contra la entrega del CFDI correspondiente.

CUARTA. INCREMENTO. En caso de renovación, la renta se incrementará en el porcentaje que resulte de la variación anual del Índice Nacional de Precios al Consumidor (INPC) publicado por el INEGI, más 3 (tres) puntos porcentuales.

QUINTA. INTERESES MORATORIOS. En caso de que LA ARRENDATARIA no pague la renta en la fecha pactada, pagará intereses moratorios a razón del 5% (cinco por ciento) mensual sobre el saldo insoluto, desde el día siguiente al vencimiento y hasta el pago total.

SEXTA. DEPÓSITO EN GARANTÍA. LA ARRENDATARIA entrega en este acto la cantidad de $28,000.00 (dos meses de renta) como depósito en garantía, que será devuelto dentro de los 90 días siguientes a la entrega del local, previa deducción de adeudos y daños.

SÉPTIMA. TERMINACIÓN ANTICIPADA. Si LA ARRENDATARIA da por terminado el contrato antes del vencimiento de su vigencia, deberá pagar como pena convencional una cantidad equivalente a 3 (tres) meses de renta vigente, sin perjuicio de las rentas adeudadas.

OCTAVA. MANTENIMIENTO Y MEJORAS. Las reparaciones menores y el mantenimiento ordinario del local correrán por cuenta de LA ARRENDATARIA. Las mejoras que realice LA ARRENDATARIA quedarán en beneficio del inmueble sin obligación de LA ARRENDADORA de pagar indemnización alguna.

NOVENA. SEGUROS. LA ARRENDATARIA se obliga a contratar y mantener vigente durante todo el arrendamiento una póliza de seguro de responsabilidad civil y contra incendio por una suma asegurada mínima de $1,500,000.00, debiendo entregar copia de la póliza a LA ARRENDADORA dentro de los primeros 15 días de vigencia de cada periodo anual.

DÉCIMA. SUBARRENDAMIENTO. LA ARRENDATARIA no podrá subarrendar ni ceder total o parcialmente los derechos del presente contrato sin consentimiento previo y por escrito de LA ARRENDADORA.

DÉCIMA PRIMERA. RENUNCIA. LA ARRENDATARIA renuncia expresamente a los derechos de preferencia y de tanto, así como a cualquier prórroga legal que le pudiera corresponder conforme a la legislación aplicable.

DÉCIMA SEGUNDA. CAUSALES DE RESCISIÓN. Serán causas de rescisión sin necesidad de declaración judicial: (a) la falta de pago de dos mensualidades consecutivas; (b) el cambio de destino del local; (c) el incumplimiento de la cláusula de seguros.

DÉCIMA TERCERA. JURISDICCIÓN. Para la interpretación y cumplimiento del presente contrato las partes se someten a la jurisdicción de los tribunales de la Ciudad de México, renunciando a cualquier otro fuero que pudiera corresponderles por razón de sus domicilios presentes o futuros.

Leído que fue el presente contrato, lo firman las partes en Querétaro, Qro., el 15 de diciembre de 2025.
"""


def main() -> None:
    fac_dir = DESTINO / "facturas"
    fac_dir.mkdir(parents=True, exist_ok=True)
    for f in FACTURAS:
        (fac_dir / f"{f[0]}_{f[2]}.xml").write_text(xml_factura(f), encoding="utf-8")

    saldo = 70000.00
    with open(DESTINO / "estado_cuenta.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["fecha", "descripcion", "referencia", "cargo", "abono", "saldo"])
        for fecha, desc, ref, cargo, abono in movimientos():
            saldo = round(saldo - cargo + abono, 2)
            w.writerow([fecha, desc, ref, f"{cargo:.2f}" if cargo else "", f"{abono:.2f}" if abono else "", f"{saldo:.2f}"])
    (DESTINO / "contrato_arrendamiento.txt").write_text(CONTRATO, encoding="utf-8")
    print(f"Saldo final: {saldo:,.2f}. Archivos en {DESTINO}")


if __name__ == "__main__":
    main()
