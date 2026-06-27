import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ProspectosBoard,
  type ProspectRepGroup,
} from "@/components/accounts/ProspectosBoard";

export const metadata = { title: "Prospectos por vendedor — TERAVINO CRM" };

const MS_DAY = 86_400_000;

export default async function ProspectosPage() {
  if (!(await isAdmin())) redirect("/cuentas");
  const supabase = createClient();

  const [{ data: accts }, { data: act }, { data: reps }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, business_name, region, created_at, created_by, assigned_rep_id")
      .eq("status", "prospecto")
      .order("created_at", { ascending: false }),
    supabase.from("v_account_last_activity").select("account_id, last_activity_date"),
    supabase.from("sales_reps").select("id, full_name"),
  ]);

  const repName = new Map((reps ?? []).map((r) => [r.id as string, (r.full_name as string) ?? "—"]));
  const lastAct = new Map<string, string | null>(
    ((act ?? []) as { account_id: string; last_activity_date: string | null }[]).map((r) => [
      r.account_id,
      r.last_activity_date,
    ]),
  );

  const now = Date.now();
  const SIN = "__sin__";
  const groups = new Map<string, ProspectRepGroup>();

  for (const a of (accts ?? []) as {
    id: string;
    business_name: string;
    region: string | null;
    created_at: string | null;
    created_by: string | null;
    assigned_rep_id: string | null;
  }[]) {
    const key = a.assigned_rep_id ?? SIN;
    if (!groups.has(key)) {
      groups.set(key, {
        rep_id: a.assigned_rep_id,
        rep_name: a.assigned_rep_id ? repName.get(a.assigned_rep_id) ?? "—" : "Sin vendedor asignado",
        prospectos: [],
      });
    }
    const last = lastAct.get(a.id) ?? null;
    groups.get(key)!.prospectos.push({
      account_id: a.id,
      business_name: a.business_name,
      region: a.region,
      created_at: a.created_at,
      created_by_name: a.created_by ? repName.get(a.created_by) ?? null : null,
      last_activity_date: last,
      days_inactive: last ? Math.floor((now - new Date(last).getTime()) / MS_DAY) : null,
    });
  }

  const list = Array.from(groups.values()).sort((x, y) => {
    if (!x.rep_id) return 1;
    if (!y.rep_id) return -1;
    return y.prospectos.length - x.prospectos.length;
  });
  const total = list.reduce((n, g) => n + g.prospectos.length, 0);

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
        <h1 className="font-display text-3xl">Prospectos por vendedor</h1>
        <p className="text-sm text-muted-foreground">
          {total} prospecto{total === 1 ? "" : "s"} en total. Quién los trabaja, cuándo se
          registraron y su última actividad.
        </p>
      </div>

      {total === 0 ? (
        <EmptyState
          title="Sin prospectos"
          description="Aún no hay cuentas en estado prospecto."
        />
      ) : (
        <ProspectosBoard groups={list} />
      )}
    </div>
  );
}
