import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { SELLER_ROLES } from "@/lib/modules";
import { ProspectForm } from "@/components/accounts/ProspectForm";

export const metadata = { title: "Registrar prospecto — TERAVINO CRM" };

export default async function NuevoProspectoPage() {
  const supabase = createClient();
  const rep = await getCurrentRep();
  const isAdmin = rep?.role === "admin";

  const { data: reps } = isAdmin
    ? await supabase
        .from("sales_reps")
        .select("*")
        .eq("active", true)
        .in("role", SELLER_ROLES)
        .order("full_name")
    : { data: [] };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl">Registrar prospecto</h1>
        <p className="text-sm text-muted-foreground">
          El primero que lo registra se lo queda. No se puede registrar un negocio
          que ya exista en esa zona.
        </p>
      </div>
      <ProspectForm
        reps={reps ?? []}
        isAdmin={!!isAdmin}
        myRegion={rep?.primary_region ?? null}
      />
    </div>
  );
}
