"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Send, Loader2, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";

type Column = { key: string; label: string; kind?: "money" | "number" | "date" | "text" };
type ToolResult = {
  tool: string;
  title: string;
  columns: Column[];
  rows: Record<string, string | number | null>[];
  total?: string;
  link?: { href: string; label: string };
  note?: string;
};
type Msg = { role: "user" | "assistant"; content: string; results?: ToolResult[] };

const EXAMPLES = [
  "¿Qué cuentas de Los Cabos llevan 60+ días vencidas y cuánto deben?",
  "Top 5 vinos que cayeron en ventas este mes",
  "Resumen de cartera de La Paz",
  "Cuentas activas sin actividad en 30 días",
];

function fmtCell(value: string | number | null, kind?: Column["kind"]) {
  if (value == null || value === "") return "—";
  if (kind === "money") return formatCurrency(Number(value));
  if (kind === "number") return Number(value).toLocaleString("es-MX");
  if (kind === "date") return formatDate(String(value));
  return String(value);
}

function ResultTable({ r }: { r: ToolResult }) {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border bg-card">
      <div className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">{r.title}</div>
      {r.rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                {r.columns.map((c) => (
                  <th key={c.key} className={`px-3 py-2 ${c.kind === "money" || c.kind === "number" ? "text-right" : ""}`}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.rows.map((row, i) => (
                <tr key={i} className="border-b last:border-0">
                  {r.columns.map((c) => (
                    <td key={c.key} className={`px-3 py-2 ${c.kind === "money" || c.kind === "number" ? "text-right tabular-nums" : ""}`}>
                      {fmtCell(row[c.key], c.kind)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-3 py-3 text-sm text-muted-foreground">{r.note ?? "Sin resultados."}</div>
      )}
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
        <span>{r.total ?? (r.rows.length ? `${r.rows.length} fila(s)` : "")}</span>
        {r.link && (
          <Link href={r.link.href} className="inline-flex items-center gap-1 font-medium text-brand-carmesi hover:underline">
            {r.link.label} <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  );
}

export function AsistenteChat({ canSeeFinance }: { canSeeFinance: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 50);
    try {
      const res = await fetch("/api/asistente", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo responder.");
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply, results: data.results ?? [] }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", content: e instanceof Error ? e.message : "Error del asistente." }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 50);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border bg-background">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {!messages.length ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="rounded-full bg-accent/20 p-3 text-brand-carmesi">
              <Sparkles className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground">Pregúntame algo. Por ejemplo:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLES.filter((e) => canSeeFinance || !e.includes("cayeron")).map((e) => (
                <button
                  key={e}
                  onClick={() => send(e)}
                  className="rounded-full border bg-card px-3 py-1.5 text-xs hover:bg-muted"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              <div className={m.role === "user" ? "max-w-[85%] rounded-2xl rounded-br-sm bg-brand-carmesi px-4 py-2 text-sm text-white" : "max-w-full"}>
                {m.role === "assistant" && <div className="mb-1 text-xs font-medium text-muted-foreground">Asistente</div>}
                <p className="whitespace-pre-wrap text-sm">{m.content}</p>
                {m.results?.map((r, j) => <ResultTable key={j} r={r} />)}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Consultando el CRM…
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="flex items-center gap-2 border-t p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pregunta sobre cartera, ventas, cuentas…"
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-carmesi/30"
          disabled={loading}
        />
        <Button type="submit" size="icon" disabled={loading || !input.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
