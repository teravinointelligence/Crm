import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { AcademyNav } from "@/components/academy/AcademyNav";
import { QuizClient } from "@/components/academy/QuizClient";
import type { AcademyWine } from "@/types/database";

export const metadata = { title: "Quiz — Academy — TERAVINO CRM" };

export default async function AcademyQuizPage() {
  const supabase = createClient();
  const rep = await getCurrentRep();

  const { data } = await supabase
    .from("academy_wines")
    .select("id, name, producer, region, country, type, grape_varieties, vintage")
    .eq("active", true);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl">Quiz</h1>
          <p className="text-sm text-muted-foreground">
            Elige una categoría y reta tu memoria. Tus resultados suman al ranking del equipo.
          </p>
        </div>
        <AcademyNav />
      </div>
      <QuizClient wines={(data ?? []) as AcademyWine[]} repId={rep?.id ?? null} />
    </div>
  );
}
