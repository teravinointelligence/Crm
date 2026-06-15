// POST /api/asistente  { messages: [{ role, content }] }
// Asistente de consultas en lenguaje natural. El modelo SOLO elige tools; el
// servidor las ejecuta con el cliente de la sesión (RLS → permisos). Las cifras
// salen de las tools; la UI dibuja la tabla desde los resultados estructurados.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { canSeeFinance } from "@/lib/modules";
import { callClaudeMessages, type ClaudeMessage } from "@/lib/anthropic";
import { toolDefsFor, runTool } from "@/lib/asistente/tools";
import type { ToolContext, ToolResult } from "@/lib/asistente/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TOOL_ROUNDS = 3;

const SYSTEM =
  "Eres el asistente del CRM de TERAVINO (distribuidora de vinos y licores en México). " +
  "Respondes preguntas del equipo SOLO usando las herramientas disponibles: nunca inventes " +
  "cifras, nombres ni datos — todo número viene de una herramienta. Si una pregunta necesita " +
  "datos, llama a la herramienta adecuada con los parámetros correctos. Puedes encadenar hasta " +
  "3 herramientas. Cuando tengas los resultados, responde en español de forma BREVE: 1-3 frases " +
  "que resuman lo importante (la tabla se muestra aparte automáticamente). Si una herramienta " +
  "devuelve una nota de acceso o vacío, dilo con claridad. No repitas toda la tabla en el texto.";

export async function POST(req: Request) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  let body: { messages?: { role?: string; content?: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const history = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-10);
  if (!history.length) return NextResponse.json({ error: "Sin mensajes." }, { status: 400 });

  const supabase = createClient();
  const ctx: ToolContext = { supabase, rep, isAdmin: rep.role === "admin", canSeeFinance: canSeeFinance(rep.role) };
  const tools = toolDefsFor(ctx);

  const messages: ClaudeMessage[] = history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content as string }));
  const results: ToolResult[] = [];

  try {
    let reply = "";
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const lastRound = round === MAX_TOOL_ROUNDS;
      const { content, stopReason } = await callClaudeMessages({
        system: SYSTEM,
        messages,
        tools: lastRound ? undefined : tools, // último intento sin tools → fuerza texto
        maxTokens: 1200,
      });

      const textBlocks = content.filter((b) => b.type === "text").map((b) => String(b.text ?? ""));
      const toolUses = content.filter((b) => b.type === "tool_use");

      if (stopReason === "tool_use" && toolUses.length && !lastRound) {
        messages.push({ role: "assistant", content });
        const toolResultBlocks: Array<Record<string, unknown>> = [];
        for (const tu of toolUses) {
          const result = await runTool(ctx, String(tu.name), (tu.input as Record<string, unknown>) ?? {});
          results.push(result);
          // Al modelo le mandamos una versión compacta (para el texto); la tabla
          // completa va al cliente vía `results`.
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify({ title: result.title, total: result.total, note: result.note, rows: result.rows.slice(0, 20), link: result.link }),
          });
        }
        messages.push({ role: "user", content: toolResultBlocks });
        continue;
      }

      reply = textBlocks.join("\n").trim();
      break;
    }

    return NextResponse.json({ reply: reply || "Listo.", results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error del asistente.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
