import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import { dateKeyTz } from "@/lib/utils";
import {
  comisionDeLineas,
  profileKeyFromName,
  type Linea,
  type ProfileKey,
  type ComisionResult,
} from "@/lib/comisiones";

const serviceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

// Querying from monthly_sales → monthly_sales_items so the rep/period
// filters sit on the root table (no embedded-filter ambiguity).
type SalesRow = {
  period: string;
  client_number: string | null;
  monthly_sales_items: Array<{
    codigo: string | null;
    producto_nombre: string | null;
    total: number;
    descuento: number;
  }>;
};

// Las cuentas de muestras (account_type = 'muestras': c58 y MUESTRAS por
// vendedor) no cuentan para comisiones, metas ni incentivos.
const NOT_MUESTRAS = "account_type.is.null,account_type.neq.muestras";

async function fetchLineas(repId: string | null, periods: string[]): Promise<Linea[]> {
  const db = serviceClient();
  let q = db
    .from("monthly_sales")
    .select("period, client_number, monthly_sales_items(codigo, producto_nombre, total, descuento), accounts!inner(account_type)")
    .in("period", periods)
    .or(NOT_MUESTRAS, { referencedTable: "accounts" });

  if (repId !== null) {
    q = q.eq("sales_rep_id", repId);
  }

  const { data } = await q.limit(5000);
  const rows = (data ?? []) as unknown as SalesRow[];

  return rows.flatMap((row) =>
    (row.monthly_sales_items ?? []).map((it) => ({
      codigo: it.codigo,
      nombre: it.producto_nombre,
      total: Number(it.total ?? 0),
      descuento: Number(it.descuento ?? 0),
      clientNumber: row.client_number,
      _period: row.period,
    })),
  );
}

/** Una query para múltiples reps — evita N queries al dashboard admin. */
async function fetchLineasForReps(repIds: string[], periods: string[]): Promise<(Linea & { _period: string; _repId: string })[]> {
  const db = serviceClient();
  const { data } = await db
    .from("monthly_sales")
    .select("period, client_number, sales_rep_id, monthly_sales_items(codigo, producto_nombre, total, descuento), accounts!inner(account_type)")
    .in("period", periods)
    .in("sales_rep_id", repIds)
    .or(NOT_MUESTRAS, { referencedTable: "accounts" })
    .limit(10000);
  const rows = (data ?? []) as unknown as (SalesRow & { sales_rep_id: string })[];
  return rows.flatMap((row) =>
    (row.monthly_sales_items ?? []).map((it) => ({
      codigo: it.codigo,
      nombre: it.producto_nombre,
      total: Number(it.total ?? 0),
      descuento: Number(it.descuento ?? 0),
      clientNumber: row.client_number,
      _period: row.period,
      _repId: row.sales_rep_id,
    })),
  );
}

const ZERO: ComisionResult = {
  ventaVino: 0, ventaCerveza: 0, baseVino: 0, baseCerveza: 0,
  comVino: 0, comCerveza: 0, comTotal: 0, ventaTotal: 0,
  lineasContadas: 0, lineasExcluidas: 0,
};

function calcComision(lineas: (Linea & { _period: string })[], period: string, profileKey: ProfileKey): ComisionResult {
  const forPeriod = lineas.filter((l) => l._period === period);
  if (!forPeriod.length) return ZERO;
  return comisionDeLineas(forPeriod, profileKey);
}

/** Mes en curso (hora de Los Cabos) como 'YYYY-MM-01'. */
function currentPeriodISO(): string {
  return `${dateKeyTz(new Date()).slice(0, 7)}-01`;
}

function prevPeriodISO(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export async function GET() {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "no auth" }, { status: 401 });

  const db = serviceClient();

  // La comisión estimada SIEMPRE es la del mes en curso: si todavía no se
  // suben las ventas CONTPAQ del mes, arranca en cero (antes se quedaba
  // mostrando el último mes cargado y parecía comisión vigente).
  const period = currentPeriodISO();
  const priorPeriod = prevPeriodISO(period);

  // ¿Ya se cargaron las ventas del mes en curso? (a nivel empresa, no del rep)
  const { count: loadedCount } = await db
    .from("monthly_sales")
    .select("id", { count: "exact", head: true })
    .eq("period", period);
  const periodLoaded = (loadedCount ?? 0) > 0;

  const periods = [period, priorPeriod];
  const myProfileKey = profileKeyFromName(rep.full_name);
  const isAdmin = rep.role === "admin";

  // Mes sin ventas cargadas: todo en cero, sin comparativos (no tiene caso
  // pedir las líneas del mes anterior para un mes que aún no existe).
  if (!periodLoaded) {
    return NextResponse.json({
      period,
      priorPeriod,
      periodLoaded,
      mine: myProfileKey ? { profileKey: myProfileKey, current: ZERO, prior: null } : null,
      team: null,
    });
  }

  // Sabrina: all lines regardless of rep (sabrinaAll — no exclusions, 4% todo)
  const myLineas = await fetchLineas(
    myProfileKey === "sabrina" ? null : rep.id,
    periods,
  ) as (Linea & { _period: string })[];

  const mine = myProfileKey
    ? {
        profileKey: myProfileKey,
        current: calcComision(myLineas, period, myProfileKey),
        prior: priorPeriod ? calcComision(myLineas, priorPeriod, myProfileKey) : null,
      }
    : null;

  // Admin: show each commissioning rep's estimates
  let team: Array<{
    repId: string;
    repName: string;
    profileKey: ProfileKey | null;
    current: ComisionResult;
    prior: ComisionResult | null;
  }> | null = null;

  if (isAdmin) {
    const { data: repsData } = await db
      .from("sales_reps")
      .select("id, full_name")
      .eq("active", true)
      .order("full_name");

    const reps = (repsData ?? []) as { id: string; full_name: string }[];
    const COMMISSION_REPS: ProfileKey[] = ["emmanuel", "citlali", "yamile", "andra", "felix"];
    const commReps = reps.filter((r) => {
      const pk = profileKeyFromName(r.full_name);
      return pk && COMMISSION_REPS.includes(pk);
    });

    // Una sola query para todas las líneas del equipo (antes era N queries en paralelo)
    const repIds = commReps.map((r) => r.id);
    const allTeamLineas = repIds.length
      ? (await fetchLineasForReps(repIds, periods))
      : [];

    team = commReps.map((r) => {
      const pk = profileKeyFromName(r.full_name)!;
      const lineas = allTeamLineas.filter((l) => l._repId === r.id) as (Linea & { _period: string })[];
      return {
        repId: r.id,
        repName: r.full_name,
        profileKey: pk,
        current: calcComision(lineas, period, pk),
        prior: priorPeriod ? calcComision(lineas, priorPeriod, pk) : null,
      };
    });
  }

  return NextResponse.json({ period, priorPeriod, periodLoaded, mine, team });
}
