// Consumo de muestras por vendedor (admin/contador): cuántas botellas saca
// cada quien, a qué clientes, su valor a precio de lista y el costo de
// adquisición por encarte (valor de muestras del periodo ÷ encartes nuevos del
// periodo). Alimenta la autorización de muestras junto con el candado de
// 6 botellas/cliente/30 días (migración 0092, ver lib/samples.ts SAMPLE_CAP).

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { canSeeFinance } from "@/lib/modules";
import { SAMPLE_CAP } from "@/lib/samples";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TableScroll } from "@/components/ui/table-scroll";
import { formatCurrency } from "@/lib/utils";

export const metadata = { title: "Consumo de muestras — TERAVINO CRM" };
export const dynamic = "force-dynamic";

const PERIODOS = [
  { days: 30, label: "30 días" },
  { days: 90, label: "90 días" },
  { days: 365, label: "12 meses" },
] as const;

// Solo solicitudes vivas cuentan como consumo (igual que el candado 0092).
const LIVE_STATUSES = ["enviada", "aprobada", "entregada"];

type ReqRow = {
  id: string;
  sales_rep_id: string;
  account_id: string | null;
  status: string | null;
  training_people: number | null;
  created_at: string;
  sales_reps: { full_name: string | null } | null;
  accounts: { business_name: string | null } | null;
  sample_request_items: Array<{ product_id: string | null; quantity: number | null }> | null;
};

type EncarteRow = {
  account_id: string;
  since: string | null;
  created_at: string | null;
  accounts: { assigned_rep_id: string | null } | null;
};

export default async function ConsumoMuestrasPage({
  searchParams,
}: {
  searchParams: { dias?: string };
}) {
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  if (!canSeeFinance(rep.role)) redirect("/muestras");

  const dias = PERIODOS.some((p) => p.days === Number(searchParams.dias))
    ? Number(searchParams.dias)
    : 30;
  const desde = new Date(Date.now() - dias * 86_400_000);
  const desdeISO = desde.toISOString();
  const desdeDate = desdeISO.slice(0, 10);

  const supabase = createClient();
  const [reqRes, prodRes, encartesRes] = await Promise.all([
    supabase
      .from("sample_requests")
      .select(
        "id, sales_rep_id, account_id, status, training_people, created_at, sales_reps:sales_rep_id(full_name), accounts:account_id(business_name), sample_request_items(product_id, quantity)",
      )
      .in("status", LIVE_STATUSES)
      .gte("created_at", desdeISO)
      .limit(2000),
    supabase.from("products").select("id, base_price").limit(5000),
    // Encartes nuevos del periodo: usa `since` si está capturado; si no, la
    // fecha de alta del registro.
    supabase
      .from("account_products")
      .select("account_id, since, created_at, accounts:account_id(assigned_rep_id)")
      .eq("status", "encartado")
      .or(`since.gte.${desdeDate},and(since.is.null,created_at.gte.${desdeISO})`)
      .limit(5000),
  ]);

  const requests = ((reqRes.data ?? []) as unknown) as ReqRow[];
  const priceById = new Map(
    ((prodRes.data ?? []) as { id: string; base_price: number | null }[]).map((p) => [
      p.id,
      Number(p.base_price ?? 0),
    ]),
  );
  const encartes = ((encartesRes.data ?? []) as unknown) as EncarteRow[];

  // ── Agregado por vendedor ──────────────────────────────────────────────────
  type RepAgg = {
    nombre: string;
    solicitudes: number;
    capacitaciones: number;
    botellas: number;
    valor: number;
    sinPrecio: number; // renglones manuales sin producto del catálogo
    clientes: Set<string>;
    encartes: number;
  };
  const byRep = new Map<string, RepAgg>();
  const aggFor = (repId: string, nombre: string): RepAgg => {
    const cur = byRep.get(repId);
    if (cur) return cur;
    const fresh: RepAgg = {
      nombre,
      solicitudes: 0,
      capacitaciones: 0,
      botellas: 0,
      valor: 0,
      sinPrecio: 0,
      clientes: new Set(),
      encartes: 0,
    };
    byRep.set(repId, fresh);
    return fresh;
  };

  // ── Vendedor × cliente (para ver los excesos) ─────────────────────────────
  type ClienteAgg = {
    repNombre: string;
    accountId: string;
    cliente: string;
    botellas: number;
    valor: number;
    solicitudes: number;
    capacitacion: boolean;
  };
  const byRepCliente = new Map<string, ClienteAgg>();

  for (const r of requests) {
    const agg = aggFor(r.sales_rep_id, r.sales_reps?.full_name ?? "—");
    agg.solicitudes += 1;
    if (r.training_people != null) agg.capacitaciones += 1;
    if (r.account_id) agg.clientes.add(r.account_id);
    let valorReq = 0;
    let botellasReq = 0;
    for (const it of r.sample_request_items ?? []) {
      const qty = Number(it.quantity ?? 0);
      botellasReq += qty;
      const price = it.product_id ? priceById.get(it.product_id) : undefined;
      if (price == null) agg.sinPrecio += qty;
      else valorReq += qty * price;
    }
    agg.botellas += botellasReq;
    agg.valor += valorReq;

    if (r.account_id) {
      const key = `${r.sales_rep_id}|${r.account_id}`;
      const c = byRepCliente.get(key) ?? {
        repNombre: r.sales_reps?.full_name ?? "—",
        accountId: r.account_id,
        cliente: r.accounts?.business_name ?? "—",
        botellas: 0,
        valor: 0,
        solicitudes: 0,
        capacitacion: false,
      };
      c.botellas += botellasReq;
      c.valor += valorReq;
      c.solicitudes += 1;
      c.capacitacion = c.capacitacion || r.training_people != null;
      byRepCliente.set(key, c);
    }
  }

  // Encartes del periodo atribuidos al vendedor dueño de la cuenta. Los días
  // con una avalancha de altas (≥50) son cargas masivas (ej. el poblado desde
  // ventas del 2026-06-23 con 1,514 filas), no encartes ganados con muestras:
  // se excluyen para no destrozar el costo por encarte.
  const BULK_DAY_THRESHOLD = 50;
  const porDia = new Map<string, number>();
  const diaDe = (e: EncarteRow) => e.since ?? (e.created_at ?? "").slice(0, 10);
  for (const e of encartes) porDia.set(diaDe(e), (porDia.get(diaDe(e)) ?? 0) + 1);
  const diasMasivos = new Set([...porDia.entries()].filter(([, n]) => n >= BULK_DAY_THRESHOLD).map(([d]) => d));
  let encartesExcluidos = 0;
  for (const e of encartes) {
    if (diasMasivos.has(diaDe(e))) {
      encartesExcluidos += 1;
      continue;
    }
    const repId = e.accounts?.assigned_rep_id;
    if (!repId) continue;
    const agg = byRep.get(repId);
    if (agg) agg.encartes += 1;
  }

  const repRows = [...byRep.entries()]
    .map(([id, a]) => ({ id, ...a }))
    .sort((a, b) => b.botellas - a.botellas);
  const totales = repRows.reduce(
    (acc, r) => ({
      solicitudes: acc.solicitudes + r.solicitudes,
      botellas: acc.botellas + r.botellas,
      valor: acc.valor + r.valor,
      encartes: acc.encartes + r.encartes,
    }),
    { solicitudes: 0, botellas: 0, valor: 0, encartes: 0 },
  );

  const clienteRows = [...byRepCliente.values()]
    .sort((a, b) => b.botellas - a.botellas)
    .slice(0, 25);
  // El tope del candado está definido a 30 días; en periodos más largos la
  // comparación directa no aplica y solo resaltamos los volúmenes altos.
  const capEscalado = SAMPLE_CAP.botellasPorCliente * Math.max(1, Math.round(dias / SAMPLE_CAP.ventanaDias));

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/muestras"><ArrowLeft className="mr-1 h-4 w-4" /> Muestras</Link>
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Consumo de muestras</h1>
          <p className="text-sm text-muted-foreground">
            Botellas por vendedor, valor a precio de lista y costo de adquisición por encarte ·
            últimos {dias} días · candado vigente: máx {SAMPLE_CAP.botellasPorCliente} botellas por
            cliente cada {SAMPLE_CAP.ventanaDias} días (capacitaciones exentas).
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 rounded-lg border bg-card p-1">
          {PERIODOS.map((p) => (
            <Link
              key={p.days}
              href={`/muestras/consumo?dias=${p.days}`}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                dias === p.days
                  ? "bg-brand-carmesi text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border-b px-4 py-3">
            <h3 className="font-display text-lg">Por vendedor</h3>
            <p className="text-xs text-muted-foreground">
              Solicitudes vivas (enviada/aprobada/entregada) del periodo. Valor a precio de lista del
              catálogo; costo por encarte = valor de muestras ÷ encartes nuevos del periodo.
              {encartesExcluidos > 0 && (
                <> Se excluyen {encartesExcluidos.toLocaleString("es-MX")} encartes de cargas masivas
                (no ganados con muestras).</>
              )}
            </p>
          </div>
          {repRows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Sin muestras en el periodo.</p>
          ) : (
            <TableScroll className="rounded-none border-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Vendedor</th>
                    <th className="px-4 py-2 text-right">Solicitudes</th>
                    <th className="px-4 py-2 text-right">Botellas</th>
                    <th className="px-4 py-2 text-right">Valor (precio lista)</th>
                    <th className="px-4 py-2 text-right">Clientes</th>
                    <th className="px-4 py-2 text-right">Encartes nuevos</th>
                    <th className="px-4 py-2 text-right">Costo por encarte</th>
                  </tr>
                </thead>
                <tbody>
                  {repRows.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/20">
                      <td className="px-4 py-2 font-medium">
                        {r.nombre}
                        {r.capacitaciones > 0 && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            ({r.capacitaciones} capacitación{r.capacitaciones === 1 ? "" : "es"})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">{r.solicitudes}</td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">{r.botellas}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatCurrency(r.valor)}
                        {r.sinPrecio > 0 && (
                          <div className="text-xs text-muted-foreground">+{r.sinPrecio} bot. sin precio</div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">{r.clientes.size}</td>
                      <td className="px-4 py-2 text-right">{r.encartes}</td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">
                        {r.encartes > 0 ? (
                          formatCurrency(r.valor / r.encartes)
                        ) : r.valor > 0 ? (
                          <Badge variant="danger">Sin encartes</Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30 font-medium">
                    <td className="px-4 py-2">TOTAL</td>
                    <td className="px-4 py-2 text-right">{totales.solicitudes}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{totales.botellas}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(totales.valor)}</td>
                    <td className="px-4 py-2 text-right">—</td>
                    <td className="px-4 py-2 text-right">{totales.encartes}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {totales.encartes > 0 ? formatCurrency(totales.valor / totales.encartes) : "—"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </TableScroll>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="border-b px-4 py-3">
            <h3 className="font-display text-lg">Botellas por cliente</h3>
            <p className="text-xs text-muted-foreground">
              Top vendedor × cliente del periodo — aquí se ven los excesos (en rojo los que superan
              {" "}{capEscalado} botellas{dias !== SAMPLE_CAP.ventanaDias ? ` ≈ tope escalado a ${dias} días` : " (el tope del candado)"}).
            </p>
          </div>
          {clienteRows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Sin muestras con cliente en el periodo.</p>
          ) : (
            <TableScroll className="rounded-none border-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Vendedor</th>
                    <th className="px-4 py-2 text-left">Cliente</th>
                    <th className="px-4 py-2 text-right">Solicitudes</th>
                    <th className="px-4 py-2 text-right">Botellas</th>
                    <th className="px-4 py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {clienteRows.map((c) => {
                    const exceso = c.botellas > capEscalado;
                    return (
                      <tr key={`${c.repNombre}-${c.accountId}`} className={`border-t ${exceso ? "bg-red-50/60" : "hover:bg-muted/20"}`}>
                        <td className="px-4 py-2">{c.repNombre}</td>
                        <td className="px-4 py-2 font-medium">
                          <Link href={`/cuentas/${c.accountId}`} className="hover:text-brand-carmesi">
                            {c.cliente}
                          </Link>
                          {c.capacitacion && (
                            <Badge variant="muted" className="ml-1.5 align-middle text-[10px]">capacitación</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">{c.solicitudes}</td>
                        <td className={`px-4 py-2 text-right font-medium tabular-nums ${exceso ? "text-red-700" : ""}`}>
                          {c.botellas}
                          {exceso && <Badge variant="danger" className="ml-1.5">Exceso</Badge>}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(c.valor)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
