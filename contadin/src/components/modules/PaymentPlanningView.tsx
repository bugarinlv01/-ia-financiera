import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Plus, RotateCcw } from "lucide-react";
import { CompanyProfile, ScheduledPayment } from "../../types/finance";
import {
  computeCashFlowProjection,
  formatMXN,
  formatShortDate,
} from "../../utils/financeEngine";
import { CashFlowProjectionChart } from "../Charts";
import { ContadinMascot } from "../MascotAvatar";
import { Decision, RecommendationCard } from "../RecommendationCard";
import { fechaReferencia, pagosNoNegociables, Recomendacion } from "../../utils/recommendations";

interface PaymentPlanningViewProps {
  company: CompanyProfile;
  payments: ScheduledPayment[];
  onUpdatePayment: (id: string, patch: Partial<ScheduledPayment>) => void;
  onAddPayment: (item: Omit<ScheduledPayment, "id">) => void;
  onResetDemo: () => void;
  onBack: () => void;
  recomendaciones: Recomendacion[];
  decisiones: Record<string, Decision>;
  onApprove: (reco: Recomendacion) => void;
  onCorrect: (reco: Recomendacion, nota: string) => void;
}

export function PaymentPlanningView({
  company,
  payments,
  onUpdatePayment,
  onAddPayment,
  onResetDemo,
  onBack,
  recomendaciones,
  decisiones,
  onApprove,
  onCorrect,
}: PaymentPlanningViewProps) {
  const [horizon, setHorizon] = useState<30 | 60 | 90>(30);
  const [showAdd, setShowAdd] = useState(false);

  const [newConcepto, setNewConcepto] = useState("");
  const [newProveedor, setNewProveedor] = useState("");
  const [newTipo, setNewTipo] = useState<"egreso" | "ingreso_esperado">("egreso");
  const [newMonto, setNewMonto] = useState("");
  const [newFecha, setNewFecha] = useState("2026-12-10");

  const projection = useMemo(
    () => computeCashFlowProjection(company.initialBalance, payments, horizon, fechaReferencia(company)),
    [company, payments, horizon]
  );
  const criticos = useMemo(() => pagosNoNegociables(company, payments), [company, payments]);
  const recoLiquidez = recomendaciones.find((r) => r.id.startsWith("liq-") && !decisiones[r.id]);

  const hasLiquidityAlert = projection.minBalance < company.liquidityThreshold;
  const hasNegativeCash = projection.minBalance < 0;

  const sortedItems = useMemo(
    () =>
      [...payments].sort((a, b) =>
        a.fechaProgramada.localeCompare(b.fechaProgramada)
      ),
    [payments]
  );

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const montoNum = Number(newMonto);
    if (!newConcepto.trim() || !newProveedor.trim() || Number.isNaN(montoNum) || montoNum <= 0) {
      return;
    }
    onAddPayment({
      concepto: newConcepto.trim(),
      proveedor: newProveedor.trim(),
      tipo: newTipo,
      categoria: newTipo === "ingreso_esperado" ? "Cuentas por cobrar" : "Operación",
      monto: montoNum,
      fechaProgramada: newFecha,
      fechaVencimiento: newFecha,
      prioridad: "media",
      estatus: "programado",
    });
    setNewConcepto("");
    setNewProveedor("");
    setNewMonto("");
    setShowAdd(false);
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
            Planeación inteligente de pagos
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Simula tu flujo de efectivo a 30, 60 y 90 días. Modifica fechas programadas, aplica descuentos por pronto pago o agrega cobros y gastos para observar el impacto inmediato en tu liquidez.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onResetDemo}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restaurar escenario
          </button>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar cobro / pago
          </button>
        </div>
      </div>

      {/* Dynamic Liquidity Alert */}
      {hasLiquidityAlert ? (
        <div
          className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
            hasNegativeCash
              ? "bg-red-50 border-red-200 text-red-950"
              : "bg-amber-50 border-amber-200 text-amber-950"
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold">
                {hasNegativeCash
                  ? `Se proyecta un faltante de liquidez (${formatMXN(projection.minBalance)}) en los próximos ${horizon} días`
                  : `Tu saldo proyectado cae por debajo de la reserva mínima alrededor del ${formatShortDate(projection.minBalanceDate)}`}
              </div>
              <p className="text-xs mt-1 opacity-90 leading-relaxed">
                {recoLiquidez
                  ? `Sugerencia: ${recoLiquidez.titulo}. ${recoLiquidez.porque}`
                  : `El punto más bajo sería el ${formatShortDate(projection.minBalanceDate)}. Revisa las sugerencias de Contadín abajo y prioriza los pagos críticos.`}
              </p>
            </div>
          </div>
          <span className="font-mono-nums text-xs font-semibold whitespace-nowrap">
            Mínimo proyectado: {formatMXN(projection.minBalance)}
          </span>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3 text-emerald-950">
          <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
          <div className="text-xs sm:text-sm">
            <strong>Liquidez saludable:</strong> Con la programación actual tu saldo proyectado se mantiene por encima del umbral mínimo de{" "}
            <span className="font-mono-nums font-semibold">
              {formatMXN(company.liquidityThreshold)}
            </span>{" "}
            durante los próximos {horizon} días.
          </div>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="bg-white rounded-xl border border-slate-200 p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end"
        >
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Tipo</label>
            <select
              value={newTipo}
              onChange={(e) =>
                setNewTipo(e.target.value as "egreso" | "ingreso_esperado")
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
            >
              <option value="egreso">Cuenta por pagar</option>
              <option value="ingreso_esperado">Ingreso esperado</option>
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">Concepto</label>
            <input
              type="text"
              placeholder="Ej. Compra insumos / Cobro cliente"
              value={newConcepto}
              onChange={(e) => setNewConcepto(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Proveedor / Cliente</label>
            <input
              type="text"
              placeholder="Razón social"
              value={newProveedor}
              onChange={(e) => setNewProveedor(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Monto (MXN)</label>
            <input
              type="number"
              min="1"
              step="0.01"
              placeholder="50000"
              value={newMonto}
              onChange={(e) => setNewMonto(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono-nums"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-700 mb-1">Fecha</label>
              <input
                type="date"
                value={newFecha}
                onChange={(e) => setNewFecha(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-xs font-mono-nums"
              />
            </div>
            <button
              type="submit"
              className="px-3.5 py-2 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold h-[34px] self-end"
            >
              Agregar
            </button>
          </div>
        </form>
      )}

      {/* KPIs + Chart */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">Saldo actual disponible</div>
          <div className="mt-1 font-mono-nums text-xl font-bold text-[#0B1F3A]">
            {formatMXN(company.initialBalance)}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">Ingresos esperados ({horizon} d)</div>
          <div className="mt-1 font-mono-nums text-xl font-bold text-emerald-700">
            +{formatMXN(projection.totalExpectedInflows)}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">Pagos programados ({horizon} d)</div>
          <div className="mt-1 font-mono-nums text-xl font-bold text-slate-900">
            -{formatMXN(projection.totalScheduledOutflows)}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">Ahorro potencial pronto pago</div>
          <div className="mt-1 font-mono-nums text-xl font-bold text-[#2563EB]">
            {formatMXN(projection.potentialSavings)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Projection Chart */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[#0B1F3A]">
                Proyección de flujo de efectivo
              </h2>
              <p className="text-xs text-slate-500">
                Saldo proyectado al cierre del horizonte:{" "}
                <span className="font-mono-nums font-semibold text-slate-800">
                  {formatMXN(projection.endingBalance)}
                </span>
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {([30, 60, 90] as const).map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setHorizon(days)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    horizon === days
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {days} días
                </button>
              ))}
            </div>
          </div>

          <CashFlowProjectionChart
            points={projection.points}
            threshold={company.liquidityThreshold}
          />
        </div>

        {/* Contadin Recommendations */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <ContadinMascot size="sm" />
            <div>
              <h2 className="font-display text-sm font-semibold text-[#0B1F3A]">
                Estrategia sugerida
              </h2>
              <p className="text-xs text-slate-500">Priorización y liquidez</p>
            </div>
          </div>

          <div className="space-y-3 text-xs text-slate-700 leading-relaxed">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="font-semibold text-slate-900">Pagos no negociables (próximos 30 días)</div>
              {criticos.length ? (
                <ul className="mt-1 space-y-0.5">
                  {criticos.map((p) => (
                    <li key={p.id}>
                      {p.concepto} · <span className="font-mono-nums">{formatMXN(p.monto)}</span> ·{" "}
                      {formatShortDate(p.fechaProgramada)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1">No hay pagos críticos programados en los próximos 30 días.</p>
              )}
            </div>
            {recomendaciones.length === 0 && (
              <p className="text-slate-500">Con la programación actual no hay ajustes sugeridos.</p>
            )}
            {recomendaciones.map((r) => (
              <RecommendationCard
                key={r.id}
                reco={r}
                decision={decisiones[r.id]}
                onApprove={onApprove}
                onCorrect={onCorrect}
                compact
              />
            ))}
          </div>
        </div>
      </div>

      {/* Interactive Schedule Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-[#0B1F3A]">
              Calendario editable de cobros y cuentas por pagar
            </h2>
            <p className="text-xs text-slate-500">
              Edita la fecha programada, el monto o aplica descuentos por pronto pago para simular escenarios.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-4">Concepto y contraparte</th>
                <th className="py-3 px-4">Prioridad</th>
                <th className="py-3 px-4">Vencimiento</th>
                <th className="py-3 px-4">Fecha programada</th>
                <th className="py-3 px-4 text-right">Monto (MXN)</th>
                <th className="py-3 px-4 text-right">Pronto pago / Simulación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedItems.map((item) => {
                const effectiveAmount =
                  item.descuentoAplicado && item.descuentoProntoPagoPct
                    ? item.monto * (1 - item.descuentoProntoPagoPct / 100)
                    : item.monto;

                return (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{item.concepto}</div>
                      <div className="text-xs text-slate-500">
                        {item.proveedor} · {item.tipo === "ingreso_esperado" ? "Cobro esperado" : "Cuenta por pagar"}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs capitalize">
                      <span
                        className={`font-semibold ${
                          item.prioridad === "critica"
                            ? "text-red-700"
                            : item.prioridad === "alta"
                            ? "text-amber-700"
                            : "text-slate-600"
                        }`}
                      >
                        {item.prioridad}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono-nums text-xs text-slate-600 whitespace-nowrap">
                      {formatShortDate(item.fechaVencimiento)}
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="date"
                        value={item.fechaProgramada}
                        onChange={(e) =>
                          onUpdatePayment(item.id, { fechaProgramada: e.target.value })
                        }
                        className="rounded border border-slate-300 px-2 py-1 text-xs font-mono-nums focus:border-[#2563EB] focus:outline-none"
                      />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <input
                        type="number"
                        min="100"
                        step="100"
                        value={item.monto}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isNaN(v) && v > 0) {
                            onUpdatePayment(item.id, { monto: v });
                          }
                        }}
                        className={`w-28 text-right rounded border border-slate-200 px-2 py-1 font-mono-nums text-xs font-semibold focus:border-[#2563EB] focus:outline-none ${
                          item.tipo === "ingreso_esperado" ? "text-emerald-700" : "text-slate-900"
                        }`}
                      />
                      {item.descuentoAplicado && item.descuentoProntoPagoPct && (
                        <div className="text-[11px] font-mono-nums text-[#2563EB] mt-0.5">
                          Neto: {formatMXN(effectiveAmount)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {item.descuentoProntoPagoPct ? (
                        <button
                          type="button"
                          onClick={() =>
                            onUpdatePayment(item.id, {
                              descuentoAplicado: !item.descuentoAplicado,
                              fechaProgramada:
                                !item.descuentoAplicado && item.fechaLimiteDescuento
                                  ? item.fechaLimiteDescuento
                                  : item.fechaProgramada,
                            })
                          }
                          className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                            item.descuentoAplicado
                              ? "bg-[#2563EB] text-white border-[#2563EB]"
                              : "border-slate-300 text-slate-700 hover:border-[#2563EB]"
                          }`}
                        >
                          {item.descuentoAplicado
                            ? `Descuento ${item.descuentoProntoPagoPct}% activo`
                            : `Aplicar -${item.descuentoProntoPagoPct}%`}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Sin descuento</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
