// GET /api/ventas/cobro?mes=2026-06
// Eficiencia de cobro por vendedor:
//   - Vencido actual de su cartera (v_account_balance)
//   - Cobrado en el mes (payments filtrado por mes y cuentas de su cartera)
//   - Eficiencia = cobrado / vencido * 100

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

  // 1) Vendedores
  const { data: repsData } = isAdmin
    ? await supabase
        .from("sales_reps")
        .select("id, full_name")
        .eq("active", true)
        .in("role", SELLER_ROLES)
        .order("full_name")
    : await supabase.from("sales_reps").select("id, full_name").eq("id", rep.id);
  const reps = (repsData ?? []) as { id: string; full_name: string }[];
  const repsMap = Object.fromEntries(reps.map((r) => [r.id, r.full_name]));

  // 2) Vencido actual por vendedor (v_account_balance, agrupado por assigned_rep_id)
  //    Solo cuentas con saldo vencido > 0
  const { data: balances } = await supabase
    .from("v_account_balance")
    .select("account_id, assigned_rep_id, saldo_vencido, saldo_pendiente");

  type Balance = {
    account_id: string;
    assigned_rep_id: string | null;
    saldo_vencido: number;
    saldo_pendiente: number;
  };

  const balanceRows = (balances ?? []) as Balance[];

  // Índice cuenta → rep_id
  const accountToRep: Record<string, string> = {};
  const vencidoByRep: Record<string, number> = {};
  const pendienteByRep: Record<string, number> = {};

  for (const b of balanceRows) {
    const rid = b.assigned_rep_id;
    if (!rid) continue;
    if (!isAdmin && rid !== rep.id) continue;
    accountToRep[b.account_id] = rid;
    vencidoByRep[rid] = (vencidoByRep[rid] ?? 0) + Number(b.saldo_vencido ?? 0);
    pendienteByRep[rid] = (pendienteByRep[rid] ?? 0) + Number(b.saldo_pendiente ?? 0);
  }

  // 3) Pagos del mes, filtrados a cuentas conocidas
  const accountIds = Object.keys(accountToRep);
  let cobradoByRep: Record<string, number> = {};

  if (accountIds.length > 0) {
    const { data: payData } = await supabase
      .from("payments")
      .select("account_id, amount")
      .gte("payment_date", mesStart)
      .lt("payment_date", mesEnd)
      .in("account_id", accountIds);

    for (const p of payData ?? []) {
      const rid = accountToRep[p.account_id];
      if (!rid) continue;
      cobradoByRep[rid] = (cobradoByRep[rid] ?? 0) + Number(p.amount ?? 0);
    }
  }

  // 4) Pagos históricos por mes (últimos 6 meses) para evolución
  const desde6 = new Date(y, m - 6, 1).toISOString().slice(0, 10);
  const { data: histData } = accountIds.length > 0
    ? await supabase
        .from("payments")
        .select("account_id, payment_date, amount")
        .gte("payment_date", desde6)
        .lt("payment_date", mesEnd)
        .in("account_id", accountIds)
    : { data: [] };

  // Agrupar histórico por rep + mes
  const histByRepMes: Record<string, Record<string, number>> = {};
  for (const p of histData ?? []) {
    const rid = accountToRep[p.account_id];
    if (!rid) continue;
    const pm = (p.payment_date as string).slice(0, 7);
    histByRepMes[rid] ??= {};
    histByRepMes[rid][pm] = (histByRepMes[rid][pm] ?? 0) + Number(p.amount ?? 0);
  }

  // Generar lista de últimos 6 meses
  const mesesHist: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    mesesHist.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  // 5) Construir resultado por vendedor
  const stats = reps
    .map((r) => {
      const vencido = vencidoByRep[r.id] ?? 0;
      const pendiente = pendienteByRep[r.id] ?? 0;
      const cobrado = cobradoByRep[r.id] ?? 0;
      const eficiencia = vencido > 0 ? Math.round((cobrado / vencido) * 1000) / 10 : null;
      const hist = mesesHist.map((mm) => ({
        mes: mm,
        cobrado: histByRepMes[r.id]?.[mm] ?? 0,
      }));
      return {
        rep_id: r.id,
        rep_name: r.full_name,
        vencido,
        pendiente,
        cobrado,
        eficiencia,
        hist,
      };
    })
    .filter((s) => s.pendiente > 0 || s.cobrado > 0)
    .sort((a, b) => (b.eficiencia ?? -1) - (a.eficiencia ?? -1));

  return NextResponse.json({ stats, mes, mesesHist });
}
