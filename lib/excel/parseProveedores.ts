import * as XLSX from "xlsx";
import type { ProveedorRow } from "@/lib/proveedor-map";

// Parser del archivo "proveedor por producto". Detecta de forma flexible una
// columna de PROVEEDOR (obligatoria) y al menos un identificador del producto:
// sku/clave, código CONTPAQ o nombre/descripción. Tolera filas de título antes
// del encabezado real.

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
  proveedor: ["proveedor", "supplier", "bodega", "casa", "casa productora", "importador", "marca", "vinicola", "viñedo"],
  sku: ["sku", "clave", "clave alterna", "clave articulo"],
  codigo: ["codigo", "codigo contpaq", "cve", "codigo producto"],
  nombre: ["nombre", "producto", "descripcion", "description", "nombre producto", "articulo"],
} as const;

function cellMatches(cell: string, alias: string): boolean {
  if (!cell) return false;
  if (cell === alias) return true;
  if (cell.split(" ").includes(alias)) return true;
  return cell.startsWith(alias + " ") || cell.endsWith(" " + alias) || cell.includes(" " + alias + " ");
}

function detectIndex(cells: string[], aliases: readonly string[]): number {
  for (const a of aliases) {
    const i = cells.findIndex((k) => cellMatches(k, a));
    if (i !== -1) return i;
  }
  return -1;
}

export type ProveedorParseResult = {
  rows: ProveedorRow[];
  errors: { row: number; message: string }[];
  detected: { proveedor: string | null; sku: string | null; codigo: string | null; nombre: string | null };
};

const EMPTY = { proveedor: null, sku: null, codigo: null, nombre: null };

export async function parseProveedoresExcel(file: ArrayBuffer): Promise<ProveedorParseResult> {
  const wb = XLSX.read(file, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  });

  if (!matrix.length) {
    return { rows: [], errors: [{ row: 0, message: "El archivo está vacío." }], detected: EMPTY };
  }

  // Encabezado: primera fila con columna de proveedor y algún identificador.
  let headerIdx = -1;
  let iProv = -1;
  let iSku = -1;
  let iCodigo = -1;
  let iNombre = -1;
  let headerCells: unknown[] = [];
  for (let i = 0; i < matrix.length; i++) {
    const cells = matrix[i].map(normKey);
    const prov = detectIndex(cells, ALIASES.proveedor);
    if (prov === -1) continue;
    const sku = detectIndex(cells, ALIASES.sku);
    const cod = detectIndex(cells, ALIASES.codigo);
    const nom = detectIndex(cells, ALIASES.nombre);
    if (sku === -1 && cod === -1 && nom === -1) continue; // necesita un identificador
    headerIdx = i;
    headerCells = matrix[i];
    iProv = prov;
    iSku = sku;
    iCodigo = cod;
    iNombre = nom;
    break;
  }

  const labelAt = (idx: number) => (idx === -1 ? null : String(headerCells[idx] ?? "").trim() || null);

  if (headerIdx === -1) {
    const firstRow = matrix[0].map((c) => String(c ?? "").trim()).filter(Boolean);
    return {
      rows: [],
      errors: [
        {
          row: 1,
          message:
            "No detecté las columnas. Necesito una columna 'Proveedor' y otra con el producto (SKU, código o nombre). " +
            `Primera fila leída: ${firstRow.join(" · ") || "(vacía)"}`,
        },
      ],
      detected: EMPTY,
    };
  }

  const clean = (v: unknown) => String(v ?? "").trim().replace(/\.0$/, "") || null;
  const rows: ProveedorRow[] = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i];
    const proveedor = String(row[iProv] ?? "").trim();
    const sku = iSku !== -1 ? clean(row[iSku]) : null;
    const codigo = iCodigo !== -1 ? clean(row[iCodigo]) : null;
    const nombre = iNombre !== -1 ? (String(row[iNombre] ?? "").trim() || null) : null;
    if (!proveedor) continue; // sin proveedor no aporta
    if (!sku && !codigo && !nombre) continue; // sin identificador no se puede emparejar
    rows.push({ proveedor, sku, codigo, nombre });
  }

  const errors: ProveedorParseResult["errors"] = [];
  if (!rows.length) errors.push({ row: headerIdx + 1, message: "No se encontraron filas con proveedor + producto." });

  return {
    rows,
    errors,
    detected: { proveedor: labelAt(iProv), sku: labelAt(iSku), codigo: labelAt(iCodigo), nombre: labelAt(iNombre) },
  };
}
