// Generador de las tareas de seguimiento del vendedor. SERVER-ONLY.
//
// Corre a diario (ver app/api/cron/agenda-tareas). NO inventa nada: arma las
// tareas a partir de datos que el CRM ya tiene.
//
//   prospecto  → cuentas en estado 'prospecto' sin actividad ni factura en 14 días
//   cobranza   → cuentas con saldo vencido, priorizadas con el score de cobranza
//   inactivo   → clientes activos sin actividad ni factura en 15 días
//
// Reglas de convivencia, para que la agenda no se vuelva un basurero:
//  · Si ya hay una tarea PENDIENTE de esa regla para esa cuenta, se refresca
//    (detalle, prioridad) en vez de crear otra.
//  · Si ya se atendió esa regla+cuenta en este periodo (semana, o mes para
//    cobranza), no se vuelve a crear hasta el periodo siguiente.
//  · Si la cuenta dejó de cumplir la regla (ya pagó, ya la visitaron), la tarea
//    abierta se cierra sola como 'resuelta'.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import { SELLER_ROLES } from "@/lib/modules";
import { buildCobranzaRanking, type CobranzaInput } from "@/lib/cobranza-score";
import {
  INACTIVE_STALE_DAYS,
  PROSPECT_STALE_DAYS,
  cobranzaPriority,
  dedupeKey,
  inactivePriority,
  prospectPriority,
} from "@/lib/rep-tasks";
import { dateKeyTz } from "@/lib/utils";
import type { RepTaskSource } from "@/types/database";

type DbClient = ReturnType<typeof createClient> | SupabaseClient;

/** Tope de tareas NUEVAS por vendedor y por regla en cada corrida. */
const NEW_PER_SOURCE_CAP = 8;

type Candidate = {
  sales_rep_id: string;
  account_id: string;
  source: RepTaskSource;
  title: string;
  detail: string;
  priority: number;
  meta: Record<string, unknown>;
};

export type GenerateResult = {
  /** Día usado como `due_date` (hora de Mazatlán). */
  today: string;
  creadas: number;
  refrescadas: number;
  resueltas: number;
  /** Candidatos que no se crearon por el tope por vendedor/regla. */
  omitidas: number;
  porRegla: Record<RepTaskSource, number>;
  errores: string[];
};

function daysBetween(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((nowMs - t) / 86_400_000);
}

/**
 * PostgREST corta las respuestas en ~1000 filas. Aquí eso NO es cosmético: si
 * se truncara el historial de pagos, el perfil del cliente saldría mal y la
 * cobranza se priorizaría con datos incompletos. Por eso paginamos de verdad.
 */
async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  // Tope de seguridad: 50 páginas = 50k filas. Suficiente y evita bucles.
  for (let i = 0; i < 50; i++) {
    const from = i * pageSize;
    const { data } = await page(from, from + pageSize - 1);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

// --- Reglas ----------------------------------------------------------------

/** Prospectos y clientes inactivos: la vista combina actividades y facturas. */
async function candidatesFromActivity(
  supabase: DbClient,
  repIds: Set<string>,
  nowMs: number,
): Promise<Candidate[]> {
  const rows = await fetchAllRows<{
    account_id: string;
    business_name: string | null;
    status: string | null;
    assigned_rep_id: string | null;
    last_activity_date: string | null;
  }>((from, to) =>
    supabase
      .from("v_account_last_activity")
      .select("account_id, business_name, status, assigned_rep_id, last_activity_date")
      .in("status", ["prospecto", "activo"])
      .order("account_id")
      .range(from, to),
  );

  // La mayoría de las cuentas nunca ha tenido actividad ni factura. Si a
  // todas les diéramos la misma prioridad, el top de cada día saldría al azar.
  // Para esas usamos la antigüedad de la cuenta como reloj: la que lleva más
  // tiempo sin que nadie la toque es la más urgente. `activity_baseline_at` es
  // el mismo ancla que usa la reasignación por inactividad.
  const anchors = await fetchAllRows<{
    id: string;
    created_at: string | null;
    activity_baseline_at: string | null;
  }>((from, to) =>
    supabase
      .from("accounts")
      .select("id, created_at, activity_baseline_at")
      .order("id")
      .range(from, to),
  );
  const anchorById = new Map(
    anchors.map((a) => [a.id, a.activity_baseline_at ?? a.created_at]),
  );

  const out: Candidate[] = [];
  for (const r of rows) {
    if (!r.assigned_rep_id || !repIds.has(r.assigned_rep_id)) continue;
    const realDays = daysBetween(r.last_activity_date, nowMs);
    // Días "de abandono": desde la última actividad/factura o, si nunca hubo, desde
    // que la cuenta existe.
    const days = realDays ?? daysBetween(anchorById.get(r.account_id) ?? null, nowMs);
    const name = r.business_name ?? "(sin nombre)";
    const base = {
      sales_rep_id: r.assigned_rep_id,
      account_id: r.account_id,
      meta: {
        dias_sin_actividad: realDays,
        dias_desde_alta: realDays === null ? days : null,
        last_activity_date: r.last_activity_date,
      },
    };
    const desde =
      realDays !== null
        ? `hace ${realDays} días`
        : days !== null
          ? `desde que se dio de alta hace ${days} días`
          : "nunca";

    if (r.status === "prospecto") {
      if (days !== null && days < PROSPECT_STALE_DAYS) continue;
      out.push({
        ...base,
        source: "prospecto",
        title: `Seguir prospecto: ${name}`,
        detail:
          realDays !== null
            ? `Prospecto sin actividad ${desde}`
            : `Prospecto sin ninguna actividad registrada (${desde})`,
        priority: prospectPriority(days),
      });
    } else {
      if (days !== null && days < INACTIVE_STALE_DAYS) continue;
      out.push({
        ...base,
        source: "inactivo",
        title: `Reactivar a ${name}`,
        detail:
          realDays !== null
            ? `Sin actividad ${desde}`
            : `Cliente sin actividad registrada (${desde})`,
        priority: inactivePriority(days),
      });
    }
  }
  return out;
}

/** Cobranza: reusa el score explicable de /cartera/cobranza. */
async function candidatesFromCartera(
  supabase: DbClient,
  repIds: Set<string>,
): Promise<Candidate[]> {
  const balances = await fetchAllRows<{
    account_id: string;
    business_name: string | null;
    assigned_rep_id: string | null;
    saldo_vencido: number | null;
    saldo_pendiente: number | null;
    dias_vencido: number | null;
    total_facturado: number | null;
    total_pagado: number | null;
  }>((from, to) =>
    supabase
      .from("v_account_balance")
      .select(
        "account_id, business_name, assigned_rep_id, saldo_vencido, saldo_pendiente, dias_vencido, total_facturado, total_pagado",
      )
      .gt("saldo_vencido", 0)
      .order("account_id")
      .range(from, to),
  );

  const rows = balances.filter((b) => b.assigned_rep_id && repIds.has(b.assigned_rep_id));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.account_id);

  const [pays, contacts] = await Promise.all([
    fetchAllRows<{ account_id: string; payment_date: string }>((from, to) =>
      supabase
        .from("payments")
        .select("account_id, payment_date")
        .in("account_id", ids)
        .order("account_id")
        .range(from, to),
    ),
    // La tabla de contactos de cobranza puede no existir todavía → data null.
    fetchAllRows<{ account_id: string; created_at: string }>((from, to) =>
      supabase
        .from("collection_contacts")
        .select("account_id, created_at")
        .in("account_id", ids)
        .order("created_at", { ascending: false })
        .range(from, to),
    ),
  ]);

  const payCount = new Map<string, number>();
  const lastPay = new Map<string, string>();
  for (const p of pays) {
    payCount.set(p.account_id, (payCount.get(p.account_id) ?? 0) + 1);
    const prev = lastPay.get(p.account_id);
    if (!prev || p.payment_date > prev) lastPay.set(p.account_id, p.payment_date);
  }

  const lastContact = new Map<string, string>();
  for (const c of contacts) {
    const prev = lastContact.get(c.account_id);
    if (!prev || c.created_at > prev) lastContact.set(c.account_id, c.created_at);
  }

  const inputs: CobranzaInput[] = rows.map((b) => ({
    account_id: b.account_id,
    business_name: b.business_name ?? "(sin nombre)",
    client_number: null,
    assigned_rep_id: b.assigned_rep_id,
    saldo_vencido: b.saldo_vencido ?? 0,
    saldo_pendiente: b.saldo_pendiente ?? 0,
    dias_vencido: b.dias_vencido ?? 0,
    total_facturado: b.total_facturado ?? 0,
    total_pagado: b.total_pagado ?? 0,
    last_payment_date: lastPay.get(b.account_id) ?? null,
    payment_count: payCount.get(b.account_id) ?? 0,
    last_contact_at: lastContact.get(b.account_id) ?? null,
  }));

  return buildCobranzaRanking(inputs).map((r) => ({
    sales_rep_id: r.assigned_rep_id as string,
    account_id: r.account_id,
    source: "cobranza" as const,
    title: `Cobrar a ${r.business_name}`,
    detail: r.why,
    priority: cobranzaPriority(r.score),
    meta: {
      saldo_vencido: r.saldo_vencido,
      dias_vencido: r.dias_vencido,
      score: r.score,
      perfil: r.profile,
    },
  }));
}

// --- Orquestación ----------------------------------------------------------

/**
 * Genera/actualiza las tareas automáticas. Pensado para correr con
 * service-role (sin sesión), así que filtra por vendedor a mano.
 */
export async function generateRepTasks(
  supabase: DbClient,
  nowMs = Date.now(),
): Promise<GenerateResult> {
  const today = dateKeyTz(new Date(nowMs));
  const result: GenerateResult = {
    today,
    creadas: 0,
    refrescadas: 0,
    resueltas: 0,
    omitidas: 0,
    porRegla: { prospecto: 0, cobranza: 0, inactivo: 0, manual: 0 },
    errores: [],
  };

  const { data: repsData } = await supabase
    .from("sales_reps")
    .select("id")
    .eq("active", true)
    .in("role", SELLER_ROLES);
  const repIds = new Set(((repsData ?? []) as { id: string }[]).map((r) => r.id));
  if (!repIds.size) return result;

  const candidates = [
    ...(await candidatesFromActivity(supabase, repIds, nowMs)),
    ...(await candidatesFromCartera(supabase, repIds)),
  ];

  // Tareas automáticas todavía abiertas, para decidir refrescar vs crear.
  const openTasks = await fetchAllRows<{
    id: string;
    sales_rep_id: string;
    account_id: string | null;
    source: RepTaskSource;
    priority: number;
    detail: string | null;
  }>((from, to) =>
    supabase
      .from("rep_tasks")
      .select("id, sales_rep_id, account_id, source, priority, detail")
      .eq("status", "pendiente")
      .neq("source", "manual")
      .order("id")
      .range(from, to),
  );
  const openByKey = new Map(
    openTasks.map((t) => [`${t.source}:${t.sales_rep_id}:${t.account_id}`, t]),
  );

  const stillQualifies = new Set(
    candidates.map((c) => `${c.source}:${c.sales_rep_id}:${c.account_id}`),
  );

  // 1) Cerrar solas las que ya no aplican (pagó, la visitaron, cambió de estado).
  //    Solo se tocan las de vendedores vigentes: si alguien está dado de baja
  //    temporalmente, sus tareas se quedan como estaban en vez de darse por
  //    resueltas sin que nadie las haya visto.
  const staleIds = openTasks
    .filter(
      (t) =>
        repIds.has(t.sales_rep_id) &&
        !stillQualifies.has(`${t.source}:${t.sales_rep_id}:${t.account_id}`),
    )
    .map((t) => t.id);
  // En lotes: un `.in()` con cientos de uuid hace la URL demasiado larga.
  for (let i = 0; i < staleIds.length; i += 200) {
    const chunk = staleIds.slice(i, i + 200);
    const { error } = await supabase
      .from("rep_tasks")
      .update({
        status: "resuelta",
        result_note: "Se resolvió sin intervención: la cuenta ya no cumple la regla.",
        completed_at: new Date(nowMs).toISOString(),
      })
      .in("id", chunk);
    if (error) result.errores.push(`resolver: ${error.message}`);
    else result.resueltas += chunk.length;
  }

  // 2) Refrescar las abiertas que siguen aplicando (cambian días y montos).
  const toRefresh = candidates.filter((c) =>
    openByKey.has(`${c.source}:${c.sales_rep_id}:${c.account_id}`),
  );
  for (const c of toRefresh) {
    const open = openByKey.get(`${c.source}:${c.sales_rep_id}:${c.account_id}`)!;
    if (open.detail === c.detail && open.priority === c.priority) continue;
    const { error } = await supabase
      .from("rep_tasks")
      .update({ detail: c.detail, priority: c.priority, meta: c.meta })
      .eq("id", open.id);
    if (error) result.errores.push(`refrescar ${open.id}: ${error.message}`);
    else result.refrescadas++;
  }

  // 3) Crear las nuevas, respetando el tope por vendedor y regla.
  const fresh = candidates.filter(
    (c) => !openByKey.has(`${c.source}:${c.sales_rep_id}:${c.account_id}`),
  );
  fresh.sort((a, b) => b.priority - a.priority);

  const takenPerRepSource = new Map<string, number>();
  const rowsToInsert: Record<string, unknown>[] = [];
  for (const c of fresh) {
    const bucket = `${c.sales_rep_id}:${c.source}`;
    const taken = takenPerRepSource.get(bucket) ?? 0;
    if (taken >= NEW_PER_SOURCE_CAP) {
      result.omitidas++;
      continue;
    }
    takenPerRepSource.set(bucket, taken + 1);
    rowsToInsert.push({
      sales_rep_id: c.sales_rep_id,
      account_id: c.account_id,
      source: c.source,
      title: c.title,
      detail: c.detail,
      due_date: today,
      priority: c.priority,
      dedupe_key: dedupeKey(c.source, c.account_id, today),
      meta: c.meta,
    });
  }

  if (rowsToInsert.length) {
    // ignoreDuplicates: si ya se atendió esa regla+cuenta en este periodo, el
    // índice único (sales_rep_id, dedupe_key) la descarta sin error.
    const { data: inserted, error } = await supabase
      .from("rep_tasks")
      .upsert(rowsToInsert, {
        onConflict: "sales_rep_id,dedupe_key",
        ignoreDuplicates: true,
      })
      .select("id, source");
    if (error) {
      result.errores.push(`crear: ${error.message}`);
    } else {
      for (const row of (inserted ?? []) as { source: RepTaskSource }[]) {
        result.creadas++;
        result.porRegla[row.source]++;
      }
    }
  }

  return result;
}
