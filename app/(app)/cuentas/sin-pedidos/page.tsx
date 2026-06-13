import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { loadChurnedAccounts } from "@/lib/sin-pedidos-email";
import { SinPedidosBoard, type ChurnRepGroup } from "@/components/accounts/SinPedidosBoard";

export const metadata = { title: "Clientes que dejaron de pedir — TERAVINO CRM" };

export default async function SinPedidosPage() {
  if (!(await isAdmin())) redirect("/cuentas");
  const supabase = createClient();

  const [churned, { data: reps }] = await Promise.all([
    loadChurnedAccounts(supabase),
    supabase.from("sales_reps").select("id, full_name, email, active"),
  ]);

  const repMap = new Map(
    (reps ?? []).map((r) => [r.id as string, { name: (r.full_name as string) ?? "—", email: (r.email as string) ?? null }]),
  );

  const groups = new Map<string, ChurnRepGroup>();
  const SIN = "__sin__";
  for (const a of churned) {
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
      last_order_date: a.last_order_date,
      days_since_order: a.days_since_order,
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
        <h1 className="font-display text-3xl">Clientes que dejaron de pedir</h1>
        <p className="text-sm text-muted-foreground">
          Cuentas activas/prospecto que ya facturaron antes pero llevan el periodo elegido sin un nuevo
          pedido (factura) en Reparto. Manda a cada vendedor un recordatorio para reactivarlas.
        </p>
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="Todo al día"
          description="No hay clientes que hayan dejado de pedir en el periodo, o Reparto no está disponible."
        />
      ) : (
        <SinPedidosBoard groups={list} />
      )}
    </div>
  );
}
