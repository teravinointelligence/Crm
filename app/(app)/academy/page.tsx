import Link from "next/link";
import { BookOpenCheck, Gamepad2, Trophy, Wine, Globe2, Building2, Flame } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { AcademyNav } from "@/components/academy/AcademyNav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AcademyLeaderboardRow, AcademyQuizResult } from "@/types/database";

export const metadata = { title: "Academy — TERAVINO CRM" };

export default async function AcademyPage() {
  const supabase = createClient();
  const rep = await getCurrentRep();

  const [{ data: wines }, { data: myResults }, { data: leaderboard }] = await Promise.all([
    supabase.from("academy_wines").select("id, country, producer").eq("active", true),
    rep
      ? supabase
          .from("academy_quiz_results")
          .select("*")
          .eq("rep_id", rep.id)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as AcademyQuizResult[] }),
    supabase
      .from("v_academy_leaderboard")
      .select("*")
      .order("avg_score", { ascending: false })
      .order("quizzes", { ascending: false })
      .limit(8),
  ]);

  const wineList = wines ?? [];
  const totalWines = wineList.length;
  const countries = new Set(wineList.map((w) => w.country).filter(Boolean)).size;
  const producers = new Set(wineList.map((w) => w.producer).filter(Boolean)).size;

  const results = (myResults ?? []) as AcademyQuizResult[];
  const board = (leaderboard ?? []) as AcademyLeaderboardRow[];

  const myQuizzes = results.length;
  const myBestStreak = results.reduce((m, r) => Math.max(m, r.streak ?? 0), 0);
  const myAvg =
    myQuizzes > 0 ? Math.round(results.reduce((s, r) => s + Number(r.score), 0) / myQuizzes) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl">Academy</h1>
          <p className="text-sm text-muted-foreground">
            Aprende el portafolio TERAVINO: estudia las fichas y reta tu memoria con quizzes.
          </p>
        </div>
        <AcademyNav />
      </div>

      {/* Estadísticas del catálogo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Wine} label="Vinos" value={totalWines} />
        <StatCard icon={Globe2} label="Países" value={countries} />
        <StatCard icon={Building2} label="Bodegas" value={producers} />
        <StatCard
          icon={Flame}
          label="Tu mejor racha"
          value={myBestStreak}
          hint={myAvg != null ? `Promedio ${myAvg}%` : "Aún sin quizzes"}
        />
      </div>

      {/* Accesos */}
      <div className="grid gap-4 md:grid-cols-2">
        <ActionCard
          href="/academy/estudiar"
          icon={BookOpenCheck}
          title="Estudiar el catálogo"
          desc="Explora los vinos por tipo, país y bodega. Repasa precios, presentación y maridaje."
          cta="Abrir catálogo"
        />
        <ActionCard
          href="/academy/quiz"
          icon={Gamepad2}
          title="Hacer un quiz"
          desc="Pon a prueba lo que sabes: país, tipo, bodega, región o uva. Suma racha y mejora tu promedio."
          cta="Empezar quiz"
          accent
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Tu progreso */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Tu progreso</CardTitle>
            <CardDescription>Tus últimos quizzes</CardDescription>
          </CardHeader>
          <CardContent>
            {results.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Todavía no has hecho ningún quiz.{" "}
                <Link href="/academy/quiz" className="text-brand-carmesi underline">
                  Empieza uno
                </Link>
                .
              </p>
            ) : (
              <ul className="divide-y">
                {results.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium">{r.category}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.correct_answers}/{r.total_questions} aciertos
                        {r.streak ? ` · racha ${r.streak}` : ""}
                      </p>
                    </div>
                    <Badge variant={Number(r.score) >= 80 ? "success" : Number(r.score) >= 60 ? "warning" : "muted"}>
                      {Math.round(Number(r.score))}%
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Ranking */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trophy className="h-4 w-4 text-brand-oro" /> Ranking del equipo
            </CardTitle>
            <CardDescription>Promedio de aciertos por vendedor</CardDescription>
          </CardHeader>
          <CardContent>
            {board.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                El ranking aparecerá cuando el equipo empiece a practicar.
              </p>
            ) : (
              <ol className="space-y-1.5">
                {board.map((row, i) => (
                  <li
                    key={row.rep_id}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 odd:bg-muted/40"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 text-center text-sm font-semibold text-muted-foreground">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{row.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.quizzes} quizzes
                          {row.primary_region ? ` · ${row.primary_region}` : ""}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline">{Math.round(Number(row.avg_score))}%</Badge>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-accent/20 p-2 text-brand-carmesi">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-semibold leading-none">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{hint ?? label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionCard({
  href,
  icon: Icon,
  title,
  desc,
  cta,
  accent,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  cta: string;
  accent?: boolean;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-brand-carmesi/10 p-2.5 text-brand-carmesi">
            <Icon className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
        </div>
        <CardDescription className="pt-1">{desc}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto">
        <Button asChild variant={accent ? "default" : "outline"}>
          <Link href={href}>{cta}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
