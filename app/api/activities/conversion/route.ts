// GET /api/activities/conversion?dias=90&rep=<id>
// Calcula la tasa de conversión visita→pedido por vendedor.
// Admin puede ver todos o filtrar por rep; el vendedor solo ve la suya.
//
// Conversión: una actividad "realizada" convierte si existe un pedido
// (order_type='pedido', status no cancelado/rechazado) para la misma cuenta
// dentro de los 30 días siguientes a la fecha de la actividad.

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { canAccessFacturacion } from "@/lib/modules";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const VENTANA_DIAS = 30;

export async function GET(req: Request) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const dias = Math.min(180, Math.max(7, Number(searchParams.get("dias") ?? 90)));
  const isAdmin = canAccessFacturacion(rep.role);
  const repFilter = isAdmin ? (searchParams.get("rep") ?? null) : rep.id;

  const supabase = isAdmin ? supabaseAdmin() : createClient();

  // Período de consulta
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);
  const desdeStr = desde.toISOString();

  // 1) Actividades realizadas en el período
  let actQ = supabase
    .from("activities")
    .select("id, account_id, sales_rep_id, activity_date, activity_type")
    .eq("status", "realizada")
    .gte("activity_date", desdeStr);
  if (repFilter) actQ = actQ.eq("sales_rep_id", repFilter);

  // 2) Pedidos en el período + ventana (hasta hoy)
  let ordQ = supabase
    .from("orders")
    .select("id, account_id, sales_rep_id, order_date")
    .eq("order_type", "pedido")
    .not("status", "in", '("cancelada","rechazada")')
    .gte("order_date", desde.toISOString().slice(0, 10));
  if (repFilter) ordQ = ordQ.eq("sales_rep_id", repFilter);

  // 3) Sales reps (para nombre)
  const repsQ = isAdmin
    ? supabase.from("sales_reps").select("id, full_name").eq("active", true).order("full_name")
    : supabase.from("sales_reps").select("id, full_name").eq("id", rep.id);

  const [actRes, ordRes, repsRes] = await Promise.all([actQ, ordQ, repsQ]);

  const activities = actRes.data ?? [];
  const orders = ordRes.data ?? [];
  const repsMap = Object.fromEntries((repsRes.data ?? []).map((r) => [r.id, r.full_name]));

  // Índice de pedidos por cuenta → array de fechas de pedido
  const ordersByAccount: Record<string, string[]> = {};
  for (const o of orders) {
    (ordersByAccount[o.account_id] ??= []).push(o.order_date);
  }

  // Evaluar conversión por actividad
  type ActResult = {
    id: string;
    account_id: string;
    sales_rep_id: string;
    activity_date: string;
    activity_type: string | null;
    converted: boolean;
  };

  const evaluated: ActResult[] = activities.map((a) => {
    const actDate = new Date(a.activity_date);
    const limitDate = new Date(actDate);
    limitDate.setDate(limitDate.getDate() + VENTANA_DIAS);
    const limitStr = limitDate.toISOString().slice(0, 10);
    const actDateStr = actDate.toISOString().slice(0, 10);

    const converted = (ordersByAccount[a.account_id] ?? []).some(
      (d) => d >= actDateStr && d <= limitStr,
    );
    return { ...a, converted };
  });

  // Agrupar por vendedor
  type RepStat = {
    rep_id: string;
    rep_name: string;
    total: number;
    convertidas: number;
    tasa: number;
    por_tipo: Record<string, { total: number; convertidas: number }>;
  };

  const byRep: Record<string, RepStat> = {};
  for (const a of evaluated) {
    const rid = a.sales_rep_id;
    if (!rid) continue;
    if (!byRep[rid]) {
      byRep[rid] = {
        rep_id: rid,
        rep_name: repsMap[rid] ?? rid,
        total: 0,
        convertidas: 0,
        tasa: 0,
        por_tipo: {},
      };
    }
    const s = byRep[rid];
    s.total++;
    if (a.converted) s.convertidas++;

    const tipo = a.activity_type ?? "otro";
    s.por_tipo[tipo] ??= { total: 0, convertidas: 0 };
    s.por_tipo[tipo].total++;
    if (a.converted) s.por_tipo[tipo].convertidas++;
  }

  const stats = Object.values(byRep).map((s) => ({
    ...s,
    tasa: s.total > 0 ? Math.round((s.convertidas / s.total) * 1000) / 10 : 0,
  }));

  stats.sort((a, b) => b.tasa - a.tasa);

  return NextResponse.json({ stats, dias, ventana_dias: VENTANA_DIAS });
}
