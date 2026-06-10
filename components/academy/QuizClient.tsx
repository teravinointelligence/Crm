"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Flame, Check, X, RotateCcw, Trophy, Wine as WineIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  QUIZ_CATEGORIES,
  buildQuiz,
  scoreLabel,
  type QuizCategory,
  type QuizQuestion,
} from "@/lib/academy";
import type { AcademyWine } from "@/types/database";

const QUESTION_COUNT = 10;

type Phase = "setup" | "playing" | "done";

export function QuizClient({ wines, repId }: { wines: AcademyWine[]; repId: string | null }) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [category, setCategory] = useState<QuizCategory | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const savedRef = useRef(false);

  function start(cat: QuizCategory) {
    const qs = buildQuiz(wines, cat.field, QUESTION_COUNT);
    if (qs.length === 0) {
      toast.error("No hay suficientes vinos para armar este quiz todavía.");
      return;
    }
    setCategory(cat);
    setQuestions(qs);
    setIndex(0);
    setSelected(null);
    setCorrect(0);
    setStreak(0);
    setBestStreak(0);
    setElapsed(0);
    savedRef.current = false;
    startedAt.current = Date.now();
    setPhase("playing");
  }

  function answer(option: string) {
    if (selected) return; // ya respondida
    const q = questions[index];
    const ok = option === q.answer;
    setSelected(option);
    if (ok) {
      setCorrect((c) => c + 1);
      setStreak((s) => {
        const ns = s + 1;
        setBestStreak((b) => Math.max(b, ns));
        return ns;
      });
    } else {
      setStreak(0);
    }
  }

  function next() {
    if (index + 1 >= questions.length) {
      setElapsed(Math.round((Date.now() - startedAt.current) / 1000));
      setPhase("done");
    } else {
      setIndex((i) => i + 1);
      setSelected(null);
    }
  }

  // Guarda el resultado una sola vez al terminar.
  useEffect(() => {
    if (phase !== "done" || savedRef.current || !category) return;
    savedRef.current = true;
    const total = questions.length;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    if (!repId) {
      toast.info("Quiz terminado (no se guardó: usuario sin vendedor asignado).");
      return;
    }
    const supabase = createClient();
    supabase
      .from("academy_quiz_results")
      .insert({
        rep_id: repId,
        category: category.label,
        score,
        total_questions: total,
        correct_answers: correct,
        time_spent_seconds: elapsed,
        streak: bestStreak,
      })
      .then(({ error }) => {
        if (error) toast.error("No se pudo guardar el resultado", { description: error.message });
        else toast.success("Resultado guardado");
      });
  }, [phase, category, questions.length, correct, elapsed, bestStreak, repId]);

  if (phase === "setup") {
    return <Setup onPick={start} disabled={wines.length === 0} />;
  }

  if (phase === "done") {
    const total = questions.length;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    return (
      <Done
        score={score}
        correct={correct}
        total={total}
        bestStreak={bestStreak}
        elapsed={elapsed}
        categoryLabel={category?.label ?? ""}
        onRetry={() => category && start(category)}
        onChange={() => setPhase("setup")}
      />
    );
  }

  const q = questions[index];
  const answered = selected !== null;
  const progress = (index / questions.length) * 100;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {/* Barra superior: progreso + racha */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Pregunta {index + 1} de {questions.length}
        </span>
        <span className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Check className="h-4 w-4 text-emerald-600" /> {correct}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 font-medium",
              streak >= 2 ? "text-brand-carmesi" : "text-muted-foreground",
            )}
          >
            <Flame className="h-4 w-4" /> {streak}
          </span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-brand-carmesi transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <p className="text-sm font-medium text-muted-foreground">{q.prompt}</p>
          <div className="rounded-lg bg-accent/15 px-4 py-3">
            <p className="font-display text-lg leading-tight">{q.wineName}</p>
            {q.subtitle && <p className="text-xs text-muted-foreground">{q.subtitle}</p>}
          </div>

          <div className="grid gap-2">
            {q.options.map((opt) => {
              const isAnswer = opt === q.answer;
              const isPicked = opt === selected;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => answer(opt)}
                  disabled={answered}
                  className={cn(
                    "flex items-center justify-between rounded-md border px-4 py-3 text-left text-sm transition-colors",
                    !answered && "hover:border-brand-carmesi hover:bg-muted",
                    answered && isAnswer && "border-emerald-500 bg-emerald-50 text-emerald-900",
                    answered && isPicked && !isAnswer && "border-red-500 bg-red-50 text-red-900",
                    answered && !isAnswer && !isPicked && "opacity-50",
                  )}
                >
                  <span>{opt}</span>
                  {answered && isAnswer && <Check className="h-4 w-4 text-emerald-600" />}
                  {answered && isPicked && !isAnswer && <X className="h-4 w-4 text-red-600" />}
                </button>
              );
            })}
          </div>

          {answered && (
            <Button onClick={next} className="w-full">
              {index + 1 >= questions.length ? "Ver resultado" : "Siguiente"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Setup({ onPick, disabled }: { onPick: (c: QuizCategory) => void; disabled: boolean }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Elige una categoría ({QUESTION_COUNT} preguntas):</p>
      {disabled && (
        <p className="rounded-md border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Aún no hay vinos cargados en Academy. Pide a dirección que sincronice el catálogo.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {QUIZ_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            type="button"
            disabled={disabled}
            onClick={() => onPick(cat)}
            className={cn(
              "flex items-center gap-3 rounded-lg border bg-card p-4 text-left brand-shadow transition-colors",
              "hover:border-brand-carmesi hover:bg-muted disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            <span className="text-2xl">{cat.emoji}</span>
            <div>
              <p className="font-medium">{cat.label}</p>
              <p className="text-xs text-muted-foreground">
                {cat.field === "mixed" ? "De todo un poco" : `Adivina ${cat.label.toLowerCase()}`}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Done({
  score,
  correct,
  total,
  bestStreak,
  elapsed,
  categoryLabel,
  onRetry,
  onChange,
}: {
  score: number;
  correct: number;
  total: number;
  bestStreak: number;
  elapsed: number;
  categoryLabel: string;
  onRetry: () => void;
  onChange: () => void;
}) {
  const { label, tone } = scoreLabel(score);
  const mm = Math.floor(elapsed / 60);
  const ss = elapsed % 60;
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardContent className="space-y-5 p-8 text-center">
          <div
            className={cn(
              "mx-auto flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold",
              tone === "good" && "bg-emerald-100 text-emerald-700",
              tone === "ok" && "bg-amber-100 text-amber-700",
              tone === "bad" && "bg-red-100 text-red-700",
            )}
          >
            {score}%
          </div>
          <div>
            <p className="font-display text-2xl">{label}</p>
            <p className="text-sm text-muted-foreground">Quiz de {categoryLabel}</p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-sm">
            <Stat label="Aciertos" value={`${correct}/${total}`} icon={Check} />
            <Stat label="Mejor racha" value={String(bestStreak)} icon={Flame} />
            <Stat label="Tiempo" value={`${mm}:${String(ss).padStart(2, "0")}`} icon={WineIcon} />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={onRetry} className="flex-1">
              <RotateCcw className="mr-2 h-4 w-4" /> Repetir
            </Button>
            <Button onClick={onChange} variant="outline" className="flex-1">
              Otra categoría
            </Button>
          </div>
          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link href="/academy">
              <Trophy className="mr-2 h-4 w-4" /> Ver ranking
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-md bg-muted/50 p-3">
      <Icon className="mx-auto mb-1 h-4 w-4 text-brand-carmesi" />
      <p className="font-semibold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
