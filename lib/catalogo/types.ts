// Tipos compartidos de la normalización del catálogo (lado app/TS).
// El motor de reglas vive en ./normalize.mjs (ESM puro, sin tipos fuertes);
// aquí declaramos las formas que consumen los endpoints y la UI.

export type Confidence = "alta" | "media" | "baja";
export type NormField = "category" | "country" | "varietal" | "vintage" | "volume_ml";
export type SuggestionSource = "rules" | "llm";

export const NORM_FIELD_LABEL: Record<NormField, string> = {
  category: "Categoría",
  country: "País",
  varietal: "Varietal",
  vintage: "Añada",
  volume_ml: "Formato",
};

export type FieldSuggestion = {
  field: NormField;
  current: string | number | null;
  suggested: string | number | null;
  confidence: Confidence;
  source: SuggestionSource;
  reason: string;
};

export type ProductAnalysis = {
  product_id: string;
  sku: string | null;
  name: string;
  supplier: string | null;
  category: string | null;
  suggestions: FieldSuggestion[];
  /** La categoría no se pudo decidir por reglas → candidata a IA. */
  categoryAmbiguous: boolean;
};

export type NormalizeReport = {
  total: number;
  analyzed: ProductAnalysis[];
  ambiguousCount: number;
  generatedAt: string;
};

/** Una aprobación lista para aplicar (la envía la UI al endpoint /aplicar). */
export type ApprovedChange = {
  product_id: string;
  field: NormField;
  value: string | number;
  source: SuggestionSource;
  confidence: Confidence;
};
