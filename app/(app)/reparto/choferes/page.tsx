// Administración de choferes y operadores del proyecto Reparto.

import { redirect } from "next/navigation";
import { getCurrentRep } from "@/lib/auth";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { ChoferesAdmin } from "@/components/reparto/ChoferesAdmin";

export const metadata = { title: "Choferes — Reparto" };
export const dynamic = "force-dynamic";

export default async function ChoferesPage() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (rep.role !== "admin") redirect("/");

  const { data } = await repartoAdmin
    .from("usuarios")
    .select("id, auth_id, nombre, email, rol, telefono, activo, es_chofer")
    .order("nombre");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Choferes y operadores</h1>
        <p className="text-sm text-muted-foreground">
          Da de alta nuevos choferes (con o sin acceso a la app móvil), edita sus datos
          o desactívalos cuando dejen de operar.
        </p>
      </div>
      <ChoferesAdmin
        usuarios={(data ?? []) as Array<{
          id: string; auth_id: string | null; nombre: string; email: string;
          rol: string | null; telefono: string | null; activo: boolean; es_chofer: boolean;
        }>}
      />
    </div>
  );
}
