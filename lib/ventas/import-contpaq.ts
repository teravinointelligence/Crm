// Import del "Reporte de Ventas por Cliente" (CONTPAQ) → monthly_sales.
//
// Todo el trabajo lo hace el RPC import_monthly_sales_contpaq en UNA
// transacción (altas de cuentas faltantes, cabeceras, partidas, retiro de
// filas del periodo que ya no vienen, bitácora y cuadre). Este módulo arma el
// payload y traduce el resumen a texto para la UI / consola. Lo comparten la
// pantalla /ventas/importar, la sincronización desde Drive y el script.
//
// Regla: NUNCA se descarta un cliente en silencio. Si su # no existe en el
// CRM se crea la cuenta con needs_review = true; si la cuenta no tiene
// vendedor se importa con sales_rep_id nulo y se avisa.

import { sumClientes, type VentaClienteParsed, type VentasTotalGeneral } from "@/lib/excel/parseVentas";

/** |Total General − importado| mayor a esto = alerta visible. */
export const DIFF_ALERT_THRESHOLD = 1.0;

export type ImportedAccountRef = {
  client_number: string;
  client_name: string | null;
  account_id: string;
  muestras?: boolean;
  n?: number;
  venta_bruta?: number;
};

export type ContpaqImportSummary = {
  import_id: string;
  period: string;
  customers: number;
  product_lines: number;
  created: ImportedAccountRef[];
  without_rep: ImportedAccountRef[];
  duplicates: ImportedAccountRef[];
  skipped: { client_number: string | null; client_name: string | null; reason: string }[];
  removed: ImportedAccountRef[];
  report_totals: VentasTotalGeneral | null;
  imported_totals: VentasTotalGeneral;
  total_diff: number | null;
  diff_alert: boolean;
};

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export type ContpaqImportArgs = {
  /** YYYY-MM-01 */
  period: string;
  clientes: VentaClienteParsed[];
  totalGeneral: VentasTotalGeneral | null;
  parseErrors: number;
  sourceFileName: string | null;
  /** Retirar filas del periodo que no vienen en el reporte (default true: el reporte es el mes completo). */
  replacePeriod?: boolean;
};

export function buildClientesPayload(clientes: VentaClienteParsed[]) {
  return clientes.map((c) => ({
    client_number: c.client_number,
    client_name: c.client_name,
    venta_bruta: c.venta_bruta,
    neto: c.neto,
    descuento: c.descuento,
    neto_desc: c.neto_desc,
    items: c.items.map((it) => ({
      codigo: it.codigo,
      producto_nombre: it.producto_nombre,
      cantidad: it.cantidad,
      neto: it.neto,
      descuento: it.descuento,
      neto_desc: it.neto_desc,
      impuesto: it.impuesto,
      total: it.total,
    })),
  }));
}

export async function importContpaqSales(
  supabase: RpcClient,
  args: ContpaqImportArgs,
): Promise<ContpaqImportSummary> {
  // Si el archivo no trae "Total General", cuadramos contra la suma de lo
  // parseado (detecta al menos clientes que el RPC no pudo cargar).
  const reportTotals = args.totalGeneral ?? sumClientes(args.clientes);
  const { data, error } = await supabase.rpc("import_monthly_sales_contpaq", {
    p_period: args.period,
    p_clientes: buildClientesPayload(args.clientes),
    p_source_file_name: args.sourceFileName,
    p_source_format: "contpaq",
    p_report_totals: reportTotals,
    p_parse_errors: args.parseErrors,
    p_replace_period: args.replacePeriod ?? true,
  });
  if (error) throw new Error(error.message);
  const s = data as ContpaqImportSummary;
  return {
    ...s,
    total_diff: s.total_diff == null ? null : Number(s.total_diff),
    diff_alert: Boolean(s.diff_alert),
  };
}

const money = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

const ref = (a: ImportedAccountRef) => `# ${a.client_number} (${a.client_name ?? "?"})`;

/** Alerta principal (cuadre) o null si cuadra. */
export function summaryAlert(s: ContpaqImportSummary): string | null {
  if (!s.diff_alert || s.total_diff == null) return null;
  return `NO CUADRA: el reporte suma ${money(s.report_totals?.total)} y se importaron ${money(s.imported_totals.total)} (diferencia ${money(s.total_diff)}). Revisa los avisos antes de usar este mes.`;
}

/** Avisos (no bloquean, pero requieren acción de Dirección). */
export function summaryWarnings(s: ContpaqImportSummary): string[] {
  const out: string[] = [];
  for (const a of s.created) {
    out.push(`${ref(a)}: cuenta creada automáticamente${a.muestras ? " como MUESTRAS" : ""} — asignar vendedor y revisar datos.`);
  }
  for (const a of s.without_rep) {
    if (s.created.some((c) => c.account_id === a.account_id)) continue;
    out.push(`${ref(a)}: cuenta sin vendedor asignado — se importó sin vendedor (no cuenta para comisiones ni metas hasta asignarlo).`);
  }
  for (const a of s.duplicates) {
    out.push(`${ref(a)}: hay ${a.n} cuentas con ese # de cliente en el CRM; se cargó a la que ya tenía ventas del mes / activa. Corrige el # duplicado.`);
  }
  for (const a of s.removed) {
    out.push(`${ref(a)}: tenía ventas del mes en el CRM (${money(a.venta_bruta)}) pero ya no viene en el reporte — fila retirada.`);
  }
  for (const k of s.skipped) {
    out.push(`# ${k.client_number ?? "?"} (${k.client_name ?? "?"}): NO importado — ${k.reason}.`);
  }
  return out;
}
