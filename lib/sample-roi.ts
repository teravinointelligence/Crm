import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_SAMPLE_ROI_SETTINGS,
  dynamicSampleLimit,
  type SampleRoiSettings,
} from "@/lib/sample-roi-rules";

export { DEFAULT_SAMPLE_ROI_SETTINGS, dynamicSampleLimit } from "@/lib/sample-roi-rules";
export type { SampleRoiSettings } from "@/lib/sample-roi-rules";

export type SampleOutcome = "vendida" | "encartada" | "interesado" | "contactado" | "sin_interes" | "en_el_aire" | "pendiente";

export type SampleRoiRow = {
  id: string;
  sourceType: "bank_take" | "direct_request";
  repId: string;
  repName: string;
  accountId: string;
  accountName: string;
  productId: string;
  productName: string;
  sampleDate: string;
  quantity: number;
  investment: number;
  costEstimated: boolean;
  followUpStatus: string;
  followUpNotes: string | null;
  nextFollowUpDate: string | null;
  outcome: SampleOutcome;
  revenue: number;
  daysOpen: number;
};

export type SampleRoiRep = {
  repId: string;
  repName: string;
  events: number;
  bottles: number;
  investment: number;
  estimatedInvestment: number;
  opportunities: number;
  converted: number;
  sold: number;
  followed: number;
  inTheAir: number;
  conversionPct: number;
  followUpPct: number;
  revenue: number;
  roi: number;
  currentLimit: number;
};

type RawEvent = {
  id: string;
  source_type: "bank_take" | "direct_request";
  source_id: string;
  product_id: string;
  account_id: string;
  sales_rep_id: string;
  sample_date: string;
  quantity: number | string;
  sample_cost: number | string;
  cost_estimated: boolean;
  follow_up_status: string;
  follow_up_notes: string | null;
  next_follow_up_date: string | null;
  rep: { full_name: string | null } | null;
  account: { business_name: string | null } | null;
  product: { name: string; sku: string | null; codigo_contpaqi: string | null } | null;
};

type RawSale = {
  account_id: string;
  period: string;
  monthly_sales_items: Array<{
    codigo: string | null;
    neto_desc: number | string | null;
    total: number | string | null;
  }> | null;
};

type RawEncarte = {
  account_id: string;
  product_id: string;
  status: string;
  since: string | null;
  created_at: string | null;
};

function dayDiff(from: string, to = new Date()) {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor((to.getTime() - start) / 86_400_000));
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function monthKey(date: string) {
  return date.slice(0, 7);
}

export async function loadSampleRoi(): Promise<{
  settings: SampleRoiSettings;
  rows: SampleRoiRow[];
  reps: SampleRoiRep[];
}> {
  const supabase = createClient();
  const settingsRes = await supabase.from("sample_conversion_settings").select("*").eq("id", true).maybeSingle();
  const settings = settingsRes.data
    ? {
        analysis_days: Number(settingsRes.data.analysis_days),
        followup_days: Number(settingsRes.data.followup_days),
        conversion_days: Number(settingsRes.data.conversion_days),
        client_window_days: Number(settingsRes.data.client_window_days),
        min_opportunities: Number(settingsRes.data.min_opportunities),
        base_limit: Number(settingsRes.data.base_limit),
        medium_limit: Number(settingsRes.data.medium_limit),
        low_limit: Number(settingsRes.data.low_limit),
        medium_conversion_pct: Number(settingsRes.data.medium_conversion_pct),
        low_conversion_pct: Number(settingsRes.data.low_conversion_pct),
        medium_roi: Number(settingsRes.data.medium_roi),
        low_roi: Number(settingsRes.data.low_roi),
      }
    : DEFAULT_SAMPLE_ROI_SETTINGS;

  const since = new Date(Date.now() - settings.analysis_days * 86_400_000).toISOString().slice(0, 10);
  const eventRes = await supabase
    .from("sample_conversion_events")
    .select(
      "id, source_type, source_id, product_id, account_id, sales_rep_id, sample_date, quantity, sample_cost, cost_estimated, follow_up_status, follow_up_notes, next_follow_up_date, rep:sales_rep_id(full_name), account:account_id(business_name), product:product_id(name, sku, codigo_contpaqi)",
    )
    .gte("sample_date", since)
    .order("sample_date", { ascending: false })
    .limit(5000);
  const events = ((eventRes.data ?? []) as unknown) as RawEvent[];
  if (!events.length) return { settings, rows: [], reps: [] };

  const accountIds = [...new Set(events.map((event) => event.account_id))];
  const productIds = [...new Set(events.map((event) => event.product_id))];
  const [salesRes, encartesRes] = await Promise.all([
    supabase
      .from("monthly_sales")
      .select("account_id, period, monthly_sales_items(codigo, neto_desc, total)")
      .in("account_id", accountIds)
      .gte("period", `${monthKey(since)}-01`)
      .limit(5000),
    supabase
      .from("account_products")
      .select("account_id, product_id, status, since, created_at")
      .in("account_id", accountIds)
      .in("product_id", productIds)
      .eq("status", "encartado")
      .limit(5000),
  ]);

  const sales = ((salesRes.data ?? []) as unknown) as RawSale[];
  const encartes = ((encartesRes.data ?? []) as unknown) as RawEncarte[];
  const encarteByPair = new Map<string, string>();
  for (const encarte of encartes) {
    const date = encarte.since ?? encarte.created_at?.slice(0, 10);
    if (date) encarteByPair.set(`${encarte.account_id}|${encarte.product_id}`, date);
  }

  const saleLines = sales.flatMap((sale) =>
    (sale.monthly_sales_items ?? []).map((item) => ({
      accountId: sale.account_id,
      period: sale.period,
      code: item.codigo,
      revenue: Number(item.neto_desc ?? item.total ?? 0),
    })),
  );

  // Solo la primera muestra de cada vendedor para un cliente × vino recibe el
  // ingreso, evitando duplicar retorno si se entregó el mismo vino varias veces.
  const chronological = [...events].sort((a, b) => a.sample_date.localeCompare(b.sample_date));
  const firstEvent = new Set<string>();
  const rows = chronological.map((event): SampleRoiRow => {
    const pair = `${event.account_id}|${event.product_id}`;
    const attributionPair = `${event.sales_rep_id}|${pair}`;
    const isFirst = !firstEvent.has(attributionPair);
    firstEvent.add(attributionPair);
    const conversionEnd = addDays(event.sample_date, settings.conversion_days);
    const productCodes = new Set([event.product?.sku, event.product?.codigo_contpaqi].filter(Boolean));
    const revenue = isFirst
      ? saleLines
          .filter(
            (line) =>
              line.accountId === event.account_id &&
              line.code != null &&
              productCodes.has(line.code) &&
              monthKey(line.period) >= monthKey(event.sample_date) &&
              monthKey(line.period) <= monthKey(conversionEnd),
          )
          .reduce((sum, line) => sum + line.revenue, 0)
      : 0;
    const encarteDate = encarteByPair.get(pair);
    const encarted = Boolean(
      encarteDate && encarteDate >= event.sample_date && encarteDate <= conversionEnd,
    );
    const daysOpen = dayDiff(event.sample_date);
    const outcome: SampleOutcome = revenue > 0
      ? "vendida"
      : encarted
        ? "encartada"
        : event.follow_up_status === "sin_interes"
          ? "sin_interes"
          : event.follow_up_status === "interesado"
            ? "interesado"
            : event.follow_up_status === "contactado"
              ? "contactado"
              : daysOpen > settings.followup_days
                ? "en_el_aire"
                : "pendiente";
    return {
      id: event.id,
      sourceType: event.source_type,
      repId: event.sales_rep_id,
      repName: event.rep?.full_name ?? "—",
      accountId: event.account_id,
      accountName: event.account?.business_name ?? "—",
      productId: event.product_id,
      productName: event.product?.name ?? "—",
      sampleDate: event.sample_date,
      quantity: Number(event.quantity),
      investment: Number(event.sample_cost),
      costEstimated: event.cost_estimated,
      followUpStatus: event.follow_up_status,
      followUpNotes: event.follow_up_notes,
      nextFollowUpDate: event.next_follow_up_date,
      outcome,
      revenue,
      daysOpen,
    };
  }).sort((a, b) => b.sampleDate.localeCompare(a.sampleDate));

  const grouped = new Map<string, SampleRoiRep & { maturePairs: Set<string> }>();
  for (const row of [...rows].sort((a, b) => a.sampleDate.localeCompare(b.sampleDate))) {
    const current = grouped.get(row.repId) ?? {
      repId: row.repId,
      repName: row.repName,
      events: 0,
      bottles: 0,
      investment: 0,
      estimatedInvestment: 0,
      opportunities: 0,
      converted: 0,
      sold: 0,
      followed: 0,
      inTheAir: 0,
      conversionPct: 0,
      followUpPct: 0,
      revenue: 0,
      roi: 0,
      currentLimit: settings.base_limit,
      maturePairs: new Set<string>(),
    };
    current.events += 1;
    current.bottles += row.quantity;
    current.investment += row.investment;
    if (row.costEstimated) current.estimatedInvestment += row.investment;
    current.revenue += row.revenue;
    if (row.outcome !== "pendiente" && row.outcome !== "en_el_aire") current.followed += 1;
    if (row.outcome === "en_el_aire") current.inTheAir += 1;
    const pair = `${row.accountId}|${row.productId}`;
    if (row.daysOpen >= settings.followup_days && !current.maturePairs.has(pair)) {
      current.maturePairs.add(pair);
      current.opportunities += 1;
      if (row.outcome === "vendida" || row.outcome === "encartada") current.converted += 1;
      if (row.outcome === "vendida") current.sold += 1;
    }
    grouped.set(row.repId, current);
  }

  const reps = [...grouped.values()].map(({ maturePairs: _maturePairs, ...rep }) => {
    rep.conversionPct = rep.opportunities ? (rep.converted / rep.opportunities) * 100 : 0;
    rep.followUpPct = rep.events ? (rep.followed / rep.events) * 100 : 0;
    rep.roi = rep.investment ? rep.revenue / rep.investment : 0;
    rep.currentLimit = dynamicSampleLimit(rep.opportunities, rep.conversionPct, rep.roi, settings);
    return rep;
  }).sort((a, b) => b.roi - a.roi);

  return { settings, rows, reps };
}
