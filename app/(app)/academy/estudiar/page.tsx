import { createClient } from "@/lib/supabase/server";
import { AcademyNav } from "@/components/academy/AcademyNav";
import { StudyCatalogClient } from "@/components/academy/StudyCatalogClient";
import type { AcademyWine } from "@/types/database";

export const metadata = { title: "Estudiar — Academy — TERAVINO CRM" };

export default async function AcademyEstudiarPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("academy_wines")
    .select("*")
    .eq("active", true)
    .order("producer", { ascending: true })
    .order("name", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl">Estudiar</h1>
          <p className="text-sm text-muted-foreground">
            El portafolio TERAVINO, ficha por ficha. Filtra y repasa antes del quiz.
          </p>
        </div>
        <AcademyNav />
      </div>
      <StudyCatalogClient wines={(data ?? []) as AcademyWine[]} />
    </div>
  );
}
