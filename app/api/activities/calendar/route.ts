// GET /api/activities/calendar?month=YYYY-MM&rep=<id|all>
//
// Devuelve las actividades del mes pedido (por activity_date o next_step_date).
//
// Scope:
//   - rep (no admin): siempre sus propias actividades (se ignora el param rep).
//   - admin: por defecto su propio calendario; con rep=all ve TODAS las agendas,
//     o con rep=<id> la agenda de un vendedor específico.
// RLS de activities respeta el scope de fondo.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const isAdmin = rep.role === "admin";

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return NextResponse.json({ error: "month debe ser YYYY-MM" }, { status: 400 });
  const repParam = searchParams.get("rep");

  const year = Number(m[1]);
  const mon = Number(m[2]); // 1-12
  // Rango del mes [primer día, primer día del mes siguiente).
  const start = `${year}-${String(mon).padStart(2, "0")}-01`;
  const nextMon = mon === 12 ? 1 : mon + 1;
  const nextYear = mon === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMon).padStart(2, "0")}-01`;

  const supabase = createClient();
  let query = supabase
    .from("activities")
    .select(
      "id, activity_type, activity_date, next_step, next_step_date, outcome, notes, account_id, sales_rep_id, accounts:account_id(business_name), sales_reps:sales_rep_id(full_name)",
    )
    .or(
      `and(activity_date.gte.${start},activity_date.lt.${end}),and(next_step_date.gte.${start},next_step_date.lt.${end})`,
    )
    .order("activity_date", { ascending: true })
    .limit(1000);

  // Filtro por vendedor.
  if (isAdmin) {
    if (repParam && repParam !== "all") {
      query = query.eq("sales_rep_id", repParam);
    }
    // repParam === "all" (o ausente con intención de todos) → sin filtro (RLS da todo a admin).
    // Nota: si el admin no pasa rep, mostramos todo también para que vea las agendas.
  } else {
    query = query.eq("sales_rep_id", rep.id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
