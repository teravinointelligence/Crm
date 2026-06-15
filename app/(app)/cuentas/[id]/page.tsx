import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { FileText, Wallet, Wine, FlaskConical, CalendarCheck2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AccountHeader } from "@/components/accounts/AccountHeader";
import { ContactsList } from "@/components/contacts/ContactsList";
import { ActivityTimeline } from "@/components/activities/ActivityTimeline";
import { AccountWines } from "@/components/accounts/AccountWines";
import { ChurnCard, CrossSellCard } from "@/components/accounts/AccountIntelCards";
import { NextBestActionCard } from "@/components/accounts/NextBestActionCard";
import { loadAccountFacts } from "@/lib/account-intel";
import { AccountConsignaciones } from "@/components/accounts/AccountConsignaciones";
import { ImportPedidosCuenta } from "@/components/accounts/ImportPedidosCuenta";
import { AccountAgreements, type AgreementRow } from "@/components/accounts/AccountAgreements";
import { EnviarRecordatorioButton } from "@/components/cartera/EnviarRecordatorioButton";
import { EnviarPortafolioButton } from "@/components/portafolios/EnviarPortafolioButton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import type {
  Account,
  Contact,
  Activity,
  Order,
  SalesRep,
} from "@/types/database";

const CLOSED_STATUSES = ["aceptada", "facturada", "entregada"];

const INVOICE_STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "muted"> = {
  pagada: "success",
  pagada_parcial: "warning",
  pendiente: "warning",
  vencida: "danger",
  cancelada: "muted",
};

export default async function CuentaDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const supabase = createClient();
  const me = await getCurrentRep();
  if (!me) redirect("/login");
  const validTabs = ["resumen", "vinos", "contactos", "actividades", "pedidos", "consignaciones", "acuerdos", "info"];
  const initialTab = validTabs.includes(searchParams.tab ?? "") ? searchParams.tab! : "resumen";

  const { data: account } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!account) notFound();

  const [
    { data: contacts },
    { data: activities },
    { data: orders },
    { data: recentInvoices },
    { data: rep },
    { data: balance },
    { data: wines },
    { data: agreementsRaw },
  ] = await Promise.all([
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
    supabase
      .from("invoices")
      .select("invoice_number, invoice_date, total, status")
      .eq("account_id", params.id)
      .order("invoice_date", { ascending: false })
      .limit(6),
    account.assigned_rep_id
      ? supabase
          .from("sales_reps")
          .select("*")
          .eq("id", account.assigned_rep_id)
          .single()
      : Promise.resolve({ data: null as SalesRep | null }),
    supabase
      .from("v_account_balance")
      .select("*")
      .eq("account_id", params.id)
      .single(),
    supabase
      .from("account_products")
      .select(
        "id, product_id, status, notes, since, created_at, products:product_id(id, name, supplier, varietal, vintage, base_price, active)",
      )
      .eq("account_id", params.id),
    supabase
      .from("agreements")
      .select(
        "*, equipment:agreement_equipment(*), contact:contact_id(full_name), rep:rep_id(full_name)",
      )
      .eq("account_id", params.id)
      .order("agreement_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  // Products catalog for the "agregar vino" picker (only when there are wines or always — load active ones)
  const { data: catalog } = await supabase
    .from("products")
    .select("id, name, supplier, varietal, vintage, base_price, active")
    .eq("active", true)
    .order("supplier")
    .order("name");

  // "Últimas facturas": de la cartera (tabla invoices), misma fuente que la
  // Tendencia de compra y el saldo, para que el dashboard sea consistente.
  type FacturaReciente = {
    invoice_number: string;
    invoice_date: string;
    total: number | null;
    status: string | null;
  };
  const facturasRecientes = (recentInvoices ?? []) as FacturaReciente[];

  const orderList = (orders ?? []) as Order[];
  const activityList = (activities ?? []) as Activity[];
  const wineList = (wines ?? []) as never[];
  const priceTier = (account.price_tier as "base" | "+10") ?? "base";

  const agreementList: AgreementRow[] = ((agreementsRaw ?? []) as never[]).map(
    (a: Record<string, unknown>) => {
      const contact = a.contact as { full_name: string } | null;
      const rep2 = a.rep as { full_name: string } | null;
      return {
        ...(a as AgreementRow),
        equipment: ((a.equipment ?? []) as AgreementRow["equipment"]) ?? [],
        contactName: contact?.full_name ?? null,
        repName: rep2?.full_name ?? null,
      };
    },
  );
  const canEditAccount = me.role === "admin" || account.assigned_rep_id === me.id;

  const closedOrders = orderList.filter((o) => CLOSED_STATUSES.includes(o.status ?? ""));
  const totalComprado = closedOrders.reduce((s, o) => s + Number(o.total ?? 0), 0);
  const pipeline = orderList
    .filter((o) => o.order_type === "cotizacion" && ["borrador", "enviada"].includes(o.status ?? ""))
    .reduce((s, o) => s + Number(o.total ?? 0), 0);
  const encartadosCount = (wineList as { status: string }[]).filter((w) => w.status === "encartado").length;
  const muestrasCount = (wineList as { status: string }[]).filter((w) => w.status === "muestra").length;
  const today = new Date().toISOString().slice(0, 10);
  const pendientes = activityList.filter((a) => a.next_step && (!a.next_step_date || a.next_step_date >= today));
  const lastActivity = activityList[0];

  // Inteligencia por cuenta: churn (vs su propio patrón) + venta cruzada, desde
  // monthly_sales(_items). Un solo load de hechos; el resumen LLM es on-demand.
  const facts = await loadAccountFacts(supabase, params.id);

  return (
    <div className="space-y-6">
      <AccountHeader account={account as Account} rep={rep as SalesRep | null} />

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="vinos">Vinos ({wineList.length})</TabsTrigger>
          <TabsTrigger value="contactos">Contactos ({contacts?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="actividades">Actividades ({activityList.length})</TabsTrigger>
          <TabsTrigger value="pedidos">Pedidos ({orderList.length})</TabsTrigger>
          <TabsTrigger value="consignaciones">Consignaciones</TabsTrigger>
          <TabsTrigger value="acuerdos">Acuerdos ({agreementList.length})</TabsTrigger>
          <TabsTrigger value="info">Info</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen">
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <NextBestActionCard
                accountId={account.id}
                basis="cartera, qué compra, tendencia mensual, churn y venta cruzada"
              />
              <ChurnCard churn={facts.churn} trend={facts.trend} />
              <CrossSellCard recommendations={facts.recommendations} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi icon={Wallet} label="Saldo pendiente" value={formatCurrency(balance?.saldo_pendiente)} accent />
              <Kpi
                icon={Wallet}
                label="Saldo vencido"
                value={formatCurrency(balance?.saldo_vencido)}
                danger={(balance?.saldo_vencido ?? 0) > 0}
              />
              <Kpi icon={FileText} label="Comprado (cerrado)" value={formatCurrency(totalComprado)} />
              <Kpi icon={FileText} label="Pipeline cotizaciones" value={formatCurrency(pipeline)} />
              <Kpi
                icon={Wine}
                label="Vinos encartados"
                value={String(encartadosCount)}
                href={`/cuentas/${account.id}?tab=vinos`}
              />
              <Kpi
                icon={FlaskConical}
                label="Muestras / probados"
                value={String(muestrasCount)}
                href={`/cuentas/${account.id}?tab=vinos`}
              />
              <Kpi
                icon={FileText}
                label="Pedidos / cotizaciones"
                value={String(orderList.length)}
                href={`/cuentas/${account.id}?tab=pedidos`}
              />
              <Kpi
                icon={CalendarCheck2}
                label="Actividades"
                value={String(activityList.length)}
                href={`/cuentas/${account.id}?tab=actividades`}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href={`/actividades/nueva?account=${account.id}`}>Registrar actividad</Link>
              </Button>
              <Button asChild variant="accent">
                <Link href={`/pedidos/nuevo?account=${account.id}`}>Nueva cotización</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/cuentas/${account.id}?tab=vinos`}>
                  <Wine className="mr-1 h-4 w-4" /> Gestionar vinos probados / encartados
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/cartera/${account.id}`}>Ver estado de cuenta</Link>
              </Button>
              {canEditAccount && (
                <ImportPedidosCuenta accountId={account.id} repId={account.assigned_rep_id} />
              )}
              {(balance?.total_facturado ?? 0) > 0 && (
                <Button asChild variant="outline">
                  <a href={`/api/cartera/${account.id}/pdf`} target="_blank" rel="noreferrer">
                    Estado de cuenta PDF
                  </a>
                </Button>
              )}
              {(balance?.saldo_pendiente ?? 0) > 0 && (
                <EnviarRecordatorioButton accountId={account.id} />
              )}
              <EnviarPortafolioButton accountId={account.id} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <h3 className="font-display text-lg">Próximos pasos</h3>
                {pendientes.length ? (
                  <ActivityTimeline activities={pendientes.slice(0, 6)} />
                ) : (
                  <Card>
                    <CardContent className="p-4 text-sm text-muted-foreground">
                      {lastActivity
                        ? `Sin próximos pasos pendientes. Última actividad: ${formatDate(lastActivity.activity_date)}.`
                        : "Sin actividades registradas."}
                    </CardContent>
                  </Card>
                )}
              </div>
              <div className="space-y-3">
                <h3 className="font-display text-lg">Últimas facturas</h3>
                {facturasRecientes.length ? (
                  <Card>
                    <CardContent className="space-y-2 p-4">
                      {facturasRecientes.map((f) => (
                        <Link
                          key={f.invoice_number}
                          href={`/cartera/${account.id}`}
                          className="flex items-center justify-between gap-2 rounded-md border bg-card p-3 hover:border-brand-carmesi"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{f.invoice_number}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatDate(f.invoice_date)}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Badge variant={INVOICE_STATUS_VARIANT[f.status ?? ""] ?? "muted"}>
                              {f.status ?? "—"}
                            </Badge>
                            <span className="font-medium">{formatCurrency(f.total ?? 0)}</span>
                          </div>
                        </Link>
                      ))}
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-4 text-sm text-muted-foreground">Sin facturas aún.</CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="vinos">
          <AccountWines
            accountId={account.id}
            priceTier={priceTier}
            repId={me.id}
            wines={wineList}
            products={catalog ?? []}
          />
        </TabsContent>

        <TabsContent value="contactos">
          <ContactsList accountId={account.id} contacts={(contacts ?? []) as Contact[]} />
        </TabsContent>

        <TabsContent value="actividades">
          <ActivityTimeline activities={activityList} />
        </TabsContent>

        <TabsContent value="pedidos">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg">Pedidos y cotizaciones</h3>
              <div className="flex flex-wrap gap-2">
                {canEditAccount && (
                  <ImportPedidosCuenta accountId={account.id} repId={account.assigned_rep_id} />
                )}
                <Button asChild variant="accent">
                  <Link href={`/pedidos/nuevo?account=${account.id}`}>Nueva cotización</Link>
                </Button>
              </div>
            </div>
            <OrdersSection orders={orderList} />
          </div>
        </TabsContent>

        <TabsContent value="consignaciones">
          <AccountConsignaciones
            clientNumber={account.client_number ?? null}
            isAdmin={me.role === "admin"}
            repEmail={me.email}
          />
        </TabsContent>

        <TabsContent value="acuerdos">
          <AccountAgreements
            accountId={account.id}
            agreements={agreementList}
            canEdit={canEditAccount}
          />
        </TabsContent>

        <TabsContent value="info">
          <Card>
            <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
              <Detail label="Tipo" value={account.account_type ?? "—"} />
              <Detail label="Región" value={account.region ?? "—"} />
              <Detail label="Ciudad" value={account.city ?? "—"} />
              <Detail
                label="Tier de precio"
                value={account.price_tier === "+10" ? "+10% (La Paz / Tijuana)" : "Base"}
              />
              <Detail label="RFC" value={account.rfc ?? "—"} />
              <Detail label="Razón social" value={account.fiscal_name ?? "—"} />
              <Detail label="Uso CFDI" value={account.uso_cfdi ?? "—"} />
              <Detail label="Régimen fiscal" value={account.regimen_fiscal ?? "—"} />
              <Detail
                label="Días de crédito"
                value={
                  account.credit_days == null
                    ? "—"
                    : account.credit_days === 0
                      ? "Contado"
                      : `${account.credit_days} días`
                }
              />
              <Detail label="Horario de recepción" value={account.horario_recepcion ?? "—"} full />
              <Detail label="Dirección" value={account.address ?? "—"} full />
              {account.notes && (
                <div className="sm:col-span-2 border-t pt-4">
                  <h4 className="mb-1 text-xs uppercase text-muted-foreground">Notas</h4>
                  <p className="text-sm">{account.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  accent,
  danger,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent?: boolean;
  danger?: boolean;
  href?: string;
}) {
  const inner = (
    <Card className={href ? "transition hover:border-brand-carmesi" : undefined}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className={`font-display text-2xl ${danger ? "text-red-600" : accent ? "text-brand-carmesi" : ""}`}>
            {value}
          </div>
        </div>
        <div className="rounded-full bg-accent/20 p-2 text-brand-carmesi">
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function Detail({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
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
                <Link href={`/pedidos/${o.id}`} className="hover:text-brand-carmesi">
                  {o.order_number}
                </Link>
              </td>
              <td className="px-4 py-3 capitalize text-muted-foreground">{o.order_type}</td>
              <td className="px-4 py-3 text-muted-foreground">{formatDate(o.order_date)}</td>
              <td className="px-4 py-3">
                <Badge variant="muted">{o.status}</Badge>
              </td>
              <td className="px-4 py-3 text-right font-medium">{formatCurrency(o.total)}</td>
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
