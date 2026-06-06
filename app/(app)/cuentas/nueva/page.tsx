import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { AccountForm } from "@/components/accounts/AccountForm";

export const metadata = { title: "Nueva cuenta — TERAVINO CRM" };

export default async function NuevaCuentaPage() {
  const supabase = createClient();
  const rep = await getCurrentRep();
  const isAdmin = rep?.role === "admin";

  const { data: reps } = await supabase
    .from("sales_reps")
    .select("*")
    .eq("active", true)
    .order("full_name");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl">Nueva cuenta</h1>
        <p className="text-sm text-muted-foreground">
          Crea un cliente HORECA. La región determina el tier de precio.
        </p>
      </div>
      <AccountForm
        reps={reps ?? []}
        isAdmin={!!isAdmin}
        defaultRepId={rep?.id}
      />
    </div>
  );
}
