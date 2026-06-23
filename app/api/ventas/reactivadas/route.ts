// GET /api/ventas/reactivadas?mes=2026-06&silencio=30
// Cuentas que volvieron a pedir este mes después de ≥N días sin pedidos.
// Admin ve todo el equipo; vendedor solo ve las suyas (RLS).
//
// Lógica:
//   Para cada cuenta con un pedido en el mes consultado, buscamos su pedido
//   inmediatamente anterior. Si la diferencia entre ese pedido anterior y el
//   primero de este mes es ≥ silencio días → cuenta reactivada.

import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { canAccessFacturacion } from "@/lib/modules";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);

  // Mes consultado (YYYY-MM), default: mes actual
  const now = new Date();
  const mesDefault = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const mes = searchParams.get("mes") ?? mesDefault;
  const [y, m] = mes.split("-").map(Number);
  if (!y || !m) return NextResponse.json({ error: "mes inválido" }, { status: 400 });

  const silencio = Math.min(180, Math.max(7, Number(searchParams.get("silencio") ?? 30)));

  const mesStart = `${mes}-01`;
  const mesEnd = new Date(y, m, 1).toISOString().slice(0, 10); // primer día del mes siguiente

  const isAdmin = canAccessFacturacion(rep.role);
  const supabase = isAdmin ? supabaseAdmin() : createClient();

  // Todos los pedidos aceptados/facturados/entregados (no cancelados ni borradores)
  // de los últimos 2 años para poder calcular el pedido anterior.
  const ventanaAnterior = new Date(y, m - 1, 1);
  ventanaAnterior.setFullYear(ventanaAnterior.getFullYear() - 2);
  const ventanaStr = ventanaAnterior.toISOString().slice(0, 10);

  let q = supabase
    .from("orders")
    .select("id, account_id, sales_rep_id, order_date, accounts:account_id(business_name, region)")
    .eq("order_type", "pedido")
    .not("status", "in", '("borrador","cancelada","rechazada")')
    .gte("order_date", ventanaStr)
    .order("order_date", { ascending: true });

  if (!isAdmin) q = q.eq("sales_rep_id", rep.id);

  const { data: orders, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Vendedores para nombres
  const { data: repsData } = isAdmin
    ? await supabase.from("sales_reps").select("id, full_name").eq("active", true)
    : await supabase.from("sales_reps").select("id, full_name").eq("id", rep.id);
  const repsMap = Object.fromEntries((repsData ?? []).map((r) => [r.id, r.full_name]));

  // Agrupar pedidos por cuenta, ordenados por fecha
  type OrderRow = {
    id: string;
    account_id: string;
    sales_rep_id: string | null;
    order_date: string;
    accounts: { business_name: string | null; region: string | null } | null;
  };
  const rows = (orders ?? []) as unknown as OrderRow[];

  const byAccount: Record<string, OrderRow[]> = {};
  for (const o of rows) {
    (byAccount[o.account_id] ??= []).push(o);
  }

  type Reactivada = {
    account_id: string;
    account_name: string;
    region: string | null;
    rep_id: string;
    rep_name: string;
    primer_pedido_mes: string;
    ultimo_pedido_anterior: string;
    dias_silencio: number;
  };

  const reactivadas: Reactivada[] = [];

  for (const [accountId, pedidos] of Object.entries(byAccount)) {
    // Pedidos en el mes consultado
    const enMes = pedidos.filter((p) => p.order_date >= mesStart && p.order_date < mesEnd);
    if (enMes.length === 0) continue;

    // Pedidos anteriores al mes
    const anteriores = pedidos.filter((p) => p.order_date < mesStart);
    if (anteriores.length === 0) continue; // cuenta nueva, no reactivada

    const primerDelMes = enMes[0].order_date;
    const ultimoAnterior = anteriores[anteriores.length - 1].order_date;

    const diasSilencio = Math.round(
      (new Date(primerDelMes).getTime() - new Date(ultimoAnterior).getTime()) /
        (1000 * 60 * 60 * 24),
    );

    if (diasSilencio >= silencio) {
      const rep_id = enMes[0].sales_rep_id ?? "";
      reactivadas.push({
        account_id: accountId,
        account_name: enMes[0].accounts?.business_name ?? accountId,
        region: enMes[0].accounts?.region ?? null,
        rep_id,
        rep_name: repsMap[rep_id] ?? "—",
        primer_pedido_mes: primerDelMes,
        ultimo_pedido_anterior: ultimoAnterior,
        dias_silencio: diasSilencio,
      });
    }
  }

  reactivadas.sort((a, b) => b.dias_silencio - a.dias_silencio);

  // Resumen por vendedor
  const byRep: Record<string, { rep_id: string; rep_name: string; total: number }> = {};
  for (const r of reactivadas) {
    byRep[r.rep_id] ??= { rep_id: r.rep_id, rep_name: r.rep_name, total: 0 };
    byRep[r.rep_id].total++;
  }
  const porVendedor = Object.values(byRep).sort((a, b) => b.total - a.total);

  return NextResponse.json({ reactivadas, porVendedor, mes, silencio });
}
