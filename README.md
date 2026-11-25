# IA Financiera · Fina 💼

Prototipo web (Python + Streamlit) de **Fina**, un copiloto financiero con IA para pymes en México.

> ⚠️ Todo lo que muestra la app son **estimaciones** y **no sustituye a un contador o abogado**.
> Fina **nunca ejecuta pagos, presenta declaraciones ni acepta contratos**: solo recomienda.

## Pestañas

| Pestaña | Qué hace |
|---|---|
| **Resumen** | Saldo, % conciliado, saldo mínimo proyectado, impuestos estimados, alertas y próximas fechas SAT. |
| **Banca** | Conciliación bancaria (CSV ↔ CFDI XML) con *fuzzy matching* por monto, fecha, RFC/nombre y concepto; pagos parciales y agrupados; % de confianza y movimientos sin factura. Proyección de flujo a 30/60/90 días y sugerencia de fechas de pago (liquidez, colchón mínimo y descuentos por pronto pago), con alerta de faltante. |
| **Fiscal** | Estimación de IVA (flujo de efectivo) e ISR provisional (persona moral, coeficiente de utilidad), revisión de deducciones y calendario SAT. |
| **Contratos** | Sube PDF/TXT; Claude identifica penalizaciones, vencimientos, obligaciones y cláusulas que requieren revisión profesional (con respaldo básico por palabras clave si no hay API key). |
| **Recomendaciones** | Todas las recomendaciones con su porqué y acción, cada una con botones **Aprobar** / **Corregir**, y bitácora descargable. |
| **Chat con Fina** | Preguntas en lenguaje sencillo sobre los datos cargados, respondidas por Claude con el prompt de `prompts/fina_system.md`. |

## Cómo correrlo

```bash
pip install -r requirements.txt
cp .streamlit/secrets.toml.example .streamlit/secrets.toml   # y pon tu ANTHROPIC_API_KEY
streamlit run app.py
```

Sin API key la app funciona con todo excepto el chat y el análisis de contratos con IA.

## Datos de ejemplo (ficticios)

`data/ejemplo/` contiene una pyme inventada, **Taller Gráfico Altamira, S.A. de C.V.** (RFC ficticio `TGA190214QX5`):
estado de cuenta de 3 meses (sep–nov 2026), 20 facturas CFDI 4.0 (11 emitidas, 9 recibidas) y un contrato de arrendamiento.
Incluye casos de pago parcial (A-1002), pago agrupado (A-1005 + A-1006), descuento por pronto pago (PB-5790),
una factura con uso CFDI incorrecto (MI-0342) y movimientos sin factura. Se regeneran con
`python scripts/generar_datos_ejemplo.py`.

### Formato del CSV bancario
Columnas: `fecha, descripcion, referencia, cargo, abono, saldo` (también acepta `concepto` y una columna `monto` con signo).

## Estructura

```
app.py                     # interfaz Streamlit
prompts/fina_system.md     # prompt de sistema de Fina
fina/datos.py              # lectura de CSV, CFDI XML y contratos
fina/conciliacion.py       # conciliación con fuzzy matching
fina/flujo.py              # proyección de flujo y planeación de pagos
fina/fiscal.py             # IVA, ISR, deducciones y fechas SAT
fina/contratos.py          # análisis básico de contratos (sin IA)
fina/llm.py                # integración con Claude (API de Anthropic)
fina/recomendaciones.py    # recomendaciones y contexto para el chat
```
