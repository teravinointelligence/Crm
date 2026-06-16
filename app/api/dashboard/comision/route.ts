import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
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

async function fetchLineas(repId: string | null, periods: string[]): Promise<Linea[]> {
  const db = serviceClient();
  let q = db
    .from("monthly_sales")
    .select("period, client_number, monthly_sales_items(codigo, producto_nombre, total, descuento)")
    .in("period", periods);

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

export async function GET() {
  const rep = await getCurrentRep();
  if (!rep) return NextResponse.json({ error: "no auth" }, { status: 401 });

  const db = serviceClient();

  // Get 2 most recent periods
  const { data: periodRows } = await db
    .from("monthly_sales")
    .select("period")
    .order("period", { ascending: false })
    .limit(500);
  const allPeriods = [...new Set((periodRows ?? []).map((r) => r.period as string))];
  const period = allPeriods[0] ?? null;
  const priorPeriod = allPeriods[1] ?? null;

  if (!period) {
    return NextResponse.json({ period: null, priorPeriod: null, mine: null, team: null });
  }

  const periods = [period, ...(priorPeriod ? [priorPeriod] : [])];
  const myProfileKey = profileKeyFromName(rep.full_name);
  const isAdmin = rep.role === "admin";

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

    team = await Promise.all(
      reps
        .filter((r) => {
          const pk = profileKeyFromName(r.full_name);
          return pk && COMMISSION_REPS.includes(pk);
        })
        .map(async (r) => {
          const pk = profileKeyFromName(r.full_name)!;
          const lineas = await fetchLineas(r.id, periods) as (Linea & { _period: string })[];
          return {
            repId: r.id,
            repName: r.full_name,
            profileKey: pk,
            current: calcComision(lineas, period, pk),
            prior: priorPeriod ? calcComision(lineas, priorPeriod, pk) : null,
          };
        }),
    );
  }

  return NextResponse.json({ period, priorPeriod, mine, team });
}
