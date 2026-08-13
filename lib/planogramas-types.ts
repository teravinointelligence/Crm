// Tipos y helpers puros del módulo Planogramas (app Base44 "Teravino Map",
// publicada en teravino-planogramas.base44.app).
//
// Sin `server-only`: los componentes cliente (buscador, plano) importan de aquí
// para no arrastrar la API key. El cliente HTTP vive en lib/base44-planogramas.ts.
//
// El modelo de la app es: una BODEGA define una rejilla (racks × filas ×
// columnas) para botellas sueltas y, opcionalmente, filas de TARIMAS para cajas.
// Una POSICION es un vino en una celda del rack; una CAJA es un vino en una
// tarima. Un mismo hueco puede tener varios vinos (se listan apilados).

export type AccentColor = "coral" | "salvia" | "dorada" | "lavanda" | "menta";

/** Presentaciones que maneja la app de Base44 (enum del esquema). */
export const PRESENTACIONES = ["750ml", "375ml", "1500ml"] as const;
export type Presentacion = (typeof PRESENTACIONES)[number];

export type PlanoBodega = {
  id: string;
  nombre: string;
  numero_racks: number;
  filas: number;
  columnas: number;
  filas_tarimas?: number;
  tarimas_por_fila?: number;
  cajas_por_tarima?: number;
  descripcion?: string;
  color_acento?: AccentColor;
  created_date?: string;
  updated_date?: string;
};

/** Un vino colocado en una celda del rack (botellas sueltas). */
export type PlanoPosicion = {
  id: string;
  bodega_id: string;
  rack?: number;
  fila: number;
  columna: number;
  vino: string;
  cantidad?: number;
  anada?: string;
  presentacion?: Presentacion;
  varietal?: string;
  bodega_origen?: string;
  region?: string;
  pais?: string;
  notas?: string;
  created_date?: string;
  updated_date?: string;
};

/** Un vino estibado en una tarima (cajas). */
export type PlanoCaja = {
  id: string;
  bodega_id: string;
  fila: number;
  tarima: number;
  vino: string;
  numero_cajas?: number;
  tamano_caja?: number;
  botellas?: number;
  anada?: string;
  presentacion?: Presentacion;
  varietal?: string;
  bodega_origen?: string;
  region?: string;
  pais?: string;
  notas?: string;
  created_date?: string;
  updated_date?: string;
};

/**
 * Paleta de acento por bodega. Son los mismos hexadecimales de la app de Base44
 * para que el CRM y el planograma se vean como el mismo sistema.
 */
export const ACCENT: Record<AccentColor, { hex: string; label: string }> = {
  coral: { hex: "#E2613F", label: "Coral" },
  salvia: { hex: "#8FA68E", label: "Salvia" },
  dorada: { hex: "#E0A458", label: "Dorada" },
  lavanda: { hex: "#A492C4", label: "Lavanda" },
  menta: { hex: "#7FC8B8", label: "Menta" },
};

export function accentHex(color: string | null | undefined): string {
  return ACCENT[(color ?? "coral") as AccentColor]?.hex ?? ACCENT.coral.hex;
}

/** Rack al que pertenece una posición. El esquema lo hace opcional; default 1. */
export function rackOf(p: PlanoPosicion): number {
  return Number(p.rack) || 1;
}

/**
 * Botellas reales de una tarima. La app deja capturar el total a mano (por si
 * hay cajas incompletas); si viene en 0 o vacío, se estima cajas × tamaño.
 */
export function botellasDeCaja(c: PlanoCaja): number {
  const capturadas = Number(c.botellas) || 0;
  if (capturadas > 0) return capturadas;
  return (Number(c.numero_cajas) || 0) * (Number(c.tamano_caja) || 0);
}

/** Botellas totales de una bodega: las sueltas del rack más las de tarimas. */
export function totalBotellas(posiciones: PlanoPosicion[], cajas: PlanoCaja[]): number {
  const sueltas = posiciones.reduce((acc, p) => acc + (Number(p.cantidad) || 0), 0);
  return sueltas + cajas.reduce((acc, c) => acc + botellasDeCaja(c), 0);
}

/** Etiqueta legible de una ubicación, ej. "Rack 2 · F3 C4" o "Tarima F1-T2". */
export function ubicacionPosicion(p: PlanoPosicion): string {
  return `Rack ${rackOf(p)} · F${p.fila} C${p.columna}`;
}

export function ubicacionCaja(c: PlanoCaja): string {
  return `Tarimas · F${c.fila} T${c.tarima}`;
}

/** Agrupa posiciones por celda (`rack-fila-columna`) para pintar la rejilla. */
export function porCelda(posiciones: PlanoPosicion[]): Map<string, PlanoPosicion[]> {
  const map = new Map<string, PlanoPosicion[]>();
  for (const p of posiciones) {
    const key = `${rackOf(p)}-${p.fila}-${p.columna}`;
    const arr = map.get(key);
    if (arr) arr.push(p);
    else map.set(key, [p]);
  }
  return map;
}

/** Agrupa cajas por tarima (`fila-tarima`). */
export function porTarima(cajas: PlanoCaja[]): Map<string, PlanoCaja[]> {
  const map = new Map<string, PlanoCaja[]>();
  for (const c of cajas) {
    const key = `${c.fila}-${c.tarima}`;
    const arr = map.get(key);
    if (arr) arr.push(c);
    else map.set(key, [c]);
  }
  return map;
}

/**
 * Normaliza texto para buscar: sin acentos, minúsculas. Los vinos se capturan
 * a mano en la app (mayúsculas, con y sin acentos), así que sin esto el
 * buscador falla con "añada"/"anada" o "Sudáfrica"/"Sudafrica".
 */
export function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Fila plana para el buscador global "¿dónde está este vino?". */
export type Hallazgo = {
  id: string;
  tipo: "rack" | "tarima";
  bodega_id: string;
  bodega_nombre: string;
  ubicacion: string;
  vino: string;
  botellas: number;
  detalle: string;
  anada?: string;
  presentacion?: string;
  varietal?: string;
  region?: string;
  pais?: string;
};

/**
 * Aplana posiciones y cajas de todas las bodegas en una sola lista buscable.
 * `bodegas` se usa solo para resolver el nombre de cada bodega_id.
 */
export function construirIndice(
  bodegas: PlanoBodega[],
  posiciones: PlanoPosicion[],
  cajas: PlanoCaja[],
): Hallazgo[] {
  const nombre = new Map(bodegas.map((b) => [b.id, b.nombre]));
  const desdePosiciones: Hallazgo[] = posiciones.map((p) => ({
    id: `pos-${p.id}`,
    tipo: "rack" as const,
    bodega_id: p.bodega_id,
    bodega_nombre: nombre.get(p.bodega_id) ?? "Bodega desconocida",
    ubicacion: ubicacionPosicion(p),
    vino: p.vino,
    botellas: Number(p.cantidad) || 0,
    detalle: `${Number(p.cantidad) || 0} bot.`,
    anada: p.anada,
    presentacion: p.presentacion,
    varietal: p.varietal,
    region: p.region,
    pais: p.pais,
  }));
  const desdeCajas: Hallazgo[] = cajas.map((c) => ({
    id: `caja-${c.id}`,
    tipo: "tarima" as const,
    bodega_id: c.bodega_id,
    bodega_nombre: nombre.get(c.bodega_id) ?? "Bodega desconocida",
    ubicacion: ubicacionCaja(c),
    vino: c.vino,
    botellas: botellasDeCaja(c),
    detalle: `${Number(c.numero_cajas) || 0} cajas · ${botellasDeCaja(c)} bot.`,
    anada: c.anada,
    presentacion: c.presentacion,
    varietal: c.varietal,
    region: c.region,
    pais: c.pais,
  }));
  return [...desdePosiciones, ...desdeCajas];
}

/** Filtra el índice por texto libre (vino, varietal, región, país, añada, bodega). */
export function buscar(indice: Hallazgo[], query: string): Hallazgo[] {
  const q = norm(query);
  if (!q) return [];
  const terminos = q.split(/\s+/).filter(Boolean);
  return indice.filter((h) => {
    const heno = norm(
      [h.vino, h.varietal, h.region, h.pais, h.anada, h.bodega_nombre, h.presentacion]
        .filter(Boolean)
        .join(" "),
    );
    return terminos.every((t) => heno.includes(t));
  });
}
