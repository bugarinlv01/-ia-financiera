import {
  AlertTriangle,
  ArrowRight,
  ArrowLeftRight,
  CalendarClock,
  CheckCircle2,
  FileSearch,
  Scale,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  AlertItem,
  CompanyProfile,
  FinancialMovement,
  MonthlyCashPoint,
  ScheduledPayment,
  SectionId,
} from "../../types/finance";
import { formatMXN, formatShortDate } from "../../utils/financeEngine";
import { IncomeExpenseChart } from "../Charts";
import { ContadinMascot } from "../MascotAvatar";
import { Decision, RecommendationCard } from "../RecommendationCard";
import { Recomendacion } from "../../utils/recommendations";

interface DashboardViewProps {
  company: CompanyProfile;
  monthlyHistory: MonthlyCashPoint[];
  movements: FinancialMovement[];
  payments: ScheduledPayment[];
  reconciliationPct: number;
  alerts: AlertItem[];
  summary: {
    saldoDisponible: number;
    ingresosMes: number;
    gastosMes: number;
    flujoMes: number;
    ivaEstimado: number;
    isrEstimado: number;
  };
  onNavigate: (section: SectionId) => void;
  contractsCount: number;
  recomendaciones: Recomendacion[];
  decisiones: Record<string, Decision>;
  onApprove: (reco: Recomendacion) => void;
  onCorrect: (reco: Recomendacion, nota: string) => void;
}

export function DashboardView({
  company,
  monthlyHistory,
  payments,
  reconciliationPct,
  alerts,
  summary,
  onNavigate,
  contractsCount,
  recomendaciones,
  decisiones,
  onApprove,
  onCorrect,
}: DashboardViewProps) {
  const upcomingOutflows = payments
    .filter((p) => p.tipo === "egreso" && p.estatus === "programado")
    .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento))
    .slice(0, 5);

  const fourSolutions: Array<{
    id: SectionId;
    title: string;
    subtitle: string;
    metric: string;
    icon: typeof ArrowLeftRight;
  }> = [
    {
      id: "reconciliation",
      title: "Conciliación bancaria",
      subtitle: "Vincula movimientos bancarios con facturas CFDI automáticamente.",
      metric: `${reconciliationPct}% conciliado`,
      icon: ArrowLeftRight,
    },
    {
      id: "payment-planning",
      title: "Planeación de pagos",
      subtitle: "Proyecta liquidez a 30, 60 y 90 días y prioriza vencimientos.",
      metric: `${upcomingOutflows.length} pagos próximos`,
      icon: CalendarClock,
    },
    {
      id: "fiscal",
      title: "Asistencia fiscal",
      subtitle: "Calendario SAT, estimación de IVA/ISR y deducciones.",
      metric: `Est. ${formatMXN(summary.ivaEstimado + summary.isrEstimado, false)}`,
      icon: Scale,
    },
    {
      id: "contracts",
      title: "Análisis de contratos",
      subtitle: "Detecta penalizaciones, vigencias y riesgos en PDF.",
      metric: `${contractsCount} contrato${contractsCount === 1 ? "" : "s"} cargado${contractsCount === 1 ? "" : "s"}`,
      icon: FileSearch,
    },
  ];

  // Primero las pendientes, luego las ya decididas
  const recommendations = [...recomendaciones]
    .sort((x, y) => Number(Boolean(decisiones[x.id])) - Number(Boolean(decisiones[y.id])))
    .slice(0, 4);

  return (
    <div className="space-y-8">
      {/* Welcome Banner with Mascot */}
      <section className="rounded-xl bg-[#0B1F3A] text-white p-6 sm:p-7 border border-[#17365F]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4">
            <ContadinMascot size="lg" className="border-white/20" />
            <div className="space-y-1.5">
              <div className="text-xs text-blue-200">
                {company.name} · RFC {company.rfc} ·{" "}
                {company.isDemoMode ? "Datos de demostración en MXN" : "Entorno activo MXN"}
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-balance">
                ¡Hola! Soy Contadín, tu copiloto financiero
              </h1>
              <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
                Centralizo tu flujo bancario, conciliación CFDI, obligaciones ante el SAT y revisión preliminar de contratos para ayudarte a tomar decisiones claras sin perder el control.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate("financial-info")}
              className="px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors whitespace-nowrap"
            >
              Registrar ingreso / gasto
            </button>
            <button
              type="button"
              onClick={() => onNavigate("chat")}
              className="px-4 py-2.5 rounded-lg bg-[#2563EB] hover:bg-blue-600 text-white text-xs font-semibold transition-colors whitespace-nowrap"
            >
              Conversar con Contadín
            </button>
          </div>
        </div>
      </section>

      {/* Primary KPIs */}
      <section aria-label="Indicadores financieros principales">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="text-xs font-medium text-slate-500">Saldo disponible</div>
            <div className="mt-2 font-mono-nums text-2xl font-bold text-[#0B1F3A]">
              {formatMXN(summary.saldoDisponible)}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Cuentas BBVA y Santander · Umbral {formatMXN(company.liquidityThreshold, false)}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Ingresos del mes</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-2 font-mono-nums text-2xl font-bold text-slate-900">
              {formatMXN(summary.ingresosMes)}
            </div>
            <div className="mt-2 text-xs text-emerald-700 font-medium">
              +2.7% frente al mes anterior
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Gastos del mes</span>
              <TrendingDown className="w-4 h-4 text-slate-500" />
            </div>
            <div className="mt-2 font-mono-nums text-2xl font-bold text-slate-900">
              {formatMXN(summary.gastosMes)}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Nómina, materia prima y operación
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="text-xs font-medium text-slate-500">Flujo neto del mes</div>
            <div
              className={`mt-2 font-mono-nums text-2xl font-bold ${
                summary.flujoMes >= 0 ? "text-[#2563EB]" : "text-red-600"
              }`}
            >
              {summary.flujoMes >= 0 ? "+" : ""}
              {formatMXN(summary.flujoMes)}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Ingresos − gastos registrados · margen del{" "}
              {summary.ingresosMes > 0
                ? Math.round((summary.flujoMes / summary.ingresosMes) * 100)
                : 0}
              %
            </div>
          </div>
        </div>
      </section>

      {/* Quick Access to the 4 Core Solutions */}
      <section aria-label="Accesos directos a soluciones">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-base font-semibold text-[#0B1F3A]">
            Soluciones principales de Contadín
          </h2>
          <span className="text-xs text-slate-500">
            Haz clic para abrir cada módulo interactivo
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {fourSolutions.map((sol) => {
            const Icon = sol.icon;
            return (
              <button
                key={sol.id}
                type="button"
                onClick={() => onNavigate(sol.id)}
                className="group text-left bg-white hover:border-[#2563EB] rounded-xl border border-slate-200 p-5 transition-colors flex flex-col justify-between focus-visible:outline-2 focus-visible:outline-blue-600"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#2563EB] flex items-center justify-center">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-mono-nums text-slate-500">
                      {sol.metric}
                    </span>
                  </div>
                  <h3 className="mt-3.5 font-display text-sm font-semibold text-slate-900 group-hover:text-[#2563EB] transition-colors">
                    {sol.title}
                  </h3>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    {sol.subtitle}
                  </p>
                </div>
                <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB]">
                  <span>Abrir módulo</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Chart + Alerts Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[#0B1F3A]">
                Ingresos y egresos mensuales
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Evolución histórica de los últimos 6 meses en pesos mexicanos (MXN)
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("financial-info")}
              className="text-xs font-semibold text-[#2563EB] hover:underline whitespace-nowrap"
            >
              Ver movimientos
            </button>
          </div>
          <IncomeExpenseChart data={monthlyHistory} />
        </div>

        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-base font-semibold text-[#0B1F3A]">
              Alertas financieras activas
            </h2>
            <span className="text-xs text-slate-500 font-mono-nums">
              {alerts.length} alertas
            </span>
          </div>
          <div className="space-y-3">
            {alerts.map((alert) => {
              const badgeStyles =
                alert.severity === "alto"
                  ? "bg-red-50 border-red-200 text-red-900"
                  : alert.severity === "medio"
                  ? "bg-amber-50 border-amber-200 text-amber-900"
                  : "bg-blue-50 border-blue-200 text-slate-900";
              const labelText =
                alert.severity === "alto"
                  ? "Prioridad alta"
                  : alert.severity === "medio"
                  ? "Atención sugerida"
                  : "Recordatorio";
              return (
                <div
                  key={alert.id}
                  className={`rounded-lg border p-3.5 ${badgeStyles}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{labelText}</span>
                    </div>
                  </div>
                  <div className="mt-1 text-sm font-semibold">{alert.titulo}</div>
                  <p className="mt-1 text-xs opacity-90 leading-relaxed">
                    {alert.descripcion}
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate(alert.targetSection)}
                    className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-2"
                  >
                    {alert.actionLabel}
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Upcoming Payments + Contadín Recommendations */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[#0B1F3A]">
                Próximos pagos y vencimientos
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Compromisos programados más cercanos
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("payment-planning")}
              className="text-xs font-semibold text-[#2563EB] hover:underline whitespace-nowrap"
            >
              Planear pagos
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {upcomingOutflows.map((item) => (
              <div
                key={item.id}
                className="py-3 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">
                    {item.concepto}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {item.proveedor} · Vence{" "}
                    <span className="font-mono-nums">
                      {formatShortDate(item.fechaVencimiento)}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono-nums text-sm font-semibold text-slate-900">
                    {formatMXN(item.monto)}
                  </div>
                  <div className="text-[11px] text-slate-500 capitalize">
                    Prioridad {item.prioridad}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <ContadinMascot size="sm" />
            <div>
              <h2 className="font-display text-base font-semibold text-[#0B1F3A]">
                Recomendaciones de Contadín
              </h2>
              <p className="text-xs text-slate-500">
                Acciones prioritarias basadas en tus datos actuales
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {recommendations.length === 0 && (
              <p className="text-xs text-slate-500">Sin recomendaciones pendientes con tus datos actuales.</p>
            )}
            {recommendations.map((rec) => (
              <RecommendationCard
                key={rec.id}
                reco={rec}
                decision={decisiones[rec.id]}
                onApprove={onApprove}
                onCorrect={onCorrect}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
