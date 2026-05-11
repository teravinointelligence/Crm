import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { AccountsListClient } from "@/components/accounts/AccountsListClient";

export const metadata = { title: "Cuentas — TERAVINO CRM" };

export default async function CuentasPage() {
  const supabase = createClient();
  const rep = await getCurrentRep();
  const isAdmin = rep?.role === "admin";

  const [accountsRes, repsRes] = await Promise.all([
    supabase
      .from("accounts")
      .select("*, sales_reps:assigned_rep_id(full_name)")
      .order("business_name", { ascending: true }),
    supabase
      .from("sales_reps")
      .select("*")
      .eq("active", true)
      .order("full_name"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Cuentas</h1>
        <p className="text-sm text-muted-foreground">
          Hoteles, restaurantes, bares y otros clientes HORECA.
        </p>
      </div>
      <AccountsListClient
        accounts={(accountsRes.data ?? []) as never}
        reps={repsRes.data ?? []}
        isAdmin={!!isAdmin}
      />
    </div>
  );
}
