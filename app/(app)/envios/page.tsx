import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { EnviosClient, type EnvioRow } from "@/components/envios/EnviosClient";

export const metadata = { title: "Envíos a clientes — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function EnviosPage() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (rep.role !== "admin") redirect("/");

  const supabase = createClient();
  const { data } = await supabase
    .from("client_email_log")
    .select("id, kind, subject, recipients, recipient_count, created_at, account:account_id(business_name), rep:sent_by(full_name)")
    .order("created_at", { ascending: false })
    .limit(1000);

  const rows: EnvioRow[] = (data ?? []).map((r: any) => ({
    id: r.id,
    kind: r.kind,
    subject: r.subject,
    recipients: r.recipients ?? [],
    recipient_count: r.recipient_count ?? 0,
    created_at: r.created_at,
    account_name: r.account?.business_name ?? null,
    rep_name: r.rep?.full_name ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Envíos a clientes</h1>
        <p className="text-sm text-muted-foreground">
          Registro de correos enviados a clientes (portafolio, estado de cuenta, promociones, etc.).
          Muestra los últimos 1,000 envíos.
        </p>
      </div>
      <EnviosClient rows={rows} />
    </div>
  );
}
