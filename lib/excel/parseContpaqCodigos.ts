import * as XLSX from "xlsx";
import type { ContpaqRow } from "@/lib/contpaq-map";

// Parser del export de productos de CONTPAQ para mapear códigos al catálogo.
// Detecta de forma flexible: codigo (CONTPAQ), clave (= sku del CRM, opcional)
// y nombre/descripción (opcional). Necesita al menos `codigo`.

function normKey(k: string) {
  return k
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ALIASES = {
  codigo: ["codigo", "codigo producto", "cod", "cve", "clave producto", "codigo contpaq", "id"],
  clave: ["clave", "sku", "clave alterna", "clave articulo", "clave sat"],
  nombre: ["nombre", "producto", "descripcion", "description", "nombre producto", "articulo"],
} as const;

function detect(keys: string[], aliases: readonly string[]): string | null {
  for (const a of aliases) {
    const exact = keys.find((k) => k === a);
    if (exact) return exact;
  }
  for (const a of aliases) {
    const partial = keys.find((k) => k.startsWith(a + " ") || k.endsWith(" " + a) || k.includes(a));
    if (partial) return partial;
  }
  return null;
}

export type ContpaqParseResult = {
  rows: ContpaqRow[];
  errors: { row: number; message: string }[];
  /** Columnas detectadas, para mostrar al usuario. */
  detected: { codigo: string | null; clave: string | null; nombre: string | null };
};

export async function parseContpaqCodigosExcel(file: ArrayBuffer): Promise<ContpaqParseResult> {
  const wb = XLSX.read(file, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });

  if (!json.length) {
    return { rows: [], errors: [{ row: 0, message: "El archivo está vacío." }], detected: { codigo: null, clave: null, nombre: null } };
  }

  const map = new Map<string, string>();
  for (const k of Object.keys(json[0])) {
    if (k) map.set(normKey(k), k);
  }
  const keys = [...map.keys()];
  const colCodigo = detect(keys, ALIASES.codigo);
  const colClave = detect(keys, ALIASES.clave);
  const colNombre = detect(keys, ALIASES.nombre);

  if (!colCodigo) {
    return {
      rows: [],
      errors: [
        {
          row: 1,
          message: `No detecté la columna de código CONTPAQ. Columnas encontradas: ${[...map.values()].join(" · ")}`,
        },
      ],
      detected: { codigo: null, clave: colClave ? map.get(colClave)! : null, nombre: colNombre ? map.get(colNombre)! : null },
    };
  }

  const rows: ContpaqRow[] = [];
  const errors: ContpaqParseResult["errors"] = [];
  const seen = new Set<string>();

  json.forEach((raw, idx) => {
    const codigo = String(raw[map.get(colCodigo)!] ?? "").trim().replace(/\.0$/, "");
    if (!codigo) return;
    if (seen.has(codigo)) return;
    seen.add(codigo);
    rows.push({
      codigo,
      clave: colClave ? String(raw[map.get(colClave)!] ?? "").trim() || null : null,
      nombre: colNombre ? String(raw[map.get(colNombre)!] ?? "").trim() || null : null,
    });
  });

  if (!rows.length) errors.push({ row: 1, message: "No se encontraron filas con código." });

  return {
    rows,
    errors,
    detected: {
      codigo: map.get(colCodigo)!,
      clave: colClave ? map.get(colClave)! : null,
      nombre: colNombre ? map.get(colNombre)! : null,
    },
  };
}
