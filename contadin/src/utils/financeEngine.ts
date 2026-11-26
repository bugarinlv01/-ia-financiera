import {
  BankTransaction,
  CfdiInvoice,
  CompanyProfile,
  FinancialMovement,
  MatchClassification,
  ReconciliationMatch,
  ScheduledPayment,
} from "../types/finance";

export function formatMXN(value: number, showDecimals = true): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(value);
}

export function formatShortDate(isoDate: string): string {
  if (!isoDate) return "—";
  const parts = isoDate.slice(0, 10).split("-");
  if (parts.length !== 3) return isoDate;
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a.slice(0, 10)).getTime();
  const db = new Date(b.slice(0, 10)).getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return 999;
  return Math.abs(Math.round((da - db) / (1000 * 60 * 60 * 24)));
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !["para", "del", "las", "los", "con", "por", "spei", "pago"].includes(t))
  );
}

function tokenOverlapScore(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let matches = 0;
  ta.forEach((tok) => {
    if (tb.has(tok)) matches++;
  });
  return matches / Math.min(ta.size, tb.size);
}

export function runAutomaticReconciliation(
  bankTransactions: BankTransaction[],
  invoices: CfdiInvoice[],
  existingMatches?: ReconciliationMatch[]
): ReconciliationMatch[] {
  const existingMap = new Map<string, ReconciliationMatch>();
  (existingMatches ?? []).forEach((m) => existingMap.set(m.bankTransactionId, m));

  // Saldo pendiente por factura: permite varios pagos parciales a una misma factura
  const pendiente = new Map<string, number>(invoices.map((i) => [i.id, i.total]));
  const aplicar = (ids: string[], monto: number) => {
    if (ids.length === 1) {
      pendiente.set(ids[0], Math.max(0, (pendiente.get(ids[0]) ?? 0) - monto));
    } else {
      ids.forEach((id) => pendiente.set(id, 0));
    }
  };
  const results: ReconciliationMatch[] = [];

  const ordenadas = [...bankTransactions].sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (const tx of ordenadas) {
    const prev = existingMap.get(tx.id);
    if (prev && prev.reviewStatus === "confirmada" && prev.invoiceIds.length > 0) {
      aplicar(prev.invoiceIds, tx.monto);
      results.push(prev);
      continue;
    }

    const expectedInvoiceType = tx.tipo === "abono" ? "emitida" : "recibida";
    const candidates = invoices.filter(
      (inv) => inv.tipo === expectedInvoiceType && (pendiente.get(inv.id) ?? 0) > 1
    );

    let bestInvoice: CfdiInvoice | null = null;
    let bestScore = 0;
    let bestReason = "";
    let bestDiff = 0;

    for (const inv of candidates) {
      const saldo = pendiente.get(inv.id) ?? inv.total;
      const yaTienePagos = saldo < inv.total - 0.01;
      const diff = Math.abs(tx.monto - saldo);
      const pctDiff = saldo > 0 ? diff / saldo : 1;
      const dayDiff = daysBetween(tx.fecha, inv.fecha);
      const nameOverlap = tokenOverlapScore(
        `${tx.contraparte} ${tx.concepto}`,
        `${inv.contraparte} ${inv.folio} ${inv.concepto}`
      );
      const folioInConcept =
        inv.folio && tx.concepto.toLowerCase().includes(inv.folio.replace(/[^a-z0-9]/gi, "").toLowerCase());

      let score = 0;
      const reasons: string[] = [];

      // Amount score (up to 55 pts)
      if (diff < 0.01) {
        score += 55;
        reasons.push(yaTienePagos ? "liquida el saldo pendiente" : "monto exacto");
      } else if (pctDiff <= 0.015) {
        score += 42;
        reasons.push(`diferencia mínima de ${formatMXN(diff)}`);
      } else if (tx.monto < saldo && tx.monto / inv.total >= 0.2) {
        score += 32;
        reasons.push(`posible pago parcial (saldo pendiente ${formatMXN(saldo - tx.monto)})`);
      }

      // Date score (up to 20 pts)
      if (dayDiff <= 3) {
        score += 20;
        reasons.push(`fecha cercana (${dayDiff} d)`);
      } else if (dayDiff <= 10) {
        score += 12;
        reasons.push(`diferencia de ${dayDiff} días`);
      } else if (dayDiff <= 25) {
        score += 4;
      }

      // Concept & counterparty score (up to 25 pts)
      if (folioInConcept) {
        score += 15;
        reasons.push(`referencia ${inv.folio}`);
      }
      score += Math.round(nameOverlap * 20);
      if (nameOverlap >= 0.4) {
        reasons.push("coincidencia en proveedor/cliente");
      }

      const clamped = Math.min(99, score);
      if (clamped > bestScore) {
        bestScore = clamped;
        bestInvoice = inv;
        bestDiff = Number((tx.monto - saldo).toFixed(2));
        bestReason = reasons.length > 0 ? reasons.join(" · ") : "similitud general";
      }
    }

    // Check grouped payment (sum of 2 unused invoices) if no single strong match
    if ((!bestInvoice || bestScore < 70) && candidates.length >= 2) {
      for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
          const sum = (pendiente.get(candidates[i].id) ?? 0) + (pendiente.get(candidates[j].id) ?? 0);
          const diff = Math.abs(tx.monto - sum);
          if (diff <= 5) {
            const pairOverlap = Math.max(
              tokenOverlapScore(tx.contraparte, candidates[i].contraparte),
              tokenOverlapScore(tx.contraparte, candidates[j].contraparte)
            );
            if (pairOverlap >= 0.3 || diff < 0.01) {
              aplicar([candidates[i].id, candidates[j].id], tx.monto);
              results.push({
                id: `match-${tx.id}`,
                bankTransactionId: tx.id,
                invoiceIds: [candidates[i].id, candidates[j].id],
                classification: "probable",
                confidence: 84,
                razon: `Pago agrupado (${candidates[i].folio} + ${candidates[j].folio})`,
                diferenciaMonto: Number((tx.monto - sum).toFixed(2)),
                reviewStatus: prev?.reviewStatus === "rechazada" ? "rechazada" : "pendiente",
                esPagoParcialOAgrupado: true,
              });
              bestInvoice = null;
              bestScore = 999; // marker handled
              break;
            }
          }
        }
        if (bestScore === 999) break;
      }
    }

    if (bestScore === 999) continue;

    if (bestInvoice && bestScore >= 55) {
      aplicar([bestInvoice.id], tx.monto);
      let classification: MatchClassification = "probable";
      if (bestScore >= 90 && Math.abs(bestDiff) < 0.01) {
        classification = "exacta";
      }
      const isPartial =
        (Math.abs(bestDiff) > 5 && bestDiff < 0) || (pendiente.get(bestInvoice.id) ?? 0) + tx.monto < bestInvoice.total - 0.01;
      results.push({
        id: `match-${tx.id}`,
        bankTransactionId: tx.id,
        invoiceIds: [bestInvoice.id],
        classification,
        confidence: bestScore,
        razon: bestReason.charAt(0).toUpperCase() + bestReason.slice(1),
        diferenciaMonto: bestDiff,
        reviewStatus: prev?.reviewStatus ?? (classification === "exacta" ? "confirmada" : "pendiente"),
        esPagoParcialOAgrupado: isPartial,
      });
    } else {
      results.push({
        id: `match-${tx.id}`,
        bankTransactionId: tx.id,
        invoiceIds: [],
        classification: "sin_coincidencia",
        confidence: bestScore,
        razon: "No se encontró CFDI con monto o contraparte compatible",
        diferenciaMonto: tx.monto,
        reviewStatus: "pendiente",
      });
    }
  }

  // Conserva el orden original de los movimientos
  const orden = new Map(bankTransactions.map((t, i) => [t.id, i]));
  return results.sort((a, b) => (orden.get(a.bankTransactionId) ?? 0) - (orden.get(b.bankTransactionId) ?? 0));
}

export function parseBankCsv(csvText: string): BankTransaction[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(delimiter).map((h) => h.trim().toLowerCase());

  const findIdx = (keys: string[]) => headers.findIndex((h) => keys.some((k) => h.includes(k)));
  const dateIdx = findIdx(["fecha", "date"]);
  const conceptIdx = findIdx(["concepto", "descrip", "detalle"]);
  const amountIdx = findIdx(["monto", "importe", "amount"]);
  const typeIdx = findIdx(["tipo", "naturaleza", "abono"]);
  const partyIdx = findIdx(["contraparte", "proveedor", "cliente", "beneficiario"]);
  const refIdx = findIdx(["referencia", "ref", "folio"]);

  const parsed: BankTransaction[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map((c) => c.replace(/^"|"$/g, "").trim());
    if (cols.length < 2) continue;

    const rawAmount = Number((cols[amountIdx >= 0 ? amountIdx : 2] ?? "0").replace(/[$,\s]/g, ""));
    if (Number.isNaN(rawAmount) || rawAmount === 0) continue;

    const rawType = typeIdx >= 0 ? (cols[typeIdx] ?? "").toLowerCase() : "";
    const tipo: "abono" | "cargo" =
      rawType.includes("abono") || rawType.includes("ingreso") || (rawType === "" && rawAmount > 0 && typeIdx < 0)
        ? rawAmount < 0
          ? "cargo"
          : "abono"
        : rawType.includes("cargo") || rawType.includes("egreso") || rawAmount < 0
        ? "cargo"
        : "abono";

    parsed.push({
      id: `csv-tx-${Date.now()}-${i}`,
      fecha: (cols[dateIdx >= 0 ? dateIdx : 0] || "2026-11-25").slice(0, 10),
      banco: "Estado de cuenta importado (CSV)",
      concepto: cols[conceptIdx >= 0 ? conceptIdx : 1] || `Movimiento #${i}`,
      referencia: cols[refIdx >= 0 ? refIdx : -1] || `CSV-${1000 + i}`,
      contraparte: cols[partyIdx >= 0 ? partyIdx : -1] || cols[conceptIdx >= 0 ? conceptIdx : 1] || "Contraparte CSV",
      tipo,
      monto: Math.abs(rawAmount),
    });
  }
  return parsed;
}

export function parseCfdiXml(xmlText: string, fileName: string): CfdiInvoice | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "application/xml");
    if (doc.querySelector("parsererror")) return null;

    const getAttr = (el: Element | null, names: string[]): string => {
      if (!el) return "";
      for (const n of names) {
        const val = el.getAttribute(n);
        if (val) return val;
      }
      return "";
    };

    const comprobante =
      doc.getElementsByTagName("cfdi:Comprobante")[0] ||
      doc.getElementsByTagName("Comprobante")[0];
    if (!comprobante) return null;

    const emisor =
      doc.getElementsByTagName("cfdi:Emisor")[0] || doc.getElementsByTagName("Emisor")[0];
    const receptor =
      doc.getElementsByTagName("cfdi:Receptor")[0] || doc.getElementsByTagName("Receptor")[0];
    const timbre =
      doc.getElementsByTagName("tfd:TimbreFiscalDigital")[0] ||
      doc.getElementsByTagName("TimbreFiscalDigital")[0];
    const conceptoEl =
      doc.getElementsByTagName("cfdi:Concepto")[0] || doc.getElementsByTagName("Concepto")[0];

    const total = Number(getAttr(comprobante, ["Total", "total"]) || 0);
    const subtotal = Number(getAttr(comprobante, ["SubTotal", "subTotal", "subtotal"]) || total / 1.16);
    const fecha = (getAttr(comprobante, ["Fecha", "fecha"]) || "2026-11-25").slice(0, 10);
    const folio = getAttr(comprobante, ["Folio", "folio"]) || fileName.replace(/\.xml$/i, "");
    const emisorNombre = getAttr(emisor, ["Nombre", "nombre"]) || "Emisor CFDI";
    const emisorRfc = getAttr(emisor, ["Rfc", "rfc", "RFC"]) || "XAXX010101000";
    const receptorNombre = getAttr(receptor, ["Nombre", "nombre"]) || "";
    const uuid = getAttr(timbre, ["UUID", "uuid"]) || `XML-${Date.now()}`;
    const conceptoDesc =
      getAttr(conceptoEl, ["Descripcion", "descripcion"]) || "Concepto importado desde CFDI XML";

    const isEmitida = emisorNombre.toLowerCase().includes("bajío") || emisorNombre.toLowerCase().includes("bajio");

    return {
      id: `xml-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      folio,
      uuid,
      fecha,
      contraparte: isEmitida ? receptorNombre || emisorNombre : emisorNombre,
      rfc: emisorRfc,
      tipo: isEmitida ? "emitida" : "recibida",
      subtotal: Number(subtotal.toFixed(2)),
      iva: Number((total - subtotal).toFixed(2)),
      total: Number(total.toFixed(2)),
      concepto: conceptoDesc,
    };
  } catch {
    return null;
  }
}

export interface CashFlowPoint {
  date: string;
  label: string;
  balance: number;
  inflows: number;
  outflows: number;
  events: string[];
}

export function computeCashFlowProjection(
  currentBalance: number,
  payments: ScheduledPayment[],
  horizonDays: 30 | 60 | 90,
  startDateStr = "2026-11-25"
): {
  points: CashFlowPoint[];
  minBalance: number;
  minBalanceDate: string;
  endingBalance: number;
  totalExpectedInflows: number;
  totalScheduledOutflows: number;
  potentialSavings: number;
} {
  const start = new Date(startDateStr);
  const end = new Date(start);
  end.setDate(end.getDate() + horizonDays);

  const activeItems = payments.filter((p) => p.estatus === "programado");
  const stepDays = horizonDays === 30 ? 3 : horizonDays === 60 ? 5 : 7;

  const points: CashFlowPoint[] = [];
  let running = currentBalance;
  let minBalance = currentBalance;
  let minBalanceDate = startDateStr;
  let totalExpectedInflows = 0;
  let totalScheduledOutflows = 0;

  const formatIso = (d: Date) => d.toISOString().slice(0, 10);

  let cursor = new Date(start);
  const processedIds = new Set<string>();

  while (cursor <= end) {
    const bucketEnd = new Date(cursor);
    bucketEnd.setDate(bucketEnd.getDate() + stepDays - 1);
    const bucketEndIso = formatIso(bucketEnd > end ? end : bucketEnd);

    let inflows = 0;
    let outflows = 0;
    const events: string[] = [];

    for (const item of activeItems) {
      if (processedIds.has(item.id)) continue;
      if (item.fechaProgramada <= bucketEndIso) {
        processedIds.add(item.id);
        const effectiveAmount =
          item.descuentoAplicado && item.descuentoProntoPagoPct
            ? item.monto * (1 - item.descuentoProntoPagoPct / 100)
            : item.monto;
        if (item.tipo === "ingreso_esperado") {
          inflows += effectiveAmount;
          totalExpectedInflows += effectiveAmount;
          events.push(`+ ${item.concepto}`);
        } else {
          outflows += effectiveAmount;
          totalScheduledOutflows += effectiveAmount;
          events.push(`- ${item.concepto}`);
        }
      }
    }

    running = Number((running + inflows - outflows).toFixed(2));
    if (running < minBalance) {
      minBalance = running;
      minBalanceDate = bucketEndIso;
    }

    const labelDate = new Date(bucketEndIso);
    points.push({
      date: bucketEndIso,
      label: new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short" }).format(labelDate),
      balance: running,
      inflows,
      outflows,
      events,
    });

    cursor.setDate(cursor.getDate() + stepDays);
  }

  const potentialSavings = activeItems.reduce((acc, item) => {
    if (
      item.tipo === "egreso" &&
      item.descuentoProntoPagoPct &&
      !item.descuentoAplicado
    ) {
      return acc + item.monto * (item.descuentoProntoPagoPct / 100);
    }
    return acc;
  }, 0);

  return {
    points,
    minBalance,
    minBalanceDate,
    endingBalance: running,
    totalExpectedInflows,
    totalScheduledOutflows,
    potentialSavings,
  };
}

export function computeMonthlySummary(
  company: CompanyProfile,
  movements: FinancialMovement[],
  invoices: CfdiInvoice[]
) {
  const ingresosMes = movements
    .filter((m) => m.tipo === "ingreso")
    .reduce((sum, m) => sum + m.monto, 0);
  const gastosMes = movements
    .filter((m) => m.tipo === "gasto")
    .reduce((sum, m) => sum + m.monto, 0);
  const flujoMes = ingresosMes - gastosMes;

  const ivaTrasladado = invoices
    .filter((i) => i.tipo === "emitida")
    .reduce((sum, i) => sum + i.iva, 0);
  const ivaAcreditable = invoices
    .filter((i) => i.tipo === "recibida")
    .reduce((sum, i) => sum + i.iva, 0);
  const ivaEstimado = Math.max(0, ivaTrasladado - ivaAcreditable);

  // Indicative provisional ISR (30% on indicative monthly net utility using 12% demo utility coefficient)
  const coeficienteUtilidadDemo = 0.12;
  const utilidadFiscalEstimada = ingresosMes * coeficienteUtilidadDemo;
  const isrEstimado = utilidadFiscalEstimada * 0.3;

  return {
    saldoDisponible: company.initialBalance,
    ingresosMes,
    gastosMes,
    flujoMes,
    ivaTrasladado,
    ivaAcreditable,
    ivaEstimado,
    isrEstimado,
    coeficienteUtilidadDemo,
    impuestoTotalEstimado: ivaEstimado + isrEstimado,
  };
}
