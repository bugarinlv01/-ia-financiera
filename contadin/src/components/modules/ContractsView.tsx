import { useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSearch,
  Send,
  ShieldAlert,
  Upload,
} from "lucide-react";
import { ContractAnalysis } from "../../types/finance";
import { ContadinMascot } from "../MascotAvatar";
import { Markdown } from "../Markdown";

interface ContractsViewProps {
  contracts: ContractAnalysis[];
  activeContractId: string;
  onSelectContract: (id: string) => void;
  onAddContract: (contract: ContractAnalysis) => void;
  onLogHistory: (titulo: string, detalle: string) => void;
  onBack: () => void;
}

export function ContractsView({
  contracts,
  activeContractId,
  onSelectContract,
  onAddContract,
  onLogHistory,
  onBack,
}: ContractsViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [riskFilter, setRiskFilter] = useState<"todos" | "alto" | "medio" | "bajo">("todos");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [qaQuestion, setQaQuestion] = useState("");
  const [qaAnswer, setQaAnswer] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [qaError, setQaError] = useState("");

  const activeContract =
    contracts.find((c) => c.id === activeContractId) || contracts[0];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploadError("");
    setQaAnswer("");
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["pdf", "txt"].includes(ext)) {
      setUploadError("Formato no soportado. Carga un contrato en PDF (.pdf) o texto plano (.txt).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("El archivo supera el límite de 10 MB.");
      return;
    }

    try {
      setIsAnalyzing(true);
      let payload: Record<string, string> = { fileName: file.name };

      if (ext === "pdf") {
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const res = String(reader.result || "");
            resolve(res.includes(",") ? res.split(",")[1] : res);
          };
          reader.onerror = () => reject(new Error("Error leyendo el PDF."));
          reader.readAsDataURL(file);
        });
        payload = {
          fileName: file.name,
          mimeType: "application/pdf",
          base64Data,
        };
      } else {
        const textContent = await file.text();
        payload = {
          fileName: file.name,
          mimeType: "text/plain",
          textContent,
        };
      }

      const res = await fetch("/api/contracts/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo analizar el contrato.");

      const newContract: ContractAnalysis = {
        id: `ctr-${Date.now()}`,
        ...data.analysis,
        base64Pdf: payload.base64Data,
        rawText: payload.textContent,
      };
      onAddContract(newContract);
      onLogHistory(
        `Análisis de contrato: ${newContract.titulo}`,
        `${newContract.hallazgos.length} hallazgos identificados (${newContract.fileName})`
      );
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Error analizando el documento."
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const askAboutContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qaQuestion.trim() || !activeContract || isAsking) return;
    setIsAsking(true);
    setQaError("");
    try {
      const res = await fetch("/api/contracts/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: qaQuestion.trim(),
          contractSummary: {
            titulo: activeContract.titulo,
            partes: activeContract.partes,
            vigencia: activeContract.vigencia,
            condicionesPago: activeContract.condicionesPago,
            resumenEjecutivo: activeContract.resumenEjecutivo,
            hallazgos: activeContract.hallazgos,
          },
          contractRawText: activeContract.rawText,
          base64Pdf: activeContract.base64Pdf,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No fue posible responder.");
      setQaAnswer(data.answer);
      onLogHistory(
        `Pregunta sobre contrato (${activeContract.fileName})`,
        qaQuestion.trim()
      );
    } catch (err) {
      setQaError(err instanceof Error ? err.message : "Error al consultar.");
    } finally {
      setIsAsking(false);
    }
  };

  const filteredFindings = (activeContract?.hallazgos ?? []).filter((h) =>
    riskFilter === "todos" ? true : h.nivelAtencion === riskFilter
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
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
            Análisis inteligente de contratos
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Carga contratos en PDF para identificar obligaciones, penalizaciones, renovaciones automáticas, condiciones de pago y riesgos contractuales.
          </p>
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            disabled={isAnalyzing}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#2563EB] hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold whitespace-nowrap"
          >
            <Upload className="w-4 h-4" />
            {isAnalyzing ? "Analizando contrato con IA..." : "Cargar contrato (PDF)"}
          </button>
        </div>
      </div>

      {/* Preliminary Legal Disclaimer */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-start gap-3 text-slate-700">
        <ShieldAlert className="w-5 h-5 text-[#2563EB] shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed">
          <strong>Revisión preliminar asistida por IA:</strong> Este análisis identifica cláusulas financieras y operativas clave para apoyar tu revisión. No constituye asesoría legal formal; valida cualquier firma o modificación contractual con un abogado.
        </div>
      </div>

      {uploadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900">
          {uploadError}
        </div>
      )}

      {/* Contract Selector */}
      <div className="flex flex-wrap items-center gap-2">
        {contracts.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              onSelectContract(c.id);
              setQaAnswer("");
            }}
            className={`px-3.5 py-2 rounded-lg border text-xs font-medium transition-colors text-left ${
              c.id === activeContract?.id
                ? "bg-[#0B1F3A] text-white border-[#0B1F3A]"
                : "bg-white text-slate-700 border-slate-200 hover:border-[#2563EB]"
            }`}
          >
            <div className="font-semibold truncate max-w-[260px]">{c.titulo}</div>
            <div
              className={`text-[11px] mt-0.5 ${
                c.id === activeContract?.id ? "text-blue-200" : "text-slate-500"
              }`}
            >
              {c.isDemo ? "Ejemplo de demostración" : "Documento cargado"} · {c.hallazgos.length} hallazgos
            </div>
          </button>
        ))}
      </div>

      {activeContract && (
        <>
          {/* Executive Summary Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="text-xs text-slate-500">
                  Archivo: {activeContract.fileName} ·{" "}
                  {activeContract.isDemo ? "Contrato de demostración" : "Analizado desde archivo"}
                </div>
                <h2 className="font-display text-lg font-bold text-[#0B1F3A] mt-1">
                  {activeContract.titulo}
                </h2>
              </div>
              <FileSearch className="w-5 h-5 text-[#2563EB] shrink-0" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                <div className="font-semibold text-slate-500">Partes involucradas</div>
                <div className="mt-1 text-slate-900 leading-relaxed">
                  {activeContract.partes}
                </div>
              </div>
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                <div className="font-semibold text-slate-500">Vigencia y renovación</div>
                <div className="mt-1 text-slate-900 leading-relaxed">
                  {activeContract.vigencia}
                </div>
              </div>
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                <div className="font-semibold text-slate-500">Condiciones de pago</div>
                <div className="mt-1 text-slate-900 leading-relaxed">
                  {activeContract.condicionesPago}
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-slate-700 mb-1">
                Resumen ejecutivo de Contadín
              </h3>
              <p className="text-sm text-slate-700 leading-relaxed">
                {activeContract.resumenEjecutivo}
              </p>
            </div>
          </div>

          {/* Findings Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-[#0B1F3A]">
                  Elementos, obligaciones y riesgos identificados
                </h2>
                <p className="text-xs text-slate-500">
                  Clasificación por nivel de atención y acción sugerida
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {(
                  [
                    { id: "todos", label: "Todos" },
                    { id: "alto", label: "Alto" },
                    { id: "medio", label: "Medio" },
                    { id: "bajo", label: "Bajo" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setRiskFilter(t.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      riskFilter === t.id
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                    <th className="py-3 px-4">Elemento identificado</th>
                    <th className="py-3 px-4">Descripción</th>
                    <th className="py-3 px-4 whitespace-nowrap">Nivel de atención</th>
                    <th className="py-3 px-4">Recomendación de Contadín</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredFindings.map((h, idx) => {
                    const level = h.nivelAtencion;
                    const levelUi =
                      level === "alto"
                        ? { label: "Alto", cls: "text-red-700 font-semibold", Icon: AlertTriangle }
                        : level === "medio"
                        ? { label: "Medio", cls: "text-amber-700 font-semibold", Icon: AlertTriangle }
                        : { label: "Bajo", cls: "text-emerald-700 font-semibold", Icon: CheckCircle2 };
                    const Icon = levelUi.Icon;

                    return (
                      <tr key={idx} className="hover:bg-slate-50/70 align-top">
                        <td className="py-3.5 px-4 font-semibold text-slate-900 text-xs sm:text-sm min-w-[180px]">
                          {h.elemento}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-700 leading-relaxed min-w-[240px]">
                          {h.descripcion}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 text-xs ${levelUi.cls}`}>
                            <Icon className="w-3.5 h-3.5" />
                            {levelUi.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-700 leading-relaxed min-w-[240px]">
                          {h.recomendacion}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Contract Q&A */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <ContadinMascot size="sm" />
              <div>
                <h2 className="font-display text-base font-semibold text-[#0B1F3A]">
                  Haz preguntas sobre este contrato
                </h2>
                <p className="text-xs text-slate-500">
                  Ej. "¿Qué pasa si cancelo antes de tiempo?" o "¿Cuál es la fecha límite para evitar la renovación?"
                </p>
              </div>
            </div>

            <form onSubmit={askAboutContract} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={qaQuestion}
                onChange={(e) => setQaQuestion(e.target.value)}
                placeholder="Escribe tu pregunta sobre las cláusulas de este documento..."
                className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#2563EB] focus:outline-none"
              />
              <button
                type="submit"
                disabled={isAsking || !qaQuestion.trim()}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#0B1F3A] hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                {isAsking ? "Analizando..." : "Preguntar"}
              </button>
            </form>

            {qaError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-900">
                {qaError}
              </div>
            )}

            {qaAnswer && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800 leading-relaxed">
                <Markdown>{qaAnswer}</Markdown>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
