// Recordatorio por vendedor de las TOMAS DE INVENTARIO pendientes de sus
// clientes con consignación activa. Compartido entre el tablero admin, el
// endpoint de envío y el cron. NO envía por sí mismo.
//
// Los datos (consignaciones, tomas y vendedores) viven en Base44
// (TERAVINO Flow), no en Supabase. El puente con el CRM es el EMAIL del
// Vendedor de Base44.

import "server-only";
import {
  base44,
  type Base44Consignacion,
  type Base44TomaInventario,
  type Base44Vendedor,
} from "@/lib/base44";

/** Umbral por defecto: 14 días sin toma. */
export const DEFAULT_TOMA_DAYS = 14;

/** URL base de la app para los enlaces del correo (sin slash final). */
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://crm-steel-tau.vercel.app").replace(/\/+$/, "");

// Solo las consignaciones con producto vivo en el cliente necesitan inventario.
const ESTADOS_ACTIVOS = ["pendiente", "parcial"];
const MS_DAY = 86_400_000;

export type TomaPendiente = {
  consignacionId: string;
  cliente: string;
  estado: string;
  fechaConsignacion: string | null;
  ultimaToma: string | null;
  /** Días desde la última toma; null = nunca se ha tomado. */
  diasSinToma: number | null;
};

export type VendedorTomasGroup = {
  vendedorId: string;
  vendedorNombre: string;
  email: string | null;
  activo: boolean;
  items: TomaPendiente[];
};

function diasDesde(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((now - t) / MS_DAY);
}

/** Ordena de más a menos urgente: sin toma primero, luego más días. */
function sortItems(a: TomaPendiente, b: TomaPendiente): number {
  const av = a.diasSinToma ?? Number.POSITIVE_INFINITY;
  const bv = b.diasSinToma ?? Number.POSITIVE_INFINITY;
  if (av !== bv) return bv - av;
  return a.cliente.localeCompare(b.cliente);
}

async function loadBase44(vendedorId?: string): Promise<{
  consignaciones: Base44Consignacion[];
  tomas: Base44TomaInventario[];
}> {
  const consigQ: Record<string, unknown> = {};
  const tomaQ: Record<string, unknown> = {};
  if (vendedorId) {
    consigQ.vendedor_id = vendedorId;
    tomaQ.vendedor_id = vendedorId;
  }
  const [consignaciones, tomas] = await Promise.all([
    base44.entity<Base44Consignacion>("Consignacion").list({ q: consigQ, sort_by: "-fecha", limit: 500 }),
    base44.entity<Base44TomaInventario>("TomaInventario").list({ q: tomaQ, sort_by: "-fecha_toma", limit: 500 }),
  ]);
  return { consignaciones, tomas };
}

/** Devuelve las consignaciones activas que necesitan toma (sin toma, o con la
 *  última de hace >= `dias`), cada una con su vendedor. */
function pendientesDe(
  consignaciones: Base44Consignacion[],
  tomas: Base44TomaInventario[],
  dias: number,
): { vendedorId: string; vendedorNombre: string; item: TomaPendiente }[] {
  // Última toma (no anulada) por consignación.
  const ultimaPorConsig = new Map<string, string>();
  for (const t of tomas) {
    if (!t.consignacion_id || t.estado === "anulado") continue;
    const prev = ultimaPorConsig.get(t.consignacion_id);
    if (!prev || new Date(t.fecha_toma).getTime() > new Date(prev).getTime()) {
      ultimaPorConsig.set(t.consignacion_id, t.fecha_toma);
    }
  }
  const now = Date.now();
  const out: { vendedorId: string; vendedorNombre: string; item: TomaPendiente }[] = [];
  for (const c of consignaciones) {
    if (!ESTADOS_ACTIVOS.includes(c.estado)) continue;
    const ultima = ultimaPorConsig.get(c.id) ?? null;
    const d = diasDesde(ultima, now);
    if (d !== null && d < dias) continue; // ya tiene toma reciente
    out.push({
      vendedorId: c.vendedor_id,
      vendedorNombre: c.vendedor_nombre ?? "—",
      item: {
        consignacionId: c.id,
        cliente: c.cliente_nombre ?? "—",
        estado: c.estado,
        fechaConsignacion: c.fecha ?? null,
        ultimaToma: ultima,
        diasSinToma: d,
      },
    });
  }
  return out;
}

/** Carga TODAS las consignaciones pendientes agrupadas por vendedor (para el
 *  tablero admin y el cron). */
export async function loadTomasGroups(dias: number = DEFAULT_TOMA_DAYS): Promise<VendedorTomasGroup[]> {
  const [{ consignaciones, tomas }, vendedores] = await Promise.all([
    loadBase44(),
    base44.entity<Base44Vendedor>("Vendedor").list({ limit: 200 }),
  ]);
  const vendMap = new Map(vendedores.map((v) => [v.id, v]));

  const byVend = new Map<string, VendedorTomasGroup>();
  for (const p of pendientesDe(consignaciones, tomas, dias)) {
    let g = byVend.get(p.vendedorId);
    if (!g) {
      const v = vendMap.get(p.vendedorId);
      g = {
        vendedorId: p.vendedorId,
        vendedorNombre: v?.nombre ?? p.vendedorNombre,
        email: v?.email ?? null,
        activo: v?.activo ?? true,
        items: [],
      };
      byVend.set(p.vendedorId, g);
    }
    g.items.push(p.item);
  }
  for (const g of byVend.values()) g.items.sort(sortItems);
  return Array.from(byVend.values()).sort((a, b) => b.items.length - a.items.length);
}

export type DigestResult =
  | { ok: true; to: string; subject: string; html: string; count: number; repName: string }
  | { ok: false; status: number; error: string };

/** Etiqueta legible de la última toma de un cliente. */
export function ultimaTomaLabel(item: TomaPendiente): string {
  if (item.diasSinToma === null) return "Sin toma registrada";
  const fecha = item.ultimaToma
    ? new Date(item.ultimaToma).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
    : "";
  const dias = item.diasSinToma === 1 ? "1 día" : `${item.diasSinToma} días`;
  return fecha ? `Hace ${dias} · ${fecha}` : `Hace ${dias}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

const ESTADO_LABEL: Record<string, string> = { pendiente: "Pendiente", parcial: "Parcial" };

/** Arma el asunto + HTML del recordatorio para un vendedor con SUS clientes
 *  pendientes de toma. */
export function renderTomasDigest(
  vendedorNombre: string,
  items: TomaPendiente[],
  dias: number,
): { subject: string; html: string } {
  const rows = items
    .map(
      (it) => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;">${escapeHtml(it.cliente)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#555;">${ESTADO_LABEL[it.estado] ?? escapeHtml(it.estado)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#b45309;">${escapeHtml(ultimaTomaLabel(it))}</td>
        </tr>`,
    )
    .join("");

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#222;">
    <h2 style="color:#7a1220;margin:0 0 4px;">TERAVINO — Tomas de inventario pendientes</h2>
    <p style="margin:0 0 16px;color:#666;">Hola ${escapeHtml(vendedorNombre ?? "")}, estos clientes con consignación llevan ${dias} días o más sin una toma de inventario (o nunca se les ha tomado). Por favor agéndalas esta semana:</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0;">
      <thead>
        <tr style="background:#f6f1ee;text-align:left;">
          <th style="padding:6px 10px;">Cliente</th>
          <th style="padding:6px 10px;">Consignación</th>
          <th style="padding:6px 10px;">Última toma</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:16px;">El inventario debe levantarse cada semana en cada cliente con consignación. Registra la toma en TERAVINO Flow.</p>
    <p style="margin:24px 0;">
      <a href="${APP_URL}/consignaciones/tomas" style="display:inline-block;background:#7a1220;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 20px;border-radius:6px;">Ver tomas de inventario</a>
    </p>
    <p style="color:#666;font-size:13px;margin-top:24px;">TERAVINO · CRM</p>
  </div>`;

  return {
    subject: `Tomas de inventario pendientes — ${items.length} ${items.length === 1 ? "cliente" : "clientes"}`,
    html,
  };
}

/** Arma el recordatorio para UN vendedor de Base44 (por su id). */
export async function buildTomasInventarioDigest(
  vendedorId: string,
  dias: number = DEFAULT_TOMA_DAYS,
): Promise<DigestResult> {
  const vendedor = await base44
    .entity<Base44Vendedor>("Vendedor")
    .get(vendedorId)
    .catch(() => null);
  if (!vendedor) return { ok: false, status: 404, error: "Vendedor no encontrado en TERAVINO Flow" };
  if (!vendedor.email) {
    return { ok: false, status: 400, error: "El vendedor no tiene email registrado en TERAVINO Flow" };
  }

  const { consignaciones, tomas } = await loadBase44(vendedorId);
  const items = pendientesDe(consignaciones, tomas, dias)
    .map((p) => p.item)
    .sort(sortItems);
  if (!items.length) {
    return {
      ok: false,
      status: 400,
      error: `Este vendedor no tiene clientes con consignación sin toma en ${dias} días.`,
    };
  }

  const { subject, html } = renderTomasDigest(vendedor.nombre, items, dias);
  return {
    ok: true,
    to: vendedor.email,
    subject,
    html,
    count: items.length,
    repName: vendedor.nombre ?? vendedor.email,
  };
}
