import { useMemo, useState } from "react";
import { ArrowLeft, Plus, Search, Trash2 } from "lucide-react";
import { CompanyProfile, FinancialMovement, SectionId } from "../../types/finance";
import { formatMXN, formatShortDate } from "../../utils/financeEngine";

interface FinancialInfoViewProps {
  company: CompanyProfile;
  movements: FinancialMovement[];
  onAddMovement: (mov: Omit<FinancialMovement, "id">) => void;
  onDeleteMovement: (id: string) => void;
  onBack: () => void;
  onNavigate: (section: SectionId) => void;
}

const CATEGORIES = [
  "Ventas nacionales",
  "Servicios profesionales",
  "Materia prima e insumos",
  "Nómina y prestaciones",
  "Arrendamiento operativo",
  "Fletes y logística",
  "Servicios básicos",
  "Seguridad social",
  "Tecnología y software",
  "Otros gastos operativos",
];

export function FinancialInfoView({
  company,
  movements,
  onAddMovement,
  onDeleteMovement,
  onBack,
}: FinancialInfoViewProps) {
  const [filterType, setFilterType] = useState<"todos" | "ingreso" | "gasto">("todos");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [fecha, setFecha] = useState("2026-11-25");
  const [tipo, setTipo] = useState<"ingreso" | "gasto">("gasto");
  const [concepto, setConcepto] = useState("");
  const [contraparte, setContraparte] = useState("");
  const [categoria, setCategoria] = useState("Materia prima e insumos");
  const [monto, setMonto] = useState("");
  const [metodoPago, setMetodoPago] = useState<FinancialMovement["metodoPago"]>("SPEI");
  const [cfdiRelacionado, setCfdiRelacionado] = useState("");
  const [formError, setFormError] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return movements.filter((m) => {
      if (filterType !== "todos" && m.tipo !== filterType) return false;
      if (!q) return true;
      return (
        m.concepto.toLowerCase().includes(q) ||
        m.contraparte.toLowerCase().includes(q) ||
        m.categoria.toLowerCase().includes(q)
      );
    });
  }, [movements, filterType, search]);

  const totalIngresos = movements
    .filter((m) => m.tipo === "ingreso")
    .reduce((acc, m) => acc + m.monto, 0);
  const totalGastos = movements
    .filter((m) => m.tipo === "gasto")
    .reduce((acc, m) => acc + m.monto, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(monto);
    if (!concepto.trim() || !contraparte.trim() || Number.isNaN(num) || num <= 0) {
      setFormError("Ingresa concepto, cliente o proveedor y un monto válido mayor a 0.");
      return;
    }
    setFormError("");
    onAddMovement({
      fecha,
      tipo,
      concepto: concepto.trim(),
      contraparte: contraparte.trim(),
      categoria,
      monto: num,
      metodoPago,
      cfdiRelacionado: cfdiRelacionado.trim() || undefined,
    });
    setConcepto("");
    setContraparte("");
    setMonto("");
    setCfdiRelacionado("");
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
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
            Mi información financiera
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Registra y consulta los ingresos, egresos y saldos que alimentan las proyecciones y respuestas de Contadín.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold transition-colors whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>{showForm ? "Cerrar formulario" : "Registrar ingreso o gasto"}</span>
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">Saldo bancario base</div>
          <div className="mt-1 font-mono-nums text-xl font-bold text-[#0B1F3A]">
            {formatMXN(company.initialBalance)}
          </div>
          <div className="mt-1 text-xs text-slate-500">{company.regimenFiscal}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">Ingresos acumulados del periodo</div>
          <div className="mt-1 font-mono-nums text-xl font-bold text-emerald-700">
            +{formatMXN(totalIngresos)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {movements.filter((m) => m.tipo === "ingreso").length} movimientos registrados
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">Egresos acumulados del periodo</div>
          <div className="mt-1 font-mono-nums text-xl font-bold text-slate-900">
            -{formatMXN(totalGastos)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {movements.filter((m) => m.tipo === "gasto").length} movimientos registrados
          </div>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-slate-200 p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-[#0B1F3A]">
              Nuevo movimiento financiero
            </h2>
            <span className="text-xs text-slate-500">Se refleja en el dashboard y en el chat</span>
          </div>

          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tipo de movimiento
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as "ingreso" | "gasto")}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#2563EB] focus:outline-none"
              >
                <option value="ingreso">Ingreso (Cobro)</option>
                <option value="gasto">Gasto (Pago)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Fecha
              </label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono-nums focus:border-[#2563EB] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Monto (MXN)
              </label>
              <input
                type="number"
                step="0.01"
                min="1"
                placeholder="25000.00"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono-nums focus:border-[#2563EB] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Método de pago
              </label>
              <select
                value={metodoPago}
                onChange={(e) =>
                  setMetodoPago(e.target.value as FinancialMovement["metodoPago"])
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#2563EB] focus:outline-none"
              >
                <option value="SPEI">SPEI</option>
                <option value="Transferencia">Transferencia</option>
                <option value="Domiciliación">Domiciliación</option>
                <option value="Tarjeta Corporativa">Tarjeta Corporativa</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Concepto
              </label>
              <input
                type="text"
                placeholder="Ej. Pago proveedor empaque industrial"
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#2563EB] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Cliente / Proveedor
              </label>
              <input
                type="text"
                placeholder="Razón social"
                value={contraparte}
                onChange={(e) => setContraparte(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#2563EB] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Categoría
              </label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#2563EB] focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <input
              type="text"
              placeholder="Folio CFDI opcional (ej. F-1051)"
              value={cfdiRelacionado}
              onChange={(e) => setCfdiRelacionado(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono-nums w-64 focus:border-[#2563EB] focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#0B1F3A] hover:bg-slate-800 text-white text-xs font-semibold"
              >
                Guardar movimiento
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Movements Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: "todos", label: "Todos" },
                { id: "ingreso", label: "Ingresos" },
                { id: "gasto", label: "Gastos" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  filterType === tab.id
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar concepto, cliente o categoría..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-1.5 text-xs focus:border-[#2563EB] focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">Concepto y contraparte</th>
                <th className="py-3 px-4">Categoría</th>
                <th className="py-3 px-4">Método / CFDI</th>
                <th className="py-3 px-4 text-right">Monto (MXN)</th>
                <th className="py-3 px-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm text-slate-500">
                    No hay movimientos que coincidan con el filtro seleccionado.
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono-nums text-xs text-slate-600 whitespace-nowrap">
                      {formatShortDate(m.fecha)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{m.concepto}</div>
                      <div className="text-xs text-slate-500">{m.contraparte}</div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {m.categoria}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                      {m.metodoPago}
                      {m.cfdiRelacionado ? ` · ${m.cfdiRelacionado}` : ""}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono-nums font-semibold whitespace-nowrap ${
                        m.tipo === "ingreso" ? "text-emerald-700" : "text-slate-900"
                      }`}
                    >
                      {m.tipo === "ingreso" ? "+" : "-"}
                      {formatMXN(m.monto)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onDeleteMovement(m.id)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Eliminar registro"
                        aria-label={`Eliminar ${m.concepto}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
