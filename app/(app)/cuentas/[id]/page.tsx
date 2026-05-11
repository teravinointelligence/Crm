import { notFound } from "next/navigation";
import Link from "next/link";
import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AccountHeader } from "@/components/accounts/AccountHeader";
import { ContactsList } from "@/components/contacts/ContactsList";
import { ActivityTimeline } from "@/components/activities/ActivityTimeline";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import type { Account, Contact, Activity, Order, SalesRep } from "@/types/database";

export default async function CuentaDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data: account } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!account) notFound();

  const [{ data: contacts }, { data: activities }, { data: orders }, { data: rep }] =
    await Promise.all([
      supabase
        .from("contacts")
        .select("*")
        .eq("account_id", params.id)
        .order("is_primary", { ascending: false })
        .order("full_name"),
      supabase
        .from("activities")
        .select("*")
        .eq("account_id", params.id)
        .order("activity_date", { ascending: false })
        .limit(50),
      supabase
        .from("orders")
        .select("*")
        .eq("account_id", params.id)
        .order("order_date", { ascending: false }),
      account.assigned_rep_id
        ? supabase
            .from("sales_reps")
            .select("*")
            .eq("id", account.assigned_rep_id)
            .single()
        : Promise.resolve({ data: null as SalesRep | null }),
    ]);

  return (
    <div className="space-y-6">
      <AccountHeader account={account as Account} rep={rep as SalesRep | null} />

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="contactos">
            Contactos ({contacts?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="actividades">
            Actividades ({activities?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="pedidos">
            Pedidos ({orders?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
              <Detail label="Tipo" value={account.account_type ?? "—"} />
              <Detail label="Región" value={account.region ?? "—"} />
              <Detail label="Ciudad" value={account.city ?? "—"} />
              <Detail
                label="Tier de precio"
                value={
                  account.price_tier === "+10"
                    ? "+10% (La Paz / Tijuana)"
                    : "Base"
                }
              />
              <Detail label="RFC" value={account.rfc ?? "—"} />
              <Detail label="Razón social" value={account.fiscal_name ?? "—"} />
              <Detail
                label="Dirección"
                value={account.address ?? "—"}
                full
              />
              {account.notes && (
                <div className="sm:col-span-2 border-t pt-4">
                  <h4 className="mb-1 text-xs uppercase text-muted-foreground">
                    Notas
                  </h4>
                  <p className="text-sm">{account.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contactos">
          <ContactsList
            accountId={account.id}
            contacts={(contacts ?? []) as Contact[]}
          />
        </TabsContent>

        <TabsContent value="actividades">
          <ActivityTimeline activities={(activities ?? []) as Activity[]} />
        </TabsContent>

        <TabsContent value="pedidos">
          <OrdersSection orders={(orders ?? []) as Order[]} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Detail({
  label,
  value,
  full,
}: {
  label: string;
  value: string;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function OrdersSection({ orders }: { orders: Order[] }) {
  if (!orders.length) {
    return (
      <EmptyState
        icon={FileText}
        title="Sin pedidos"
        description="Crea la primera cotización para este cliente."
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="min-w-full text-sm">
        <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Folio</th>
            <th className="px-4 py-3">Tipo</th>
            <th className="px-4 py-3">Fecha</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Total</th>
            <th className="px-4 py-3"></th>
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
              <td className="px-4 py-3 text-right">
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/pedidos/${o.id}`}>Ver</Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
