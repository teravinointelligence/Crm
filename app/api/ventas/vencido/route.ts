// GET /api/ventas/vencido?mes=2026-06
// Vencido generado en el mes: facturas cuyo due_date cae dentro del mes
// seleccionado y que aún tienen balance > 0 (no se pagaron a tiempo).
// Agrupado por vendedor (accounts.assigned_rep_id).

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
  const now = new Date();
  const mesDefault = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const mes = searchParams.get("mes") ?? mesDefault;
  const [y, m] = mes.split("-").map(Number);
  if (!y || !m) return NextResponse.json({ error: "mes inválido" }, { status: 400 });

  const mesStart = `${mes}-01`;
  const mesEnd = new Date(y, m, 1).toISOString().slice(0, 10);

  const isAdmin = canAccessFacturacion(rep.role);
  const supabase = isAdmin ? supabaseAdmin() : createClient();

  // Vendedores
  const { data: repsData } = isAdmin
    ? await supabase
        .from("sales_reps")
        .select("id, full_name")
        .eq("active", true)
        .in("role", SELLER_ROLES)
        .order("full_name")
    : await supabase.from("sales_reps").select("id, full_name").eq("id", rep.id);
  const repsMap = Object.fromEntries(
    (repsData ?? []).map((r) => [r.id, r.full_name as string]),
  );

  // Facturas vencidas en el mes: due_date dentro del mes y balance > 0
  const { data: invoices, error } = await supabase
    .from("invoices")
    .select(`
      id,
      invoice_number,
      invoice_date,
      due_date,
      total,
      balance,
      account_id,
      accounts:account_id ( business_name, region, assigned_rep_id )
    `)
    .gte("due_date", mesStart)
    .lt("due_date", mesEnd)
    .gt("balance", 0)
    .not("status", "in", '("cancelada","pagada")')
    .order("balance", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type InvRow = {
    id: string;
    invoice_number: string;
    invoice_date: string;
    due_date: string;
    total: number;
    balance: number;
    account_id: string;
    accounts: { business_name: string; region: string | null; assigned_rep_id: string | null } | null;
  };

  const rows = (invoices ?? []) as unknown as InvRow[];

  // Filtrar por rep si no es admin
  const filtered = isAdmin
    ? rows
    : rows.filter((r) => r.accounts?.assigned_rep_id === rep.id);

  // Agrupar por vendedor
  type RepStat = {
    rep_id: string;
    rep_name: string;
    total_vencido: number;
    num_facturas: number;
    num_cuentas: number;
    facturas: {
      id: string;
      invoice_number: string;
      account_name: string;
      region: string | null;
      due_date: string;
      balance: number;
      account_id: string;
    }[];
  };

  const byRep: Record<string, RepStat> = {};

  for (const inv of filtered) {
    const rid = inv.accounts?.assigned_rep_id ?? "__sin_rep__";
    if (rid === "__sin_rep__") continue;
    if (!isAdmin && rid !== rep.id) continue;

    byRep[rid] ??= {
      rep_id: rid,
      rep_name: repsMap[rid] ?? rid,
      total_vencido: 0,
      num_facturas: 0,
      num_cuentas: 0,
      facturas: [],
    };

    byRep[rid].total_vencido += Number(inv.balance);
    byRep[rid].num_facturas++;
    byRep[rid].facturas.push({
      id: inv.id,
      invoice_number: inv.invoice_number,
      account_name: inv.accounts?.business_name ?? inv.account_id,
      region: inv.accounts?.region ?? null,
      due_date: inv.due_date,
      balance: Number(inv.balance),
      account_id: inv.account_id,
    });
  }

  // Calcular cuentas únicas por rep
  for (const s of Object.values(byRep)) {
    s.num_cuentas = new Set(s.facturas.map((f) => f.account_id)).size;
    s.total_vencido = Math.round(s.total_vencido * 100) / 100;
  }

  const stats = Object.values(byRep).sort((a, b) => b.total_vencido - a.total_vencido);

  const totalVencido = stats.reduce((s, r) => s + r.total_vencido, 0);
  const totalFacturas = stats.reduce((s, r) => s + r.num_facturas, 0);

  return NextResponse.json({ stats, totalVencido, totalFacturas, mes });
}
