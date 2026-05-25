// Paleta de colores para el calendario y el dashboard. Se usan estilos inline
// (hex) porque Tailwind no puede generar clases dinámicas por vendedor.

export type Swatch = { solid: string; bg: string; fg: string };

// Colores distintivos por vendedor. El primero es el carmesí de marca.
export const REP_PALETTE: Swatch[] = [
  { solid: "#A91E3A", bg: "#F7E4E8", fg: "#7A1429" }, // carmesí
  { solid: "#0D9488", bg: "#CCFBF1", fg: "#115E59" }, // teal
  { solid: "#D97706", bg: "#FEF3C7", fg: "#92400E" }, // ámbar
  { solid: "#4F46E5", bg: "#E0E7FF", fg: "#3730A3" }, // índigo
  { solid: "#DB2777", bg: "#FCE7F3", fg: "#9D174D" }, // rosa
  { solid: "#059669", bg: "#D1FAE5", fg: "#065F46" }, // esmeralda
  { solid: "#0284C7", bg: "#E0F2FE", fg: "#075985" }, // azul
  { solid: "#7C3AED", bg: "#EDE9FE", fg: "#5B21B6" }, // violeta
];

// Asigna un color estable a cada vendedor según el orden recibido.
export function buildRepColors(repIds: string[]): Record<string, Swatch> {
  const map: Record<string, Swatch> = {};
  repIds.forEach((id, i) => {
    map[id] = REP_PALETTE[i % REP_PALETTE.length];
  });
  return map;
}

export const STATUS_SWATCH: Record<string, Swatch> = {
  agendada: { solid: "#4F46E5", bg: "#E0E7FF", fg: "#3730A3" }, // índigo
  realizada: { solid: "#A91E3A", bg: "#F7E4E8", fg: "#7A1429" }, // carmesí
  cancelada: { solid: "#9CA3AF", bg: "#F3F4F6", fg: "#4B5563" }, // gris
};

export const TASK_SWATCH: Swatch = {
  solid: "#D97706",
  bg: "#FEF3C7",
  fg: "#92400E",
}; // ámbar (siguiente paso pendiente)

export const TASK_DONE_SWATCH: Swatch = {
  solid: "#059669",
  bg: "#D1FAE5",
  fg: "#065F46",
}; // esmeralda (paso hecho)

// Nivel de urgencia para "visitar pronto" según días sin actividad.
export type Urgency = {
  level: "nunca" | "alta" | "media";
  label: string;
  bg: string;
  fg: string;
};

export function staleUrgency(days: number | null): Urgency {
  if (days == null)
    return { level: "nunca", label: "Sin contacto", bg: "#F3F4F6", fg: "#374151" };
  if (days >= 60)
    return { level: "alta", label: `${days} días`, bg: "#FEE2E2", fg: "#991B1B" };
  return { level: "media", label: `${days} días`, bg: "#FEF3C7", fg: "#92400E" };
}
