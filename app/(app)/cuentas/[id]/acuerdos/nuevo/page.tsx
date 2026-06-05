import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { AgreementForm } from "@/components/accounts/AgreementForm";

export const metadata = { title: "Nuevo acuerdo — TERAVINO CRM" };

export default async function NuevoAcuerdoPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const me = await getCurrentRep();
  if (!me) redirect("/login");

  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_name, assigned_rep_id")
    .eq("id", params.id)
    .single();
  if (!account) notFound();

  const [{ data: contacts }, { data: reps }] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, full_name, role")
      .eq("account_id", params.id)
      .order("is_primary", { ascending: false })
      .order("full_name"),
    supabase.from("sales_reps").select("id, full_name").eq("active", true).order("full_name"),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <Link
          href={`/cuentas/${params.id}?tab=acuerdos`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-brand-carmesi"
        >
          <ChevronLeft className="h-4 w-4" /> {account.business_name}
        </Link>
        <h1 className="font-display text-3xl">Nuevo acuerdo</h1>
        <p className="text-sm text-muted-foreground">
          Registra un acuerdo comercial: comodato de equipo, precio especial, consignación, etc.
        </p>
      </div>
      <AgreementForm
        accountId={params.id}
        contacts={(contacts ?? []).map((c) => ({
          id: c.id,
          label: c.role ? `${c.full_name} · ${c.role}` : c.full_name,
        }))}
        reps={(reps ?? []).map((r) => ({ id: r.id, label: r.full_name }))}
        defaultRepId={account.assigned_rep_id ?? me.id}
      />
    </div>
  );
}
