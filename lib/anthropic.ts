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

// Mensaje genérico con soporte de TOOLS (para el asistente de consultas).
// El modelo solo elige qué tool llamar; el servidor ejecuta. Devuelve los
// bloques de contenido tal cual (text + tool_use) para que el loop los procese.
export type ClaudeMessage = { role: "user" | "assistant"; content: unknown };
export type ClaudeToolDef = { name: string; description: string; input_schema: Record<string, unknown> };

export async function callClaudeMessages(opts: {
  system?: string;
  messages: ClaudeMessage[];
  tools?: ClaudeToolDef[];
  maxTokens?: number;
}): Promise<{ content: Array<Record<string, unknown>>; stopReason: string | null }> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey(),
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: model(),
      max_tokens: opts.maxTokens ?? 1500,
      ...(opts.system ? { system: opts.system } : {}),
      ...(opts.tools ? { tools: opts.tools } : {}),
      messages: opts.messages,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("Anthropic 401: ANTHROPIC_API_KEY inválida o ausente en el servidor.");
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = (await res.json()) as { content?: Array<Record<string, unknown>>; stop_reason?: string | null };
  return { content: data.content ?? [], stopReason: data.stop_reason ?? null };
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

// ---------------------------------------------------------------------------
// Normalización de catálogo — respaldo de IA para CATEGORÍA ambigua.
// Solo se invoca con los productos que el motor de reglas
// (lib/catalogo/normalize.mjs) NO pudo clasificar con confianza. La IA SUGIERE;
// una persona aprueba en la UI antes de aplicar. Nunca escribe nada.
// ---------------------------------------------------------------------------

const CATEGORY_VALUES = [
  "vino_tinto", "vino_blanco", "vino_rosado", "vino_naranja",
  "espumoso", "destilado", "cerveza", "sake", "otro",
] as const;

const CATEGORY_SYSTEM =
  "Eres un sommelier que clasifica productos de una distribuidora de vinos y " +
  "licores (TERAVINO). Dada una lista de productos (nombre, proveedor, varietal), " +
  "asignas a cada uno UNA categoría de esta lista cerrada: " +
  CATEGORY_VALUES.join(", ") +
  ". Usa 'destilado' para tequila/mezcal/whisky/ron/vodka/gin/brandy/licor, " +
  "'espumoso' para champagne/cava/prosecco/espumante, 'cerveza' para cervezas, " +
  "'sake' para sake. Si no puedes determinarlo, usa 'otro' con confianza 'baja'. " +
  "Devuelve SOLO JSON, sin texto extra.";

export type ProductForCategory = {
  product_id: string;
  name: string;
  supplier: string | null;
  varietal: string | null;
};

export type CategorySuggestion = {
  product_id: string;
  category: (typeof CATEGORY_VALUES)[number];
  confidence: "alta" | "media" | "baja";
  reason: string;
};

/** Clasifica en lote los productos ambiguos. Devuelve [] si la API no está lista. */
export async function suggestProductCategory(
  products: ProductForCategory[],
): Promise<CategorySuggestion[]> {
  if (!products.length) return [];

  // Envía solo lo necesario (nombre, proveedor, varietal). Nunca toda la BD.
  const payload = products.map((p) => ({
    product_id: p.product_id,
    name: p.name,
    supplier: p.supplier ?? "",
    varietal: p.varietal ?? "",
  }));

  const { text } = await callClaude({
    system: CATEGORY_SYSTEM,
    maxTokens: 4096,
    content: [
      {
        type: "text",
        text:
          "PRODUCTOS A CLASIFICAR:\n" +
          JSON.stringify(payload) +
          "\n\nDevuelve un arreglo JSON, un objeto por producto:\n" +
          '{ "product_id": string (el mismo que recibiste),\n' +
          '  "category": una de [' + CATEGORY_VALUES.join(", ") + "],\n" +
          '  "confidence": "alta" | "media" | "baja",\n' +
          '  "reason": string breve en español }\n' +
          "No inventes product_id: usa exactamente los provistos.",
      },
    ],
  });

  type Raw = { product_id?: string; category?: string; confidence?: string; reason?: string };
  const raw = safeJson<Raw[]>(text);
  if (!Array.isArray(raw)) return [];

  const valid = new Set<string>(CATEGORY_VALUES);
  const known = new Set(products.map((p) => p.product_id));
  const out: CategorySuggestion[] = [];
  for (const r of raw) {
    const id = String(r.product_id ?? "");
    if (!known.has(id)) continue;
    const category = valid.has(String(r.category)) ? (r.category as CategorySuggestion["category"]) : "otro";
    const confidence =
      r.confidence === "alta" || r.confidence === "media" || r.confidence === "baja"
        ? r.confidence
        : "baja";
    out.push({
      product_id: id,
      category,
      confidence,
      reason: r.reason?.trim() || "Sugerencia de IA.",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cobranza inteligente — redacta la PROSA de un mensaje de cobranza.
// El LLM NO escribe cifras: el sistema inserta la tabla de facturas y los
// totales (lib/cobranza-data.ts). Por eso el prompt le prohíbe montos/folios.
// Recibe solo los datos mínimos de ESA cuenta. La persona revisa y aprueba.
// ---------------------------------------------------------------------------

const TONO_INSTRUCCION: Record<"amable" | "firme" | "formal", string> = {
  amable:
    "Tono AMABLE y cercano: un recordatorio cordial. El cliente apenas se atrasó. " +
    "Agradece su preferencia y pide amablemente regularizar el saldo.",
  firme:
    "Tono FIRME PERO CORDIAL: el atraso ya es notable. Sé claro en que se requiere el " +
    "pago pronto, manteniendo el respeto y la relación comercial.",
  formal:
    "Tono FORMAL y serio: atraso grave. Menciona explícitamente que la línea de crédito " +
    "queda SUSPENDIDA hasta regularizar el saldo y solicita contacto inmediato para resolver. " +
    "Sin amenazas ni lenguaje legal agresivo.",
};

const COBRANZA_SYSTEM =
  "Eres del área de cobranza de TERAVINO, una distribuidora de vinos y licores en México. " +
  "Redactas mensajes de cobro en español, profesionales y respetuosos. " +
  "REGLA ABSOLUTA: NUNCA escribas cantidades de dinero, folios de factura, fechas ni números de saldo. " +
  "El sistema añade automáticamente la tabla con esas cifras DESPUÉS de tu texto. " +
  "Si necesitas referirte a los montos, di 'el saldo pendiente que se detalla a continuación' o similar. " +
  "No inventes datos. Devuelve SOLO JSON.";

export type CollectionChannel = "email" | "whatsapp";

export async function generateCollectionMessage(input: {
  cliente: string;
  tono: "amable" | "firme" | "formal";
  channel: CollectionChannel;
  numFacturas: number;
  diasVencido: number;
}): Promise<{ subject: string; body: string }> {
  const canalNota =
    input.channel === "whatsapp"
      ? "Es un mensaje de WhatsApp: breve (máx ~6 líneas), sin asunto, cercano pero profesional. " +
        "Puedes usar un emoji discreto como máximo. No uses formato HTML."
      : "Es un correo: incluye un asunto corto y un cuerpo de 2–3 párrafos en texto plano (sin HTML).";

  const { text } = await callClaude({
    system: COBRANZA_SYSTEM,
    maxTokens: 800,
    content: [
      {
        type: "text",
        text:
          `CLIENTE: ${input.cliente}\n` +
          `FACTURAS PENDIENTES: ${input.numFacturas}\n` +
          `DÍAS DE ATRASO (máximo): ${input.diasVencido}\n\n` +
          TONO_INSTRUCCION[input.tono] +
          "\n\n" +
          canalNota +
          "\n\nDevuelve un objeto JSON:\n" +
          '{ "subject": string (asunto del correo; cadena vacía si es WhatsApp),\n' +
          '  "body": string (el mensaje, SIN cifras ni folios — el sistema los añade después) }',
      },
    ],
  });

  const raw = safeJson<{ subject?: string; body?: string }>(text);
  const subject = raw?.subject?.trim() || `Estado de cuenta TERAVINO — ${input.cliente}`;
  const body = raw?.body?.trim() || "";
  return { subject, body };
}

// ---------------------------------------------------------------------------
// Next Best Action — resumen por cuenta para el vendedor. El CÓDIGO calcula los
// hechos (cartera, qué compra, tendencia, churn, cross-sell); el LLM solo
// SINTETIZA estado + recomendación. Recibe solo datos de ESA cuenta. No ejecuta
// ninguna acción: el vendedor lee y decide.
// ---------------------------------------------------------------------------

const NBA_SYSTEM =
  "Eres un coach de ventas de TERAVINO (distribuidora de vinos y licores en México). " +
  "A partir de los HECHOS de UNA cuenta, escribes un resumen breve y accionable para su " +
  "vendedor. No inventes datos ni cifras: usa solo lo que se te da. Sé concreto y directo. " +
  "Devuelve SOLO JSON.";

export type NextBestActionFacts = {
  cliente: string;
  churnLabel: string;
  churnReason: string;
  saldoPendiente: string;
  saldoVencido: string;
  diasVencido: number;
  topProductos: string[];
  recomendaciones: string[];
  tendencia: string;
};

export async function generateNextBestAction(
  facts: NextBestActionFacts,
): Promise<{ resumen: string; accion: string }> {
  const { text } = await callClaude({
    system: NBA_SYSTEM,
    maxTokens: 700,
    content: [
      {
        type: "text",
        text:
          "HECHOS DE LA CUENTA:\n" +
          JSON.stringify(
            {
              cliente: facts.cliente,
              cartera: { pendiente: facts.saldoPendiente, vencido: facts.saldoVencido, dias_vencido: facts.diasVencido },
              compra: facts.topProductos,
              tendencia: facts.tendencia,
              churn: { estado: facts.churnLabel, detalle: facts.churnReason },
              cross_sell_sugerido: facts.recomendaciones,
            },
            null,
            1,
          ) +
          "\n\nDevuelve un objeto JSON:\n" +
          '{ "resumen": string (2-3 frases: estado de cartera, qué compra, tendencia y riesgo),\n' +
          '  "accion": string (UNA siguiente acción concreta y específica para el vendedor) }',
      },
    ],
  });

  const raw = safeJson<{ resumen?: string; accion?: string }>(text);
  return {
    resumen: raw?.resumen?.trim() || "No se pudo generar el resumen.",
    accion: raw?.accion?.trim() || "Contactar al cliente para revisar su situación.",
  };
}
