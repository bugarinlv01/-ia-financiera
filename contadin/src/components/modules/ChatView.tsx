import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, RotateCcw, Send } from "lucide-react";
import { ChatMessage, ChatSource } from "../../types/finance";
import { ContadinMascot } from "../MascotAvatar";
import { Markdown } from "../Markdown";

interface ChatViewProps {
  messages: ChatMessage[];
  financialContext: Record<string, unknown>;
  sessionMemory: string[];
  onSendMessage: (
    userText: string,
    assistantReply: string,
    meta?: {
      sources?: ChatSource[];
      toolsUsed?: string[];
      referenceDate?: string;
    }
  ) => void;
  onClearChat: () => void;
  onBack: () => void;
}

const STARTER_PROMPTS = [
  "¿Cómo está la salud financiera de mi empresa?",
  "¿Cuánto dinero tengo disponible?",
  "¿Qué pagos debo priorizar?",
  "¿Cuánto podría pagar de impuestos?",
  "¿Puedes analizar este contrato?",
  "¿Cómo puedo mejorar mi flujo de efectivo?",
];

const TOOL_LABELS: Record<string, string> = {
  simular_flujo_caja: "Simulación de flujo de efectivo",
  calcular_indicadores_y_impuestos: "Cálculo financiero e impuestos",
  auditar_riesgos_empresa: "Auditoría de riesgos",
  consulta_fuentes_sat: "Verificación de fuentes SAT",
};

export function ChatView({
  messages,
  financialContext,
  sessionMemory,
  onSendMessage,
  onClearChat,
  onBack,
}: ChatViewProps) {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [pendingUserMsg, setPendingUserMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingUserMsg, isSending]);

  const sendPrompt = async (text: string) => {
    const clean = text.trim();
    if (!clean || isSending) return;

    setInput("");
    setErrorMsg("");
    setPendingUserMsg(clean);
    setIsSending(true);

    try {
      const historyPayload = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: clean,
          history: historyPayload,
          financialContext,
          sessionMemory,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error || "No fue posible obtener respuesta de Contadín."
        );
      }
      onSendMessage(clean, data.reply, {
        sources: Array.isArray(data.sources) ? data.sources : [],
        toolsUsed: Array.isArray(data.toolsUsed) ? data.toolsUsed : [],
        referenceDate:
          typeof data.referenceDate === "string" ? data.referenceDate : undefined,
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Ocurrió un error al comunicarse con el asistente."
      );
    } finally {
      setPendingUserMsg(null);
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-[#0B1F3A] mb-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver al Dashboard
          </button>
          <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">
            Chat inteligente con Contadín
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Conversa con tu copiloto financiero usando razonamiento autónomo sobre tus saldos, pagos, contratos y obligaciones fiscales.
          </p>
        </div>

        <button
          type="button"
          onClick={onClearChat}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Nueva conversación
        </button>
      </div>

      {/* Chat Container */}
      <div className="bg-white rounded-xl border border-slate-200 flex flex-col h-[calc(100vh-250px)] min-h-[500px]">
        {/* Starter Questions Bar */}
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70">
          <div className="text-[11px] font-semibold text-slate-500 mb-2">
            Preguntas sugeridas para comenzar:
          </div>
          <div className="flex flex-wrap gap-2">
            {STARTER_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={isSending}
                onClick={() => sendPrompt(q)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:border-[#2563EB] hover:text-[#2563EB] text-xs text-slate-700 transition-colors text-left"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {messages.map((msg) => {
            const isUser = msg.role === "user";
            const safeSources = (msg.sources ?? []).filter((s) =>
              /^https?:\/\//i.test(s.uri)
            );
            const toolNames = (msg.toolsUsed ?? [])
              .map((t) => TOOL_LABELS[t] || t)
              .filter(Boolean);

            return (
              <div
                key={msg.id}
                className={`flex items-start gap-3 ${
                  isUser ? "justify-end" : "justify-start"
                }`}
              >
                {!isUser && <ContadinMascot size="sm" className="mt-0.5" />}
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? "bg-[#0B1F3A] text-white"
                      : "bg-slate-50 border border-slate-200 text-slate-800"
                  }`}
                >
                  {isUser ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <Markdown>{msg.content}</Markdown>
                  )}

                  {!isUser && safeSources.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-200/80 space-y-1.5">
                      <div className="text-[11px] font-semibold text-slate-600">
                        Fuentes consultadas{msg.referenceDate ? ` (${msg.referenceDate})` : ""}:
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {safeSources.map((src, idx) => (
                          <a
                            key={idx}
                            href={src.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-[#2563EB] hover:underline"
                          >
                            <span>{src.title}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <div
                    className={`mt-2 flex flex-wrap items-center gap-2 text-[10px] font-mono-nums ${
                      isUser ? "text-blue-200" : "text-slate-400"
                    }`}
                  >
                    <span>{msg.timestamp}</span>
                    {!isUser && toolNames.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-sans text-slate-500">
                          {toolNames.join(" · ")}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {pendingUserMsg && (
            <div className="flex items-start gap-3 justify-end">
              <div className="max-w-[85%] sm:max-w-[75%] rounded-xl px-4 py-3 text-sm bg-[#0B1F3A] text-white">
                <div className="whitespace-pre-wrap">{pendingUserMsg}</div>
              </div>
            </div>
          )}

          {isSending && (
            <div className="flex items-start gap-3 justify-start">
              <ContadinMascot size="sm" />
              <div className="rounded-xl px-4 py-3 text-xs bg-slate-50 border border-slate-200 text-slate-600">
                Contadín está razonando sobre tus datos, ejecutando simulaciones y verificando cálculos...
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900">
              {errorMsg}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendPrompt(input);
          }}
          className="p-4 border-t border-slate-200 bg-white rounded-b-xl"
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pregúntale a Contadín sobre liquidez, impuestos, pagos o contratos..."
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-[#2563EB] focus:outline-none"
            />
            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#2563EB] hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold whitespace-nowrap"
            >
              <Send className="w-4 h-4" />
              <span>Enviar</span>
            </button>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            Contadín conserva el contexto de la sesión, diferencia datos de estimaciones y solicita validación humana para decisiones relevantes.
          </div>
        </form>
      </div>
    </div>
  );
}
