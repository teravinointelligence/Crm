import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { loadIncompleteAccounts } from "@/lib/missing-data-email";
import { DatosFaltantesBoard, type RepGroup } from "@/components/accounts/DatosFaltantesBoard";

export const metadata = { title: "Datos faltantes por vendedor — TERAVINO CRM" };

export default async function DatosFaltantesPage() {
  if (!(await isAdmin())) redirect("/cuentas");
  const supabase = createClient();

  const [incomplete, { data: reps }] = await Promise.all([
    loadIncompleteAccounts(supabase),
    supabase.from("sales_reps").select("id, full_name, email, active"),
  ]);

  const repMap = new Map(
    (reps ?? []).map((r) => [r.id as string, { name: (r.full_name as string) ?? "—", email: (r.email as string) ?? null }]),
  );

  const groups = new Map<string, RepGroup>();
  const SIN = "__sin__";
  for (const a of incomplete) {
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
    groups.get(key)!.accounts.push({ account_id: a.account_id, business_name: a.business_name, missing: a.missing });
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
        <h1 className="font-display text-3xl">Datos faltantes por vendedor</h1>
        <p className="text-sm text-muted-foreground">
          Cuentas activas/prospecto con registro incompleto (contactos, email, teléfono, contacto de
          cuentas por pagar o datos fiscales). Manda a cada vendedor un resumen de lo que le falta.
        </p>
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="Todo en orden"
          description="No hay cuentas activas con datos faltantes según los criterios actuales."
        />
      ) : (
        <DatosFaltantesBoard groups={list} />
      )}
    </div>
  );
}
