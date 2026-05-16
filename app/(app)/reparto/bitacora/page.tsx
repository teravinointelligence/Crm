// Bitácora de entregas: tabla con filtros y export a Excel.

import { redirect } from "next/navigation";
import { getCurrentRep } from "@/lib/auth";
import { repartoAdmin } from "@/lib/supabase-reparto";
import { BitacoraTable } from "@/components/reparto/BitacoraTable";

export const metadata = { title: "Bitácora — Reparto" };
export const dynamic = "force-dynamic";

export default async function BitacoraPage() {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (rep.role !== "admin") redirect("/");

  const { data: choferes } = await repartoAdmin
    .from("usuarios")
    .select("id, nombre")
    .eq("es_chofer", true)
    .eq("activo", true)
    .order("nombre");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Bitácora de entregas</h1>
        <p className="text-sm text-muted-foreground">Historial de entregas con evidencia fotográfica y status de WhatsApp.</p>
      </div>
      <BitacoraTable choferes={(choferes ?? []) as { id: string; nombre: string }[]} />
    </div>
  );
}
