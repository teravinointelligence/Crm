import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileDown, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRep } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SampleReviewActions } from "@/components/samples/SampleReviewActions";
import { SendSampleEmail } from "@/components/samples/SendSampleEmail";
import { AddCitasToSample } from "@/components/samples/AddCitasToSample";
import { CitaEvidence } from "@/components/samples/CitaEvidence";
import { CancelSampleButton } from "@/components/samples/CancelSampleButton";
import { SubmitSampleButton } from "@/components/samples/SubmitSampleButton";
import { formatDateTime, formatDate, formatCurrency } from "@/lib/utils";
import { SAMPLE_CAP } from "@/lib/samples";

export default async function SampleDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const rep = await getCurrentRep();
  if (!rep) redirect("/login");
  const isAdmin = rep.role === "admin";

  const { data: req } = await supabase
    .from("sample_requests")
    .select(
      "*, sales_reps:sales_rep_id(full_name), reviewer:reviewed_by(full_name), accounts:account_id(id, business_name), sample_request_items(id, product_id, product_name, supplier, quantity, notes), sample_request_activities(id, evidence_path, activities:activity_id(id, activity_date, activity_type, status, accounts:account_id(id, business_name, client_number)))",
    )
    .eq("id", params.id)
    .single();
  if (!req) notFound();

  const items = (req.sample_request_items ?? []) as Array<{
    id: string; product_id: string | null; product_name: string; supplier: string | null; quantity: number; notes: string | null;
  }>;
  const citas = ((req.sample_request_activities ?? []) as Array<{
    id: string;
    evidence_path: string | null;
    activities: {
      id: string; activity_date: string; activity_type: string; status: string;
      accounts: { id: string; business_name: string | null; client_number: string | null } | null;
    } | null;
  }>)
    .filter((x) => x.activities)
    .map((x) => ({ linkId: x.id, evidencePath: x.evidence_path, ...x.activities! }))
    .sort((a, b) => a.activity_date.localeCompare(b.activity_date));
  const distinctAccountIds = Array.from(
    new Set(citas.map((c) => c.accounts?.id).filter((id): id is string => Boolean(id))),
  );
  const r = req as typeof req & {
    sales_reps: { full_name: string | null } | null;
    reviewer: { full_name: string | null } | null;
    accounts: { id: string; business_name: string | null } | null;
  };
  // Citas que el dueño (o un admin) puede sumar para registrar el uso de la muestra.
  const linkedIds = new Set(citas.map((c) => c.id));
  const canEdit = rep.id === r.sales_rep_id || isAdmin;
  let attachableCitas: Array<{ id: string; activity_date: string; activity_type: string; account_id: string | null; account_name: string | null; client_number: string | null }> = [];
  if (canEdit && r.status !== "rechazada" && distinctAccountIds.length < 3) {
    const { data: repCitasRaw } = await supabase
      .from("activities")
      .select("id, activity_date, activity_type, account_id, status, accounts:account_id(business_name, client_number)")
      .eq("sales_rep_id", r.sales_rep_id)
      .in("activity_type", ["visita", "degustacion", "reunion", "evento"])
      .neq("status", "cancelada")
      .order("activity_date", { ascending: false })
      .limit(60);
    attachableCitas = (repCitasRaw ?? [])
      .filter((c) => !linkedIds.has(c.id as string))
      .map((c) => {
        const acc = (Array.isArray(c.accounts) ? c.accounts[0] : c.accounts) as unknown as { business_name: string | null; client_number: string | null } | null;
        return {
          id: c.id as string,
          activity_date: c.activity_date as string,
          activity_type: c.activity_type as string,
          account_id: (c.account_id as string | null) ?? null,
          account_name: acc?.business_name ?? null,
          client_number: acc?.client_number ?? null,
        };
      });
  }
  const totalBottles = items.reduce((s, i) => s + Number(i.quantity ?? 0), 0);

  // Contexto de consumo para el admin al autorizar: botellas que ya lleva el
  // cliente (30/90 días), botellas del vendedor (30 días) y valor de ESTA
  // solicitud a precio de lista. Mismas reglas de conteo que el candado 0092
  // (solo solicitudes enviada/aprobada/entregada).
  let consumo: {
    cliente30: number; cliente90: number; vendedor30: number; valor: number; sinPrecio: number;
  } | null = null;
  if (isAdmin) {
    const d30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const d90 = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const sumBottles = (rows: { sample_request_items: { quantity: number | null }[] | null }[] | null) =>
      (rows ?? []).reduce(
        (s, x) => s + (x.sample_request_items ?? []).reduce((a, i) => a + Number(i.quantity ?? 0), 0),
        0,
      );
    const productIds = items.map((i) => i.product_id).filter((id): id is string => Boolean(id));
    const [cli90Res, rep30Res, pricesRes] = await Promise.all([
      r.account_id
        ? supabase
            .from("sample_requests")
            .select("id, created_at, sample_request_items(quantity)")
            .eq("account_id", r.account_id)
            .in("status", ["enviada", "aprobada", "entregada"])
            .gte("created_at", d90)
            .neq("id", r.id)
        : Promise.resolve({ data: [] as never[] }),
      supabase
        .from("sample_requests")
        .select("id, created_at, sample_request_items(quantity)")
        .eq("sales_rep_id", r.sales_rep_id)
        .in("status", ["enviada", "aprobada", "entregada"])
        .gte("created_at", d30)
        .neq("id", r.id),
      productIds.length
        ? supabase.from("products").select("id, base_price").in("id", productIds)
        : Promise.resolve({ data: [] as never[] }),
    ]);
    type ReqBottles = { id: string; created_at: string; sample_request_items: { quantity: number | null }[] | null };
    const cli90Rows = ((cli90Res.data ?? []) as unknown) as ReqBottles[];
    const priceById = new Map(
      ((pricesRes.data ?? []) as { id: string; base_price: number | null }[]).map((p) => [p.id, Number(p.base_price ?? 0)]),
    );
    let valor = 0;
    let sinPrecio = 0;
    for (const i of items) {
      const price = i.product_id ? priceById.get(i.product_id) : undefined;
      if (price == null) sinPrecio += Number(i.quantity ?? 0);
      else valor += Number(i.quantity ?? 0) * price;
    }
    consumo = {
      cliente30: sumBottles(cli90Rows.filter((x) => x.created_at >= d30)),
      cliente90: sumBottles(cli90Rows),
      vendedor30: sumBottles(((rep30Res.data ?? []) as unknown) as ReqBottles[]),
      valor,
      sinPrecio,
    };
  }
  const canExport = r.status === "aprobada" || r.status === "entregada";
  const canEditRequest =
    (r.status === "borrador" && (isAdmin || rep.id === r.sales_rep_id)) ||
    (["enviada", "aprobada"].includes(r.status ?? "") && isAdmin);
  const canCancel =
    (["borrador", "enviada"].includes(r.status ?? "") && (isAdmin || rep.id === r.sales_rep_id)) ||
    (r.status === "aprobada" && isAdmin);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/muestras"><ArrowLeft className="mr-1 h-4 w-4" /> Muestras</Link>
      </Button>

      <div className="rounded-lg border bg-card p-6 brand-shadow space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-3xl">{r.request_number}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="muted">{r.status}</Badge>
            {r.training_people ? <Badge variant="accent">Capacitación · {r.training_people} personas</Badge> : null}
            {r.ship_to_client ? (
              <Badge variant="warning">
                <Truck className="mr-1 h-3.5 w-3.5" /> Enviar al cliente{r.ship_date ? ` · ${formatDate(r.ship_date)}` : ""}
              </Badge>
            ) : null}
            {canEditRequest && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/muestras/${r.id}/editar`}>Editar</Link>
              </Button>
            )}
            {r.status === "borrador" && (isAdmin || rep.id === r.sales_rep_id) && (
              <SubmitSampleButton requestId={r.id} requestNumber={r.request_number ?? ""} />
            )}
            {canCancel && <CancelSampleButton requestId={r.id} status={r.status ?? ""} />}
            {canExport && (
              <>
                <Button asChild size="sm" variant="outline">
                  <a href={`/api/samples/${r.id}/pdf`} target="_blank" rel="noreferrer">
                    <FileDown className="mr-1 h-4 w-4" /> Descargar PDF
                  </a>
                </Button>
                <SendSampleEmail sampleId={r.id} />
              </>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {r.sales_reps?.full_name ?? "—"} · {totalBottles} botella(s) · {formatDateTime(r.created_at)}
          {r.reason ? ` · ${r.reason}` : ""}
        </p>
        {r.accounts && (
          <Link href={`/cuentas/${r.accounts.id}`} className="text-sm text-brand-carmesi hover:underline">
            Para: {r.accounts.business_name}
          </Link>
        )}
        {r.notes && <p className="mt-3 border-t pt-3 text-sm">{r.notes}</p>}
        {r.review_notes && (
          <p className="mt-2 rounded-md bg-accent/15 p-3 text-sm">
            <strong>Revisión{r.reviewer?.full_name ? ` (${r.reviewer.full_name})` : ""}:</strong> {r.review_notes}
          </p>
        )}
      </div>

      <Card><CardContent className="p-0">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-3">Vino</th><th className="px-4 py-3">Bodega</th><th className="px-4 py-3 text-right">Botellas</th><th className="px-4 py-3">Nota</th></tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b last:border-b-0">
                <td className="px-4 py-3 font-medium">{i.product_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{i.supplier ?? "—"}</td>
                <td className="px-4 py-3 text-right">{i.quantity}</td>
                <td className="px-4 py-3 text-muted-foreground">{i.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>

      {citas.length > 0 && (
        <Card><CardContent className="space-y-3 p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg">Citas que cubre esta muestra</h3>
            <Badge variant="muted">{distinctAccountIds.length} cliente(s)</Badge>
          </div>
          <ul className="divide-y">
            {citas.map((c) => (
              <li key={c.linkId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2 text-sm">
                <div className="min-w-0">
                  {c.accounts ? (
                    <Link href={`/cuentas/${c.accounts.id}`} className="font-medium hover:text-brand-carmesi">
                      {c.accounts.business_name ?? "Sin cliente"}
                    </Link>
                  ) : (
                    <span className="font-medium">Sin cliente</span>
                  )}
                  {c.accounts?.client_number && <span className="text-xs text-muted-foreground"> · #{c.accounts.client_number}</span>}
                  <span className="block text-xs text-muted-foreground">
                    {formatDateTime(c.activity_date)} · {c.activity_type}
                    {c.status !== "agendada" && <span className="ml-1 text-amber-600">({c.status})</span>}
                  </span>
                </div>
                <CitaEvidence
                  ownerRepId={r.sales_rep_id}
                  requestId={r.id}
                  activityId={c.id}
                  evidencePath={c.evidencePath}
                  canEdit={canEdit}
                />
              </li>
            ))}
          </ul>
        </CardContent></Card>
      )}

      {canEdit && r.status !== "rechazada" && (
        <AddCitasToSample requestId={r.id} citas={attachableCitas} linkedAccountIds={distinctAccountIds} />
      )}

      {isAdmin && consumo && (
        <Card><CardContent className="space-y-3 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-lg">Consumo antes de autorizar</h3>
            <Link href="/muestras/consumo" className="text-xs text-brand-carmesi hover:underline">
              Ver consumo por vendedor →
            </Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <div className="rounded-md border bg-card p-2.5">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Valor de esta solicitud</div>
              <div className="font-display text-lg">{formatCurrency(consumo.valor)}</div>
              {consumo.sinPrecio > 0 && (
                <div className="text-xs text-muted-foreground">+{consumo.sinPrecio} bot. sin precio de lista</div>
              )}
            </div>
            <div className="rounded-md border bg-card p-2.5">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Cliente · 30 días</div>
              <div className={`font-display text-lg ${consumo.cliente30 + totalBottles > SAMPLE_CAP.botellasPorCliente ? "text-red-600" : ""}`}>
                {consumo.cliente30} + {totalBottles} de esta
              </div>
              <div className="text-xs text-muted-foreground">tope: {SAMPLE_CAP.botellasPorCliente} por cliente</div>
            </div>
            <div className="rounded-md border bg-card p-2.5">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Cliente · 90 días</div>
              <div className="font-display text-lg">{consumo.cliente90}</div>
              <div className="text-xs text-muted-foreground">botellas recibidas</div>
            </div>
            <div className="rounded-md border bg-card p-2.5">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Vendedor · 30 días</div>
              <div className="font-display text-lg">{consumo.vendedor30}</div>
              <div className="text-xs text-muted-foreground">botellas en otras solicitudes</div>
            </div>
          </div>
          {consumo.cliente30 + totalBottles > SAMPLE_CAP.botellasPorCliente && (
            <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              Con esta solicitud el cliente supera el tope de {SAMPLE_CAP.botellasPorCliente} botellas
              en {SAMPLE_CAP.ventanaDias} días{r.training_people ? " (es capacitación, exenta del candado)" : ""}.
              Autorízala solo si el caso lo amerita.
            </p>
          )}
        </CardContent></Card>
      )}

      {isAdmin && (
        <SampleReviewActions
          requestId={r.id}
          repId={rep.id}
          status={r.status ?? "borrador"}
          accountId={r.account_id}
          accountIds={distinctAccountIds}
          items={items.map((i) => ({ product_id: i.product_id, product_name: i.product_name }))}
        />
      )}
    </div>
  );
}
