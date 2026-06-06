// Listado de cotizaciones (orders con order_type='cotizacion'), separadas de los pedidos.

import Link from "next/link";
import { Plus, FileSignature } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";

export const metadata = { title: "Cotizaciones — TERAVINO CRM" };
export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "muted" | "warning" | "accent" | "success" | "danger"> = {
  borrador: "muted",
  enviada: "warning",
  aceptada: "accent",
  rechazada: "danger",
  facturada: "success",
  entregada: "success",
  cancelada: "danger",
};

export default async function CotizacionesPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      "id, order_number, order_type, status, order_date, total, accounts:account_id(business_name, region)",
    )
    .eq("order_type", "cotizacion")
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  const orders = (data ?? []) as unknown as Array<{
    id: string;
    order_number: string;
    order_type: string;
    status: string | null;
    order_date: string;
    total: number | null;
    accounts: { business_name: string | null; region: string | null } | null;
  }>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl">Cotizaciones</h1>
          <p className="text-sm text-muted-foreground">
            Borradores y propuestas enviadas a clientes (COT-…). Al aceptarse se convierten en pedido.
          </p>
        </div>
        <Button asChild>
          <Link href="/pedidos/nuevo">
            <Plus className="mr-1 h-4 w-4" /> Nueva cotización
          </Link>
        </Button>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="Aún sin cotizaciones"
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
                <th className="px-4 py-3">Región</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/pedidos/${o.id}`} className="hover:text-brand-carmesi">
                      {o.order_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{o.accounts?.business_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{o.accounts?.region ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(o.order_date)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[o.status ?? ""] ?? "muted"}>{o.status ?? "—"}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">{formatCurrency(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
