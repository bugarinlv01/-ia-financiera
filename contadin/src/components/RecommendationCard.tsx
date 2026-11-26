import { useState } from "react";
import { ArrowRight, Check, PencilLine } from "lucide-react";
import { Recomendacion } from "../utils/recommendations";
import { SectionId } from "../types/finance";

export interface Decision {
  estado: "aprobada" | "corregida";
  nota?: string;
  fecha: string;
  titulo: string;
}

interface Props {
  reco: Recomendacion;
  decision?: Decision;
  onApprove: (reco: Recomendacion) => void;
  onCorrect: (reco: Recomendacion, nota: string) => void;
  onNavigate?: (section: SectionId) => void;
  compact?: boolean;
}

const CONFIANZA: Record<Recomendacion["confianza"], string> = {
  alta: "bg-emerald-50 text-emerald-800 border-emerald-200",
  media: "bg-amber-50 text-amber-800 border-amber-200",
  baja: "bg-slate-100 text-slate-700 border-slate-200",
};

export function RecommendationCard({ reco, decision, onApprove, onCorrect, onNavigate, compact }: Props) {
  const [editando, setEditando] = useState(false);
  const [nota, setNota] = useState("");

  return (
    <div className={`rounded-lg border border-slate-200 bg-white ${compact ? "p-3" : "p-4"} space-y-2`}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900 leading-snug">{reco.titulo}</div>
        {decision ? (
          <span
            className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
              decision.estado === "aprobada"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : "bg-amber-50 text-amber-800 border-amber-200"
            }`}
          >
            {decision.estado === "aprobada" ? "Aprobada" : "Corregida"}
          </span>
        ) : (
          <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border ${CONFIANZA[reco.confianza]}`}>
            Confianza {reco.confianza}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-600 leading-relaxed">
        <span className="font-semibold text-slate-800">Por qué: </span>
        {reco.porque}
      </p>
      <p className="text-xs text-slate-600 leading-relaxed">
        <span className="font-semibold text-slate-800">Acción: </span>
        {reco.accion}
      </p>
      {decision?.nota && <p className="text-xs text-amber-800">Tu corrección: {decision.nota}</p>}

      {!decision && !editando && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => onApprove(reco)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
          >
            <Check className="w-3.5 h-3.5" /> Aprobar
          </button>
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold"
          >
            <PencilLine className="w-3.5 h-3.5" /> Corregir
          </button>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate(reco.target)}
              className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB] hover:underline"
            >
              {reco.cta} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {editando && (
        <form
          className="space-y-2 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!nota.trim()) return;
            onCorrect(reco, nota.trim());
            setEditando(false);
          }}
        >
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={2}
            placeholder="¿Qué hay que corregir? Contadín lo tomará en cuenta en el chat."
            className="w-full text-xs rounded-md border border-slate-300 p-2 focus:outline-2 focus:outline-blue-400"
          />
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1.5 rounded-md bg-[#2563EB] text-white text-xs font-semibold">
              Guardar corrección
            </button>
            <button type="button" onClick={() => setEditando(false)} className="px-3 py-1.5 text-xs text-slate-600">
              Cancelar
            </button>
          </div>
        </form>
      )}
      {reco.ajuste && !decision && (
        <p className="text-[11px] text-slate-400">Aprobar solo actualiza tu plan en Contadín; no ejecuta ningún pago.</p>
      )}
    </div>
  );
}
