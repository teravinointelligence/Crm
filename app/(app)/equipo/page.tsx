import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { EquipoBoard, type TeamMember } from "@/components/equipo/EquipoBoard";

export const metadata = { title: "Equipo — TERAVINO CRM" };
export const dynamic = "force-dynamic";

export default async function EquipoPage() {
  const supabase = createClient();
  const me = await getCurrentRep();
  if (!me) redirect("/login");

  const { data } = await supabase
    .from("sales_reps")
    .select("id, full_name, primary_region, role, last_seen_at")
    .eq("active", true);

  const members = (data ?? []) as TeamMember[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Equipo en línea</h1>
        <p className="text-sm text-muted-foreground">
          Quién está usando el CRM ahora mismo. ¡A darle, que se nota quién trae ritmo! 🍷
        </p>
      </div>
      <EquipoBoard initial={members} meId={me.id} />
    </div>
  );
}
