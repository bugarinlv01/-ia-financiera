import { useState } from "react";
import { ArrowLeft, CheckCircle2, RotateCcw, ShieldCheck } from "lucide-react";
import { CompanyProfile } from "../../types/finance";

interface SettingsViewProps {
  company: CompanyProfile;
  onSaveCompany: (updated: CompanyProfile) => void;
  onResetAllDemo: () => void;
  onBack: () => void;
}

export function SettingsView({
  company,
  onSaveCompany,
  onResetAllDemo,
  onBack,
}: SettingsViewProps) {
  const [form, setForm] = useState<CompanyProfile>(company);
  const [savedBanner, setSavedBanner] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveCompany({
      ...form,
      isDemoMode: false,
    });
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
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
          Configuración de la empresa
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Personaliza los datos fiscales, el saldo disponible y el umbral mínimo de liquidez para adaptar los cálculos de Contadín a tu negocio.
        </p>
      </div>

      {savedBanner && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          Configuración guardada localmente. Todas las proyecciones y respuestas del chat se actualizaron.
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-slate-200 p-6 space-y-5"
      >
        <h2 className="font-display text-base font-semibold text-[#0B1F3A]">
          Perfil fiscal y financiero
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Razón social o nombre comercial
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-[#2563EB] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              RFC
            </label>
            <input
              type="text"
              value={form.rfc}
              onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })}
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-mono-nums focus:border-[#2563EB] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Régimen fiscal ante el SAT
            </label>
            <select
              value={form.regimenFiscal}
              onChange={(e) => setForm({ ...form, regimenFiscal: e.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-[#2563EB] focus:outline-none"
            >
              <option value="601 · General de Ley Personas Morales">
                601 · General de Ley Personas Morales
              </option>
              <option value="626 · Régimen Simplificado de Confianza (RESICO)">
                626 · Régimen Simplificado de Confianza (RESICO)
              </option>
              <option value="612 · Personas Físicas con Actividades Empresariales">
                612 · Personas Físicas con Actividades Empresariales
              </option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Responsable financiero
            </label>
            <input
              type="text"
              value={form.responsable}
              onChange={(e) => setForm({ ...form, responsable: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-[#2563EB] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Puesto
            </label>
            <input
              type="text"
              value={form.puesto}
              onChange={(e) => setForm({ ...form, puesto: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-[#2563EB] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Saldo bancario disponible (MXN)
            </label>
            <input
              type="number"
              step="100"
              value={form.initialBalance}
              onChange={(e) =>
                setForm({ ...form, initialBalance: Number(e.target.value) || 0 })
              }
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-mono-nums focus:border-[#2563EB] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Umbral mínimo de liquidez / reserva (MXN)
            </label>
            <input
              type="number"
              step="1000"
              value={form.liquidityThreshold}
              onChange={(e) =>
                setForm({ ...form, liquidityThreshold: Number(e.target.value) || 0 })
              }
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-mono-nums focus:border-[#2563EB] focus:outline-none"
            />
          </div>
        </div>

        <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              onResetAllDemo();
              setSavedBanner(false);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-medium text-slate-700"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restaurar todos los datos de demostración
          </button>

          <button
            type="submit"
            className="px-5 py-2.5 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold"
          >
            Guardar configuración
          </button>
        </div>
      </form>

      {/* Privacy & Simulation Transparency */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-[#2563EB] shrink-0 mt-0.5" />
        <div className="text-xs text-slate-600 leading-relaxed space-y-1">
          <div className="font-semibold text-slate-900">
            Privacidad, almacenamiento y alcance del prototipo
          </div>
          <p>
            Los cambios que realices se guardan únicamente en el almacenamiento local de tu navegador. No existen conexiones en vivo a bancos ni al portal del SAT. Contadín procesa tus consultas de IA de forma segura desde el servidor y nunca ejecuta pagos ni presenta declaraciones por su cuenta.
          </p>
        </div>
      </div>
    </div>
  );
}
