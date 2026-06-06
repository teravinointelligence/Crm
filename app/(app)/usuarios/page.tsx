import { redirect } from "next/navigation";
import { getCurrentRep } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UsuariosClient } from "@/components/usuarios/UsuariosClient";
import type { SalesRep } from "@/types/database";

export const metadata = { title: "Usuarios — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const me = await getCurrentRep();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/");

  const supabase = createClient();
  const { data } = await supabase
    .from("sales_reps")
    .select("*")
    .order("active", { ascending: false })
    .order("full_name");
  const users = (data ?? []) as SalesRep[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          Da de alta usuarios y define qué módulos puede ver cada uno según su puesto.
        </p>
      </div>
      <UsuariosClient users={users} />
    </div>
  );
}
