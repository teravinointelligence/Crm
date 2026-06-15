import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep, isAdmin } from "@/lib/auth";
import { CATEGORIES } from "@/lib/catalogo/normalize.mjs";
import type { ApprovedChange, NormField } from "@/lib/catalogo/types";

export const dynamic = "force-dynamic";

const ALLOWED_FIELDS: NormField[] = ["category", "country", "varietal", "vintage", "volume_ml"];
const CATEGORY_SET = new Set<string>(CATEGORIES);

/** Valida y normaliza el valor según el campo. Devuelve null si es inválido. */
function coerceValue(field: NormField, value: unknown): string | number | null {
  if (field === "category") {
    return CATEGORY_SET.has(String(value)) ? String(value) : null;
  }
  if (field === "volume_ml") {
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= 50 && n <= 6000 ? n : null;
  }
  // country / varietal / vintage → texto acotado.
  const s = String(value ?? "").trim();
  return s && s.length <= 120 ? s : null;
}

// POST: aplica las aprobaciones. Body: { changes: ApprovedChange[] }.
// Escribe los productos (RLS admin) y registra cada cambio en
// product_normalization_log con su valor anterior. Human-in-the-loop: solo
// llega aquí lo que el admin aprobó en la UI.
export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Solo administradores." }, { status: 403 });
  }
  const rep = await getCurrentRep();

  let body: { changes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const raw = Array.isArray(body.changes) ? (body.changes as ApprovedChange[]) : [];
  if (!raw.length) {
    return NextResponse.json({ error: "No se enviaron cambios." }, { status: 400 });
  }

  // Valida y agrupa por producto (un update por producto puede tocar varios campos).
  const rejected: { product_id: string; field: string; reason: string }[] = [];
  const byProduct = new Map<string, Partial<Record<NormField, string | number>>>();
  const meta = new Map<string, { field: NormField; source: string; confidence: string | null }[]>();

  for (const c of raw) {
    const pid = String(c.product_id ?? "");
    const field = c.field;
    if (!pid || !ALLOWED_FIELDS.includes(field)) {
      rejected.push({ product_id: pid, field: String(field), reason: "Campo no permitido" });
      continue;
    }
    const value = coerceValue(field, c.value);
    if (value === null) {
      rejected.push({ product_id: pid, field, reason: "Valor inválido" });
      continue;
    }
    if (!byProduct.has(pid)) byProduct.set(pid, {});
    byProduct.get(pid)![field] = value;
    if (!meta.has(pid)) meta.set(pid, []);
    const src = String(c.source);
    meta.get(pid)!.push({
      field,
      source: src === "llm" ? "llm" : src === "manual" ? "manual" : "rules",
      confidence: c.confidence ?? null,
    });
  }

  if (!byProduct.size) {
    return NextResponse.json({ applied: 0, rejected }, { status: 400 });
  }

  const supabase = createClient();

  // Valores anteriores (para la bitácora) en una sola consulta.
  const ids = [...byProduct.keys()];
  const { data: current, error: readErr } = await supabase
    .from("products")
    .select("id, category, country, varietal, vintage, volume_ml")
    .in("id", ids);
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  const currentById = new Map((current ?? []).map((p) => [p.id, p]));

  let applied = 0;
  const logRows: Record<string, unknown>[] = [];
  const failures: { product_id: string; reason: string }[] = [];

  for (const [pid, patch] of byProduct) {
    const before = currentById.get(pid);
    if (!before) {
      failures.push({ product_id: pid, reason: "Producto no encontrado" });
      continue;
    }
    const { error: upErr } = await supabase
      .from("products")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", pid);
    if (upErr) {
      failures.push({ product_id: pid, reason: upErr.message });
      continue;
    }
    applied += 1;
    for (const m of meta.get(pid) ?? []) {
      logRows.push({
        product_id: pid,
        field: m.field,
        old_value: before[m.field as keyof typeof before] == null ? null : String(before[m.field as keyof typeof before]),
        new_value: String(patch[m.field]),
        source: m.source,
        confidence: m.confidence,
        applied_by: rep?.id ?? null,
      });
    }
  }

  if (logRows.length) {
    // La bitácora es informativa: si fallara, no revertimos los updates.
    await supabase.from("product_normalization_log").insert(logRows);
  }

  return NextResponse.json({ applied, rejected, failures });
}
