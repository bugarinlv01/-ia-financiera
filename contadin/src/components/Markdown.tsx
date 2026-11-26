import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Muestra las respuestas de Contadín con formato (negritas, títulos, listas y tablas). */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-2 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3 className="font-display text-base font-semibold text-[#0B1F3A] mt-3">{children}</h3>,
          h2: ({ children }) => <h3 className="font-display text-base font-semibold text-[#0B1F3A] mt-3">{children}</h3>,
          h3: ({ children }) => <h4 className="font-display text-sm font-semibold text-[#0B1F3A] mt-3">{children}</h4>,
          h4: ({ children }) => <h4 className="text-sm font-semibold text-slate-900 mt-2">{children}</h4>,
          p: ({ children }) => <p className="leading-relaxed">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          hr: () => <hr className="my-3 border-slate-200" />,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-amber-300 bg-amber-50 px-3 py-2 rounded-r text-amber-950">{children}</blockquote>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#2563EB] underline">
              {children}
            </a>
          ),
          code: ({ children }) => <code className="font-mono-nums text-[0.9em] bg-slate-100 px-1 rounded">{children}</code>,
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-slate-100">{children}</thead>,
          th: ({ children }) => <th className="border border-slate-200 px-2 py-1.5 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="border border-slate-200 px-2 py-1.5 align-top">{children}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
