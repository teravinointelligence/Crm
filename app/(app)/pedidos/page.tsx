// Lista unificada de pedidos y cotizaciones (tabla orders, order_type) con
// filtro por tipo. Es la ÚNICA sección del menú para este flujo: la antigua
// entrada "Cotizaciones" (/cotizaciones) redirige aquí con ?tipo=cotizacion.

import Link from "next/link";
import { Plus, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";

export const metadata = { title: "Pedidos y cotizaciones — TERAVINO CRM" };

type Tipo = "todos" | "cotizacion" | "pedido";

const TIPOS: { value: Tipo; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "cotizacion", label: "Cotizaciones" },
  { value: "pedido", label: "Pedidos" },
];

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: { tipo?: string };
}) {
  const supabase = createClient();
  const tipo: Tipo = searchParams.tipo === "cotizacion" || searchParams.tipo === "pedido"
    ? searchParams.tipo
    : "todos";

  let query = supabase
    .from("orders")
    .select(
      "id, order_number, order_type, status, discount_status, fulfillment_status, warehouse, order_date, total, accounts:account_id(business_name, region, client_number)",
    )
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (tipo !== "todos") query = query.eq("order_type", tipo);

  const [{ data }, { count: totalCount }] = await Promise.all([
    query,
    supabase.from("orders").select("id", { count: "exact", head: true }),
  ]);

  const orders = (data ?? []) as unknown as Array<{
    id: string;
    order_number: string;
    order_type: string;
    status: string | null;
    discount_status: string | null;
    fulfillment_status: string | null;
    warehouse: string | null;
    order_date: string;
    total: number | null;
    accounts: {
      business_name: string | null;
      region: string | null;
      client_number: string | null;
    } | null;
  }>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Pedidos y cotizaciones</h1>
          <p className="text-sm text-muted-foreground">
            COT-2026-… para cotizaciones, PED-2026-… para pedidos. Al aceptarse, la cotización se convierte en pedido.
          </p>
        </div>
        <Button asChild>
          <Link href="/pedidos/nuevo">
            <Plus className="mr-1 h-4 w-4" /> Nueva cotización
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5 rounded-lg border bg-card p-1">
          {TIPOS.map((t) => {
            const active = tipo === t.value;
            return (
              <Link
                key={t.value}
                href={t.value === "todos" ? "/pedidos" : `/pedidos?tipo=${t.value}`}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${active ? "bg-brand-carmesi text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
        <span className="text-xs text-muted-foreground">
          {orders.length} de {totalCount ?? orders.length} registros
        </span>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={tipo === "pedido" ? "Aún sin pedidos" : tipo === "cotizacion" ? "Aún sin cotizaciones" : "Aún sin pedidos ni cotizaciones"}
          description="Crea la primera cotización desde el detalle de un cliente."
          action={
            <Button asChild className="mt-2">
              <Link href="/pedidos/nuevo">Nueva cotización</Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/pedidos/${o.id}`}
                      className="hover:text-brand-carmesi"
                    >
                      {o.order_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {o.accounts?.business_name ?? "—"}
                    {(o.accounts?.client_number || o.accounts?.region) && (
                      <div className="text-xs text-muted-foreground">
                        {o.accounts?.client_number ? `# ${o.accounts.client_number}` : ""}
                        {o.accounts?.client_number && o.accounts?.region ? " · " : ""}
                        {o.accounts?.region ?? ""}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">
                    {o.order_type}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(o.order_date)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="muted">{o.status}</Badge>
                      {o.order_type === "pedido" && (
                        <Badge variant={o.fulfillment_status === "surtido" ? "success" : "warning"}>
                          {o.fulfillment_status === "surtido" ? "Surtido" : "Por surtir"}
                        </Badge>
                      )}
                      {o.discount_status === "pendiente" && (
                        <Badge variant="warning">Desc. pendiente</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatCurrency(o.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
