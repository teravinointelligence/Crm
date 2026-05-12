import * as XLSX from "xlsx";

export type ParsedPOLine = {
  sku: string | null;
  product_name: string;
  qty: number;
  unit_cost: number;
  destination_region: string | null;
};

export type POParseResult = {
  supplier: string | null;
  eta: string | null; // yyyy-mm-dd
  lines: ParsedPOLine[];
  errors: { row: number; message: string }[];
  warnings: string[];
};

function normalize(s: unknown) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  const n = Number(
    String(v ?? "")
      .replace(/[^\d.,-]/g, "")
      .replace(/\.(?=\d{3}\b)/g, "")
      .replace(",", "."),
  );
  return Number.isFinite(n) ? n : NaN;
}

const PRODUCT_TOKENS = ["producto", "descripcion", "vino", "articulo", "concepto", "nombre", "item"];
const QTY_TOKENS = ["cantidad", "cant", "cajas", "piezas", "pzas", "pza", "botellas", "unidades", "uds", "qty"];
const COST_TOKENS = ["costo unitario", "costo unit", "costo", "precio unitario", "precio unit", "precio", "p u", "p.u", "unitario", "importe unitario"];
const TOTAL_TOKENS = ["importe", "total linea", "total", "subtotal", "monto"];
const SKU_TOKENS = ["sku", "clave", "codigo", "cod", "cve"];
const DEST_TOKENS = ["destino", "region", "plaza", "sucursal", "ciudad", "almacen", "bodega destino"];

function findCol(header: string[], tokens: string[]): number {
  for (const t of tokens) {
    const exact = header.findIndex((h) => h === t);
    if (exact >= 0) return exact;
  }
  for (const t of tokens) {
    const partial = header.findIndex((h) => h.includes(t));
    if (partial >= 0) return partial;
  }
  return -1;
}

function excelDateToISO(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // Excel serial date
    const d = XLSX.SSF?.parse_date_code?.(v);
    if (d && d.y) {
      return `${String(d.y).padStart(4, "0")}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
  }
  const s = String(v).trim();
  // dd/mm/yyyy or dd-mm-yyyy
  const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s);
  if (m) {
    const [, dd, mm, yy] = m;
    const year = yy.length === 2 ? `20${yy}` : yy;
    return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export async function parsePurchaseOrderExcel(buf: ArrayBuffer): Promise<POParseResult> {
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: false,
  });

  const errors: POParseResult["errors"] = [];
  const warnings: string[] = [];

  if (!rows.length) {
    return { supplier: null, eta: null, lines: [], errors: [{ row: 0, message: "El archivo está vacío." }], warnings };
  }

  // --- Detectar fila de encabezados ---
  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const cells = (rows[i] as unknown[]).map(normalize);
    const hasProduct = PRODUCT_TOKENS.some((t) => cells.some((c) => c.includes(t)));
    const hasQty = QTY_TOKENS.some((t) => cells.some((c) => c === t || c.includes(t)));
    if (hasProduct && hasQty) {
      headerRow = i;
      break;
    }
  }
  if (headerRow < 0) {
    // fallback: a row with "producto" + a "precio/costo" column
    for (let i = 0; i < Math.min(rows.length, 25); i++) {
      const cells = (rows[i] as unknown[]).map(normalize);
      const hasProduct = PRODUCT_TOKENS.some((t) => cells.some((c) => c.includes(t)));
      const hasCost = COST_TOKENS.some((t) => cells.some((c) => c.includes(t)));
      if (hasProduct && hasCost) {
        headerRow = i;
        break;
      }
    }
  }
  if (headerRow < 0) {
    return {
      supplier: null,
      eta: null,
      lines: [],
      errors: [
        {
          row: 0,
          message:
            "No encontré la tabla de partidas. Asegúrate de que el Excel tenga una fila de encabezados con al menos «Producto/Descripción» y «Cantidad».",
        },
      ],
      warnings,
    };
  }

  // --- Buscar proveedor / ETA en el preámbulo ---
  let supplier: string | null = null;
  let eta: string | null = null;
  for (let i = 0; i < headerRow; i++) {
    const row = rows[i] as unknown[];
    for (let c = 0; c < row.length; c++) {
      const cell = normalize(row[c]);
      if (!cell) continue;
      // "Proveedor: X" en la misma celda
      const supMatch = /^(proveedor|provedor|supplier|bodega)\s*[:\-]?\s*(.+)$/.exec(cell);
      if (supMatch && supMatch[2] && supMatch[2].length > 1 && !supplier) {
        supplier = String(row[c]).split(/[:\-]/).slice(1).join(":").trim() || null;
      } else if (/^(proveedor|provedor|supplier|bodega)$/.test(cell) && !supplier) {
        // valor en la siguiente celda no vacía
        for (let k = c + 1; k < row.length; k++) {
          if (String(row[k] ?? "").trim()) {
            supplier = String(row[k]).trim();
            break;
          }
        }
      }
      const etaMatch = /^(eta|fecha (de )?(entrega|llegada|arribo)|entrega estimada|llega)\s*[:\-]?\s*(.+)?$/.exec(cell);
      if (etaMatch && !eta) {
        const inline = etaMatch[4];
        if (inline) {
          eta = excelDateToISO(inline);
        } else {
          for (let k = c + 1; k < row.length; k++) {
            if (String(row[k] ?? "").trim()) {
              eta = excelDateToISO(row[k]);
              break;
            }
          }
        }
      }
    }
  }

  // --- Mapear columnas ---
  const header = (rows[headerRow] as unknown[]).map(normalize);
  const col = {
    sku: findCol(header, SKU_TOKENS),
    product: findCol(header, PRODUCT_TOKENS),
    qty: findCol(header, QTY_TOKENS),
    cost: findCol(header, COST_TOKENS),
    total: findCol(header, TOTAL_TOKENS),
    dest: findCol(header, DEST_TOKENS),
  };
  if (col.product < 0) {
    return {
      supplier,
      eta,
      lines: [],
      errors: [
        {
          row: headerRow + 1,
          message: `No identifiqué la columna de producto. Encabezados encontrados: ${header.filter(Boolean).join(" · ")}`,
        },
      ],
      warnings,
    };
  }
  if (col.qty < 0) warnings.push("No detecté una columna de cantidad; se asume 1 por partida.");
  if (col.cost < 0 && col.total < 0) warnings.push("No detecté columna de costo; las partidas quedan en 0 (puedes ajustarlas a mano).");

  const lines: ParsedPOLine[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const rowNumber = i + 1;
    const name = String(row[col.product] ?? "").trim();
    if (!name) continue;
    const nName = normalize(name);
    // Saltar filas de totales / notas
    if (/^(total|subtotal|iva|gran total|importe total|suma)\b/.test(nName)) continue;

    let qty = col.qty >= 0 ? num(row[col.qty]) : 1;
    if (!Number.isFinite(qty) || qty === 0) {
      if (col.qty < 0) qty = 1;
      else {
        errors.push({ row: rowNumber, message: `«${name}»: cantidad inválida o vacía.` });
        continue;
      }
    }
    if (qty < 0) qty = Math.abs(qty);

    let unitCost = col.cost >= 0 ? num(row[col.cost]) : NaN;
    if (!Number.isFinite(unitCost)) {
      const lineTotal = col.total >= 0 ? num(row[col.total]) : NaN;
      unitCost = Number.isFinite(lineTotal) && qty ? lineTotal / qty : 0;
    }
    unitCost = Math.round(unitCost * 100) / 100;

    const sku = col.sku >= 0 ? String(row[col.sku] ?? "").trim().replace(/\.0+$/, "") || null : null;
    const dest = col.dest >= 0 ? String(row[col.dest] ?? "").trim() || null : null;

    lines.push({ sku, product_name: name, qty, unit_cost: unitCost, destination_region: dest });
  }

  if (!lines.length && !errors.length) {
    errors.push({ row: headerRow + 1, message: "No encontré partidas debajo de los encabezados." });
  }

  return { supplier, eta, lines, errors, warnings };
}
