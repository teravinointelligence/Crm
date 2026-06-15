// Tipos del asistente de consultas en lenguaje natural.
// El LLM solo elige qué tool llamar y con qué parámetros; el servidor ejecuta
// la función predefinida con el cliente de la sesión (RLS) y devuelve un
// ToolResult estructurado. La UI renderiza la TABLA desde aquí, no del texto del
// LLM → las cifras nunca las inventa el modelo.

import type { createClient } from "@/lib/supabase/server";
import type { SalesRep } from "@/types/database";

export type ColumnKind = "money" | "number" | "date" | "text";

export type ToolColumn = { key: string; label: string; kind?: ColumnKind };

export type ToolRow = Record<string, string | number | null>;

export type ToolResult = {
  tool: string;
  title: string;
  columns: ToolColumn[];
  rows: ToolRow[];
  /** Línea de resumen opcional (p.ej. "Vencido total: $1.9M"). */
  total?: string;
  /** Enlace a la sección del CRM relacionada. */
  link?: { href: string; label: string };
  /** Nota (p.ej. acceso restringido o sin resultados). */
  note?: string;
};

export type ToolContext = {
  supabase: ReturnType<typeof createClient>;
  rep: SalesRep;
  isAdmin: boolean;
  canSeeFinance: boolean;
};

export type ToolDef = {
  name: string;
  /** Requiere ver el universo completo (ventas/velocidad) → admin/contador. */
  adminOnly?: boolean;
  description: string;
  input_schema: Record<string, unknown>;
  run: (ctx: ToolContext, params: Record<string, unknown>) => Promise<ToolResult>;
};
