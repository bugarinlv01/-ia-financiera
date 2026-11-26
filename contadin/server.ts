import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MODEL = "claude-opus-5-5";
// Si el modelo declina una solicitud, el API la reintenta con un modelo de respaldo.
const BETAS: Anthropic.Beta.AnthropicBeta[] = ["server-side-fallback-2026-07-01"];
// Búsqueda web solo en fuentes oficiales mexicanas.
const DOMINIOS_OFICIALES = [
  "sat.gob.mx",
  "dof.gob.mx",
  "diputados.gob.mx",
  "banxico.org.mx",
  "inegi.org.mx",
  "gob.mx",
];
const WEB_SEARCH_TOOL: Anthropic.Beta.BetaWebSearchTool20260209 = {
  type: "web_search_20260209",
  name: "web_search",
  max_uses: 4,
  allowed_domains: DOMINIOS_OFICIALES,
  user_location: { type: "approximate", country: "MX" },
};

class ApiKeyMissing extends Error {}

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "MY_ANTHROPIC_API_KEY") throw new ApiKeyMissing();
  if (!cachedClient) cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

function mapError(err: unknown): { status: number; message: string } {
  if (err instanceof ApiKeyMissing) {
    return {
      status: 503,
      message:
        "No se encontró la API key de Anthropic en el servidor. Configura la variable de entorno ANTHROPIC_API_KEY.",
    };
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return {
      status: 403,
      message: "La API key de Anthropic no es válida o no tiene permisos. Revisa ANTHROPIC_API_KEY.",
    };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return {
      status: 429,
      message: "Se alcanzó el límite temporal de consultas. Intenta de nuevo en unos segundos.",
    };
  }
  if (err instanceof Anthropic.BadRequestError) {
    return { status: 400, message: "La solicitud al asistente no es válida. Intenta con otro archivo o pregunta." };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { status: 502, message: "No hay conexión con el servicio de IA. Intenta de nuevo." };
  }
  console.error(err);
  return { status: 500, message: "No fue posible procesar la consulta con el asistente en este momento. Intenta de nuevo." };
}

// Prompt de sistema base (definido por el equipo) + notas operativas de la app.
const PROMPT_BASE = fs.readFileSync(path.join(__dirname, "prompts", "contadin_system.md"), "utf8").trim();
const CONTADIN_SYSTEM = `${PROMPT_BASE}

Notas de operación dentro de la app Contadín:
- Recibes el contexto financiero vivo de la empresa (saldos, conciliación, pagos programados, impuestos estimados, calendario SAT, contrato activo). Si "isDemoMode" es true, aclara que son datos de demostración.
- Para cifras usa tus herramientas de cálculo (simular_flujo_caja, calcular_indicadores_y_impuestos, auditar_riesgos_empresa) en lugar de calcular de memoria. Cuando muestres un cálculo incluye: datos usados, fórmula y resultado en MXN.
- Para confirmar fechas, tasas o disposiciones fiscales vigentes usa la búsqueda web (limitada a fuentes oficiales como sat.gob.mx y dof.gob.mx) y menciona la fuente y la fecha de consulta. Si no puedes confirmarlo, dilo y sugiere verificar con un contador.
- Si mencionas una fecha límite, tasa o regla del SAT, verifícala con la búsqueda en fuentes oficiales antes de afirmarla y cita la fuente; no te limites al calendario interno de la app.
- Formato: Markdown breve; empieza con la conclusión en una o dos frases y luego el detalle.
- Extensión: prioriza lo esencial (idealmente menos de 250 palabras) y ofrece ampliar si el usuario quiere más detalle.`;

// Herramientas de cálculo del agente (se ejecutan en este servidor de forma determinista).
const AGENT_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "simular_flujo_caja",
    description:
      "Simula de manera determinista el flujo de efectivo de la empresa a 30, 60 o 90 días a partir de los pagos programados e ingresos esperados del contexto. Permite probar el impacto de un ingreso o gasto adicional.",
    input_schema: {
      type: "object",
      properties: {
        horizonteDias: { type: "integer", enum: [30, 60, 90], description: "Horizonte de simulación en días." },
        ajusteExtraMXN: {
          type: "number",
          description: "Opcional. Monto positivo (ingreso adicional) o negativo (gasto adicional) para un escenario hipotético.",
        },
        descripcionAjuste: { type: "string", description: "Opcional. Descripción breve del ajuste simulado." },
      },
      required: ["horizonteDias"],
    },
  },
  {
    name: "calcular_indicadores_y_impuestos",
    description:
      "Calcula indicadores financieros (margen, días de cobertura de caja), la estimación preliminar de IVA a cargo e ISR provisional, o un descuento/interés puntual.",
    input_schema: {
      type: "object",
      properties: {
        tipoCalculo: {
          type: "string",
          enum: ["salud_financiera", "impuestos_estimados", "descuento_pronto_pago", "interes_moratorio"],
        },
        montoBase: { type: "number", description: "Monto base en MXN para descuento o interés." },
        tasaPorcentaje: { type: "number", description: "Tasa porcentual (ej. 4 para 4%)." },
        periodos: { type: "number", description: "Número de meses o periodos, si aplica." },
      },
      required: ["tipoCalculo"],
    },
  },
  {
    name: "auditar_riesgos_empresa",
    description:
      "Revisa los datos actuales de la empresa para detectar alertas: brechas de liquidez, movimientos sin conciliar, vencimientos fiscales próximos y cláusulas contractuales de atención media o alta.",
    input_schema: {
      type: "object",
      properties: {
        enfoque: { type: "string", enum: ["general", "liquidez", "conciliacion", "fiscal", "contratos"] },
      },
      required: ["enfoque"],
    },
  },
];

type Params = Omit<Anthropic.Beta.MessageCreateParamsNonStreaming, "model" | "max_tokens"> & { max_tokens?: number };

/** Llama a Claude en streaming (evita timeouts en respuestas largas) y devuelve el mensaje completo. */
async function callClaude(params: Params): Promise<Anthropic.Beta.BetaMessage> {
  const client = getClient();
  return client.beta.messages
    .stream({
      model: MODEL,
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      betas: BETAS,
      fallbacks: "default",
      ...params,
    })
    .finalMessage();
}

function textoDe(msg: Anthropic.Beta.BetaMessage): string {
  return msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

function fuentesDe(msg: Anthropic.Beta.BetaMessage, acumuladas: Array<{ title: string; uri: string }>) {
  const agregar = (uri?: string | null, title?: string | null) => {
    if (uri && /^https?:\/\//i.test(uri) && !acumuladas.some((s) => s.uri === uri)) {
      acumuladas.push({ title: title || "Fuente oficial", uri });
    }
  };
  for (const b of msg.content) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content) agregar(r.url, r.title);
    }
    if (b.type === "text") {
      for (const c of b.citations ?? []) {
        if (c.type === "web_search_result_location") agregar(c.url, c.title);
      }
    }
  }
}

/** Valida y parsea la salida JSON de una respuesta con output_config.format. */
function jsonDe<T>(msg: Anthropic.Beta.BetaMessage): T {
  if (msg.stop_reason === "refusal") throw new Error("REFUSAL");
  if (msg.stop_reason === "max_tokens") throw new Error("MAX_TOKENS");
  return JSON.parse(textoDe(msg)) as T;
}

function documentoBloque(
  base64Pdf: string | undefined,
  texto: string | undefined,
  titulo: string
): Anthropic.Beta.BetaRequestDocumentBlock | null {
  if (base64Pdf) {
    return { type: "document", title: titulo, source: { type: "base64", media_type: "application/pdf", data: base64Pdf } };
  }
  if (texto) {
    return { type: "document", title: titulo, source: { type: "text", media_type: "text/plain", data: texto } };
  }
  return null;
}

interface FinancialContextPayload {
  isDemoMode?: boolean;
  fechaReferencia?: string;
  empresa?: {
    nombre?: string;
    saldoDisponibleMXN?: number;
    umbralReservaMinimaMXN?: number;
  };
  resumenMensualMXN?: {
    ingresosMes?: number;
    gastosMes?: number;
    flujoNetoMes?: number;
    ivaTrasladado?: number;
    ivaAcreditable?: number;
    ivaEstimadoAPagar?: number;
    isrProvisionalEstimado?: number;
    coeficienteUtilidadDemo?: number;
  };
  conciliacionBancaria?: {
    totalMovimientosBanco?: number;
    conciliadosConfirmados?: number;
    porcentajeConciliacion?: number;
    pendientesOConDiferencia?: Array<{
      razon?: string;
      diferenciaMXN?: number;
      clasificacion?: string;
    }>;
  };
  planeacionPagos30Dias?: {
    saldoMinimoProyectadoMXN?: number;
    fechaSaldoMinimo?: string;
    saldoFinalProyectado30dMXN?: number;
    ahorroPotencialProntoPagoMXN?: number;
    proximosCompromisos?: Array<{
      concepto?: string;
      tipo?: string;
      montoMXN?: number;
      fechaProgramada?: string;
      vencimiento?: string;
      prioridad?: string;
      descuentoProntoPagoPct?: number;
    }>;
  };
  calendarioFiscal?: Array<{
    titulo?: string;
    fechaLimite?: string;
    estado?: string;
  }>;
  contratoActivo?: {
    titulo?: string;
    vigencia?: string;
    condicionesPago?: string;
    hallazgos?: Array<{
      elemento?: string;
      nivelAtencion?: string;
      descripcion?: string;
      recomendacion?: string;
    }>;
  } | null;
}

function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
  ctx: FinancialContextPayload
): Record<string, unknown> {
  const saldo = Number(ctx.empresa?.saldoDisponibleMXN ?? 0);
  const umbral = Number(ctx.empresa?.umbralReservaMinimaMXN ?? 0);
  const ingresos = Number(ctx.resumenMensualMXN?.ingresosMes ?? 0);
  const gastos = Number(ctx.resumenMensualMXN?.gastosMes ?? 0);

  if (name === "simular_flujo_caja") {
    const horizonte = [30, 60, 90].includes(Number(args.horizonteDias))
      ? Number(args.horizonteDias)
      : 30;
    const ajuste = Number(args.ajusteExtraMXN ?? 0) || 0;
    const compromisos = ctx.planeacionPagos30Dias?.proximosCompromisos ?? [];

    const fechaBase = ctx.fechaReferencia || new Date().toISOString().slice(0, 10);
    const start = new Date(fechaBase);
    const limit = new Date(start);
    limit.setDate(limit.getDate() + horizonte);
    const limitIso = limit.toISOString().slice(0, 10);

    const ordenados = compromisos
      .filter((c) => (c.fechaProgramada || "") <= limitIso)
      .sort((a, b) =>
        (a.fechaProgramada || "").localeCompare(b.fechaProgramada || "")
      );

    let running = saldo + ajuste;
    let minSaldo = running;
    let fechaMin = fechaBase;
    let totalEntradas = ajuste > 0 ? ajuste : 0;
    let totalSalidas = ajuste < 0 ? Math.abs(ajuste) : 0;

    const eventosCriticos: Array<{
      fecha: string;
      concepto: string;
      tipo: string;
      monto: number;
      saldoResultante: number;
    }> = [];

    for (const c of ordenados) {
      const m = Number(c.montoMXN ?? 0);
      if (c.tipo === "ingreso_esperado") {
        running += m;
        totalEntradas += m;
      } else {
        running -= m;
        totalSalidas += m;
      }
      if (running < minSaldo) {
        minSaldo = running;
        fechaMin = c.fechaProgramada || fechaMin;
      }
      eventosCriticos.push({
        fecha: c.fechaProgramada || "",
        concepto: c.concepto || "",
        tipo: c.tipo || "",
        monto: m,
        saldoResultante: Number(running.toFixed(2)),
      });
    }

    return {
      horizonteDias: horizonte,
      saldoInicialMXN: saldo,
      ajusteSimuladoMXN: ajuste,
      descripcionAjuste: args.descripcionAjuste || null,
      totalIngresosEsperadosMXN: Number(totalEntradas.toFixed(2)),
      totalEgresosProgramadosMXN: Number(totalSalidas.toFixed(2)),
      saldoFinalProyectadoMXN: Number(running.toFixed(2)),
      saldoMinimoProyectadoMXN: Number(minSaldo.toFixed(2)),
      fechaSaldoMinimo: fechaMin,
      umbralReservaMinimaMXN: umbral,
      alertaDebajoUmbral: minSaldo < umbral,
      faltanteNegativo: minSaldo < 0,
      lineaEventos: eventosCriticos,
    };
  }

  if (name === "calcular_indicadores_y_impuestos") {
    const tipo = String(args.tipoCalculo || "salud_financiera");
    if (tipo === "impuestos_estimados") {
      const ivaT = Number(ctx.resumenMensualMXN?.ivaTrasladado ?? 0);
      const ivaA = Number(ctx.resumenMensualMXN?.ivaAcreditable ?? 0);
      const ivaNeto = Math.max(0, Number((ivaT - ivaA).toFixed(2)));
      const coef = Number(ctx.resumenMensualMXN?.coeficienteUtilidadDemo ?? 0.12);
      const utilidadEst = Number((ingresos * coef).toFixed(2));
      const isrEst = Number((utilidadEst * 0.3).toFixed(2));
      return {
        nota: "Estimación preliminar basada en los CFDI y movimientos registrados; no sustituye declaración ante el SAT.",
        ivaTrasladadoMXN: ivaT,
        ivaAcreditableMXN: ivaA,
        formulaIVA: "IVA a cargo estimado = MAX(0, IVA trasladado - IVA acreditable)",
        ivaEstimadoMXN: ivaNeto,
        ingresosMesMXN: ingresos,
        coeficienteUtilidadUsado: coef,
        utilidadFiscalEstimadaMXN: utilidadEst,
        formulaISR: "ISR provisional estimado = (Ingresos del mes * Coeficiente utilidad) * 30%",
        isrEstimadoMXN: isrEst,
        totalImpuestosEstimadosMXN: Number((ivaNeto + isrEst).toFixed(2)),
      };
    }

    if (tipo === "descuento_pronto_pago" || tipo === "interes_moratorio") {
      const base = Number(args.montoBase ?? 0);
      const tasa = Number(args.tasaPorcentaje ?? 0);
      const periodos = Math.max(1, Number(args.periodos ?? 1));
      const delta = Number((base * (tasa / 100) * periodos).toFixed(2));
      return {
        tipoCalculo: tipo,
        montoBaseMXN: base,
        tasaPorcentaje: tasa,
        periodos,
        variacionMXN: delta,
        montoFinalMXN:
          tipo === "descuento_pronto_pago"
            ? Number((base - delta).toFixed(2))
            : Number((base + delta).toFixed(2)),
      };
    }

    const flujoNeto = Number((ingresos - gastos).toFixed(2));
    const margenPct =
      ingresos > 0 ? Number(((flujoNeto / ingresos) * 100).toFixed(2)) : 0;
    const gastoDiarioProm = gastos > 0 ? Number((gastos / 30).toFixed(2)) : 0;
    const diasCobertura =
      gastoDiarioProm > 0 ? Number((saldo / gastoDiarioProm).toFixed(1)) : 0;
    return {
      saldoDisponibleMXN: saldo,
      ingresosMesMXN: ingresos,
      gastosMesMXN: gastos,
      flujoNetoMesMXN: flujoNeto,
      margenOperativoPct: margenPct,
      gastoDiarioPromedioMXN: gastoDiarioProm,
      diasCoberturaCaja: diasCobertura,
      excedenteSobreReservaMXN: Number((saldo - umbral).toFixed(2)),
    };
  }

  if (name === "auditar_riesgos_empresa") {
    const enfoque = String(args.enfoque || "general");
    const min30 = Number(ctx.planeacionPagos30Dias?.saldoMinimoProyectadoMXN ?? saldo);
    const pendientesConcil =
      ctx.conciliacionBancaria?.pendientesOConDiferencia ?? [];
    const obligacionesPend = (ctx.calendarioFiscal ?? []).filter(
      (o) => o.estado !== "completada"
    );
    const hallazgosAltosMedios = (ctx.contratoActivo?.hallazgos ?? []).filter(
      (h) => h.nivelAtencion === "alto" || h.nivelAtencion === "medio"
    );

    return {
      enfoque,
      riesgoLiquidez: {
        activo: min30 < umbral,
        saldoMinimo30dMXN: min30,
        fechaSaldoMinimo: ctx.planeacionPagos30Dias?.fechaSaldoMinimo,
        umbralReservaMXN: umbral,
      },
      riesgoConciliacion: {
        porcentajeConciliado: ctx.conciliacionBancaria?.porcentajeConciliacion ?? 0,
        movimientosPorAtender: pendientesConcil,
      },
      riesgoFiscal: {
        obligacionesPendientes: obligacionesPend,
      },
      riesgoContractual: {
        contrato: ctx.contratoActivo?.titulo ?? "Ninguno",
        hallazgosRelevantes: hallazgosAltosMedios,
      },
    };
  }

  return { error: "Herramienta no reconocida" };
}

const ESQUEMA_CONTRATO = {
  type: "object",
  additionalProperties: false,
  required: ["titulo", "partes", "vigencia", "condicionesPago", "resumenEjecutivo", "hallazgos"],
  properties: {
    titulo: { type: "string", description: "Título descriptivo del contrato" },
    partes: { type: "string", description: "Partes firmantes identificadas" },
    vigencia: { type: "string", description: "Fechas o plazo de vigencia" },
    condicionesPago: { type: "string", description: "Montos, moneda y plazos de pago" },
    resumenEjecutivo: { type: "string", description: "Resumen ejecutivo claro en español" },
    hallazgos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["elemento", "descripcion", "nivelAtencion", "recomendacion"],
        properties: {
          elemento: { type: "string", description: "Tipo o nombre de la cláusula u obligación, con número de cláusula" },
          descripcion: { type: "string", description: "Descripción concreta encontrada en el contrato" },
          nivelAtencion: { type: "string", enum: ["bajo", "medio", "alto"] },
          recomendacion: { type: "string", description: "Por qué importa y acción concreta que el usuario puede aprobar o corregir" },
        },
      },
    },
  },
};

const ESQUEMA_FACTURA = {
  type: "object",
  additionalProperties: false,
  required: ["folio", "uuid", "fecha", "contraparte", "rfc", "tipo", "subtotal", "iva", "total", "concepto"],
  properties: {
    folio: { type: "string" },
    uuid: { type: "string" },
    fecha: { type: "string", description: "Formato YYYY-MM-DD" },
    contraparte: { type: "string", description: "Razón social del emisor o receptor (la contraparte)" },
    rfc: { type: "string" },
    tipo: { type: "string", enum: ["emitida", "recibida"] },
    subtotal: { type: "number" },
    iva: { type: "number" },
    total: { type: "number" },
    concepto: { type: "string" },
  },
};

const ESQUEMA_MOVIMIENTOS = {
  type: "object",
  additionalProperties: false,
  required: ["movimientos"],
  properties: {
    movimientos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fecha", "concepto", "referencia", "contraparte", "tipo", "monto"],
        properties: {
          fecha: { type: "string", description: "Formato YYYY-MM-DD" },
          concepto: { type: "string" },
          referencia: { type: "string" },
          contraparte: { type: "string" },
          tipo: { type: "string", enum: ["abono", "cargo"] },
          monto: { type: "number", description: "Monto positivo en MXN" },
        },
      },
    },
  },
};

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "15mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "contadin-api", iaConfigurada: Boolean(process.env.ANTHROPIC_API_KEY) });
  });

  // 1. Chat con Contadín: agente con herramientas de cálculo + búsqueda en fuentes oficiales
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history, financialContext, sessionMemory } = req.body ?? {};
      if (typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "Escribe una pregunta válida para Contadín." });
      }
      if (message.length > 4000) {
        return res.status(400).json({ error: "El mensaje excede el límite permitido de 4,000 caracteres." });
      }

      const safeCtx: FinancialContextPayload =
        financialContext && typeof financialContext === "object" ? (financialContext as FinancialContextPayload) : {};
      const notas = Array.isArray(sessionMemory)
        ? sessionMemory.filter((s): s is string => typeof s === "string").slice(-15)
        : [];
      const currentDate = new Date().toISOString().slice(0, 10);

      // Historial como turnos reales, alternando usuario/asistente y empezando por el usuario
      const messages: Anthropic.Beta.BetaMessageParam[] = [];
      const historial = Array.isArray(history) ? history.slice(-16) : [];
      for (const item of historial) {
        if (!item || typeof item.content !== "string" || !item.content.trim()) continue;
        const role = item.role === "assistant" ? "assistant" : item.role === "user" ? "user" : null;
        if (!role) continue;
        const ultimo = messages[messages.length - 1];
        if (!ultimo && role === "assistant") continue;
        if (ultimo && ultimo.role === role) {
          ultimo.content = `${ultimo.content as string}\n\n${item.content}`;
        } else {
          messages.push({ role, content: item.content });
        }
      }
      if (messages.length && messages[messages.length - 1].role === "user") messages.pop();

      messages.push({
        role: "user",
        content: `FECHA ACTUAL: ${currentDate}

NOTAS DE LA SESIÓN (preferencias y datos que compartió el usuario):
${notas.length ? notas.map((n) => `- ${n}`).join("\n") : "- Sin notas."}

CONTEXTO FINANCIERO DE LA EMPRESA EN LA APP:
${JSON.stringify(safeCtx, null, 2)}

PREGUNTA DEL USUARIO:
${message.trim()}`,
      });

      const toolsUsed = new Set<string>();
      const sources: Array<{ title: string; uri: string }> = [];
      let respuesta: Anthropic.Beta.BetaMessage | null = null;

      for (let ronda = 0; ronda < 8; ronda++) {
        respuesta = await callClaude({
          system: [{ type: "text", text: CONTADIN_SYSTEM, cache_control: { type: "ephemeral" } }],
          messages,
          tools: [...AGENT_TOOLS, WEB_SEARCH_TOOL],
          output_config: { effort: "medium" },
        });
        fuentesDe(respuesta, sources);
        for (const b of respuesta.content) {
          if (b.type === "server_tool_use" && b.name === "web_search") toolsUsed.add("consulta_fuentes_sat");
        }

        if (respuesta.stop_reason === "pause_turn") {
          messages.push({ role: "assistant", content: respuesta.content });
          continue;
        }
        if (respuesta.stop_reason !== "tool_use") break;

        messages.push({ role: "assistant", content: respuesta.content });
        const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const b of respuesta.content) {
          if (b.type !== "tool_use") continue;
          toolsUsed.add(b.name);
          const input = b.input && typeof b.input === "object" ? (b.input as Record<string, unknown>) : {};
          resultados.push({
            type: "tool_result",
            tool_use_id: b.id,
            content: JSON.stringify(executeAgentTool(b.name, input, safeCtx)),
          });
        }
        messages.push({ role: "user", content: resultados });
      }

      if (!respuesta || respuesta.stop_reason === "refusal") {
        return res.status(422).json({ error: "Contadín no puede ayudar con esa solicitud. Intenta reformularla." });
      }
      const reply = textoDe(respuesta);
      if (!reply) {
        return res.status(502).json({ error: "Contadín no pudo generar una respuesta en este intento." });
      }
      return res.json({ reply, sources: sources.slice(0, 6), toolsUsed: Array.from(toolsUsed), referenceDate: currentDate });
    } catch (err) {
      const mapped = mapError(err);
      return res.status(mapped.status).json({ error: mapped.message });
    }
  });

  // 2. Asistencia fiscal con búsqueda en fuentes oficiales
  app.post("/api/fiscal/ask", async (req, res) => {
    try {
      const { question, companyContext } = req.body ?? {};
      if (typeof question !== "string" || !question.trim()) {
        return res.status(400).json({ error: "Ingresa una consulta fiscal válida." });
      }
      if (question.length > 2500) {
        return res.status(400).json({ error: "La consulta fiscal es demasiado extensa." });
      }
      const currentDate = new Date().toISOString().slice(0, 10);
      const messages: Anthropic.Beta.BetaMessageParam[] = [
        {
          role: "user",
          content: `Fecha de consulta: ${currentDate}.
Contexto de la pyme:
${JSON.stringify(companyContext ?? {}, null, 2)}

Consulta fiscal (México / SAT):
${question.trim()}

Verifica en fuentes oficiales (sat.gob.mx, DOF, LISR, LIVA, CFF, RMF) antes de afirmar que algo está vigente, cita la fuente y la fecha de consulta, y aclara que es orientación preliminar que no sustituye a un contador.`,
        },
      ];
      const sources: Array<{ title: string; uri: string }> = [];
      let respuesta: Anthropic.Beta.BetaMessage | null = null;
      for (let ronda = 0; ronda < 4; ronda++) {
        respuesta = await callClaude({
          system: [{ type: "text", text: CONTADIN_SYSTEM, cache_control: { type: "ephemeral" } }],
          messages,
          tools: [WEB_SEARCH_TOOL],
          output_config: { effort: "medium" },
        });
        fuentesDe(respuesta, sources);
        if (respuesta.stop_reason !== "pause_turn") break;
        messages.push({ role: "assistant", content: respuesta.content });
      }
      const answer = respuesta && respuesta.stop_reason !== "refusal" ? textoDe(respuesta) : "";
      if (!answer) {
        return res.status(502).json({ error: "No se obtuvo respuesta del módulo de asistencia fiscal." });
      }
      return res.json({ answer, sources: sources.slice(0, 6), referenceDate: currentDate });
    } catch (err) {
      const mapped = mapError(err);
      return res.status(mapped.status).json({ error: mapped.message });
    }
  });

  // 3. Análisis de contratos (PDF o texto) con salida estructurada
  app.post("/api/contracts/analyze", async (req, res) => {
    try {
      const { fileName, mimeType, base64Data, textContent } = req.body ?? {};
      if (!textContent && !base64Data) {
        return res.status(400).json({ error: "Debes proporcionar un documento PDF o texto de contrato." });
      }
      if (base64Data && mimeType !== "application/pdf") {
        return res.status(400).json({ error: "Formato no soportado. Usa PDF o TXT." });
      }
      if (typeof base64Data === "string" && base64Data.length > 14_000_000) {
        return res.status(400).json({ error: "El archivo supera el tamaño máximo permitido (10 MB)." });
      }
      const nombre = String(fileName || (base64Data ? "contrato.pdf" : "contrato.txt"));
      const doc = documentoBloque(base64Data || undefined, textContent ? String(textContent) : undefined, nombre);
      const hoy = new Date().toISOString().slice(0, 10);

      const respuesta = await callClaude({
        system: CONTADIN_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              doc!,
              {
                type: "text",
                text: `Hoy es ${hoy}. Analiza este contrato para el dueño de una pyme en México.
- Basa los hallazgos SOLO en el documento; no inventes cláusulas ni cifras. Cita el número de cláusula.
- Identifica obligaciones de cada parte, vigencia y vencimientos (indica si un aviso o plazo ya pasó respecto a hoy), penalizaciones e intereses moratorios, renovaciones automáticas, condiciones de pago, jurisdicción, renuncias de derechos y cualquier cláusula que deba revisar un abogado o contador.
- Clasifica cada hallazgo en nivelAtencion bajo/medio/alto. En la recomendación explica el porqué y una acción concreta.
- resumenEjecutivo: 3-4 oraciones claras con fechas y montos clave, balance de riesgo y la recomendación de validación con un abogado.`,
              },
            ],
          },
        ],
        output_config: { effort: "high", format: { type: "json_schema", schema: ESQUEMA_CONTRATO } },
      });
      const parsed = jsonDe<Record<string, unknown>>(respuesta);
      return res.json({ analysis: { ...parsed, fileName: nombre, analyzedAt: new Date().toISOString(), isDemo: false } });
    } catch (err) {
      if (err instanceof Error && (err.message === "REFUSAL" || err.message === "MAX_TOKENS" || err instanceof SyntaxError)) {
        return res.status(502).json({ error: "No fue posible analizar el contrato completo. Intenta con otro archivo." });
      }
      const mapped = mapError(err);
      return res.status(mapped.status).json({ error: mapped.message });
    }
  });

  // 4. Preguntas sobre el contrato activo
  app.post("/api/contracts/qa", async (req, res) => {
    try {
      const { question, contractSummary, contractRawText, base64Pdf } = req.body ?? {};
      if (typeof question !== "string" || !question.trim()) {
        return res.status(400).json({ error: "Escribe una pregunta sobre el contrato." });
      }
      const pdf = typeof base64Pdf === "string" && base64Pdf.length > 0 && base64Pdf.length <= 14_000_000 ? base64Pdf : undefined;
      const doc = documentoBloque(pdf, !pdf && contractRawText ? String(contractRawText) : undefined, "Contrato");
      const contenido: Anthropic.Beta.BetaContentBlockParam[] = [];
      if (doc) contenido.push(doc);
      contenido.push({
        type: "text",
        text: `Resumen y hallazgos del contrato activo:
${JSON.stringify(contractSummary ?? {}, null, 2)}

Pregunta del usuario:
${question.trim()}

Responde solo con base en el contrato. Si hay cálculos (intereses moratorios, penas), muestra datos, fórmula y resultado. Indica si conviene validarlo con un abogado.`,
      });
      const respuesta = await callClaude({
        system: CONTADIN_SYSTEM,
        messages: [{ role: "user", content: contenido }],
        output_config: { effort: "medium" },
      });
      const answer = respuesta.stop_reason !== "refusal" ? textoDe(respuesta) : "";
      if (!answer) return res.status(502).json({ error: "No fue posible responder sobre el contrato." });
      return res.json({ answer });
    } catch (err) {
      const mapped = mapError(err);
      return res.status(mapped.status).json({ error: mapped.message });
    }
  });

  // 5. Extraer datos de una factura CFDI o un estado de cuenta en PDF
  app.post("/api/reconciliation/parse-pdf", async (req, res) => {
    try {
      const { kind, base64Data, fileName } = req.body ?? {};
      if (typeof base64Data !== "string" || !base64Data) {
        return res.status(400).json({ error: "Archivo PDF inválido o vacío." });
      }
      if (kind !== "invoice" && kind !== "bank") {
        return res.status(400).json({ error: "Tipo de documento no especificado." });
      }
      const nombre = String(fileName || (kind === "invoice" ? "factura.pdf" : "estado_cuenta.pdf"));
      const instruccion =
        kind === "invoice"
          ? "Extrae los datos fiscales de esta factura CFDI mexicana. Si un campo no aparece, deja texto vacío o 0; no inventes."
          : "Extrae los movimientos bancarios de este estado de cuenta (máximo 60). Montos siempre positivos; usa tipo abono o cargo. No inventes movimientos.";
      const respuesta = await callClaude({
        messages: [
          {
            role: "user",
            content: [documentoBloque(base64Data, undefined, nombre)!, { type: "text", text: instruccion }],
          },
        ],
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema: kind === "invoice" ? ESQUEMA_FACTURA : ESQUEMA_MOVIMIENTOS },
        },
      });
      if (kind === "invoice") {
        return res.json({ invoice: jsonDe<Record<string, unknown>>(respuesta) });
      }
      return res.json({ movements: jsonDe<{ movimientos: unknown[] }>(respuesta).movimientos });
    } catch (err) {
      if (err instanceof Error && (err.message === "REFUSAL" || err.message === "MAX_TOKENS" || err instanceof SyntaxError)) {
        return res.status(502).json({ error: "No fue posible leer el PDF. Intenta con otro archivo." });
      }
      const mapped = mapError(err);
      return res.status(mapped.status).json({ error: mapped.message });
    }
  });

  // Vite en desarrollo o archivos estáticos en producción
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get("*", (_req, res) => {
        res.sendFile(path.join(distDir, "index.html"));
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Contadín server listening on http://localhost:${PORT}`);
  });
}

startServer();
