// Barrido de reasignación por inactividad. Una cuenta asignada que lleva
// >= WARN_DAYS sin actividad recibe un aviso al vendedor ("te quedan N días");
// si pasados GRACE_DAYS sigue sin actividad nueva, la cuenta se regresa al pool
// (assigned_rep_id = null) y se notifica al vendedor y a admin.
//
// "Actividad" = la última actividad no cancelada de la cuenta (vista
// public.v_account_last_activity, migración 0015). Si la cuenta nunca tuvo
// actividad, se mide desde su created_at.
//
// Se apoya en accounts.reassign_warned_at y account_reassignment_log (migración
// 0088). Compartido entre el cron diario y el botón "Ejecutar ahora" del panel.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import { sendEmail, ventasFrom } from "@/lib/email";

type DbClient = ReturnType<typeof createClient> | SupabaseClient;

/** Días sin actividad para mandar el aviso previo. */
export const REASSIGN_WARN_DAYS = 60;
/** Días de gracia desde el aviso antes de reasignar al pool. */
export const REASSIGN_GRACE_DAYS = 3;
/** Estados de cuenta que entran al barrido (excluye 'perdido'). */
const ESTADOS = ["activo", "inactivo", "prospecto"];
const REASON = "inactividad";

const MS_DAY = 86_400_000;
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://crm-steel-tau.vercel.app").replace(/\/+$/, "");

function daysSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  return Math.floor((now - new Date(iso).getTime()) / MS_DAY);
}

type AccountRow = {
  id: string;
  business_name: string;
  assigned_rep_id: string | null;
  status: string | null;
  activity_baseline_at: string | null;
  reassign_warned_at: string | null;
  is_legacy: boolean | null;
  es_socio: boolean | null;
};

type Bucketed = {
  account_id: string;
  business_name: string;
  rep_id: string;
  last_activity_date: string | null;
  dias_restantes: number;
};

export type SweepSummary = {
  dryRun: boolean;
  warned: number;
  reassigned: number;
  recovered: number;
  pending: number;
  emailsSent: number;
  errores: string[];
};

/** Corre el barrido completo. Por defecto escribe en BD y manda correos.
 *  - dryRun: no escribe ni envía, solo cuenta (para "simular").
 *  - send: por defecto true; ponlo en false para escribir sin mandar correos. */
export async function runReassignmentSweep(
  supabase: DbClient,
  opts: { dryRun?: boolean; send?: boolean } = {},
): Promise<SweepSummary> {
  const dryRun = opts.dryRun ?? false;
  const send = opts.send ?? true;
  const now = Date.now();
  const errores: string[] = [];

  // Candidatas: asignadas, en estado vigilado, no legacy ni socio.
  const { data: acctData } = await supabase
    .from("accounts")
    .select("id, business_name, assigned_rep_id, status, activity_baseline_at, reassign_warned_at, is_legacy, es_socio")
    .in("status", ESTADOS)
    .not("assigned_rep_id", "is", null);
  const accounts = ((acctData ?? []) as AccountRow[]).filter(
    (a) => !a.is_legacy && !a.es_socio && a.assigned_rep_id,
  );

  // Última actividad por cuenta.
  const { data: actData } = await supabase
    .from("v_account_last_activity")
    .select("account_id, last_activity_date");
  const lastAct = new Map<string, string | null>(
    ((actData ?? []) as { account_id: string; last_activity_date: string | null }[]).map((r) => [
      r.account_id,
      r.last_activity_date,
    ]),
  );

  const toWarn: Bucketed[] = [];
  const toReassign: Bucketed[] = [];
  const toRecover: string[] = []; // account ids que vuelven a estar activos
  let pending = 0;

  for (const a of accounts) {
    const repId = a.assigned_rep_id as string;
    const lastActivity = lastAct.get(a.id) ?? null;
    const baseline = lastActivity ?? a.activity_baseline_at;
    const effDays = daysSince(baseline, now);
    if (effDays === null) continue; // sin baseline (no debería pasar)

    const warnedAt = a.reassign_warned_at;
    const activitySinceWarn =
      warnedAt != null && lastActivity != null && new Date(lastActivity) > new Date(warnedAt);

    if (warnedAt) {
      // Ya tiene aviso pendiente.
      if (effDays < REASSIGN_WARN_DAYS || activitySinceWarn) {
        toRecover.push(a.id); // se reactivó → limpiar aviso
        continue;
      }
      const graceElapsed = daysSince(warnedAt, now) ?? 0;
      if (graceElapsed >= REASSIGN_GRACE_DAYS) {
        toReassign.push({
          account_id: a.id,
          business_name: a.business_name,
          rep_id: repId,
          last_activity_date: lastActivity,
          dias_restantes: 0,
        });
      } else {
        pending++;
      }
    } else if (effDays >= REASSIGN_WARN_DAYS) {
      // Cruza el umbral por primera vez → avisar.
      toWarn.push({
        account_id: a.id,
        business_name: a.business_name,
        rep_id: repId,
        last_activity_date: lastActivity,
        dias_restantes: REASSIGN_GRACE_DAYS,
      });
    }
  }

  if (dryRun) {
    return {
      dryRun: true,
      warned: toWarn.length,
      reassigned: toReassign.length,
      recovered: toRecover.length,
      pending,
      emailsSent: 0,
      errores,
    };
  }

  const nowIso = new Date(now).toISOString();

  // 1) Marcar avisados.
  if (toWarn.length) {
    const ids = toWarn.map((x) => x.account_id);
    const { error } = await supabase
      .from("accounts")
      .update({ reassign_warned_at: nowIso })
      .in("id", ids);
    if (error) errores.push(`marcar aviso: ${error.message}`);
  }

  // 2) Limpiar aviso de las que se reactivaron.
  if (toRecover.length) {
    const { error } = await supabase
      .from("accounts")
      .update({ reassign_warned_at: null })
      .in("id", toRecover);
    if (error) errores.push(`limpiar aviso: ${error.message}`);
  }

  // 3) Reasignar al pool + bitácora.
  for (const x of toReassign) {
    const { error: upErr } = await supabase
      .from("accounts")
      .update({ assigned_rep_id: null, reassign_warned_at: null })
      .eq("id", x.account_id);
    if (upErr) {
      errores.push(`reasignar ${x.account_id}: ${upErr.message}`);
      continue;
    }
    const { error: logErr } = await supabase.from("account_reassignment_log").insert({
      account_id: x.account_id,
      from_rep_id: x.rep_id,
      to_rep_id: null,
      reason: REASON,
    });
    if (logErr) errores.push(`bitácora ${x.account_id}: ${logErr.message}`);
  }

  let emailsSent = 0;
  if (send) {
    const repIds = Array.from(
      new Set([...toWarn, ...toReassign].map((x) => x.rep_id)),
    );
    const reps = new Map<string, { name: string; email: string | null }>();
    if (repIds.length) {
      const { data: repData } = await supabase
        .from("sales_reps")
        .select("id, full_name, email")
        .in("id", repIds);
      for (const r of (repData ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
        reps.set(r.id, { name: r.full_name ?? "", email: r.email });
      }
    }
    const from = ventasFrom();

    // Avisos por vendedor.
    for (const repId of new Set(toWarn.map((x) => x.rep_id))) {
      const rep = reps.get(repId);
      if (!rep?.email) continue;
      const items = toWarn.filter((x) => x.rep_id === repId);
      try {
        await sendEmail({
          to: rep.email,
          subject: `Cuentas en riesgo de reasignación — ${items.length}`,
          html: buildWarningEmail(rep.name, items),
          from,
        });
        emailsSent++;
      } catch (e) {
        errores.push(`aviso ${repId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Notificación de reasignación por vendedor.
    for (const repId of new Set(toReassign.map((x) => x.rep_id))) {
      const rep = reps.get(repId);
      if (!rep?.email) continue;
      const items = toReassign.filter((x) => x.rep_id === repId);
      try {
        await sendEmail({
          to: rep.email,
          subject: `Cuentas reasignadas por inactividad — ${items.length}`,
          html: buildReassignedEmail(rep.name, items),
          from,
        });
        emailsSent++;
      } catch (e) {
        errores.push(`reasignado ${repId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Resumen a admin(s).
    if (toReassign.length) {
      const { data: admins } = await supabase
        .from("sales_reps")
        .select("email")
        .eq("role", "admin")
        .eq("active", true);
      const adminEmails = (admins ?? [])
        .map((r) => (r as { email: string | null }).email)
        .filter((e): e is string => !!e);
      if (adminEmails.length) {
        try {
          await sendEmail({
            to: adminEmails,
            subject: `Reasignación por inactividad — ${toReassign.length} cuentas al pool`,
            html: buildAdminSummary(toReassign, reps),
            from,
          });
          emailsSent++;
        } catch (e) {
          errores.push(`admin resumen: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  }

  return {
    dryRun: false,
    warned: toWarn.length,
    reassigned: toReassign.length,
    recovered: toRecover.length,
    pending,
    emailsSent,
    errores,
  };
}

// ---- Estado para el panel admin (solo lectura) ----

export type AtRiskAccount = {
  account_id: string;
  business_name: string;
  rep_id: string | null;
  rep_name: string;
  warned_at: string;
  dias_restantes: number;
};

export type ReassignmentLogRow = {
  id: string;
  account_id: string;
  business_name: string | null;
  from_rep_name: string;
  reason: string | null;
  created_at: string;
};

/** Cuentas con aviso pendiente (en cuenta regresiva) + reasignaciones recientes. */
export async function loadReassignmentStatus(
  supabase: DbClient,
): Promise<{ atRisk: AtRiskAccount[]; recent: ReassignmentLogRow[] }> {
  const now = Date.now();

  const { data: warnedData } = await supabase
    .from("accounts")
    .select("id, business_name, assigned_rep_id, reassign_warned_at, sales_reps:assigned_rep_id(full_name)")
    .not("reassign_warned_at", "is", null);

  const atRisk: AtRiskAccount[] = ((warnedData ?? []) as unknown as {
    id: string;
    business_name: string;
    assigned_rep_id: string | null;
    reassign_warned_at: string;
    sales_reps: { full_name: string | null } | null;
  }[])
    .map((a) => {
      const elapsed = daysSince(a.reassign_warned_at, now) ?? 0;
      return {
        account_id: a.id,
        business_name: a.business_name,
        rep_id: a.assigned_rep_id,
        rep_name: a.sales_reps?.full_name ?? "Sin vendedor",
        warned_at: a.reassign_warned_at,
        dias_restantes: Math.max(0, REASSIGN_GRACE_DAYS - elapsed),
      };
    })
    .sort((x, y) => x.dias_restantes - y.dias_restantes);

  const { data: logData } = await supabase
    .from("account_reassignment_log")
    .select("id, account_id, reason, created_at, accounts:account_id(business_name), sales_reps:from_rep_id(full_name)")
    .order("created_at", { ascending: false })
    .limit(50);

  const recent: ReassignmentLogRow[] = ((logData ?? []) as unknown as {
    id: string;
    account_id: string;
    reason: string | null;
    created_at: string;
    accounts: { business_name: string | null } | null;
    sales_reps: { full_name: string | null } | null;
  }[]).map((r) => ({
    id: r.id,
    account_id: r.account_id,
    business_name: r.accounts?.business_name ?? null,
    from_rep_name: r.sales_reps?.full_name ?? "—",
    reason: r.reason,
    created_at: r.created_at,
  }));

  return { atRisk, recent };
}

// ---- Plantillas de correo ----

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function rowsHtml(items: { business_name: string; dias_restantes: number }[], withDays: boolean): string {
  return items
    .map(
      (a) => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;">${escapeHtml(a.business_name)}</td>
          ${withDays ? `<td style="padding:6px 10px;border-bottom:1px solid #eee;color:#b45309;">Te quedan ${a.dias_restantes} ${a.dias_restantes === 1 ? "día" : "días"}</td>` : ""}
        </tr>`,
    )
    .join("");
}

function buildWarningEmail(repName: string, items: { business_name: string; dias_restantes: number }[]): string {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#222;">
    <h2 style="color:#7a1220;margin:0 0 4px;">TERAVINO — Cuentas en riesgo de reasignación</h2>
    <p style="margin:0 0 16px;color:#666;">Hola ${escapeHtml(repName)}, estas cuentas que tienes asignadas llevan ${REASSIGN_WARN_DAYS} días o más sin ninguna actividad registrada. <strong>Te quedan ${REASSIGN_GRACE_DAYS} días</strong> para registrar una actividad (visita, llamada, degustación…) o se regresarán al pool para reasignarse.</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0;">
      <thead><tr style="background:#f6f1ee;text-align:left;"><th style="padding:6px 10px;">Cuenta</th><th style="padding:6px 10px;">Plazo</th></tr></thead>
      <tbody>${rowsHtml(items, true)}</tbody>
    </table>
    <p style="margin:24px 0;">
      <a href="${APP_URL}/cuentas" style="display:inline-block;background:#7a1220;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 20px;border-radius:6px;">Abrir el CRM y registrar actividad</a>
    </p>
    <p style="color:#666;font-size:13px;margin-top:24px;">TERAVINO · CRM</p>
  </div>`;
}

function buildReassignedEmail(repName: string, items: { business_name: string }[]): string {
  const rows = items
    .map((a) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;">${escapeHtml(a.business_name)}</td></tr>`)
    .join("");
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#222;">
    <h2 style="color:#7a1220;margin:0 0 4px;">TERAVINO — Cuentas reasignadas por inactividad</h2>
    <p style="margin:0 0 16px;color:#666;">Hola ${escapeHtml(repName)}, estas cuentas se regresaron al pool por seguir sin actividad tras el aviso. Si quieres recuperarlas, coméntalo con tu administrador.</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0;">
      <thead><tr style="background:#f6f1ee;text-align:left;"><th style="padding:6px 10px;">Cuenta</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="color:#666;font-size:13px;margin-top:24px;">TERAVINO · CRM</p>
  </div>`;
}

function buildAdminSummary(
  items: { business_name: string; rep_id: string }[],
  reps: Map<string, { name: string; email: string | null }>,
): string {
  const rows = items
    .map(
      (a) => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;">${escapeHtml(a.business_name)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#666;">${escapeHtml(reps.get(a.rep_id)?.name ?? "—")}</td>
      </tr>`,
    )
    .join("");
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#222;">
    <h2 style="color:#7a1220;margin:0 0 4px;">TERAVINO — Reasignación por inactividad</h2>
    <p style="margin:0 0 16px;color:#666;">${items.length} ${items.length === 1 ? "cuenta regresó" : "cuentas regresaron"} al pool por inactividad. Ya puedes repartirlas desde "Asignar vendedor".</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0;">
      <thead><tr style="background:#f6f1ee;text-align:left;"><th style="padding:6px 10px;">Cuenta</th><th style="padding:6px 10px;">Vendedor anterior</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:24px 0;">
      <a href="${APP_URL}/cuentas/asignar-vendedor" style="display:inline-block;background:#7a1220;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 20px;border-radius:6px;">Asignar vendedor</a>
    </p>
    <p style="color:#666;font-size:13px;margin-top:24px;">TERAVINO · CRM</p>
  </div>`;
}
