// Carga de cuentas que "dejaron de pedir" (churn de facturas) y armado del
// correo-recordatorio por vendedor. Compartido entre el tablero admin, el
// endpoint de envío y el cron semanal. NO envía por sí mismo.
//
// "Pedido" aquí = factura real del módulo Reparto (reparto.pedidos con
// tipo='factura'); se excluyen traspasos (movimientos internos), patrocinios
// (regalos), consignaciones y "otro", que no son una compra del cliente.
//
// Cruce accounts↔reparto.clientes (no hay FK) idéntico al de la ficha del
// cliente: por RFC (excluyendo genéricos del SAT) con respaldo por nombre
// exacto. Ver [[ultimos-pedidos-reparto]].

import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import { repartoAdmin } from "@/lib/supabase-reparto";

// Acepta el cliente con cookies (admin vía RLS) o el service-role (cron).
type DbClient = ReturnType<typeof createClient> | SupabaseClient;

// Cuentas que sí queremos vigilar: activas y prospectos.
const ESTADOS = ["activo", "prospecto"];

// RFC genéricos del SAT (público en general / extranjero): los comparten muchas
// cuentas, cruzarlos mezclaría pedidos de otros clientes.
const RFC_GENERICOS = ["XAXX010101000", "XEXX010101000"];

/** Umbral por defecto: 21 días sin facturar. */
export const DEFAULT_SIN_PEDIDOS_DAYS = 21;

/** URL base de la app para los enlaces del correo (sin slash final). */
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://crm-steel-tau.vercel.app").replace(/\/+$/, "");

const MS_DAY = 86_400_000;

export type ChurnedAccount = {
  account_id: string;
  business_name: string;
  assigned_rep_id: string | null;
  /** Fecha (yyyy-mm-dd) de la última factura del cliente. */
  last_order_date: string;
  /** Días transcurridos desde la última factura. */
  days_since_order: number;
};

function daysSince(ymd: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(ymd).getTime()) / MS_DAY));
}

/** Última factura (fecha máxima) por cliente de Reparto, paginando para no
 *  toparse con el tope de 1000 filas de PostgREST. */
async function loadLastFacturaByCliente(): Promise<Map<string, string>> {
  const last = new Map<string, string>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await repartoAdmin
      .from("pedidos")
      .select("cliente_id, fecha")
      .eq("tipo", "factura")
      .not("cliente_id", "is", null)
      .order("fecha", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const row of data as { cliente_id: string | null; fecha: string | null }[]) {
      if (!row.cliente_id || !row.fecha) continue;
      const prev = last.get(row.cliente_id);
      // fecha es yyyy-mm-dd: el orden lexicográfico coincide con el cronológico.
      if (!prev || row.fecha > prev) last.set(row.cliente_id, row.fecha);
    }
    if (data.length < PAGE) break;
  }
  return last;
}

/** Carga las cuentas activas/prospecto que YA facturaron alguna vez, con la
 *  fecha de su última factura y los días transcurridos. Las que nunca han
 *  facturado quedan fuera (el recordatorio es de churn, no de prospección).
 *  Devuelve TODAS (sin filtrar por umbral) para que el tablero ajuste el corte
 *  en el cliente. Si Reparto no está disponible (falta service-role local),
 *  devuelve []. */
export async function loadChurnedAccounts(
  supabase: DbClient,
  repId?: string,
): Promise<ChurnedAccount[]> {
  let lastByCliente: Map<string, string>;
  let clientes: { id: string; rfc: string | null; nombre: string }[];
  try {
    const [last, clientesRes] = await Promise.all([
      loadLastFacturaByCliente(),
      repartoAdmin.from("clientes").select("id, rfc, nombre"),
    ]);
    lastByCliente = last;
    clientes = (clientesRes.data ?? []) as { id: string; rfc: string | null; nombre: string }[];
  } catch {
    return []; // Reparto no disponible: degradar sin romper la página/cron.
  }

  // Índices de cruce: RFC (no genérico) y nombre exacto en minúsculas.
  const byRfc = new Map<string, string[]>();
  const byName = new Map<string, string[]>();
  for (const c of clientes) {
    const rfc = (c.rfc ?? "").trim().toUpperCase();
    if (rfc && !RFC_GENERICOS.includes(rfc)) {
      (byRfc.get(rfc) ?? byRfc.set(rfc, []).get(rfc)!).push(c.id);
    }
    const name = (c.nombre ?? "").trim().toLowerCase();
    if (name) (byName.get(name) ?? byName.set(name, []).get(name)!).push(c.id);
  }

  let q = supabase
    .from("accounts")
    .select("id, business_name, rfc, assigned_rep_id, status")
    .in("status", ESTADOS);
  if (repId) q = q.eq("assigned_rep_id", repId);
  const { data: accounts } = await q;

  const now = Date.now();
  const out: ChurnedAccount[] = [];
  for (const a of (accounts ?? []) as {
    id: string;
    business_name: string;
    rfc: string | null;
    assigned_rep_id: string | null;
  }[]) {
    const rfc = (a.rfc ?? "").trim().toUpperCase();
    let ids: string[] = [];
    if (rfc && !RFC_GENERICOS.includes(rfc)) ids = byRfc.get(rfc) ?? [];
    if (ids.length === 0) ids = byName.get((a.business_name ?? "").trim().toLowerCase()) ?? [];

    let lastDate: string | null = null;
    for (const id of ids) {
      const f = lastByCliente.get(id);
      if (f && (!lastDate || f > lastDate)) lastDate = f;
    }
    if (!lastDate) continue; // nunca facturó → fuera de alcance

    out.push({
      account_id: a.id,
      business_name: a.business_name,
      assigned_rep_id: a.assigned_rep_id,
      last_order_date: lastDate,
      days_since_order: daysSince(lastDate, now),
    });
  }

  return out.sort(sortByChurn);
}

/** Ordena de más a menos churn: más días sin pedir primero. */
export function sortByChurn(a: ChurnedAccount, b: ChurnedAccount): number {
  if (a.days_since_order !== b.days_since_order) return b.days_since_order - a.days_since_order;
  return a.business_name.localeCompare(b.business_name);
}

/** Filtra a las cuentas que llevan >= `days` sin facturar. */
export function filterByDays(accounts: ChurnedAccount[], days: number): ChurnedAccount[] {
  return accounts.filter((a) => a.days_since_order >= days);
}

/** Texto legible de la última factura. */
export function lastOrderLabel(a: ChurnedAccount): string {
  const fecha = new Date(a.last_order_date).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const dias = a.days_since_order === 1 ? "1 día" : `${a.days_since_order} días`;
  return `Hace ${dias} · ${fecha}`;
}

export type DigestResult =
  | { ok: true; to: string; subject: string; html: string; count: number; repName: string }
  | { ok: false; status: number; error: string };

/** Arma el correo-recordatorio para un vendedor con SUS clientes que dejaron de
 *  pedir (>= `days` días sin facturar). */
export async function buildSinPedidosDigest(
  supabase: DbClient,
  repId: string,
  days: number = DEFAULT_SIN_PEDIDOS_DAYS,
): Promise<DigestResult> {
  const { data: rep } = await supabase
    .from("sales_reps")
    .select("full_name, email, active")
    .eq("id", repId)
    .maybeSingle();
  if (!rep) return { ok: false, status: 404, error: "Vendedor no encontrado" };
  if (!rep.email) return { ok: false, status: 400, error: "El vendedor no tiene email registrado" };

  const accounts = filterByDays(await loadChurnedAccounts(supabase, repId), days);
  if (!accounts.length) {
    return { ok: false, status: 400, error: `Este vendedor no tiene clientes con ${days}+ días sin pedir.` };
  }

  const rows = accounts
    .map((a) => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;">${escapeHtml(a.business_name)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#b45309;">${escapeHtml(lastOrderLabel(a))}</td>
        </tr>`)
    .join("");

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#222;">
    <h2 style="color:#7a1220;margin:0 0 4px;">TERAVINO — Clientes que dejaron de pedir</h2>
    <p style="margin:0 0 16px;color:#666;">Hola ${escapeHtml(rep.full_name ?? "")}, estos clientes que tienes asignados llevan ${days} días o más sin facturar un pedido:</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0;">
      <thead>
        <tr style="background:#f6f1ee;text-align:left;">
          <th style="padding:6px 10px;">Cliente</th>
          <th style="padding:6px 10px;">Último pedido</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:16px;">Contáctalos para reactivar el pedido: una llamada o visita a tiempo evita perder al cliente. Registra el seguimiento en el CRM.</p>
    <p style="margin:24px 0;">
      <a href="${APP_URL}/cuentas" style="display:inline-block;background:#7a1220;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 20px;border-radius:6px;">Abrir el CRM</a>
    </p>
    <p style="color:#666;font-size:13px;margin-top:24px;">TERAVINO · CRM</p>
  </div>`;

  return {
    ok: true,
    to: rep.email,
    subject: `Clientes que dejaron de pedir — ${accounts.length} ${accounts.length === 1 ? "cliente" : "clientes"}`,
    html,
    count: accounts.length,
    repName: rep.full_name ?? rep.email,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
