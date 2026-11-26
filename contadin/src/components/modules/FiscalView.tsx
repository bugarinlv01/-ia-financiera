import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Send,
} from "lucide-react";
import {
  ChatSource,
  CompanyProfile,
  FiscalObligation,
} from "../../types/finance";
import { formatMXN, formatShortDate } from "../../utils/financeEngine";
import { ContadinMascot } from "../MascotAvatar";
import { Markdown } from "../Markdown";

interface FiscalViewProps {
  company: CompanyProfile;
  obligations: FiscalObligation[];
  taxSummary: {
    ingresosMes: number;
    ivaTrasladado: number;
    ivaAcreditable: number;
    ivaEstimado: number;
    isrEstimado: number;
    coeficienteUtilidadDemo: number;
    impuestoTotalEstimado: number;
  };
  onToggleObligation: (id: string) => void;
  onLogHistory: (titulo: string, detalle: string) => void;
  onBack: () => void;
}

const QUICK_FISCAL_TOPICS = [
  "¿Cuándo vence mi declaración provisional de ISR e IVA del mes?",
  "Explícame en sencillo la diferencia entre IVA trasladado e IVA acreditable",
  "¿Qué requisitos debe cumplir un CFDI 4.0 para que un gasto sea deducible?",
  "¿Qué gastos operativos suele poder deducir una pyme manufacturera ante el SAT?",
];

export function FiscalView({
  company,
  obligations,
  taxSummary,
  onToggleObligation,
  onLogHistory,
  onBack,
}: FiscalViewProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<ChatSource[]>([]);
  const [refDate, setRefDate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const possibleDeductions = [
    {
      concepto: "Materia prima e insumos (Aceros Monterrey)",
      monto: 214600,
      requisito: "CFDI 4.0 pagado por SPEI con método PUE/PPD y complemento de pago.",
    },
    {
      concepto: "Arrendamiento nave industrial (Parque Querétaro)",
      monto: 89320,
      requisito: "CFDI de arrendamiento vigente y pago bancarizado indispensable para la actividad.",
    },
    {
      concepto: "Fletes y logística (Transportes Express Bajío)",
      monto: 62640,
      requisito: "CFDI con Complemento Carta Porte debidamente timbrado.",
    },
    {
      concepto: "Energía eléctrica industrial (CFE) y licencias ERP",
      monto: 61420,
      requisito: "Comprobantes fiscales a nombre del RFC de la empresa.",
    },
  ];

  const askFiscal = async (promptText: string) => {
    const q = promptText.trim();
    if (!q || isLoading) return;
    setQuestion(q);
    setIsLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/fiscal/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          companyContext: {
            empresa: company.name,
            rfc: company.rfc,
            regimenFiscal: company.regimenFiscal,
            ivaEstimadoMXN: taxSummary.ivaEstimado,
            isrEstimadoMXN: taxSummary.isrEstimado,
            isDemoMode: company.isDemoMode,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al consultar el asistente fiscal.");
      setAnswer(data.answer);
      setSources(Array.isArray(data.sources) ? data.sources : []);
      setRefDate(data.referenceDate || "");
      onLogHistory(
        `Consulta fiscal: ${q.slice(0, 60)}`,
        data.answer.slice(0, 160)
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "No fue posible obtener la orientación fiscal."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-[#0B1F3A] mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver al Dashboard
        </button>
        <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">
          Asistencia fiscal preventiva (México · SAT)
        </h1>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          Consulta tu calendario fiscal, revisa estimaciones preliminares de IVA e ISR y resuelve dudas tributarias con referencias verificables. No existe conexión directa con el SAT; las cifras son estimaciones orientativas.
        </p>
      </div>

      {/* Preventive Alert */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3 text-amber-950">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm leading-relaxed">
          <strong>Aviso preventivo:</strong> Las estimaciones fiscales mostradas abajo son cálculos orientativos con base en los movimientos y CFDI registrados en Contadín. No sustituyen una declaración definitiva ni la validación de tu Contador Público.
        </div>
      </div>

      {/* Indicative Tax Estimations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-xs font-medium text-slate-500">
            Estimación preliminar de IVA a cargo
          </div>
          <div className="mt-2 font-mono-nums text-2xl font-bold text-[#0B1F3A]">
            {formatMXN(taxSummary.ivaEstimado)}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1 font-mono-nums">
            <div className="flex justify-between">
              <span>IVA trasladado (cobrado):</span>
              <span>{formatMXN(taxSummary.ivaTrasladado)}</span>
            </div>
            <div className="flex justify-between">
              <span>(-) IVA acreditable (gastos):</span>
              <span>{formatMXN(taxSummary.ivaAcreditable)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-xs font-medium text-slate-500">
            Estimación provisional de ISR mensual
          </div>
          <div className="mt-2 font-mono-nums text-2xl font-bold text-[#0B1F3A]">
            {formatMXN(taxSummary.isrEstimado)}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1">
            <div>
              Fórmula orientativa: Ingresos ({formatMXN(taxSummary.ingresosMes, false)}) × Coef. utilidad demo (
              {(taxSummary.coeficienteUtilidadDemo * 100).toFixed(0)}%) × Tasa 30%.
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-xs font-medium text-slate-500">
            Reserva fiscal total sugerida (Mes)
          </div>
          <div className="mt-2 font-mono-nums text-2xl font-bold text-[#2563EB]">
            {formatMXN(taxSummary.impuestoTotalEstimado)}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600">
            Fecha límite estimada para entero provisional: <strong>17 de diciembre de 2026</strong>.
          </div>
        </div>
      </div>

      {/* Fiscal Calendar & Deductions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#2563EB]" />
              <h2 className="font-display text-base font-semibold text-[#0B1F3A]">
                Calendario y registro de obligaciones
              </h2>
            </div>
            <span className="text-xs text-slate-500">
              {obligations.filter((o) => o.estado === "completada").length} de {obligations.length} cumplidas
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {obligations.map((ob) => {
              const isDone = ob.estado === "completada";
              return (
                <div
                  key={ob.id}
                  className="p-4 flex items-start justify-between gap-4 hover:bg-slate-50/70"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{ob.periodicidad}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-nums font-semibold text-slate-700">
                        Vence {formatShortDate(ob.fechaLimite)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          isDone
                            ? "text-emerald-700 font-semibold"
                            : ob.estado === "proxima"
                            ? "text-amber-700 font-semibold"
                            : "text-slate-600"
                        }
                      >
                        {isDone ? "Completada" : ob.estado === "proxima" ? "Próxima a vencer" : "Pendiente"}
                      </span>
                    </div>
                    <h3
                      className={`mt-1 text-sm font-semibold ${
                        isDone ? "line-through text-slate-400" : "text-slate-900"
                      }`}
                    >
                      {ob.titulo}
                    </h3>
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                      {ob.descripcion}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onToggleObligation(ob.id)}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      isDone
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-slate-300 hover:border-[#2563EB] text-slate-700"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {isDone ? "Cumplida" : "Marcar lista"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Deductions Identified */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[#0B1F3A]">
              Posibles deducciones identificadas
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Gastos registrados que requieren validar requisitos CFDI 4.0
            </p>
          </div>
          <div className="space-y-3">
            {possibleDeductions.map((ded, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-slate-200 p-3.5 bg-slate-50/70"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900">
                    {ded.concepto}
                  </span>
                  <span className="font-mono-nums text-xs font-semibold text-[#2563EB] shrink-0">
                    {formatMXN(ded.monto, false)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  {ded.requisito}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SAT Official Grounded Q&A */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <ContadinMascot size="sm" />
          <div>
            <h2 className="font-display text-base font-semibold text-[#0B1F3A]">
              Consultor fiscal en lenguaje sencillo (con búsqueda de fuentes SAT)
            </h2>
            <p className="text-xs text-slate-500">
              Pregunta sobre IVA, ISR, CFDI 4.0, fechas límite o deducciones para pymes en México.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_FISCAL_TOPICS.map((topic) => (
            <button
              key={topic}
              type="button"
              onClick={() => askFiscal(topic)}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:border-[#2563EB] hover:bg-blue-50/50 text-xs text-slate-700 text-left transition-colors"
            >
              {topic}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            askFiscal(question);
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <input
            type="text"
            placeholder="Ej. ¿Cómo funciona la DIOT o qué pasa si pago después del día 17?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#2563EB] focus:outline-none"
          />
          <button
            type="submit"
            disabled={isLoading || !question.trim()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#2563EB] hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5" />
            {isLoading ? "Consultando SAT..." : "Consultar a Contadín"}
          </button>
        </form>

        {errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900">
            {errorMsg}
          </div>
        )}

        {isLoading && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
            Consultando normativa fiscal mexicana y preparando explicación sencilla...
          </div>
        )}

        {answer && !isLoading && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 border-b border-slate-200 pb-2">
              <span className="font-semibold text-[#0B1F3A]">
                Respuesta orientativa de Contadín
              </span>
              {refDate && (
                <span className="font-mono-nums">Fecha de referencia: {refDate}</span>
              )}
            </div>
            <div className="text-sm text-slate-800 leading-relaxed">
              <Markdown>{answer}</Markdown>
            </div>
            {sources.filter((s) => /^https?:\/\//i.test(s.uri)).length > 0 && (
              <div className="pt-3 border-t border-slate-200">
                <div className="text-xs font-semibold text-slate-700 mb-2">
                  Fuentes verificables consultadas:
                </div>
                <div className="flex flex-wrap gap-3">
                  {sources
                    .filter((s) => /^https?:\/\//i.test(s.uri))
                    .map((src, idx) => (
                      <a
                        key={idx}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-[#2563EB] hover:underline"
                      >
                        <span>{src.title}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
