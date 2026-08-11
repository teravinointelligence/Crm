// Exportación a CSV para los reportes del CRM.
//
// FOOTGUN: el delimitador es ";" (no ","). Excel en español (es-MX) usa el
// punto y coma como separador de lista; con "," abre todo el renglón en una
// sola columna. Google Sheets detecta ambos. Además se antepone el BOM UTF-8
// para que Excel no destroce los acentos.

export type CsvValue = string | number | null | undefined;

const DELIMITER = ";";

function cell(value: CsvValue): string {
  if (value == null) return "";
  const s = String(value);
  return /["\n\r;,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Matriz de celdas → texto CSV (la primera fila suele ser el encabezado). */
export function toCsv(rows: CsvValue[][]): string {
  return rows.map((r) => r.map(cell).join(DELIMITER)).join("\r\n");
}

/** Descarga la matriz como archivo .csv desde el navegador. */
export function downloadCsv(filename: string, rows: CsvValue[][]): void {
  const blob = new Blob(["\uFEFF" + toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
