/**
 * Recomendaciones calculadas a partir de los datos de la empresa (nada escrito a mano).
 * Cada recomendación explica el porqué y propone una acción que el usuario aprueba o corrige.
 * Contadín nunca ejecuta pagos: "Aprobar" solo actualiza el plan dentro de la app.
 */
import {
  CompanyProfile,
  ContractAnalysis,
  FiscalObligation,
  ReconciliationMatch,
  ScheduledPayment,
  SectionId,
} from "../types/finance";
import { computeCashFlowProjection, formatMXN, formatShortDate } from "./financeEngine";

export const FECHA_DEMO = "2026-11-25";

export function fechaReferencia(company: CompanyProfile): string {
  return company.isDemoMode ? FECHA_DEMO : new Date().toISOString().slice(0, 10);
}

export interface Recomendacion {
  id: string;
  modulo: "Planeación de pagos" | "Conciliación" | "Contratos" | "Fiscal";
  titulo: string;
  porque: string;
  accion: string;
  confianza: "alta" | "media" | "baja";
  prioridad: 1 | 2 | 3;
  target: SectionId;
  cta: string;
  /** Cambio que se aplica al plan de pagos simulado si el usuario aprueba. */
  ajuste?: { paymentId: string; patch: Partial<ScheduledPayment> };
}

const HORIZONTE = 90;

function proyectar(saldo: number, pagos: ScheduledPayment[], fecha: string) {
  return computeCashFlowProjection(saldo, pagos, HORIZONTE, fecha);
}

function conCambio(pagos: ScheduledPayment[], id: string, patch: Partial<ScheduledPayment>) {
  return pagos.map((p) => (p.id === id ? { ...p, ...patch } : p));
}

export interface EntradaRecomendaciones {
  company: CompanyProfile;
  payments: ScheduledPayment[];
  matches: ReconciliationMatch[];
  obligations: FiscalObligation[];
  activeContract?: ContractAnalysis;
  impuestoEstimado: number;
}

export function recomendacionesPlaneacion(company: CompanyProfile, payments: ScheduledPayment[]): Recomendacion[] {
  const fecha = fechaReferencia(company);
  const reserva = company.liquidityThreshold;
  const base = proyectar(company.initialBalance, payments, fecha);
  const recos: Recomendacion[] = [];
  const usados = new Set<string>();

  const egresos = payments.filter((p) => p.tipo === "egreso" && p.estatus === "programado");

  // 1. Bache de liquidez: ¿qué pago no crítico conviene recorrer (sin pasar su vencimiento)?
  if (base.minBalance < reserva) {
    let mejor: { p: ScheduledPayment; min: number } | null = null;
    for (const p of egresos) {
      if (p.prioridad === "critica" || p.fechaVencimiento <= p.fechaProgramada) continue;
      if (p.fechaProgramada > base.minBalanceDate) continue;
      const alt = proyectar(company.initialBalance, conCambio(payments, p.id, { fechaProgramada: p.fechaVencimiento }), fecha);
      if (alt.minBalance > base.minBalance + 1 && (!mejor || alt.minBalance > mejor.min)) {
        mejor = { p, min: alt.minBalance };
      }
    }
    if (mejor) {
      const { p, min } = mejor;
      usados.add(p.id);
      const resuelve = min >= reserva;
      recos.push({
        id: `liq-${p.id}`,
        modulo: "Planeación de pagos",
        titulo: `Recorre "${p.concepto}" al ${formatShortDate(p.fechaVencimiento)}`,
        porque:
          `Con el plan actual tu saldo baja a ${formatMXN(base.minBalance)} alrededor del ${formatShortDate(base.minBalanceDate)} ` +
          `(reserva mínima: ${formatMXN(reserva)}). Pagar ${formatMXN(p.monto)} el ${formatShortDate(p.fechaVencimiento)} en lugar del ` +
          `${formatShortDate(p.fechaProgramada)} no pasa su vencimiento y sube tu saldo mínimo a ${formatMXN(min)}` +
          (resuelve ? ", por encima de tu reserva." : ". Ayuda, pero aún no basta: acelera cobranza o negocia plazos."),
        accion: `Programar el pago a ${p.proveedor} el ${formatShortDate(p.fechaVencimiento)} en tu plan.`,
        confianza: "media",
        prioridad: 1,
        target: "payment-planning",
        cta: "Ver en Planeación",
        ajuste: { paymentId: p.id, patch: { fechaProgramada: p.fechaVencimiento } },
      });
    } else {
      const cobros = payments
        .filter((p) => p.tipo === "ingreso_esperado" && p.estatus === "programado" && p.fechaProgramada >= fecha)
        .sort((a, b) => a.fechaProgramada.localeCompare(b.fechaProgramada))
        .slice(0, 3);
      recos.push({
        id: "liq-cobranza",
        modulo: "Planeación de pagos",
        titulo: "Acelera la cobranza para cubrir el bache de liquidez",
        porque:
          `Tu saldo proyectado baja a ${formatMXN(base.minBalance)} alrededor del ${formatShortDate(base.minBalanceDate)} y no hay pagos ` +
          `no críticos que se puedan recorrer sin pasar su vencimiento.` +
          (cobros.length
            ? ` Cobros próximos: ${cobros.map((c) => `${c.proveedor} ${formatMXN(c.monto)} (${formatShortDate(c.fechaProgramada)})`).join("; ")}.`
            : ""),
        accion: "Envía recordatorio a esos clientes y ofrece pago anticipado; si no alcanza, negocia plazo con un proveedor.",
        confianza: "media",
        prioridad: 1,
        target: "payment-planning",
        cta: "Ver en Planeación",
      });
    }
  }

  // 2. Descuentos por pronto pago: solo si no rompen la reserva
  for (const p of egresos) {
    if (!p.descuentoProntoPagoPct || p.descuentoAplicado || !p.fechaLimiteDescuento || usados.has(p.id)) continue;
    if (p.fechaLimiteDescuento < fecha) continue;
    const ahorro = (p.monto * p.descuentoProntoPagoPct) / 100;
    const fechaPago = p.fechaLimiteDescuento < p.fechaProgramada ? p.fechaLimiteDescuento : p.fechaProgramada;
    const patch = { fechaProgramada: fechaPago, descuentoAplicado: true };
    const alt = proyectar(company.initialBalance, conCambio(payments, p.id, patch), fecha);
    // Solo conviene si no te deja bajo la reserva, o al menos no empeora tu punto más bajo y nunca queda en negativo
    const conviene = alt.minBalance >= reserva || (alt.minBalance >= base.minBalance && alt.minBalance >= 0);
    if (conviene) {
      recos.push({
        id: `desc-${p.id}`,
        modulo: "Planeación de pagos",
        titulo: `Toma el descuento de ${p.descuentoProntoPagoPct}% con ${p.proveedor}`,
        porque:
          `Pagando el ${formatShortDate(fechaPago)} ahorras ${formatMXN(ahorro)} y tu saldo mínimo proyectado queda en ` +
          `${formatMXN(alt.minBalance)}${alt.minBalance >= reserva ? ", arriba de tu reserva" : ", sin empeorar tu punto más bajo"}.`,
        accion: `Programar el pago de ${formatMXN(p.monto - ahorro)} el ${formatShortDate(fechaPago)} con descuento en tu plan.`,
        confianza: "alta",
        prioridad: 2,
        target: "payment-planning",
        cta: "Ver en Planeación",
        ajuste: { paymentId: p.id, patch },
      });
    } else {
      recos.push({
        id: `nodesc-${p.id}`,
        modulo: "Planeación de pagos",
        titulo: `Por ahora no adelantes el pago a ${p.proveedor} por el descuento`,
        porque:
          `El ${p.descuentoProntoPagoPct}% te ahorraría ${formatMXN(ahorro)}, pero pagar el ${formatShortDate(fechaPago)} bajaría tu saldo ` +
          `mínimo a ${formatMXN(alt.minBalance)} (reserva: ${formatMXN(reserva)}). Primero asegura liquidez para tus pagos críticos.`,
        accion: `Mantener el pago el ${formatShortDate(p.fechaProgramada)}; revisar de nuevo si entra un cobro antes del ${formatShortDate(p.fechaLimiteDescuento)}.`,
        confianza: "media",
        prioridad: 3,
        target: "payment-planning",
        cta: "Ver en Planeación",
      });
    }
  }
  return recos;
}

export function pagosNoNegociables(company: CompanyProfile, payments: ScheduledPayment[], dias = 30) {
  const fecha = fechaReferencia(company);
  const limite = new Date(fecha);
  limite.setDate(limite.getDate() + dias);
  const lim = limite.toISOString().slice(0, 10);
  return payments
    .filter((p) => p.tipo === "egreso" && p.estatus === "programado" && p.prioridad === "critica" && p.fechaProgramada <= lim)
    .sort((a, b) => a.fechaProgramada.localeCompare(b.fechaProgramada));
}

export function construirRecomendaciones(e: EntradaRecomendaciones): Recomendacion[] {
  const recos: Recomendacion[] = [...recomendacionesPlaneacion(e.company, e.payments)];
  const fecha = fechaReferencia(e.company);

  // Fiscal: apartar impuestos antes de la próxima fecha límite
  const pendientes = e.obligations
    .filter((o) => o.estado !== "completada" && o.fechaLimite >= fecha)
    .sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite));
  const proxima = pendientes.find((o) => /ISR|IVA|provisional/i.test(o.titulo)) ?? pendientes[0];
  if (proxima && e.impuestoEstimado > 0) {
    recos.push({
      id: `fis-${proxima.id}`,
      modulo: "Fiscal",
      titulo: `Aparta ${formatMXN(e.impuestoEstimado)} para impuestos (estimación)`,
      porque:
        `Es el IVA + ISR provisional estimado con tus CFDI del mes. La próxima obligación es "${proxima.titulo}" ` +
        `el ${formatShortDate(proxima.fechaLimite)}. Separarlo evita gastar dinero que ya es del SAT.`,
      accion: "Reservar ese monto y validar la cifra con tu contador antes de declarar (Contadín no presenta declaraciones).",
      confianza: "media",
      prioridad: 2,
      target: "fiscal",
      cta: "Revisar asistencia fiscal",
    });
  }

  // Conciliación: diferencias y movimientos sin CFDI
  const conDiferencia = e.matches.filter(
    (m) => m.reviewStatus === "pendiente" && m.invoiceIds.length > 0 && Math.abs(m.diferenciaMonto) > 0.01 && !m.esPagoParcialOAgrupado
  );
  const sinCfdi = e.matches.filter((m) => m.classification === "sin_coincidencia" && m.reviewStatus !== "rechazada");
  if (conDiferencia.length || sinCfdi.length) {
    const partes: string[] = [];
    if (conDiferencia.length) {
      const total = conDiferencia.reduce((s, m) => s + Math.abs(m.diferenciaMonto), 0);
      partes.push(`${conDiferencia.length} coincidencia(s) con diferencias por ${formatMXN(total)}`);
    }
    if (sinCfdi.length) partes.push(`${sinCfdi.length} movimiento(s) sin CFDI identificado`);
    recos.push({
      id: `conc-${conDiferencia.length}-${sinCfdi.length}`,
      modulo: "Conciliación",
      titulo: "Revisa los movimientos pendientes de conciliar",
      porque: `Hay ${partes.join(" y ")}. Sin CFDI no puedes deducir el gasto ni acreditar su IVA.`,
      accion: "Confirma o corrige cada coincidencia y solicita las facturas faltantes.",
      confianza: "alta",
      prioridad: 2,
      target: "reconciliation",
      cta: "Revisar conciliación",
    });
  }

  // Contratos: hallazgos de atención alta del contrato activo
  for (const h of (e.activeContract?.hallazgos ?? []).filter((h) => h.nivelAtencion === "alto").slice(0, 2)) {
    recos.push({
      id: `ctr-${e.activeContract!.id}-${h.elemento}`,
      modulo: "Contratos",
      titulo: `${h.elemento} · ${e.activeContract!.titulo}`,
      porque: h.descripcion,
      accion: `${h.recomendacion} Valídalo con un abogado.`,
      confianza: e.activeContract!.isDemo ? "media" : "alta",
      prioridad: 2,
      target: "contracts",
      cta: "Ver hallazgos del contrato",
    });
  }

  return recos.sort((a, b) => a.prioridad - b.prioridad);
}
