import { useMemo, useState } from "react";
import { ArrowLeft, Download, Search } from "lucide-react";
import {
  CompanyProfile,
  FinancialMovement,
  QueryHistoryItem,
} from "../../types/finance";
import { formatMXN } from "../../utils/financeEngine";

interface HistoryReportsViewProps {
  company: CompanyProfile;
  history: QueryHistoryItem[];
  movements: FinancialMovement[];
  summary: {
    saldoDisponible: number;
    ingresosMes: number;
    gastosMes: number;
    flujoMes: number;
    ivaEstimado: number;
    isrEstimado: number;
  };
  reconciliationPct: number;
  onBack: () => void;
}

export function HistoryReportsView({
  company,
  history,
  movements,
  summary,
  reconciliationPct,
  onBack,
}: HistoryReportsViewProps) {
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>("todos");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return history.filter((item) => {
      if (moduleFilter !== "todos" && item.modulo !== moduleFilter) return false;
      if (!q) return true;
      return (
        item.titulo.toLowerCase().includes(q) ||
        item.detalle.toLowerCase().includes(q) ||
        item.modulo.toLowerCase().includes(q)
      );
    });
  }, [history, search, moduleFilter]);

  const exportCsvReport = () => {
    const rows = [
      ["Reporte Ejecutivo Contadín", company.name, `RFC: ${company.rfc}`],
      ["Fecha", "Concepto", "Contraparte", "Categoría", "Tipo", "Monto MXN", "CFDI"],
      ...movements.map((m) => [
        m.fecha,
        `"${m.concepto.replace(/"/g, '""')}"`,
        `"${m.contraparte.replace(/"/g, '""')}"`,
        m.categoria,
        m.tipo,
        m.monto.toFixed(2),
        m.cfdiRelacionado || "",
      ]),
    ];

    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `contadin_reporte_${company.rfc}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
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
            Historial y reportes
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Consulta la bitácora de consultas realizadas a Contadín y descarga tu resumen financiero en CSV.
          </p>
        </div>

        <button
          type="button"
          onClick={exportCsvReport}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0B1F3A] hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          Descargar reporte CSV
        </button>
      </div>

      {/* Executive Report Snapshot */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-display text-base font-semibold text-[#0B1F3A] mb-4">
          Resumen ejecutivo actual ({company.name})
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 text-xs">
          <div>
            <div className="text-slate-500">Saldo disponible</div>
            <div className="mt-1 font-mono-nums text-base font-bold text-slate-900">
              {formatMXN(summary.saldoDisponible)}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Ingresos del mes</div>
            <div className="mt-1 font-mono-nums text-base font-bold text-emerald-700">
              {formatMXN(summary.ingresosMes)}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Gastos del mes</div>
            <div className="mt-1 font-mono-nums text-base font-bold text-slate-900">
              {formatMXN(summary.gastosMes)}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Conciliación bancaria</div>
            <div className="mt-1 font-mono-nums text-base font-bold text-[#2563EB]">
              {reconciliationPct}%
            </div>
          </div>
          <div>
            <div className="text-slate-500">Impuestos est. (IVA+ISR)</div>
            <div className="mt-1 font-mono-nums text-base font-bold text-slate-900">
              {formatMXN(summary.ivaEstimado + summary.isrEstimado)}
            </div>
          </div>
        </div>
      </div>

      {/* Query History */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {[
              "todos",
              "Chat",
              "Asistencia Fiscal",
              "Análisis de Contratos",
              "Conciliación",
              "Planeación de Pagos",
            ].map((mod) => (
              <button
                key={mod}
                type="button"
                onClick={() => setModuleFilter(mod)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  moduleFilter === mod
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {mod === "todos" ? "Todos" : mod}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar en historial..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-1.5 text-xs focus:border-[#2563EB] focus:outline-none"
            />
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No hay registros en el historial para los filtros actuales.
            </div>
          ) : (
            filtered.map((item) => (
              <div key={item.id} className="p-4 hover:bg-slate-50/70">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono-nums">{item.fecha}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-[#2563EB]">{item.modulo}</span>
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {item.titulo}
                </div>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  {item.detalle}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
