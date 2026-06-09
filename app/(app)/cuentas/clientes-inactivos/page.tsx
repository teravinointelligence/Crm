import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { loadInactiveAccounts } from "@/lib/inactive-accounts-email";
import { ClientesInactivosBoard, type InactiveRepGroup } from "@/components/accounts/ClientesInactivosBoard";

export const metadata = { title: "Clientes inactivos por vendedor — TERAVINO CRM" };

export default async function ClientesInactivosPage() {
  if (!(await isAdmin())) redirect("/cuentas");
  const supabase = createClient();

  const [inactive, { data: reps }] = await Promise.all([
    loadInactiveAccounts(supabase),
    supabase.from("sales_reps").select("id, full_name, email, active"),
  ]);

  const repMap = new Map(
    (reps ?? []).map((r) => [r.id as string, { name: (r.full_name as string) ?? "—", email: (r.email as string) ?? null }]),
  );

  const groups = new Map<string, InactiveRepGroup>();
  const SIN = "__sin__";
  for (const a of inactive) {
    const key = a.assigned_rep_id ?? SIN;
    if (!groups.has(key)) {
      const rep = a.assigned_rep_id ? repMap.get(a.assigned_rep_id) : undefined;
      groups.set(key, {
        rep_id: a.assigned_rep_id,
        rep_name: rep?.name ?? "Sin vendedor asignado",
        rep_email: rep?.email ?? null,
        accounts: [],
      });
    }
    groups.get(key)!.accounts.push({
      account_id: a.account_id,
      business_name: a.business_name,
      last_activity_date: a.last_activity_date,
      days_inactive: a.days_inactive,
    });
  }

  const list = Array.from(groups.values()).sort((x, y) => {
    if (!x.rep_id) return 1; // "sin vendedor" al final
    if (!y.rep_id) return -1;
    return y.accounts.length - x.accounts.length;
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/cuentas">
            <ArrowLeft className="mr-1 h-4 w-4" /> Cuentas
          </Link>
        </Button>
      </div>

      <div className="space-y-1">
        <h1 className="font-display text-3xl">Clientes inactivos por vendedor</h1>
        <p className="text-sm text-muted-foreground">
          Cuentas activas/prospecto sin ninguna actividad registrada en el periodo elegido (incluye las
          que nunca han tenido actividad). Manda a cada vendedor un recordatorio para darles seguimiento.
        </p>
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="Todo al día"
          description="No hay cuentas activas o prospecto sin actividad reciente."
        />
      ) : (
        <ClientesInactivosBoard groups={list} />
      )}
    </div>
  );
}
