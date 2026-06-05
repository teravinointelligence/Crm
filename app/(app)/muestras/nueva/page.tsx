import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { SampleRequestForm } from "@/components/samples/SampleRequestForm";

export const metadata = { title: "Solicitar muestras — TERAVINO CRM" };

// Solo citas presenciales sirven para servir una muestra física.
const CITA_TYPES = ["visita", "degustacion", "reunion", "evento"];

export default async function NuevaMuestraPage({
  searchParams,
}: {
  searchParams: { account?: string };
}) {
  const supabase = createClient();
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  const isAdmin = rep.role === "admin";

  const [{ data: products }, { data: citasRaw }, { data: lockedRows }, { data: bankRows }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, supplier, varietal, vintage, active, country, region_origin")
      .eq("active", true)
      .order("supplier")
      .order("name"),
    supabase
      .from("activities")
      .select("id, activity_date, activity_type, account_id, accounts:account_id(business_name, client_number)")
      .eq("sales_rep_id", rep.id)
      .eq("status", "agendada")
      .in("activity_type", CITA_TYPES)
      .gte("activity_date", new Date().toISOString())
      .order("activity_date", { ascending: true }),
    supabase.rpc("rep_locked_sample_products"),
    supabase.rpc("rep_bank_available_products"),
  ]);

  const lockedProductIds = ((lockedRows ?? []) as Array<{ product_id: string }>).map((r) => r.product_id);
  const bankProductIds = ((bankRows ?? []) as Array<{ product_id: string }>).map((r) => r.product_id);

  const citas = (citasRaw ?? []).map((c) => {
    const acc = (Array.isArray(c.accounts) ? c.accounts[0] : c.accounts) as unknown as
      { business_name: string | null; client_number: string | null } | null;
    return {
      id: c.id as string,
      activity_date: c.activity_date as string,
      activity_type: c.activity_type as string,
      account_id: (c.account_id as string | null) ?? null,
      account_name: acc?.business_name ?? null,
      client_number: acc?.client_number ?? null,
    };
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="font-display text-3xl">Solicitar muestras</h1>
      <SampleRequestForm
        products={products ?? []}
        repId={rep.id}
        isAdmin={isAdmin}
        citas={citas}
        lockedProductIds={lockedProductIds}
        bankProductIds={bankProductIds}
        preselectAccountId={searchParams.account}
      />
    </div>
  );
}
