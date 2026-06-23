// GET /api/ventas/ticket?meses=6
// Ticket promedio por pedido, por vendedor, evolución mes a mes.
// Fuente: orders (order_type='pedido', status no cancelado/rechazado/borrador).

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { canAccessFacturacion } from "@/lib/modules";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { SELLER_ROLES } from "@/lib/modules";

export async function GET(req: Request) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const meses = Math.min(12, Math.max(2, Number(searchParams.get("meses") ?? 6)));

  const isAdmin = canAccessFacturacion(rep.role);
  const supabase = isAdmin ? supabaseAdmin() : createClient();

  // Período: últimos N meses completos + mes actual
  const now = new Date();
  const desde = new Date(now.getFullYear(), now.getMonth() - meses + 1, 1);
  const desdeStr = desde.toISOString().slice(0, 10);

  let q = supabase
    .from("orders")
    .select("id, sales_rep_id, order_date, total")
    .eq("order_type", "pedido")
    .not("status", "in", '("borrador","cancelada","rechazada")')
    .gte("order_date", desdeStr)
    .order("order_date", { ascending: true });

  if (!isAdmin) q = q.eq("sales_rep_id", rep.id);

  const { data: orders, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Vendedores
  const { data: repsData } = isAdmin
    ? await supabase.from("sales_reps").select("id, full_name").eq("active", true).in("role", SELLER_ROLES).order("full_name")
    : await supabase.from("sales_reps").select("id, full_name").eq("id", rep.id);
  const repsMap = Object.fromEntries((repsData ?? []).map((r) => [r.id, r.full_name]));

  // Generar lista de meses en rango
  const monthsList: string[] = [];
  for (let i = 0; i < meses; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - meses + 1 + i, 1);
    monthsList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  // Agrupar por vendedor + mes
  type Cell = { pedidos: number; total: number };
  const grid: Record<string, Record<string, Cell>> = {}; // repId → mes → Cell

  for (const o of orders ?? []) {
    const rid = o.sales_rep_id ?? "__sin_rep__";
    const mes = (o.order_date as string).slice(0, 7);
    grid[rid] ??= {};
    grid[rid][mes] ??= { pedidos: 0, total: 0 };
    grid[rid][mes].pedidos++;
    grid[rid][mes].total += Number(o.total ?? 0);
  }

  // Construir filas por vendedor
  const rows = Object.entries(grid)
    .filter(([rid]) => rid !== "__sin_rep__")
    .map(([rid, mData]) => {
      const meses_data = monthsList.map((m) => {
        const cell = mData[m];
        return {
          mes: m,
          pedidos: cell?.pedidos ?? 0,
          total: cell?.total ?? 0,
          ticket: cell && cell.pedidos > 0 ? Math.round(cell.total / cell.pedidos) : null,
        };
      });
      const totalPedidos = meses_data.reduce((s, d) => s + d.pedidos, 0);
      const totalVenta = meses_data.reduce((s, d) => s + d.total, 0);
      return {
        rep_id: rid,
        rep_name: repsMap[rid] ?? rid,
        meses: meses_data,
        ticket_promedio: totalPedidos > 0 ? Math.round(totalVenta / totalPedidos) : 0,
        total_pedidos: totalPedidos,
      };
    })
    .filter((r) => r.total_pedidos > 0)
    .sort((a, b) => b.ticket_promedio - a.ticket_promedio);

  return NextResponse.json({ rows, meses: monthsList });
}
