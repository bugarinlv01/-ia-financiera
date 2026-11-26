import { useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import {
  BankTransaction,
  CfdiInvoice,
  MatchClassification,
  ReconciliationMatch,
} from "../../types/finance";
import {
  formatMXN,
  formatShortDate,
  parseBankCsv,
  parseCfdiXml,
} from "../../utils/financeEngine";

interface ReconciliationViewProps {
  bankTransactions: BankTransaction[];
  invoices: CfdiInvoice[];
  matches: ReconciliationMatch[];
  onRunReconciliation: () => void;
  onUpdateMatchStatus: (matchId: string, status: "confirmada" | "rechazada") => void;
  onManualLink: (matchId: string, invoiceId: string) => void;
  onAddBankTransactions: (txs: BankTransaction[]) => void;
  onAddInvoices: (invs: CfdiInvoice[]) => void;
  onRestoreDemo: () => void;
  onBack: () => void;
}

export function ReconciliationView({
  bankTransactions,
  invoices,
  matches,
  onRunReconciliation,
  onUpdateMatchStatus,
  onManualLink,
  onAddBankTransactions,
  onAddInvoices,
  onRestoreDemo,
  onBack,
}: ReconciliationViewProps) {
  const bankInputRef = useRef<HTMLInputElement>(null);
  const cfdiInputRef = useRef<HTMLInputElement>(null);

  const [filterClass, setFilterClass] = useState<"todos" | MatchClassification>("todos");
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [uploadError, setUploadError] = useState<string>("");
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [linkingTxId, setLinkingTxId] = useState<string | null>(null);

  const invoiceMap = new Map(invoices.map((inv) => [inv.id, inv]));

  const reconciledCount = matches.filter(
    (m) => m.reviewStatus === "confirmada" && m.invoiceIds.length > 0
  ).length;
  const pendingCount = bankTransactions.length - reconciledCount;
  const totalDifference = matches.reduce(
    (sum, m) => sum + (m.invoiceIds.length > 0 ? Math.abs(m.diferenciaMonto) : 0),
    0
  );
  const pctReconciled =
    bankTransactions.length > 0
      ? Math.round((reconciledCount / bankTransactions.length) * 100)
      : 0;

  const filteredMatches = matches.filter((m) =>
    filterClass === "todos" ? true : m.classification === filterClass
  );

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = String(reader.result || "");
        const base64 = res.includes(",") ? res.split(",")[1] : res;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
      reader.readAsDataURL(file);
    });

  const handleBankUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError("");
    setUploadStatus("");

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["csv", "xlsx", "xls", "pdf"].includes(ext)) {
      setUploadError(
        "Formato no válido para estado de cuenta. Carga archivos CSV, Excel (.xlsx/.xls) o PDF."
      );
      return;
    }

    if (ext === "csv") {
      const text = await file.text();
      const txs = parseBankCsv(text);
      if (txs.length === 0) {
        setUploadError(
          "No se detectaron columnas válidas (Fecha, Concepto, Monto). Verifica el formato CSV."
        );
        return;
      }
      onAddBankTransactions(txs);
      setUploadStatus(`Se importaron ${txs.length} movimientos bancarios desde ${file.name}.`);
      return;
    }

    if (ext === "pdf") {
      try {
        setIsParsingPdf(true);
        const base64Data = await readFileAsBase64(file);
        const res = await fetch("/api/reconciliation/parse-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "bank", base64Data, fileName: file.name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error al leer estado de cuenta PDF.");
        const imported: BankTransaction[] = (data.movements || []).map(
          (m: Partial<BankTransaction>, i: number) => ({
            id: `pdf-tx-${Date.now()}-${i}`,
            fecha: (m.fecha || "2026-11-25").slice(0, 10),
            banco: `Importado PDF (${file.name})`,
            concepto: m.concepto || "Movimiento importado",
            referencia: m.referencia || `PDF-${i + 1}`,
            contraparte: m.contraparte || m.concepto || "Contraparte",
            tipo: m.tipo === "abono" ? "abono" : "cargo",
            monto: Math.abs(Number(m.monto || 0)),
          })
        );
        if (imported.length === 0) {
          setUploadError("No se identificaron movimientos en el PDF cargado.");
        } else {
          onAddBankTransactions(imported);
          setUploadStatus(`Contadín extrajo ${imported.length} movimientos de ${file.name}.`);
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Error procesando PDF.");
      } finally {
        setIsParsingPdf(false);
      }
      return;
    }

    // Excel fallback guidance
    setUploadStatus(
      `Archivo ${file.name} validado. Para importación directa inmediata exporta tu hoja de Excel a CSV UTF-8 o carga el estado de cuenta en PDF.`
    );
  };

  const handleCfdiUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploadError("");
    setUploadStatus("");

    const added: CfdiInvoice[] = [];
    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!ext || !["xml", "pdf"].includes(ext)) {
        setUploadError(`"${file.name}" no es válido. Solo se permiten facturas CFDI en XML o PDF.`);
        continue;
      }

      if (ext === "xml") {
        const xmlText = await file.text();
        const inv = parseCfdiXml(xmlText, file.name);
        if (inv) {
          added.push(inv);
        } else {
          setUploadError(`No se pudo interpretar la estructura CFDI de ${file.name}.`);
        }
      } else if (ext === "pdf") {
        try {
          setIsParsingPdf(true);
          const base64Data = await readFileAsBase64(file);
          const res = await fetch("/api/reconciliation/parse-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: "invoice", base64Data, fileName: file.name }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Error al leer factura PDF.");
          const inv = data.invoice;
          if (inv) {
            added.push({
              id: `pdf-inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              folio: inv.folio || file.name.replace(/\.pdf$/i, ""),
              uuid: inv.uuid || `PDF-${Date.now()}`,
              fecha: (inv.fecha || "2026-11-25").slice(0, 10),
              contraparte: inv.contraparte || "Contraparte CFDI",
              rfc: inv.rfc || "XAXX010101000",
              tipo: inv.tipo === "emitida" ? "emitida" : "recibida",
              subtotal: Number(inv.subtotal || Number(inv.total || 0) / 1.16),
              iva: Number(inv.iva || Number(inv.total || 0) * 0.1379),
              total: Number(inv.total || 0),
              concepto: inv.concepto || "Factura CFDI importada",
            });
          }
        } catch (err) {
          setUploadError(err instanceof Error ? err.message : "Error al analizar CFDI PDF.");
        } finally {
          setIsParsingPdf(false);
        }
      }
    }

    if (added.length > 0) {
      onAddInvoices(added);
      setUploadStatus(`Se registraron ${added.length} factura(s) CFDI y se ejecutó la conciliación.`);
    }
  };

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
            Conciliación bancaria automática
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Relaciona los movimientos de tus cuentas bancarias con tus facturas CFDI 4.0 por monto, fecha, concepto y contraparte. Actualmente operando con datos de demostración simulados (sin conexión bancaria en vivo).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRestoreDemo}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restaurar demo
          </button>
          <button
            type="button"
            onClick={onRunReconciliation}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Ejecutar conciliación
          </button>
        </div>
      </div>

      {/* Upload Areas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Cargar estado de cuenta bancario
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Formatos aceptados: CSV, Excel (.xlsx) o PDF. Columnas sugeridas: Fecha, Concepto, Monto, Tipo.
              </p>
            </div>
          </div>
          <input
            ref={bankInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.pdf"
            onChange={handleBankUpload}
            className="hidden"
          />
          <button
            type="button"
            disabled={isParsingPdf}
            onClick={() => bankInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 hover:border-[#2563EB] text-xs font-semibold text-slate-800 whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            {isParsingPdf ? "Leyendo..." : "Subir estado"}
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 text-[#0B1F3A] flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Cargar facturas CFDI
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Formatos aceptados: XML CFDI 3.3 / 4.0 o representación impresa en PDF.
              </p>
            </div>
          </div>
          <input
            ref={cfdiInputRef}
            type="file"
            accept=".xml,.pdf"
            multiple
            onChange={handleCfdiUpload}
            className="hidden"
          />
          <button
            type="button"
            disabled={isParsingPdf}
            onClick={() => cfdiInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 hover:border-[#2563EB] text-xs font-semibold text-slate-800 whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            {isParsingPdf ? "Leyendo..." : "Subir CFDI"}
          </button>
        </div>
      </div>

      {uploadStatus && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900">
          {uploadStatus}
        </div>
      )}
      {uploadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-900">
          {uploadError}
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">Movimientos conciliados</div>
          <div className="mt-1 font-mono-nums text-2xl font-bold text-emerald-700">
            {reconciledCount} <span className="text-sm font-normal text-slate-400">/ {bankTransactions.length}</span>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">Movimientos pendientes</div>
          <div className="mt-1 font-mono-nums text-2xl font-bold text-amber-700">
            {pendingCount}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">Diferencias detectadas</div>
          <div className="mt-1 font-mono-nums text-2xl font-bold text-slate-900">
            {formatMXN(totalDifference)}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">Porcentaje de conciliación</div>
          <div className="mt-1 font-mono-nums text-2xl font-bold text-[#2563EB]">
            {pctReconciled}%
          </div>
        </div>
      </div>

      {/* Interactive Matching Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-[#0B1F3A]">
              Resultado de coincidencias banco vs. CFDI
            </h2>
            <p className="text-xs text-slate-500">
              Confirma, rechaza o vincula manualmente cualquier movimiento pendiente.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: "todos", label: "Todos" },
                { id: "exacta", label: "Exacta" },
                { id: "probable", label: "Probable" },
                { id: "sin_coincidencia", label: "Sin coincidencia" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterClass(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  filterClass === tab.id
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-4">Movimiento bancario</th>
                <th className="py-3 px-4 text-right">Monto banco</th>
                <th className="py-3 px-4">Factura CFDI sugerida</th>
                <th className="py-3 px-4">Clasificación y confianza</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4 text-right">Validación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredMatches.map((match) => {
                const tx = bankTransactions.find((t) => t.id === match.bankTransactionId);
                if (!tx) return null;
                const linkedInvoices = match.invoiceIds
                  .map((id) => invoiceMap.get(id))
                  .filter((x): x is CfdiInvoice => Boolean(x));

                const classLabel =
                  match.classification === "exacta"
                    ? "Coincidencia exacta"
                    : match.classification === "probable"
                    ? "Coincidencia probable"
                    : "Sin coincidencia";

                const classColor =
                  match.classification === "exacta"
                    ? "text-emerald-700"
                    : match.classification === "probable"
                    ? "text-amber-700"
                    : "text-red-700";

                return (
                  <tr key={match.id} className="hover:bg-slate-50/60 align-top">
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="font-medium text-slate-900 text-xs sm:text-sm">
                        {tx.concepto}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {formatShortDate(tx.fecha)} · {tx.banco} · Ref {tx.referencia}
                      </div>
                    </td>

                    <td
                      className={`py-3.5 px-4 text-right font-mono-nums font-semibold whitespace-nowrap ${
                        tx.tipo === "abono" ? "text-emerald-700" : "text-slate-900"
                      }`}
                    >
                      {tx.tipo === "abono" ? "+" : "-"}
                      {formatMXN(tx.monto)}
                    </td>

                    <td className="py-3.5 px-4 max-w-xs">
                      {linkedInvoices.length > 0 ? (
                        <div className="space-y-1">
                          {linkedInvoices.map((inv) => (
                            <div key={inv.id}>
                              <div className="text-xs font-semibold text-slate-900">
                                Folio {inv.folio} · {inv.contraparte}
                              </div>
                              <div className="text-[11px] font-mono-nums text-slate-500">
                                Total CFDI {formatMXN(inv.total)} · RFC {inv.rfc}
                              </div>
                            </div>
                          ))}
                          {Math.abs(match.diferenciaMonto) > 0.01 && (
                            <div className="text-[11px] font-mono-nums text-amber-700 font-medium">
                              Diferencia: {formatMXN(match.diferenciaMonto)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500">
                          Sin CFDI vinculado
                        </div>
                      )}

                      {linkingTxId === match.id && (
                        <div className="mt-2">
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) {
                                onManualLink(match.id, e.target.value);
                                setLinkingTxId(null);
                              }
                            }}
                            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                          >
                            <option value="">Selecciona factura CFDI...</option>
                            {invoices.map((inv) => (
                              <option key={inv.id} value={inv.id}>
                                {inv.folio} · {inv.contraparte} ({formatMXN(inv.total, false)})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className={`text-xs font-semibold ${classColor}`}>
                        {classLabel} ·{" "}
                        <span className="font-mono-nums">{match.confidence}%</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {match.razon}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap text-xs">
                      {match.reviewStatus === "confirmada" ? (
                        <span className="text-emerald-700 font-semibold">Confirmada</span>
                      ) : match.reviewStatus === "rechazada" ? (
                        <span className="text-red-700 font-semibold">Rechazada</span>
                      ) : (
                        <span className="text-amber-700 font-medium">Por validar</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {match.invoiceIds.length > 0 && match.reviewStatus !== "confirmada" && (
                          <button
                            type="button"
                            onClick={() => onUpdateMatchStatus(match.id, "confirmada")}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
                          >
                            <Check className="w-3 h-3" />
                            Confirmar
                          </button>
                        )}
                        {match.invoiceIds.length > 0 && match.reviewStatus !== "rechazada" && (
                          <button
                            type="button"
                            onClick={() => onUpdateMatchStatus(match.id, "rechazada")}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-medium"
                          >
                            <X className="w-3 h-3" />
                            Rechazar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setLinkingTxId(linkingTxId === match.id ? null : match.id)
                          }
                          className="px-2.5 py-1 rounded-md border border-slate-300 hover:border-[#2563EB] text-xs font-medium text-[#2563EB]"
                        >
                          Corregir
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Registered CFDI Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-[#0B1F3A]">
            Facturas CFDI registradas ({invoices.length})
          </h2>
          <span className="text-xs text-slate-500">
            Emitidas y recibidas disponibles para cruce
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-500">
                <th className="py-2.5 px-4">Folio / UUID</th>
                <th className="py-2.5 px-4">Fecha</th>
                <th className="py-2.5 px-4">Emisor / Receptor</th>
                <th className="py-2.5 px-4">Tipo</th>
                <th className="py-2.5 px-4 text-right">Subtotal</th>
                <th className="py-2.5 px-4 text-right">IVA</th>
                <th className="py-2.5 px-4 text-right">Total (MXN)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-4">
                    <div className="font-semibold text-slate-900">{inv.folio}</div>
                    <div className="font-mono-nums text-[10px] text-slate-400 truncate max-w-[160px]">
                      {inv.uuid}
                    </div>
                  </td>
                  <td className="py-2.5 px-4 font-mono-nums text-slate-600 whitespace-nowrap">
                    {formatShortDate(inv.fecha)}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="font-medium text-slate-800">{inv.contraparte}</div>
                    <div className="font-mono-nums text-[11px] text-slate-500">{inv.rfc}</div>
                  </td>
                  <td className="py-2.5 px-4 capitalize text-slate-600">
                    {inv.tipo === "emitida" ? "Ingreso (Emitida)" : "Egreso (Recibida)"}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono-nums text-slate-600">
                    {formatMXN(inv.subtotal)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono-nums text-slate-600">
                    {formatMXN(inv.iva)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono-nums font-semibold text-slate-900">
                    {formatMXN(inv.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
