import { notFound } from "next/navigation";
import Link from "next/link";
import { FileDown, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { OrderStatusActions } from "@/components/orders/OrderStatusActions";

export default async function PedidoDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: order } = await supabase
    .from("orders")
    .select(
      `*,
      accounts:account_id (id, business_name, region, city, price_tier, rfc),
      sales_reps:sales_rep_id (full_name, email),
      order_items (*)`,
    )
    .eq("id", params.id)
    .single();
  if (!order) notFound();

  const account = (order.accounts ?? null) as {
    id: string;
    business_name: string | null;
    region: string | null;
    city: string | null;
    price_tier: string | null;
    rfc: string | null;
  } | null;
  const rep = (order.sales_reps ?? null) as {
    full_name: string | null;
    email: string | null;
  } | null;
  const items = (order.order_items ?? []) as Array<{
    id: string;
    product_name: string;
    supplier: string | null;
    vintage: string | null;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/pedidos">
            <ArrowLeft className="mr-1 h-4 w-4" /> Pedidos
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-6 brand-shadow">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl">{order.order_number}</h1>
            <Badge variant="muted">{order.status}</Badge>
            <Badge variant="accent">{order.order_type}</Badge>
            {account?.price_tier === "+10" && (
              <Badge variant="accent">+10%</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {formatDate(order.order_date)}
          </p>
          {account && (
            <Link
              href={`/cuentas/${account.id}`}
              className="text-sm text-brand-carmesi hover:underline"
            >
              {account.business_name}
              {account.region && (
                <span className="text-muted-foreground"> · {account.region}</span>
              )}
            </Link>
          )}
          {rep?.full_name && (
            <p className="text-xs text-muted-foreground">
              Atendido por {rep.full_name}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a
              href={`/api/orders/${order.id}/pdf`}
              target="_blank"
              rel="noreferrer"
            >
              <FileDown className="mr-1 h-4 w-4" /> Descargar PDF
            </a>
          </Button>
          <OrderStatusActions
            orderId={order.id}
            current={order.status ?? "borrador"}
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3 text-right">Cant.</th>
                <th className="px-4 py-3 text-right">Precio</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{i.product_name}</div>
                    {(i.supplier || i.vintage) && (
                      <div className="text-xs text-muted-foreground">
                        {[i.supplier, i.vintage].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">{i.quantity}</td>
                  <td className="px-4 py-3 text-right">
                    {formatCurrency(i.unit_price)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatCurrency(i.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/30">
              <tr>
                <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground">
                  Subtotal
                </td>
                <td className="px-4 py-2 text-right">
                  {formatCurrency(order.subtotal)}
                </td>
              </tr>
              <tr>
                <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground">
                  IVA 16%
                </td>
                <td className="px-4 py-2 text-right">
                  {formatCurrency(order.iva)}
                </td>
              </tr>
              <tr className="border-t">
                <td
                  colSpan={3}
                  className="px-4 py-3 text-right font-display text-lg"
                >
                  Total
                </td>
                <td className="px-4 py-3 text-right font-display text-lg text-brand-carmesi">
                  {formatCurrency(order.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {order.notes && (
        <Card>
          <CardContent className="space-y-1 p-6">
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
              Notas
            </h3>
            <p className="text-sm">{order.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
