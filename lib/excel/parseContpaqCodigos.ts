import * as XLSX from "xlsx";
import type { ContpaqRow } from "@/lib/contpaq-map";

// Parser del export de productos de CONTPAQ para mapear códigos al catálogo.
// Detecta de forma flexible: codigo (CONTPAQ), clave (= sku del CRM, opcional)
// y nombre/descripción (opcional). Necesita al menos `codigo`.
// Tolera las filas de título del reporte de CONTPAQ (logo, fechas, "EN
// UNIDADES"…) que van antes del encabezado real.

function normKey(k: unknown) {
  return String(k ?? "")
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

// Match por palabra: igual, token exacto, o alias multipalabra delimitado por
// inicio/espacio/fin. NO usa subcadena suelta (evita que "id" empate dentro de
// "unidades" y elija una fila de título como encabezado).
function cellMatches(cell: string, alias: string): boolean {
  if (!cell) return false;
  if (cell === alias) return true;
  if (cell.split(" ").includes(alias)) return true;
  return (
    cell.startsWith(alias + " ") ||
    cell.endsWith(" " + alias) ||
    cell.includes(" " + alias + " ")
  );
}

function detectIndex(cells: string[], aliases: readonly string[]): number {
  for (const a of aliases) {
    const i = cells.findIndex((k) => cellMatches(k, a));
    if (i !== -1) return i;
  }
  return -1;
}

export type ContpaqParseResult = {
  rows: ContpaqRow[];
  errors: { row: number; message: string }[];
  /** Columnas detectadas, para mostrar al usuario. */
  detected: { codigo: string | null; clave: string | null; nombre: string | null };
};

const EMPTY_DETECTED = { codigo: null, clave: null, nombre: null };

export async function parseContpaqCodigosExcel(file: ArrayBuffer): Promise<ContpaqParseResult> {
  const wb = XLSX.read(file, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  });

  if (!matrix.length) {
    return { rows: [], errors: [{ row: 0, message: "El archivo está vacío." }], detected: EMPTY_DETECTED };
  }

  // Fila de encabezado: la primera que tenga una columna de código CONTPAQ.
  let headerIdx = -1;
  let iCodigo = -1;
  let iClave = -1;
  let iNombre = -1;
  let headerCells: unknown[] = [];
  for (let i = 0; i < matrix.length; i++) {
    const cells = matrix[i].map(normKey);
    const c = detectIndex(cells, ALIASES.codigo);
    if (c !== -1) {
      headerIdx = i;
      headerCells = matrix[i];
      iCodigo = c;
      iClave = detectIndex(cells, ALIASES.clave);
      iNombre = detectIndex(cells, ALIASES.nombre);
      break;
    }
  }

  const labelAt = (idx: number) => (idx === -1 ? null : String(headerCells[idx] ?? "").trim() || null);

  if (headerIdx === -1) {
    const firstRow = matrix[0].map((c) => String(c ?? "").trim()).filter(Boolean);
    return {
      rows: [],
      errors: [
        {
          row: 1,
          message: `No detecté la columna de código CONTPAQ. Primera fila leída: ${firstRow.join(" · ") || "(vacía)"}`,
        },
      ],
      detected: EMPTY_DETECTED,
    };
  }

  const rows: ContpaqRow[] = [];
  const errors: ContpaqParseResult["errors"] = [];
  const seen = new Set<string>();

  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i];
    const codigo = String(row[iCodigo] ?? "").trim().replace(/\.0$/, "");
    if (!codigo || codigo.includes(":")) continue; // vacío o fila de sección
    if (seen.has(codigo)) continue;
    seen.add(codigo);
    rows.push({
      codigo,
      clave: iClave !== -1 ? String(row[iClave] ?? "").trim() || null : null,
      nombre: iNombre !== -1 ? String(row[iNombre] ?? "").trim() || null : null,
    });
  }

  if (!rows.length) errors.push({ row: headerIdx + 1, message: "No se encontraron filas con código." });

  return {
    rows,
    errors,
    detected: { codigo: labelAt(iCodigo), clave: labelAt(iClave), nombre: labelAt(iNombre) },
  };
}
