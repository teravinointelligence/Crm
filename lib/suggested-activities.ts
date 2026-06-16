// Detecta los "pendientes" reales de la cartera de UN vendedor para alimentar
// las Sugerencias del dashboard. El CÓDIGO arma los hechos (cuentas sin
// contactos, sin actividad, prospectos por visitar, clientes que cayeron);
// el LLM (lib/anthropic.ts) solo elige/prioriza/redacta sobre esta lista.
// Todo va con el cliente RLS, así que el universo ya queda acotado al vendedor.

import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { loadChurnRanking } from "@/lib/account-intel";

type DbClient = ReturnType<typeof createClient>;

export type CandidateKind = "churn" | "prospecto" | "sin_actividad" | "sin_contactos";

export type ActivityCandidate = {
  account_id: string;
  business_name: string;
  region: string | null;
  kind: CandidateKind;
  detalle: string;
};

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

const STALE_DAYS = 30; // cliente activo sin actividad
const PROSPECT_DAYS = 14; // prospecto sin atención reciente
const PER_KIND_CAP = 8;
const TOTAL_CAP = 28; // tope del prompt al LLM

/** Pendientes de la cartera del vendedor `repId`, por prioridad. */
export async function loadActivityCandidates(
  supabase: DbClient,
  repId: string,
): Promise<ActivityCandidate[]> {
  // Universo: cuentas del vendedor (prospecto/activo) con su última actividad.
  const { data: univ } = await supabase
    .from("v_account_last_activity")
    .select("account_id, business_name, region, status, last_activity_date")
    .eq("assigned_rep_id", repId)
    .in("status", ["prospecto", "activo"]);
  const universe = (univ ?? []) as {
    account_id: string;
    business_name: string | null;
    region: string | null;
    status: string | null;
    last_activity_date: string | null;
  }[];
  if (!universe.length) return [];
  const ids = universe.map((u) => u.account_id);

  // Contactos por cuenta (para detectar cuentas sin ninguno).
  const { data: contactRows } = await supabase
    .from("contacts")
    .select("account_id")
    .in("account_id", ids);
  const contactCount = new Map<string, number>();
  for (const c of (contactRows ?? []) as { account_id: string }[]) {
    contactCount.set(c.account_id, (contactCount.get(c.account_id) ?? 0) + 1);
  }

  // Churn (clientes que cayeron), limitado a las cuentas del vendedor.
  const churnRanking = await loadChurnRanking(supabase);
  const churnById = new Map(
    churnRanking
      .filter((r) => ids.includes(r.account_id))
      .map((r) => [r.account_id, r.churn]),
  );

  const churn: ActivityCandidate[] = [];
  const prospecto: ActivityCandidate[] = [];
  const sinActividad: ActivityCandidate[] = [];
  const sinContactos: ActivityCandidate[] = [];

  for (const u of universe) {
    const base = {
      account_id: u.account_id,
      business_name: u.business_name ?? "(sin nombre)",
      region: u.region,
    };
    const days = daysSince(u.last_activity_date);

    const ch = churnById.get(u.account_id);
    if (ch && (ch.status === "cayo" || ch.status === "sin_facturacion")) {
      churn.push({ ...base, kind: "churn", detalle: ch.reason });
    }
    if ((contactCount.get(u.account_id) ?? 0) === 0) {
      sinContactos.push({ ...base, kind: "sin_contactos", detalle: "Sin contactos registrados" });
    }
    if (u.status === "prospecto") {
      if (days === null || days >= PROSPECT_DAYS) {
        prospecto.push({
          ...base,
          kind: "prospecto",
          detalle: days === null ? "Prospecto sin ninguna actividad" : `Prospecto, última actividad hace ${days} d`,
        });
      }
    } else if (days === null || days >= STALE_DAYS) {
      sinActividad.push({
        ...base,
        kind: "sin_actividad",
        detalle: days === null ? "Cliente sin actividad registrada" : `Sin actividad hace ${days} d`,
      });
    }
  }

  // Prioridad: reactivar > prospectos > completar contactos > sin actividad.
  const cap = (arr: ActivityCandidate[]) => arr.slice(0, PER_KIND_CAP);
  const merged = [...cap(churn), ...cap(prospecto), ...cap(sinContactos), ...cap(sinActividad)];

  // Una cuenta puede caer en varias categorías: deja solo la de mayor prioridad.
  const seen = new Set<string>();
  const out: ActivityCandidate[] = [];
  for (const c of merged) {
    if (seen.has(c.account_id)) continue;
    seen.add(c.account_id);
    out.push(c);
    if (out.length >= TOTAL_CAP) break;
  }
  return out;
}

/** A dónde lleva cada sugerencia al hacer clic. */
export function suggestionHref(kind: CandidateKind, accountId: string): string {
  if (kind === "sin_contactos") return `/cuentas/${accountId}?tab=contactos`;
  return `/actividades/nueva?estado=agendada&account=${accountId}`;
}
