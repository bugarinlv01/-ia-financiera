# Contadín · copiloto financiero para pymes en México

> *Tus finanzas claras, tus decisiones inteligentes.*

App web (React + Vite + Express) con **Claude** (API de Anthropic) como asistente.
Diseño original de la interfaz: compañero del equipo. Integración con Claude, motor de recomendaciones
y conciliación con pagos parciales: este repositorio.

> ⚠️ Todo lo que muestra Contadín son **estimaciones** y no sustituye a un contador o abogado.
> Contadín **nunca ejecuta pagos, presenta declaraciones ni acepta contratos**: solo recomienda.

## Módulos

- **Dashboard**: saldo, ingresos/gastos, alertas y recomendaciones con botones **Aprobar / Corregir**.
- **Conciliación bancaria**: CSV/XML (CFDI 4.0) o PDF; coincidencias por monto, fecha, contraparte y concepto, con pagos parciales y agrupados; confirmar/rechazar/corregir cada una.
- **Planeación de pagos**: proyección a 30/60/90 días, alerta de faltante y estrategia calculada (recorrer pagos sin pasar su vencimiento, cuándo conviene el descuento por pronto pago). *Aprobar* solo actualiza el plan en la app.
- **Asistencia fiscal**: estimación de IVA/ISR, calendario SAT y preguntas con búsqueda en fuentes oficiales.
- **Contratos**: análisis de PDF/TXT con Claude (penalizaciones, vencimientos, obligaciones, cláusulas a revisar con abogado).
- **Chat con Contadín**: agente con herramientas de cálculo (flujo, impuestos, auditoría de riesgos) y búsqueda web limitada a sitios oficiales (sat.gob.mx, dof.gob.mx…).

El prompt de sistema está en `prompts/contadin_system.md`.

## Correr en tu computadora (Mac/Windows/Linux)

Requiere Node.js 20 o más reciente (https://nodejs.org).

```bash
cd contadin
cp .env.example .env        # y pon tu ANTHROPIC_API_KEY
npm install
npm run dev                 # http://localhost:3000
```

## Publicar en internet (Render, gratis)

1. Entra a https://render.com con tu cuenta de GitHub → **New → Web Service** → elige este repositorio.
2. **Root Directory**: `contadin`
3. **Build Command**: `npm install && npm run build`
4. **Start Command**: `npm start`
5. En **Environment** agrega `ANTHROPIC_API_KEY` con tu key (es un campo de texto normal, sin comillas).
6. **Create Web Service**. Te da un link `https://….onrender.com` que abre en cualquier navegador (iPad incluido).

La API key vive solo en el servidor; los visitantes no la ven, pero cada consulta a la IA se cobra a tu cuenta:
pon un límite de gasto en https://console.anthropic.com (Settings → Limits).
