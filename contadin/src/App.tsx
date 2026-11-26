import { useEffect, useMemo, useState } from "react";
import {
  DEMO_BANK_TRANSACTIONS,
  DEMO_CFDI_INVOICES,
  DEMO_COMPANY,
  DEMO_CONTRACTS,
  DEMO_FISCAL_OBLIGATIONS,
  DEMO_HISTORICAL_MONTHLY,
  DEMO_HISTORY,
  DEMO_MOVEMENTS,
  DEMO_SCHEDULED_PAYMENTS,
} from "./data/demoData";
import {
  AlertItem,
  BankTransaction,
  CfdiInvoice,
  ChatMessage,
  CompanyProfile,
  ContractAnalysis,
  FinancialMovement,
  FiscalObligation,
  QueryHistoryItem,
  ReconciliationMatch,
  ScheduledPayment,
  SectionId,
} from "./types/finance";
import {
  computeCashFlowProjection,
  computeMonthlySummary,
  formatMXN,
  formatShortDate,
  runAutomaticReconciliation,
} from "./utils/financeEngine";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { DashboardView } from "./components/modules/DashboardView";
import { FinancialInfoView } from "./components/modules/FinancialInfoView";
import { ReconciliationView } from "./components/modules/ReconciliationView";
import { PaymentPlanningView } from "./components/modules/PaymentPlanningView";
import { FiscalView } from "./components/modules/FiscalView";
import { ContractsView } from "./components/modules/ContractsView";
import { ChatView } from "./components/modules/ChatView";
import { HistoryReportsView } from "./components/modules/HistoryReportsView";
import { SettingsView } from "./components/modules/SettingsView";
import { Decision } from "./components/RecommendationCard";
import { construirRecomendaciones, fechaReferencia, Recomendacion } from "./utils/recommendations";

const STORAGE_KEY = "contadin_pyme_state_v1";

const INITIAL_CHAT_MESSAGE: ChatMessage = {
  id: "msg-welcome",
  role: "assistant",
  content:
    "¡Hola! Soy Contadín, tu copiloto financiero. Estoy conectado a la información registrada de tu empresa (en modo demostración MXN) para ayudarte a revisar liquidez, priorizar pagos, estimar impuestos ante el SAT o analizar cláusulas de tus contratos. ¿En qué te ayudo hoy?",
  timestamp: "Inicio de sesión",
};

interface PersistedState {
  company: CompanyProfile;
  movements: FinancialMovement[];
  bankTransactions: BankTransaction[];
  invoices: CfdiInvoice[];
  matches: ReconciliationMatch[];
  payments: ScheduledPayment[];
  obligations: FiscalObligation[];
  contracts: ContractAnalysis[];
  activeContractId: string;
  chatMessages: ChatMessage[];
  history: QueryHistoryItem[];
  sessionMemory?: string[];
  decisiones?: Record<string, Decision>;
}

function loadInitialState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      if (parsed.company && Array.isArray(parsed.movements)) {
        const bankTxs = parsed.bankTransactions ?? DEMO_BANK_TRANSACTIONS;
        const invs = parsed.invoices ?? DEMO_CFDI_INVOICES;
        return {
          company: parsed.company,
          movements: parsed.movements,
          bankTransactions: bankTxs,
          invoices: invs,
          matches:
            parsed.matches && parsed.matches.length > 0
              ? parsed.matches
              : runAutomaticReconciliation(bankTxs, invs),
          payments: parsed.payments ?? DEMO_SCHEDULED_PAYMENTS,
          obligations: parsed.obligations ?? DEMO_FISCAL_OBLIGATIONS,
          contracts: parsed.contracts ?? DEMO_CONTRACTS,
          activeContractId: parsed.activeContractId ?? DEMO_CONTRACTS[0].id,
          chatMessages:
            parsed.chatMessages && parsed.chatMessages.length > 0
              ? parsed.chatMessages
              : [INITIAL_CHAT_MESSAGE],
          history: parsed.history ?? DEMO_HISTORY,
          sessionMemory: Array.isArray(parsed.sessionMemory)
            ? parsed.sessionMemory
            : [],
          decisiones: parsed.decisiones ?? {},
        };
      }
    }
  } catch {
    // Fallback to demo state if localStorage is unavailable or malformed
  }

  return {
    company: DEMO_COMPANY,
    movements: DEMO_MOVEMENTS,
    bankTransactions: DEMO_BANK_TRANSACTIONS,
    invoices: DEMO_CFDI_INVOICES,
    matches: runAutomaticReconciliation(DEMO_BANK_TRANSACTIONS, DEMO_CFDI_INVOICES),
    payments: DEMO_SCHEDULED_PAYMENTS,
    obligations: DEMO_FISCAL_OBLIGATIONS,
    contracts: DEMO_CONTRACTS,
    activeContractId: DEMO_CONTRACTS[0].id,
    chatMessages: [INITIAL_CHAT_MESSAGE],
    history: DEMO_HISTORY,
    sessionMemory: [],
    decisiones: {},
  };
}

export default function App() {
  const [state, setState] = useState<PersistedState>(() => loadInitialState());
  const [activeSection, setActiveSection] = useState<SectionId>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    try {
      // Avoid storing huge base64 PDFs inside localStorage quota
      const slimContracts = state.contracts.map((c) => ({
        ...c,
        base64Pdf: undefined,
      }));
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...state, contracts: slimContracts })
      );
    } catch {
      // Ignore quota errors
    }
  }, [state]);

  const summary = useMemo(
    () => computeMonthlySummary(state.company, state.movements, state.invoices),
    [state.company, state.movements, state.invoices]
  );

  const reconciliationPct = useMemo(() => {
    if (state.bankTransactions.length === 0) return 0;
    const confirmed = state.matches.filter(
      (m) => m.reviewStatus === "confirmada" && m.invoiceIds.length > 0
    ).length;
    return Math.round((confirmed / state.bankTransactions.length) * 100);
  }, [state.bankTransactions.length, state.matches]);

  const projection30 = useMemo(
    () =>
      computeCashFlowProjection(
        state.company.initialBalance,
        state.payments,
        30,
        fechaReferencia(state.company)
      ),
    [state.company, state.payments]
  );

  const dynamicAlerts: AlertItem[] = useMemo(() => {
    const list: AlertItem[] = [];
    if (projection30.minBalance < state.company.liquidityThreshold) {
      list.push({
        id: "al-liq",
        severity: projection30.minBalance < 0 ? "alto" : "medio",
        titulo:
          projection30.minBalance < 0
            ? "Posible faltante de liquidez en los próximos 30 días"
            : "Saldo proyectado debajo de tu reserva mínima",
        descripcion: `El saldo estimado desciende a ${formatMXN(
          projection30.minBalance
        )} alrededor del ${formatShortDate(
          projection30.minBalanceDate
        )}. Revisa tus vencimientos y considera ajustar las fechas de pago.`,
        targetSection: "payment-planning",
        actionLabel: "Ajustar planeación de pagos",
      });
    }

    const pendingConcil = state.matches.filter(
      (m) => m.reviewStatus !== "confirmada"
    ).length;
    if (pendingConcil > 0) {
      list.push({
        id: "al-rec",
        severity: "medio",
        titulo: `${pendingConcil} movimiento(s) bancario(s) por conciliar o validar`,
        descripcion:
          "Confirma coincidencias probables o vincula manualmente movimientos sin CFDI para mantener tus cifras fiscales al día.",
        targetSection: "reconciliation",
        actionLabel: "Ir a Conciliación bancaria",
      });
    }

    const nextTax = state.obligations.find((o) => o.estado !== "completada");
    if (nextTax) {
      list.push({
        id: "al-tax",
        severity: "info",
        titulo: `Próxima obligación SAT: ${formatShortDate(nextTax.fechaLimite)}`,
        descripcion: `${nextTax.titulo}. Reserva fiscal estimada del mes: ${formatMXN(
          summary.impuestoTotalEstimado
        )} (cálculo preliminar).`,
        targetSection: "fiscal",
        actionLabel: "Revisar asistencia fiscal",
      });
    }

    return list;
  }, [
    projection30.minBalance,
    projection30.minBalanceDate,
    state.company.liquidityThreshold,
    state.matches,
    state.obligations,
    summary.impuestoTotalEstimado,
  ]);

  const appendHistory = (
    modulo: QueryHistoryItem["modulo"],
    titulo: string,
    detalle: string
  ) => {
    const now = new Date();
    const fecha = `${now.toISOString().slice(0, 10)} ${now
      .toTimeString()
      .slice(0, 5)}`;
    setState((prev) => ({
      ...prev,
      history: [
        {
          id: `hist-${Date.now()}`,
          fecha,
          modulo,
          titulo,
          detalle,
        },
        ...prev.history,
      ].slice(0, 60),
    }));
  };

  const activeContract =
    state.contracts.find((c) => c.id === state.activeContractId) ||
    state.contracts[0];

  const recomendaciones = useMemo(
    () =>
      construirRecomendaciones({
        company: state.company,
        payments: state.payments,
        matches: state.matches,
        obligations: state.obligations,
        activeContract,
        impuestoEstimado: summary.impuestoTotalEstimado,
      }),
    [state.company, state.payments, state.matches, state.obligations, activeContract, summary.impuestoTotalEstimado]
  );
  const decisiones = state.decisiones ?? {};

  const MODULO_HISTORIAL: Record<Recomendacion["modulo"], QueryHistoryItem["modulo"]> = {
    "Planeación de pagos": "Planeación de Pagos",
    Conciliación: "Conciliación",
    Contratos: "Análisis de Contratos",
    Fiscal: "Asistencia Fiscal",
  };

  const aprobarRecomendacion = (reco: Recomendacion) => {
    const fecha = new Date().toISOString().slice(0, 16).replace("T", " ");
    setState((prev) => ({
      ...prev,
      payments: reco.ajuste
        ? prev.payments.map((p) => (p.id === reco.ajuste!.paymentId ? { ...p, ...reco.ajuste!.patch } : p))
        : prev.payments,
      decisiones: { ...(prev.decisiones ?? {}), [reco.id]: { estado: "aprobada", fecha, titulo: reco.titulo } },
    }));
    appendHistory(MODULO_HISTORIAL[reco.modulo], `Recomendación aprobada: ${reco.titulo}`, reco.accion);
  };

  const corregirRecomendacion = (reco: Recomendacion, nota: string) => {
    const fecha = new Date().toISOString().slice(0, 16).replace("T", " ");
    setState((prev) => ({
      ...prev,
      decisiones: { ...(prev.decisiones ?? {}), [reco.id]: { estado: "corregida", nota, fecha, titulo: reco.titulo } },
      sessionMemory: [...(prev.sessionMemory ?? []), `Corrección del usuario a "${reco.titulo}": ${nota}`].slice(-15),
    }));
    appendHistory(MODULO_HISTORIAL[reco.modulo], `Recomendación corregida: ${reco.titulo}`, nota);
  };

  const chatFinancialContext = useMemo(
    () => ({
      isDemoMode: state.company.isDemoMode,
      fechaReferencia: fechaReferencia(state.company),
      moneda: "MXN",
      empresa: {
        nombre: state.company.name,
        rfc: state.company.rfc,
        regimenFiscal: state.company.regimenFiscal,
        saldoDisponibleMXN: state.company.initialBalance,
        umbralReservaMinimaMXN: state.company.liquidityThreshold,
      },
      resumenMensualMXN: {
        ingresosMes: summary.ingresosMes,
        gastosMes: summary.gastosMes,
        flujoNetoMes: summary.flujoMes,
        ivaTrasladado: summary.ivaTrasladado,
        ivaAcreditable: summary.ivaAcreditable,
        ivaEstimadoAPagar: summary.ivaEstimado,
        isrProvisionalEstimado: summary.isrEstimado,
        coeficienteUtilidadDemo: summary.coeficienteUtilidadDemo,
      },
      conciliacionBancaria: {
        totalMovimientosBanco: state.bankTransactions.length,
        conciliadosConfirmados: state.matches.filter(
          (m) => m.reviewStatus === "confirmada" && m.invoiceIds.length > 0
        ).length,
        porcentajeConciliacion: reconciliationPct,
        pendientesOConDiferencia: state.matches
          .filter((m) => m.reviewStatus !== "confirmada" || Math.abs(m.diferenciaMonto) > 0.01)
          .map((m) => ({
            razon: m.razon,
            diferenciaMXN: m.diferenciaMonto,
            clasificacion: m.classification,
          })),
      },
      planeacionPagos30Dias: {
        saldoMinimoProyectadoMXN: projection30.minBalance,
        fechaSaldoMinimo: projection30.minBalanceDate,
        saldoFinalProyectado30dMXN: projection30.endingBalance,
        ahorroPotencialProntoPagoMXN: projection30.potentialSavings,
        proximosCompromisos: state.payments
          .filter((p) => p.estatus === "programado")
          .slice(0, 8)
          .map((p) => ({
            concepto: p.concepto,
            tipo: p.tipo,
            montoMXN: p.monto,
            fechaProgramada: p.fechaProgramada,
            vencimiento: p.fechaVencimiento,
            prioridad: p.prioridad,
            descuentoProntoPagoPct: p.descuentoProntoPagoPct ?? 0,
          })),
      },
      movimientosRecientes: state.movements.slice(0, 12).map((m) => ({
        fecha: m.fecha,
        concepto: m.concepto,
        categoria: m.categoria,
        contraparte: m.contraparte,
        tipo: m.tipo,
        montoMXN: m.monto,
        cfdi: m.cfdiRelacionado ?? null,
      })),
      calendarioFiscal: state.obligations.map((o) => ({
        titulo: o.titulo,
        periodicidad: o.periodicidad,
        fechaLimite: o.fechaLimite,
        estado: o.estado,
      })),
      contratoActivo: activeContract
        ? {
            titulo: activeContract.titulo,
            partes: activeContract.partes,
            vigencia: activeContract.vigencia,
            condicionesPago: activeContract.condicionesPago,
            resumenEjecutivo: activeContract.resumenEjecutivo,
            hallazgos: activeContract.hallazgos,
          }
        : null,
      recomendacionesActivas: recomendaciones.map((r) => ({
        titulo: r.titulo,
        porque: r.porque,
        accion: r.accion,
        decisionUsuario: decisiones[r.id] ?? "pendiente",
      })),
      totalContratosCargados: state.contracts.map((c) => ({
        titulo: c.titulo,
        vigencia: c.vigencia,
        condicionesPago: c.condicionesPago,
      })),
    }),
    [state, summary, reconciliationPct, projection30, activeContract, recomendaciones, decisiones]
  );

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar
        activeSection={activeSection}
        onSelect={setActiveSection}
        companyName={state.company.name}
        isDemoMode={state.company.isDemoMode}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          activeSection={activeSection}
          companyName={state.company.name}
          responsable={state.company.responsable}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onOpenChat={() => setActiveSection("chat")}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          <div
            role="note"
            className="mb-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-950 leading-relaxed"
          >
            <strong>Aviso:</strong> las cifras, proyecciones e impuestos que muestra Contadín son <strong>estimaciones</strong> y no
            sustituyen la asesoría de un contador o abogado. Contadín <strong>nunca ejecuta pagos, presenta declaraciones ni acepta
            contratos</strong>: solo recomienda y tú decides.
          </div>
          {activeSection === "dashboard" && (
            <DashboardView
              company={state.company}
              monthlyHistory={DEMO_HISTORICAL_MONTHLY}
              movements={state.movements}
              payments={state.payments}
              reconciliationPct={reconciliationPct}
              alerts={dynamicAlerts}
              summary={summary}
              contractsCount={state.contracts.length}
              recomendaciones={recomendaciones}
              decisiones={decisiones}
              onApprove={aprobarRecomendacion}
              onCorrect={corregirRecomendacion}
              onNavigate={setActiveSection}
            />
          )}

          {activeSection === "financial-info" && (
            <FinancialInfoView
              company={state.company}
              movements={state.movements}
              onAddMovement={(mov) => {
                const created: FinancialMovement = {
                  ...mov,
                  id: `mov-${Date.now()}`,
                };
                setState((prev) => ({
                  ...prev,
                  company: {
                    ...prev.company,
                    initialBalance:
                      mov.tipo === "ingreso"
                        ? prev.company.initialBalance + mov.monto
                        : prev.company.initialBalance - mov.monto,
                  },
                  movements: [created, ...prev.movements],
                }));
              }}
              onDeleteMovement={(id) => {
                setState((prev) => {
                  const target = prev.movements.find((m) => m.id === id);
                  const balanceDelta = target
                    ? target.tipo === "ingreso"
                      ? -target.monto
                      : target.monto
                    : 0;
                  return {
                    ...prev,
                    company: {
                      ...prev.company,
                      initialBalance: prev.company.initialBalance + balanceDelta,
                    },
                    movements: prev.movements.filter((m) => m.id !== id),
                  };
                });
              }}
              onBack={() => setActiveSection("dashboard")}
              onNavigate={setActiveSection}
            />
          )}

          {activeSection === "reconciliation" && (
            <ReconciliationView
              bankTransactions={state.bankTransactions}
              invoices={state.invoices}
              matches={state.matches}
              onRunReconciliation={() => {
                const updated = runAutomaticReconciliation(
                  state.bankTransactions,
                  state.invoices,
                  state.matches
                );
                setState((prev) => ({ ...prev, matches: updated }));
                appendHistory(
                  "Conciliación",
                  "Ejecución de conciliación bancaria automática",
                  `Se procesaron ${state.bankTransactions.length} movimientos bancarios contra ${state.invoices.length} facturas CFDI.`
                );
              }}
              onUpdateMatchStatus={(matchId, status) => {
                setState((prev) => ({
                  ...prev,
                  matches: prev.matches.map((m) =>
                    m.id === matchId ? { ...m, reviewStatus: status } : m
                  ),
                }));
              }}
              onManualLink={(matchId, invoiceId) => {
                setState((prev) => {
                  const inv = prev.invoices.find((i) => i.id === invoiceId);
                  return {
                    ...prev,
                    matches: prev.matches.map((m) => {
                      if (m.id !== matchId) return m;
                      const tx = prev.bankTransactions.find(
                        (t) => t.id === m.bankTransactionId
                      );
                      const diff =
                        tx && inv ? Number((tx.monto - inv.total).toFixed(2)) : 0;
                      return {
                        ...m,
                        invoiceIds: [invoiceId],
                        classification: Math.abs(diff) < 0.01 ? "exacta" : "probable",
                        confidence: 100,
                        razon: "Vinculación manual confirmada por usuario",
                        diferenciaMonto: diff,
                        reviewStatus: "confirmada",
                      };
                    }),
                  };
                });
              }}
              onAddBankTransactions={(txs) => {
                setState((prev) => {
                  const nextTxs = [...txs, ...prev.bankTransactions];
                  const nextMatches = runAutomaticReconciliation(
                    nextTxs,
                    prev.invoices,
                    prev.matches
                  );
                  return {
                    ...prev,
                    bankTransactions: nextTxs,
                    matches: nextMatches,
                  };
                });
              }}
              onAddInvoices={(invs) => {
                setState((prev) => {
                  const nextInvs = [...invs, ...prev.invoices];
                  const nextMatches = runAutomaticReconciliation(
                    prev.bankTransactions,
                    nextInvs,
                    prev.matches
                  );
                  return {
                    ...prev,
                    invoices: nextInvs,
                    matches: nextMatches,
                  };
                });
              }}
              onRestoreDemo={() => {
                setState((prev) => ({
                  ...prev,
                  bankTransactions: DEMO_BANK_TRANSACTIONS,
                  invoices: DEMO_CFDI_INVOICES,
                  matches: runAutomaticReconciliation(
                    DEMO_BANK_TRANSACTIONS,
                    DEMO_CFDI_INVOICES
                  ),
                }));
              }}
              onBack={() => setActiveSection("dashboard")}
            />
          )}

          {activeSection === "payment-planning" && (
            <PaymentPlanningView
              company={state.company}
              payments={state.payments}
              recomendaciones={recomendaciones.filter((r) => r.modulo === "Planeación de pagos")}
              decisiones={decisiones}
              onApprove={aprobarRecomendacion}
              onCorrect={corregirRecomendacion}
              onUpdatePayment={(id, patch) => {
                setState((prev) => ({
                  ...prev,
                  payments: prev.payments.map((p) =>
                    p.id === id ? { ...p, ...patch } : p
                  ),
                }));
              }}
              onAddPayment={(item) => {
                setState((prev) => ({
                  ...prev,
                  payments: [
                    ...prev.payments,
                    { ...item, id: `pay-${Date.now()}` },
                  ],
                }));
              }}
              onResetDemo={() => {
                setState((prev) => ({
                  ...prev,
                  payments: DEMO_SCHEDULED_PAYMENTS,
                  decisiones: {},
                }));
              }}
              onBack={() => setActiveSection("dashboard")}
            />
          )}

          {activeSection === "fiscal" && (
            <FiscalView
              company={state.company}
              obligations={state.obligations}
              taxSummary={summary}
              onToggleObligation={(id) => {
                setState((prev) => ({
                  ...prev,
                  obligations: prev.obligations.map((o) =>
                    o.id === id
                      ? {
                          ...o,
                          estado:
                            o.estado === "completada" ? "pendiente" : "completada",
                        }
                      : o
                  ),
                }));
              }}
              onLogHistory={(titulo, detalle) =>
                appendHistory("Asistencia Fiscal", titulo, detalle)
              }
              onBack={() => setActiveSection("dashboard")}
            />
          )}

          {activeSection === "contracts" && (
            <ContractsView
              contracts={state.contracts}
              activeContractId={state.activeContractId}
              onSelectContract={(id) =>
                setState((prev) => ({ ...prev, activeContractId: id }))
              }
              onAddContract={(contract) =>
                setState((prev) => ({
                  ...prev,
                  contracts: [contract, ...prev.contracts],
                  activeContractId: contract.id,
                }))
              }
              onLogHistory={(titulo, detalle) =>
                appendHistory("Análisis de Contratos", titulo, detalle)
              }
              onBack={() => setActiveSection("dashboard")}
            />
          )}

          {activeSection === "chat" && (
            <ChatView
              messages={state.chatMessages}
              financialContext={chatFinancialContext}
              sessionMemory={state.sessionMemory ?? []}
              onSendMessage={(userText, assistantReply, meta) => {
                const time = new Date().toLocaleTimeString("es-MX", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const memoryEntry =
                  userText.length >= 12
                    ? `[${time}] Usuario consultó/indicó: ${userText.slice(0, 160)}`
                    : null;
                setState((prev) => ({
                  ...prev,
                  sessionMemory: memoryEntry
                    ? [...(prev.sessionMemory ?? []), memoryEntry].slice(-15)
                    : prev.sessionMemory ?? [],
                  chatMessages: [
                    ...prev.chatMessages,
                    {
                      id: `u-${Date.now()}`,
                      role: "user",
                      content: userText,
                      timestamp: time,
                    },
                    {
                      id: `a-${Date.now() + 1}`,
                      role: "assistant",
                      content: assistantReply,
                      timestamp: time,
                      sources: meta?.sources,
                      toolsUsed: meta?.toolsUsed,
                      referenceDate: meta?.referenceDate,
                    },
                  ],
                }));
                appendHistory(
                  "Chat",
                  userText.slice(0, 75),
                  assistantReply.slice(0, 180)
                );
              }}
              onClearChat={() =>
                setState((prev) => ({
                  ...prev,
                  chatMessages: [INITIAL_CHAT_MESSAGE],
                  sessionMemory: [],
                }))
              }
              onBack={() => setActiveSection("dashboard")}
            />
          )}

          {activeSection === "history" && (
            <HistoryReportsView
              company={state.company}
              history={state.history}
              movements={state.movements}
              summary={summary}
              reconciliationPct={reconciliationPct}
              onBack={() => setActiveSection("dashboard")}
            />
          )}

          {activeSection === "settings" && (
            <SettingsView
              company={state.company}
              onSaveCompany={(updated) =>
                setState((prev) => ({ ...prev, company: updated }))
              }
              onResetAllDemo={() => {
                localStorage.removeItem(STORAGE_KEY);
                setState({
                  company: DEMO_COMPANY,
                  movements: DEMO_MOVEMENTS,
                  bankTransactions: DEMO_BANK_TRANSACTIONS,
                  invoices: DEMO_CFDI_INVOICES,
                  matches: runAutomaticReconciliation(
                    DEMO_BANK_TRANSACTIONS,
                    DEMO_CFDI_INVOICES
                  ),
                  payments: DEMO_SCHEDULED_PAYMENTS,
                  obligations: DEMO_FISCAL_OBLIGATIONS,
                  contracts: DEMO_CONTRACTS,
                  activeContractId: DEMO_CONTRACTS[0].id,
                  chatMessages: [INITIAL_CHAT_MESSAGE],
                  history: DEMO_HISTORY,
                  sessionMemory: [],
                  decisiones: {},
                });
              }}
              onBack={() => setActiveSection("dashboard")}
            />
          )}
        </main>
      </div>
    </div>
  );
}
