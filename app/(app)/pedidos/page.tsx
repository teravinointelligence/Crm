import Link from "next/link";
import { Plus, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";

export const metadata = { title: "Pedidos — TERAVINO CRM" };

export default async function PedidosPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      "id, order_number, order_type, status, order_date, total, accounts:account_id(business_name, region)",
    )
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl">Pedidos y cotizaciones</h1>
          <p className="text-sm text-muted-foreground">
            COT-2026-… para cotizaciones, PED-2026-… para pedidos.
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
          icon={FileText}
          title="Aún sin pedidos"
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
                    {o.accounts?.region && (
                      <div className="text-xs text-muted-foreground">
                        {o.accounts.region}
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
                    <Badge variant="muted">{o.status}</Badge>
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
