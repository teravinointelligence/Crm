// Carga de cuentas con datos faltantes y armado del correo-resumen por vendedor.
// Compartido entre el tablero admin y el endpoint de envío. NO envía por sí mismo.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import { missingFlags, MISSING_LABEL, type MissingFlag, type ContactLite } from "@/lib/missing-data";

// Acepta el cliente con cookies (admin vía RLS) o el service-role (cron).
type DbClient = ReturnType<typeof createClient> | SupabaseClient;

const ESTADOS = ["activo", "prospecto"];

export type IncompleteAccount = {
  account_id: string;
  business_name: string;
  assigned_rep_id: string | null;
  missing: MissingFlag[];
};

/** Carga las cuentas (activas/prospecto) con al menos un dato faltante.
 *  Si se pasa repId, solo las de ese vendedor. */
export async function loadIncompleteAccounts(
  supabase: DbClient,
  repId?: string,
): Promise<IncompleteAccount[]> {
  let q = supabase
    .from("accounts")
    .select("id, business_name, rfc, fiscal_name, assigned_rep_id, status")
    .in("status", ESTADOS);
  if (repId) q = q.eq("assigned_rep_id", repId);
  const { data: accounts } = await q;
  const accs = (accounts ?? []) as {
    id: string; business_name: string; rfc: string | null; fiscal_name: string | null; assigned_rep_id: string | null;
  }[];
  if (!accs.length) return [];

  const ids = accs.map((a) => a.id);
  const byAccount = new Map<string, ContactLite[]>();
  // Trae contactos en lotes para no exceder límites de IN.
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data: contacts } = await supabase
      .from("contacts")
      .select("account_id, email, phone, whatsapp, role")
      .in("account_id", chunk);
    for (const c of (contacts ?? []) as (ContactLite & { account_id: string })[]) {
      const list = byAccount.get(c.account_id) ?? [];
      list.push(c);
      byAccount.set(c.account_id, list);
    }
  }

  const out: IncompleteAccount[] = [];
  for (const a of accs) {
    const missing = missingFlags(a, byAccount.get(a.id) ?? []);
    if (missing.length) {
      out.push({ account_id: a.id, business_name: a.business_name, assigned_rep_id: a.assigned_rep_id, missing });
    }
  }
  return out.sort((x, y) => x.business_name.localeCompare(y.business_name));
}

/** Filtra los faltantes de cada cuenta a los criterios elegidos; descarta las
 *  que se quedan sin ningún faltante seleccionado. */
export function filterByCriteria(
  accounts: IncompleteAccount[],
  criteria?: MissingFlag[],
): IncompleteAccount[] {
  if (!criteria || !criteria.length) return accounts;
  const set = new Set(criteria);
  return accounts
    .map((a) => ({ ...a, missing: a.missing.filter((m) => set.has(m)) }))
    .filter((a) => a.missing.length > 0);
}

export type DigestResult =
  | { ok: true; to: string; subject: string; html: string; count: number; repName: string }
  | { ok: false; status: number; error: string };

/** Arma el correo-resumen para un vendedor con SUS cuentas incompletas.
 *  `criteria` limita qué faltantes cuentan (si se omite, todos). */
export async function buildMissingDataDigest(
  supabase: DbClient,
  repId: string,
  criteria?: MissingFlag[],
): Promise<DigestResult> {
  const { data: rep } = await supabase
    .from("sales_reps")
    .select("full_name, email, active")
    .eq("id", repId)
    .maybeSingle();
  if (!rep) return { ok: false, status: 404, error: "Vendedor no encontrado" };
  if (!rep.email) return { ok: false, status: 400, error: "El vendedor no tiene email registrado" };

  const accounts = filterByCriteria(await loadIncompleteAccounts(supabase, repId), criteria);
  if (!accounts.length) {
    return { ok: false, status: 400, error: "Este vendedor no tiene cuentas con datos faltantes." };
  }

  const rows = accounts
    .map((a) => {
      const faltan = a.missing.map((m) => MISSING_LABEL[m]).join(" · ");
      return `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;">${escapeHtml(a.business_name)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#b45309;">${escapeHtml(faltan)}</td>
        </tr>`;
    })
    .join("");

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#222;">
    <h2 style="color:#7a1220;margin:0 0 4px;">TERAVINO — Cuentas con datos pendientes</h2>
    <p style="margin:0 0 16px;color:#666;">Hola ${escapeHtml(rep.full_name ?? "")}, estas cuentas que tienes asignadas necesitan que completes su registro:</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0;">
      <thead>
        <tr style="background:#f6f1ee;text-align:left;">
          <th style="padding:6px 10px;">Cliente</th>
          <th style="padding:6px 10px;">Qué falta</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:16px;">Por favor entra al CRM, abre cada cuenta y completa los datos faltantes (contactos con email y teléfono, contacto de cuentas por pagar, y datos fiscales). Tener esto al día nos permite facturar y cobrar sin fricción.</p>
    <p style="color:#666;font-size:13px;margin-top:24px;">TERAVINO · CRM</p>
  </div>`;

  return {
    ok: true,
    to: rep.email,
    subject: `Cuentas con datos pendientes — ${accounts.length} ${accounts.length === 1 ? "cuenta" : "cuentas"}`,
    html,
    count: accounts.length,
    repName: rep.full_name ?? rep.email,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
