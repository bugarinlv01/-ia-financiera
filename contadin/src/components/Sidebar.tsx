import {
  ArrowLeftRight,
  CalendarClock,
  FileSearch,
  History,
  LayoutDashboard,
  MessageSquareText,
  Scale,
  Settings,
  Wallet,
  X,
} from "lucide-react";
import { SectionId } from "../types/finance";
import { ContadinMascot } from "./MascotAvatar";

interface NavItem {
  id: SectionId;
  label: string;
  icon: typeof LayoutDashboard;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Inicio / Dashboard", icon: LayoutDashboard },
  { id: "financial-info", label: "Mi información financiera", icon: Wallet },
  { id: "reconciliation", label: "Conciliación bancaria", icon: ArrowLeftRight },
  { id: "payment-planning", label: "Planeación de pagos", icon: CalendarClock },
  { id: "fiscal", label: "Asistencia fiscal", icon: Scale },
  { id: "contracts", label: "Análisis de contratos", icon: FileSearch },
  { id: "chat", label: "Chat con Contadín", icon: MessageSquareText },
  { id: "history", label: "Historial y reportes", icon: History },
  { id: "settings", label: "Configuración", icon: Settings },
];

interface SidebarProps {
  activeSection: SectionId;
  onSelect: (id: SectionId) => void;
  companyName: string;
  isDemoMode: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  activeSection,
  onSelect,
  companyName,
  isDemoMode,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const navContent = (
    <div className="flex flex-col h-full bg-[#0B1F3A] text-slate-100 select-none">
      {/* Brand header */}
      <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <ContadinMascot size="sm" className="border-white/20" />
          <div className="min-w-0">
            <div className="font-display font-bold text-lg tracking-tight text-white leading-tight">
              Contadín
            </div>
            <p className="text-[11px] text-blue-200/80 truncate">
              Copiloto financiero pyme
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-lg text-slate-300 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-blue-400"
          aria-label="Cerrar menú"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Company context */}
      <div className="px-5 py-3.5 border-b border-white/10">
        <div className="text-[11px] text-slate-400">Empresa activa</div>
        <div className="text-xs font-medium text-white truncate mt-0.5">
          {companyName}
        </div>
        <div className="text-[11px] text-blue-300/80 mt-0.5">
          {isDemoMode ? "Modo demostración (MXN)" : "Datos personalizados (MXN)"}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Navegación principal">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelect(item.id);
                onCloseMobile();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-400 ${
                isActive
                  ? "bg-[#2563EB] text-white"
                  : "text-slate-300 hover:bg-white/8 hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer note */}
      <div className="px-5 py-4 border-t border-white/10 text-[11px] text-slate-400 leading-relaxed">
        Tus finanzas claras, tus decisiones inteligentes.
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop permanent sidebar */}
      <aside className="hidden lg:block w-[264px] shrink-0 border-r border-slate-200 bg-[#0B1F3A]">
        <div className="sticky top-0 h-screen">{navContent}</div>
      </aside>

      {/* Mobile / tablet drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-[1px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] h-full z-10 shadow-xl">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}
