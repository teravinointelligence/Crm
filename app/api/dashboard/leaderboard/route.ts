// GET /api/dashboard/leaderboard
// Tabla de posiciones semanal: actividades + pedidos + racha de días con meta cumplida.
// La "semana" va de lunes a hoy (o domingo si quieren ver la semana completa).

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SELLER_ROLES } from "@/lib/modules";

// Lunes de la semana actual
function weekStart() {
  const d = new Date();
  const day = d.getDay(); // 0=Dom
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Días laborales (Lun–Sáb) hacia atrás desde hoy para calcular racha
function workdaysBefore(n: number): string[] {
  const days: string[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  while (days.length < n) {
    const dow = d.getDay(); // 0=Dom
    if (dow !== 0) {
      days.push(d.toISOString().slice(0, 10));
    }
    d.setDate(d.getDate() - 1);
  }
  return days; // newest first
}

export async function GET() {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const supabase = supabaseAdmin();

  // Vendedores activos
  const { data: repsData } = await supabase
    .from("sales_reps")
    .select("id, full_name")
    .eq("active", true)
    .in("role", SELLER_ROLES)
    .order("full_name");
  const reps = (repsData ?? []) as { id: string; full_name: string }[];

  const lunes = weekStart().toISOString().slice(0, 10);
  const hoy = new Date().toISOString().slice(0, 10);

  // Actividades de la semana (realizadas)
  const { data: actData } = await supabase
    .from("activities")
    .select("sales_rep_id, activity_date, status")
    .gte("activity_date", lunes)
    .lte("activity_date", hoy)
    .eq("status", "realizada");

  // Pedidos de la semana (no cancelados, de tipo pedido)
  const { data: ordData } = await supabase
    .from("orders")
    .select("sales_rep_id, order_date")
    .gte("order_date", lunes)
    .lte("order_date", hoy)
    .eq("order_type", "pedido")
    .not("status", "eq", "cancelada");

  // Para racha: actividades de los últimos 30 días laborales
  const diasHist = workdaysBefore(30);
  const { data: streakData } = await supabase
    .from("activities")
    .select("sales_rep_id, activity_date")
    .gte("activity_date", diasHist[diasHist.length - 1])
    .lte("activity_date", hoy)
    .eq("status", "realizada");

  // Agrupar actividades por rep + fecha
  const actByRepDay: Record<string, Record<string, number>> = {};
  for (const a of actData ?? []) {
    const rid = a.sales_rep_id as string;
    const d = (a.activity_date as string).slice(0, 10);
    actByRepDay[rid] ??= {};
    actByRepDay[rid][d] = (actByRepDay[rid][d] ?? 0) + 1;
  }

  // Contar actividades de la semana por rep
  const actWeekByRep: Record<string, number> = {};
  for (const a of actData ?? []) {
    const rid = a.sales_rep_id as string;
    actWeekByRep[rid] = (actWeekByRep[rid] ?? 0) + 1;
  }

  // Contar pedidos de la semana por rep
  const ordWeekByRep: Record<string, number> = {};
  for (const o of ordData ?? []) {
    const rid = o.sales_rep_id as string;
    ordWeekByRep[rid] = (ordWeekByRep[rid] ?? 0) + 1;
  }

  // Actividades históricas para racha
  const histByRepDay: Record<string, Record<string, number>> = {};
  for (const a of streakData ?? []) {
    const rid = a.sales_rep_id as string;
    const d = (a.activity_date as string).slice(0, 10);
    histByRepDay[rid] ??= {};
    histByRepDay[rid][d] = (histByRepDay[rid][d] ?? 0) + 1;
  }

  // Calcular racha: días laborales consecutivos (más reciente primero) con ≥2 actividades
  function calcRacha(repId: string): number {
    const byDay = histByRepDay[repId] ?? {};
    let streak = 0;
    for (const dia of diasHist) {
      if ((byDay[dia] ?? 0) >= 2) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  const standings = reps
    .map((r) => ({
      rep_id: r.id,
      rep_name: r.full_name,
      actividades: actWeekByRep[r.id] ?? 0,
      pedidos: ordWeekByRep[r.id] ?? 0,
      racha: calcRacha(r.id),
    }))
    .sort((a, b) => b.actividades - a.actividades || b.pedidos - a.pedidos);

  // Asignar posición (puede haber empates)
  const result = standings.map((s, i) => ({ ...s, posicion: i + 1 }));

  return NextResponse.json({
    standings: result,
    semana: lunes,
    myRepId: rep.id,
  });
}
