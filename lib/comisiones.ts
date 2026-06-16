// Cálculo de comisiones ESTIMADAS (preliminar, motivacional) — lógica pura y
// testeable. NO es el cierre oficial: no detecta re-facturaciones ni
// reasignaciones por Observaciones (eso lo hace el proceso manual del mes).
//
// Fórmula (siempre desde el TOTAL con impuestos de la línea):
//   base = total / 1.265 / 1.16        (1.265 = IEPS, 1.16 = IVA)
//   comisión_línea = base * tasa_del_vendedor (según vino/cerveza)
// NUNCA partir de neto_desc: ya viene sin IVA y volver a dividir baja la base
// dos veces (verificado contra datos reales: inflaría/desinflaría ~25%).

export type ProfileKey = "emmanuel" | "citlali" | "yamile" | "andra" | "felix" | "sabrina";

type Profile = {
  vino: number; // tasa vino
  cerveza: number; // tasa cerveza
  allWine?: boolean; // Emmanuel: todo se clasifica como vino
  sabrinaAll?: boolean; // Sabrina: comisiona sobre TODOS los clientes, sin exclusiones
};

export const PROFILES: Record<ProfileKey, Profile> = {
  emmanuel: { vino: 0.10, cerveza: 0.0, allWine: true },
  citlali: { vino: 0.10, cerveza: 0.03 },
  yamile: { vino: 0.03, cerveza: 0.03 },
  andra: { vino: 0.03, cerveza: 0.03 },
  felix: { vino: 0.03, cerveza: 0.03 },
  sabrina: { vino: 0.04, cerveza: 0.04, sabrinaAll: true },
};

// Exclusiones permanentes (cuentas personales): no cuentan para la comisión
// PROPIA del vendedor, pero sí para la de Sabrina. Por # de cliente CONTPAQ.
export const EXCLUSIONES: Partial<Record<ProfileKey, string[]>> = {
  citlali: ["347", "353"],
  andra: ["371"],
};

// Condicionales por descuento: incluir la línea solo si descuento == 0
// (descuento > 0 = consumo personal del vendedor). Por # de cliente CONTPAQ.
export const CONDICIONALES: Partial<Record<ProfileKey, string[]>> = {
  felix: ["94"],
  yamile: ["406"],
};

// Excepciones: aunque el código parezca cerveza, es VINO.
const WINE_EXCEPTION_CODES = new Set(["553LEACER", "262ECRUCER", "LEXCEROSE", "ALSACERIES"]);
const BEER_CODE = /CER|BARRIL|CERVEZ|BARRHARRY/;

/** Deriva la llave de perfil desde el nombre del vendedor (1er nombre). */
export function profileKeyFromName(fullName: string | null | undefined): ProfileKey | null {
  const first = String(fullName ?? "")
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return (first in PROFILES ? (first as ProfileKey) : null);
}

/** Clasifica una línea como vino o cerveza. allWine fuerza vino (Emmanuel). */
export function clasificaLinea(
  codigo: string | null | undefined,
  nombre: string | null | undefined,
  allWine = false,
): "vino" | "cerveza" {
  if (allWine) return "vino";
  const cod = String(codigo ?? "").toUpperCase();
  const nom = String(nombre ?? "").toUpperCase();
  if (WINE_EXCEPTION_CODES.has(cod) || nom.includes("SIN ALCOHOL")) return "vino";
  if (BEER_CODE.test(cod) || nom.startsWith("CERVEZA") || nom.includes("BARRIL")) return "cerveza";
  return "vino";
}

/** base sin impuestos a partir del total con IEPS+IVA. */
export function baseSinImpuestos(total: number): number {
  return total / 1.265 / 1.16;
}

export type Linea = {
  codigo: string | null;
  nombre: string | null;
  total: number; // con impuestos
  descuento: number;
  clientNumber: string | null;
};

export type ComisionResult = {
  ventaVino: number;
  ventaCerveza: number;
  baseVino: number;
  baseCerveza: number;
  comVino: number;
  comCerveza: number;
  comTotal: number;
  ventaTotal: number;
  lineasContadas: number;
  lineasExcluidas: number;
};

const ZERO: ComisionResult = {
  ventaVino: 0, ventaCerveza: 0, baseVino: 0, baseCerveza: 0,
  comVino: 0, comCerveza: 0, comTotal: 0, ventaTotal: 0,
  lineasContadas: 0, lineasExcluidas: 0,
};

/** Comisión de un conjunto de líneas para un vendedor (por su perfil). */
export function comisionDeLineas(lineas: Linea[], profileKey: ProfileKey): ComisionResult {
  const p = PROFILES[profileKey];
  const excl = new Set(EXCLUSIONES[profileKey] ?? []);
  const cond = new Set(CONDICIONALES[profileKey] ?? []);
  const r: ComisionResult = { ...ZERO };

  for (const l of lineas) {
    const cn = String(l.clientNumber ?? "").trim();
    // Sabrina comisiona sobre todo: sin exclusiones ni condicionales.
    if (!p.sabrinaAll) {
      if (excl.has(cn)) { r.lineasExcluidas += 1; continue; }
      if (cond.has(cn) && Number(l.descuento ?? 0) > 0) { r.lineasExcluidas += 1; continue; }
    }
    const cat = clasificaLinea(l.codigo, l.nombre, !!p.allWine);
    const base = baseSinImpuestos(Number(l.total ?? 0));
    const tasa = cat === "vino" ? p.vino : p.cerveza;
    if (cat === "vino") {
      r.ventaVino += Number(l.total ?? 0);
      r.baseVino += base;
      r.comVino += base * tasa;
    } else {
      r.ventaCerveza += Number(l.total ?? 0);
      r.baseCerveza += base;
      r.comCerveza += base * tasa;
    }
    r.lineasContadas += 1;
  }
  r.ventaTotal = r.ventaVino + r.ventaCerveza;
  r.comTotal = r.comVino + r.comCerveza;
  return r;
}
