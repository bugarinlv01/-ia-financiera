export type SectionId =
  | "dashboard"
  | "financial-info"
  | "reconciliation"
  | "payment-planning"
  | "fiscal"
  | "contracts"
  | "chat"
  | "history"
  | "settings";

export interface CompanyProfile {
  name: string;
  rfc: string;
  regimenFiscal: string;
  responsable: string;
  puesto: string;
  initialBalance: number;
  liquidityThreshold: number;
  isDemoMode: boolean;
}

export interface MonthlyCashPoint {
  month: string;
  ingresos: number;
  egresos: number;
}

export interface FinancialMovement {
  id: string;
  fecha: string;
  concepto: string;
  categoria: string;
  contraparte: string;
  tipo: "ingreso" | "gasto";
  monto: number;
  metodoPago: "SPEI" | "Transferencia" | "Domiciliación" | "Tarjeta Corporativa";
  cfdiRelacionado?: string;
}

export interface BankTransaction {
  id: string;
  fecha: string;
  banco: string;
  concepto: string;
  referencia: string;
  contraparte: string;
  tipo: "abono" | "cargo";
  monto: number;
}

export interface CfdiInvoice {
  id: string;
  folio: string;
  uuid: string;
  fecha: string;
  contraparte: string;
  rfc: string;
  tipo: "emitida" | "recibida";
  subtotal: number;
  iva: number;
  total: number;
  concepto: string;
}

export type MatchClassification = "exacta" | "probable" | "sin_coincidencia";
export type MatchReviewStatus = "pendiente" | "confirmada" | "rechazada";

export interface ReconciliationMatch {
  id: string;
  bankTransactionId: string;
  invoiceIds: string[];
  classification: MatchClassification;
  confidence: number;
  razon: string;
  diferenciaMonto: number;
  reviewStatus: MatchReviewStatus;
  esPagoParcialOAgrupado?: boolean;
}

export interface ScheduledPayment {
  id: string;
  concepto: string;
  proveedor: string;
  tipo: "egreso" | "ingreso_esperado";
  categoria: string;
  monto: number;
  fechaProgramada: string;
  fechaVencimiento: string;
  prioridad: "critica" | "alta" | "media" | "baja";
  descuentoProntoPagoPct?: number;
  fechaLimiteDescuento?: string;
  descuentoAplicado?: boolean;
  estatus: "programado" | "pagado" | "cobrado";
}

export interface FiscalObligation {
  id: string;
  titulo: string;
  periodicidad: "Mensual" | "Bimestral" | "Anual";
  fechaLimite: string;
  regimen: string;
  descripcion: string;
  estado: "pendiente" | "proxima" | "completada";
}

export interface ContractFinding {
  elemento: string;
  descripcion: string;
  nivelAtencion: "bajo" | "medio" | "alto";
  recomendacion: string;
}

export interface ContractAnalysis {
  id: string;
  fileName: string;
  titulo: string;
  partes: string;
  vigencia: string;
  condicionesPago: string;
  resumenEjecutivo: string;
  hallazgos: ContractFinding[];
  rawText?: string;
  base64Pdf?: string;
  analyzedAt: string;
  isDemo: boolean;
}

export interface ChatSource {
  title: string;
  uri: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sources?: ChatSource[];
  toolsUsed?: string[];
  referenceDate?: string;
}

export interface QueryHistoryItem {
  id: string;
  fecha: string;
  modulo: "Chat" | "Asistencia Fiscal" | "Análisis de Contratos" | "Conciliación" | "Planeación de Pagos";
  titulo: string;
  detalle: string;
}

export interface AlertItem {
  id: string;
  severity: "alto" | "medio" | "info";
  titulo: string;
  descripcion: string;
  targetSection: SectionId;
  actionLabel: string;
}
