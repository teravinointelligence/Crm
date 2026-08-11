// Datos y cortes del reporte de muestras por vendedor.
//
// Lo comparten la página (/muestras/reporte), su componente de cliente y la
// ruta que genera el PDF (/api/muestras/reporte/pdf), para que el PDF salga
// EXACTAMENTE con las mismas filas y totales que ves en pantalla. Si cambias
// un filtro o un agregado, cámbialo aquí y los tres quedan alineados.
//
// No lleva `server-only` a propósito: el componente de cliente importa los
// tipos y las funciones puras. El cliente de Supabase entra como parámetro y
// se importa solo como tipo, así que nada del servidor llega al bundle.

import type { createClient } from "@/lib/supabase/server";
import { localInputToISO } from "@/lib/utils";

type DbClient = ReturnType<typeof createClient>;

export const TODOS = "_all";
// Los borradores todavía no se solicitan (no llegan a admin): fuera por defecto.
export const SIN_BORRADOR = "_sin_borrador";

export const ESTATUS = ["enviada", "aprobada", "entregada", "rechazada", "cancelada", "borrador"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type SampleReportRow = {
  id: string;
  folio: string;
  fecha: string | null;
  repId: string;
  vendedor: string;
  cliente: string | null;
  clientNumber: string | null;
  motivo: string | null;
  estatus: string;
  botellas: number;
  valor: number;
  /** Botellas de renglones manuales, sin producto del catálogo (no suman valor). */
  sinPrecio: number;
  capacitacionPersonas: number | null;
  productos: string;
};

export type SampleReportFiltros = { rep: string; estatus: string };

export type RepAgg = {
  repId: string;
  vendedor: string;
  solicitudes: number;
  botellas: number;
  valor: number;
  sinPrecio: number;
  capacitaciones: number;
  clientes: number;
};

type ReqRow = {
  id: string;
  request_number: string;
  reason: string | null;
  status: string | null;
  created_at: string | null;
  training_people: number | null;
  sales_rep_id: string;
  sales_reps: { full_name: string | null } | null;
  accounts: { business_name: string | null; client_number: string | null } | null;
  sample_request_items: Array<{ product_id: string | null; product_name: string | null; quantity: number | null }> | null;
};

/**
 * Rango válido a partir de lo que venga en la URL: por defecto el mes en curso,
 * y si viene invertido lo endereza en vez de devolver vacío.
 */
export function normalizaRango(
  desde: string | undefined,
  hasta: string | undefined,
  hoy: string,
): { desde: string; hasta: string } {
  const d = DATE_RE.test(desde ?? "") ? desde! : `${hoy.slice(0, 7)}-01`;
  const h = DATE_RE.test(hasta ?? "") ? hasta! : hoy;
  return d <= h ? { desde: d, hasta: h } : { desde: h, hasta: d };
}

/** Solicitudes del rango con sus botellas y su valor a precio de lista. */
export async function loadSampleReport(
  supabase: DbClient,
  desde: string,
  hasta: string,
): Promise<SampleReportRow[]> {
  const [reqRes, prodRes] = await Promise.all([
    supabase
      .from("sample_requests")
      .select(
        "id, request_number, reason, status, created_at, training_people, sales_rep_id, sales_reps:sales_rep_id(full_name), accounts:account_id(business_name, client_number), sample_request_items(product_id, product_name, quantity)",
      )
      // Los límites son días completos en hora de Los Cabos, no UTC.
      .gte("created_at", localInputToISO(`${desde}T00:00`))
      .lte("created_at", localInputToISO(`${hasta}T23:59`))
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase.from("products").select("id, base_price").limit(5000),
  ]);

  const priceById = new Map(
    ((prodRes.data ?? []) as { id: string; base_price: number | null }[]).map((p) => [
      p.id,
      Number(p.base_price ?? 0),
    ]),
  );

  return (((reqRes.data ?? []) as unknown) as ReqRow[]).map((r) => {
    let botellas = 0;
    let valor = 0;
    let sinPrecio = 0;
    const productos: string[] = [];
    for (const it of r.sample_request_items ?? []) {
      const qty = Number(it.quantity ?? 0);
      botellas += qty;
      const price = it.product_id ? priceById.get(it.product_id) : undefined;
      if (price == null) sinPrecio += qty;
      else valor += qty * price;
      productos.push(`${qty} × ${it.product_name ?? "—"}`);
    }
    return {
      id: r.id,
      folio: r.request_number,
      fecha: r.created_at,
      repId: r.sales_rep_id,
      vendedor: r.sales_reps?.full_name ?? "—",
      cliente: r.accounts?.business_name ?? null,
      clientNumber: r.accounts?.client_number ?? null,
      motivo: r.reason,
      estatus: r.status ?? "—",
      botellas,
      valor,
      sinPrecio,
      capacitacionPersonas: r.training_people,
      productos: productos.join(", "),
    };
  });
}

export function filtraReporte(rows: SampleReportRow[], { rep, estatus }: SampleReportFiltros): SampleReportRow[] {
  return rows.filter((r) => {
    if (rep !== TODOS && r.repId !== rep) return false;
    if (estatus === SIN_BORRADOR) return r.estatus !== "borrador";
    if (estatus !== TODOS && r.estatus !== estatus) return false;
    return true;
  });
}

export function agrupaPorVendedor(rows: SampleReportRow[]): RepAgg[] {
  const clientesPorRep = new Map<string, Set<string>>();
  const map = new Map<string, RepAgg>();
  for (const r of rows) {
    const agg =
      map.get(r.repId) ??
      {
        repId: r.repId,
        vendedor: r.vendedor,
        solicitudes: 0,
        botellas: 0,
        valor: 0,
        sinPrecio: 0,
        capacitaciones: 0,
        clientes: 0,
      };
    agg.solicitudes += 1;
    agg.botellas += r.botellas;
    agg.valor += r.valor;
    agg.sinPrecio += r.sinPrecio;
    if (r.capacitacionPersonas != null) agg.capacitaciones += 1;
    map.set(r.repId, agg);

    if (r.cliente) {
      const set = clientesPorRep.get(r.repId) ?? new Set<string>();
      set.add(r.cliente);
      clientesPorRep.set(r.repId, set);
    }
  }
  for (const [repId, set] of clientesPorRep) {
    const agg = map.get(repId);
    if (agg) agg.clientes = set.size;
  }
  return [...map.values()].sort((a, b) => b.botellas - a.botellas);
}

export function totalesDe(aggs: RepAgg[]) {
  return aggs.reduce(
    (acc, r) => ({
      solicitudes: acc.solicitudes + r.solicitudes,
      botellas: acc.botellas + r.botellas,
      valor: acc.valor + r.valor,
      sinPrecio: acc.sinPrecio + r.sinPrecio,
    }),
    { solicitudes: 0, botellas: 0, valor: 0, sinPrecio: 0 },
  );
}

/** Texto del filtro de estatus para encabezados y PDF. */
export function etiquetaEstatus(estatus: string): string {
  if (estatus === SIN_BORRADOR) return "Solicitadas (sin borradores)";
  if (estatus === TODOS) return "Todos los estatus";
  return estatus[0].toUpperCase() + estatus.slice(1);
}
