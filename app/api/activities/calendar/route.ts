// GET /api/activities/calendar?month=YYYY-MM
//
// Devuelve las actividades del rep logueado que caen en el mes pedido — ya sea
// porque la actividad ocurrió ese mes (activity_date) o porque tiene un próximo
// paso programado ese mes (next_step_date).
//
// Scope: filtra por sales_rep_id = rep actual (calendario personal). RLS de la
// tabla activities ya restringe de fondo, pero el filtro explícito hace que
// incluso un admin vea SU propio calendario, no el de todos.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return NextResponse.json({ error: "month debe ser YYYY-MM" }, { status: 400 });

  const year = Number(m[1]);
  const mon = Number(m[2]); // 1-12
  // Rango del mes [primer día, primer día del mes siguiente).
  const start = `${year}-${String(mon).padStart(2, "0")}-01`;
  const nextMon = mon === 12 ? 1 : mon + 1;
  const nextYear = mon === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMon).padStart(2, "0")}-01`;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("activities")
    .select(
      "id, activity_type, activity_date, next_step, next_step_date, outcome, notes, account_id, accounts:account_id(business_name)",
    )
    .eq("sales_rep_id", rep.id)
    .or(
      `and(activity_date.gte.${start},activity_date.lt.${end}),and(next_step_date.gte.${start},next_step_date.lt.${end})`,
    )
    .order("activity_date", { ascending: true })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
