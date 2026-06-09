// Carga de cuentas inactivas (sin actividad registrada en N días) y armado del
// correo-recordatorio por vendedor. Compartido entre el tablero admin, el
// endpoint de envío y el cron. NO envía por sí mismo.
//
// Se apoya en la vista public.v_account_last_activity (migración 0015), que ya
// calcula la última actividad por cuenta ignorando las canceladas.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";

// Acepta el cliente con cookies (admin vía RLS) o el service-role (cron).
type DbClient = ReturnType<typeof createClient> | SupabaseClient;

// Cuentas que sí queremos vigilar: activas y prospectos (no perdidas ni las ya
// marcadas 'inactivo' a mano).
const ESTADOS = ["activo", "prospecto"];

/** Umbral por defecto: 15 días sin actividad. */
export const DEFAULT_INACTIVE_DAYS = 15;

export type InactiveAccount = {
  account_id: string;
  business_name: string;
  assigned_rep_id: string | null;
  /** ISO de la última actividad no cancelada, o null si nunca tuvo actividad. */
  last_activity_date: string | null;
  /** Días transcurridos desde la última actividad; null = nunca registró nada. */
  days_inactive: number | null;
};

const MS_DAY = 86_400_000;

function daysSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  return Math.floor((now - new Date(iso).getTime()) / MS_DAY);
}

/** Carga las cuentas activas/prospecto con su última actividad.
 *  Si se pasa repId, solo las de ese vendedor. Devuelve TODAS (sin filtrar por
 *  umbral) para que el tablero pueda ajustar el corte en el cliente. */
export async function loadInactiveAccounts(
  supabase: DbClient,
  repId?: string,
): Promise<InactiveAccount[]> {
  let q = supabase
    .from("v_account_last_activity")
    .select("account_id, business_name, assigned_rep_id, status, last_activity_date")
    .in("status", ESTADOS);
  if (repId) q = q.eq("assigned_rep_id", repId);
  const { data } = await q;
  const rows = (data ?? []) as {
    account_id: string;
    business_name: string;
    assigned_rep_id: string | null;
    last_activity_date: string | null;
  }[];

  const now = Date.now();
  return rows
    .map((r) => ({
      account_id: r.account_id,
      business_name: r.business_name,
      assigned_rep_id: r.assigned_rep_id,
      last_activity_date: r.last_activity_date,
      days_inactive: daysSince(r.last_activity_date, now),
    }))
    .sort(sortByInactivity);
}

/** Ordena de más a menos inactiva: las que nunca tuvieron actividad van primero. */
export function sortByInactivity(a: InactiveAccount, b: InactiveAccount): number {
  const av = a.days_inactive ?? Number.POSITIVE_INFINITY;
  const bv = b.days_inactive ?? Number.POSITIVE_INFINITY;
  if (av !== bv) return bv - av;
  return a.business_name.localeCompare(b.business_name);
}

/** Filtra a las cuentas que llevan >= `days` sin actividad (incluye las que
 *  nunca tuvieron ninguna). */
export function filterByDays(accounts: InactiveAccount[], days: number): InactiveAccount[] {
  return accounts.filter((a) => a.days_inactive === null || a.days_inactive >= days);
}

/** Texto legible del último contacto de una cuenta. */
export function lastContactLabel(a: InactiveAccount): string {
  if (a.days_inactive === null) return "Sin actividad registrada";
  const fecha = a.last_activity_date
    ? new Date(a.last_activity_date).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
    : "";
  const dias = a.days_inactive === 1 ? "1 día" : `${a.days_inactive} días`;
  return fecha ? `Hace ${dias} (${fecha})` : `Hace ${dias}`;
}

export type DigestResult =
  | { ok: true; to: string; subject: string; html: string; count: number; repName: string }
  | { ok: false; status: number; error: string };

/** Arma el correo-recordatorio para un vendedor con SUS cuentas inactivas
 *  (>= `days` días sin actividad). */
export async function buildInactiveAccountsDigest(
  supabase: DbClient,
  repId: string,
  days: number = DEFAULT_INACTIVE_DAYS,
): Promise<DigestResult> {
  const { data: rep } = await supabase
    .from("sales_reps")
    .select("full_name, email, active")
    .eq("id", repId)
    .maybeSingle();
  if (!rep) return { ok: false, status: 404, error: "Vendedor no encontrado" };
  if (!rep.email) return { ok: false, status: 400, error: "El vendedor no tiene email registrado" };

  const accounts = filterByDays(await loadInactiveAccounts(supabase, repId), days);
  if (!accounts.length) {
    return { ok: false, status: 400, error: `Este vendedor no tiene clientes sin actividad en ${days} días.` };
  }

  const rows = accounts
    .map((a) => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;">${escapeHtml(a.business_name)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#b45309;">${escapeHtml(lastContactLabel(a))}</td>
        </tr>`)
    .join("");

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#222;">
    <h2 style="color:#7a1220;margin:0 0 4px;">TERAVINO — Clientes sin seguimiento</h2>
    <p style="margin:0 0 16px;color:#666;">Hola ${escapeHtml(rep.full_name ?? "")}, estos clientes que tienes asignados llevan ${days} días o más sin ninguna actividad registrada:</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0;">
      <thead>
        <tr style="background:#f6f1ee;text-align:left;">
          <th style="padding:6px 10px;">Cliente</th>
          <th style="padding:6px 10px;">Último contacto</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:16px;">Por favor dales seguimiento: agenda una visita, llamada o degustación y registra la actividad en el CRM. Mantener el contacto vivo evita que el cliente se enfríe.</p>
    <p style="color:#666;font-size:13px;margin-top:24px;">TERAVINO · CRM</p>
  </div>`;

  return {
    ok: true,
    to: rep.email,
    subject: `Clientes sin seguimiento — ${accounts.length} ${accounts.length === 1 ? "cliente" : "clientes"}`,
    html,
    count: accounts.length,
    repName: rep.full_name ?? rep.email,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
