import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCurrentRep } from "@/lib/auth";
import {
  comisionDeLineas,
  profileKeyFromName,
  PROFILES,
  type Linea,
  type ProfileKey,
  type ComisionResult,
} from "@/lib/comisiones";

const serviceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

type ItemRow = {
  codigo: string | null;
  producto_nombre: string | null;
  total: number;
  descuento: number;
  monthly_sales: {
    period: string;
    client_number: string | null;
    sales_rep_id: string | null;
  } | null;
};

async function fetchItems(repId: string | null, periods: string[]): Promise<ItemRow[]> {
  const db = serviceClient();
  let q = db
    .from("monthly_sales_items")
    .select("codigo, producto_nombre, total, descuento, monthly_sales!monthly_sale_id(period, client_number, sales_rep_id)")
    .in("monthly_sales.period", periods);

  if (repId !== null) {
    q = q.eq("monthly_sales.sales_rep_id", repId);
  }

  const { data } = await q.limit(20000);
  return (data ?? []) as unknown as ItemRow[];
}

function toLineas(items: ItemRow[], period: string): Linea[] {
  return items
    .filter((it) => it.monthly_sales?.period === period)
    .map((it) => ({
      codigo: it.codigo,
      nombre: it.producto_nombre,
      total: Number(it.total ?? 0),
      descuento: Number(it.descuento ?? 0),
      clientNumber: it.monthly_sales?.client_number ?? null,
    }));
}

function calcComision(items: ItemRow[], period: string, profileKey: ProfileKey): ComisionResult {
  const lineas = toLineas(items, period);
  if (!lineas.length) {
    return {
      ventaVino: 0, ventaCerveza: 0, baseVino: 0, baseCerveza: 0,
      comVino: 0, comCerveza: 0, comTotal: 0, ventaTotal: 0,
      lineasContadas: 0, lineasExcluidas: 0,
    };
  }
  return comisionDeLineas(lineas, profileKey);
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

  // For Sabrina (admin): all items regardless of rep (sabrinaAll + no exclusions)
  // For reps: only their own items (service role query filtered by sales_rep_id)
  const myItems = await fetchItems(
    myProfileKey === "sabrina" ? null : rep.id,
    periods,
  );

  const mine = myProfileKey
    ? {
        profileKey: myProfileKey,
        current: calcComision(myItems, period, myProfileKey),
        prior: priorPeriod ? calcComision(myItems, priorPeriod, myProfileKey) : null,
      }
    : null;

  // Admin view: show each rep's commission
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
          const items = await fetchItems(r.id, periods);
          return {
            repId: r.id,
            repName: r.full_name,
            profileKey: pk,
            current: calcComision(items, period, pk),
            prior: priorPeriod ? calcComision(items, priorPeriod, pk) : null,
          };
        }),
    );
  }

  return NextResponse.json({ period, priorPeriod, mine, team });
}
