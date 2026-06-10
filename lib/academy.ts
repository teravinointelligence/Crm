// Lógica compartida del módulo Academy (estudio + quizzes).
// Sin "server-only": lo usan tanto páginas server como componentes cliente.

import type { AcademyWine } from "@/types/database";

export const WINE_TYPES = [
  "Tinto",
  "Blanco",
  "Rosado",
  "Espumoso",
  "Dulce",
  "Fortificado",
] as const;
export type WineType = (typeof WINE_TYPES)[number];

// El catálogo origen (Base44) guarda precios y presentación dentro de
// `tasting_notes`, p. ej.:
//   "Precio s/IVA: $1,121 MXN · Precio c/IVA: $1,300 MXN · Presentación: 750ML"
//   "AGOTADO en Junio 2026 · Presentación: 750ML"
export type WinePricing = {
  sIva: number | null;
  cIva: number | null;
  presentation: string | null;
  agotado: boolean;
};

export function parsePricing(notes: string | null | undefined): WinePricing {
  const text = notes ?? "";
  const pres = text.match(/Presentaci[oó]n:\s*([^·]+)/i);
  return {
    sIva: matchMoney(text, /s\/IVA:\s*\$?([\d,]+)/i),
    cIva: matchMoney(text, /c\/IVA:\s*\$?([\d,]+)/i),
    presentation: pres ? pres[1].trim() : null,
    agotado: /agotado/i.test(text),
  };
}

function matchMoney(text: string, re: RegExp): number | null {
  const m = text.match(re);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------
export type QuizCategory = {
  key: string;
  label: string;
  field: "country" | "type" | "producer" | "region" | "grape" | "mixed";
  prompt: string;
  emoji: string;
};

export const QUIZ_CATEGORIES: QuizCategory[] = [
  { key: "pais", label: "País", field: "country", prompt: "¿De qué país es este vino?", emoji: "🌍" },
  { key: "tipo", label: "Tipo", field: "type", prompt: "¿Qué tipo de vino es?", emoji: "🍷" },
  { key: "bodega", label: "Bodega", field: "producer", prompt: "¿Qué bodega lo produce?", emoji: "🏰" },
  { key: "region", label: "Región", field: "region", prompt: "¿De qué región proviene?", emoji: "📍" },
  { key: "uva", label: "Uva", field: "grape", prompt: "¿Cuál es su uva principal?", emoji: "🍇" },
  { key: "mixto", label: "Mixto", field: "mixed", prompt: "", emoji: "🎲" },
];

export type QuizQuestion = {
  wineName: string;
  subtitle: string; // contexto que NO revela la respuesta (añada · tipo/país)
  prompt: string;
  options: string[];
  answer: string;
};

const FIELD_PROMPT: Record<string, string> = {
  country: "¿De qué país es este vino?",
  type: "¿Qué tipo de vino es?",
  producer: "¿Qué bodega lo produce?",
  region: "¿De qué región proviene?",
  grape: "¿Cuál es su uva principal?",
};

function valueForField(w: AcademyWine, field: string): string | null {
  switch (field) {
    case "country":
      return w.country;
    case "type":
      return w.type;
    case "producer":
      return w.producer;
    case "region":
      return w.region;
    case "grape":
      return w.grape_varieties && w.grape_varieties.length > 0 ? w.grape_varieties[0] : null;
    default:
      return null;
  }
}

// Subtítulo de contexto sin filtrar la respuesta: muestra añada y un dato
// secundario (el tipo, salvo que la pregunta sea sobre el tipo).
function subtitleFor(w: AcademyWine, field: string): string {
  const parts: string[] = [];
  if (w.vintage) parts.push(w.vintage);
  if (field !== "type" && w.type) parts.push(w.type);
  if (field === "type" && w.country) parts.push(w.country);
  return parts.join(" · ");
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDistinct(pool: string[], exclude: string, n: number): string[] {
  const candidates = Array.from(new Set(pool)).filter((v) => v && v !== exclude);
  return shuffle(candidates).slice(0, n);
}

/**
 * Genera `count` preguntas de opción múltiple a partir del catálogo.
 * Para "mixto" alterna el campo pregunta a pregunta. Se descartan vinos sin
 * el dato preguntado y se evita repetir el mismo vino mientras haya material.
 */
export function buildQuiz(
  wines: AcademyWine[],
  categoryField: QuizCategory["field"],
  count = 10,
): QuizQuestion[] {
  const fields: Exclude<QuizCategory["field"], "mixed">[] =
    categoryField === "mixed"
      ? ["country", "type", "producer", "region", "grape"]
      : [categoryField];

  // Pools de valores distintos por campo (para los distractores).
  const pools: Record<string, string[]> = {};
  for (const f of fields) {
    pools[f] = wines.map((w) => valueForField(w, f)).filter((v): v is string => !!v);
  }

  const questions: QuizQuestion[] = [];
  const usedWineIds = new Set<string>();
  let guard = 0;

  while (questions.length < count && guard < count * 40) {
    guard++;
    const field = fields[Math.floor(Math.random() * fields.length)];
    // Distractores insuficientes para este campo → sáltalo.
    if (new Set(pools[field]).size < 2) continue;

    const eligible = wines.filter((w) => {
      const v = valueForField(w, field);
      return !!v && !usedWineIds.has(w.id);
    });
    const fromPool = eligible.length > 0 ? eligible : wines.filter((w) => !!valueForField(w, field));
    if (fromPool.length === 0) continue;

    const wine = fromPool[Math.floor(Math.random() * fromPool.length)];
    const answer = valueForField(wine, field)!;
    const distractors = pickDistinct(pools[field], answer, 3);
    if (distractors.length < 3) continue; // necesitamos 4 opciones reales

    usedWineIds.add(wine.id);
    questions.push({
      wineName: wine.name,
      subtitle: subtitleFor(wine, field),
      prompt: FIELD_PROMPT[field],
      options: shuffle([answer, ...distractors]),
      answer,
    });
  }

  return questions;
}

export function scoreLabel(score: number): { label: string; tone: "good" | "ok" | "bad" } {
  if (score >= 80) return { label: "¡Excelente!", tone: "good" };
  if (score >= 60) return { label: "Bien, sigue practicando", tone: "ok" };
  return { label: "A repasar el catálogo", tone: "bad" };
}
