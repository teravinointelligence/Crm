// Cliente de la API de Anthropic (Claude) — SERVER-ONLY, vía REST (sin SDK).
// La API key vive solo en el server (ANTHROPIC_API_KEY). NUNCA en el cliente.
//
// Dos usos en conciliación bancaria:
//   1. extractBankTransactionsFromPdf → lee un estado de cuenta en PDF y devuelve
//      los movimientos en JSON (Claude soporta documentos PDF nativamente).
//   2. suggestReconciliation → para abonos ambiguos, propone factura(s) + confianza.
//
// Inicialización lazy: si falta la key, lanza un error claro al usar (no al importar).

import "server-only";
import type { BankTxnParsed, ReconcileSuggestion } from "./bank/types";

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

function model(): string {
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
}

function apiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "Falta ANTHROPIC_API_KEY en el entorno (Vercel → Settings → Environment Variables). " +
        "Se usa solo del lado del servidor para la conciliación asistida.",
    );
  }
  return key;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

async function callClaude(opts: {
  system?: string;
  content: ContentBlock[];
  maxTokens?: number;
}): Promise<{ text: string; stopReason: string | null }> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey(),
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: model(),
      max_tokens: opts.maxTokens ?? 4096,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: "user", content: opts.content }],
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Mensaje accionable para los errores más comunes de configuración.
    if (res.status === 401) {
      throw new Error("Anthropic 401: ANTHROPIC_API_KEY inválida o ausente en el servidor.");
    }
    if (res.status === 404 || /model/i.test(body)) {
      throw new Error(
        `Anthropic ${res.status}: el modelo "${model()}" no existe o no está disponible. ` +
          "Revisa ANTHROPIC_MODEL en Vercel.",
      );
    }
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
    stop_reason?: string | null;
  };
  const text = (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();
  return { text, stopReason: data.stop_reason ?? null };
}

/** Extrae el primer bloque JSON ({...} o [...]) de un texto y lo parsea. null si falla. */
export function safeJson<T>(text: string): T | null {
  if (!text) return null;
  let s = text.trim();
  // Quita cercos ```json … ```
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence) s = fence[1].trim();
  // Recorta al primer corchete/llave de apertura y su cierre.
  const start = Math.min(
    ...[s.indexOf("{"), s.indexOf("[")].filter((i) => i >= 0),
  );
  if (Number.isFinite(start) && start > 0) s = s.slice(start);
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

const EXTRACT_SYSTEM =
  "Eres un asistente de conciliación bancaria. Extraes los movimientos de un " +
  "estado de cuenta. Devuelve EXCLUSIVAMENTE un arreglo JSON, sin texto extra.";

/** Lee un estado de cuenta en PDF (base64) y devuelve los movimientos parseados. */
export async function extractBankTransactionsFromPdf(
  base64Pdf: string,
): Promise<BankTxnParsed[]> {
  const { text, stopReason } = await callClaude({
    system: EXTRACT_SYSTEM,
    maxTokens: 16384,
    content: [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Pdf } },
      {
        type: "text",
        text:
          "Extrae TODOS los movimientos de este estado de cuenta. Para cada uno devuelve un objeto:\n" +
          '{ "date": "YYYY-MM-DD" | null, "description": string, "reference": string | null,\n' +
          '  "amount": number (positivo), "kind": "abono" | "cargo" }\n' +
          "Reglas: `kind` = 'abono' para depósitos/ingresos/créditos, 'cargo' para retiros/egresos/débitos. " +
          "OJO: 'SPEI RECIBIDO', 'DEPOSITO', 'PAGO CUENTA DE TERCERO' y 'ABONO' son DINERO QUE ENTRA → 'abono'. " +
          "'SPEI ENVIADO', 'RETIRO', 'PAGO DE COMISION', 'IVA', 'SERV BANCA' son DINERO QUE SALE → 'cargo'. " +
          "`amount` siempre positivo (el signo lo da kind). No incluyas saldos ni totales, solo movimientos. " +
          "Responde solo con el arreglo JSON.",
      },
    ],
  });

  // Si Claude se quedó sin tokens, la lista quedó incompleta: no la guardamos
  // a medias, avisamos para subir el PDF por partes.
  if (stopReason === "max_tokens") {
    throw new Error(
      "El PDF tiene demasiados movimientos para procesarse de una sola vez (respuesta truncada). " +
        "Súbelo por partes (por mes o rango de fechas) o usa el CSV/XLSX del banco.",
    );
  }

  type Raw = { date?: string | null; description?: string; reference?: string | null; amount?: number; kind?: string };
  const raw = safeJson<Raw[]>(text);
  if (!Array.isArray(raw)) return [];
  const out: BankTxnParsed[] = [];
  raw.forEach((r, i) => {
    const amount = Math.abs(Number(r.amount ?? 0));
    if (!amount) return;
    const kind = r.kind === "abono" ? "abono" : r.kind === "cargo" ? "cargo" : amount > 0 ? "abono" : "cargo";
    const date = r.date && /^\d{4}-\d{2}-\d{2}/.test(String(r.date)) ? String(r.date).slice(0, 10) : null;
    out.push({
      txn_date: date,
      description: String(r.description ?? "").trim() || "(sin concepto)",
      reference: r.reference ? String(r.reference).trim() : null,
      amount,
      kind: kind as "abono" | "cargo",
      row_index: i,
    });
  });
  return out;
}

const MATCH_SYSTEM =
  "Eres un asistente de conciliación de cuentas por cobrar de una distribuidora de " +
  "vinos y licores (TERAVINO). Dada una transacción bancaria (abono) y las facturas " +
  "abiertas de un cliente candidato, decides qué factura(s) cubre el abono. " +
  "Nunca inventes IDs: usa solo los invoice_id provistos. Devuelve solo JSON.";

export type OpenInvoiceForMatch = {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  balance: number;
};

/** Pide a Claude una sugerencia de aplicación para un abono ambiguo. */
export async function suggestReconciliation(input: {
  txn: { date: string | null; description: string; reference: string | null; amount: number };
  account_id: string;
  account_name: string;
  invoices: OpenInvoiceForMatch[];
}): Promise<ReconcileSuggestion> {
  const { text } = await callClaude({
    system: MATCH_SYSTEM,
    maxTokens: 1024,
    content: [
      {
        type: "text",
        text:
          "TRANSACCIÓN (abono):\n" +
          JSON.stringify(input.txn) +
          `\n\nCLIENTE CANDIDATO: ${input.account_name} (id ${input.account_id})\n` +
          "FACTURAS ABIERTAS (invoice_id, número, fecha, vencimiento, saldo):\n" +
          JSON.stringify(input.invoices) +
          "\n\nDevuelve un objeto JSON:\n" +
          '{ "confidence": "alta" | "media" | "baja",\n' +
          '  "reason": string (breve, en español),\n' +
          '  "candidates": [ { "invoice_id": string, "amount": number } ] }\n' +
          "El abono puede cubrir una factura exacta, varias que sumen el monto, o un " +
          "pago parcial de una factura. Si nada cuadra razonablemente, devuelve candidates vacío " +
          "y confidence 'baja'. La suma de amounts no debe exceder el monto del abono.",
      },
    ],
  });

  type Raw = { confidence?: string; reason?: string; candidates?: { invoice_id?: string; amount?: number }[] };
  const raw = safeJson<Raw>(text);
  const byId = new Map(input.invoices.map((i) => [i.invoice_id, i]));
  const candidates =
    (raw?.candidates ?? [])
      .map((c) => {
        const inv = c.invoice_id ? byId.get(c.invoice_id) : undefined;
        if (!inv) return null;
        const amount = Math.abs(Number(c.amount ?? 0)) || inv.balance;
        return { invoice_id: inv.invoice_id, invoice_number: inv.invoice_number, amount };
      })
      .filter(Boolean) as ReconcileSuggestion["candidates"];

  const confidence =
    raw?.confidence === "alta" || raw?.confidence === "media" || raw?.confidence === "baja"
      ? raw.confidence
      : candidates.length
        ? "media"
        : "baja";

  return {
    source: "claude",
    confidence,
    reason: raw?.reason?.trim() || "Sugerencia generada por Claude.",
    account_id: input.account_id,
    account_name: input.account_name,
    candidates,
  };
}
