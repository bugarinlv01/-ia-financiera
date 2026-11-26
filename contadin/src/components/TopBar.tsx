import { Menu, MessageSquareText } from "lucide-react";
import { SectionId } from "../types/finance";
import { NAV_ITEMS } from "./Sidebar";
import { DirectorAvatar } from "./MascotAvatar";

interface TopBarProps {
  activeSection: SectionId;
  companyName: string;
  responsable: string;
  onOpenMobileMenu: () => void;
  onOpenChat: () => void;
}

export function TopBar({
  activeSection,
  companyName,
  responsable,
  onOpenMobileMenu,
  onOpenChat,
}: TopBarProps) {
  const currentItem = NAV_ITEMS.find((n) => n.id === activeSection);
  const sectionLabel = currentItem?.label ?? "Inicio / Dashboard";

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
      {/* Zone 1: Menu toggle + Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 -ml-1 rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600"
          aria-label="Abrir navegación"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="font-display font-semibold text-[#0B1F3A] whitespace-nowrap shrink-0 hidden sm:inline">
            Contadín
          </span>
          <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
            /
          </span>
          <span className="font-medium text-slate-900 truncate">
            {sectionLabel}
          </span>
        </div>
      </div>

      {/* Zone 2: Company context (clean unboxed text) */}
      <div className="hidden xl:flex items-center gap-2 text-xs text-slate-500 min-w-0">
        <span className="truncate max-w-[260px]">{companyName}</span>
        <span aria-hidden="true">·</span>
        <span className="whitespace-nowrap">Moneda MXN</span>
      </div>

      {/* Zone 3: Primary action + Profile */}
      <div className="flex items-center gap-3 shrink-0">
        {activeSection !== "chat" && (
          <button
            type="button"
            onClick={onOpenChat}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <MessageSquareText className="w-3.5 h-3.5" />
            <span>Preguntar a Contadín</span>
          </button>
        )}
        <div className="hidden sm:flex items-center gap-2.5 pl-2 border-l border-slate-200">
          <DirectorAvatar size="sm" />
          <span className="text-xs font-medium text-slate-700 whitespace-nowrap max-w-[140px] truncate">
            {responsable}
          </span>
        </div>
      </div>
    </header>
  );
}
