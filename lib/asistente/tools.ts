// Catálogo ACOTADO de tools del asistente. Cada una es una consulta predefinida
// y de solo lectura; el LLM elige cuál y con qué parámetros, el servidor la
// ejecuta con el cliente de la SESIÓN (RLS → permisos por rol). Las cifras
// salen de aquí, nunca del modelo. Reusa las libs de las fases previas.

import "server-only";
import type { ToolContext, ToolDef, ToolResult, ToolRow } from "./types";
import { ownScope, applyOwnScope } from "./scope";
import { productDeclines, type PeriodUnits } from "./analytics";
import { buildCobranzaRanking, type CobranzaInput } from "@/lib/cobranza-score";
import { loadChurnRanking, loadCrossSell } from "@/lib/account-intel";
import { getRestockSuggestions } from "@/lib/restock-data";
import { CHURN_LABEL } from "@/lib/churn";
import { URGENCY_LABEL } from "@/lib/restock";

const REGIONS = ["Los Cabos", "La Paz", "Todos Santos", "Tijuana", "Puerto Vallarta", "Nayarit"];
const TYPES = ["hotel", "restaurante", "bar", "cafe", "club", "tienda", "distribuidor", "otro"];
const STATUSES = ["prospecto", "activo", "inactivo", "perdido"];

const clampLimit = (v: unknown, def = 10, max = 50) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : def;
};
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);
const daysSince = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);

// Un vendedor (rol no admin/contador) solo puede consultar SUS cuentas. La RLS
// ya lo garantiza; el candado explícito (lib/asistente/scope) es defensa en
// profundidad para esta superficie de lenguaje natural (el LLM arma consultas).
async function findAccount(ctx: ToolContext, query: string) {
  const q = query.trim();
  if (!q) return null;
  const base = () =>
    applyOwnScope(ctx.supabase.from("accounts").select("id, business_name, client_number, rfc"), ctx);
  let res = await base().eq("client_number", q).limit(1);
  if (res.data?.length) return res.data[0];
  res = await base().ilike("business_name", `%${q}%`).limit(1);
  return res.data?.[0] ?? null;
}

async function repNameMap(ctx: ToolContext) {
  const { data } = await ctx.supabase.from("sales_reps").select("id, full_name");
  return new Map((data ?? []).map((r) => [r.id as string, r.full_name as string]));
}

// ---------------------------------------------------------------------------

export const TOOLS: ToolDef[] = [
  // 1 ─ Cartera vencida
  {
    name: "cartera_cuentas_vencidas",
    description:
      "Lista cuentas con saldo VENCIDO. Filtra por región, mínimo de días vencidos y mínimo de saldo. " +
      "Úsala para '¿qué cuentas de X llevan N+ días vencidas y cuánto deben?'.",
    input_schema: {
      type: "object",
      properties: {
        region: { type: "string", enum: REGIONS },
        dias_min: { type: "integer", description: "Mínimo de días vencidos (ej. 60)" },
        saldo_min: { type: "number", description: "Saldo vencido mínimo en MXN" },
        limit: { type: "integer" },
      },
    },
    async run(ctx, p): Promise<ToolResult> {
      let q = ctx.supabase
        .from("v_account_balance")
        .select("account_id, business_name, region, saldo_vencido, dias_vencido")
        .gt("saldo_vencido", 0)
        .order("saldo_vencido", { ascending: false });
      q = applyOwnScope(q, ctx);
      if (str(p.region)) q = q.eq("region", str(p.region));
      if (num(p.dias_min) != null) q = q.gte("dias_vencido", num(p.dias_min)!);
      if (num(p.saldo_min) != null) q = q.gte("saldo_vencido", num(p.saldo_min)!);
      const { data } = await q.limit(clampLimit(p.limit, 15));
      const rows = (data ?? []) as ToolRow[];
      const totalVencido = rows.reduce((s, r) => s + Number(r.saldo_vencido ?? 0), 0);
      return {
        tool: "cartera_cuentas_vencidas",
        title: "Cuentas con saldo vencido",
        columns: [
          { key: "business_name", label: "Cuenta" },
          { key: "region", label: "Región" },
          { key: "dias_vencido", label: "Días", kind: "number" },
          { key: "saldo_vencido", label: "Saldo vencido", kind: "money" },
        ],
        rows,
        total: `${rows.length} cuenta(s) · vencido $${totalVencido.toLocaleString("es-MX")}`,
        link: { href: "/cartera", label: "Ver cartera" },
      };
    },
  },

  // 2 ─ Resumen de cartera
  {
    name: "cartera_resumen",
    description: "Totales de cartera (facturado, pagado, pendiente, vencido) de las cuentas visibles, opcionalmente por región.",
    input_schema: { type: "object", properties: { region: { type: "string", enum: REGIONS } } },
    async run(ctx, p): Promise<ToolResult> {
      let q = ctx.supabase.from("v_account_balance").select("total_facturado, total_pagado, saldo_pendiente, saldo_vencido");
      q = applyOwnScope(q, ctx);
      if (str(p.region)) q = q.eq("region", str(p.region));
      const { data } = await q;
      const acc = (data ?? []).reduce(
        (s, b) => ({
          fact: s.fact + Number(b.total_facturado ?? 0),
          pag: s.pag + Number(b.total_pagado ?? 0),
          pend: s.pend + Number(b.saldo_pendiente ?? 0),
          venc: s.venc + Number(b.saldo_vencido ?? 0),
          n: s.n + (Number(b.total_facturado ?? 0) > 0 ? 1 : 0),
        }),
        { fact: 0, pag: 0, pend: 0, venc: 0, n: 0 },
      );
      return {
        tool: "cartera_resumen",
        title: `Resumen de cartera${str(p.region) ? ` — ${str(p.region)}` : ""}`,
        columns: [
          { key: "concepto", label: "Concepto" },
          { key: "monto", label: "Monto", kind: "money" },
        ],
        rows: [
          { concepto: "Facturado", monto: acc.fact },
          { concepto: "Pagado", monto: acc.pag },
          { concepto: "Pendiente", monto: acc.pend },
          { concepto: "Vencido", monto: acc.venc },
        ],
        total: `${acc.n} cuenta(s) con facturación`,
        link: { href: "/cartera", label: "Ver cartera" },
      };
    },
  },

  // 3 ─ Prioridad de cobranza (Fase 1)
  {
    name: "cobranza_prioridad",
    adminOnly: true,
    description: "Top cuentas a cobrar HOY, priorizadas por score (monto vencido, días, historial de pago y contacto reciente).",
    input_schema: { type: "object", properties: { limit: { type: "integer" } } },
    async run(ctx, p): Promise<ToolResult> {
      const { data: bal } = await ctx.supabase
        .from("v_account_balance")
        .select("account_id, business_name, assigned_rep_id, saldo_vencido, saldo_pendiente, dias_vencido, total_facturado, total_pagado")
        .gt("saldo_vencido", 0);
      const ids = (bal ?? []).map((b) => b.account_id);
      const [{ data: pays }, contactsRes] = await Promise.all([
        ctx.supabase.from("payments").select("account_id, payment_date").in("account_id", ids.length ? ids : ["-"]),
        ctx.supabase.from("collection_contacts").select("account_id, created_at").in("account_id", ids.length ? ids : ["-"]).order("created_at", { ascending: false }),
      ]);
      const payCount = new Map<string, number>(), lastPay = new Map<string, string>(), lastContact = new Map<string, string>();
      for (const x of (pays ?? []) as { account_id: string; payment_date: string }[]) {
        payCount.set(x.account_id, (payCount.get(x.account_id) ?? 0) + 1);
        if (!lastPay.get(x.account_id) || x.payment_date > lastPay.get(x.account_id)!) lastPay.set(x.account_id, x.payment_date);
      }
      for (const c of (contactsRes.data ?? []) as { account_id: string; created_at: string }[]) if (!lastContact.has(c.account_id)) lastContact.set(c.account_id, c.created_at);
      const inputs: CobranzaInput[] = (bal ?? []).map((b) => ({
        account_id: b.account_id, business_name: b.business_name ?? "(sin nombre)", client_number: null, assigned_rep_id: b.assigned_rep_id ?? null,
        saldo_vencido: b.saldo_vencido ?? 0, saldo_pendiente: b.saldo_pendiente ?? 0, dias_vencido: b.dias_vencido ?? 0,
        total_facturado: b.total_facturado ?? 0, total_pagado: b.total_pagado ?? 0,
        last_payment_date: lastPay.get(b.account_id) ?? null, payment_count: payCount.get(b.account_id) ?? 0, last_contact_at: lastContact.get(b.account_id) ?? null,
      }));
      const ranked = buildCobranzaRanking(inputs).slice(0, clampLimit(p.limit, 10));
      return {
        tool: "cobranza_prioridad",
        title: "Prioridad de cobranza de hoy",
        columns: [
          { key: "business_name", label: "Cuenta" },
          { key: "score", label: "Score", kind: "number" },
          { key: "saldo_vencido", label: "Vencido", kind: "money" },
          { key: "dias_vencido", label: "Días", kind: "number" },
          { key: "why", label: "Por qué" },
        ],
        rows: ranked.map((r) => ({ business_name: r.business_name, score: r.score, saldo_vencido: r.saldo_vencido, dias_vencido: r.dias_vencido, why: r.why })),
        total: `${ranked.length} cuenta(s)`,
        link: { href: "/cartera/cobranza", label: "Cobranza de hoy" },
      };
    },
  },

  // 4 ─ Estado de cuenta de un cliente
  {
    name: "cuenta_estado_cuenta",
    description: "Estado de cuenta de UN cliente (busca por nombre o # de cliente): facturas con saldo y totales.",
    input_schema: { type: "object", properties: { cuenta: { type: "string", description: "Nombre o # de cliente" } }, required: ["cuenta"] },
    async run(ctx, p): Promise<ToolResult> {
      const acct = await findAccount(ctx, str(p.cuenta));
      if (!acct) return emptyNote("cuenta_estado_cuenta", "Estado de cuenta", `No encontré la cuenta "${str(p.cuenta)}".`);
      const [{ data: invoices }, { data: bal }] = await Promise.all([
        ctx.supabase.from("invoices").select("invoice_number, due_date, balance").eq("account_id", acct.id).neq("status", "cancelada").gt("balance", 0).order("due_date"),
        ctx.supabase.from("v_account_balance").select("saldo_pendiente, saldo_vencido").eq("account_id", acct.id).maybeSingle(),
      ]);
      return {
        tool: "cuenta_estado_cuenta",
        title: `Estado de cuenta — ${acct.business_name}`,
        columns: [
          { key: "invoice_number", label: "Folio" },
          { key: "due_date", label: "Vence", kind: "date" },
          { key: "balance", label: "Saldo", kind: "money" },
        ],
        rows: (invoices ?? []) as ToolRow[],
        total: `Pendiente $${Number(bal?.saldo_pendiente ?? 0).toLocaleString("es-MX")} · Vencido $${Number(bal?.saldo_vencido ?? 0).toLocaleString("es-MX")}`,
        link: { href: `/cartera/${acct.id}`, label: "Ver estado de cuenta" },
      };
    },
  },

  // 5 ─ Top productos vendidos
  {
    name: "ventas_top_productos",
    description: "Top productos por ventas en un periodo (mes). 'periodo' = 'YYYY-MM' o vacío para el mes más reciente. Opcional por región.",
    input_schema: { type: "object", properties: { periodo: { type: "string", description: "YYYY-MM o vacío = mes reciente" }, region: { type: "string", enum: REGIONS }, limit: { type: "integer" } } },
    async run(ctx, p): Promise<ToolResult> {
      const { data: ms } = await ctx.supabase.from("monthly_sales").select("id, account_id, period");
      const periods = [...new Set((ms ?? []).map((m) => m.period.slice(0, 7)))].sort();
      const target = str(p.periodo) && periods.includes(str(p.periodo).slice(0, 7)) ? str(p.periodo).slice(0, 7) : periods[periods.length - 1];
      if (!target) return emptyNote("ventas_top_productos", "Top productos", "No hay ventas registradas.");
      let saleIds = (ms ?? []).filter((m) => m.period.slice(0, 7) === target).map((m) => m.id);
      if (str(p.region)) {
        const accIds = (ms ?? []).filter((m) => m.period.slice(0, 7) === target).map((m) => m.account_id);
        const { data: accs } = await ctx.supabase.from("accounts").select("id, region").in("id", accIds.length ? accIds : ["-"]);
        const inRegion = new Set((accs ?? []).filter((a) => a.region === str(p.region)).map((a) => a.id));
        const okSale = new Set((ms ?? []).filter((m) => m.period.slice(0, 7) === target && inRegion.has(m.account_id)).map((m) => m.id));
        saleIds = saleIds.filter((id) => okSale.has(id));
      }
      const { data: items } = await ctx.supabase.from("monthly_sales_items").select("codigo, producto_nombre, cantidad, total").in("monthly_sale_id", saleIds.length ? saleIds : ["-"]);
      const agg = new Map<string, { nombre: string; cantidad: number; total: number }>();
      for (const it of (items ?? []) as { codigo: string | null; producto_nombre: string; cantidad: number | null; total: number | null }[]) {
        const c = it.codigo?.trim() || it.producto_nombre;
        const e = agg.get(c) ?? { nombre: it.producto_nombre, cantidad: 0, total: 0 };
        e.cantidad += Number(it.cantidad ?? 0); e.total += Number(it.total ?? 0);
        agg.set(c, e);
      }
      const rows = [...agg.values()].sort((a, b) => b.total - a.total).slice(0, clampLimit(p.limit, 5));
      return {
        tool: "ventas_top_productos",
        title: `Top productos vendidos — ${target}${str(p.region) ? ` · ${str(p.region)}` : ""}`,
        columns: [{ key: "nombre", label: "Producto" }, { key: "cantidad", label: "Unidades", kind: "number" }, { key: "total", label: "Venta", kind: "money" }],
        rows,
        link: { href: "/reportes", label: "Ver reportes" },
      };
    },
  },

  // 6 ─ Productos en caída
  {
    name: "ventas_productos_en_caida",
    adminOnly: true,
    description: "Productos cuya venta CAYÓ el último mes vs el anterior. Para 'top N vinos que cayeron en ventas este mes'.",
    input_schema: { type: "object", properties: { limit: { type: "integer" } } },
    async run(ctx, p): Promise<ToolResult> {
      const { data: ms } = await ctx.supabase.from("monthly_sales").select("id, period");
      const periodById = new Map((ms ?? []).map((m) => [m.id, m.period.slice(0, 7)]));
      const { data: items } = await ctx.supabase.from("monthly_sales_items").select("monthly_sale_id, codigo, producto_nombre, total");
      const rows: PeriodUnits[] = [];
      for (const it of (items ?? []) as { monthly_sale_id: string; codigo: string | null; producto_nombre: string; total: number | null }[]) {
        const period = periodById.get(it.monthly_sale_id);
        if (!period) continue;
        rows.push({ codigo: it.codigo?.trim() || it.producto_nombre, nombre: it.producto_nombre, period, total: Number(it.total ?? 0) });
      }
      const declines = productDeclines(rows, 500).slice(0, clampLimit(p.limit, 5));
      return {
        tool: "ventas_productos_en_caida",
        title: "Productos con caída de ventas (mes vs mes)",
        columns: [
          { key: "nombre", label: "Producto" },
          { key: "prev", label: "Mes anterior", kind: "money" },
          { key: "last", label: "Último mes", kind: "money" },
          { key: "caida", label: "Caída", kind: "text" },
        ],
        rows: declines.map((d) => ({ nombre: d.nombre, prev: d.prev, last: d.last, caida: `-${Math.round(d.dropPct * 100)}%` })),
        link: { href: "/reportes", label: "Ver reportes" },
      };
    },
  },

  // 7 ─ Tendencia de ventas de una cuenta
  {
    name: "cuenta_tendencia_ventas",
    description: "Serie mensual de facturación de UNA cuenta (busca por nombre o # cliente).",
    input_schema: { type: "object", properties: { cuenta: { type: "string" } }, required: ["cuenta"] },
    async run(ctx, p): Promise<ToolResult> {
      const acct = await findAccount(ctx, str(p.cuenta));
      if (!acct) return emptyNote("cuenta_tendencia_ventas", "Tendencia de ventas", `No encontré la cuenta "${str(p.cuenta)}".`);
      const { data } = await ctx.supabase.from("monthly_sales").select("period, venta_bruta").eq("account_id", acct.id).order("period");
      return {
        tool: "cuenta_tendencia_ventas",
        title: `Ventas mensuales — ${acct.business_name}`,
        columns: [{ key: "period", label: "Mes", kind: "date" }, { key: "venta_bruta", label: "Venta", kind: "money" }],
        rows: (data ?? []) as ToolRow[],
        link: { href: `/cuentas/${acct.id}`, label: "Ver cuenta" },
        note: (data ?? []).length ? undefined : "Sin facturación mensual registrada.",
      };
    },
  },

  // 8 ─ Buscar cuentas
  {
    name: "cuentas_buscar",
    description: "Busca cuentas por texto (nombre), región, tipo de negocio, estatus o vendedor.",
    input_schema: {
      type: "object",
      properties: {
        texto: { type: "string" },
        region: { type: "string", enum: REGIONS },
        tipo: { type: "string", enum: TYPES },
        status: { type: "string", enum: STATUSES },
        vendedor: { type: "string", description: "Nombre del vendedor" },
        limit: { type: "integer" },
      },
    },
    async run(ctx, p): Promise<ToolResult> {
      const reps = await repNameMap(ctx);
      let repId: string | null = null;
      if (str(p.vendedor)) {
        for (const [id, name] of reps) if (name?.toLowerCase().includes(str(p.vendedor).toLowerCase())) { repId = id; break; }
      }
      let q = ctx.supabase.from("accounts").select("id, business_name, client_number, region, account_type, status, assigned_rep_id");
      if (str(p.texto)) q = q.ilike("business_name", `%${str(p.texto)}%`);
      if (str(p.region)) q = q.eq("region", str(p.region));
      if (str(p.tipo)) q = q.eq("account_type", str(p.tipo));
      if (str(p.status)) q = q.eq("status", str(p.status));
      // Un vendedor solo ve sus cuentas: ignora el filtro "vendedor" y fuerza el suyo.
      if (ownScope(ctx)) q = q.eq("assigned_rep_id", ctx.rep.id);
      else if (repId) q = q.eq("assigned_rep_id", repId);
      const { data } = await q.order("business_name").limit(clampLimit(p.limit, 20));
      const rows = (data ?? []).map((a) => ({ business_name: a.business_name, client_number: a.client_number, region: a.region, account_type: a.account_type, status: a.status, vendedor: a.assigned_rep_id ? reps.get(a.assigned_rep_id) ?? "—" : "—" }));
      return {
        tool: "cuentas_buscar",
        title: "Cuentas",
        columns: [
          { key: "business_name", label: "Cuenta" },
          { key: "client_number", label: "# Cliente" },
          { key: "region", label: "Región" },
          { key: "account_type", label: "Tipo" },
          { key: "status", label: "Estatus" },
          { key: "vendedor", label: "Vendedor" },
        ],
        rows,
        total: `${rows.length} cuenta(s)`,
        link: { href: "/cuentas", label: "Ver cuentas" },
      };
    },
  },

  // 9 ─ Cuentas con caída de compra (churn, Fase 3)
  {
    name: "cuentas_churn",
    adminOnly: true,
    description: "Cuentas activas cuya compra cayó respecto a su propio patrón (churn), opcionalmente por región.",
    input_schema: { type: "object", properties: { region: { type: "string", enum: REGIONS }, limit: { type: "integer" } } },
    async run(ctx, p): Promise<ToolResult> {
      const ranking = await loadChurnRanking(ctx.supabase);
      let rows = ranking;
      if (str(p.region)) {
        const ids = rows.map((r) => r.account_id);
        const { data: accs } = await ctx.supabase.from("accounts").select("id, region").in("id", ids.length ? ids : ["-"]);
        const inR = new Set((accs ?? []).filter((a) => a.region === str(p.region)).map((a) => a.id));
        rows = rows.filter((r) => inR.has(r.account_id));
      }
      const top = rows.slice(0, clampLimit(p.limit, 10));
      return {
        tool: "cuentas_churn",
        title: "Cuentas con caída de compra",
        columns: [{ key: "business_name", label: "Cuenta" }, { key: "estado", label: "Estado" }, { key: "detalle", label: "Detalle" }],
        rows: top.map((r) => ({ business_name: r.business_name, estado: CHURN_LABEL[r.churn.status], detalle: r.churn.reason })),
        total: `${top.length} cuenta(s)`,
        link: { href: "/", label: "Ver dashboard" },
      };
    },
  },

  // 10 ─ Cuentas inactivas
  {
    name: "cuentas_inactivas",
    description: "Cuentas activas sin actividad registrada en ≥ N días (default 30), opcionalmente por región.",
    input_schema: { type: "object", properties: { dias: { type: "integer" }, region: { type: "string", enum: REGIONS }, limit: { type: "integer" } } },
    async run(ctx, p): Promise<ToolResult> {
      const dias = num(p.dias) ?? 30;
      let q = ctx.supabase.from("v_account_last_activity").select("account_id, business_name, region, status, last_activity_date").eq("status", "activo");
      q = applyOwnScope(q, ctx);
      if (str(p.region)) q = q.eq("region", str(p.region));
      const { data } = await q;
      const rows = (data ?? [])
        .map((a) => ({ business_name: a.business_name, region: a.region, dias: daysSince(a.last_activity_date), last_activity_date: a.last_activity_date }))
        .filter((r) => r.dias == null || r.dias >= dias)
        .sort((a, b) => (b.dias ?? 99999) - (a.dias ?? 99999))
        .slice(0, clampLimit(p.limit, 20))
        .map((r) => ({ ...r, dias: r.dias ?? "sin actividad" }));
      return {
        tool: "cuentas_inactivas",
        title: `Cuentas sin actividad ≥${dias} días`,
        columns: [{ key: "business_name", label: "Cuenta" }, { key: "region", label: "Región" }, { key: "dias", label: "Días sin actividad", kind: "text" }, { key: "last_activity_date", label: "Última actividad", kind: "date" }],
        rows,
        total: `${rows.length} cuenta(s)`,
        link: { href: "/cuentas", label: "Ver cuentas" },
      };
    },
  },

  // 11 ─ Riesgo de quiebre (restock, Fase 2)
  {
    name: "restock_riesgo_quiebre",
    adminOnly: true,
    description: "Productos en riesgo de quiebre de stock (modelo de reabasto), opcionalmente por proveedor.",
    input_schema: { type: "object", properties: { supplier: { type: "string" }, limit: { type: "integer" } } },
    async run(ctx, p): Promise<ToolResult> {
      const sugs = await getRestockSuggestions(ctx.supabase);
      let rows = sugs;
      if (str(p.supplier)) rows = rows.filter((r) => (r.supplier ?? "").toLowerCase().includes(str(p.supplier).toLowerCase()));
      const top = rows.slice(0, clampLimit(p.limit, 15));
      return {
        tool: "restock_riesgo_quiebre",
        title: "Productos en riesgo de quiebre",
        columns: [
          { key: "name", label: "Producto" },
          { key: "supplier", label: "Proveedor" },
          { key: "stock", label: "Stock", kind: "number" },
          { key: "suggestedQty", label: "Sugerido", kind: "number" },
          { key: "urgencia", label: "Urgencia" },
        ],
        rows: top.map((r) => ({ name: r.name, supplier: r.supplier, stock: r.stock, suggestedQty: r.suggestedQty, urgencia: URGENCY_LABEL[r.urgency] })),
        total: `${top.length} producto(s)`,
        link: { href: "/restock/sugerencias", label: "Sugerencias de reabasto" },
        note: top.length ? undefined : "Sin datos: revisa que el catálogo tenga códigos CONTPAQ mapeados.",
      };
    },
  },

  // 12 ─ Cross-sell de una cuenta (Fase 3)
  {
    name: "cuenta_cross_sell",
    adminOnly: true,
    description: "Productos sugeridos de venta cruzada para UNA cuenta, según lo que compran clientes parecidos.",
    input_schema: { type: "object", properties: { cuenta: { type: "string" } }, required: ["cuenta"] },
    async run(ctx, p): Promise<ToolResult> {
      const acct = await findAccount(ctx, str(p.cuenta));
      if (!acct) return emptyNote("cuenta_cross_sell", "Venta cruzada", `No encontré la cuenta "${str(p.cuenta)}".`);
      const recos = await loadCrossSell(ctx.supabase, acct.id);
      return {
        tool: "cuenta_cross_sell",
        title: `Venta cruzada — ${acct.business_name}`,
        columns: [{ key: "nombre", label: "Producto" }, { key: "supporters", label: "Clientes parecidos", kind: "number" }, { key: "reason", label: "Por qué" }],
        rows: recos.map((r) => ({ nombre: r.nombre, supporters: r.supporters, reason: r.reason })),
        link: { href: `/cuentas/${acct.id}`, label: "Ver cuenta" },
        note: recos.length ? undefined : "Aún no hay suficientes patrones de clientes parecidos.",
      };
    },
  },
];

function emptyNote(tool: string, title: string, note: string): ToolResult {
  return { tool, title, columns: [], rows: [], note };
}

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** Tools que el usuario puede usar según su rol (las admin-only se ocultan a no-finanzas). */
export function toolDefsFor(ctx: ToolContext): { name: string; description: string; input_schema: Record<string, unknown> }[] {
  return TOOLS.filter((t) => !t.adminOnly || ctx.canSeeFinance).map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
}

/** Ejecuta una tool por nombre, validando acceso. Nunca lanza: devuelve nota en error. */
export async function runTool(ctx: ToolContext, name: string, params: Record<string, unknown>): Promise<ToolResult> {
  const tool = BY_NAME.get(name);
  if (!tool) return emptyNote(name, "Desconocida", `La función "${name}" no existe.`);
  if (tool.adminOnly && !ctx.canSeeFinance) return emptyNote(name, tool.name, "Esta consulta requiere rol de administrador o contador.");
  try {
    return await tool.run(ctx, params ?? {});
  } catch (e) {
    return emptyNote(name, tool.name, `No se pudo ejecutar: ${e instanceof Error ? e.message : "error"}.`);
  }
}
