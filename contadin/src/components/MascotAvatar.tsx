import { useState } from "react";
import { Bot, User } from "lucide-react";

const MASCOT_SRC = "/src/assets/images/contadin_mascot_1795649403565.jpg";
const DIRECTOR_SRC = "/src/assets/images/pyme_director_avatar_1795649403811.jpg";

interface AvatarProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-14 h-14",
  xl: "w-20 h-20",
};

export function ContadinMascot({ size = "md", className = "" }: AvatarProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`${SIZE_CLASSES[size]} rounded-xl bg-[#0B1F3A] text-blue-300 flex items-center justify-center border border-blue-500/30 shrink-0 ${className}`}
        aria-label="Mascota Contadín"
      >
        <Bot className="w-1/2 h-1/2" />
      </div>
    );
  }

  return (
    <img
      src={MASCOT_SRC}
      alt="Contadín, asistente financiero inteligente"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${SIZE_CLASSES[size]} rounded-xl object-cover border border-slate-200 bg-slate-50 shrink-0 ${className}`}
    />
  );
}

export function DirectorAvatar({ size = "sm", className = "" }: AvatarProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`${SIZE_CLASSES[size]} rounded-full bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 ${className}`}
        aria-label="Perfil de usuario"
      >
        <User className="w-1/2 h-1/2" />
      </div>
    );
  }

  return (
    <img
      src={DIRECTOR_SRC}
      alt="Sofía Hernández Morales"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${SIZE_CLASSES[size]} rounded-full object-cover border border-slate-200 bg-slate-100 shrink-0 ${className}`}
    />
  );
}
