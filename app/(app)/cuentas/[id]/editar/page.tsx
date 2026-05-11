import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { AccountForm } from "@/components/accounts/AccountForm";

export const metadata = { title: "Editar cuenta — TERAVINO CRM" };

export default async function EditarCuentaPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const rep = await getCurrentRep();
  const isAdmin = rep?.role === "admin";

  const [{ data: account }, { data: reps }] = await Promise.all([
    supabase.from("accounts").select("*").eq("id", params.id).single(),
    supabase
      .from("sales_reps")
      .select("*")
      .eq("active", true)
      .order("full_name"),
  ]);

  if (!account) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-3xl">Editar cuenta</h1>
      <AccountForm
        account={account}
        reps={reps ?? []}
        isAdmin={!!isAdmin}
        defaultRepId={rep?.id}
      />
    </div>
  );
}
