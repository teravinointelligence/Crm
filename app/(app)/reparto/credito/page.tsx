// Crédito de clientes (vista de Reparto). Lista a los clientes con cartera
// clasificados por estatus de crédito — Liberado / Por revisar / Suspender —
// para que logística decida a quién entregar. Es una vista OPERATIVA: a
// propósito NO muestra montos $, solo la clasificación de riesgo y los días
// vencidos. Acceso: admin y jefe de logística (ver canViewCreditoClientes).
//
// Como `jefe_logistica` no entra en can_read_all() (RLS solo deja ver sus
// cuentas asignadas), leemos con el service-role tras gatear por rol — mismo
// patrón que el resto de Reparto. El filtrado/buscador vive en el client
// component CreditoClientesList.

import { redirect } from "next/navigation";
import { getCurrentRep } from "@/lib/auth";
import { canViewCreditoClientes, isRepartoOnlyRole } from "@/lib/modules";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { clasificarRiesgo } from "@/lib/cobranza";
import { CreditoClientesList, type CreditoRow } from "@/components/cartera/CreditoClientesList";
import type { AccountBalance } from "@/types/database";

export const metadata = { title: "Crédito de clientes — Reparto" };
export const dynamic = "force-dynamic";

type AccountMeta = {
  id: string;
  business_name: string | null;
  client_number: string | null;
  region: string | null;
  assigned_rep_id: string | null;
  is_legacy: boolean | null;
  ventana_revision: number | null;
  ventana_suspension: number | null;
};

export default async function CreditoClientesPage() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (!canViewCreditoClientes(rep.role)) {
    redirect(isRepartoOnlyRole(rep.role) ? "/reparto/dashboard" : "/");
  }

  const db = supabaseAdmin();
  const [{ data: balances }, { data: accounts }, { data: reps }] = await Promise.all([
    db
      .from("v_account_balance")
      .select(
        "account_id, business_name, region, assigned_rep_id, total_facturado, saldo_vencido, dias_vencido, es_socio",
      ),
    db
      .from("accounts")
      .select(
        "id, business_name, client_number, region, assigned_rep_id, is_legacy, ventana_revision, ventana_suspension",
      ),
    db.from("sales_reps").select("id, full_name"),
  ]);

  const acctMeta = new Map(
    ((accounts ?? []) as AccountMeta[]).map((a) => [a.id, a]),
  );
  const repName = new Map(
    ((reps ?? []) as { id: string; full_name: string | null }[]).map((r) => [r.id, r.full_name]),
  );

  // Universo: clientes con cartera (igual que la página de Cartera).
  const rows: CreditoRow[] = ((balances ?? []) as AccountBalance[])
    .filter((b) => (b.total_facturado ?? 0) > 0)
    .map((b) => {
      const meta = acctMeta.get(b.account_id);
      const riesgo = clasificarRiesgo({
        diasVencido: b.dias_vencido,
        saldoVencido: b.saldo_vencido,
        isLegacy: meta?.is_legacy,
        ventanaRevision: meta?.ventana_revision,
        ventanaSuspension: meta?.ventana_suspension,
      });
      return {
        accountId: b.account_id,
        nombre: b.business_name ?? meta?.business_name ?? "—",
        clientNumber: meta?.client_number ?? null,
        region: b.region ?? meta?.region ?? null,
        vendedor: b.assigned_rep_id ? repName.get(b.assigned_rep_id) ?? null : null,
        diasVencido: b.dias_vencido,
        esSocio: b.es_socio,
        clase: riesgo.clase,
        detalle: riesgo.detalle,
      };
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Crédito de clientes</h1>
        <p className="text-sm text-muted-foreground">
          Estatus de crédito por cliente para decidir entregas. No muestra montos:
          solo la clasificación de riesgo y los días vencidos.
        </p>
      </div>

      <CreditoClientesList rows={rows} />
    </div>
  );
}
