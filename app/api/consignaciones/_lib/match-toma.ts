// Emparejamiento de tomas de inventario huérfanas (sin consignacion_id) con
// consignaciones candidatas. Solo SUGIERE — la vinculación siempre la confirma
// el usuario (hay clientes duplicados, ej. LA QUERENCIA aparece 2 veces).
//
// Función pura sin imports: la usa /consignaciones/tomas (server component)
// y se prueba directo con `node --test`.

export type TomaMatchInput = {
  cliente_id?: string;
  cliente_nombre?: string;
  vendedor_id?: string;
  fecha_toma?: string;
};

export type ConsignacionMatchInput = {
  id: string;
  cliente_id?: string;
  cliente_nombre?: string;
  vendedor_id?: string;
  fecha?: string;
  estado?: string;
};

export type Sugerencia<T extends ConsignacionMatchInput> = {
  consignacion: T;
  score: number;
  motivos: string[];
};

const STOPWORDS = new Set([
  "la", "el", "los", "las", "de", "del", "y", "e",
  "sa", "cv", "s", "a", "rl", "sc", "spr", "sapi",
]);

/** Normaliza un nombre de cliente: minúsculas, sin acentos ni puntuación, sin stopwords. */
export function normalizarNombre(nombre: string | undefined): string[] {
  if (!nombre) return [];
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function diasEntre(a: string | undefined, b: string | undefined): number | null {
  if (!a || !b) return null;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.abs(ta - tb) / 86_400_000;
}

/**
 * Rankea consignaciones candidatas para una toma huérfana.
 * Criterios: mismo cliente (id o nombre normalizado) es requisito de entrada;
 * mismo vendedor, cercanía de fecha y estado activo suman al score.
 */
export function sugerirConsignaciones<T extends ConsignacionMatchInput>(
  toma: TomaMatchInput,
  consignaciones: T[],
  max = 6,
): Sugerencia<T>[] {
  const tomaTokens = normalizarNombre(toma.cliente_nombre);
  const sugerencias: Sugerencia<T>[] = [];

  for (const c of consignaciones) {
    let score = 0;
    const motivos: string[] = [];

    // Relación de cliente — sin esto, no es candidata.
    if (toma.cliente_id && c.cliente_id && toma.cliente_id === c.cliente_id) {
      score += 100;
      motivos.push("Mismo cliente");
    } else {
      const cTokens = normalizarNombre(c.cliente_nombre);
      if (tomaTokens.length === 0 || cTokens.length === 0) continue;
      if (tomaTokens.join(" ") === cTokens.join(" ")) {
        score += 70;
        motivos.push("Mismo nombre de cliente");
      } else {
        const setC = new Set(cTokens);
        const compartidos = tomaTokens.filter((t) => setC.has(t));
        const overlap = compartidos.length / Math.min(tomaTokens.length, cTokens.length);
        if (overlap >= 0.5 && compartidos.some((t) => t.length >= 4)) {
          score += 40;
          motivos.push("Nombre de cliente similar");
        } else {
          continue;
        }
      }
    }

    if (toma.vendedor_id && c.vendedor_id && toma.vendedor_id === c.vendedor_id) {
      score += 20;
      motivos.push("Mismo vendedor");
    }

    const dias = diasEntre(toma.fecha_toma, c.fecha);
    if (dias != null) {
      const bonus = Math.max(0, Math.round(15 - dias / 4));
      score += bonus;
      motivos.push(`Fechas a ${Math.round(dias)} día${Math.round(dias) === 1 ? "" : "s"}`);
    }

    if (c.estado === "pendiente" || c.estado === "parcial") {
      score += 10;
      motivos.push("Consignación activa");
    }

    sugerencias.push({ consignacion: c, score, motivos });
  }

  sugerencias.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const da = diasEntre(toma.fecha_toma, a.consignacion.fecha) ?? Infinity;
    const db = diasEntre(toma.fecha_toma, b.consignacion.fecha) ?? Infinity;
    return da - db;
  });

  return sugerencias.slice(0, max);
}
