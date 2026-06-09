import * as XLSX from "xlsx";
import { normalizeClientNumber } from "./parseCartera";

// Parser del export CONTPAQi "Todos los Clientes". El archivo trae un título en
// la primera fila y luego un encabezado con las columnas:
//   Código Cliente · Razón Social · R.F.C. · Uso CFDI · Régimen fiscal
// Devolvemos una fila por cliente, con el # cliente normalizado (sin ceros a la
// izquierda) para casarlo contra accounts.client_number.

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.\s]+/g, " ")
    .trim();

export type ClienteFiscalRow = {
  /** # cliente normalizado (sin ceros a la izquierda). null si la fila no trae código. */
  client_number: string | null;
  /** Código tal cual aparece en el Excel (para mostrar). */
  codigo_raw: string;
  fiscal_name: string | null;
  rfc: string | null;
  uso_cfdi: string | null;
  regimen_fiscal: string | null;
};

export type ClientesFiscalParseResult = {
  rows: ClienteFiscalRow[];
  errors: { row: number; message: string }[];
};

const clean = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

// Localiza la fila de encabezado (la que contiene "código cliente").
function findHeader(matrix: unknown[][]): { headerIdx: number; cols: Record<string, number> } | null {
  for (let i = 0; i < Math.min(matrix.length, 20); i++) {
    const row = matrix[i] ?? [];
    const cells = row.map((c) => norm(c));
    const codigoIdx = cells.findIndex((c) => c.includes("codigo cliente") || c === "codigo" || c.includes("cod cliente"));
    if (codigoIdx === -1) continue;
    const find = (...needles: string[]) =>
      cells.findIndex((c) => needles.some((n) => c.includes(n)));
    const cols = {
      codigo: codigoIdx,
      razon: find("razon social", "razon"),
      rfc: find("rfc", "r f c"),
      uso: find("uso cfdi", "uso"),
      regimen: find("regimen fiscal", "regimen"),
    };
    return { headerIdx: i, cols };
  }
  return null;
}

export function parseClientesFiscal(buf: ArrayBuffer): ClientesFiscalParseResult {
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

  const header = findHeader(matrix);
  if (!header) {
    return {
      rows: [],
      errors: [{ row: 0, message: 'No encontré el encabezado "Código Cliente". ¿Es el export "Todos los Clientes" de CONTPAQi?' }],
    };
  }

  const { headerIdx, cols } = header;
  const rows: ClienteFiscalRow[] = [];
  const errors: { row: number; message: string }[] = [];
  const seen = new Set<string>();

  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const codigoRaw = String(row[cols.codigo] ?? "").trim();
    if (!codigoRaw) continue; // fila vacía / separador
    const client_number = normalizeClientNumber(codigoRaw);
    if (!client_number) continue;

    const out: ClienteFiscalRow = {
      client_number,
      codigo_raw: codigoRaw,
      fiscal_name: cols.razon >= 0 ? clean(row[cols.razon]) : null,
      rfc: cols.rfc >= 0 ? clean(row[cols.rfc])?.toUpperCase() ?? null : null,
      uso_cfdi: cols.uso >= 0 ? clean(row[cols.uso])?.toUpperCase() ?? null : null,
      regimen_fiscal: cols.regimen >= 0 ? clean(row[cols.regimen]) : null,
    };

    if (seen.has(client_number)) {
      errors.push({ row: i + 1, message: `Código ${codigoRaw} duplicado en el archivo (se usa la primera ocurrencia).` });
      continue;
    }
    seen.add(client_number);
    rows.push(out);
  }

  return { rows, errors };
}
