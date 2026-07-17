// Datos del Tablero de KPIs (/tablero) — server-only. NO inventa cálculos:
// reutiliza las mismas fuentes y reglas que ya usan los módulos existentes:
//   - Ventas / venta bruta / base comisión → monthly_sales (como /ventas y /reportes)
//   - Cartera / vencido / suspendido       → v_account_balance + semaforoCobranza (como /cartera)
//   - Actividad / cuentas inactivas        → activities + v_account_last_activity (como Dashboard)
//   - Caída de compra                      → computeChurn (lib/churn.ts, tarjeta del Dashboard)
//   - Quiebre de stock                     → getAtRiskProductIds (lib/restock-data.ts)
// La definición de cada KPI vive en lib/kpis/definitions.ts y las metas en
// config/kpi-targets.ts.

import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { computeChurn } from "@/lib/churn";
import { semaforoCobranza } from "@/lib/cobranza";
import { getAtRiskProductIds } from "@/lib/restock-data";
import { SELLER_ROLES } from "@/lib/modules";
import type { AccountBalance } from "@/types/database";
import { monthISO, previousRange, type PeriodRange } from "./period";

type DbClient = ReturnType<typeof createClient>;

// PostgREST corta en 1000 filas por default; monthly_sales y activities ya lo
// superan, así que todo lo potencialmente largo se pagina con .range.
const PAGE = 1000;
async function selectAll<T>(
  make: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await make(from, from + PAGE - 1);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

// Orden canónico de regiones (las demás se agregan al final).
export const REGION_ORDER = [
  "Los Cabos",
  "Todos Santos",
  "La Paz",
  "Tijuana",
  "Puerto Vallarta",
  "Nayarit",
  "Sin región",
];

// ---------------------------------------------------------------------------
// Tipos de salida
// ---------------------------------------------------------------------------

export type MixSlice = { label: string; total: number; pct: number };

export type DireccionKpis = {
  ventaBruta: number;
  ventaBrutaPrev: number; // mismo largo de periodo, inmediatamente anterior
  baseComision: number;
  crecimientoMoM: number | null; // % último mes cargado vs su mes anterior
  ventaMesRef: number;
  ventaMesPrev: number;
  ticketPromedio: number;
  ticketPromedioPrev: number;
  cuentasActivas: number;
  cuentasConCompra: number;
  cuentasConCompraPrev: number;
  saldoPendiente: number;
  saldoVencido: number;
  pctVencido: number | null;
  dso: number | null;
  cuentasCaida: number; // churn fuerte: cayó o dejó de facturar
  cuentasReactivadas: number;
  productosRiesgo: number;
  mix: MixSlice[];
  pipeline: number;
  cerrado: number;
  conversion: number | null;
};

export type PendienteTipo = "inactiva" | "sin_pedido" | "siguiente_vencido";

export type PendienteItem = {
  tipo: PendienteTipo;
  accountId: string | null;
  nombre: string;
  detalle: string;
  /** Monto asociado (venta promedio o saldo) para ordenar por valor. */
  monto: number;
  /** 0 = más urgente. */
  severidad: number;
};

export type CuentaRef = { accountId: string; nombre: string; extra: string };

export type VendedorKpis = {
  repId: string;
  nombre: string;
  lastSeenAt: string | null;
  // Ventas
  ventaBruta: number;
  baseComision: number;
  pctDelTotal: number | null;
  ventaMesRef: number;
  ventaMesPrev: number;
  cuentasConCompra: number;
  ticketPromedio: number;
  // Actividad
  actividades: number;
  porTipo: { tipo: string; n: number }[];
  citasAgendadas: number;
  citasRealizadas: number;
  cumplimientoCitas: number | null; // %
  siguientesVencidos: number;
  cuentasActivas: number;
  cuentasConActividad30d: number;
  cobertura: number | null; // %
  // Cuentas en riesgo
  inactivas: CuentaRef[];
  inactivasTotal: number;
  sinPedido: CuentaRef[];
  sinPedidoTotal: number;
  cuentasVencidas: number;
  cuentasSuspendidas: number;
  montoVencido: number;
  prospectosSinGestion: CuentaRef[];
  // Lista accionable
  pendientes: PendienteItem[];
};

export type RegionKpis = {
  region: string;
  ventaBruta: number;
  pctDelTotal: number | null;
  ventaMesRef: number;
  ventaMesPrev: number;
  cuentasActivas: number;
  cuentasConCompra: number;
  penetracion: number | null; // %
  montoVencido: number;
  saldoPendiente: number;
  pctVencido: number | null;
  inactivas: number;
};

export type TableroData = {
  regionesDisponibles: string[];
  /** Último mes CONTPAQ cargado dentro del periodo (ancla del MoM y de "sin
   *  pedido este mes"; evita caídas falsas cuando el mes corriente aún no se
   *  importa). */
  mesRef: string | null;
  mesPrev: string | null;
  direccion: DireccionKpis;
  vendedores: VendedorKpis[];
  regiones: RegionKpis[];
};

// ---------------------------------------------------------------------------
// Filas crudas
// ---------------------------------------------------------------------------

type SaleRow = {
  id: string;
  account_id: string;
  sales_rep_id: string | null;
  period: string;
  venta_bruta: number | null;
  neto_desc: number | null;
};
type AccountRow = {
  id: string;
  business_name: string | null;
  region: string | null;
  status: string | null;
  assigned_rep_id: string | null;
};
type RepRow = { id: string; full_name: string; last_seen_at: string | null };
type ActivityRow = {
  sales_rep_id: string | null;
  account_id: string;
  activity_type: string | null;
  status: string;
  activity_date: string;
};
type NextStepRow = {
  sales_rep_id: string | null;
  account_id: string;
  next_step: string | null;
  next_step_date: string | null;
};
type LastActivityRow = {
  account_id: string;
  business_name: string | null;
  region: string | null;
  status: string | null;
  assigned_rep_id: string | null;
  last_activity_date: string | null;
};
type OrderRow = { total: number | null; sales_rep_id: string | null; account_id: string | null };
type ItemRow = { monthly_sale_id: string; codigo: string | null; total: number | null };
type ProductRow = { sku: string | null; codigo_contpaqi: string | null; category: string | null };

function prevMonthISO(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return monthISO(new Date(y, m - 2, 1));
}

function mixLabel(category: string | null | undefined): string {
  if (!category) return "Otros";
  if (category.startsWith("vino")) return "Vino";
  if (category === "cerveza") return "Cerveza";
  if (category === "espumoso") return "Espumosos";
  return "Otros";
}

// ---------------------------------------------------------------------------
// Carga + cálculo
// ---------------------------------------------------------------------------

export async function loadTablero(
  supabase: DbClient,
  opts: {
    range: PeriodRange;
    /** null = todas las regiones. */
    region: string | null;
    /** Rol con visión completa (admin/contador). Un vendedor solo genera su tarjeta. */
    fullView: boolean;
    /** Si !fullView, id del vendedor firmado. */
    selfRepId?: string | null;
  },
): Promise<TableroData> {
  const { range, region } = opts;
  const prev = previousRange(range);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  // Ventana de carga de ventas: cubre el periodo, su periodo espejo anterior y
  // 12 meses hacia atrás para la tendencia MoM y el churn.
  const twelveBack = monthISO(new Date(now.getFullYear(), now.getMonth() - 11, 1));
  const loadFrom = [prev.fromMonth, twelveBack, range.fromMonth].sort()[0];
  const d30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const finPeriodo = (() => {
    const [y, m] = range.toMonth.split("-").map(Number);
    return new Date(y, m, 1).toISOString(); // primer día del mes siguiente
  })();

  const [
    sales,
    accounts,
    repsRaw,
    balancesRes,
    lastActivity,
    activities,
    activities30dRes,
    nextStepsRes,
    pipelineRes,
    cerradoRes,
    items,
    products,
  ] = await Promise.all([
    selectAll<SaleRow>((from, to) =>
      supabase
        .from("monthly_sales")
        .select("id, account_id, sales_rep_id, period, venta_bruta, neto_desc")
        .gte("period", loadFrom)
        .range(from, to),
    ),
    selectAll<AccountRow>((from, to) =>
      supabase
        .from("accounts")
        .select("id, business_name, region, status, assigned_rep_id")
        .range(from, to),
    ),
    supabase
      .from("sales_reps")
      .select("id, full_name, last_seen_at")
      .eq("active", true)
      .in("role", SELLER_ROLES)
      .order("full_name"),
    supabase.from("v_account_balance").select("*"),
    selectAll<LastActivityRow>((from, to) =>
      supabase
        .from("v_account_last_activity")
        .select("account_id, business_name, region, status, assigned_rep_id, last_activity_date")
        .in("status", ["prospecto", "activo"])
        .range(from, to),
    ),
    selectAll<ActivityRow>((from, to) =>
      supabase
        .from("activities")
        .select("sales_rep_id, account_id, activity_type, status, activity_date")
        .gte("activity_date", `${range.fromMonth}T00:00:00`)
        .lt("activity_date", finPeriodo)
        .range(from, to),
    ),
    supabase
      .from("activities")
      .select("account_id")
      .gte("activity_date", d30)
      .limit(10000),
    supabase
      .from("activities")
      .select("sales_rep_id, account_id, next_step, next_step_date")
      .eq("next_step_done", false)
      .not("next_step_date", "is", null)
      .lt("next_step_date", today)
      .order("next_step_date", { ascending: true })
      .limit(2000),
    supabase
      .from("orders")
      .select("total, sales_rep_id, account_id")
      .eq("order_type", "cotizacion")
      .in("status", ["borrador", "enviada"])
      .limit(5000),
    supabase
      .from("orders")
      .select("total, sales_rep_id, account_id")
      .in("status", ["aceptada", "facturada", "entregada"])
      .gte("order_date", range.fromMonth)
      .lt("order_date", finPeriodo.slice(0, 10))
      .limit(5000),
    selectAll<ItemRow>((from, to) =>
      supabase
        .from("monthly_sales_items")
        .select("monthly_sale_id, codigo, total, monthly_sales!inner(period)")
        .gte("monthly_sales.period", range.fromMonth)
        .lte("monthly_sales.period", range.toMonth)
        .range(from, to),
    ),
    selectAll<ProductRow>((from, to) =>
      supabase.from("products").select("sku, codigo_contpaqi, category").range(from, to),
    ),
  ]);

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const regionOf = (accountId: string | null | undefined): string =>
    (accountId ? accountById.get(accountId)?.region : null) ?? "Sin región";
  const inRegion = (accountId: string | null | undefined): boolean =>
    !region || regionOf(accountId) === region;

  // Regiones disponibles (para el selector), en orden canónico.
  const regionSet = new Set<string>(accounts.map((a) => a.region ?? "Sin región"));
  const regionesDisponibles = [
    ...REGION_ORDER.filter((r) => regionSet.has(r)),
    ...[...regionSet].filter((r) => !REGION_ORDER.includes(r)).sort(),
  ];

  // Ventas filtradas por región (el resto de filtros se aplica por sub-rango).
  const salesR = region ? sales.filter((s) => inRegion(s.account_id)) : sales;
  const inRange = (p: string, from: string, to: string) => p >= from && p <= to;
  const salesPeriodo = salesR.filter((s) => inRange(s.period.slice(0, 10), range.fromMonth, range.toMonth));
  const salesPrev = salesR.filter((s) => inRange(s.period.slice(0, 10), prev.fromMonth, prev.toMonth));

  // Mes de referencia: último mes cargado dentro del periodo.
  const mesRef = salesPeriodo.length
    ? salesPeriodo.map((s) => s.period.slice(0, 10)).sort().at(-1)!
    : null;
  const mesPrev = mesRef ? prevMonthISO(mesRef) : null;

  const suma = (rows: SaleRow[], f: (s: SaleRow) => number) => rows.reduce((a, s) => a + f(s), 0);
  const bruta = (rows: SaleRow[]) => suma(rows, (s) => Number(s.venta_bruta ?? 0));

  const ventaBruta = bruta(salesPeriodo);
  const ventaBrutaPrev = bruta(salesPrev);
  const baseComision = suma(salesPeriodo, (s) => Number(s.neto_desc ?? 0));

  const salesMesRef = mesRef ? salesR.filter((s) => s.period.slice(0, 10) === mesRef) : [];
  const salesMesPrev = mesPrev ? salesR.filter((s) => s.period.slice(0, 10) === mesPrev) : [];
  const ventaMesRef = bruta(salesMesRef);
  const ventaMesPrev = bruta(salesMesPrev);
  const crecimientoMoM = ventaMesPrev > 0 ? ((ventaMesRef - ventaMesPrev) / ventaMesPrev) * 100 : null;

  const cuentasConCompra = new Set(salesPeriodo.map((s) => s.account_id)).size;
  const cuentasConCompraPrev = new Set(salesPrev.map((s) => s.account_id)).size;
  const ticketPromedio = cuentasConCompra ? ventaBruta / cuentasConCompra : 0;
  const ticketPromedioPrev = cuentasConCompraPrev ? ventaBrutaPrev / cuentasConCompraPrev : 0;

  const cuentasActivasList = accounts.filter(
    (a) => a.status === "activo" && (!region || (a.region ?? "Sin región") === region),
  );
  const cuentasActivas = cuentasActivasList.length;

  // Cartera (v_account_balance ya trae región y excluye socios del vencido).
  const balances = ((balancesRes.data ?? []) as AccountBalance[]).filter(
    (b) => !region || (b.region ?? "Sin región") === region,
  );
  const saldoPendiente = balances.reduce((s, b) => s + Number(b.saldo_pendiente ?? 0), 0);
  const saldoVencido = balances.reduce((s, b) => s + Number(b.saldo_vencido ?? 0), 0);
  const pctVencido = saldoPendiente > 0 ? (saldoVencido / saldoPendiente) * 100 : null;
  // DSO ≈ saldo pendiente / venta del periodo × días del periodo.
  const diasPeriodo = range.months * 30;
  const dso = ventaBruta > 0 ? (saldoPendiente / ventaBruta) * diasPeriodo : null;

  // Churn (caída) y reactivadas — sobre TODA la historia cargada (12m+).
  const allPeriods = [...new Set(salesR.map((s) => s.period.slice(0, 10)))].sort();
  const serieByAccount = new Map<string, { period: string; amount: number }[]>();
  for (const s of salesR) {
    const arr = serieByAccount.get(s.account_id) ?? [];
    arr.push({ period: s.period, amount: Number(s.venta_bruta ?? 0) });
    serieByAccount.set(s.account_id, arr);
  }
  let cuentasCaida = 0;
  let cuentasReactivadas = 0;
  const churnByAccount = new Map<string, ReturnType<typeof computeChurn>>();
  for (const [accountId, serie] of serieByAccount) {
    const acc = accountById.get(accountId);
    if (acc && acc.status && !["activo", "prospecto"].includes(acc.status)) continue;
    const churn = computeChurn(serie, allPeriods);
    churnByAccount.set(accountId, churn);
    if (churn.status === "cayo" || churn.status === "sin_facturacion") cuentasCaida += 1;
    if (mesRef && mesPrev) {
      const byP = new Map(serie.map((x) => [x.period.slice(0, 10), x.amount]));
      const refAmt = byP.get(mesRef) ?? 0;
      const prevAmt = byP.get(mesPrev) ?? 0;
      const hadBefore = serie.some((x) => x.period.slice(0, 10) < mesPrev && x.amount > 0);
      if (refAmt > 0 && prevAmt === 0 && hadBefore) cuentasReactivadas += 1;
    }
  }

  // Productos en riesgo de quiebre (modelo de /restock/sugerencias). Solo con
  // visión completa: el modelo lee inventario global.
  let productosRiesgo = 0;
  if (opts.fullView) {
    try {
      productosRiesgo = (await getAtRiskProductIds(supabase)).size;
    } catch {
      productosRiesgo = 0;
    }
  }

  // Mix de producto: renglones CONTPAQ → categoría del catálogo.
  const saleById = new Map(salesR.map((s) => [s.id, s]));
  const catByCode = new Map<string, string | null>();
  for (const p of products) {
    if (p.sku) catByCode.set(p.sku.trim(), p.category);
    if (p.codigo_contpaqi) catByCode.set(p.codigo_contpaqi.trim(), p.category);
  }
  const mixMap = new Map<string, number>();
  let mixTotal = 0;
  for (const it of items) {
    const sale = saleById.get(it.monthly_sale_id);
    if (!sale) continue; // fuera de la región filtrada
    const label = mixLabel(it.codigo ? catByCode.get(it.codigo.trim()) : null);
    const amt = Number(it.total ?? 0);
    mixMap.set(label, (mixMap.get(label) ?? 0) + amt);
    mixTotal += amt;
  }
  const mix: MixSlice[] = [...mixMap.entries()]
    .map(([label, total]) => ({ label, total, pct: mixTotal > 0 ? (total / mixTotal) * 100 : 0 }))
    .sort((a, b) => b.total - a.total);

  // Pipeline (cotizaciones abiertas) vs cerrado en el periodo.
  const pipelineRows = ((pipelineRes.data ?? []) as OrderRow[]).filter((o) => inRegion(o.account_id));
  const cerradoRows = ((cerradoRes.data ?? []) as OrderRow[]).filter((o) => inRegion(o.account_id));
  const pipeline = pipelineRows.reduce((s, o) => s + Number(o.total ?? 0), 0);
  const cerrado = cerradoRows.reduce((s, o) => s + Number(o.total ?? 0), 0);
  const conversion = pipeline + cerrado > 0 ? (cerrado / (pipeline + cerrado)) * 100 : null;

  const direccion: DireccionKpis = {
    ventaBruta,
    ventaBrutaPrev,
    baseComision,
    crecimientoMoM,
    ventaMesRef,
    ventaMesPrev,
    ticketPromedio,
    ticketPromedioPrev,
    cuentasActivas,
    cuentasConCompra,
    cuentasConCompraPrev,
    saldoPendiente,
    saldoVencido,
    pctVencido,
    dso,
    cuentasCaida,
    cuentasReactivadas,
    productosRiesgo,
    mix,
    pipeline,
    cerrado,
    conversion,
  };

  // -------------------------------------------------------------------------
  // NIVEL VENDEDOR
  // -------------------------------------------------------------------------
  const reps = ((repsRaw.data ?? []) as RepRow[]).filter(
    (r) => opts.fullView || r.id === opts.selfRepId,
  );

  const activitiesR = activities.filter((a) => inRegion(a.account_id));
  const acts30dAccounts = new Set(
    ((activities30dRes.data ?? []) as { account_id: string }[]).map((a) => a.account_id),
  );
  const nextSteps = ((nextStepsRes.data ?? []) as NextStepRow[]).filter((n) => inRegion(n.account_id));
  const lastActivityR = lastActivity.filter((l) => !region || (l.region ?? "Sin región") === region);

  const vendedores: VendedorKpis[] = reps.map((r) => {
    const mySales = salesPeriodo.filter((s) => s.sales_rep_id === r.id);
    const vb = bruta(mySales);
    const myMesRef = mesRef ? bruta(salesMesRef.filter((s) => s.sales_rep_id === r.id)) : 0;
    const myMesPrev = mesPrev ? bruta(salesMesPrev.filter((s) => s.sales_rep_id === r.id)) : 0;
    const myCuentas = new Set(mySales.map((s) => s.account_id)).size;

    const myActs = activitiesR.filter((a) => a.sales_rep_id === r.id);
    const porTipoMap = new Map<string, number>();
    for (const a of myActs) {
      const t = a.activity_type ?? "otro";
      porTipoMap.set(t, (porTipoMap.get(t) ?? 0) + 1);
    }
    const citasAgendadas = myActs.filter((a) => a.status === "agendada").length;
    const citasRealizadas = myActs.filter((a) => a.status === "realizada").length;
    // Cumplimiento: solo las agendadas cuya fecha ya pasó cuentan en contra.
    const agendadasPasadas = myActs.filter(
      (a) => a.status === "agendada" && a.activity_date.slice(0, 10) < today,
    ).length;
    const cumplimientoCitas =
      citasRealizadas + agendadasPasadas > 0
        ? (citasRealizadas / (citasRealizadas + agendadasPasadas)) * 100
        : null;

    const mySteps = nextSteps.filter((n) => n.sales_rep_id === r.id);

    const myAccounts = cuentasActivasList.filter((a) => a.assigned_rep_id === r.id);
    const conActividad30d = myAccounts.filter((a) => acts30dAccounts.has(a.id)).length;
    const cobertura = myAccounts.length ? (conActividad30d / myAccounts.length) * 100 : null;

    const myInactivas = lastActivityR
      .filter(
        (l) =>
          l.assigned_rep_id === r.id &&
          l.status === "activo" &&
          (!l.last_activity_date || new Date(l.last_activity_date).getTime() < now.getTime() - 30 * 86_400_000),
      )
      .sort((a, b) => (a.last_activity_date ?? "").localeCompare(b.last_activity_date ?? ""));

    // Sin pedido en el mes de referencia pero con compra el mes anterior.
    const sinPedido: (CuentaRef & { promedio: number })[] = [];
    if (mesRef && mesPrev) {
      const refIds = new Set(salesMesRef.map((s) => s.account_id));
      const prevMine = salesMesPrev.filter((s) => s.sales_rep_id === r.id);
      for (const s of prevMine) {
        if (refIds.has(s.account_id)) continue;
        const serie = serieByAccount.get(s.account_id) ?? [];
        // Promedio de sus últimos 3 meses con venta (lo que "solía" facturar).
        const conVenta = serie
          .filter((x) => x.amount > 0 && x.period.slice(0, 10) <= mesPrev)
          .sort((a, b) => a.period.localeCompare(b.period))
          .slice(-3);
        const promedio = conVenta.length
          ? conVenta.reduce((acc, x) => acc + x.amount, 0) / conVenta.length
          : Number(s.venta_bruta ?? 0);
        sinPedido.push({
          accountId: s.account_id,
          nombre: accountById.get(s.account_id)?.business_name ?? "—",
          extra: `facturaba ~${fmtMXN(promedio)}/mes`,
          promedio,
        });
      }
      sinPedido.sort((a, b) => b.promedio - a.promedio);
    }

    const myBalances = balances.filter((b) => b.assigned_rep_id === r.id);
    const vencidasList = myBalances.filter((b) => Number(b.saldo_vencido ?? 0) > 0);
    const suspendidas = myBalances.filter(
      (b) => semaforoCobranza(b.dias_vencido, b.saldo_pendiente).estado === "suspendido",
    ).length;
    const montoVencido = vencidasList.reduce((s, b) => s + Number(b.saldo_vencido ?? 0), 0);

    const prospectosSinGestion = lastActivityR
      .filter((l) => l.assigned_rep_id === r.id && l.status === "prospecto" && !l.last_activity_date)
      .map((l) => ({ accountId: l.account_id, nombre: l.business_name ?? "—", extra: "sin primera gestión" }));

    // Lista accionable: inactivas + sin pedido + siguientes vencidos, por
    // severidad (vencidos primero) y valor.
    const saldoByAccount = new Map(myBalances.map((b) => [b.account_id, Number(b.saldo_vencido ?? 0)]));
    const pendientes: PendienteItem[] = [
      ...mySteps.map((n) => ({
        tipo: "siguiente_vencido" as const,
        accountId: n.account_id,
        nombre: accountById.get(n.account_id)?.business_name ?? "—",
        detalle: `Siguiente vencido (${n.next_step_date ?? "—"}): ${n.next_step ?? "sin nota"}`,
        monto: saldoByAccount.get(n.account_id) ?? 0,
        severidad: 0,
      })),
      ...sinPedido.map((c) => ({
        tipo: "sin_pedido" as const,
        accountId: c.accountId,
        nombre: c.nombre,
        detalle: `Sin pedido este mes · ${c.extra}`,
        monto: c.promedio,
        severidad: 1,
      })),
      ...myInactivas.map((l) => {
        const dias = l.last_activity_date
          ? Math.floor((now.getTime() - new Date(l.last_activity_date).getTime()) / 86_400_000)
          : null;
        return {
          tipo: "inactiva" as const,
          accountId: l.account_id,
          nombre: l.business_name ?? "—",
          detalle: dias == null ? "Sin actividad registrada" : `Sin actividad hace ${dias} días`,
          monto: saldoByAccount.get(l.account_id) ?? 0,
          severidad: 2,
        };
      }),
    ]
      .sort((a, b) => a.severidad - b.severidad || b.monto - a.monto)
      .slice(0, 8);

    return {
      repId: r.id,
      nombre: r.full_name,
      lastSeenAt: r.last_seen_at,
      ventaBruta: vb,
      baseComision: suma(mySales, (s) => Number(s.neto_desc ?? 0)),
      pctDelTotal: ventaBruta > 0 ? (vb / ventaBruta) * 100 : null,
      ventaMesRef: myMesRef,
      ventaMesPrev: myMesPrev,
      cuentasConCompra: myCuentas,
      ticketPromedio: myCuentas ? vb / myCuentas : 0,
      actividades: myActs.length,
      porTipo: [...porTipoMap.entries()].map(([tipo, n]) => ({ tipo, n })).sort((a, b) => b.n - a.n),
      citasAgendadas,
      citasRealizadas,
      cumplimientoCitas,
      siguientesVencidos: mySteps.length,
      cuentasActivas: myAccounts.length,
      cuentasConActividad30d: conActividad30d,
      cobertura,
      inactivas: myInactivas.slice(0, 6).map((l) => ({
        accountId: l.account_id,
        nombre: l.business_name ?? "—",
        extra: l.last_activity_date
          ? `hace ${Math.floor((now.getTime() - new Date(l.last_activity_date).getTime()) / 86_400_000)} días`
          : "sin actividad alguna",
      })),
      inactivasTotal: myInactivas.length,
      sinPedido: sinPedido.slice(0, 6).map(({ accountId, nombre, extra }) => ({ accountId, nombre, extra })),
      sinPedidoTotal: sinPedido.length,
      cuentasVencidas: vencidasList.length,
      cuentasSuspendidas: suspendidas,
      montoVencido,
      prospectosSinGestion: prospectosSinGestion.slice(0, 6),
      pendientes,
    };
  });

  // Ordena por venta del periodo (los que venden más, primero).
  vendedores.sort((a, b) => b.ventaBruta - a.ventaBruta);

  // -------------------------------------------------------------------------
  // NIVEL REGIÓN (siempre sobre TODAS las regiones; el filtro de región aplica
  // a los otros dos niveles, aquí sirve de comparativa completa)
  // -------------------------------------------------------------------------
  const regiones: RegionKpis[] = regionesDisponibles.map((reg) => {
    const regSales = sales.filter(
      (s) =>
        regionOf(s.account_id) === reg &&
        inRange(s.period.slice(0, 10), range.fromMonth, range.toMonth),
    );
    const vb = bruta(regSales);
    const regMesRef = mesRef
      ? bruta(sales.filter((s) => regionOf(s.account_id) === reg && s.period.slice(0, 10) === mesRef))
      : 0;
    const regMesPrev = mesPrev
      ? bruta(sales.filter((s) => regionOf(s.account_id) === reg && s.period.slice(0, 10) === mesPrev))
      : 0;
    const activas = accounts.filter((a) => a.status === "activo" && (a.region ?? "Sin región") === reg).length;
    const conCompra = new Set(regSales.map((s) => s.account_id)).size;
    const regBalances = ((balancesRes.data ?? []) as AccountBalance[]).filter(
      (b) => (b.region ?? "Sin región") === reg,
    );
    const vencido = regBalances.reduce((s, b) => s + Number(b.saldo_vencido ?? 0), 0);
    const pendiente = regBalances.reduce((s, b) => s + Number(b.saldo_pendiente ?? 0), 0);
    const inactivas = lastActivity.filter(
      (l) =>
        (l.region ?? "Sin región") === reg &&
        l.status === "activo" &&
        (!l.last_activity_date || new Date(l.last_activity_date).getTime() < now.getTime() - 30 * 86_400_000),
    ).length;
    const totalGlobal = bruta(sales.filter((s) => inRange(s.period.slice(0, 10), range.fromMonth, range.toMonth)));
    return {
      region: reg,
      ventaBruta: vb,
      pctDelTotal: totalGlobal > 0 ? (vb / totalGlobal) * 100 : null,
      ventaMesRef: regMesRef,
      ventaMesPrev: regMesPrev,
      cuentasActivas: activas,
      cuentasConCompra: conCompra,
      penetracion: activas > 0 ? (conCompra / activas) * 100 : null,
      montoVencido: vencido,
      saldoPendiente: pendiente,
      pctVencido: pendiente > 0 ? (vencido / pendiente) * 100 : null,
      inactivas,
    };
  });

  return { regionesDisponibles, mesRef, mesPrev, direccion, vendedores, regiones };
}

function fmtMXN(n: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n);
}
